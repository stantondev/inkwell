defmodule Inkwell.Billing.AdminOverview do
  @moduledoc """
  Everything the admin Billing page shows, in one call: who has Plus (or
  donates) and why, and a short list of things that actually need a look.

  Square is asked only about members who have a Square subscription on
  file (a handful), concurrently and with a timeout, so the page stays fast
  and a Square outage just shows "couldn't reach Square" on those rows.
  """

  import Ecto.Query

  alias Inkwell.{Avatars, Repo, Square}
  alias Inkwell.Accounts.User
  alias Inkwell.Billing.{Funnel, WebhookDelivery}

  # Monthly renewals are the only regular webhook traffic, so a quiet day
  # (or week) is normal. Only flag silence longer than a billing cycle.
  @webhook_quiet_days 35
  @failed_statuses ~w(signature_failed parse_failed handler_failed missing_body)

  def build do
    now = DateTime.utc_now()

    users =
      from(u in User,
        where: u.subscription_tier == "plus" or u.ink_donor_status == "active",
        order_by: [asc: u.founding_member_number, desc: u.inserted_at]
      )
      |> Repo.all()

    square = fetch_square_subscriptions(users)
    members = users |> Enum.map(&member(&1, square, now)) |> Enum.sort_by(&sort_key/1)

    last_webhook_at =
      Repo.one(from(d in WebhookDelivery, select: max(d.inserted_at)))

    failed_7d =
      Repo.one(
        from(d in WebhookDelivery,
          where: d.status in @failed_statuses and d.inserted_at > ^DateTime.add(now, -7, :day),
          select: count(d.id)
        )
      ) || 0

    recent =
      from(d in WebhookDelivery, order_by: [desc: d.inserted_at], limit: 20)
      |> Repo.all()
      |> Enum.map(&render_delivery/1)

    plans = plan_checks()
    funnel = Funnel.summary()
    problems = problems(members, last_webhook_at, failed_7d, now, plans, funnel)

    %{
      status: if(problems == [], do: "ok", else: "attention"),
      problems: problems,
      counts: counts(members),
      last_webhook_at: last_webhook_at,
      plans: plans,
      checkouts: funnel,
      members: members,
      recent_webhooks: recent
    }
  end

  # ── Members ───────────────────────────────────────────────────────────

  defp fetch_square_subscriptions(users) do
    users
    |> Enum.map(& &1.square_subscription_id)
    |> Enum.reject(&is_nil/1)
    |> Task.async_stream(fn id -> {id, Square.get_subscription(id)} end,
      max_concurrency: 4,
      timeout: 8_000,
      on_timeout: :kill_task
    )
    |> Enum.reduce(%{}, fn
      {:ok, {id, {:ok, sub}}}, acc -> Map.put(acc, id, sub)
      _, acc -> acc
    end)
  end

  defp member(%User{} = u, square, now) do
    base = %{
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      email: u.email,
      avatar_url: Avatars.avatar_url(u),
      donor: donor_label(u),
      attention: false
    }

    Map.merge(base, plus_state(u, square, now))
  end

  defp plus_state(%User{subscription_tier: tier} = u, _square, _now) when tier != "plus" do
    %{kind: "donor", label: "Ink Donor", detail: donor_label(u) || "Donating"}
    |> Map.put(:donor, nil)
  end

  defp plus_state(%User{founding_member_number: n}, _square, _now) when not is_nil(n) do
    %{kind: "founding", label: "Founding Member ##{n}", detail: "Paid once, Plus for good"}
  end

  defp plus_state(%User{} = u, square, now) do
    cond do
      User.plus_time_ran_out?(u, now) ->
        %{
          kind: "expired",
          label: "Time ran out",
          detail: "Ended #{date(u.subscription_expires_at)} — already treated as free",
          attention: true
        }

      u.subscription_status == "trialing" ->
        %{kind: "trial", label: "Free trial", detail: "Ends #{date(u.subscription_expires_at)}"}

      u.square_subscription_id ->
        square_state(u, Map.get(square, u.square_subscription_id))

      u.subscription_status == "canceled" and u.subscription_expires_at ->
        %{kind: "granted", label: "Given Plus", detail: "Until #{date(u.subscription_expires_at)}"}

      true ->
        %{
          kind: "no_payment",
          label: "No payment on file",
          detail: "Marked Plus with nothing behind it",
          attention: true
        }
    end
  end

  defp square_state(_u, nil) do
    %{kind: "square", label: "Paying (Square)", detail: "Couldn't reach Square to check"}
  end

  defp square_state(u, %{"status" => "ACTIVE"} = sub) do
    plan = plan_name(sub["plan_variation_id"])

    case sub["canceled_date"] do
      nil ->
        %{
          kind: "square",
          label: "Paying · #{plan}",
          detail: "Renews #{square_date(sub["charged_through_date"])}"
        }

      ends ->
        %{kind: "canceling", label: "Canceled · #{plan}", detail: "Plus until #{square_date(ends)}"}
    end
    |> maybe_mismatch(u, "ACTIVE")
  end

  defp square_state(u, %{"status" => status}) do
    %{
      kind: "square_mismatch",
      label: "Square says #{String.downcase(status)}",
      detail: "Still marked #{u.subscription_status || "Plus"} here — use Check with Square",
      attention: true
    }
  end

  # Paying in Square but canceled/past due here (or the reverse) — flag it.
  defp maybe_mismatch(state, %User{subscription_status: "past_due"}, "ACTIVE"),
    do: Map.merge(state, %{detail: state.detail <> " · last payment failed", attention: true})

  defp maybe_mismatch(state, _u, _), do: state

  defp plan_name(variation_id) do
    config = Application.get_env(:inkwell, :square, [])

    cond do
      variation_id && variation_id == config[:plus_annual_plan_variation_id] -> "Yearly"
      true -> "Monthly"
    end
  end

  defp donor_label(%User{ink_donor_status: "active", ink_donor_amount_cents: c}) when is_integer(c),
    do: "Ink Donor $#{div(c, 100)}/mo"

  defp donor_label(%User{ink_donor_status: "active"}), do: "Ink Donor"
  defp donor_label(_), do: nil

  @kind_order ~w(expired no_payment square_mismatch square canceling founding granted trial donor)
  defp sort_key(m), do: {Enum.find_index(@kind_order, &(&1 == m.kind)) || 99, m.username}

  defp counts(members) do
    by = Enum.frequencies_by(members, & &1.kind)

    %{
      plus: Enum.count(members, &(&1.kind not in ["donor", "expired"])),
      paying: Map.get(by, "square", 0) + Map.get(by, "canceling", 0),
      founding: Map.get(by, "founding", 0),
      trial: Map.get(by, "trial", 0),
      granted: Map.get(by, "granted", 0),
      donors: Enum.count(members, &(&1.kind == "donor" or &1.donor))
    }
  end

  # ── Can people actually pay? ──────────────────────────────────────────
  #
  # Each recurring plan we sell, and whether Square's checkout can complete
  # it. A plan priced RELATIVE takes the buyer's money nowhere: the hosted
  # page fails at the payment step (see Inkwell.Square). That was invisible
  # for five months, so it gets its own line on this page now.

  defp plan_checks do
    config = Application.get_env(:inkwell, :square, [])

    # No Square at all (local dev, tests, a self-hosted instance) isn't a
    # billing fault — there's nothing being sold here to be broken.
    if blank?(config[:access_token]) or blank?(config[:location_id]) do
      []
    else
      plan_checks(config)
    end
  end

  defp blank?(value), do: is_nil(value) or value == ""

  defp plan_checks(config) do
    [
      {"Plus monthly", config[:plus_plan_variation_id], true},
      {"Plus yearly", config[:plus_annual_plan_variation_id], false},
      {"Ink Donor $1", config[:donor_plan_variation_1], false},
      {"Ink Donor $2", config[:donor_plan_variation_2], false},
      {"Ink Donor $3", config[:donor_plan_variation_3], false}
    ]
    |> Enum.map(&plan_check/1)
    |> Enum.reject(&is_nil/1)
  end

  # An unset optional plan simply isn't offered, so it isn't a problem.
  defp plan_check({_label, id, false}) when is_nil(id) or id == "", do: nil

  defp plan_check({label, id, true}) when is_nil(id) or id == "" do
    %{label: label, id: nil, pricing: nil, ok: false, note: "Not configured — nobody can subscribe."}
  end

  defp plan_check({label, id, _required}) do
    case Square.plan_variation_pricing(id) do
      {:ok, "RELATIVE"} ->
        %{label: label, id: id, pricing: "RELATIVE", ok: false,
          note: "Square's checkout can't complete a RELATIVE-priced plan. Point this at a STATIC one."}

      {:ok, pricing} ->
        %{label: label, id: id, pricing: pricing, ok: true, note: nil}

      {:error, :plan_not_found} ->
        %{label: label, id: id, pricing: nil, ok: false, note: "Square doesn't have this plan variation."}

      {:error, _reason} ->
        %{label: label, id: id, pricing: nil, ok: true, note: "Couldn't reach Square to check."}
    end
  end

  # ── Problems ──────────────────────────────────────────────────────────

  defp problems(members, last_webhook_at, failed_7d, now, plans, funnel) do
    names = fn kind -> for m <- members, m.kind == kind, do: m.username end
    paying? = Enum.any?(members, &(&1.kind in ["square", "canceling"]))

    [
      case names.("expired") do
        [] -> nil
        ns -> %{kind: "expired", usernames: ns, message: "#{plural(ns, "account")} still marked Plus after the time ran out. They already get the free plan; Mark as free tidies the record."}
      end,
      case names.("no_payment") do
        [] -> nil
        ns -> %{kind: "no_payment", usernames: ns, message: "#{plural(ns, "account")} marked Plus with no payment, trial or grant behind it."}
      end,
      case names.("square_mismatch") do
        [] -> nil
        ns -> %{kind: "square_mismatch", usernames: ns, message: "Square and Inkwell disagree about #{plural(ns, "member")}. Check with Square on their row."}
      end,
      if failed_7d > 0 do
        %{kind: "webhook_failures", usernames: [], message: "#{failed_7d} Square webhook#{if failed_7d == 1, do: "", else: "s"} failed in the last 7 days. See Troubleshooting → Recent Square webhooks."}
      end,
      if paying? and quiet?(last_webhook_at, now) do
        %{kind: "webhooks_quiet", usernames: [], message: "No Square webhooks in over #{@webhook_quiet_days} days, though members renew monthly. Check the webhook in the Square dashboard."}
      end,
      case Enum.reject(plans, & &1.ok) do
        [] -> nil
        broken ->
          %{kind: "plan_unusable", usernames: [],
            message: "Nobody can subscribe to #{Enum.map_join(broken, ", ", & &1.label)}: #{broken |> List.first() |> Map.get(:note)}"}
      end,
      if funnel.stalled do
        %{kind: "checkouts_stalled", usernames: [],
          message: "#{funnel.people} people opened a Plus or Ink Donor checkout in the last #{funnel.days} days and none completed. Try a checkout yourself."}
      end
    ]
    |> Enum.reject(&is_nil/1)
  end

  defp quiet?(nil, _now), do: true

  defp quiet?(%NaiveDateTime{} = at, now),
    do: quiet?(DateTime.from_naive!(at, "Etc/UTC"), now)

  defp quiet?(%DateTime{} = at, now),
    do: DateTime.diff(now, at, :day) > @webhook_quiet_days

  defp plural([_], word), do: "1 #{word}"
  defp plural(list, word), do: "#{length(list)} #{word}s"

  # ── Formatting ────────────────────────────────────────────────────────

  defp date(nil), do: "—"
  defp date(%DateTime{} = dt), do: Calendar.strftime(dt, "%b %-d, %Y")
  defp date(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%b %-d, %Y")

  defp square_date(nil), do: "—"

  defp square_date(iso) when is_binary(iso) do
    case Date.from_iso8601(iso) do
      {:ok, d} -> Calendar.strftime(d, "%b %-d, %Y")
      _ -> iso
    end
  end

  defp render_delivery(d) do
    %{
      id: d.id,
      status: d.status,
      event_type: d.event_type,
      error: d.error,
      remote_ip: d.remote_ip,
      signature_valid: d.signature_valid,
      body_size: d.body_size,
      source: d.source,
      inserted_at: d.inserted_at
    }
  end
end
