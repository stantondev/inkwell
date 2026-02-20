defmodule InkwellWeb.SearchController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts

  # GET /api/search?q=...&type=entries|users&page=1
  # Delegates to Meilisearch via HTTP. Falls back to a simple Postgres ILIKE
  # query if Meilisearch isn't available (great for early dev).
  def search(conn, %{"q" => q} = params) do
    type = Map.get(params, "type", "entries")
    page = parse_int(params["page"], 1)

    results =
      case search_meilisearch(q, type, page) do
        {:ok, hits} -> hits
        {:error, _} -> fallback_search(q, type, page)
      end

    json(conn, %{data: results, query: q, type: type, page: page})
  end

  def search(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "q (query) is required"})
  end

  # ── Meilisearch ──────────────────────────────────────────────────────────

  defp search_meilisearch(q, type, page) do
    index = if type == "users", do: "users", else: "entries"
    url = Application.get_env(:inkwell, :meilisearch_url, "http://localhost:7700")
    api_key = Application.get_env(:inkwell, :meilisearch_key, "")

    body = Jason.encode!(%{
      q: q,
      limit: 20,
      offset: (page - 1) * 20
    })

    headers = [
      {"Content-Type", "application/json"},
      {"Authorization", "Bearer #{api_key}"}
    ]

    case :httpc.request(:post,
           {~c"#{url}/indexes/#{index}/search", headers, ~c"application/json", body},
           [], []) do
      {:ok, {{_, 200, _}, _, resp_body}} ->
        case Jason.decode(to_string(resp_body)) do
          {:ok, %{"hits" => hits}} -> {:ok, hits}
          _ -> {:error, :parse_error}
        end

      _ ->
        {:error, :unavailable}
    end
  end

  # ── Postgres fallback ────────────────────────────────────────────────────

  defp fallback_search(q, "users", _page) do
    import Ecto.Query

    pattern = "%#{q}%"

    Inkwell.Accounts.User
    |> where([u], ilike(u.username, ^pattern) or ilike(u.display_name, ^pattern))
    |> limit(20)
    |> Inkwell.Repo.all()
    |> Enum.map(fn u ->
      %{id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url}
    end)
  end

  defp fallback_search(q, _type, _page) do
    import Ecto.Query

    pattern = "%#{q}%"

    Inkwell.Journals.Entry
    |> where([e], e.privacy == :public)
    |> where([e], ilike(e.title, ^pattern) or ilike(e.body_html, ^pattern))
    |> order_by(desc: :published_at)
    |> limit(20)
    |> Inkwell.Repo.all()
    |> Enum.map(fn e ->
      %{id: e.id, title: e.title, slug: e.slug, user_id: e.user_id, published_at: e.published_at}
    end)
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
