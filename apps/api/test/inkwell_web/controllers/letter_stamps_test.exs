defmodule InkwellWeb.LetterStampsTest do
  @moduledoc """
  Stamps on letters: the writer picks one for the envelope; each letter
  carries its own. Keepsakes need Plus, retired designs can't be picked,
  letters to fediverse accounts carry none, and letters from them show the
  airmail frame.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Letters
  alias Inkwell.Letters.DirectMessage
  alias InkwellWeb.FederationController

  defp pen_pals(a, b) do
    create_relationship(follower_id: a.id, following_id: b.id, status: :accepted, is_mutual: true)
    create_relationship(follower_id: b.id, following_id: a.id, status: :accepted, is_mutual: true)
  end

  defp send(conn, user, conv, params) do
    conn
    |> log_in_user(user)
    |> post("/api/conversations/#{conv.id}/letters", Map.merge(%{body_html: "<p>Dear friend</p>"}, params))
  end

  defp make_plus(user),
    do: user |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active") |> Repo.update!()

  setup do
    alice = create_user()
    bob = create_user()
    pen_pals(alice, bob)
    {:ok, conv} = Letters.get_or_create_conversation(alice.id, bob.username)
    %{alice: alice, bob: bob, conv: conv}
  end

  test "a letter carries the stamp its writer chose, and both people see it", %{
    conn: conn,
    alice: alice,
    bob: bob,
    conv: conv
  } do
    sent = conn |> send(alice, conv, %{stamp_type: "felt"}) |> json_response(201)
    assert sent["data"]["stamp_type"] == "felt"
    assert is_nil(sent["data"]["stamp_domain"])

    thread =
      build_conn()
      |> log_in_user(bob)
      |> get("/api/conversations/#{conv.id}")
      |> json_response(200)

    assert [%{"stamp_type" => "felt"}] = thread["data"]["messages"]
  end

  test "no stamp is fine, and blank means none", %{conn: conn, alice: alice, conv: conv} do
    assert is_nil(json_response(send(conn, alice, conv, %{}), 201)["data"]["stamp_type"])
    assert is_nil(json_response(send(build_conn(), alice, conv, %{stamp_type: ""}), 201)["data"]["stamp_type"])
  end

  test "seasonal issues are free", %{conn: conn, alice: alice, conv: conv} do
    assert json_response(send(conn, alice, conv, %{stamp_type: "autumn_2026"}), 201)["data"]["stamp_type"] ==
             "autumn_2026"
  end

  test "Keepsakes need Plus", %{conn: conn, alice: alice, conv: conv} do
    res = send(conn, alice, conv, %{stamp_type: "wax_seal"})
    assert json_response(res, 403)["code"] == "plus_required"
    assert Repo.aggregate(DirectMessage, :count) == 0

    alice = make_plus(alice)
    res = send(build_conn(), alice, conv, %{stamp_type: "wax_seal"})
    assert json_response(res, 201)["data"]["stamp_type"] == "wax_seal"
  end

  test "retired, made-up and fediverse-only designs are refused", %{conn: conn, alice: alice, conv: conv} do
    assert json_response(send(conn, alice, conv, %{stamp_type: "throwback"}), 400)["code"] == "retired"
    assert json_response(send(build_conn(), alice, conv, %{stamp_type: "abroad"}), 400)["code"] == "invalid_stamp"
    assert json_response(send(build_conn(), alice, conv, %{stamp_type: "bogus"}), 400)["code"] == "invalid_stamp"
    assert json_response(send(build_conn(), alice, conv, %{stamp_type: 5}), 400)["code"] == "invalid_stamp"
    assert Repo.aggregate(DirectMessage, :count) == 0
  end

  test "editing a letter keeps its stamp", %{conn: conn, alice: alice, conv: conv} do
    id = json_response(send(conn, alice, conv, %{stamp_type: "thank_you"}), 201)["data"]["id"]

    res =
      build_conn()
      |> log_in_user(alice)
      |> patch("/api/conversations/#{conv.id}/letters/#{id}", %{body_html: "<p>Dear Bob</p>", stamp_type: "felt"})

    assert json_response(res, 200)["data"]["stamp_type"] == "thank_you"
  end

  test "the schema refuses a design that can't be picked" do
    refute DirectMessage.changeset(%DirectMessage{}, %{
             conversation_id: Ecto.UUID.generate(),
             sender_id: Ecto.UUID.generate(),
             body: "hi",
             stamp_type: "i_cannot"
           }).valid?
  end

  describe "fediverse letters" do
    setup do
      published = DateTime.utc_now() |> DateTime.add(-400, :day) |> DateTime.to_iso8601()
      user = create_user()

      actor =
        create_remote_actor(%{domain: "mastodon.example", raw_data: %{"published" => published}})

      create_relationship(remote_actor_id: actor.id, following_id: user.id, status: :accepted)
      member_url = "https://inkwell.test/users/#{user.username}"

      Oban.Testing.with_testing_mode(:manual, fn ->
        FederationController.process_activity_async(
          %{
            "type" => "Create",
            "actor" => actor.ap_id,
            "object" => %{
              "type" => "Note",
              "id" => "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
              "attributedTo" => actor.ap_id,
              "to" => [member_url],
              "cc" => [],
              "content" => "<p>hello from afar</p>",
              "tag" => [%{"type" => "Mention", "href" => member_url}]
            }
          },
          nil
        )
      end)

      [{conv, _, _, _, _}] = Letters.list_conversations(user.id, :inbox)
      %{user: user, actor: actor, conv: conv}
    end

    test "a letter from abroad has the airmail frame, postmarked from their server", %{
      conn: conn,
      user: user,
      conv: conv
    } do
      thread = conn |> log_in_user(user) |> get("/api/conversations/#{conv.id}") |> json_response(200)
      assert [%{"stamp_type" => "abroad", "stamp_domain" => "mastodon.example"}] = thread["data"]["messages"]
    end

    test "a letter to a fediverse account carries no stamp", %{conn: conn, user: user, conv: conv} do
      Oban.Testing.with_testing_mode(:manual, fn ->
        res = send(conn, user, conv, %{stamp_type: "felt"})
        assert is_nil(json_response(res, 201)["data"]["stamp_type"])
      end)

      assert Repo.one!(from m in DirectMessage, where: not is_nil(m.sender_id)).stamp_type == nil
    end
  end
end
