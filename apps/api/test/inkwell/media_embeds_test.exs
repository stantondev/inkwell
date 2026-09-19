defmodule Inkwell.MediaEmbedsTest do
  @moduledoc """
  Fediverse media players (roadmap item from @strypey). Resolution talks to
  real servers and was checked by hand against PeerTube, Funkwhale, Castopod
  and Owncast instances; these tests cover the rules that need no network.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.MediaEmbeds
  alias Inkwell.Repo

  @peertube_link "https://tube.example/videos/watch/c679c96b-15db-472b-910b-4ff31ea1a75e"
  @peertube_meta %{
    "service" => "peertube",
    "embed_url" => "https://tube.example/videos/embed/qvv2EP57bxvHShAEFGeFNf",
    "title" => "A talk",
    "aspect" => "video"
  }

  describe "sanitize/2" do
    test "keeps a player on the link's own server at the software's player path" do
      assert %{"service" => "peertube", "label" => "PeerTube", "source_url" => @peertube_link} =
               MediaEmbeds.sanitize(@peertube_meta, @peertube_link)

      assert MediaEmbeds.sanitize(
               %{"service" => "castopod", "embed_url" => "https://pod.example/@show/episodes/one/embed", "height" => 112},
               "https://pod.example/@show/episodes/one"
             )["height"] == 112

      assert MediaEmbeds.sanitize(
               %{"service" => "funkwhale", "embed_url" => "https://music.example/embed.html?type=track&id=5"},
               "https://music.example/library/tracks/5"
             )

      assert MediaEmbeds.sanitize(
               %{"service" => "owncast", "embed_url" => "https://live.example/embed/video/", "aspect" => "video"},
               "https://live.example"
             )
    end

    test "drops players from another server, at other paths, or for unknown services" do
      refute MediaEmbeds.sanitize(%{@peertube_meta | "embed_url" => "https://evil.example/videos/embed/x"}, @peertube_link)
      refute MediaEmbeds.sanitize(%{@peertube_meta | "embed_url" => "https://tube.example/login"}, @peertube_link)
      refute MediaEmbeds.sanitize(%{@peertube_meta | "embed_url" => "http://tube.example/videos/embed/x"}, @peertube_link)
      refute MediaEmbeds.sanitize(%{@peertube_meta | "service" => "myspace"}, @peertube_link)
      refute MediaEmbeds.sanitize(@peertube_meta, nil)
      refute MediaEmbeds.sanitize("not a map", @peertube_link)
    end

    test "keeps only known fields, with sane values" do
      meta =
        MediaEmbeds.sanitize(
          Map.merge(@peertube_meta, %{"height" => 99_999, "title" => String.duplicate("a", 500), "onload" => "x"}),
          @peertube_link
        )

      assert meta["height"] == 600
      assert String.length(meta["title"]) == 200
      refute Map.has_key?(meta, "onload")
    end
  end

  describe "saving an entry" do
    defp create(user, attrs) do
      build_conn()
      |> log_in_user(user)
      |> post("/api/entries", Map.merge(%{title: "Listen", body_html: "<p>hi</p>", privacy: "public", status: "draft"}, attrs))
      |> json_response(201)
      |> get_in(["data", "id"])
    end

    test "a matching player is stored; a forged one is dropped" do
      user = create_user()
      ok = create(user, %{music: @peertube_link, music_metadata: @peertube_meta})
      assert Repo.get!(Entry, ok).music_metadata["embed_url"] == @peertube_meta["embed_url"]

      forged =
        create(user, %{
          title: "Other",
          body_html: "<p>other</p>",
          music: @peertube_link,
          music_metadata: %{@peertube_meta | "embed_url" => "https://evil.example/videos/embed/x"}
        })

      assert Repo.get!(Entry, forged).music_metadata == nil
    end

    test "changing the link without new metadata clears the old player" do
      user = create_user()
      id = create(user, %{music: @peertube_link, music_metadata: @peertube_meta})

      build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", %{music: "Some song I like"}) |> json_response(200)
      assert Repo.get!(Entry, id).music_metadata == nil
    end
  end

  describe "GET /api/media/resolve" do
    test "refuses links it can't use, without reaching internal addresses", %{conn: conn} do
      conn = log_in_user(conn, create_user())
      assert conn |> get("/api/media/resolve?url=https://localhost/videos/watch/x") |> json_response(422)
      assert build_conn() |> log_in_user(create_user()) |> get("/api/media/resolve?url=http://tube.example/x") |> json_response(422)
      assert build_conn() |> log_in_user(create_user()) |> get("/api/media/resolve") |> json_response(400)
    end

    test "needs a signed-in writer", %{conn: conn} do
      assert conn |> get("/api/media/resolve?url=https://tube.example/w/x") |> json_response(401)
    end
  end
end
