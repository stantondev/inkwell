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
    # Still on the regular Explore feed; this only curates the homepage.
    ids = build_conn() |> get("/api/explore?source=inkwell&per_page=50") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])
    assert spam.id in ids
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
end
