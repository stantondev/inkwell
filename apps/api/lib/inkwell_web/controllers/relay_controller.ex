defmodule InkwellWeb.RelayController do
  use InkwellWeb, :controller

  alias Inkwell.Federation.Relays

  require Logger

  # GET /api/admin/relays
  def index(conn, _params) do
    subscriptions = Relays.list_subscriptions()
    json(conn, %{subscriptions: Enum.map(subscriptions, &render_subscription/1)})
  end

  # POST /api/admin/relays
  def create(conn, %{"relay_url" => relay_url}) do
    case Relays.subscribe(relay_url) do
      {:ok, subscription} ->
        conn
        |> put_status(:created)
        |> json(%{subscription: render_subscription(subscription)})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "Already subscribed to this relay"})

      {:error, :fetch_failed} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          error:
            "Couldn't reach the relay at any standard path. Make sure the URL is correct and the relay is online. Try the actor URL directly (e.g. https://relay.fedi.buzz/actor)."
        })

      {:error, :not_an_actor} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          error:
            "The URL returned a document, but it doesn't look like an ActivityPub actor. Try providing the relay's actor URL directly (usually ends in /actor or /inbox)."
        })

      {:error, :no_inbox} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "The relay actor has no inbox URL. This isn't a relay we can subscribe to."})

      {:error, :invalid_url} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid relay URL — make sure it starts with https://"})

      {:error, :invalid_json} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Relay returned invalid JSON"})

      {:error, reason} ->
        Logger.warning("Relay subscribe error: #{inspect(reason)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to subscribe to relay"})
    end
  end

  # POST /api/admin/relays/:id/pause
  def pause(conn, %{"id" => id}) do
    case Relays.pause(id) do
      {:ok, subscription} ->
        json(conn, %{subscription: render_subscription(subscription)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Subscription not found"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to pause"})
    end
  end

  # POST /api/admin/relays/:id/resume
  def resume(conn, %{"id" => id}) do
    case Relays.resume(id) do
      {:ok, subscription} ->
        json(conn, %{subscription: render_subscription(subscription)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Subscription not found"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to resume"})
    end
  end

  # DELETE /api/admin/relays/:id
  def delete(conn, %{"id" => id}) do
    case Relays.unsubscribe(id) do
      {:ok, _} ->
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Subscription not found"})

      {:error, reason} ->
        Logger.warning("Relay unsubscribe error: #{inspect(reason)}")
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to unsubscribe"})
    end
  end

  # ── Helpers ───────────────────────────────────────────────────────────

  defp render_subscription(sub) do
    %{
      id: sub.id,
      relay_url: sub.relay_url,
      relay_domain: sub.relay_domain,
      status: sub.status,
      entry_count: sub.entry_count,
      last_activity_at: sub.last_activity_at,
      error_message: sub.error_message,
      inserted_at: sub.inserted_at
    }
  end
end
