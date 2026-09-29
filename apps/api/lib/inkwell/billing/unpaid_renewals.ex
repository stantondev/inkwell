defmodule Inkwell.Billing.UnpaidRenewals do
  @moduledoc """
  What happens when a monthly or yearly renewal isn't paid.

  Square doesn't end a subscription over an unpaid invoice: it keeps it
  ACTIVE, emails the invoice and bills again next month. So Inkwell keeps its
  own rule: a missed Plus renewal leaves Plus working for 14 days after the
  renewal date (the member is `past_due` with `subscription_expires_at` = the
  end of that grace period), then the account is free
  (`User.plus_time_ran_out?/1`). Paying the invoice at any point, before or
  after, brings Plus straight back.

  Two ways in, because neither is enough alone:

    * the `invoice.scheduled_charge_failed` webhook (`payment_failed/3`),
      which Square only sends when it actually tried a card — it sent nothing
      for @tim's September 2026 renewal, whose invoice was issued with no card
      attached;
    * `check_all/0`, run daily by `UnpaidRenewalsWorker`, which asks Square
      about the latest invoice of every paying member's subscription.

  An Ink Donor whose renewal isn't paid is marked `past_due` (the badge only
  shows while `active`) and becomes `active` again when paid.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.{Repo, Square}
  alias Inkwell.Accounts.User

  @grace_days 14
  # Square invoice statuses that mean "we asked for the money and don't have it".
  @unpaid_statuses ~w(UNPAID PARTIALLY_PAID FAILED)

  def grace_days, do: @grace_days

  @doc "The last moment of Plus for a renewal due on `due` and not paid."
  def grace_ends_at(%Date{} = due),
    do: DateTime.new!(Date.add(due, @grace_days), ~T[23:59:59], "Etc/UTC")

  @doc "The invoice's due date (its first payment request's)."
  def due_date(%{"payment_requests" => [%{"due_date" => d} | _]}) when is_binary(d) do
    case Date.from_iso8601(d) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  def due_date(_), do: nil

  @doc "An invoice whose due date has come and that still isn't paid."
  def unpaid?(invoice, today \\ Date.utc_today())

  def unpaid?(%{"status" => status} = invoice, today) when status in @unpaid_statuses do
    case due_date(invoice) do
      nil -> true
      due -> Date.compare(due, today) != :gt
    end
  end

  def unpaid?(_, _), do: false

  # ── Webhooks ───────────────────────────────────────────────────────────

  @doc "Square couldn't collect `invoice` for subscription `sub_id`."
  def payment_failed(%User{} = user, sub_id, invoice) do
    if sub_id == user.square_donor_subscription_id do
      mark_donor_unpaid(user)
    else
      mark_plus_unpaid(user, due_date(invoice))
    end
  end

  @doc "Square collected a renewal for subscription `sub_id`."
  def payment_made(%User{} = user, sub_id) do
    if sub_id == user.square_donor_subscription_id do
      mark_donor_paid(user)
    else
      mark_plus_paid(user)
    end
  end

  # ── Daily check ────────────────────────────────────────────────────────

  @doc """
  Ask Square about every paying member's latest invoice and bring each
  account in line. Returns a summary; never raises on a Square error.
  """
  def check_all do
    now = DateTime.utc_now()

    plus =
      from(u in User,
        where:
          not is_nil(u.square_subscription_id) and u.subscription_tier == "plus" and
            u.subscription_status in ["active", "past_due"] and is_nil(u.founding_member_number)
      )
      |> Repo.all()

    donors =
      from(u in User,
        where:
          not is_nil(u.square_donor_subscription_id) and
            u.ink_donor_status in ["active", "past_due"]
      )
      |> Repo.all()

    plus_results =
      Enum.map(plus, fn u ->
        pause()
        result = check_plus(u)
        if result != :paid, do: maybe_announce_end(u, now)
        result
      end)

    donor_results =
      Enum.map(donors, fn u ->
        pause()
        check_donor(u)
      end)

    summary = %{
      checked: length(plus) + length(donors),
      results: Enum.frequencies(plus_results ++ donor_results)
    }

    Logger.info("UnpaidRenewals.check_all: #{inspect(summary)}")
    summary
  end

  @doc "Re-read a Plus member's latest invoice from Square and apply it."
  def check_plus(%User{square_subscription_id: sub_id} = user) when is_binary(sub_id) do
    with {:ok, sub} <- fetch_subscription(sub_id),
         "ACTIVE" <- sub["status"],
         {:ok, invoice} <- latest_invoice(sub) do
      cond do
        unpaid?(invoice) ->
          mark_plus_unpaid(user, due_date(invoice))
          :unpaid

        invoice["status"] == "PAID" ->
          mark_plus_paid(user)
          :paid

        true ->
          :unchanged
      end
    else
      {:error, reason} ->
        Logger.warning("UnpaidRenewals: couldn't check Plus for #{user.username}: #{inspect(reason)}")
        :error

      # Not ACTIVE: cancellations and pauses arrive as subscription.updated.
      _ ->
        :unchanged
    end
  end

  def check_plus(_), do: :unchanged

  defp check_donor(%User{square_donor_subscription_id: sub_id} = user) do
    with {:ok, sub} <- fetch_subscription(sub_id),
         "ACTIVE" <- sub["status"],
         {:ok, invoice} <- latest_invoice(sub) do
      cond do
        unpaid?(invoice) ->
          mark_donor_unpaid(user)
          :unpaid

        invoice["status"] == "PAID" ->
          mark_donor_paid(user)
          :paid

        true ->
          :unchanged
      end
    else
      {:error, reason} ->
        Logger.warning("UnpaidRenewals: couldn't check Ink Donor for #{user.username}: #{inspect(reason)}")
        :error

      _ ->
        :unchanged
    end
  end

  @doc """
  The newest invoice of a subscription (by due date). Square lists
  `invoice_ids` newest first; the first two are read in case that ever changes.
  """
  def latest_invoice(sub) do
    ids = Enum.take(sub["invoice_ids"] || [], 2)

    ids
    |> Enum.map(&fetch_invoice/1)
    |> Enum.flat_map(fn
      {:ok, inv} -> [inv]
      _ -> []
    end)
    |> case do
      [] when ids == [] -> {:error, :no_invoices}
      [] -> {:error, :invoice_fetch_failed}
      invoices -> {:ok, Enum.max_by(invoices, &(due_date(&1) || ~D[1970-01-01]), Date)}
    end
  end

  @doc """
  Where a member can pay their unpaid renewal (Square's invoice page), or nil.
  Asks Square, so only call it for someone who is `past_due`.
  """
  def unpaid_invoice(%User{subscription_status: "past_due", square_subscription_id: sub_id})
      when is_binary(sub_id) do
    with {:ok, sub} <- fetch_subscription(sub_id),
         {:ok, invoice} <- latest_invoice(sub),
         true <- unpaid?(invoice) do
      %{
        url: invoice["public_url"],
        due_date: due_date(invoice),
        amount_cents: get_in(invoice, ["next_payment_amount_money", "amount"])
      }
    else
      _ -> nil
    end
  end

  def unpaid_invoice(_), do: nil

  # ── State changes ──────────────────────────────────────────────────────

  defp mark_plus_unpaid(%User{} = user, due) do
    cond do
      user.subscription_tier != "plus" or not is_nil(user.founding_member_number) ->
        :ok

      # A scheduled cancel or a trial has its own end date.
      user.subscription_status not in ["active", "past_due"] ->
        :ok

      # Already counting down: keep the first missed renewal's deadline, so a
      # second unpaid month doesn't move it.
      user.subscription_status == "past_due" and not is_nil(user.subscription_expires_at) ->
        :ok

      true ->
        ends_at = grace_ends_at(due || Date.utc_today())

        {:ok, _} =
          user
          |> User.subscription_changeset(%{
            subscription_status: "past_due",
            subscription_expires_at: ends_at
          })
          |> Repo.update()

        Logger.warning("Plus renewal unpaid for #{user.username} — Plus until #{Date.to_iso8601(DateTime.to_date(ends_at))}")
        Inkwell.Slack.notify_payment_failed(user.username, :plus, DateTime.to_date(ends_at))
        :ok
    end
  end

  defp mark_plus_paid(%User{subscription_status: "past_due"} = user) do
    {:ok, _} =
      user
      |> User.subscription_changeset(%{
        subscription_tier: "plus",
        subscription_status: "active",
        subscription_expires_at: nil
      })
      |> Repo.update()

    Logger.info("Plus renewal paid for #{user.username} — back to active")
    Inkwell.Slack.notify_payment_recovered(user.username, :plus)
    :ok
  end

  defp mark_plus_paid(_), do: :ok

  defp mark_donor_unpaid(%User{ink_donor_status: "active"} = user) do
    {:ok, _} = user |> User.ink_donor_changeset(%{ink_donor_status: "past_due"}) |> Repo.update()
    Logger.warning("Ink Donor renewal unpaid for #{user.username}")
    Inkwell.Slack.notify_payment_failed(user.username, :donor)
    :ok
  end

  defp mark_donor_unpaid(_), do: :ok

  defp mark_donor_paid(%User{ink_donor_status: "past_due"} = user) do
    {:ok, _} = user |> User.ink_donor_changeset(%{ink_donor_status: "active"}) |> Repo.update()
    Inkwell.Slack.notify_payment_recovered(user.username, :donor)
    :ok
  end

  defp mark_donor_paid(_), do: :ok

  # The day after a grace period ends, say so once: Square keeps emailing a
  # monthly invoice until the subscription is canceled.
  defp maybe_announce_end(%User{subscription_status: "past_due", subscription_expires_at: %DateTime{} = ends} = user, now) do
    if Date.diff(DateTime.to_date(now), DateTime.to_date(ends)) == 1 do
      Inkwell.Slack.notify_unpaid_plus_ended(user.username)
    end
  end

  defp maybe_announce_end(_, _), do: :ok

  # ── Square (swappable in tests) ────────────────────────────────────────

  defp fetch_subscription(id),
    do: Application.get_env(:inkwell, :unpaid_renewals_subscription_fetcher, &Square.get_subscription/1).(id)

  defp fetch_invoice(id),
    do: Application.get_env(:inkwell, :unpaid_renewals_invoice_fetcher, &Square.get_invoice/1).(id)

  defp pause do
    if Application.get_env(:inkwell, :unpaid_renewals_pause, true), do: Process.sleep(300)
  end
end
