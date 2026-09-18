defmodule Inkwell.Transparency do
  @moduledoc """
  Public numbers for the /transparency page: what Inkwell costs to run, what
  comes in, and how much of the monthly bill members cover.

  Costs are configured by hand in `config :inkwell, :transparency_costs`
  (update them when a bill changes). Revenue comes from Square: active
  subscriptions are priced by plan variation so monthly and yearly Plus are
  counted correctly. Admin accounts are excluded so the founder paying for
  their own account doesn't inflate the numbers.

  The Square-backed part is cached for an hour and falls back to a database
  estimate if Square can't be reached, so the page never errors.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Billing.Founding
  alias Inkwell.Repo
  alias Inkwell.Square

  import Ecto.Query

  require Logger

  @cache_key {__MODULE__, :revenue}
  @cache_ttl_seconds 3600

  def stats do
    costs = costs()
    monthly_cost_cents = Enum.reduce(costs, 0, &(&1.monthly_cents + &2))
    revenue = revenue()
    founding = Founding.status()

    %{
      as_of: DateTime.utc_now(),
      costs: costs,
      monthly_cost_cents: monthly_cost_cents,
      monthly_revenue_cents: revenue.monthly_cents,
      revenue_source: revenue.source,
      percent_covered:
        if(monthly_cost_cents > 0,
          do: min(round(revenue.monthly_cents * 100 / monthly_cost_cents), 999),
          else: 0
        ),
      paying_members: revenue.paying_members,
      founding: founding,
      users: user_counts()
    }
  end

  def costs do
    Application.get_env(:inkwell, :transparency_costs, [])
    |> Enum.map(fn {label, cents, note} -> %{label: label, monthly_cents: cents, note: note} end)
  end

  defp user_counts do
    month_ago = DateTime.add(DateTime.utc_now(), -30, :day)

    total =
      from(u in User,
        # The relay actor is a machine account, not a member (matches NodeInfo).
        where:
          is_nil(u.blocked_at) and u.username != ^Inkwell.Federation.InstanceActor.username(),
        select: count(u.id)
      )
      |> Repo.one()

    writers_30d =
      from(e in Inkwell.Journals.Entry,
        where: e.status == :published and e.published_at >= ^month_ago,
        select: count(e.user_id, :distinct)
      )
      |> Repo.one()

    %{total: total, active_writers_30d: writers_30d}
  end

  defp admin_user_ids do
    admin_usernames = Application.get_env(:inkwell, :admin_usernames, [])

    from(u in User, where: u.role == "admin" or u.username in ^admin_usernames, select: u.id)
    |> Repo.all()
    |> MapSet.new()
  end

  defp revenue do
    now = System.system_time(:second)

    case :persistent_term.get(@cache_key, nil) do
      {cached_at, value} when now - cached_at < @cache_ttl_seconds ->
        value

      _ ->
        value = compute_revenue()
        :persistent_term.put(@cache_key, {now, value})
        value
    end
  end

  @doc false
  def clear_cache, do: :persistent_term.erase(@cache_key)

  defp compute_revenue do
    admins = admin_user_ids()

    case Square.list_all_subscriptions() do
      {:ok, subs} ->
        revenue_from_square(subs, admins)

      {:error, reason} ->
        Logger.warning("[Transparency] Square unavailable, using estimate: #{inspect(reason)}")
        revenue_estimate(admins)
    end
  rescue
    e ->
      Logger.warning("[Transparency] revenue failed, using estimate: #{Exception.message(e)}")
      revenue_estimate(admin_user_ids())
  end

  defp revenue_from_square(subs, admins) do
    config = Application.get_env(:inkwell, :square, [])

    customer_to_user =
      from(u in User,
        where: not is_nil(u.square_customer_id),
        select: {u.square_customer_id, u.id}
      )
      |> Repo.all()
      |> Map.new()

    active =
      subs
      |> Enum.filter(&(&1["status"] == "ACTIVE"))
      |> Enum.reject(fn s -> MapSet.member?(admins, customer_to_user[s["customer_id"]]) end)

    monthly_cents =
      Enum.reduce(active, 0, fn s, acc ->
        acc + monthly_cents_for(s["plan_variation_id"], config)
      end)

    %{
      monthly_cents: monthly_cents,
      paying_members: active |> Enum.map(& &1["customer_id"]) |> Enum.uniq() |> length(),
      source: "square"
    }
  end

  defp monthly_cents_for(variation, config) do
    cond do
      variation == config[:plus_annual_plan_variation_id] and not is_nil(variation) ->
        div(Square.plus_annual_cents(), 12)

      variation == config[:donor_plan_variation_1] ->
        100

      variation == config[:donor_plan_variation_2] ->
        200

      variation == config[:donor_plan_variation_3] ->
        300

      true ->
        500
    end
  end

  # Database-only fallback: counts active Square subscribers at monthly prices.
  defp revenue_estimate(admins) do
    admin_ids = MapSet.to_list(admins)

    plus =
      from(u in User,
        where: not is_nil(u.square_subscription_id) and u.subscription_status == "active",
        where: is_nil(u.founding_member_number),
        where: u.id not in ^admin_ids,
        select: count(u.id)
      )
      |> Repo.one()

    donors =
      from(u in User,
        where: not is_nil(u.square_donor_subscription_id) and u.ink_donor_status == "active",
        where: u.id not in ^admin_ids,
        select: {count(u.id), sum(u.ink_donor_amount_cents)}
      )
      |> Repo.one()

    {donor_count, donor_cents} = donors

    %{
      monthly_cents: plus * 500 + (donor_cents || 0),
      paying_members: plus + donor_count,
      source: "estimate"
    }
  end
end
