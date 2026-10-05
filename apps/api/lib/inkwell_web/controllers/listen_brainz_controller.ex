defmodule InkwellWeb.ListenBrainzController do
  use InkwellWeb, :controller

  alias Inkwell.ListenBrainz

  # GET /api/me/listenbrainz[?username=] — what the writer is playing now on
  # ListenBrainz, or their latest listen. Uses the saved username unless one is
  # given (Settings checks a name before saving it). Works with API keys, so
  # posting tools can call it and pass `music` + `music_metadata` to an entry.
  def now_playing(conn, params) do
    user = conn.assigns.current_user
    username = ListenBrainz.clean_username(params["username"]) || get_in(user.settings || %{}, ["listenbrainz_username"])

    cond do
      is_nil(username) ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Add your ListenBrainz username in Settings first.", code: "not_connected"})

      true ->
        case ListenBrainz.now_playing(username) do
          {:ok, result} ->
            json(conn, %{
              data: %{
                username: username,
                playing_now: result.playing_now,
                listened_at: result.listened_at,
                music: result.music,
                music_metadata: result.music_metadata
              }
            })

          {:error, :not_found} ->
            conn |> put_status(:not_found) |> json(%{error: "ListenBrainz has no user called #{username}.", code: "not_found"})

          {:error, :no_listens} ->
            conn |> put_status(:not_found) |> json(%{error: "Nothing playing, and no listens on ListenBrainz yet.", code: "no_listens"})

          {:error, :unavailable} ->
            conn |> put_status(:service_unavailable) |> json(%{error: "ListenBrainz didn't answer. Try again in a moment.", code: "unavailable"})
        end
    end
  end
end
