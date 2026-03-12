defmodule Inkwell.Search do
  @moduledoc """
  Meilisearch client context module.

  Handles document indexing, deletion, batch operations, index configuration,
  and search queries. All indexing operations are fire-and-forget (enqueued via
  Oban workers). Search queries are synchronous.

  When Meilisearch is not configured (`MEILI_URL` not set), all operations
  are graceful no-ops — the app falls back to Postgres ILIKE search.
  """

  require Logger

  # ── Configuration ──────────────────────────────────────────────────────

  @doc "Returns true if Meilisearch is configured (MEILI_URL is set and non-empty)."
  def configured? do
    config = Application.get_env(:inkwell, __MODULE__, [])
    url = Keyword.get(config, :url, "")
    url != "" && url != nil
  end

  defp config do
    Application.get_env(:inkwell, __MODULE__, [])
  end

  defp url, do: Keyword.get(config(), :url, "http://localhost:7700")
  defp api_key, do: Keyword.get(config(), :api_key, "") || ""

  # ── Index Setup ────────────────────────────────────────────────────────

  @doc """
  Creates indexes and configures settings. Idempotent — safe to call on every
  app startup. Meilisearch returns 200 if index already exists.
  """
  def setup_indexes! do
    unless configured?() do
      Logger.info("[Search] Meilisearch not configured, skipping index setup")
      :ok
    else
      Logger.info("[Search] Setting up Meilisearch indexes...")

      # Create indexes
      http_post("/indexes", %{uid: "entries", primaryKey: "id"})
      http_post("/indexes", %{uid: "users", primaryKey: "id"})

      # Configure entries index
      http_patch("/indexes/entries/settings", %{
        searchableAttributes: [
          "title", "tags", "excerpt", "author_username",
          "author_display_name", "body_text", "category", "mood"
        ],
        filterableAttributes: [
          "privacy", "category", "tags", "user_id", "sensitive",
          "series_id"
        ],
        sortableAttributes: ["published_at", "ink_count", "word_count"],
        rankingRules: [
          "words", "typo", "proximity", "attribute", "sort", "exactness",
          "ink_count:desc"
        ]
      })

      # Configure users index
      http_patch("/indexes/users/settings", %{
        searchableAttributes: ["username", "display_name", "bio", "profile_status"],
        filterableAttributes: ["subscription_tier"],
        sortableAttributes: ["entry_count"]
      })

      Logger.info("[Search] Meilisearch indexes configured")
      :ok
    end
  end

  # ── Document Indexing ──────────────────────────────────────────────────

  @doc "Index a single entry (must have `:user` preloaded)."
  def index_entry(%{user: nil}), do: :ok
  def index_entry(%{user: %Ecto.Association.NotLoaded{}}), do: :ok
  def index_entry(entry) do
    doc = build_entry_document(entry)
    http_post("/indexes/entries/documents", [doc])
  end

  @doc "Index a single user."
  def index_user(user) do
    doc = build_user_document(user)
    http_post("/indexes/users/documents", [doc])
  end

  @doc "Delete an entry document by ID."
  def delete_entry(entry_id) do
    http_delete("/indexes/entries/documents/#{entry_id}")
  end

  @doc "Delete a user document by ID."
  def delete_user(user_id) do
    http_delete("/indexes/users/documents/#{user_id}")
  end

  @doc "Batch index entries (must have `:user` preloaded)."
  def index_entries_batch(entries) do
    docs = Enum.map(entries, &build_entry_document/1)
    http_post("/indexes/entries/documents", docs)
  end

  @doc "Batch index users."
  def index_users_batch(users) do
    docs = Enum.map(users, &build_user_document/1)
    http_post("/indexes/users/documents", docs)
  end

  @doc "Delete all entry documents for a given user_id."
  def delete_entries_by_user(user_id) do
    http_post("/indexes/entries/documents/delete", %{
      filter: "user_id = '#{user_id}'"
    })
  end

  # ── Search ─────────────────────────────────────────────────────────────

  @doc """
  Search an index. Returns `{:ok, hits}` or `{:error, reason}`.

  Options:
    - `:filter` — Meilisearch filter string (e.g., "privacy = public")
    - `:sort` — list of sort strings (e.g., ["published_at:desc"])
    - `:limit` — max results (default 20)
    - `:offset` — offset for pagination (default 0)
    - `:highlight` — list of attributes to highlight
    - `:crop` — list of attributes to crop
    - `:crop_length` — crop length (default 200)
  """
  def search(index, query, opts \\ []) do
    filter = Keyword.get(opts, :filter)
    sort = Keyword.get(opts, :sort)
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)
    highlight = Keyword.get(opts, :highlight)
    crop = Keyword.get(opts, :crop)
    crop_length = Keyword.get(opts, :crop_length, 200)

    body = %{q: query, limit: limit, offset: offset}
    body = if filter, do: Map.put(body, :filter, filter), else: body
    body = if sort, do: Map.put(body, :sort, sort), else: body
    body = if highlight, do: Map.put(body, :attributesToHighlight, highlight), else: body
    body = if crop do
      body
      |> Map.put(:attributesToCrop, crop)
      |> Map.put(:cropLength, crop_length)
    else
      body
    end

    case http_post_sync("/indexes/#{index}/search", body) do
      {:ok, %{"hits" => hits}} -> {:ok, hits}
      {:ok, %{"message" => msg}} -> {:error, msg}
      {:error, reason} -> {:error, reason}
    end
  end

  # ── Document Builders ──────────────────────────────────────────────────

  @doc "Build a Meilisearch document from an Entry struct (with preloaded :user)."
  def build_entry_document(entry) do
    user = entry.user

    %{
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      body_text: strip_html(entry.body_html || ""),
      excerpt: entry.excerpt,
      tags: entry.tags || [],
      category: entry.category && to_string(entry.category),
      mood: entry.mood,
      privacy: to_string(entry.privacy),
      user_id: entry.user_id,
      published_at: entry.published_at && DateTime.to_unix(entry.published_at),
      ink_count: entry.ink_count || 0,
      word_count: entry.word_count || 0,
      cover_image_id: entry.cover_image_id,
      series_id: entry.series_id,
      sensitive: entry.sensitive || entry.admin_sensitive || false,
      author_username: user && user.username,
      author_display_name: user && user.display_name,
      author: user && %{
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        avatar_frame: user.avatar_frame,
        subscription_tier: user.subscription_tier,
        ink_donor_status: user.ink_donor_status
      }
    }
  end

  @doc "Build a Meilisearch document from a User struct."
  def build_user_document(user) do
    entry_count =
      try do
        import Ecto.Query
        Inkwell.Repo.aggregate(
          from(e in Inkwell.Journals.Entry,
            where: e.user_id == ^user.id and e.status == :published),
          :count, :id
        )
      rescue
        _ -> 0
      end

    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      profile_status: user.profile_status,
      avatar_url: user.avatar_url,
      avatar_frame: user.avatar_frame,
      subscription_tier: user.subscription_tier,
      ink_donor_status: user.ink_donor_status,
      entry_count: entry_count
    }
  end

  # ── HTML Stripping ─────────────────────────────────────────────────────

  @doc "Strip HTML tags and decode entities for plain text indexing."
  def strip_html(html) do
    html
    |> String.replace(~r/<[^>]*>/, " ")
    |> String.replace(~r/&amp;/, "&")
    |> String.replace(~r/&lt;/, "<")
    |> String.replace(~r/&gt;/, ">")
    |> String.replace(~r/&quot;/, "\"")
    |> String.replace(~r/&#39;/, "'")
    |> String.replace(~r/&[^;]+;/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  # ── HTTP Client ────────────────────────────────────────────────────────

  defp http_post(path, body) do
    Task.start(fn ->
      http_request(:post, path, body)
    end)
    :ok
  end

  defp http_post_sync(path, body) do
    http_request(:post, path, body)
  end

  defp http_patch(path, body) do
    Task.start(fn ->
      http_request(:patch, path, body)
    end)
    :ok
  end

  defp http_delete(path) do
    Task.start(fn ->
      http_request(:delete, path, nil)
    end)
    :ok
  end

  # Fly.io internal networking uses IPv6. :httpc defaults to IPv4, so
  # .internal hostnames fail with :nxdomain. Resolve to IPv6 address and
  # use bracket notation in the URL so :httpc connects over IPv6.
  defp resolve_url(url_string) do
    uri = URI.parse(url_string)

    case uri.host do
      host when is_binary(host) ->
        if String.ends_with?(host, ".internal") do
          case :inet.getaddr(String.to_charlist(host), :inet6) do
            {:ok, ip} ->
              ip_str = :inet.ntoa(ip) |> to_string()
              # URI.to_string/1 adds brackets around IPv6 hosts automatically
              resolved = %{uri | host: ip_str} |> URI.to_string()
              String.to_charlist(resolved)

            {:error, _} ->
              String.to_charlist(url_string)
          end
        else
          String.to_charlist(url_string)
        end

      _ ->
        String.to_charlist(url_string)
    end
  end

  defp http_request(method, path, body) do
    full_url = resolve_url("#{url()}#{path}")
    headers = [
      {~c"content-type", ~c"application/json"},
      {~c"authorization", ~c"Bearer #{api_key()}"}
    ]

    request =
      case {method, body} do
        {:delete, nil} ->
          {full_url, headers}

        {_, body} ->
          json_body = Jason.encode!(body)
          {full_url, headers, ~c"application/json", json_body}
      end

    http_method = if method == :patch, do: :patch, else: if(body == nil, do: :delete, else: :post)

    case :httpc.request(http_method, request, [{:timeout, 10_000}], [{:ipv6_host_with_brackets, true}]) do
      {:ok, {{_, status, _}, _, resp_body}} when status in 200..299 ->
        case Jason.decode(:erlang.list_to_binary(resp_body)) do
          {:ok, parsed} -> {:ok, parsed}
          _ -> {:ok, %{}}
        end

      {:ok, {{_, status, _}, _, resp_body}} ->
        Logger.warning("[Search] Meilisearch returned #{status}: #{:erlang.list_to_binary(resp_body) |> String.slice(0, 200)}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("[Search] Meilisearch request failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
