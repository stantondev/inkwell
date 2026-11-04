defmodule InkwellWeb.NotificationPagingTest do
  use InkwellWeb.ConnCase, async: true

  alias Inkwell.Accounts.Notification

  # 25 notifications, newest first; only the oldest is unread.
  defp seed(user) do
    base = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    for i <- 1..25 do
      Repo.insert!(%Notification{
        user_id: user.id,
        type: :new_entry,
        read: i != 25,
        data: %{"n" => i},
        inserted_at: DateTime.add(base, -i * 60, :second)
      })
    end
  end

  test "pages through notifications and says when there are more", %{conn: conn} do
    user = create_user()
    seed(user)
    conn = log_in_user(conn, user)

    first = conn |> get("/api/notifications") |> json_response(200)
    assert length(first["data"]) == 20
    assert first["meta"]["has_more"] == true

    second = conn |> get("/api/notifications?page=2") |> json_response(200)
    assert length(second["data"]) == 5
    assert second["meta"]["has_more"] == false

    ids = Enum.map(first["data"] ++ second["data"], & &1["id"])
    assert length(Enum.uniq(ids)) == 25
  end

  test "unread=1 finds an unread notification beyond the first page", %{conn: conn} do
    user = create_user()
    seed(user)
    conn = log_in_user(conn, user)

    first = conn |> get("/api/notifications") |> json_response(200)
    refute Enum.any?(first["data"], &(&1["read"] == false))

    unread = conn |> get("/api/notifications?unread=1") |> json_response(200)
    assert [%{"read" => false}] = unread["data"]
  end
end
