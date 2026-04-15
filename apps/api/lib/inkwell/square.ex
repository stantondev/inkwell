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

  @doc "Create a Square Payment Link for Plus $5/mo subscription."
  def create_plus_payment_link(%User{} = user) do
    config = square_config()

    # Emergency override: if SQUARE_PLUS_PAYMENT_LINK_OVERRIDE is set, return
    # that URL directly without calling Square's API. Used as a band-aid when
    # the auto-generated Payment Link flow is broken — admin sets a manually-
    # created Square Payment Link URL via Fly secret, and Inkwell uses it for
    # all Plus signups until the override is unset. Loses email pre-population
    # and per-user idempotency, but is safe to set/unset on the fly.
    case config[:plus_payment_link_override] do
      url when is_binary(url) and url != "" ->
        Logger.info("[Square Payment Link] Using PLUS override URL for user #{user.id}")
        {:ok, %{url: url}}

      _ ->
        create_plus_payment_link_via_api(user, config)
    end
  end

  defp create_plus_payment_link_via_api(%User{} = user, config) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")
    plan_variation_id = config[:plus_plan_variation_id]

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body = %{
        "idempotency_key" => "plus-#{user.id}-#{div(System.system_time(:second), 3600)}",
        "quick_pay" => %{
          "name" => "Inkwell Plus",
          "price_money" => %{"amount" => 500, "currency" => "USD"},
          "location_id" => config[:location_id]
        },
        "checkout_options" => %{
          "subscription_plan_id" => plan_variation_id,
          "redirect_url" => "#{frontend_url}/settings/billing?checkout=success",
          "accepted_payment_methods" => %{
            "apple_pay" => true,
            "google_pay" => true
          }
        },
        "pre_populated_data" => %{
          "buyer_email" => user.email
        }
      }

      post_payment_link(body, "plus", user.id)
    end
  end

  @doc "Create a Square Payment Link for Ink Donor subscription ($1/$2/$3/mo)."
  def create_donor_payment_link(%User{} = user, amount_cents) when amount_cents in [100, 200, 300] do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id = case amount_cents do
      100 -> config[:donor_plan_variation_1]
      200 -> config[:donor_plan_variation_2]
      300 -> config[:donor_plan_variation_3]
    end

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body = %{
        "idempotency_key" => "donor-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
        "quick_pay" => %{
          "name" => "Ink Donor — $#{div(amount_cents, 100)}/mo",
          "price_money" => %{"amount" => amount_cents, "currency" => "USD"},
          "location_id" => config[:location_id]
        },
        "checkout_options" => %{
          "subscription_plan_id" => plan_variation_id,
          "redirect_url" => "#{frontend_url}/settings/billing?checkout=success&donor=true",
          "accepted_payment_methods" => %{
            "apple_pay" => true,
            "google_pay" => true
          }
        },
        "pre_populated_data" => %{
          "buyer_email" => user.email
        }
      }

      post_payment_link(body, "donor-#{div(amount_cents, 100)}", user.id)
    end
  end

  @doc "Create a Square Payment Link for one-time donation."
  def create_donation_payment_link(%User{} = user, amount_cents) when is_integer(amount_cents) and amount_cents >= 100 do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    if is_nil(config[:location_id]) or config[:location_id] == "" do
      {:error, :square_not_configured}
    else
      body = %{
        "idempotency_key" => "donation-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
        "quick_pay" => %{
          "name" => "Ink Donor — One-time",
          "price_money" => %{"amount" => amount_cents, "currency" => "USD"},
          "location_id" => config[:location_id]
        },
        "checkout_options" => %{
          "redirect_url" => "#{frontend_url}/settings/billing?donation=success",
          "accepted_payment_methods" => %{
            "apple_pay" => true,
            "google_pay" => true
          }
        },
        "pre_populated_data" => %{
          "buyer_email" => user.email
        }
      }

      post_payment_link(body, "donation-#{amount_cents}", user.id)
    end
  end

  @doc "Create a Square Payment Link for Plus during onboarding (redirects to /welcome)."
  def create_onboarding_payment_link(%User{} = user, "plus") do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id = config[:plus_plan_variation_id]

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body = %{
        "idempotency_key" => "onboard-plus-#{user.id}-#{div(System.system_time(:second), 3600)}",
        "quick_pay" => %{
          "name" => "Inkwell Plus",
          "price_money" => %{"amount" => 500, "currency" => "USD"},
          "location_id" => config[:location_id]
        },
        "checkout_options" => %{
          "subscription_plan_id" => plan_variation_id,
          "redirect_url" => "#{frontend_url}/welcome?checkout=success&type=plus&step=5",
          "accepted_payment_methods" => %{
            "apple_pay" => true,
            "google_pay" => true
          }
        },
        "pre_populated_data" => %{
          "buyer_email" => user.email
        }
      }

      post_payment_link(body, "onboard-plus", user.id)
    end
  end

  @doc "Create a Square Payment Link for Ink Donor during onboarding."
  def create_onboarding_payment_link(%User{} = user, "donor", amount_cents) when amount_cents in [100, 200, 300] do
    config = square_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    plan_variation_id = case amount_cents do
      100 -> config[:donor_plan_variation_1]
      200 -> config[:donor_plan_variation_2]
      300 -> config[:donor_plan_variation_3]
    end

    if is_nil(plan_variation_id) or plan_variation_id == "" do
      {:error, :square_not_configured}
    else
      body = %{
        "idempotency_key" => "onboard-donor-#{user.id}-#{amount_cents}-#{div(System.system_time(:second), 3600)}",
        "quick_pay" => %{
          "name" => "Ink Donor — $#{div(amount_cents, 100)}/mo",
          "price_money" => %{"amount" => amount_cents, "currency" => "USD"},
          "location_id" => config[:location_id]
        },
        "checkout_options" => %{
          "subscription_plan_id" => plan_variation_id,
          "redirect_url" => "#{frontend_url}/welcome?checkout=success&type=donor&step=5",
          "accepted_payment_methods" => %{
            "apple_pay" => true,
            "google_pay" => true
          }
        },
        "pre_populated_data" => %{
          "buyer_email" => user.email
        }
      }

      post_payment_link(body, "onboard-donor-#{div(amount_cents, 100)}", user.id)
    end
  end

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
