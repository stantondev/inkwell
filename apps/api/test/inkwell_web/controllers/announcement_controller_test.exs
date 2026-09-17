defmodule InkwellWeb.AnnouncementControllerTest do
  use InkwellWeb.ConnCase, async: false

  defp admin do
    create_user() |> Ecto.Changeset.change(role: "admin") |> Inkwell.Repo.update!()
  end

  test "non-admins are refused", %{conn: conn} do
    res = conn |> log_in_user(create_user()) |> get("/api/admin/announcement")
    assert res.status in [401, 403]
  end

  test "send requires the exact recipient count", %{conn: conn} do
    a = admin()
    count = conn |> log_in_user(a) |> get("/api/admin/announcement") |> json_response(200) |> Map.fetch!("recipient_count")

    wrong =
      build_conn() |> log_in_user(a)
      |> post("/api/admin/announcement/send", %{subject: "s", body: "b", confirm_count: count + 5})

    assert json_response(wrong, 409)["recipient_count"] == count

    Oban.Testing.with_testing_mode(:manual, fn ->
      right =
        build_conn() |> log_in_user(a)
        |> post("/api/admin/announcement/send", %{subject: "s", body: "b", confirm_count: count})

      assert json_response(right, 200)["queued"] == count
    end)
  end
end
