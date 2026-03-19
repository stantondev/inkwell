defmodule InkwellWeb.FediverseBlockController do
  use InkwellWeb, :controller

  alias Inkwell.Moderation.FediverseBlocks

  # POST /api/fediverse-blocks/actors — block a remote actor
  def block_actor(conn, %{"remote_actor_id" => remote_actor_id}) do
    user = conn.assigns.current_user

    case FediverseBlocks.block_remote_actor(user.id, remote_actor_id) do
      {:ok, _block} ->
        json(conn, %{ok: true})

      {:error, _changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not block actor"})
    end
  end

  # DELETE /api/fediverse-blocks/actors/:remote_actor_id — unblock a remote actor
  def unblock_actor(conn, %{"remote_actor_id" => remote_actor_id}) do
    user = conn.assigns.current_user
    FediverseBlocks.unblock_remote_actor(user.id, remote_actor_id)
    json(conn, %{ok: true})
  end

  # GET /api/fediverse-blocks/actors — list blocked remote actors
  def list_blocked_actors(conn, _params) do
    user = conn.assigns.current_user
    actors = FediverseBlocks.list_blocked_remote_actors(user.id)
    json(conn, %{data: actors})
  end

  # POST /api/fediverse-blocks/domains — block a domain
  def block_domain(conn, %{"domain" => domain} = params) do
    user = conn.assigns.current_user
    reason = Map.get(params, "reason")

    case FediverseBlocks.block_domain(user.id, domain, reason) do
      {:ok, _block} ->
        json(conn, %{ok: true})

      {:error, changeset} ->
        errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid domain", details: errors})
    end
  end

  # DELETE /api/fediverse-blocks/domains/:domain — unblock a domain
  def unblock_domain(conn, %{"domain" => domain}) do
    user = conn.assigns.current_user
    FediverseBlocks.unblock_domain(user.id, domain)
    json(conn, %{ok: true})
  end

  # GET /api/fediverse-blocks/domains — list blocked domains
  def list_blocked_domains(conn, _params) do
    user = conn.assigns.current_user
    domains = FediverseBlocks.list_blocked_domains(user.id)

    json(conn, %{
      data: Enum.map(domains, fn d ->
        %{id: d.id, domain: d.domain, reason: d.reason, blocked_at: d.inserted_at}
      end)
    })
  end
end
