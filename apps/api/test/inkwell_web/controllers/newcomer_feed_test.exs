defmodule InkwellWeb.NewcomerFeedTest do
  @moduledoc """
  New writers' first entries in everyone's Feed ("New to Inkwell"), the
  opt-in first-entry notices, and search leaving out held-back accounts.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{FirstEntryNotices, Journals, Repo}
  alias Inkwell.Accounts.Notification

  import Ecto.Query

  @words String.duplicate("word ", 40)

  defp publish(user, attrs \\ %{}) do
    n = System.unique_integer([:positive])

    {:ok, e} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{n}",
            body_html: "<p>#{@words}</p>",
            privacy: :public,
            status: :published,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )

    e
  end

  defp ago(struct, field, days) do
    at = DateTime.utc_now() |> DateTime.add(-days, :day) |> DateTime.truncate(:microsecond)
    struct |> Ecto.Changeset.change([{field, at}]) |> Repo.update!()
  end

  defp with_settings(settings), do: create_user() |> Ecto.Changeset.change(settings: settings) |> Repo.update!()

  defp feed(reader) do
    build_conn()
    |> log_in_user(reader)
    |> get("/api/feed?per_page=50")
    |> json_response(200)
    |> Map.fetch!("data")
  end

  defp newcomer_ids(reader), do: for(e <- feed(reader), e["newcomer"], do: e["id"])

  test "a new writer's first entry reaches someone who doesn't follow them, marked newcomer" do
    first = publish(create_user())
    assert first.id in newcomer_ids(create_user())
  end

  test "only the first entry, only for a week, only from accounts under 60 days old" do
    writer = create_user()
    first = publish(writer)
    second = publish(writer)
    reader = create_user()
    ids = newcomer_ids(reader)
    assert first.id in ids
    refute second.id in ids

    old_post = create_user() |> publish() |> ago(:published_at, 8)
    refute old_post.id in newcomer_ids(reader)

    veteran = create_user() |> ago(:inserted_at, 90)
    late_first = publish(veteran)
    refute late_first.id in newcomer_ids(reader)
  end

  test "imported, private and sticky posts are left out" do
    reader = create_user()
    imported = create_user() |> publish() |> Ecto.Changeset.change(imported_from: "livejournal") |> Repo.update!()
    private = publish(create_user(), %{privacy: :private})
    sticky = publish(create_user(), %{kind: "sticky", title: nil, body_html: "<p>Hello there</p>"})
    ids = newcomer_ids(reader)
    refute imported.id in ids
    refute private.id in ids
    refute sticky.id in ids
  end

  test "spam-limited accounts and new link posters who haven't talked to anyone are left out" do
    reader = create_user()
    limited = create_user() |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    limited_post = publish(limited)

    linker_post = publish(create_user(), %{body_html: ~s(<p>#{@words} <a href="https://cheap-clinic.example/">book now</a></p>)})

    ids = newcomer_ids(reader)
    refute limited_post.id in ids
    refute linker_post.id in ids
  end

  test "a followed newcomer shows as an ordinary entry, and your own isn't marked" do
    writer = create_user()
    first = publish(writer)
    reader = create_user()
    create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :accepted})

    item = Enum.find(feed(reader), &(&1["id"] == first.id))
    assert item
    refute item["newcomer"]
    assert Enum.count(feed(reader), &(&1["id"] == first.id)) == 1

    own = Enum.find(feed(writer), &(&1["id"] == first.id))
    refute own["newcomer"]
  end

  test "readers can turn it off, and blocked writers never appear" do
    first = publish(create_user())

    off = with_settings(%{"new_writers_in_feed_disabled" => true})
    refute first.id in newcomer_ids(off)

    blocker = create_user()
    create_relationship(%{follower_id: blocker.id, following_id: first.user_id, status: :blocked})
    refute first.id in newcomer_ids(blocker)
  end

  describe "first-entry notices" do
    test "only people who asked are told, once, with a link to the entry" do
      welcomer = with_settings(%{"first_entry_notices" => true})
      other = create_user()
      writer = create_user()
      first = publish(writer)

      FirstEntryNotices.notify(first.id)
      FirstEntryNotices.notify(first.id)

      notes = Repo.all(from n in Notification, where: n.type == :first_entry and n.target_id == ^first.id)
      assert [%{user_id: uid, actor_id: aid, data: data}] = notes
      assert uid == welcomer.id
      assert aid == writer.id
      assert data["entry_path"] == "/#{writer.username}/#{first.slug}"
      refute Enum.any?(notes, &(&1.user_id == other.id))
    end

    test "nothing for a limited writer or a second entry" do
      with_settings(%{"first_entry_notices" => true})
      limited = create_user() |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
      FirstEntryNotices.notify(publish(limited).id)

      writer = create_user()
      publish(writer)
      FirstEntryNotices.notify(publish(writer).id)

      assert Repo.aggregate(from(n in Notification, where: n.type == :first_entry), :count) == 0
    end
  end

  test "search leaves out spam-limited writers and their entries" do
    limited =
      create_user(%{username: "clinicnew#{System.unique_integer([:positive])}"})
      |> Ecto.Changeset.change(moderation_state: "limited")
      |> Repo.update!()

    publish(limited, %{title: "Zebracorn clinic offers"})
    real = create_user(%{username: "clinicfan#{System.unique_integer([:positive])}"})
    publish(real, %{title: "Zebracorn poems"})

    users =
      build_conn() |> get("/api/search?q=clinic&type=users") |> json_response(200) |> Map.fetch!("data")
      |> Enum.map(& &1["username"])

    assert real.username in users
    refute limited.username in users

    titles =
      build_conn() |> get("/api/search?q=zebracorn") |> json_response(200) |> Map.fetch!("data")
      |> Enum.map(& &1["title"])

    assert "Zebracorn poems" in titles
    refute "Zebracorn clinic offers" in titles
  end
end
