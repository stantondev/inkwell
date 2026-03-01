defmodule Inkwell.Invitations do
  @moduledoc """
  Context for invite links and email invitations.
  Two-tier system: permanent per-user invite codes (shareable links)
  and tracked email invitations ("sealed letters").
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Accounts.User
  alias Inkwell.Invitations.Invitation

  @invite_token_bytes 32
  @invite_code_bytes 6
  @invite_expiry_days 30
  @daily_limit_free 10
  @daily_limit_plus 25
  @cooldown_days 7

  # ── Invite Codes ──────────────────────────────────────────────────────────

  @doc "Get or generate a permanent invite code for a user."
  def get_or_create_invite_code(%User{} = user) do
    if user.invite_code do
      {:ok, user.invite_code}
    else
      code = generate_invite_code()

      case user
           |> Ecto.Changeset.change(%{invite_code: code})
           |> Repo.update() do
        {:ok, updated} -> {:ok, updated.invite_code}
        {:error, _} ->
          # Collision — retry once with a new code
          code2 = generate_invite_code()
          case user
               |> Ecto.Changeset.change(%{invite_code: code2})
               |> Repo.update() do
            {:ok, updated} -> {:ok, updated.invite_code}
            {:error, changeset} -> {:error, changeset}
          end
      end
    end
  end

  @doc "Look up the user who owns an invite code."
  def get_user_by_invite_code(code) when is_binary(code) do
    Repo.get_by(User, invite_code: code)
  end

  # ── Email Invitations ─────────────────────────────────────────────────────

  @doc "Create a tracked email invitation and return it for delivery."
  def create_invitation(%User{} = inviter, email, message \\ nil) do
    email = String.downcase(String.trim(email))

    cond do
      # Can't invite yourself
      inviter.email == email ->
        {:error, :self_invite}

      # Check daily limit
      at_daily_limit?(inviter) ->
        {:error, :daily_limit}

      # Check cooldown (same email within 7 days)
      recently_invited?(inviter.id, email) ->
        {:error, :recently_invited}

      # Email belongs to existing user — silent success (no email sent)
      Accounts.get_user_by_email(email) != nil ->
        {:ok, :already_member}

      true ->
        token = generate_token()

        attrs = %{
          inviter_id: inviter.id,
          email: email,
          token: token,
          message: if(message && String.trim(message) != "", do: String.trim(message), else: nil),
          expires_at: DateTime.add(DateTime.utc_now(), @invite_expiry_days * 86400, :second)
        }

        case %Invitation{} |> Invitation.changeset(attrs) |> Repo.insert() do
          {:ok, invitation} -> {:ok, invitation}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc "Accept an invitation by token (email invite). Sets invited_by_id on the new user."
  def accept_by_token(token, new_user_id) when is_binary(token) do
    case Repo.get_by(Invitation, token: token) do
      nil -> :error
      %Invitation{status: "accepted"} -> :already_accepted
      %Invitation{expires_at: expires_at} = inv ->
        if DateTime.compare(DateTime.utc_now(), expires_at) == :gt do
          :expired
        else
          Repo.transaction(fn ->
            inv
            |> Ecto.Changeset.change(%{
              status: "accepted",
              accepted_by_id: new_user_id,
              accepted_at: DateTime.utc_now()
            })
            |> Repo.update!()

            set_invited_by(new_user_id, inv.inviter_id)
            notify_inviter(inv.inviter_id, new_user_id)
          end)

          :ok
        end
    end
  end

  @doc "Accept an invitation by invite code (shareable link). Sets invited_by_id on the new user."
  def accept_by_code(code, new_user_id) when is_binary(code) do
    case get_user_by_invite_code(code) do
      nil -> :error
      %User{id: inviter_id} ->
        set_invited_by(new_user_id, inviter_id)
        notify_inviter(inviter_id, new_user_id)
        :ok
    end
  end

  @doc "List sent invitations for a user, paginated."
  def list_invitations(user_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    query =
      from i in Invitation,
        where: i.inviter_id == ^user_id,
        order_by: [desc: i.inserted_at],
        limit: ^per_page,
        offset: ^((page - 1) * per_page),
        left_join: u in User, on: u.id == i.accepted_by_id,
        select: %{
          id: i.id,
          email: i.email,
          status: i.status,
          message: i.message,
          accepted_at: i.accepted_at,
          expires_at: i.expires_at,
          inserted_at: i.inserted_at,
          accepted_by: %{
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url
          }
        }

    Repo.all(query)
  end

  @doc "Count invitations sent today by a user."
  def count_today(user_id) do
    today_start = Date.utc_today() |> DateTime.new!(~T[00:00:00], "Etc/UTC")

    from(i in Invitation,
      where: i.inviter_id == ^user_id,
      where: i.inserted_at >= ^today_start
    )
    |> Repo.aggregate(:count)
  end

  @doc "Count accepted invitations for a user (all time)."
  def count_accepted(user_id) do
    from(i in Invitation,
      where: i.inviter_id == ^user_id,
      where: i.status == "accepted"
    )
    |> Repo.aggregate(:count)
  end

  @doc "Get invitation stats for a user."
  def get_stats(user_id) do
    total =
      from(i in Invitation, where: i.inviter_id == ^user_id)
      |> Repo.aggregate(:count)

    accepted =
      from(i in Invitation, where: i.inviter_id == ^user_id, where: i.status == "accepted")
      |> Repo.aggregate(:count)

    pending =
      from(i in Invitation,
        where: i.inviter_id == ^user_id,
        where: i.status == "pending",
        where: i.expires_at > ^DateTime.utc_now()
      )
      |> Repo.aggregate(:count)

    %{sent: total, accepted: accepted, pending: pending}
  end

  @doc "Get the daily invite limit for a subscription tier."
  def daily_limit("plus"), do: @daily_limit_plus
  def daily_limit(_), do: @daily_limit_free

  @doc "Delete expired pending invitations older than expiry date."
  def cleanup_expired do
    {count, _} =
      from(i in Invitation,
        where: i.status == "pending",
        where: i.expires_at < ^DateTime.utc_now()
      )
      |> Repo.delete_all()

    {:ok, count}
  end

  # ── Private ────────────────────────────────────────────────────────────────

  defp at_daily_limit?(%User{} = user) do
    limit = daily_limit(user.subscription_tier)
    count_today(user.id) >= limit
  end

  defp recently_invited?(inviter_id, email) do
    cutoff = DateTime.add(DateTime.utc_now(), -@cooldown_days * 86400, :second)

    from(i in Invitation,
      where: i.inviter_id == ^inviter_id,
      where: i.email == ^email,
      where: i.inserted_at > ^cutoff
    )
    |> Repo.exists?()
  end

  defp set_invited_by(user_id, inviter_id) do
    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(set: [invited_by_id: inviter_id])
  end

  defp notify_inviter(inviter_id, new_user_id) do
    Accounts.create_notification(%{
      type: :invite_accepted,
      user_id: inviter_id,
      actor_id: new_user_id
    })
  end

  defp generate_token do
    :crypto.strong_rand_bytes(@invite_token_bytes)
    |> Base.url_encode64(padding: false)
  end

  defp generate_invite_code do
    :crypto.strong_rand_bytes(@invite_code_bytes)
    |> Base.url_encode64(padding: false)
    |> String.slice(0, 8)
  end
end
