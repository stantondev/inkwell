defmodule InkwellWeb.PenPalExchangeTest do
  @moduledoc """
  The pen pal exchange (2026-11-11): opt-in introductions between two
  members, matched when the second one asks, with a conversation both can
  write in without following each other.
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.{Journals, Letters, PenPalExchange, Repo, Social}
  alias Inkwell.Accounts.{Notification, User}
  alias Inkwell.PenPalExchange.Request

  defp writer(attrs \\ %{}) do
    user = create_user(attrs)

    {:ok, _} =
      Journals.create_entry(%{
        user_id: user.id,
        title: "Hello from #{user.username}",
        body_html: "<p>A first page.</p>",
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now()
      })

    user
  end

  defp as(user), do: build_conn() |> log_in_user(user)
  defp join(user, note \\ nil), do: as(user) |> post("/api/pen-pal-exchange", %{"note" => note})
  defp status(user), do: as(user) |> get("/api/pen-pal-exchange") |> json_response(200) |> Map.fetch!("data")

  defp age_match(user, days) do
    past = DateTime.add(DateTime.utc_now(), -days * 86_400, :second)
    Repo.update_all(from(r in Request, where: r.user_id == ^user.id and r.status == "matched"), set: [matched_at: past])
  end

  test "the first to ask waits; the second is introduced on the spot" do
    ada = writer()
    ben = writer()

    first = join(ada, "I write about gardens  and\nold maps") |> json_response(200)
    assert first["matched"] == false
    assert first["data"]["state"] == "waiting"
    assert first["data"]["note"] == "I write about gardens and old maps"

    second = join(ben, "Poems, mostly") |> json_response(200)
    assert second["matched"] == true
    conv_id = second["conversation_id"]

    for {me, them} <- [{ada, ben}, {ben, ada}] do
      s = status(me)
      assert s["state"] == "introduced"
      assert s["introduction"]["conversation_id"] == conv_id
      assert s["introduction"]["other_user"]["username"] == them.username
      assert s["introduction"]["written"] == false
      refute String.starts_with?(s["introduction"]["other_user"]["avatar_url"] || "", "data:")

      assert Repo.exists?(
               from n in Notification,
                 where: n.user_id == ^me.id and n.actor_id == ^them.id and n.type == :pen_pal_match
             )
    end
  end

  test "two people who were introduced can write without following each other" do
    ada = writer()
    ben = writer()
    join(ada, "Gardens")
    conv_id = (join(ben, "Poems") |> json_response(200))["conversation_id"]

    thread = as(ada) |> get("/api/conversations/#{conv_id}") |> json_response(200) |> Map.fetch!("data")
    assert thread["can_write"] == true
    assert thread["messages"] == []
    intro = thread["introduction"]
    assert intro["my_note"] == "Gardens"
    assert intro["their_note"] == "Poems"
    assert intro["their_latest_entry"]["title"] == "Hello from #{ben.username}"
    assert intro["their_latest_entry"]["path"] =~ "/#{ben.username}/"

    assert as(ada)
           |> post("/api/conversations/#{conv_id}/letters", %{"body_html" => "<p>Hello Ben.</p>"})
           |> json_response(201)

    assert as(ben)
           |> post("/api/conversations/#{conv_id}/letters", %{"body_html" => "<p>Hello Ada.</p>"})
           |> json_response(201)

    assert status(ada)["introduction"]["written"] == true
    assert status(ada)["introduction"]["heard_back"] == true
  end

  test "a block stops letters even after an introduction" do
    ada = writer()
    ben = writer()
    join(ada)
    conv_id = (join(ben) |> json_response(200))["conversation_id"]

    Social.block(ben.id, ada.id)

    thread = as(ada) |> get("/api/conversations/#{conv_id}") |> json_response(200) |> Map.fetch!("data")
    assert thread["can_write"] == false
    assert status(ada)["introduction"] == nil
  end

  test "you need a published entry, and held accounts are refused without saying why" do
    blank = create_user()
    resp = join(blank)
    assert json_response(resp, 403)["code"] == "no_entry"
    assert status(blank)["can_join"] == false

    held = writer()
    held |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    body = join(held) |> json_response(403)
    assert body["code"] == "unavailable"
    refute body["error"] =~ "spam"
    refute body["error"] =~ "limited"
  end

  test "nobody is introduced to someone they blocked, already write to, or met here before" do
    ada = writer()
    ben = writer()
    cy = writer()

    # Blocked: Ben waits, Ada (who blocked him) is not matched with him.
    Social.block(ada.id, ben.id)
    join(ben)
    assert (join(ada) |> json_response(200))["matched"] == false

    # Cy is matched with whoever has waited longest and is compatible: Ben.
    matched = join(cy) |> json_response(200)
    assert matched["matched"] == true
    assert status(cy)["introduction"]["other_user"]["username"] == ben.username
    assert status(ada)["state"] == "waiting"

    # Ben and Cy have met; asking again later never pairs them a second time.
    age_match(ben, 8)
    age_match(cy, 8)
    PenPalExchange.leave(ada)
    assert (join(ben) |> json_response(200))["matched"] == false
    assert (join(cy) |> json_response(200))["matched"] == false
  end

  test "people who already exchange letters aren't introduced" do
    ada = writer()
    ben = writer()
    {:ok, conv} = Letters.introduce(ada.id, ben.id)
    {:ok, _} = Letters.send_letter(conv.id, ada.id, "Hi", "<p>Hi</p>")

    join(ada)
    assert (join(ben) |> json_response(200))["matched"] == false
  end

  test "people who already follow each other aren't introduced" do
    ada = writer()
    ben = writer()
    create_relationship(%{follower_id: ada.id, following_id: ben.id, status: :accepted})

    join(ada)
    assert (join(ben) |> json_response(200))["matched"] == false

    # Someone neither of them knows is matched with whoever waited longest.
    cy = writer()
    assert (join(cy) |> json_response(200))["matched"] == true
    assert status(cy)["introduction"]["other_user"]["username"] == ada.username
  end

  test "asking again: after you've written, or after a quiet week" do
    ada = writer()
    ben = writer()
    join(ada)
    conv_id = (join(ben) |> json_response(200))["conversation_id"]

    assert json_response(join(ada), 409)["code"] == "write_first"
    assert status(ada)["reason"] == "write_first"

    # Ada writes: she may ask again. Ben hasn't, and can't yet.
    as(ada) |> post("/api/conversations/#{conv_id}/letters", %{"body_html" => "<p>Hello.</p>"})
    assert status(ada)["can_join"] == true
    assert json_response(join(ben), 409)["code"] == "write_first"

    # A quiet week later Ben can too, and the two waiting people aren't paired again.
    age_match(ben, 8)
    assert (join(ada) |> json_response(200))["matched"] == false
    assert (join(ben) |> json_response(200))["matched"] == false
  end

  test "your name can only be in once, and you can take it back out" do
    ada = writer()
    assert json_response(join(ada), 200)
    assert json_response(join(ada), 409)["code"] == "waiting"

    left = as(ada) |> delete("/api/pen-pal-exchange") |> json_response(200)
    assert left["data"]["state"] == "idle"
    assert left["data"]["can_join"] == true

    # Nobody is matched with someone who left.
    ben = writer()
    assert (join(ben) |> json_response(200))["matched"] == false
  end

  test "a suspended account waiting in line is skipped" do
    ada = writer()
    join(ada)
    Repo.get!(User, ada.id) |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

    ben = writer()
    assert (join(ben) |> json_response(200))["matched"] == false
  end

  test "a long line is refused, and signed-out visitors get nothing" do
    ada = writer()
    assert json_response(join(ada, String.duplicate("a", 201)), 422)["code"] == "invalid_note"
    assert build_conn() |> get("/api/pen-pal-exchange") |> response(401)
  end

  test "the email names the pen pal and links to the thread, never a letter" do
    ada = writer(%{display_name: "Ada"})
    ben = writer(%{display_name: "Ben"})
    join(ada, "Gardens")
    conv_id = (join(ben, "Poems") |> json_response(200))["conversation_id"]

    {subject, body} = PenPalExchange.email_content(Repo.get!(User, ada.id), Repo.get!(User, ben.id), conv_id)
    assert subject == "Your pen pal is here: Ben"
    assert body =~ "/letters/#{conv_id}"
    assert body =~ "“Poems”"
  end
end
