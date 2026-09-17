defmodule InkwellWeb.ModerationAdminControllerTest do
  use InkwellWeb.ConnCase, async: false

  defp admin, do: create_user() |> Ecto.Changeset.change(role: "admin") |> Inkwell.Repo.update!()

  test "non-admins can't see moderation", %{conn: conn} do
    res = conn |> log_in_user(create_user()) |> get("/api/admin/moderation")
    assert res.status in [401, 403]
  end

  test "admin can list and check an account", %{conn: conn} do
    a = admin()
    u = create_user()
    list = conn |> log_in_user(a) |> get("/api/admin/moderation") |> json_response(200)
    assert is_list(list["data"])

    check = build_conn() |> log_in_user(a) |> get("/api/admin/moderation/check", %{username: u.username}) |> json_response(200)
    assert check["decision"] in ["none", "exempt"]
  end

  test "suspended profiles 404 for the public but not for admins", %{conn: conn} do
    u = create_user()
    {:ok, _} = Inkwell.Accounts.block_user(u)
    assert conn |> get("/api/users/#{u.username}") |> json_response(404)
    assert build_conn() |> log_in_user(admin()) |> get("/api/users/#{u.username}") |> json_response(200)
  end
end
