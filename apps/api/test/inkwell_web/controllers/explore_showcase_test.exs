defmodule InkwellWeb.ExploreShowcaseTest do
  @moduledoc """
  The homepage asks Explore for `showcase=1`: new accounts that post outside
  links and have never interacted with anyone (the shape of SEO spam) are left
  out, without needing anyone else to have read a writer first.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals

  defp publish(user, body) do
    n = System.unique_integer([:positive])

    {:ok, e} =
      Journals.create_entry(%{
        user_id: user.id,
        title: "Post #{n}",
        body_html: body,
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now()
      })

    e
  end

  defp showcase_ids do
    build_conn()
    |> get("/api/explore?source=inkwell&showcase=1&per_page=50")
    |> json_response(200)
    |> Map.fetch!("data")
    |> Enum.map(& &1["id"])
  end

  test "a new account linking to a business site with no interactions is left out" do
    spam = publish(create_user(), ~s(<p>We offer seals. <a href="https://seals.example.com">Buy</a></p>))
    assert spam.id not in showcase_ids()
  end

  defp explore_ids(conn \\ build_conn()) do
    conn
    |> get("/api/explore?source=inkwell&per_page=50")
    |> json_response(200)
    |> Map.fetch!("data")
    |> Enum.map(& &1["id"])
  end

  defp age(user, days) do
    user
    |> Ecto.Changeset.change(inserted_at: DateTime.utc_now() |> DateTime.add(-days, :day))
    |> Inkwell.Repo.update!()
  end

  # Since 2026-09-29 Explore holds these posts for a week instead of the spam
  # checker growing another phrase list. Nothing is hidden anywhere else.
  describe "Explore's first week" do
    test "a new account's post with an outside link waits a week" do
      spam = publish(create_user(), ~s(<p>Sliding gates. <a href="https://maps.app.goo.gl/x">Find us</a></p>))
      assert spam.id not in explore_ids()
    end

    test "the writer still sees their own post in Explore" do
      writer = create_user()
      e = publish(writer, ~s(<p>My <a href="https://myblog.example">blog</a></p>))
      assert e.id in explore_ids(log_in_user(build_conn(), writer))
      assert e.id not in explore_ids(log_in_user(build_conn(), create_user()))
    end

    test "after a week it appears in Explore (the homepage and search keep 30 days)" do
      writer = create_user() |> age(8)
      e = publish(writer, ~s(<p>My <a href="https://myblog.example">blog</a></p>))
      assert e.id in explore_ids()
      assert e.id not in showcase_ids()
    end

    test "following, commenting or inking anyone ends the wait" do
      writer = create_user()
      e = publish(writer, ~s(<p>My <a href="https://myblog.example">blog</a></p>))
      assert e.id not in explore_ids()
      create_relationship(%{follower_id: writer.id, following_id: create_user().id, status: :accepted})
      assert e.id in explore_ids()
    end

    test "new writers without outside links show straight away" do
      e = publish(create_user(), "<p>A poem about the sea.</p>")
      assert e.id in explore_ids()
    end
  end

  test "a new writer without outside links shows up straight away" do
    e = publish(create_user(), "<p>A poem about the sea.</p>")
    assert e.id in showcase_ids()
  end

  test "links to inkwell.social and mentions don't count as outside links" do
    e = publish(create_user(), ~s(<p>See <a href="https://inkwell.social/me/old">my last post</a> and <a href="/friend">@friend</a></p>))
    assert e.id in showcase_ids()
  end

  test "a new writer who links out but follows someone shows up" do
    writer = create_user()
    create_relationship(%{follower_id: writer.id, following_id: create_user().id, status: :accepted})
    e = publish(writer, ~s(<p>My <a href="https://myblog.example">blog</a></p>))
    assert e.id in showcase_ids()
  end

  test "an account older than 30 days is not affected" do
    writer = create_user()

    writer
    |> Ecto.Changeset.change(inserted_at: DateTime.utc_now() |> DateTime.add(-40, :day))
    |> Inkwell.Repo.update!()

    e = publish(writer, ~s(<p><a href="https://myblog.example">blog</a></p>))
    assert e.id in showcase_ids()
  end

  describe "search engines" do
    test "a new link-posting account is held back from search and the sitemap" do
      spammer = create_user()
      spam = publish(spammer, ~s(<p><a href="https://seals.example.com">Buy</a></p>))
      writer = create_user()
      _poem = publish(writer, "<p>A poem.</p>")

      assert Journals.held_back_from_search?(spammer.id)
      refute Journals.held_back_from_search?(writer.id)

      data = build_conn() |> get("/api/sitemap-data") |> json_response(200)
      body = Jason.encode!(data)
      refute body =~ spammer.username
      refute body =~ spam.slug
      assert body =~ writer.username
    end

    # Sept 2026: a limited spam account only had to wait 30 days to be back
    # in Google (@rothomobani).
    test "a limited account stays held back after 30 days" do
      spammer = create_user()

      spammer
      |> Ecto.Changeset.change(inserted_at: DateTime.utc_now() |> DateTime.add(-60, :day), moderation_state: "limited")
      |> Inkwell.Repo.update!()

      spam = publish(spammer, ~s(<p><a href="https://seals.example.com">Gratis offerte</a></p>))

      assert Journals.held_back_from_search?(spammer.id)
      assert spam.id not in showcase_ids()

      body = build_conn() |> get("/api/sitemap-data") |> json_response(200) |> Jason.encode!()
      refute body =~ spammer.username
      refute body =~ spam.slug

      # The profile and entry pages carry noindex.
      meta = build_conn() |> get("/api/users/#{spammer.username}") |> json_response(200) |> Map.fetch!("meta")
      assert meta["noindex"] == true
    end

    test "an older writer who links out and never interacts is not held back" do
      writer = create_user()

      writer
      |> Ecto.Changeset.change(inserted_at: DateTime.utc_now() |> DateTime.add(-60, :day))
      |> Inkwell.Repo.update!()

      publish(writer, ~s(<p>Notes on <a href="https://nu.nl/a">the news</a></p>))
      refute Journals.held_back_from_search?(writer.id)
    end

    test "tags and topics used only by limited writers stay out of the sitemap" do
      spammer = create_user()
      spammer |> Ecto.Changeset.change(moderation_state: "limited") |> Inkwell.Repo.update!()
      writer = create_user()

      for {user, tag} <- [{spammer, "spamtag"}, {spammer, "spamtag"}, {writer, "poetry"}, {writer, "poetry"}] do
        {:ok, _} =
          Journals.create_entry(%{
            user_id: user.id,
            title: "T #{System.unique_integer([:positive])}",
            body_html: "<p>x</p>",
            tags: [tag],
            category: if(user.id == writer.id, do: :poetry, else: :finance),
            privacy: :public,
            status: :published,
            published_at: DateTime.utc_now()
          })
      end

      data = build_conn() |> get("/api/sitemap-data") |> json_response(200)
      assert "poetry" in data["tags"]
      refute "spamtag" in data["tags"]
      assert "poetry" in data["categories"]
      refute "finance" in data["categories"]
    end

    test "interacting with someone lifts the hold-back" do
      spammer = create_user()
      publish(spammer, ~s(<p><a href="https://myblog.example">blog</a></p>))
      assert Journals.held_back_from_search?(spammer.id)
      create_relationship(%{follower_id: spammer.id, following_id: create_user().id, status: :accepted})
      refute Journals.held_back_from_search?(spammer.id)
    end
  end
end
