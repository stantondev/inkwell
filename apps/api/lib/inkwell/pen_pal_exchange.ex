defmodule Inkwell.PenPalExchange do
  @moduledoc """
  The pen pal exchange: a member puts their name in, and Inkwell introduces
  them to one other member who did the same, with a sheet of paper between
  them.

  Why it exists: most entries get no response, and nothing on Inkwell ever
  introduced two people. A private letter to one person who also asked for
  one is a much smaller step than a public reply.

  How it works:

    * Opt-in on both sides. Nobody is matched who didn't ask.
    * Matching happens when someone joins: if a compatible person is already
      waiting they're introduced on the spot, otherwise the joiner waits for
      the next person. No background job.
    * An introduction is a conversation with `introduced_at` set, which lets
      both write without following each other (`Letters.can_write?/3`).
      Blocks still stop everything.
    * No reminders. After writing to the person you were introduced to (or
      after #{7} quiet days) you can ask for another introduction.
    * Only members who have published something, and whom the spam checker
      isn't holding back, can join. The reasons for a refusal other than
      "publish something first" are never spelled out.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Journals, Letters, Repo, Social}
  alias Inkwell.Accounts.User
  alias Inkwell.Journals.Entry
  alias Inkwell.Letters.{Conversation, DirectMessage}
  alias Inkwell.PenPalExchange.Request

  @rejoin_after_days 7
  # How long the Letterbox keeps pointing at your latest introduction.
  @show_for_days 30
  # One advisory lock serialises matching so two joiners can't take the same
  # waiting person.
  @lock_key 7_274_112

  def rejoin_after_days, do: @rejoin_after_days

  # ── Status ───────────────────────────────────────────────────────────────

  @doc """
  Where `user` stands: `%{state, can_join, reason, note, waiting_since,
  introduction}`. `state` is `"waiting"`, `"introduced"` (a recent
  introduction to show) or `"idle"`.
  """
  def status(%User{} = user) do
    waiting = waiting_request(user.id)
    latest = latest_match(user.id)
    {can_join, reason} = join_check(user, waiting, latest)

    introduction = recent_introduction(latest, user.id)

    %{
      state:
        cond do
          waiting -> "waiting"
          introduction -> "introduced"
          true -> "idle"
        end,
      can_join: can_join,
      reason: reason,
      note: (waiting && waiting.note) || (latest && latest.note),
      waiting_since: waiting && waiting.inserted_at,
      introduction: introduction,
      rejoin_after_days: @rejoin_after_days
    }
  end

  defp waiting_request(user_id) do
    Repo.one(from r in Request, where: r.user_id == ^user_id and r.status == "waiting")
  end

  defp latest_match(user_id) do
    Repo.one(
      from r in Request,
        where: r.user_id == ^user_id and r.status == "matched",
        order_by: [desc: r.matched_at],
        limit: 1
    )
  end

  defp recent_introduction(nil, _user_id), do: nil

  defp recent_introduction(%Request{} = match, user_id) do
    cutoff = DateTime.add(DateTime.utc_now(), -@show_for_days * 86_400, :second)
    partner = match.partner_id && Repo.get(User, match.partner_id)

    if match.conversation_id && partner && is_nil(partner.blocked_at) &&
         DateTime.compare(match.matched_at, cutoff) == :gt &&
         not Social.is_blocked_between?(user_id, partner.id) do
      %{
        conversation_id: match.conversation_id,
        introduced_at: match.matched_at,
        partner: partner,
        written: wrote_since?(match.conversation_id, user_id, match.matched_at),
        heard_back: wrote_since?(match.conversation_id, partner.id, match.matched_at)
      }
    end
  end

  defp wrote_since?(conversation_id, user_id, since) do
    Repo.exists?(
      from m in DirectMessage,
        where: m.conversation_id == ^conversation_id and m.sender_id == ^user_id and m.inserted_at >= ^since
    )
  end

  # {can_join?, reason}. Reasons: nil, "waiting", "no_entry", "unavailable",
  # "write_first".
  defp join_check(user, waiting, latest) do
    cond do
      waiting -> {false, "waiting"}
      not in_good_standing?(user) -> {false, "unavailable"}
      not published_something?(user.id) -> {false, "no_entry"}
      latest && not free_to_ask_again?(latest, user.id) -> {false, "write_first"}
      true -> {true, nil}
    end
  end

  defp free_to_ask_again?(%Request{conversation_id: nil}, _user_id), do: true

  defp free_to_ask_again?(%Request{} = match, user_id) do
    quiet_since = DateTime.add(DateTime.utc_now(), -@rejoin_after_days * 86_400, :second)

    DateTime.compare(match.matched_at, quiet_since) != :gt or
      wrote_since?(match.conversation_id, user_id, match.matched_at)
  end

  defp in_good_standing?(%User{} = user) do
    is_nil(user.blocked_at) and user.moderation_state != "limited" and
      (Accounts.is_admin?(user) or not Journals.held_back_from_search?(user.id))
  end

  defp published_something?(user_id) do
    Repo.exists?(from e in Entry, where: e.user_id == ^user_id and e.status == :published)
  end

  # ── Joining and leaving ──────────────────────────────────────────────────

  @doc """
  Put `user` in. Returns `{:ok, :matched, conversation}` when someone
  compatible was already waiting, `{:ok, :waiting}` otherwise, or
  `{:error, reason}` (the reasons of `status/1`, or `:invalid_note`).
  """
  def join(%User{} = user, note \\ nil) do
    result =
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock($1)", [@lock_key])

        user = Repo.get!(User, user.id)

        case join_check(user, waiting_request(user.id), latest_match(user.id)) do
          {false, reason} ->
            Repo.rollback(String.to_existing_atom(reason))

          {true, nil} ->
            case %Request{} |> Request.changeset(%{user_id: user.id, note: note}) |> Repo.insert() do
              {:ok, mine} -> match_or_wait(user, mine)
              {:error, _} -> Repo.rollback(:invalid_note)
            end
        end
      end)

    case result do
      {:ok, {:matched, conv, mine, theirs}} ->
        announce(conv, mine, theirs)
        {:ok, :matched, conv}

      {:ok, :waiting} ->
        {:ok, :waiting}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp match_or_wait(user, mine) do
    candidates =
      Repo.all(
        from r in Request,
          where: r.status == "waiting" and r.user_id != ^user.id,
          order_by: [asc: r.inserted_at],
          preload: [:user]
      )

    case Enum.find(candidates, &compatible?(user, &1.user)) do
      nil ->
        :waiting

      theirs ->
        {:ok, conv} = Letters.introduce(user.id, theirs.user_id)
        now = DateTime.utc_now()

        mine = mark_matched(mine, theirs.user_id, conv.id, now)
        theirs = mark_matched(theirs, user.id, conv.id, now)
        {:matched, conv, mine, theirs}
    end
  end

  defp mark_matched(request, partner_id, conversation_id, now) do
    request
    |> Ecto.Changeset.change(status: "matched", partner_id: partner_id, conversation_id: conversation_id, matched_at: now)
    |> Repo.update!()
  end

  # Two people can be introduced when the other is still in good standing,
  # neither has blocked the other, and they don't already know each other
  # (introduced before, or letters already between them).
  defp compatible?(%User{} = user, %User{} = other) do
    in_good_standing?(other) and
      not Social.is_blocked_between?(user.id, other.id) and
      not introduced_before?(user.id, other.id) and
      not Letters.letters_between?(user.id, other.id)
  end

  defp compatible?(_user, _other), do: false

  defp introduced_before?(a, b) do
    Repo.exists?(
      from r in Request,
        where: r.status == "matched" and r.user_id == ^a and r.partner_id == ^b
    )
  end

  @doc "Take `user`'s name back out while they're still waiting."
  def leave(%User{} = user) do
    {n, _} =
      Repo.update_all(
        from(r in Request, where: r.user_id == ^user.id and r.status == "waiting"),
        set: [status: "withdrawn", updated_at: DateTime.utc_now()]
      )

    if n > 0, do: :ok, else: {:error, :not_waiting}
  end

  # ── Telling both people ──────────────────────────────────────────────────

  # Both get a notification (in-app + push). The one who was waiting isn't on
  # the site right now, so they also get one email; the joiner is looking at
  # the result.
  defp announce(conv, mine, theirs) do
    for {to, from} <- [{mine.user_id, theirs.user_id}, {theirs.user_id, mine.user_id}] do
      Accounts.create_notification(%{
        type: :pen_pal_match,
        user_id: to,
        actor_id: from,
        target_type: "conversation",
        target_id: conv.id,
        data: %{"conversation_id" => conv.id}
      })
    end

    %{"user_id" => theirs.user_id, "partner_id" => mine.user_id, "conversation_id" => conv.id}
    |> Inkwell.Workers.PenPalMatchEmailWorker.new()
    |> Oban.insert()

    :ok
  rescue
    e ->
      require Logger
      Logger.warning("[PenPalExchange] Couldn't announce an introduction: #{inspect(e)}")
      :ok
  end

  @doc "Subject and plain-text body of the email to someone whose pen pal arrived."
  def email_content(%User{} = user, %User{} = partner, conversation_id) do
    name = partner.display_name || partner.username
    note = partner_note(conversation_id, partner.id)

    said =
      if note, do: "\nAbout themselves, they wrote: “#{note}”\n", else: ""

    body = """
    Hi #{user.display_name || user.username},

    You asked Inkwell to find you a pen pal, and someone else has just asked too. Meet #{name} (@#{partner.username}).
    #{said}
    There's a sheet of paper waiting between the two of you:
    #{Inkwell.Instance.frontend_url()}/letters/#{conversation_id}

    Either of you can write first, and there's no deadline.

    Inkwell
    """

    {"Your pen pal is here: #{name}", body}
  end

  defp partner_note(conversation_id, partner_id) do
    Repo.one(
      from r in Request,
        where: r.conversation_id == ^conversation_id and r.user_id == ^partner_id,
        order_by: [desc: r.matched_at],
        limit: 1,
        select: r.note
    )
  end

  # ── The introduction, for the thread page ────────────────────────────────

  @doc """
  What the thread shows above the letters of an introduced conversation:
  when, what each wrote about themselves, and the other person's latest
  public entry. Nil for ordinary conversations.
  """
  def introduction_for(%Conversation{introduced_at: nil}, _viewer_id), do: nil

  def introduction_for(%Conversation{} = conv, viewer_id) do
    other = Letters.other_party(conv, viewer_id)

    notes =
      Repo.all(
        from r in Request,
          where: r.conversation_id == ^conv.id and r.status == "matched",
          select: {r.user_id, r.note}
      )
      |> Map.new()

    case other do
      %User{} ->
        %{
          introduced_at: conv.introduced_at,
          my_note: Map.get(notes, viewer_id),
          their_note: Map.get(notes, other.id),
          their_latest_entry: latest_public_entry(other),
          their_member_since: other.inserted_at
        }

      _ ->
        nil
    end
  end

  defp latest_public_entry(%User{} = user) do
    entry =
      Repo.one(
        from e in Entry,
          where:
            e.user_id == ^user.id and e.status == :published and e.privacy == :public and
              e.kind == "entry" and not is_nil(e.slug),
          order_by: [desc: e.published_at],
          limit: 1
      )

    if entry do
      %{
        title: entry.title,
        excerpt: entry.excerpt,
        path: "/#{user.username}/#{entry.slug}",
        published_at: entry.published_at
      }
    end
  end
end
