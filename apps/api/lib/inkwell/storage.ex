defmodule Inkwell.Storage do
  @moduledoc """
  Image storage allowances.

  Usage is the real size of each file (decoded bytes), summed over a user's
  `entry_images`.

  - Free: 100 MB.
  - Plus: 1 GB, plus 1 GB for every full year since the account first became
    paid Plus (`users.plus_member_since`). Free trials don't start the clock.
    Founding Members count from when they bought in.

  When an upload takes someone past half their allowance, admins get a Slack
  note so there's plenty of warning before anyone runs out.
  """

  alias Inkwell.Journals

  @mb 1_048_576
  @gb 1_073_741_824

  @free_limit 100 * @mb
  @plus_base @gb
  @plus_per_year @gb
  @alert_fraction 0.5

  def free_limit, do: @free_limit
  def plus_base, do: @plus_base
  def plus_per_year, do: @plus_per_year

  def plus?(user), do: (user.subscription_tier || "free") == "plus"

  @doc "Full years since the member first became paid Plus (0 when not stamped)."
  def plus_years(user, now \\ DateTime.utc_now())

  def plus_years(%{plus_member_since: %DateTime{} = since}, %DateTime{} = now) do
    years = now.year - since.year
    anniversary_passed? = {now.month, now.day} >= {since.month, since.day}
    max(if(anniversary_passed?, do: years, else: years - 1), 0)
  end

  def plus_years(_user, _now), do: 0

  @doc "The user's storage allowance in bytes."
  def limit_for(user, now \\ DateTime.utc_now()) do
    if plus?(user),
      do: @plus_base + plus_years(user, now) * @plus_per_year,
      else: @free_limit
  end

  @doc "Bytes of image storage the user currently uses."
  def used(user_id), do: Journals.get_total_image_storage(user_id)

  @doc """
  Checks whether `incoming_bytes` more fits in the user's allowance.
  Returns `{:ok, used, limit}` or `{:error, :storage_limit_exceeded}`.
  """
  def check(user, incoming_bytes) do
    used = used(user.id)
    limit = limit_for(user)

    if used + incoming_bytes > limit,
      do: {:error, :storage_limit_exceeded},
      else: {:ok, used, limit}
  end

  @doc """
  Call after a successful upload. Sends one Slack note when this upload is the
  one that crosses half the allowance.
  """
  def after_upload(user, used_before, added_bytes, limit) do
    threshold = limit * @alert_fraction

    if used_before < threshold and used_before + added_bytes >= threshold do
      used_after = used_before + added_bytes
      pct = round(used_after / limit * 100)

      Task.start(fn ->
        Inkwell.Slack.notify(
          ":floppy_disk: *Storage check:* @#{user.username} has used #{pct}% of their image storage " <>
            "(#{format_bytes(used_after)} of #{format_bytes(limit)}, #{if plus?(user), do: "Plus", else: "Free"})"
        )
      end)
    end

    :ok
  end

  @doc "Storage summary for the API and billing page."
  def summary(user, now \\ DateTime.utc_now()) do
    used = used(user.id)
    limit = limit_for(user, now)
    plus? = plus?(user)
    years = if plus?, do: plus_years(user, now), else: 0

    %{
      used_bytes: used,
      limit_bytes: limit,
      remaining_bytes: max(limit - used, 0),
      plus_member_since: if(plus?, do: user.plus_member_since),
      plus_years: years,
      next_increase_on:
        if(plus? and user.plus_member_since, do: anniversary(user.plus_member_since, years + 1)),
      yearly_increase_bytes: if(plus?, do: @plus_per_year)
    }
  end

  defp anniversary(%DateTime{} = since, years) do
    year = since.year + years

    case Date.new(year, since.month, since.day) do
      {:ok, date} -> date
      # Feb 29 in a non-leap year
      {:error, _} -> Date.new!(year, 3, 1)
    end
  end

  def format_bytes(bytes) when bytes >= @gb,
    do: "#{:erlang.float_to_binary(bytes / @gb, decimals: 1)} GB"

  def format_bytes(bytes), do: "#{round(bytes / @mb)} MB"
end
