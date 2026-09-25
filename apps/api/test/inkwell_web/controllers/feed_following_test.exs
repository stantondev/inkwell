defmodule InkwellWeb.FeedFollowingTest do
  @moduledoc """
  Following someone puts their public writing in your Feed straight away;
  pen-pals-only entries wait until they accept (you're pen pals then).
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Reprints, Social}

  defp publish(user, privacy, n) do
    {:ok, e} =
      Journals.create_entry(%{
        user_id: user.id,
        title: "#{privacy} #{n}",
        body_html: "<p>Entry #{n}</p>",
        privacy: privacy,
        status: :published,
        published_at: DateTime.add(DateTime.utc_now(), -n * 60, :second)
      })

    e
  end

  defp feed_ids(conn, reader) do
    conn |> log_in_user(reader) |> get("/api/feed") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])
  end

  test "a pending request shows public entries, not pen-pals-only ones", %{conn: conn} do
    reader = create_user()
    writer = create_user()
    {:ok, _} = Social.follow(reader.id, writer.id)

    public = publish(writer, :public, 1)
    friends = publish(writer, :friends_only, 2)
    private = publish(writer, :private, 3)

    ids = feed_ids(conn, reader)
    assert public.id in ids
    refute friends.id in ids
    refute private.id in ids
  end

  test "once accepted, pen-pals-only entries appear too", %{conn: conn} do
    reader = create_user()
    writer = create_user()
    {:ok, _} = Social.follow(reader.id, writer.id)
    {:ok, _} = Social.accept_follow(reader.id, writer.id)

    public = publish(writer, :public, 1)
    friends = publish(writer, :friends_only, 2)

    ids = feed_ids(conn, reader)
    assert public.id in ids
    assert friends.id in ids
  end

  test "someone who hasn't been asked doesn't appear", %{conn: conn} do
    reader = create_user()
    stranger = create_user()
    e = publish(stranger, :public, 1)
    refute e.id in feed_ids(conn, reader)
  end

  test "reprints by someone you've asked to follow appear", %{conn: conn} do
    reader = create_user()
    writer = create_user()
    stranger = create_user()
    {:ok, _} = Social.follow(reader.id, writer.id)

    theirs = publish(stranger, :public, 1)
    {:ok, _} = Reprints.toggle_reprint(writer.id, theirs.id)

    data = conn |> log_in_user(reader) |> get("/api/feed") |> json_response(200) |> Map.fetch!("data")
    assert [%{"source" => "reprint"}] = Enum.filter(data, &(&1["id"] == theirs.id))
  end

  test "a blocked writer stays out even with an old request", %{conn: conn} do
    reader = create_user()
    writer = create_user()
    {:ok, _} = Social.follow(reader.id, writer.id)
    e = publish(writer, :public, 1)
    {:ok, _} = Social.block(writer.id, reader.id)

    refute e.id in feed_ids(conn, reader)
  end
end
