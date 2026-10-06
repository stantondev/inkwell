defmodule InkwellWeb.MusicBrainzTest do
  @moduledoc """
  Song and album links in "Listening to" (roadmap: open and self-hosted music
  support, @michael, part 2), and covers for listens that arrive without ids.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.{MusicBrainz, Repo}

  @rec "30d08f4c-d825-4ae1-b79c-44242cddd7c0"
  @rel "f1418001-7f1e-46af-bfdb-95faeded8841"
  @rg "1d98b0bc-5832-49d2-a93e-463032631a2f"

  defp recording_json do
    Jason.encode!(%{
      "title" => "Some Resolve",
      "artist-credit" => [%{"name" => "Röyksopp", "joinphrase" => " feat. "}, %{"name" => "Susanne Sundfør", "joinphrase" => ""}],
      "releases" => [
        %{"id" => "11111111-1111-1111-1111-111111111111", "title" => "Bootleg", "status" => "Bootleg"},
        %{"id" => @rel, "title" => "Profound Mysteries II", "status" => "Official", "release-group" => %{"id" => @rg}}
      ]
    })
  end

  defp stub do
    Application.put_env(:inkwell, :musicbrainz_fetcher, fn url ->
      send(self(), {:fetched, url})

      cond do
        url =~ "/recording/?query=" ->
          {:ok,
           {200,
            Jason.encode!(%{
              "recordings" => [
                %{"id" => @rec, "score" => 100, "title" => "Some Resolve",
                  "artist-credit" => [%{"name" => "Röyksopp"}],
                  "releases" => [%{"id" => @rel, "status" => "Official", "release-group" => %{"id" => @rg}}]}
              ]
            })}}

        url =~ "/recording/#{@rec}" -> {:ok, {200, recording_json()}}
        url =~ "/release-group/#{@rg}" -> {:ok, {200, Jason.encode!(%{"title" => "Profound Mysteries II", "artist-credit" => [%{"name" => "Röyksopp"}]})}}
        true -> {:ok, {404, "{}"}}
      end
    end)
  end

  setup do
    :ets.delete_all_objects(:musicbrainz_cache)
    :ets.delete_all_objects(:listenbrainz_cache)

    on_exit(fn ->
      Application.delete_env(:inkwell, :musicbrainz_fetcher)
      Application.delete_env(:inkwell, :listenbrainz_fetcher)
    end)

    :ok
  end

  describe "recognising links" do
    test "MusicBrainz and ListenBrainz song and album links" do
      assert {:ok, {:recording, @rec}} = MusicBrainz.parse("https://musicbrainz.org/recording/#{@rec}")
      assert {:ok, {:recording, @rec}} = MusicBrainz.parse("https://www.musicbrainz.org/recording/#{String.upcase(@rec)}?tab=x")
      assert {:ok, {:release, @rel}} = MusicBrainz.parse("https://musicbrainz.org/release/#{@rel}")
      assert {:ok, {:release_group, @rg}} = MusicBrainz.parse("https://musicbrainz.org/release-group/#{@rg}")
      assert {:ok, {:recording, @rec}} = MusicBrainz.parse("https://listenbrainz.org/track/#{@rec}/")
      assert {:ok, {:release_group, @rg}} = MusicBrainz.parse("https://listenbrainz.org/album/#{@rg}/")
      assert {:ok, {:recording, @rec}} = MusicBrainz.parse("https://listenbrainz.org/player/?recording_mbids=#{@rec},#{@rg}")
    end

    test "anything else isn't one" do
      refute MusicBrainz.link?("https://musicbrainz.org/artist/#{@rec}")
      refute MusicBrainz.link?("https://musicbrainz.org/recording/not-an-id")
      refute MusicBrainz.link?("https://evil.example/recording/#{@rec}")
      refute MusicBrainz.link?("javascript:alert(1)")
      refute MusicBrainz.link?("Röyksopp — Some Resolve")
    end
  end

  describe "looking a link up" do
    test "a song: title, full artist credit, its official album, and a day's cache" do
      stub()
      url = "https://musicbrainz.org/recording/#{@rec}"

      assert {:ok, meta} = MusicBrainz.resolve(url)
      assert meta["service"] == "musicbrainz"
      assert meta["kind"] == "recording"
      assert meta["track"] == "Some Resolve"
      assert meta["artist"] == "Röyksopp feat. Susanne Sundfør"
      assert meta["release"] == "Profound Mysteries II"
      assert meta["release_group_mbid"] == @rg
      assert meta["source_url"] == url
      assert_received {:fetched, _}

      # The same song through a ListenBrainz link: no second request.
      assert {:ok, %{"source_url" => "https://listenbrainz.org/track/" <> _}} =
               MusicBrainz.resolve("https://listenbrainz.org/track/#{@rec}")

      refute_received {:fetched, _}
    end

    test "through the editor's lookup endpoint", %{conn: conn} do
      stub()
      url = "https://listenbrainz.org/album/#{@rg}/"

      body = conn |> log_in_user(create_user()) |> get("/api/media/resolve?url=#{URI.encode_www_form(url)}") |> json_response(200)
      assert body["data"]["kind"] == "release_group"
      assert body["data"]["release"] == "Profound Mysteries II"
    end

    test "an id MusicBrainz doesn't know" do
      stub()
      assert {:error, :not_found} = MusicBrainz.resolve("https://musicbrainz.org/release/#{@rel}")
    end
  end

  describe "saved with an entry" do
    defp meta(overrides \\ %{}) do
      Map.merge(
        %{
          "service" => "musicbrainz",
          "kind" => "recording",
          "track" => "Some Resolve",
          "artist" => "Röyksopp",
          "recording_mbid" => @rec,
          "release_group_mbid" => @rg,
          "source_url" => "https://musicbrainz.org/recording/#{@rec}",
          "cover_url" => "https://evil.example/x.png"
        },
        overrides
      )
    end

    test "kept only for exactly its link and its id; no URLs taken" do
      link = "https://musicbrainz.org/recording/#{@rec}"

      clean = Inkwell.MediaEmbeds.sanitize(meta(), link)
      assert clean["track"] == "Some Resolve"
      refute Map.has_key?(clean, "cover_url")

      assert Inkwell.MediaEmbeds.sanitize(meta(), "https://musicbrainz.org/recording/#{@rg}") == nil
      assert Inkwell.MediaEmbeds.sanitize(meta(%{"recording_mbid" => @rg}), link) == nil
      assert Inkwell.MediaEmbeds.sanitize(meta(%{"kind" => "release"}), link) == nil
      assert Inkwell.MediaEmbeds.sanitize(meta(%{"track" => nil}), link) == nil
    end

    test "a link posted through the API without details is looked up on save" do
      stub()
      user = create_user()
      link = "https://listenbrainz.org/track/#{@rec}"

      id =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{title: "Tonight #{System.unique_integer([:positive])}", body_html: "<p>hi #{System.unique_integer()}</p>", privacy: "public", music: link})
        |> json_response(201)
        |> get_in(["data", "id"])

      entry = Repo.get!(Entry, id)
      assert entry.music == link
      assert entry.music_metadata["service"] == "musicbrainz"
      assert entry.music_metadata["track"] == "Some Resolve"
    end

    test "plain words aren't looked up" do
      Application.put_env(:inkwell, :musicbrainz_fetcher, fn _ -> flunk("no lookup for plain text") end)

      id =
        build_conn()
        |> log_in_user(create_user())
        |> post("/api/entries", %{title: "Words #{System.unique_integer([:positive])}", body_html: "<p>x #{System.unique_integer()}</p>", privacy: "public", music: "Röyksopp — Some Resolve"})
        |> json_response(201)
        |> get_in(["data", "id"])

      assert Repo.get!(Entry, id).music_metadata == nil
    end
  end

  describe "listens without ids" do
    defp listen(info) do
      {:ok,
       {200,
        Jason.encode!(%{
          "payload" => %{
            "listens" => [
              %{"track_metadata" => %{"artist_name" => "Röyksopp", "track_name" => "Some Resolve", "additional_info" => info}}
            ]
          }
        })}}
    end

    test "are matched by an exact search, so they get a cover" do
      stub()
      Application.put_env(:inkwell, :listenbrainz_fetcher, fn _ -> listen(%{}) end)

      assert {:ok, t} = Inkwell.ListenBrainz.now_playing("michael")
      assert t.music_metadata["recording_mbid"] == @rec
      assert t.music_metadata["release_group_mbid"] == @rg
    end

    test "a listen that has ids isn't searched" do
      stub()
      Application.put_env(:inkwell, :listenbrainz_fetcher, fn _ -> listen(%{"recording_mbid" => @rec}) end)

      assert {:ok, _} = Inkwell.ListenBrainz.now_playing("michael")
      refute_received {:fetched, _}
    end

    test "a near miss isn't used" do
      Application.put_env(:inkwell, :musicbrainz_fetcher, fn _ ->
        {:ok, {200, Jason.encode!(%{"recordings" => [%{"id" => @rec, "score" => 95, "title" => "Some Resolve (Live)", "artist-credit" => [%{"name" => "Röyksopp"}]}]})}}
      end)

      Application.put_env(:inkwell, :listenbrainz_fetcher, fn _ -> listen(%{}) end)

      assert {:ok, t} = Inkwell.ListenBrainz.now_playing("michael")
      refute Map.has_key?(t.music_metadata, "recording_mbid")
    end
  end
end
