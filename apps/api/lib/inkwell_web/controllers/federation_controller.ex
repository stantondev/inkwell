defmodule InkwellWeb.FederationController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts

  @instance_host "inkwell.social"

  # GET /.well-known/webfinger?resource=acct:username@inkwell.social
  def webfinger(conn, %{"resource" => resource}) do
    host = @instance_host
    with "acct:" <> rest <- resource,
         [username, ^host] <- String.split(rest, "@"),
         user when not is_nil(user) <- Accounts.get_user_by_username(username) do

      conn
      |> put_resp_content_type("application/jrd+json")
      |> json(%{
        subject: "acct:#{username}@#{@instance_host}",
        links: [
          %{
            rel: "self",
            type: "application/activity+json",
            href: "https://#{@instance_host}/users/#{username}"
          },
          %{
            rel: "http://webfinger.net/rel/profile-page",
            type: "text/html",
            href: "https://#{@instance_host}/@#{username}"
          }
        ]
      })
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  def webfinger(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "resource parameter required"})
  end

  # GET /.well-known/nodeinfo
  def nodeinfo(conn, _params) do
    conn
    |> put_resp_content_type("application/json")
    |> json(%{
      links: [
        %{
          rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
          href: "https://#{@instance_host}/nodeinfo/2.1"
        }
      ]
    })
  end

  # GET /users/:username/outbox  (ActivityPub OrderedCollection stub)
  def outbox(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        conn
        |> put_resp_content_type("application/activity+json")
        |> json(%{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollection",
          "id" => "https://#{@instance_host}/users/#{username}/outbox",
          "totalItems" => 0,
          "orderedItems" => []
        })
    end
  end

  # POST /users/:username/inbox  (ActivityPub inbox — forwarded to Fedify sidecar)
  def inbox(conn, %{"username" => username}) do
    # In Phase 3 this will proxy to the Fedify federation sidecar.
    # For now, acknowledge receipt.
    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # POST /inbox  (shared inbox)
  def shared_inbox(conn, _params) do
    conn |> put_status(:accepted) |> json(%{ok: true})
  end
end
