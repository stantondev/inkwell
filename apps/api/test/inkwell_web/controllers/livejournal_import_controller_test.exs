defmodule InkwellWeb.LivejournalImportControllerTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo}

  @page """
  <script>Site.entry = {"eventtime":1103659200,"title":"Hello 2004","is_public":true};</script>
  <article><div class="aentry-post__text aentry-post__text--view">First post!<br />Yay.</div></article>
  """

  setup do
    host = "https://someone.livejournal.com"

    pages = %{
      "#{host}/calendar/" => ~s(<a href="#{host}/2004/">2004</a>),
      "#{host}/2004/" => ~s(<a href="#{host}/2004/12/21/">21</a>),
      "#{host}/2004/12/21/" => ~s(<a href="#{host}/100.html">x</a>),
      "#{host}/100.html" => @page
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
end
