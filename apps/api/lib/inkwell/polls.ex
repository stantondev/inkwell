defmodule Inkwell.Polls do
  @moduledoc """
  Context for polls — both platform polls (admin-created) and entry polls (author-created).
  """

  import Ecto.Query
  alias Ecto.Multi
  alias Inkwell.Repo
  alias Inkwell.Polls.{Poll, PollComment, PollOption, PollVote}

  # ── Read ────────────────────────────────────────────────────────────────────

  def get_poll(id) do
    Poll
    |> Repo.get(id)
    |> case do
      nil -> nil
      poll -> Repo.preload(poll, [:creator, options: from(o in PollOption, order_by: o.position)])
    end
  end

  def get_poll_for_entry(entry_id) when is_binary(entry_id) do
    Poll
    |> where(entry_id: ^entry_id)
    |> preload([:creator, options: ^from(o in PollOption, order_by: o.position)])
    |> Repo.one()
  end

  def get_poll_for_entry(_), do: nil

  def list_platform_polls(opts \\ %{}) do
    page = Map.get(opts, :page, 1)
    per_page = Map.get(opts, :per_page, 20)
    status_filter = Map.get(opts, :status)

    query =
      Poll
      |> where(type: :platform)
      |> preload([:creator, options: ^from(o in PollOption, order_by: o.position)])

    query =
      case status_filter do
        "open" -> where(query, status: :open)
        "closed" -> where(query, status: :closed)
        _ -> query
      end

    # Open polls first, then by most recent
    query =
      query
      |> order_by([p], [
        fragment("CASE WHEN ? = 'open' THEN 0 ELSE 1 END", p.status),
        desc: p.inserted_at
      ])

    total = Repo.aggregate(query, :count)

    polls =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {polls, total}
  end

  def get_active_platform_poll do
    now = DateTime.utc_now()

    Poll
    |> where(type: :platform, status: :open)
    |> where([p], is_nil(p.closes_at) or p.closes_at > ^now)
    |> order_by(desc: :inserted_at)
    |> limit(1)
    |> preload([:creator, options: ^from(o in PollOption, order_by: o.position)])
    |> Repo.one()
  end

  def count_platform_polls(opts \\ %{}) do
    status_filter = Map.get(opts, :status)

    query = Poll |> where(type: :platform)

    query =
      case status_filter do
        "open" -> where(query, status: :open)
        "closed" -> where(query, status: :closed)
        _ -> query
      end

    Repo.aggregate(query, :count)
  end

  def is_poll_open?(%Poll{status: :closed}), do: false

  def is_poll_open?(%Poll{closes_at: nil}), do: true

  def is_poll_open?(%Poll{closes_at: closes_at}) do
    DateTime.compare(closes_at, DateTime.utc_now()) == :gt
  end

  # ── Votes (read) ───────────────────────────────────────────────────────────

  def get_user_vote(nil, _poll_id), do: nil

  def get_user_vote(user_id, poll_id) do
    PollVote
    |> where(user_id: ^user_id, poll_id: ^poll_id)
    |> select([v], v.poll_option_id)
    |> Repo.one()
  end

  def get_user_votes_for_polls(_user_id, []), do: %{}

  def get_user_votes_for_polls(nil, _poll_ids), do: %{}

  def get_user_votes_for_polls(user_id, poll_ids) do
    PollVote
    |> where([v], v.user_id == ^user_id and v.poll_id in ^poll_ids)
    |> select([v], {v.poll_id, v.poll_option_id})
    |> Repo.all()
    |> Map.new()
  end

  # ── Create ─────────────────────────────────────────────────────────────────

  def create_poll(attrs, options) when is_list(options) do
    cond do
      length(options) < 2 ->
        {:error, :too_few_options}

      length(options) > 10 ->
        {:error, :too_many_options}

      Enum.any?(options, &(String.trim(&1) == "")) ->
        {:error, :blank_option}

      true ->
        multi =
          Multi.new()
          |> Multi.insert(:poll, Poll.changeset(%Poll{}, attrs))
          |> Multi.run(:options, fn repo, %{poll: poll} ->
            option_records =
              options
              |> Enum.with_index()
              |> Enum.map(fn {label, idx} ->
                %PollOption{}
                |> PollOption.changeset(%{label: String.trim(label), position: idx, poll_id: poll.id})
                |> repo.insert!()
              end)

            {:ok, option_records}
          end)

        case Repo.transaction(multi) do
          {:ok, %{poll: poll, options: options}} ->
            {:ok, %{poll | options: options}}

          {:error, :poll, changeset, _} ->
            {:error, changeset}

          {:error, :options, reason, _} ->
            {:error, reason}
        end
    end
  end

  # ── Update ─────────────────────────────────────────────────────────────────

  def update_poll(%Poll{total_votes: votes} = _poll, _attrs, _options) when votes > 0 do
    {:error, :poll_has_votes}
  end

  def update_poll(%Poll{} = poll, attrs, options) when is_list(options) do
    cond do
      length(options) < 2 ->
        {:error, :too_few_options}

      length(options) > 10 ->
        {:error, :too_many_options}

      Enum.any?(options, &(String.trim(&1) == "")) ->
        {:error, :blank_option}

      true ->
        multi =
          Multi.new()
          |> Multi.update(:poll, Poll.update_changeset(poll, attrs))
          |> Multi.delete_all(:delete_old_options, from(o in PollOption, where: o.poll_id == ^poll.id))
          |> Multi.run(:options, fn repo, %{poll: updated_poll} ->
            option_records =
              options
              |> Enum.with_index()
              |> Enum.map(fn {label, idx} ->
                %PollOption{}
                |> PollOption.changeset(%{label: String.trim(label), position: idx, poll_id: updated_poll.id})
                |> repo.insert!()
              end)

            {:ok, option_records}
          end)

        case Repo.transaction(multi) do
          {:ok, %{poll: poll, options: options}} ->
            {:ok, %{poll | options: options}}

          {:error, :poll, changeset, _} ->
            {:error, changeset}

          {:error, _, reason, _} ->
            {:error, reason}
        end
    end
  end

  # ── Vote ───────────────────────────────────────────────────────────────────

  def vote(user_id, poll_id, option_id) do
    poll = get_poll(poll_id)

    cond do
      is_nil(poll) ->
        {:error, :not_found}

      !is_poll_open?(poll) ->
        {:error, :poll_closed}

      !Enum.any?(poll.options, &(&1.id == option_id)) ->
        {:error, :invalid_option}

      true ->
        Repo.transaction(fn ->
          case %PollVote{}
               |> PollVote.changeset(%{user_id: user_id, poll_id: poll_id, poll_option_id: option_id})
               |> Repo.insert() do
            {:ok, vote} ->
              PollOption
              |> where(id: ^option_id)
              |> Repo.update_all(inc: [vote_count: 1])

              Poll
              |> where(id: ^poll_id)
              |> Repo.update_all(inc: [total_votes: 1])

              vote

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)
    end
  end

  # ── Close / Delete ─────────────────────────────────────────────────────────

  def close_poll(%Poll{} = poll) do
    poll
    |> Poll.close_changeset()
    |> Repo.update()
  end

  def delete_poll(%Poll{} = poll) do
    Repo.delete(poll)
  end

  # ── Admin listing ──────────────────────────────────────────────────────────

  def list_all_polls(opts \\ %{}) do
    page = Map.get(opts, :page, 1)
    per_page = Map.get(opts, :per_page, 20)
    type_filter = Map.get(opts, :type)

    query =
      Poll
      |> preload([:creator, options: ^from(o in PollOption, order_by: o.position)])
      |> order_by(desc: :inserted_at)

    query =
      case type_filter do
        "platform" -> where(query, type: :platform)
        "entry" -> where(query, type: :entry)
        _ -> query
      end

    total = Repo.aggregate(query, :count)

    polls =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {polls, total}
  end

  # ── User polls ─────────────────────────────────────────────────────────

  def list_user_polls(user_id, opts \\ %{}) do
    page = Map.get(opts, :page, 1)
    per_page = Map.get(opts, :per_page, 20)

    query =
      Poll
      |> where(creator_id: ^user_id)
      |> preload([:creator, :entry, options: ^from(o in PollOption, order_by: o.position)])
      |> order_by(desc: :inserted_at)

    total = Repo.aggregate(query, :count)

    polls =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {polls, total}
  end

  # ── Closed polls (history) ──────────────────────────────────────────────

  def list_closed_polls(opts \\ %{}) do
    page = Map.get(opts, :page, 1)
    per_page = Map.get(opts, :per_page, 20)
    type_filter = Map.get(opts, :type)

    query =
      Poll
      |> where(status: :closed)
      |> preload([:creator, options: ^from(o in PollOption, order_by: o.position)])
      |> order_by(desc: :closed_at)

    query =
      case type_filter do
        "platform" -> where(query, type: :platform)
        "entry" -> where(query, type: :entry)
        _ -> query
      end

    total = Repo.aggregate(query, :count)

    polls =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {polls, total}
  end

  # ── Comments ─────────────────────────────────────────────────────────────

  def list_comments(poll_id) do
    PollComment
    |> where(poll_id: ^poll_id)
    |> order_by(asc: :inserted_at)
    |> preload(:user)
    |> Repo.all()
  end

  def create_comment(attrs) do
    multi =
      Multi.new()
      |> Multi.insert(:comment, PollComment.changeset(%PollComment{}, attrs))
      |> Multi.run(:increment, fn repo, %{comment: comment} ->
        {1, _} =
          Poll
          |> where(id: ^comment.poll_id)
          |> repo.update_all(inc: [comment_count: 1])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, %{comment: comment}} ->
        {:ok, Repo.preload(comment, :user)}

      {:error, :comment, changeset, _} ->
        {:error, changeset}
    end
  end

  def delete_comment(%PollComment{} = comment) do
    multi =
      Multi.new()
      |> Multi.delete(:comment, comment)
      |> Multi.run(:decrement, fn repo, _ ->
        {1, _} =
          Poll
          |> where(id: ^comment.poll_id)
          |> repo.update_all(inc: [comment_count: -1])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, _} -> {:ok, comment}
      {:error, :comment, changeset, _} -> {:error, changeset}
    end
  end

  def get_comment(id) do
    PollComment
    |> Repo.get(id)
    |> case do
      nil -> nil
      comment -> Repo.preload(comment, :user)
    end
  end
end
