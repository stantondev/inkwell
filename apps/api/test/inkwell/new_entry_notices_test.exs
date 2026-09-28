defmodule Inkwell.NewEntryNoticesTest do
  @moduledoc """
  "X published …" notices for the people who follow a writer
  (`Inkwell.NewEntryNotices`): who gets one, what never announces itself,
  and one notice per writer per day.
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.{Journals, NewEntryNotices, Repo}
  alias Inkwell.Accounts.Notification

  defp follow(reader, writer) do
    create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :accepted})
  end

  defp publish_via_api(writer, attrs \\ %{}) do
    n = System.unique_integer([:positive])

    build_conn()
    |> log_in_user(writer)
    |> post("/api/entries", Map.merge(%{title: "Post #{n}", body_html: "<p>Something I wrote today, number #{n}.</p>", privacy: "public"}, attrs))
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp notices(reader) do
    Repo.all(from n in Notification, where: n.user_id == ^reader.id and n.type == :new_entry)
  end

  test "a follower hears about a new entry, in-app, pointing at the entry" do
    writer = create_user()
    reader = create_user()
    follow(reader, writer)

    entry = publish_via_api(writer)

    assert [n] = notices(reader)
    assert n.actor_id == writer.id
    assert n.target_type == "entry"
    assert n.target_id == entry["id"]
    assert n.data["count"] == 1
    refute n.read
  end

  test "the writer and people who don't follow them hear nothing" do
    writer = create_user()
    stranger = create_user()
    publish_via_api(writer)

    assert notices(writer) == []
    assert notices(stranger) == []
  end

  test "a pending follow request doesn't count" do
    writer = create_user()
    reader = create_user()
    create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :pending})

    publish_via_api(writer)
    assert notices(reader) == []
  end

  test "a second entry the same day updates the first notice instead of adding one" do
    writer = create_user()
    reader = create_user()
    follow(reader, writer)

    publish_via_api(writer)
    [first] = notices(reader)
    first |> Ecto.Changeset.change(read: true) |> Repo.update!()

    second = publish_via_api(writer)

    assert [n] = notices(reader)
    assert n.id == first.id
    assert n.target_id == second["id"]
    assert n.data["count"] == 2
    refute n.read
  end

  test "private entries, drafts and stickies don't announce themselves" do
    writer = create_user()
    reader = create_user()
    follow(reader, writer)

    publish_via_api(writer, %{privacy: "private"})

    build_conn()
    |> log_in_user(writer)
    |> post("/api/entries", %{title: "Draft", body_html: "<p>Not yet.</p>", privacy: "public", status: "draft"})

    build_conn()
    |> log_in_user(writer)
    |> post("/api/stickies", %{body: "A quick thought", privacy: "public"})

    assert notices(reader) == []
  end

  test "friends-only entries reach followers; a custom list reaches only its members" do
    writer = create_user()
    in_list = create_user()
    not_in_list = create_user()
    follow(in_list, writer)
    follow(not_in_list, writer)

    publish_via_api(writer, %{privacy: "friends_only"})
    assert length(notices(in_list)) == 1
    assert length(notices(not_in_list)) == 1

    {:ok, filter} = Inkwell.Social.create_friend_filter(%{user_id: writer.id, name: "Close", member_ids: [in_list.id]})
    Repo.delete_all(Notification)

    {:ok, custom} =
      Journals.create_entry(%{
        user_id: writer.id,
        title: "Close friends only",
        body_html: "<p>Hi.</p>",
        privacy: :custom,
        custom_filter_id: filter.id,
        status: :published,
        published_at: DateTime.utc_now()
      })

    NewEntryNotices.notify_followers(custom)
    assert length(notices(in_list)) == 1
    assert notices(not_in_list) == []
  end

  test "old-dated and imported entries stay quiet" do
    writer = create_user()
    reader = create_user()
    follow(reader, writer)

    {:ok, old} =
      Journals.create_entry(%{
        user_id: writer.id,
        title: "From 2019",
        body_html: "<p>Old.</p>",
        privacy: :public,
        status: :published,
        published_at: ~U[2019-05-01 12:00:00.000000Z]
      })

    {:ok, imported} =
      Journals.create_entry(%{
        user_id: writer.id,
        title: "Imported",
        body_html: "<p>From LiveJournal.</p>",
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now()
      })

    imported = imported |> Ecto.Changeset.change(imported_from: "livejournal") |> Repo.update!()

    NewEntryNotices.notify_followers(old)
    NewEntryNotices.notify_followers(imported)
    assert notices(reader) == []
  end

  test "readers who turned notices off hear nothing" do
    writer = create_user()
    reader = create_user()
    follow(reader, writer)

    reader
    |> Ecto.Changeset.change(settings: %{"new_entry_notices_disabled" => true})
    |> Repo.update!()

    publish_via_api(writer)
    assert notices(reader) == []
  end

  test "new-entry notices are never pushed or emailed" do
    refute Inkwell.Push.pushable_type?(:new_entry)
  end
end
