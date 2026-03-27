defmodule InkwellWeb.EmailNotificationController do
  use InkwellWeb, :controller

  alias Inkwell.Repo
  alias Inkwell.Accounts.User

  require Logger

  @token_max_age 86_400 * 365  # 1 year

  @doc "One-click unsubscribe from email notifications (RFC 8058)."
  def unsubscribe(conn, %{"token" => token}) do
    case Phoenix.Token.verify(InkwellWeb.Endpoint, "email_unsub", token, max_age: @token_max_age) do
      {:ok, user_id} ->
        case Repo.get(User, user_id) do
          nil ->
            conn
            |> put_status(200)
            |> json(%{ok: true, message: "Unsubscribed"})

          user ->
            settings = Map.merge(user.settings || %{}, %{"email_notifications_disabled" => true})

            user
            |> Ecto.Changeset.change(%{settings: settings})
            |> Repo.update()

            Logger.info("[EmailNotification] User #{user_id} unsubscribed via email link")

            conn
            |> put_status(200)
            |> json(%{ok: true, message: "You have been unsubscribed from email notifications."})
        end

      {:error, _reason} ->
        conn
        |> put_status(200)
        |> json(%{ok: true, message: "Unsubscribed"})
    end
  end
end
