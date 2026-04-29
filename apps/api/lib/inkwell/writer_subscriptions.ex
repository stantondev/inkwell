defmodule Inkwell.WriterSubscriptions do
  @moduledoc """
  Writer subscription plans — recurring reader subscriptions with Stripe Connect.
  Writers create a monthly plan, readers subscribe via Stripe Checkout.
  Inkwell takes 8% commission (same as Postage).
  Uses the same raw :httpc Stripe pattern as Tipping and Billing modules.
  """

  alias Inkwell.Accounts.{User, Notification}
  alias Inkwell.WriterSubscriptions.{WriterPlan, PlanSubscription}
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  # Writer Subscriptions are PAUSED. They require Stripe Connect for
  # marketplace split-payments, and the Stripe account was closed.
  # See CLAUDE.md "Writer Subscription Plans (Temporarily Paused)".
  #
  # While paused, the read functions short-circuit to empty/false/nil so they
  # don't run DB queries on every /api/auth/me poll, profile load, or feed
  # render. Each of these endpoints called `has_active_plan?` or
  # `get_active_plan_for_writer` per request, even though the result is
  # guaranteed nil while paused.
  #
  # When Stripe access returns, set @paused to false and the original
  # implementations below will run.
  @paused true

  @commission_percent 8
  @stripe_api "https://api.stripe.com/v1"

  # ── Plan Management ──────────────────────────────────────────────────

  @doc "Create a subscription plan for a writer. Requires Plus + Connect enabled + no existing active plan."
  def create_plan(%User{} = writer, attrs) do
    cond do
      writer.subscription_tier != "plus" ->
        {:error, :requires_plus}

      !writer.stripe_connect_enabled ->
        {:error, :requires_connect}

      has_active_plan?(writer.id) ->
        {:error, :plan_already_exists}

      true ->
        name = attrs["name"] || attrs[:name]
        description = attrs["description"] || attrs[:description]
        price_cents = attrs["price_cents"] || attrs[:price_cents]

        # Create Stripe Product on the writer's connected account
        product_params =
          URI.encode_query(%{
            "name" => name,
            "metadata[writer_id]" => writer.id,
            "metadata[type]" => "writer_plan"
          })

        case stripe_post("/products", product_params, writer.stripe_connect_account_id) do
          {:ok, %{"id" => product_id}} ->
            # Create recurring Price on the writer's connected account
            price_params =
              URI.encode_query(%{
                "product" => product_id,
                "unit_amount" => price_cents,
                "currency" => "usd",
                "recurring[interval]" => "month"
              })

            case stripe_post("/prices", price_params, writer.stripe_connect_account_id) do
              {:ok, %{"id" => price_id}} ->
                plan_attrs = %{
                  writer_id: writer.id,
                  name: name,
                  description: description,
                  price_cents: price_cents,
                  stripe_product_id: product_id,
                  stripe_price_id: price_id,
                  status: "active"
                }

                %WriterPlan{}
                |> WriterPlan.changeset(plan_attrs)
                |> Repo.insert()

              {:error, reason} ->
                Logger.error("Failed to create Stripe Price for #{writer.username}: #{inspect(reason)}")
                {:error, reason}
            end

          {:error, reason} ->
            Logger.error("Failed to create Stripe Product for #{writer.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Archive a plan. Existing subscribers continue; no new subscriptions."
  def archive_plan(%User{} = writer, plan_id) do
    case Repo.get(WriterPlan, plan_id) do
      nil ->
        {:error, :not_found}

      %WriterPlan{writer_id: wid} when wid != writer.id ->
        {:error, :not_owner}

      %WriterPlan{status: "archived"} ->
        {:error, :already_archived}

      plan ->
        plan
        |> WriterPlan.update_changeset(%{status: "archived"})
        |> Repo.update()
    end
  end

  @doc "Update plan name/description (not price — archive and create new to change price)."
  def update_plan(%User{} = writer, plan_id, attrs) do
    case Repo.get(WriterPlan, plan_id) do
      nil ->
        {:error, :not_found}

      %WriterPlan{writer_id: wid} when wid != writer.id ->
        {:error, :not_owner}

      plan ->
        plan
        |> WriterPlan.update_changeset(attrs)
        |> Repo.update()
    end
  end

  def get_plan(id), do: Repo.get(WriterPlan, id)

  def get_active_plan_for_writer(writer_id) do
    if @paused do
      nil
    else
      WriterPlan
      |> where([p], p.writer_id == ^writer_id and p.status == "active")
      |> limit(1)
      |> Repo.one()
    end
  end

  @doc "Get any plan for a writer (active preferred, falls back to most recent archived)."
  def get_plan_by_writer(writer_id) do
    WriterPlan
    |> where([p], p.writer_id == ^writer_id)
    |> order_by([p], fragment("CASE WHEN ? = 'active' THEN 0 ELSE 1 END", p.status))
    |> order_by([p], desc: p.inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  def has_active_plan?(writer_id) do
    if @paused do
      false
    else
      WriterPlan
      |> where([p], p.writer_id == ^writer_id and p.status == "active")
      |> Repo.exists?()
    end
  end

  # ── Subscription Management ──────────────────────────────────────────

  @doc """
  Create a Stripe Checkout session for a reader to subscribe to a writer's plan.
  Uses destination charges with application_fee_percent for recurring billing.
  """
  def create_checkout_session(%User{} = subscriber, plan_id) do
    case Repo.get(WriterPlan, plan_id) do
      nil ->
        {:error, :plan_not_found}

      %WriterPlan{status: "archived"} ->
        {:error, :plan_archived}

      plan ->
        writer = Repo.get!(User, plan.writer_id)

        cond do
          subscriber.id == writer.id ->
            {:error, :cannot_subscribe_self}

          is_subscribed?(subscriber.id, writer.id) ->
            {:error, :already_subscribed}

          !writer.stripe_connect_account_id ->
            {:error, :writer_not_connected}

          true ->
            # Ensure subscriber has a Stripe customer ID
            case ensure_customer(subscriber) do
              {:ok, customer_id} ->
                frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

                params =
                  URI.encode_query(%{
                    "mode" => "subscription",
                    "customer" => customer_id,
                    "line_items[0][price]" => plan.stripe_price_id,
                    "line_items[0][quantity]" => "1",
                    "subscription_data[application_fee_percent]" => @commission_percent,
                    "subscription_data[transfer_data][destination]" => writer.stripe_connect_account_id,
                    "success_url" => "#{frontend_url}/#{writer.username}?subscribed=true",
                    "cancel_url" => "#{frontend_url}/#{writer.username}",
                    "client_reference_id" => subscriber.id,
                    "metadata[type]" => "writer_plan",
                    "metadata[subscriber_id]" => subscriber.id,
                    "metadata[writer_id]" => writer.id,
                    "metadata[plan_id]" => plan.id
                  })

                case stripe_post("/checkout/sessions", params) do
                  {:ok, %{"url" => url, "id" => session_id}} ->
                    {:ok, %{url: url, session_id: session_id}}

                  {:error, reason} ->
                    Logger.error("Failed to create checkout session: #{inspect(reason)}")
                    {:error, reason}
                end

              {:error, reason} ->
                {:error, reason}
            end
        end
    end
  end

  @doc "Cancel a reader's subscription to a writer."
  def cancel_subscription(%User{} = subscriber, writer_id) do
    case get_active_subscription(subscriber.id, writer_id) do
      nil ->
        {:error, :not_subscribed}

      sub ->
        # Cancel via Stripe API
        if sub.stripe_subscription_id do
          case stripe_delete("/subscriptions/#{sub.stripe_subscription_id}") do
            {:ok, _} -> :ok
            {:error, reason} ->
              Logger.warning("Failed to cancel Stripe subscription #{sub.stripe_subscription_id}: #{inspect(reason)}")
          end
        end

        # Update local record
        sub
        |> PlanSubscription.changeset(%{status: "canceled", canceled_at: DateTime.utc_now()})
        |> Repo.update()

        # Decrement subscriber count
        decrement_subscriber_count(sub.plan_id)

        {:ok, :canceled}
    end
  end

  @doc "Check if a subscriber has an active subscription to a writer."
  def is_subscribed?(subscriber_id, writer_id) do
    if @paused do
      false
    else
      PlanSubscription
      |> where([s], s.subscriber_id == ^subscriber_id and s.writer_id == ^writer_id and s.status == "active")
      |> Repo.exists?()
    end
  end

  @doc "Get list of writer IDs the subscriber has active subscriptions to."
  def get_subscribed_writer_ids(subscriber_id) do
    if @paused do
      []
    else
      PlanSubscription
      |> where([s], s.subscriber_id == ^subscriber_id and s.status == "active")
      |> select([s], s.writer_id)
      |> Repo.all()
    end
  end

  @doc "Get list of subscriber IDs for a writer's active plan."
  def get_subscriber_ids_for_writer(writer_id) do
    PlanSubscription
    |> where([s], s.writer_id == ^writer_id and s.status == "active")
    |> select([s], s.subscriber_id)
    |> Repo.all()
  end

  @doc "List subscribers for a writer, paginated."
  def list_subscribers(writer_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)

    PlanSubscription
    |> where([s], s.writer_id == ^writer_id and s.status == "active")
    |> order_by([s], desc: s.inserted_at)
    |> limit(^limit)
    |> offset(^offset)
    |> preload(:subscriber)
    |> Repo.all()
  end

  @doc "Get subscription stats for a writer."
  def get_stats(writer_id) do
    plan = get_active_plan_for_writer(writer_id)

    active_count =
      PlanSubscription
      |> where([s], s.writer_id == ^writer_id and s.status == "active")
      |> Repo.aggregate(:count, :id)

    total_earned =
      if plan, do: plan.total_earned_cents, else: 0

    mrr_cents =
      if plan, do: active_count * plan.price_cents, else: 0

    %{
      active_subscribers: active_count,
      mrr_cents: mrr_cents,
      total_earned_cents: total_earned
    }
  end

  @doc "Check subscription status between subscriber and writer."
  def check_subscription(subscriber_id, writer_id) do
    sub =
      PlanSubscription
      |> where([s], s.subscriber_id == ^subscriber_id and s.writer_id == ^writer_id)
      |> order_by([s], desc: s.inserted_at)
      |> limit(1)
      |> Repo.one()

    case sub do
      nil -> %{subscribed: false}
      %{status: "active"} -> %{subscribed: true, status: "active", since: sub.inserted_at}
      %{status: status} -> %{subscribed: false, status: status}
    end
  end

  # ── Webhook Handlers ──────────────────────────────────────────────────

  @doc "Handle checkout.session.completed for writer_plan subscriptions."
  def handle_checkout_completed(object) do
    subscriber_id = get_in(object, ["metadata", "subscriber_id"])
    writer_id = get_in(object, ["metadata", "writer_id"])
    plan_id = get_in(object, ["metadata", "plan_id"])
    stripe_sub_id = object["subscription"]

    with subscriber when not is_nil(subscriber) <- Repo.get(User, subscriber_id),
         writer when not is_nil(writer) <- Repo.get(User, writer_id),
         plan when not is_nil(plan) <- Repo.get(WriterPlan, plan_id) do

      # Create or update subscription record
      sub_attrs = %{
        plan_id: plan.id,
        subscriber_id: subscriber.id,
        writer_id: writer.id,
        stripe_subscription_id: stripe_sub_id,
        status: "active"
      }

      case PlanSubscription
           |> where([s], s.subscriber_id == ^subscriber.id and s.writer_id == ^writer.id)
           |> Repo.one() do
        nil ->
          %PlanSubscription{}
          |> PlanSubscription.changeset(sub_attrs)
          |> Repo.insert()

        existing ->
          existing
          |> PlanSubscription.changeset(sub_attrs)
          |> Repo.update()
      end

      # Increment subscriber count + total earned
      increment_subscriber_count(plan.id)
      increment_total_earned(plan.id, plan.price_cents)

      # Create notification
      Inkwell.Accounts.create_notification(%{
        type: :writer_plan_subscribe,
        user_id: writer.id,
        actor_id: subscriber.id,
        target_id: plan.id,
        data: %{
          "amount_cents" => plan.price_cents,
          "plan_name" => plan.name
        }
      })

      Logger.info("#{subscriber.username} subscribed to #{writer.username}'s plan (#{plan.name}, $#{plan.price_cents / 100}/mo)")
      Inkwell.Slack.notify_writer_plan_subscription(writer.username, subscriber.username, plan.price_cents)

      :ok
    else
      nil ->
        Logger.error("writer_plan checkout completed but couldn't find user/plan records")
        :error
    end
  end

  @doc "Handle customer.subscription.updated for writer plan subscriptions."
  def handle_subscription_updated(stripe_sub_id, status, period_end) do
    case get_subscription_by_stripe_id(stripe_sub_id) do
      nil ->
        nil

      sub ->
        attrs = %{status: normalize_status(status)}
        attrs = if period_end, do: Map.put(attrs, :current_period_end, parse_timestamp(period_end)), else: attrs

        sub
        |> PlanSubscription.changeset(attrs)
        |> Repo.update()

        :ok
    end
  end

  @doc "Handle customer.subscription.deleted for writer plan subscriptions."
  def handle_subscription_deleted(stripe_sub_id) do
    case get_subscription_by_stripe_id(stripe_sub_id) do
      nil ->
        nil

      sub ->
        sub
        |> PlanSubscription.changeset(%{status: "canceled", canceled_at: DateTime.utc_now()})
        |> Repo.update()

        decrement_subscriber_count(sub.plan_id)

        Logger.info("Writer plan subscription canceled: #{stripe_sub_id}")
        :ok
    end
  end

  @doc "Look up a subscription by its Stripe subscription ID."
  def get_subscription_by_stripe_id(stripe_sub_id) do
    PlanSubscription
    |> where([s], s.stripe_subscription_id == ^stripe_sub_id)
    |> Repo.one()
  end

  # ── Account Deletion Helpers ──────────────────────────────────────────

  @doc "Cancel all Stripe subscriptions where user is the writer (plan owner)."
  def cancel_all_for_writer(writer_id) do
    subs =
      PlanSubscription
      |> where([s], s.writer_id == ^writer_id and s.status == "active")
      |> Repo.all()

    Enum.each(subs, fn sub ->
      if sub.stripe_subscription_id do
        case stripe_delete("/subscriptions/#{sub.stripe_subscription_id}") do
          {:ok, _} -> :ok
          {:error, reason} ->
            Logger.warning("Failed to cancel writer plan sub #{sub.stripe_subscription_id}: #{inspect(reason)}")
        end
      end
    end)

    :ok
  end

  @doc "Cancel all Stripe subscriptions where user is a subscriber."
  def cancel_all_for_subscriber(subscriber_id) do
    subs =
      PlanSubscription
      |> where([s], s.subscriber_id == ^subscriber_id and s.status == "active")
      |> Repo.all()

    Enum.each(subs, fn sub ->
      if sub.stripe_subscription_id do
        case stripe_delete("/subscriptions/#{sub.stripe_subscription_id}") do
          {:ok, _} -> :ok
          {:error, reason} ->
            Logger.warning("Failed to cancel subscriber plan sub #{sub.stripe_subscription_id}: #{inspect(reason)}")
        end
      end
    end)

    :ok
  end

  # ── Private: Counter Helpers ──────────────────────────────────────────

  defp increment_subscriber_count(plan_id) do
    from(p in WriterPlan, where: p.id == ^plan_id)
    |> Repo.update_all(inc: [subscriber_count: 1])
  end

  defp decrement_subscriber_count(plan_id) do
    from(p in WriterPlan, where: p.id == ^plan_id and p.subscriber_count > 0)
    |> Repo.update_all(inc: [subscriber_count: -1])
  end

  defp increment_total_earned(plan_id, amount_cents) do
    from(p in WriterPlan, where: p.id == ^plan_id)
    |> Repo.update_all(inc: [total_earned_cents: amount_cents])
  end

  defp get_active_subscription(subscriber_id, writer_id) do
    PlanSubscription
    |> where([s], s.subscriber_id == ^subscriber_id and s.writer_id == ^writer_id and s.status == "active")
    |> Repo.one()
  end

  defp normalize_status("active"), do: "active"
  defp normalize_status("past_due"), do: "past_due"
  defp normalize_status("canceled"), do: "canceled"
  defp normalize_status("unpaid"), do: "expired"
  defp normalize_status("incomplete_expired"), do: "expired"
  defp normalize_status(_), do: "canceled"

  defp parse_timestamp(ts) when is_integer(ts) do
    DateTime.from_unix!(ts)
  end

  defp parse_timestamp(_), do: nil

  # ── Private: Stripe Customer ──────────────────────────────────────────

  defp ensure_customer(%User{stripe_customer_id: cid} = _user) when is_binary(cid) and cid != "" do
    {:ok, cid}
  end

  defp ensure_customer(%User{} = user) do
    params =
      URI.encode_query(%{
        "email" => user.email,
        "name" => user.display_name || user.username,
        "metadata[user_id]" => user.id,
        "metadata[username]" => user.username
      })

    case stripe_post("/customers", params) do
      {:ok, %{"id" => customer_id}} ->
        user
        |> User.subscription_changeset(%{stripe_customer_id: customer_id})
        |> Repo.update()

        {:ok, customer_id}

      {:error, reason} ->
        Logger.error("Failed to create Stripe customer for #{user.username}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ── Private: Stripe API helpers ──────────────────────────────────────

  defp stripe_post(path, body, connected_account_id \\ nil) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"},
        {~c"content-type", ~c"application/x-www-form-urlencoded"}
      ]

      headers =
        if connected_account_id do
          headers ++ [{~c"stripe-account", ~c"#{connected_account_id}"}]
        else
          headers
        end

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {url, headers, ~c"application/x-www-form-urlencoded", body},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(:erlang.list_to_binary(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on #{path}: #{:erlang.list_to_binary(resp_body)}")
          {:error, {:stripe_error, status, :erlang.list_to_binary(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_get(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :get,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(:erlang.list_to_binary(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on GET #{path}: #{:erlang.list_to_binary(resp_body)}")
          {:error, {:stripe_error, status, :erlang.list_to_binary(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on GET #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_delete(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :delete,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(:erlang.list_to_binary(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on DELETE #{path}: #{:erlang.list_to_binary(resp_body)}")
          {:error, {:stripe_error, status, :erlang.list_to_binary(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on DELETE #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_config do
    Application.get_env(:inkwell, :stripe, [])
  end
end
