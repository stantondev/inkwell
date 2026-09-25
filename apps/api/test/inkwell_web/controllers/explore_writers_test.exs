defmodule InkwellWeb.ExploreWritersTest do
  @moduledoc """
  "Writers to meet" on Explore (and the writer suggestions everywhere else):
  works signed out, leaves out people you follow and spam, and isn't emptied
  by following a fediverse account.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Accounts, Journals, Social}

  defp writer(entries \\ 3) do
    u = create_user()

    for n <- 1..entries do
      {:ok, _} =
        Journals.create_entry(%{
          user_id: u.id,
          title: "Entry #{n}",
          body_html: "<p>Some words #{n}.</p>",
          privacy: :public,
          status: :published,
          published_at: DateTime.add(DateTime.utc_now(), -n * 60, :second)
        })
    end

    u
  end

  defp names(conn, path \\ "/api/explore/writers") do
    conn |> get(path) |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["username"])
  end

  test "works signed out", %{conn: conn} do
    w = writer()
    assert w.username in names(conn)
  end

  test "leaves out you and people you follow or asked to follow", %{conn: conn} do
    me = writer()
    followed = writer()
    requested = writer()
    other = writer()
    {:ok, _} = Social.follow(me.id, requested.id)
    {:ok, _} = Social.follow(me.id, followed.id)
    {:ok, _} = Social.accept_follow(me.id, followed.id)

    list = names(log_in_user(conn, me))
    assert other.username in list
    refute me.username in list
    refute followed.username in list
    refute requested.username in list
  end

  test "following a fediverse account doesn't empty the list", %{conn: conn} do
    me = create_user()
    other = writer()
    actor = create_remote_actor()

    %Inkwell.Social.Relationship{}
    |> Inkwell.Social.Relationship.changeset(%{follower_id: me.id, remote_actor_id: actor.id, status: :accepted})
    |> Inkwell.Repo.insert!()

    assert other.username in names(log_in_user(conn, me))
    # Onboarding and the empty Feed use the same list.
    assert Enum.any?(Accounts.list_suggested_users(me.id), &(&1.user.id == other.id))
  end

  test "spam-limited and suspended accounts are left out", %{conn: conn} do
    limited = writer()
    limited |> Ecto.Changeset.change(moderation_state: "limited") |> Inkwell.Repo.update!()
    suspended = writer()
    suspended |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Inkwell.Repo.update!()

    list = names(conn)
    refute limited.username in list
    refute suspended.username in list
  end

  test "no padding with people who haven't written", %{conn: conn} do
    silent = create_user()
    refute silent.username in names(conn)
  end
end
