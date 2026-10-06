defmodule InkwellWeb.ListenBrainzTest do
  @moduledoc """
  "Listening to" from ListenBrainz (roadmap: open and self-hosted music
  support, @michael): the saved username, the Now playing lookup, the API's
  `music_from`, and the check on what's saved with an entry.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.{ListenBrainz, Repo}

  @recording "30d08f4c-d825-4ae1-b79c-44242cddd7c0"
  @release "f1418001-7f1e-46af-bfdb-95faeded8841"

  defp listen(opts \\ []) do
    %{
      "listened_at" => Keyword.get(opts, :listened_at, System.system_time(:second) - 60),
      "track_metadata" => %{
        "artist_name" => "Röyksopp",
        "track_name" => "Some Resolve",
        "release_name" => "Profound Mysteries II",
        "additional_info" => %{"recording_mbid" => @recording, "submission_client" => "navidrome"},
        "mbid_mapping" => %{"caa_id" => 32_916_450_708, "caa_release_mbid" => @release}
      }
    }
  end

  defp payload(listens), do: {:ok, {200, Jason.encode!(%{"payload" => %{"count" => length(listens), "listens" => listens}})}}

  # Answers ListenBrainz requests: `now` for playing-now, `latest` for listens.
  defp stub(now, latest \\ []) do
    Application.put_env(:inkwell, :listenbrainz_fetcher, fn url ->
      send(self(), {:fetched, url})

      cond do
        url =~ "nobody" -> {:ok, {404, "{}"}}
        url =~ "playing-now" -> payload(now)
        url =~ "/listens" -> payload(latest)
      end
    end)
  end

  setup do
    :ets.delete_all_objects(:listenbrainz_cache)
    on_exit(fn -> Application.delete_env(:inkwell, :listenbrainz_fetcher) end)
    :ok
  end

  defp with_listenbrainz(user, name \\ "michael") do
    user |> Ecto.Changeset.change(settings: Map.put(user.settings || %{}, "listenbrainz_username", name)) |> Repo.update!()
  end

  describe "the lookup" do
    test "what's playing now, with MusicBrainz ids for cover art" do
      stub([listen()])

      assert {:ok, t} = ListenBrainz.now_playing("michael")
      assert t.playing_now
      assert t.music == "Röyksopp — Some Resolve"
      assert t.music_metadata["recording_mbid"] == @recording
      assert t.music_metadata["caa_release_mbid"] == @release
      assert t.music_metadata["caa_id"] == 32_916_450_708
      assert t.music_metadata["source_url"] == t.music
    end

    test "falls back to the latest listen when nothing is playing" do
      stub([], [listen()])

      assert {:ok, %{playing_now: false, listened_at: %DateTime{}}} = ListenBrainz.now_playing("michael")
    end

    test "says so when there's nothing at all, or no such user" do
      stub([], [])
      assert {:error, :no_listens} = ListenBrainz.now_playing("michael")
      assert {:error, :not_found} = ListenBrainz.now_playing("nobody")
      assert {:error, :not_found} = ListenBrainz.now_playing("a/b")
    end

    test "is cached briefly" do
      stub([listen()])
      ListenBrainz.now_playing("michael")
      assert_received {:fetched, _}
      ListenBrainz.now_playing("michael")
      refute_received {:fetched, _}
    end
  end

  describe "saved with an entry" do
    test "kept when it matches the Listening to text; ids checked; nothing else taken" do
      meta = %{
        "service" => "listenbrainz",
        "artist" => "Röyksopp",
        "track" => "Some Resolve",
        "recording_mbid" => @recording,
        "release_mbid" => "not-a-uuid",
        "cover_url" => "https://evil.example/x.png",
        "source_url" => "Röyksopp — Some Resolve"
      }

      clean = Inkwell.MediaEmbeds.sanitize(meta, "Röyksopp — Some Resolve")
      assert clean["recording_mbid"] == @recording
      refute Map.has_key?(clean, "release_mbid")
      refute Map.has_key?(clean, "cover_url")

      assert Inkwell.MediaEmbeds.sanitize(meta, "Something else") == nil
      assert Inkwell.MediaEmbeds.sanitize(Map.delete(meta, "track"), "Röyksopp — Some Resolve") == nil
    end
  end

  describe "settings" do
    test "the username is trimmed, and an empty or impossible one is removed", %{conn: conn} do
      user = create_user()
      c = log_in_user(conn, user)

      c |> patch("/api/me", %{settings: %{listenbrainz_username: "  michael  "}}) |> json_response(200)
      assert Repo.reload(user).settings["listenbrainz_username"] == "michael"

      log_in_user(build_conn(), user) |> patch("/api/me", %{settings: %{listenbrainz_username: "a/b"}}) |> json_response(200)
      refute Map.has_key?(Repo.reload(user).settings, "listenbrainz_username")
    end
  end

  describe "GET /api/me/listenbrainz" do
    test "returns the track for the saved username", %{conn: conn} do
      stub([listen()])
      user = create_user() |> with_listenbrainz()

      body = conn |> log_in_user(user) |> get("/api/me/listenbrainz") |> json_response(200)
      assert body["data"]["music"] == "Röyksopp — Some Resolve"
      assert body["data"]["playing_now"]
      assert body["data"]["music_metadata"]["service"] == "listenbrainz"
    end

    test "explains what's wrong", %{conn: conn} do
      stub([], [])
      user = create_user()
      assert %{"code" => "not_connected"} = conn |> log_in_user(user) |> get("/api/me/listenbrainz") |> json_response(422)
      assert %{"code" => "no_listens"} = log_in_user(build_conn(), user) |> get("/api/me/listenbrainz?username=michael") |> json_response(404)
      assert %{"code" => "not_found"} = log_in_user(build_conn(), user) |> get("/api/me/listenbrainz?username=nobody") |> json_response(404)
    end
  end

  describe "music_from on an entry" do
    defp post_entry(user, extra) do
      build_conn()
      |> log_in_user(user)
      |> post("/api/entries", Map.merge(%{title: "Tonight #{System.unique_integer([:positive])}", body_html: "<p>hi #{System.unique_integer()}</p>", privacy: "public"}, extra))
      |> json_response(201)
      |> get_in(["data", "id"])
    end

    test "fills Listening to from what's playing" do
      stub([listen()])
      user = create_user() |> with_listenbrainz()

      entry = Repo.get!(Entry, post_entry(user, %{music_from: "listenbrainz"}))
      assert entry.music == "Röyksopp — Some Resolve"
      assert entry.music_metadata["service"] == "listenbrainz"
      assert entry.music_metadata["caa_release_mbid"] == @release
    end

    test "uses a listen from the last half hour, but not an old one" do
      user = create_user() |> with_listenbrainz()

      stub([], [listen(listened_at: System.system_time(:second) - 10 * 60)])
      assert Repo.get!(Entry, post_entry(user, %{music_from: "listenbrainz"})).music == "Röyksopp — Some Resolve"

      :ets.delete_all_objects(:listenbrainz_cache)
      stub([], [listen(listened_at: System.system_time(:second) - 3 * 3600)])
      assert Repo.get!(Entry, post_entry(user, %{music_from: "listenbrainz", music: "typed"})).music == "typed"
    end

    test "editing it later works the same way" do
      stub([listen()])
      user = create_user() |> with_listenbrainz()
      id = post_entry(user, %{})

      build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", %{music_from: "listenbrainz"}) |> json_response(200)
      assert Repo.get!(Entry, id).music == "Röyksopp — Some Resolve"
    end

    test "metadata sent by a client for different text is dropped" do
      user = create_user()

      id =
        post_entry(user, %{
          music: "Something I typed",
          music_metadata: %{"service" => "listenbrainz", "artist" => "A", "track" => "B", "source_url" => "A — B"}
        })

      entry = Repo.get!(Entry, id)
      assert entry.music == "Something I typed"
      assert entry.music_metadata == nil
    end
  end

  describe "on the profile" do
    test "anyone can see what a member is playing, and the profile says to look" do
      stub([listen()])
      user = with_listenbrainz(create_user())

      meta = build_conn() |> get("/api/users/#{user.username}") |> json_response(200) |> Map.get("meta")
      assert meta["shows_listening"] == true

      data = build_conn() |> get("/api/users/#{user.username}/listening") |> json_response(200) |> Map.get("data")
      assert data["playing_now"]
      assert data["music"] == "Röyksopp — Some Resolve"
      assert data["music_metadata"]["service"] == "listenbrainz"
    end

    test "not without ListenBrainz, or when the member switched it off" do
      stub([listen()])
      plain = create_user()
      assert build_conn() |> get("/api/users/#{plain.username}/listening") |> json_response(404)
      assert build_conn() |> get("/api/users/#{plain.username}") |> json_response(200) |> get_in(["meta", "shows_listening"]) == false

      user = with_listenbrainz(create_user())

      build_conn()
      |> log_in_user(user)
      |> patch("/api/me", %{settings: %{listenbrainz_on_profile: false}})
      |> json_response(200)

      assert Repo.reload!(user).settings["listenbrainz_on_profile"] == false
      assert build_conn() |> get("/api/users/#{user.username}/listening") |> json_response(404)
      refute_received {:fetched, _}
    end

    test "only true or false is saved for the switch" do
      user = with_listenbrainz(create_user())
      build_conn() |> log_in_user(user) |> patch("/api/me", %{settings: %{listenbrainz_on_profile: "<b>"}}) |> json_response(200)
      refute Map.has_key?(Repo.reload!(user).settings, "listenbrainz_on_profile")
    end

    test "hidden from people blocked either way, and for suspended accounts" do
      stub([listen()])
      user = with_listenbrainz(create_user())
      other = create_user()
      {:ok, _} = Inkwell.Social.block(user.id, other.id)

      assert build_conn() |> log_in_user(other) |> get("/api/users/#{user.username}/listening") |> json_response(404)

      suspended = with_listenbrainz(create_user())
      suspended |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()
      assert build_conn() |> get("/api/users/#{suspended.username}/listening") |> json_response(404)
    end

    test "a slow ListenBrainz is a 503, so the page keeps what it shows" do
      Application.put_env(:inkwell, :listenbrainz_fetcher, fn _ -> {:error, :timeout} end)
      user = with_listenbrainz(create_user())
      body = build_conn() |> get("/api/users/#{user.username}/listening") |> json_response(503)
      assert body["code"] == "unavailable"
    end
  end
end
