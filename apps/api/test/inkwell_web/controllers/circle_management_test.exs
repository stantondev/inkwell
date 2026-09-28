defmodule InkwellWeb.CircleManagementTest do
  @moduledoc """
  Owners can edit, delete and hand over their circles; admins can edit and
  delete any circle (roadmap "More Circle features", @zaexpcake, 2026-09-27).
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.{Notification, User}
  alias Inkwell.Circles
  alias Inkwell.Circles.Circle
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp established(attrs \\ %{}) do
    user = create_user(attrs)
    old = NaiveDateTime.add(NaiveDateTime.utc_now(), -30 * 86_400, :second)
    from(u in User, where: u.id == ^user.id) |> Repo.update_all(set: [inserted_at: old])
    Repo.get!(User, user.id)
  end

  defp admin do
    user = established()
    from(u in User, where: u.id == ^user.id) |> Repo.update_all(set: [role: "admin"])
    Repo.get!(User, user.id)
  end

  defp conn_for(user), do: build_conn() |> log_in_user(user)

  defp make_circle(owner) do
    conn_for(owner)
    |> post("/api/circles", %{name: "Night Owls", category: "writing_craft", description: "<p>Late drafts.</p>"})
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp join(user, circle), do: conn_for(user) |> post("/api/circles/#{circle["id"]}/join") |> json_response(200)

  describe "editing" do
    test "the owner can rename a circle and change its description; the slug stays" do
      owner = established()
      circle = make_circle(owner)

      data =
        conn_for(owner)
        |> patch("/api/circles/#{circle["id"]}", %{name: "Early Birds", description: "<p>Morning pages.</p>"})
        |> json_response(200)
        |> Map.fetch!("data")

      assert data["name"] == "Early Birds"
      assert data["description"] =~ "Morning pages."
      assert data["slug"] == circle["slug"]
      assert data["viewer_role"] == "owner"
    end

    test "a blank name is refused" do
      owner = established()
      circle = make_circle(owner)

      conn_for(owner) |> patch("/api/circles/#{circle["id"]}", %{name: ""}) |> json_response(422)
      assert Repo.get!(Circle, circle["id"]).name == "Night Owls"
    end

    test "only name, description and category can change" do
      owner = established()
      circle = make_circle(owner)
      other = established()

      conn_for(owner)
      |> patch("/api/circles/#{circle["id"]}", %{name: "Renamed", owner_id: other.id, member_count: 99})
      |> json_response(200)

      c = Repo.get!(Circle, circle["id"])
      assert c.owner_id == owner.id
      assert c.member_count == 1
    end

    test "moderators and members can't edit" do
      owner = established()
      circle = make_circle(owner)
      mod = established()
      join(mod, circle)
      conn_for(owner) |> patch("/api/circles/#{circle["id"]}/members/#{mod.id}", %{role: "moderator"}) |> json_response(200)

      conn_for(mod) |> patch("/api/circles/#{circle["id"]}", %{name: "Mine now"}) |> json_response(403)
    end

    test "an admin can edit any circle" do
      circle = make_circle(established())
      conn_for(admin()) |> patch("/api/circles/#{circle["id"]}", %{description: ""}) |> json_response(200)
      assert Repo.get!(Circle, circle["id"]).description in [nil, ""]
    end
  end

  describe "deleting" do
    test "the owner can delete; members-only posts become private and stay on the journal" do
      owner = established()
      circle = make_circle(owner)
      member = established()
      join(member, circle)

      entry =
        conn_for(member)
        |> post("/api/entries", %{title: "Just us", body_html: "<p>Words.</p>", privacy: "circle", circle_id: circle["id"]})
        |> json_response(201)
        |> Map.fetch!("data")

      conn_for(owner) |> delete("/api/circles/#{circle["id"]}") |> json_response(200)

      refute Repo.get(Circle, circle["id"])
      e = Repo.get!(Entry, entry["id"])
      assert e.circle_id == nil
      assert e.privacy == :private
    end

    test "members can't delete, admins can" do
      circle = make_circle(established())
      member = established()
      join(member, circle)

      conn_for(member) |> delete("/api/circles/#{circle["id"]}") |> json_response(403)
      assert Repo.get(Circle, circle["id"])

      conn_for(admin()) |> delete("/api/circles/#{circle["id"]}") |> json_response(200)
      refute Repo.get(Circle, circle["id"])
    end

    test "the circle page tells admins they can moderate it, and nobody else" do
      circle = make_circle(established())
      data = conn_for(admin()) |> get("/api/circles/#{circle["slug"]}") |> json_response(200) |> Map.fetch!("data")
      assert data["can_admin"] == true

      data = conn_for(established()) |> get("/api/circles/#{circle["slug"]}") |> json_response(200) |> Map.fetch!("data")
      refute data["can_admin"]
    end
  end

  describe "handing a circle over" do
    test "the new owner takes over, the old owner stays on as a moderator and can then leave" do
      owner = established()
      circle = make_circle(owner)
      heir = established()
      join(heir, circle)

      data =
        conn_for(owner)
        |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: heir.id})
        |> json_response(200)
        |> Map.fetch!("data")

      assert data["owner"]["id"] == heir.id
      assert data["viewer_role"] == "moderator"
      assert Repo.get!(Circle, circle["id"]).owner_id == heir.id
      assert Circles.get_user_role(circle["id"], heir.id) == :owner
      assert Circles.get_user_role(circle["id"], owner.id) == :moderator

      assert Repo.exists?(
               from(n in Notification,
                 where: n.user_id == ^heir.id and n.type == :circle_owner and n.actor_id == ^owner.id
               )
             )

      # The new owner runs it now; the old one can't edit any more, but can leave.
      conn_for(heir) |> patch("/api/circles/#{circle["id"]}", %{name: "Heir's Circle"}) |> json_response(200)
      conn_for(owner) |> patch("/api/circles/#{circle["id"]}", %{name: "Take it back"}) |> json_response(403)
      conn_for(owner) |> delete("/api/circles/#{circle["id"]}/leave") |> json_response(200)
      conn_for(heir) |> delete("/api/circles/#{circle["id"]}/leave") |> json_response(403)
    end

    test "only to a member" do
      owner = established()
      circle = make_circle(owner)
      outsider = established()

      conn_for(owner)
      |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: outsider.id})
      |> json_response(422)

      assert Repo.get!(Circle, circle["id"]).owner_id == owner.id
    end

    test "not to a suspended account" do
      owner = established()
      circle = make_circle(owner)
      heir = established()
      join(heir, circle)
      from(u in User, where: u.id == ^heir.id) |> Repo.update_all(set: [blocked_at: DateTime.utc_now()])

      conn_for(owner) |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: heir.id}) |> json_response(422)
      assert Circles.get_user_role(circle["id"], owner.id) == :owner
    end

    test "only the owner can hand it over, not a moderator or an admin" do
      owner = established()
      circle = make_circle(owner)
      mod = established()
      join(mod, circle)
      conn_for(owner) |> patch("/api/circles/#{circle["id"]}/members/#{mod.id}", %{role: "moderator"}) |> json_response(200)

      conn_for(mod) |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: mod.id}) |> json_response(403)
      conn_for(admin()) |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: mod.id}) |> json_response(403)
      assert Repo.get!(Circle, circle["id"]).owner_id == owner.id
    end

    test "to yourself, or with no one chosen, is refused" do
      owner = established()
      circle = make_circle(owner)

      conn_for(owner) |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: owner.id}) |> json_response(422)
      conn_for(owner) |> post("/api/circles/#{circle["id"]}/transfer", %{}) |> json_response(422)
      conn_for(owner) |> post("/api/circles/#{circle["id"]}/transfer", %{user_id: "not-a-uuid"}) |> json_response(422)
    end
  end
end
