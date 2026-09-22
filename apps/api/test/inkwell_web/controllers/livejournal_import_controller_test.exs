defmodule InkwellWeb.LivejournalImportControllerTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo}

  @page """
  <script>Site.entry = {"eventtime":1103659200,"title":"Hello 2004","is_public":true}; x={"replycount":2}</script>
  <article><div class="aentry-post__text aentry-post__text--view">First post!<br />Yay.</div></article>
  """

  setup do
    host = "https://someone.livejournal.com"

    pages = %{
      "#{host}/calendar/" => ~s(<a href="#{host}/2004/">2004</a>),
      "#{host}/2004/" => ~s(<a href="#{host}/2004/12/21/">21</a>),
      "#{host}/2004/12/21/" => ~s(<a href="#{host}/100.html">x</a>),
      "#{host}/100.html" => @page,
      "#{host}/__rpc_get_thread?journal=someone&itemid=100&flat=&skip=&expand_all=1&thread=" =>
        Jason.encode!(%{
          "comments" => [
            %{"dtalkid" => 1, "level" => 1, "loaded" => 1, "shown" => 1, "deleted" => 0, "dname" => "a_friend", "article" => "welcome!", "ctime_ts" => 1_103_700_000, "subject" => "", "thread_url" => "#{host}/100.html?thread=1"},
            %{"dtalkid" => 2, "level" => 2, "loaded" => 1, "shown" => 1, "deleted" => 0, "dname" => "someone", "commenter_is_poster" => 1, "article" => "thank you", "ctime_ts" => 1_103_800_000, "subject" => ""}
          ]
        })
    }


    Application.put_env(:inkwell, :livejournal_fetcher, fn url ->
      if Map.has_key?(pages, url), do: {:ok, pages[url]}, else: {:error, :not_found}
    end)

    on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)
    :ok
  end

  test "the no-login import needs the writer to confirm it's their journal" do
    user = create_user()

    conn =
      build_conn()
      |> log_in_user(user)
      |> post("/api/me/import", %{"format" => "livejournal_public", "username" => "someone"})

    assert json_response(conn, 422)["error"] =~ "confirm"
  end

  test "imports public entries as private drafts, dated and marked as imported" do
    user = create_user()

    conn =
      build_conn()
      |> log_in_user(user)
      |> post("/api/me/import", %{
        "format" => "livejournal_public",
        "username" => "https://someone.livejournal.com/",
        "confirm_owner" => "true"
      })

    assert json_response(conn, 201)["data"]["file_name"] == "livejournal:someone"

    [entry] = Journals.list_drafts(user.id, []) |> Enum.map(&Repo.reload/1)
    assert entry.title == "Hello 2004"
    assert entry.published_at == ~U[2004-12-21 20:00:00.000000Z]
    assert entry.privacy == :private
    assert entry.source == "import"
    assert entry.body_html =~ "First post!"
  end

  defp comments_for(entry) do
    import Ecto.Query
    Inkwell.Journals.Comment |> where(entry_id: ^entry.id) |> order_by(:inserted_at) |> Repo.all()
  end

  test "brings the comments, credits the writer's own replies, keeps dates, no notifications" do
    user = create_user()

    build_conn()
    |> log_in_user(user)
    |> post("/api/me/import", %{"format" => "livejournal_public", "username" => "someone", "confirm_owner" => "true"})
    |> json_response(201)

    [entry] = Journals.list_drafts(user.id, [])
    assert [friend, mine] = comments_for(entry)

    assert friend.user_id == nil
    assert friend.remote_author["username"] == "a_friend"
    assert friend.remote_author["source"] == "livejournal"
    assert friend.remote_author["profile_url"] == "https://a-friend.livejournal.com/"
    assert DateTime.to_unix(friend.inserted_at) == 1_103_700_000

    assert mine.user_id == user.id
    assert mine.parent_comment_id == friend.id

    import Ecto.Query
    refute Repo.exists?(from n in Inkwell.Accounts.Notification, where: n.user_id == ^user.id)

    %{"data" => status} = build_conn() |> log_in_user(user) |> get("/api/me/import") |> json_response(200)
    assert status["comments_imported"] == 2
  end

  test "running the import again adds comments to entries that came over without them" do
    user = create_user()

    {:ok, _} =
      Journals.create_draft(%{
        "user_id" => user.id,
        "title" => "Hello 2004",
        "body_html" => "<p>First post!</p>",
        "published_at" => ~U[2004-12-21 20:00:00Z],
        "privacy" => "private"
      })

    build_conn()
    |> log_in_user(user)
    |> post("/api/me/import", %{"format" => "livejournal_public", "username" => "someone", "confirm_owner" => "true"})
    |> json_response(201)

    assert [entry] = Journals.list_drafts(user.id, [])
    assert length(comments_for(entry)) == 2
  end

  test "an overlong title no longer fails the whole import" do
    user = create_user()
    long = String.duplicate("x", 400)

    host = "https://someone.livejournal.com"

    pages = %{
      "#{host}/calendar/" => ~s(<a href="#{host}/2004/">2004</a>),
      "#{host}/2004/" => ~s(<a href="#{host}/2004/12/21/">21</a>),
      "#{host}/2004/12/21/" => ~s(<a href="#{host}/100.html">x</a>),
      "#{host}/100.html" => String.replace(@page, "Hello 2004", long) |> String.replace(~s("replycount":2), ~s("replycount":0))
    }

    Application.put_env(:inkwell, :livejournal_fetcher, fn url ->
      if Map.has_key?(pages, url), do: {:ok, pages[url]}, else: {:error, :not_found}
    end)

    build_conn()
    |> log_in_user(user)
    |> post("/api/me/import", %{"format" => "livejournal_public", "username" => "someone", "confirm_owner" => "true"})
    |> json_response(201)

    assert [entry] = Journals.list_drafts(user.id, [])
    assert String.length(entry.title) == 255
  end
end
