defmodule Inkwell.Billing.Founding do
  @moduledoc """
  Founding Members: a limited, numbered, one-time purchase of Plus for as long
  as Inkwell runs.

  Flow:
    1. `create_checkout_session/2` makes a one-off Square Payment Link whose
       single line item is named `Square.founding_line_item_name/0`, with
       order.reference_id = user.id.
    2. Square's `payment.updated` webhook reaches `Billing.handle_webhook_event/1`,
       which calls `handle_completed_payment/3` for COMPLETED payments whose
       order carries that line item.
    3. `sync_from_square/1` runs the same grant from recent payments when the
       buyer lands back on the billing page, so a late or missing webhook
       can't leave someone who paid without their membership.

  Granting is idempotent on the Square payment id, and the user schema's
  `subscription_changeset/2` refuses to downgrade a founding member from any
  other code path.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Repo
  alias Inkwell.Square

  import Ecto.Query

  require Logger

  @cap 50

  def cap, do: @cap
  def price_cents, do: Square.founding_member_cents()

  @doc "Number of founding memberships sold so far."
  def count do
    from(u in User, where: not is_nil(u.founding_member_number), select: count(u.id))
    |> Repo.one()
  end

  def remaining, do: max(@cap - count(), 0)
  def sold_out?, do: remaining() == 0

  @doc "Status map for the UI and the transparency page."
  def status do
    sold = count()

    %{
      cap: @cap,
      sold: sold,
      remaining: max(@cap - sold, 0),
      price_cents: price_cents(),
      raised_cents: sold * price_cents()
    }
  end

  @doc """
  Start checkout. Refuses if the user is already a founding member or the
  batch is sold out. `return_to` is `:billing` or `:onboarding`.
  """
  def create_checkout_session(%User{} = user, return_to \\ :billing) do
    cond do
      User.founding_member?(user) ->
        {:error, :already_founding_member}

      sold_out?() ->
        {:error, :founding_sold_out}

      true ->
        case Inkwell.Billing.ensure_square_customer(user) do
          {:ok, customer_id, user} ->
            Square.create_founding_member_payment_link(user, customer_id, return_to)

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  @doc "True if a Square order is a founding membership purchase."
  def founding_order?(%{"line_items" => [%{"name" => name} | _]}) when is_binary(name),
    do: name == Square.founding_line_item_name()

  def founding_order?(_), do: false

  @doc """
  Grant a founding membership for a completed Square payment. Idempotent:
  a payment id that has already been granted returns the existing member.

  Always honours a real payment, even if it lands after the cap was reached
  by a concurrent buyer — nobody who paid is turned away.
  """
  def grant(%User{} = user, payment_id) when is_binary(payment_id) do
    cond do
      granted_user = Repo.get_by(User, founding_member_payment_id: payment_id) ->
        {:ok, granted_user, :already_granted}

      User.founding_member?(user) ->
        # Paid twice (e.g. two tabs). Keep the first number; surface it so
        # the admin can refund the duplicate.
        Logger.error(
          "[Founding] @#{user.username} already founding member ##{user.founding_member_number} " <>
            "but paid again (payment #{payment_id}) — refund the duplicate in Square"
        )

        Inkwell.Slack.notify(
          ":warning: *Duplicate Founding Member payment* from @#{user.username} " <>
            "(already ##{user.founding_member_number}). Refund payment `#{payment_id}` in Square."
        )

        {:ok, user, :duplicate_payment}

      true ->
        do_grant(user, payment_id, 3)
    end
  end

  defp do_grant(user, payment_id, attempts_left) do
    next_number =
      (from(u in User, select: max(u.founding_member_number)) |> Repo.one() || 0) + 1

    result =
      user
      |> User.founding_member_changeset(%{
        founding_member_number: next_number,
        founding_member_at: DateTime.utc_now(),
        founding_member_payment_id: payment_id
      })
      |> Repo.update()

    case result do
      {:ok, updated} ->
        Logger.info("[Founding] Granted founding member ##{next_number} to @#{updated.username}")
        Inkwell.Slack.notify(
          ":tada: *New Founding Member ##{next_number}*: @#{updated.username} ($99)"
        )

        cancel_monthly_plus(updated)
        {:ok, updated, :granted}

      {:error, %Ecto.Changeset{errors: errors} = cs} when attempts_left > 1 ->
        if Keyword.has_key?(errors, :founding_member_number) do
          # Another purchase took this number at the same moment. Try the next.
          do_grant(user, payment_id, attempts_left - 1)
        else
          {:error, cs}
        end

      {:error, cs} ->
        Logger.error("[Founding] Failed to grant @#{user.username}: #{inspect(cs.errors)}")
        {:error, cs}
    end
  end

  # A founding member no longer needs their monthly/yearly Plus subscription.
  # Cancel it so they aren't charged twice. Failures alert the admin.
  defp cancel_monthly_plus(%User{square_subscription_id: nil}), do: :ok

  defp cancel_monthly_plus(%User{square_subscription_id: sub_id} = user) do
    case Square.cancel_subscription(sub_id) do
      :ok ->
        user |> User.subscription_changeset(%{square_subscription_id: nil}) |> Repo.update()
        Logger.info("[Founding] Canceled Plus subscription #{sub_id} for @#{user.username}")
        :ok

      {:error, reason} ->
        Logger.error(
          "[Founding] Could not cancel Plus subscription #{sub_id} for @#{user.username}: " <>
            inspect(reason)
        )

        Inkwell.Slack.notify_cancel_failed(user.username, "Plus (now Founding Member)", sub_id)
        :ok
    end
  rescue
    e ->
      Logger.error("[Founding] Exception canceling Plus for @#{user.username}: #{Exception.message(e)}")
      :ok
  end

  @doc """
  Called by the payment webhook for a COMPLETED payment whose order is a
  founding purchase.
  """
  def handle_completed_payment(payment_id, nil, customer_id) do
    Logger.error(
      "[Founding] Founding payment #{payment_id} but no Inkwell user resolved " <>
        "(customer #{inspect(customer_id)})"
    )

    Inkwell.Slack.notify(
      ":rotating_light: *Unmatched Founding Member payment* `#{payment_id}` " <>
        "(customer `#{customer_id}`). Someone paid $99 and needs their membership granted manually."
    )

    :ok
  end

  def handle_completed_payment(payment_id, %User{} = user, _customer_id) do
    case grant(user, payment_id) do
      {:ok, _, _} -> :ok
      {:error, _} -> {:error, :founding_grant_failed}
    end
  end

  @doc """
  Look for a completed founding purchase in the user's recent Square payments
  and grant it if the webhook hasn't. Safe to call repeatedly.
  """
  def sync_from_square(%User{} = user) do
    cond do
      User.founding_member?(user) ->
        {:ok, user, []}

      is_nil(user.square_customer_id) ->
        {:ok, user, []}

      true ->
        with {:ok, payments} <- Square.list_recent_payments(days: 7, limit: 100) do
          payments
          |> Enum.filter(fn p ->
            p["customer_id"] == user.square_customer_id and p["status"] == "COMPLETED" and
              get_in(p, ["amount_money", "amount"]) == price_cents()
          end)
          |> Enum.find_value({:ok, user, []}, fn p ->
            with {:ok, order} <- Square.get_order(p["order_id"]),
                 true <- founding_order?(order),
                 true <- order["reference_id"] in [nil, user.id],
                 {:ok, updated, _} <- grant(user, p["id"]) do
              {:ok, updated, [:founding_granted]}
            else
              _ -> nil
            end
          end)
        end
    end
  end
end
