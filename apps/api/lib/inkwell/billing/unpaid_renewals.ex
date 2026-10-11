defmodule Inkwell.Billing.UnpaidRenewals do
  @moduledoc """
  What happens when a monthly or yearly renewal isn't paid. All automatic:
  nobody has to go into Square.

  Square doesn't end a subscription over an unpaid invoice: it keeps it
  ACTIVE, keeps emailing the invoice and bills again next month. So Inkwell
  keeps its own rule:

    1. A missed Plus renewal leaves Plus working for 14 days after the renewal
       date (`past_due`, `subscription_expires_at` = the end of that grace).
       Paying the invoice in that time brings everything back as it was.
    2. Once the grace is over, the daily check closes it (`close_plus/3`):
       the Square subscription is canceled (so the card isn't tried again),
       the open invoice is canceled (so Square stops asking for it), and the
       account becomes free. Coming back is a fresh "Subscribe" with nothing
       owed.

  An Ink Donor's missed renewal hides the badge (`past_due`) and is closed
  the same way 14 days after its due date.

  Two ways in, because neither is enough alone:

    * the `invoice.scheduled_charge_failed` webhook (`payment_failed/3`),
      which Square only sends when it actually tried a card — it sent nothing
      for @tim's September 2026 renewal, whose invoice was issued with no card
      attached;
    * `check_all/0`, run daily by `UnpaidRenewalsWorker`, which asks Square
      about the latest invoice of every paying member's subscription. It's
      also the only place anything is closed.

  An invoice canceled by hand in Square (`written_off?/1`) counts as nothing
  owed; the subscription is still closed when the grace ends.
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

  @doc "An invoice the merchant canceled in Square: nothing is owed on it."
  def written_off?(%{"status" => "CANCELED"}), do: true
  def written_off?(_), do: false

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
        check_plus(u, now)
      end)

    donor_results =
      Enum.map(donors, fn u ->
        pause()
        check_donor(u, now)
      end)

    summary = %{
      checked: length(plus) + length(donors),
      results: Enum.frequencies(plus_results ++ donor_results)
    }

    Logger.info("UnpaidRenewals.check_all: #{inspect(summary)}")
    summary
  end

  @doc """
  Re-read a Plus member's latest invoice from Square and apply it. Returns
  `:paid`, `:unpaid` (counting down), `:written_off`, `:closed` (grace over,
  closed everywhere), `:unchanged` or `:error`.
  """
  def check_plus(user, now \\ DateTime.utc_now())

  def check_plus(%User{square_subscription_id: sub_id} = user, now) when is_binary(sub_id) do
    case fetch_subscription(sub_id) do
      {:ok, %{"status" => "ACTIVE"} = sub} ->
        case latest_invoice(sub) do
          {:ok, invoice} ->
            apply_plus_invoice(user, sub, invoice, now)

          {:error, reason} ->
            Logger.warning("UnpaidRenewals: couldn't read @#{user.username}'s invoices: #{inspect(reason)}")
            :error
        end

      # Square already ended it (canceled there, or it ran out): just make
      # sure an unpaid member whose grace is over isn't still Plus here.
      {:ok, %{"status" => status}} when status in ["CANCELED", "DEACTIVATED"] ->
        if plus_grace_over?(user, now), do: end_plus_here(user, :already_closed), else: :unchanged

      # PAUSED / PENDING: changes arrive as subscription.updated.
      {:ok, _} ->
        :unchanged

      {:error, reason} ->
        Logger.warning("UnpaidRenewals: couldn't check Plus for #{user.username}: #{inspect(reason)}")
        :error
    end
  end

  def check_plus(_, _), do: :unchanged

  defp apply_plus_invoice(user, sub, invoice, now) do
    cond do
      invoice["status"] == "PAID" ->
        mark_plus_paid(user)
        :paid

      unpaid?(invoice) ->
        mark_plus_unpaid(user, due_date(invoice))
        user = Repo.get!(User, user.id)
        if plus_grace_over?(user, now), do: close_plus(user, sub, invoice), else: :unpaid

      written_off?(invoice) ->
        if plus_grace_over?(user, now), do: close_plus(user, sub, invoice), else: :written_off

      true ->
        :unchanged
    end
  end

  defp plus_grace_over?(%User{} = user, now),
    do: user.subscription_status == "past_due" and User.plus_time_ran_out?(user, now)

  defp check_donor(%User{square_donor_subscription_id: sub_id} = user, now) do
    case fetch_subscription(sub_id) do
      {:ok, %{"status" => "ACTIVE"} = sub} ->
        case latest_invoice(sub) do
          {:ok, invoice} ->
            apply_donor_invoice(user, sub, invoice, now)

          {:error, reason} ->
            Logger.warning("UnpaidRenewals: couldn't read @#{user.username}'s donor invoices: #{inspect(reason)}")
            :error
        end

      {:ok, %{"status" => status}} when status in ["CANCELED", "DEACTIVATED"] ->
        if user.ink_donor_status == "past_due", do: end_donor_here(user, :already_closed), else: :unchanged

      {:ok, _} ->
        :unchanged

      {:error, reason} ->
        Logger.warning("UnpaidRenewals: couldn't check Ink Donor for #{user.username}: #{inspect(reason)}")
        :error
    end
  end

  defp apply_donor_invoice(user, sub, invoice, now) do
    cond do
      invoice["status"] == "PAID" ->
        mark_donor_paid(user)
        :paid

      unpaid?(invoice) ->
        mark_donor_unpaid(user)
        if donor_grace_over?(invoice, now), do: close_donor(user, sub, invoice), else: :unpaid

      written_off?(invoice) and user.ink_donor_status == "past_due" ->
        if donor_grace_over?(invoice, now), do: close_donor(user, sub, invoice), else: :written_off

      true ->
        :unchanged
    end
  end

  defp donor_grace_over?(invoice, now) do
    case due_date(invoice) do
      nil -> false
      due -> DateTime.compare(grace_ends_at(due), now) == :lt
    end
  end

  # ── Closing an unpaid subscription ─────────────────────────────────────

  @doc false
  # The grace is over: cancel the Square subscription (no more charges), cancel
  # its open invoice (no more reminders), and make the account free. If Square
  # refuses, nothing changes here and tomorrow's check tries again.
  def close_plus(%User{} = user, sub, invoice) do
    case close_square(sub, invoice) do
      {:ok, invoice_left_open?} ->
        end_plus_here(user, :closed)
        Inkwell.Slack.notify_unpaid_closed(user.username, :plus, invoice_left_open?)
        :closed

      {:error, reason} ->
        Logger.error("UnpaidRenewals: couldn't close @#{user.username}'s unpaid Plus subscription: #{inspect(reason)}")
        Inkwell.Slack.notify_unpaid_close_failed(user.username, :plus, reason)
        :error
    end
  end

  defp close_donor(%User{} = user, sub, invoice) do
    case close_square(sub, invoice) do
      {:ok, invoice_left_open?} ->
        end_donor_here(user, :closed)
        Inkwell.Slack.notify_unpaid_closed(user.username, :donor, invoice_left_open?)
        :closed

      {:error, reason} ->
        Logger.error("UnpaidRenewals: couldn't close @#{user.username}'s unpaid Ink Donor subscription: #{inspect(reason)}")
        Inkwell.Slack.notify_unpaid_close_failed(user.username, :donor, reason)
        :error
    end
  end

  # Cancel the subscription first: that's what stops the card being charged.
  # The invoice is second; if only that fails, the member just keeps getting
  # Square's reminder for an invoice nobody will collect, and Slack says so.
  defp close_square(sub, invoice) do
    already_canceled? = is_binary(sub["canceled_date"])

    with {:ok, _} <- if(already_canceled?, do: {:ok, sub}, else: cancel_subscription(sub["id"])) do
      if invoice["status"] in ["UNPAID", "PARTIALLY_PAID", "SCHEDULED"] do
        case cancel_invoice(invoice) do
          {:ok, _} -> {:ok, false}
          {:error, _} -> {:ok, true}
        end
      else
        {:ok, false}
      end
    end
  end

  defp end_plus_here(%User{} = user, how) do
    settings =
      Map.put(user.settings || %{}, Inkwell.Billing.unpaid_cancel_key(), user.square_subscription_id)

    {:ok, updated} =
      user
      |> User.subscription_changeset(%{subscription_tier: "free", subscription_status: "canceled"})
      |> Ecto.Changeset.put_change(:settings, settings)
      |> Repo.update()

    Inkwell.Billing.drop_custom_domain(updated.id)
    Logger.info("Plus closed for @#{user.username} after an unpaid renewal (#{how})")
    :closed
  end

  defp end_donor_here(%User{} = user, how) do
    {:ok, _} = user |> User.ink_donor_changeset(%{ink_donor_status: "canceled"}) |> Repo.update()
    Logger.info("Ink Donor closed for @#{user.username} after an unpaid renewal (#{how})")
    :closed
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
  The missed renewal of a `past_due` member, from Square: `%{state: :unpaid,
  url:, due_date:, amount_cents:}` (where to pay it), `%{state: :written_off,
  due_date:}` (the invoice was canceled in Square, nothing owed), or nil.
  Asks Square, so only call it for someone who is `past_due`.
  """
  def renewal_invoice(%User{subscription_status: "past_due", square_subscription_id: sub_id})
      when is_binary(sub_id) do
    with {:ok, sub} <- fetch_subscription(sub_id),
         {:ok, invoice} <- latest_invoice(sub) do
      describe_invoice(invoice)
    else
      _ -> nil
    end
  end

  def renewal_invoice(_), do: nil

  @doc "What `renewal_invoice/1` says about one invoice (nil if it's neither unpaid nor canceled)."
  def describe_invoice(invoice) do
    cond do
      unpaid?(invoice) ->
        %{
          state: :unpaid,
          url: invoice["public_url"],
          due_date: due_date(invoice),
          amount_cents: get_in(invoice, ["next_payment_amount_money", "amount"])
        }

      written_off?(invoice) ->
        %{state: :written_off, url: nil, due_date: due_date(invoice), amount_cents: nil}

      true ->
        nil
    end
  end

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

  # ── Square (swappable in tests) ────────────────────────────────────────

  defp fetch_subscription(id),
    do: Application.get_env(:inkwell, :unpaid_renewals_subscription_fetcher, &Square.get_subscription/1).(id)

  defp fetch_invoice(id),
    do: Application.get_env(:inkwell, :unpaid_renewals_invoice_fetcher, &Square.get_invoice/1).(id)

  defp cancel_subscription(id),
    do: Application.get_env(:inkwell, :unpaid_renewals_subscription_canceler, &Square.cancel_subscription_with_details/1).(id)

  defp cancel_invoice(invoice),
    do: Application.get_env(:inkwell, :unpaid_renewals_invoice_canceler, &Square.cancel_invoice/1).(invoice)

  defp pause do
    if Application.get_env(:inkwell, :unpaid_renewals_pause, true), do: Process.sleep(300)
  end
end
