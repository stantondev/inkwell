defmodule InkwellWeb.DeclinedFollowRequestTest do
  @moduledoc """
  Declining a pen pal request must stay declined: the Accept/Decline buttons
  used to come back on refresh, because they were shown for any request that
  wasn't accepted, including ones already declined.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Accounts

  defp request(requester, target) do
    create_relationship(follower_id: requester.id, following_id: target.id, status: :pending)

    {:ok, _} =
      Accounts.create_notification(%{
        user_id: target.id,
        type: :follow_request,
        actor_id: requester.id,
        target_type: "user",
        target_id: requester.id
      })
  end

  defp follow_request_rows(conn, user) do
    conn
    |> log_in_user(user)
    |> get("/api/notifications")
    |> json_response(200)
    |> Map.fetch!("data")
    |> Enum.filter(&(&1["type"] == "follow_request"))
  end

  test "a waiting request is marked pending", %{conn: conn} do
    me = create_user()
    them = create_user()
    request(them, me)

    assert [%{"follow_pending" => true, "follow_accepted" => false}] = follow_request_rows(conn, me)
  end

  test "declining removes the request notification", %{conn: conn} do
    me = create_user()
    them = create_user()
    request(them, me)

    conn |> log_in_user(me) |> delete("/api/relationships/#{them.username}/reject") |> json_response(200)

    assert follow_request_rows(build_conn(), me) == []
  end

  test "an old notification for a declined request shows no buttons", %{conn: conn} do
    me = create_user()
    them = create_user()
    request(them, me)
    # The request is gone (declined before this fix) but the notification stayed.
    Inkwell.Social.reject_follow(them.id, me.id)

    assert [%{"follow_pending" => false, "follow_accepted" => false}] = follow_request_rows(conn, me)
  end

  test "suspending an account withdraws its unanswered requests", %{conn: conn} do
    me = create_user()
    spammer = create_user()
    request(spammer, me)

    {:ok, _} = Accounts.block_user(spammer)

    assert follow_request_rows(conn, me) == []
    assert {:error, :not_found} = Inkwell.Social.get_relationship(spammer.id, me.id)
  end
end
