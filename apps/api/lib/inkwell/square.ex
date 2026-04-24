defmodule Inkwell.Square do
  @moduledoc """
  Square API client for Inkwell billing.
  Uses Payment Links for checkout (hosted pages, like Stripe Checkout).
  Uses Subscriptions API for cancellation.
  """

  alias Inkwell.Accounts.User

  require Logger

  @square_api "https://connect.squareup.com/v2"

  # ── Payment Links (Checkout) ──────────────────────────────────────────

  # Payment Link creators use Square `order` mode (not `quick_pay`) so we can
  # attach `customer_id` and `reference_id` to the underlying order. This is
  # our Stripe-parity equivalent of Stripe Checkout's `metadata` field: the
  # user identity is encoded into Square-native fields that survive the round
  # trip through checkout and into webhook payloads, so a buyer typing a
  # different email at checkout (or having no real email at all, as with
  # fediverse users) can't break attribution.
  #
  # Required inputs beyond the user:
  #   * customer_id — pre-created by Billing.ensure_square_customer/1 so the
  #     subscription is bound to a customer we control (tagged with
  #     reference_id = user.id).
  #
  # The `order.reference_id` is a belt-and-suspenders backup so even in the
  # rare case Square ignores our customer_id, the webhook handler can follow
  # subscription → invoice → order → reference_id to find the user.

  @doc "Create a Square Payment Link for Plus $5/mo subscription."
  def create_plus_payment_link(%User{} = user, customer_id) when is_binary(customer_id) do
    config = square_config()

    # Emergency override: if SQUARE_PLUS_PAYMENT_LINK_OVERRIDE is set, return
    # that URL directly without calling Square's API. Used as a band-aid when
    # the auto-generated Payment Link flow is broken — admin sets a manually-
    # created Square Payment Link URL via Fly secret, and Inkwell uses it for
    # all Plus signups until the override is unset. Loses customer_id binding
    # and per-user idempotency — any user who pays this way WILL need manual
    # subscription attachment. Safe to set/unset on the fly.
    case config[:plus_payment_link_override] do
      url when is_binary(url) and url != "" ->
        Logger.info("[Square Payment Link] Using PLUS override URL for user #{user.id}")
        {:ok, %{url: url}}

      _ ->
        create_plus_payment_link_via_api(user, customer_id, config)
    end
  end

  defp create_plus_payment_link_via_api(%User{} = user, customer_id, config) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")
    plan_variation_id = config[:plus_plan_variation_id]

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body =
        subscription_payment_link_body(
          idempotency_key: "plus-#{user.id}-#{div(System.system_time(:second), 3600)}",
          line_item_name: "Inkwell Plus",
          amount_cents: 500,
          user: user,
          customer_id: customer_id,
          plan_variation_id: plan_variation_id,
          redirect_url: "#{frontend_url}/settings/billing?checkout=success",
          config: config
        )

      post_payment_link(body, "plus", user.id)
    end
  end

  @doc "Create a Square Payment Link for Ink Donor subscription ($1/$2/$3/mo)."
  def create_donor_payment_link(%User{} = user, amount_cents, customer_id)
      when amount_cents in [100, 200, 300] and is_binary(customer_id) do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id =
      case amount_cents do
        100 -> config[:donor_plan_variation_1]
        200 -> config[:donor_plan_variation_2]
        300 -> config[:donor_plan_variation_3]
      end

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body =
        subscription_payment_link_body(
          idempotency_key:
            "donor-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
          line_item_name: "Ink Donor — $#{div(amount_cents, 100)}/mo",
          amount_cents: amount_cents,
          user: user,
          customer_id: customer_id,
          plan_variation_id: plan_variation_id,
          redirect_url: "#{frontend_url}/settings/billing?checkout=success&donor=true",
          config: config
        )

      post_payment_link(body, "donor-#{div(amount_cents, 100)}", user.id)
    end
  end

  @doc "Create a Square Payment Link for one-time donation."
  def create_donation_payment_link(%User{} = user, amount_cents, customer_id)
      when is_integer(amount_cents) and amount_cents >= 100 and is_binary(customer_id) do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    if is_nil(config[:location_id]) or config[:location_id] == "" do
      {:error, :square_not_configured}
    else
      body =
        one_off_payment_link_body(
          idempotency_key:
            "donation-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
          line_item_name: "Ink Donor — One-time",
          amount_cents: amount_cents,
          user: user,
          customer_id: customer_id,
          redirect_url: "#{frontend_url}/settings/billing?donation=success",
          config: config
        )

      post_payment_link(body, "donation-#{amount_cents}", user.id)
    end
  end

  @doc "Create a Square Payment Link for Plus during onboarding (redirects to /welcome)."
  def create_onboarding_payment_link(%User{} = user, "plus", customer_id)
      when is_binary(customer_id) do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id = config[:plus_plan_variation_id]

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body =
        subscription_payment_link_body(
          idempotency_key: "onboard-plus-#{user.id}-#{div(System.system_time(:second), 3600)}",
          line_item_name: "Inkwell Plus",
          amount_cents: 500,
          user: user,
          customer_id: customer_id,
          plan_variation_id: plan_variation_id,
          redirect_url: "#{frontend_url}/welcome?checkout=success&type=plus&step=5",
          config: config
        )

      post_payment_link(body, "onboard-plus", user.id)
    end
  end

  @doc "Create a Square Payment Link for Ink Donor during onboarding."
  def create_onboarding_payment_link(%User{} = user, "donor", amount_cents, customer_id)
      when amount_cents in [100, 200, 300] and is_binary(customer_id) do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id =
      case amount_cents do
        100 -> config[:donor_plan_variation_1]
        200 -> config[:donor_plan_variation_2]
        300 -> config[:donor_plan_variation_3]
      end

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body =
        subscription_payment_link_body(
          idempotency_key:
            "onboard-donor-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
          line_item_name: "Ink Donor — $#{div(amount_cents, 100)}/mo",
          amount_cents: amount_cents,
          user: user,
          customer_id: customer_id,
          plan_variation_id: plan_variation_id,
          redirect_url: "#{frontend_url}/welcome?checkout=success&type=donor&step=5",
          config: config
        )

      post_payment_link(body, "onboard-donor-#{div(amount_cents, 100)}", user.id)
    end
  end

  # Shared builder for recurring-subscription Payment Link bodies. Produces
  # an `order`-mode request with customer_id + reference_id on the order, so
  # the subscription Square creates is bound to a customer we control and
  # the order carries a fallback user identifier readable from webhooks.
  defp subscription_payment_link_body(opts) do
    user = Keyword.fetch!(opts, :user)
    customer_id = Keyword.fetch!(opts, :customer_id)
    plan_variation_id = Keyword.fetch!(opts, :plan_variation_id)
    config = Keyword.fetch!(opts, :config)

    %{
      "idempotency_key" => Keyword.fetch!(opts, :idempotency_key),
      "order" =>
        build_order(
          customer_id: customer_id,
          user_id: user.id,
          line_item_name: Keyword.fetch!(opts, :line_item_name),
          amount_cents: Keyword.fetch!(opts, :amount_cents),
          config: config
        ),
      "checkout_options" => %{
        "subscription_plan_id" => plan_variation_id,
        "redirect_url" => Keyword.fetch!(opts, :redirect_url),
        "accepted_payment_methods" => %{
          "apple_pay" => true,
          "google_pay" => true
        }
      },
      "pre_populated_data" => pre_populated_data_for(user)
    }
  end

  # Shared builder for one-off (non-subscription) Payment Link bodies.
  defp one_off_payment_link_body(opts) do
    user = Keyword.fetch!(opts, :user)
    customer_id = Keyword.fetch!(opts, :customer_id)
    config = Keyword.fetch!(opts, :config)

    %{
      "idempotency_key" => Keyword.fetch!(opts, :idempotency_key),
      "order" =>
        build_order(
          customer_id: customer_id,
          user_id: user.id,
          line_item_name: Keyword.fetch!(opts, :line_item_name),
          amount_cents: Keyword.fetch!(opts, :amount_cents),
          config: config
        ),
      "checkout_options" => %{
        "redirect_url" => Keyword.fetch!(opts, :redirect_url),
        "accepted_payment_methods" => %{
          "apple_pay" => true,
          "google_pay" => true
        }
      },
      "pre_populated_data" => pre_populated_data_for(user)
    }
  end

  defp build_order(opts) do
    config = Keyword.fetch!(opts, :config)

    # reference_id is the bare user UUID (36 chars). Square's Order.reference_id
    # has a 40-char limit, so we can't prefix with "inkwell_user_" here (would
    # be 49 chars). The webhook handler casts the raw string as a UUID —
    # same pattern used for Customer.reference_id.
    %{
      "location_id" => config[:location_id],
      "customer_id" => Keyword.fetch!(opts, :customer_id),
      "reference_id" => Keyword.fetch!(opts, :user_id),
      "line_items" => [
        %{
          "name" => Keyword.fetch!(opts, :line_item_name),
          "quantity" => "1",
          "base_price_money" => %{
            "amount" => Keyword.fetch!(opts, :amount_cents),
            "currency" => "USD"
          }
        }
      ]
    }
  end

  # Pre-populate buyer_email only if we have a real email. Fediverse users
  # have placeholder emails like user@domain.fediverse.inkwell.social that
  # aren't deliverable, so we skip pre-population for them rather than
  # show a fake address in Square's checkout form.
  defp pre_populated_data_for(%User{email: email}) do
    if fediverse_placeholder_email?(email) do
      %{}
    else
      %{"buyer_email" => email}
    end
  end

  defp fediverse_placeholder_email?(email) when is_binary(email) do
    String.ends_with?(email, ".fediverse.inkwell.social")
  end

  defp fediverse_placeholder_email?(_), do: false

  # Shared helper for all Payment Link creators. Logs the request body, the
  # response shape, and explicitly checks whether Square actually attached a
  # subscription. The "subscription_plan_id" field bug (2026-04-15) caused
  # Square to silently process Payment Links as one-time charges, returning
  # a successful URL with NO subscription attached. This logging makes that
  # state immediately visible going forward.
  defp post_payment_link(body, link_type, user_id) do
    Logger.info("[Square Payment Link] Creating #{link_type} link for user #{user_id}")

    case square_post("/online-checkout/payment-links", body) do
      {:ok, response} ->
        log_payment_link_response(response, link_type, user_id)
        extract_payment_link_url(response)

      {:error, reason} ->
        Logger.error("[Square Payment Link] #{link_type} create FAILED for user #{user_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp log_payment_link_response(response, link_type, user_id) do
    payment_link = Map.get(response, "payment_link", %{})
    related = Map.get(response, "related_resources", %{})
    order = Map.get(payment_link, "order_id") || Map.get(related, "orders", []) |> List.first()
    has_subscription_field = Map.has_key?(payment_link, "subscription_id")

    has_subscription_in_options =
      case Map.get(payment_link, "checkout_options") do
        %{"subscription_plan_id" => spid} when is_binary(spid) and spid != "" -> true
        _ -> false
      end

    looks_like_subscription = has_subscription_field or has_subscription_in_options

    Logger.info(
      "[Square Payment Link] #{link_type} response for user #{user_id}: " <>
        "id=#{Map.get(payment_link, "id", "?")}, " <>
        "url=#{Map.get(payment_link, "url", "?")}, " <>
        "has_subscription=#{looks_like_subscription}, " <>
        "order_id=#{inspect(order)}"
    )

    unless looks_like_subscription do
      Logger.warning(
        "[Square Payment Link] #{link_type} for user #{user_id} returned a Payment Link " <>
          "WITHOUT a subscription attached. This was the 2026-04-15 quick_pay bug. " <>
          "Verify SQUARE_PLUS_PLAN_VARIATION_ID secret matches a real plan variation in your Square catalog."
      )
    end

    Logger.debug("[Square Payment Link] Full response: #{inspect(response)}")
  end

  defp extract_payment_link_url(%{"payment_link" => %{"url" => url}}) when is_binary(url),
    do: {:ok, %{url: url}}

  defp extract_payment_link_url(%{"payment_link" => %{"long_url" => url}}) when is_binary(url),
    do: {:ok, %{url: url}}

  defp extract_payment_link_url(_), do: {:error, :no_url_in_response}

  # ── Subscription Management ───────────────────────────────────────────

  @doc "Cancel a Square subscription (at end of billing cycle)."
  def cancel_subscription(nil), do: :ok
  def cancel_subscription(subscription_id) do
    body = %{
      "action" => "CANCEL"
    }

    case square_post("/subscriptions/#{subscription_id}/actions/cancel", body) do
      {:ok, _} ->
        Logger.info("Canceled Square subscription #{subscription_id}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to cancel Square subscription #{subscription_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Get a Square subscription's status."
  def get_subscription(nil), do: {:error, :no_subscription}
  def get_subscription(subscription_id) do
    case square_get("/subscriptions/#{subscription_id}") do
      {:ok, %{"subscription" => sub}} -> {:ok, sub}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Fetch a Square customer by ID (used for email fallback lookup)."
  def get_customer(nil), do: {:error, :no_customer}
  def get_customer(customer_id) do
    case square_get("/customers/#{customer_id}") do
      {:ok, %{"customer" => customer}} -> {:ok, customer}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Create a Square customer. Accepts a plain map matching Square's CreateCustomer
  body (email_address, given_name, family_name, reference_id, note, etc.). All
  fields are optional — Square will generate a customer with whatever is provided.

  Idempotency is NOT enforced here (no `idempotency_key` by default). Callers
  that need idempotency should pass it in the attrs map. In practice this is
  called from Billing.ensure_square_customer/1 which pre-checks for an existing
  customer_id on the user, so double-creation is already avoided at that layer.
  """
  def create_customer(attrs) when is_map(attrs) do
    case square_post("/customers", attrs) do
      {:ok, %{"customer" => customer}} -> {:ok, customer}
      {:ok, other} -> {:error, {:unexpected_response, other}}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Fetch a Square invoice by ID. Used by the webhook fallback chain."
  def get_invoice(nil), do: {:error, :no_invoice}
  def get_invoice(invoice_id) when is_binary(invoice_id) do
    case square_get("/invoices/#{invoice_id}") do
      {:ok, %{"invoice" => invoice}} -> {:ok, invoice}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Fetch a Square order by ID. Used by the webhook fallback chain to recover
  the order's reference_id when the customer_id path fails.

  Uses BatchRetrieveOrders because the plain GET /orders/:id endpoint
  requires a location_id and isn't always available for subscription-generated
  orders — BatchRetrieveOrders takes just order_ids and works universally.
  """
  def get_order(nil), do: {:error, :no_order}
  def get_order(order_id) when is_binary(order_id) do
    body = %{"order_ids" => [order_id]}

    case square_post("/orders/batch-retrieve", body) do
      {:ok, %{"orders" => [order | _]}} -> {:ok, order}
      {:ok, _} -> {:error, :not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Search Square customers by email address.

  Uses `fuzzy` matching (case-insensitive, tolerant of small variations) because
  Square stores emails as the buyer typed them at checkout, while Inkwell
  normalizes to lowercase on signup. An `exact` filter misses anything with
  case differences, which hides real payments from the sync flow.

  Returns a list of matching customers (often multiple for the same email —
  Square creates new customer records on retries). Callers should check all
  returned customers, not just the first.
  """
  def search_customers_by_email(nil), do: {:ok, []}
  def search_customers_by_email(""), do: {:ok, []}
  def search_customers_by_email(email) when is_binary(email) do
    body = %{
      "query" => %{
        "filter" => %{
          "email_address" => %{"fuzzy" => email}
        }
      }
    }

    case square_post("/customers/search", body) do
      {:ok, %{"customers" => customers}} when is_list(customers) -> {:ok, customers}
      {:ok, _no_customers} -> {:ok, []}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  List every subscription for our location, paginating through the cursor.

  Returns `{:ok, [subscription, ...]}` with all subscriptions regardless of
  status (active, canceled, deactivated, paused). Used by the admin raw-Square
  view and as the fallback scan when email-based lookup fails.

  Capped at 500 subscriptions across 5 pages to bound API usage; realistic
  Inkwell scale is ~dozens, so this is effectively unlimited in practice.
  """
  def list_all_subscriptions(opts \\ []) do
    max_pages = Keyword.get(opts, :max_pages, 5)
    config = square_config()
    location_id = config[:location_id]

    if is_nil(location_id) or location_id == "" do
      {:error, :square_not_configured}
    else
      fetch_subscription_page(location_id, nil, [], 0, max_pages)
    end
  end

  defp fetch_subscription_page(_location_id, _cursor, acc, page, max_pages) when page >= max_pages do
    {:ok, Enum.reverse(acc)}
  end

  defp fetch_subscription_page(location_id, cursor, acc, page, max_pages) do
    body =
      %{
        "query" => %{
          "filter" => %{
            "location_ids" => [location_id]
          }
        },
        "limit" => 100
      }
      |> maybe_put_cursor(cursor)

    case square_post("/subscriptions/search", body) do
      {:ok, response} ->
        subs = Map.get(response, "subscriptions", []) |> List.wrap()
        next_cursor = Map.get(response, "cursor")
        new_acc = Enum.reverse(subs) ++ acc

        if is_nil(next_cursor) or next_cursor == "" do
          {:ok, Enum.reverse(new_acc)}
        else
          fetch_subscription_page(location_id, next_cursor, new_acc, page + 1, max_pages)
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp maybe_put_cursor(body, nil), do: body
  defp maybe_put_cursor(body, ""), do: body
  defp maybe_put_cursor(body, cursor), do: Map.put(body, "cursor", cursor)

  @doc """
  List recent Square payments (one-time charges, NOT subscriptions).

  Uses `GET /v2/payments` with date filter. Returns up to `:limit` payments
  (default 100) sorted by created_at descending. Filters to our location.

  Critical for diagnosing the 2026-04-15 quick_pay bug, where Plus signups
  silently became one-time payments instead of subscriptions. The admin can
  use this to find any user who paid via the broken Payment Link.
  """
  def list_recent_payments(opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    days = Keyword.get(opts, :days, 90)
    config = square_config()
    location_id = config[:location_id]

    if is_nil(location_id) or location_id == "" do
      {:error, :square_not_configured}
    else
      begin_time = DateTime.utc_now() |> DateTime.add(-days, :day) |> DateTime.to_iso8601()

      query =
        URI.encode_query(%{
          "begin_time" => begin_time,
          "sort_order" => "DESC",
          "location_id" => location_id,
          "limit" => limit
        })

      case square_get("/payments?#{query}") do
        {:ok, %{"payments" => payments}} when is_list(payments) -> {:ok, payments}
        {:ok, _} -> {:ok, []}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  @doc """
  Search Square subscriptions for a given customer ID.
  Returns a list of all subscriptions (active and inactive) for that customer.
  """
  def search_subscriptions_by_customer(nil), do: {:ok, []}
  def search_subscriptions_by_customer(customer_id) when is_binary(customer_id) do
    config = square_config()
    location_id = config[:location_id]

    body = %{
      "query" => %{
        "filter" => %{
          "customer_ids" => [customer_id],
          "location_ids" => [location_id]
        }
      }
    }

    case square_post("/subscriptions/search", body) do
      {:ok, %{"subscriptions" => subs}} when is_list(subs) -> {:ok, subs}
      {:ok, _no_subs} -> {:ok, []}
      {:error, reason} -> {:error, reason}
    end
  end

  # ── Webhook Verification ──────────────────────────────────────────────

  @doc """
  Verify a Square webhook signature.
  Square signs: HMAC-SHA256(signature_key, notification_url + raw_body)
  """
  def verify_webhook_signature(raw_body, signature_header, notification_url) do
    signature_key = square_config()[:webhook_signature_key]

    if is_nil(signature_key) or signature_key == "" do
      if Application.get_env(:inkwell, :env) == :prod do
        Logger.error("SQUARE_WEBHOOK_SIGNATURE_KEY not set in production — rejecting webhook")
        {:error, :webhook_secret_not_configured}
      else
        Logger.warning("SQUARE_WEBHOOK_SIGNATURE_KEY not set — accepting webhook without verification (dev only)")
        :ok
      end
    else
      combined = notification_url <> raw_body
      expected = :crypto.mac(:hmac, :sha256, signature_key, combined) |> Base.encode64()

      if Plug.Crypto.secure_compare(expected, signature_header) do
        :ok
      else
        {:error, :invalid_signature}
      end
    end
  end

  # ── Square Status Mapping ─────────────────────────────────────────────

  @doc "Map Square subscription status to Inkwell subscription_status."
  def map_subscription_status(square_status) do
    case square_status do
      "ACTIVE" -> "active"
      "CANCELED" -> "canceled"
      "DEACTIVATED" -> "canceled"
      "PAUSED" -> "past_due"
      "PENDING" -> "active"
      _ -> "none"
    end
  end

  # ── Private: HTTP helpers ─────────────────────────────────────────────

  defp square_post(path, body) do
    access_token = square_config()[:access_token]

    if is_nil(access_token) or access_token == "" do
      Logger.warning("SQUARE_ACCESS_TOKEN not set — cannot make Square API call to #{path}")
      {:error, :square_not_configured}
    else
      url = ~c"#{@square_api}#{path}"
      json_body = Jason.encode!(body)

      headers = [
        {~c"authorization", ~c"Bearer #{access_token}"},
        {~c"content-type", ~c"application/json"},
        {~c"square-version", ~c"2024-12-18"}
      ]

      :ssl.start()
      :inets.start()

      with_retry(path, fn ->
        :httpc.request(
          :post,
          {url, headers, ~c"application/json", json_body},
          [ssl: Inkwell.SSL.httpc_opts()],
          []
        )
      end)
    end
  end

  defp square_get(path) do
    access_token = square_config()[:access_token]

    if is_nil(access_token) or access_token == "" do
      Logger.warning("SQUARE_ACCESS_TOKEN not set — cannot make Square API call to #{path}")
      {:error, :square_not_configured}
    else
      url = ~c"#{@square_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{access_token}"},
        {~c"square-version", ~c"2024-12-18"}
      ]

      :ssl.start()
      :inets.start()

      with_retry(path, fn ->
        :httpc.request(
          :get,
          {url, headers},
          [ssl: Inkwell.SSL.httpc_opts()],
          []
        )
      end)
    end
  end

  # Retry a Square HTTP call on 429 (rate limited) with exponential backoff.
  # On 429: sleep 1000ms and retry. Second 429: sleep 2000ms and retry.
  # After 2 retries, return the 429 normally. Other status codes are NOT retried.
  defp with_retry(path, request_fn, attempt \\ 0) do
    case request_fn.() do
      {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
        case Jason.decode(to_string(resp_body)) do
          {:ok, data} -> {:ok, data}
          error -> {:error, {:parse_error, error}}
        end

      {:ok, {{_, 429, _}, _headers, _resp_body}} when attempt < 2 ->
        delay = (attempt + 1) * 1000
        Logger.warning("Square API 429 on #{path}, retrying in #{delay}ms (attempt #{attempt + 1}/2)")
        Process.sleep(delay)
        with_retry(path, request_fn, attempt + 1)

      {:ok, {{_, status, _}, _headers, resp_body}} ->
        Logger.error("Square API error #{status} on #{path}: #{to_string(resp_body)}")
        {:error, {:square_error, status, to_string(resp_body)}}

      {:error, reason} ->
        Logger.error("Square HTTP error on #{path}: #{inspect(reason)}")
        {:error, :http_error}
    end
  end

  defp square_config do
    Application.get_env(:inkwell, :square, [])
  end
end
