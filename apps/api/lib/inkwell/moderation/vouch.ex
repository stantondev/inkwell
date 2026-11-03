defmodule Inkwell.Moderation.Vouch do
  @moduledoc """
  Members who arrive with an older Bluesky or Mastodon account that has real
  history skip the new-account holds (Stanton, 2026-11-03): the wait before
  link posts reach Explore and search, the pen pal request limits, the
  week before uploading stickers or starting a circle, and the days before
  sending letter requests. The spam checker also counts it in their favour.
  Moderation itself (limits, blocks, reports) applies as before.

  Spam accounts sign up with a throwaway email; a months-old account with
  posts and followers elsewhere is a much better sign of a real person.
  The rule is deliberately plain and stays internal: nothing a member sees
  explains it.

  Checked at every sign-in and link; once vouched, a member stays vouched
  (unlinking later doesn't undo it).
  """

  alias Inkwell.Repo
  alias Inkwell.Accounts.User

  @min_age_days 90
  @min_posts 20
  @min_followers 10

  @doc """
  True for history of `%{created_at, posts, followers}` (created_at a
  DateTime or ISO string).
  """
  def qualifies?(%{created_at: created_at, posts: posts, followers: followers}) do
    with %DateTime{} = created <- to_datetime(created_at),
         true <- is_integer(posts) and is_integer(followers) do
      DateTime.diff(DateTime.utc_now(), created, :day) >= @min_age_days and
        posts >= @min_posts and followers >= @min_followers
    else
      _ -> false
    end
  end

  def qualifies?(_), do: false

  @doc "Mark `user` vouched for (once) when `history` qualifies. Returns the user."
  def maybe_vouch(%User{vouched_at: %DateTime{}} = user, _history, _via), do: user

  def maybe_vouch(%User{} = user, history, via) do
    if qualifies?(history) do
      user
      |> Ecto.Changeset.change(vouched_at: DateTime.utc_now(), vouched_via: via)
      |> Repo.update()
      |> case do
        {:ok, updated} -> updated
        _ -> user
      end
    else
      user
    end
  end

  def vouched?(%User{vouched_at: at}), do: not is_nil(at)
  def vouched?(_), do: false

  defp to_datetime(%DateTime{} = dt), do: dt

  defp to_datetime(s) when is_binary(s) do
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp to_datetime(_), do: nil
end
