defmodule Inkwell.Billing.Funnel do
  @moduledoc """
  Did the people who started a checkout end up subscribed?

  This exists because of 2026-09-22: Square's hosted checkout had been
  failing at the payment step for five months for every recurring plan, and
  nothing on our side could tell the difference between "the checkout is
  broken" and "nobody felt like paying". Six people tried. All six were
  turned away silently.

  A member counts as having completed if they now hold a Square subscription
  (Plus or donor) or are a Founding Member. It's deliberately generous: the
  point is to catch nobody-at-all, not to measure conversion.
  """

  import Ecto.Query

  alias Inkwell.{Repo, Slack}
  alias Inkwell.Accounts.User
  alias Inkwell.Billing.CheckoutAttempt

  # Enough attempts that "no completions" means something. Below this, silence
  # is just a quiet fortnight.
  @min_people 3
  @window_days 14

  def window_days, do: @window_days

  @doc "Record that we handed this user a checkout page."
  def record_attempt(%User{} = user, kind, plan_variation_id \\ nil) do
    %CheckoutAttempt{}
    |> CheckoutAttempt.changeset(%{
      user_id: user.id,
      kind: to_string(kind),
      plan_variation_id: plan_variation_id
    })
    |> Repo.insert()
    |> case do
      {:ok, attempt} ->
        {:ok, attempt}

      {:error, changeset} ->
        # Never let bookkeeping break a checkout.
        require Logger
        Logger.warning("[Billing] Could not record checkout attempt: #{inspect(changeset.errors)}")
        :error
    end
  end

  @doc """
  Summary of recurring-subscription checkouts over the last `days`:
  `%{people: n, attempts: n, completed: n, stalled: bool}`.
  """
  def summary(days \\ @window_days) do
    since = DateTime.add(DateTime.utc_now(), -days, :day)

    rows =
      from(a in CheckoutAttempt,
        where: a.inserted_at > ^since and a.kind in ^CheckoutAttempt.subscription_kinds(),
        select: {a.user_id, count(a.id)},
        group_by: a.user_id
      )
      |> Repo.all()

    user_ids = Enum.map(rows, &elem(&1, 0))
    attempts = rows |> Enum.map(&elem(&1, 1)) |> Enum.sum()

    completed =
      if user_ids == [] do
        0
      else
        from(u in User,
          where:
            u.id in ^user_ids and
              (not is_nil(u.square_subscription_id) or
                 not is_nil(u.square_donor_subscription_id) or
                 not is_nil(u.founding_member_number)),
          select: count(u.id)
        )
        |> Repo.one() || 0
      end

    people = length(user_ids)

    %{
      days: days,
      people: people,
      attempts: attempts,
      completed: completed,
      stalled: people >= @min_people and completed == 0
    }
  end

  @doc "Alert if people keep starting checkouts and none of them ever completes."
  def check_and_alert do
    case summary() do
      %{stalled: true, people: people} = summary ->
        Slack.notify_checkout_funnel_stalled(people, @window_days)
        {:alerted, summary}

      summary ->
        {:ok, summary}
    end
  end
end
