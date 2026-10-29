defmodule Inkwell.Federation.MentionPostsTest do
  @moduledoc """
  Replying to a fediverse post that mentions a member: Reply on the
  notification saves the post so a footnote can answer it in the thread.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Accounts
  alias Inkwell.Federation.{RemoteEntries, RemoteEntry}

  @public "https://www.w3.org/ns/activitystreams#Public"
  @post_id "https://social.example/users/asker/statuses/1"
  @post_url "https://social.example/@asker/1"

  setup do
    user = create_user()

    actor =
      create_remote_actor(
        username: "asker",
        domain: "social.example",
        ap_id: "https://social.example/users/asker",
        inbox: "https://social.example/users/asker/inbox"
      )

    on_exit(fn -> Application.delete_env(:inkwell, :mention_post_fetcher) end)
    %{user: user, actor: actor}
  end

  defp mention(user, actor, data \\ %{}) do
    {:ok, n} =
      Accounts.create_notification(%{
        user_id: user.id,
        type: :fediverse_mention,
        data:
          Map.merge(
            %{
              "remote_actor" => %{"ap_id" => actor.ap_id, "domain" => actor.domain},
              "post_url" => @post_url,
              "post_id" => @post_id,
              "public" => true
            },
            data
          )
      })

    n
  end

  defp object(overrides \\ %{}) do
    Map.merge(
      %{
        "id" => @post_id,
        "type" => "Note",
        "url" => @post_url,
        "attributedTo" => "https://social.example/users/asker",
        "content" => "<p>@stanton is there going to be an app? #inkwell</p>",
        "published" => "2026-10-29T12:00:00Z",
        "to" => [@public],
        "cc" => ["https://social.example/users/asker/followers"],
        "tag" => [%{"type" => "Hashtag", "name" => "#Inkwell"}]
      },
      overrides
    )
  end

  defp serve(object) do
    test = self()

    Application.put_env(:inkwell, :mention_post_fetcher, fn url ->
      send(test, {:fetched, url})
      {:ok, object}
    end)
  end

  defp reply(conn, user, n), do: conn |> log_in_user(user) |> post("/api/notifications/#{n.id}/reply")

  test "saves the post and returns its id", %{conn: conn, user: user, actor: actor} do
    serve(object())
    n = mention(user, actor)

    assert %{"data" => %{"remote_entry_id" => id}} = conn |> reply(user, n) |> json_response(200)
    assert_received {:fetched, @post_id}

    entry = Repo.get!(RemoteEntry, id)
    assert entry.ap_id == @post_id
    assert entry.source == "mention"
    assert entry.remote_actor_id == actor.id
    assert entry.tags == ["inkwell"]
  end

  test "a second Reply reuses the saved post", %{conn: conn, user: user, actor: actor} do
    serve(object())
    n = mention(user, actor)
    %{"data" => %{"remote_entry_id" => first}} = conn |> reply(user, n) |> json_response(200)

    Application.put_env(:inkwell, :mention_post_fetcher, fn _ -> flunk("fetched again") end)
    assert %{"data" => %{"remote_entry_id" => ^first}} = build_conn() |> reply(user, n) |> json_response(200)
  end

  test "older notifications without post_id use the post's page", %{conn: conn, user: user, actor: actor} do
    serve(object())
    n = mention(user, actor, %{"post_id" => nil})

    assert %{"data" => %{"remote_entry_id" => _}} = conn |> reply(user, n) |> json_response(200)
    assert_received {:fetched, @post_url}
  end

  test "saved mention posts stay off Explore", %{conn: conn, user: user, actor: actor} do
    serve(object())
    conn |> reply(user, mention(user, actor)) |> json_response(200)

    refute Enum.any?(RemoteEntries.list_public_remote_entries(), &(&1.ap_id == @post_id))
  end

  test "private mentions can't be fetched", %{conn: conn, user: user, actor: actor} do
    serve(object())
    n = mention(user, actor, %{"public" => false})

    assert %{"code" => "not_public"} = conn |> reply(user, n) |> json_response(422)
    refute_received {:fetched, _}
  end

  test "a post that turned out not to be public isn't saved", %{conn: conn, user: user, actor: actor} do
    serve(object(%{"to" => ["https://social.example/users/asker/followers"], "cc" => []}))

    assert %{"code" => "not_public"} = conn |> reply(user, mention(user, actor)) |> json_response(422)
    refute RemoteEntries.get_by_ap_id(@post_id)
  end

  test "a post by someone else than the mention's sender is refused", %{conn: conn, user: user, actor: actor} do
    serve(object(%{"attributedTo" => "https://social.example/users/impostor"}))

    assert %{"code" => "unavailable"} = conn |> reply(user, mention(user, actor)) |> json_response(502)
    refute RemoteEntries.get_by_ap_id(@post_id)
  end

  test "someone else's notification is not found", %{conn: conn, user: user, actor: actor} do
    serve(object())
    n = mention(create_user(), actor)

    assert conn |> reply(user, n) |> json_response(404)
    refute_received {:fetched, _}
  end

  test "an account the member blocked is refused", %{conn: conn, user: user, actor: actor} do
    serve(object())
    {:ok, _} = Inkwell.Moderation.FediverseBlocks.block_domain(user.id, "social.example")

    assert %{"code" => "blocked"} = conn |> reply(user, mention(user, actor)) |> json_response(403)
  end

  test "when their server doesn't answer, says so", %{conn: conn, user: user, actor: actor} do
    Application.put_env(:inkwell, :mention_post_fetcher, fn _ -> {:error, {:http_error, 404}} end)

    assert %{"code" => "unavailable"} = conn |> reply(user, mention(user, actor)) |> json_response(502)
  end
end
