defmodule Inkwell.Moderation.RequestGate do
  @moduledoc """
  Who may send a pen pal request (from Jon Henshaw's roadmap post, 2026-10-11).

  Spam accounts use pen pal requests to get in front of members: on
  2026-10-05 `@buyverifiedpaypalaccounts`, already limited by the spam
  checker, sent 11 requests in six seconds. So:

    * an account the spam checker has limited can't send requests (it can
      still accept them); the limit lifts on its own once the account takes
      part (`AutoModeration`), and with it this rule;
    * an account under 7 days old needs a few words in its bio first, so the
      person being asked can tell who's asking;
    * an account under 7 days old can send at most 20 a day.

  Accepting a request someone already sent you is never gated. Admins and
  accounts an admin has cleared skip the new-account rules.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Social.Relationship

  @new_account_days 7
  @new_account_daily_cap 20

  def new_account_daily_cap, do: @new_account_daily_cap

  @doc """
  `:ok`, or `{:error, code, message}` with a message meant for the person.
  """
  def check(%User{} = user) do
    cond do
      Inkwell.Accounts.is_admin?(user) ->
        :ok

      user.moderation_state == "limited" ->
        {:error, "requests_paused",
         "Pen pal requests from your account are paused for now while our spam checks look it over. " <>
           "This usually lifts on its own once you've joined in a little: footnotes, inks and stamps all count. " <>
           "You can still accept requests people send you."}

      user.moderation_cleared_at != nil or not new_account?(user) ->
        :ok

      blank_bio?(user) ->
        {:error, "bio_required",
         "Add a few words about yourself to your profile before sending pen pal requests, " <>
           "so people can see who's asking."}

      requests_today(user.id) >= @new_account_daily_cap ->
        {:error, "request_limit",
         "New accounts can send #{@new_account_daily_cap} pen pal requests a day. You can send more tomorrow."}

      true ->
        :ok
    end
  end

  def new_account?(%User{inserted_at: nil}), do: false

  def new_account?(%User{inserted_at: inserted_at}) do
    DateTime.diff(DateTime.utc_now(), to_datetime(inserted_at), :day) < @new_account_days
  end

  def blank_bio?(%User{} = user) do
    text =
      (user.bio_html || user.bio || "")
      |> String.replace(~r/<[^>]*>/, " ")
      |> String.replace("&nbsp;", " ")
      |> String.trim()

    text == ""
  end

  defp requests_today(user_id) do
    since = DateTime.add(DateTime.utc_now(), -86_400, :second)

    from(r in Relationship,
      where: r.follower_id == ^user_id and not is_nil(r.following_id) and r.inserted_at > ^since,
      where: r.status in [:pending, :accepted],
      select: count()
    )
    |> Repo.one()
  end

  defp to_datetime(%DateTime{} = dt), do: dt
  defp to_datetime(%NaiveDateTime{} = n), do: DateTime.from_naive!(n, "Etc/UTC")
end
