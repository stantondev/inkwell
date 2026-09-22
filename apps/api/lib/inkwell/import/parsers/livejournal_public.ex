defmodule Inkwell.Import.Parsers.LivejournalPublic do
  @moduledoc """
  Import a LiveJournal's **public** entries by username, for people who can
  no longer sign in to LiveJournal (so can't use its export tool).

  Walks the journal's calendar (years → days → entries) and reads each
  entry page: the title and date from the `Site.entry` JSON LiveJournal
  embeds, the body from the entry's text block. Only entries LiveJournal
  shows to anyone are reachable; friends-only and private posts never are.

  Follows LiveJournal's bot rules (livejournal.com/bots): one request at a
  time, about one a second, and a User-Agent naming Inkwell with a contact
  address. Stops at `@max_entries`.

  The "file data" of the import is the LiveJournal username.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.{LivejournalComments, LivejournalMarkup}

  require Logger

  @max_entries 2000
  @user_agent ~c"InkwellImporter/1.0 (+https://inkwell.social/switch/livejournal; hello@inkwell.social)"

  @impl true
  def parse(username) when is_binary(username) do
    with {:ok, user} <- normalize_username(username),
         host = host_for(user),
         {:ok, years} <- years(host) do
      entry_urls =
        years
        |> Stream.flat_map(&day_urls(host, &1))
        |> Stream.flat_map(&entry_urls(host, &1))
        |> Stream.uniq()
        |> Enum.take(@max_entries)

      entries =
        entry_urls
        |> Enum.map(&fetch_entry/1)
        |> Enum.reject(&is_nil/1)
        |> Enum.map(&with_comments(&1, user, host))
        |> Enum.sort_by(fn e -> e.published_at end, DateTime)

      case entries do
        [] -> {:error, "No public entries found on #{host}."}
        _ -> {:ok, entries}
      end
    end
  end

  @doc """
  Accepts `xstantonx`, `xstantonx.livejournal.com`, or a journal URL.
  LiveJournal usernames are 1–15 letters, digits and underscores.
  """
  def normalize_username(raw) do
    raw = raw |> String.trim() |> String.downcase()

    candidate =
      case Regex.run(~r|^(?:https?://)?([a-z0-9_\-]+)\.livejournal\.com|, raw) do
        [_, sub] -> sub
        _ -> raw |> String.trim_leading("@") |> String.trim_trailing("/")
      end

    candidate = String.replace(candidate, "-", "_")

    if Regex.match?(~r/^[a-z0-9_]{1,15}$/, candidate) do
      {:ok, candidate}
    else
      {:error, "That doesn't look like a LiveJournal username."}
    end
  end

  def host_for(user), do: "#{String.replace(user, "_", "-")}.livejournal.com"

  # ── Walking the journal ───────────────────────────────────────────────────

  defp years(host) do
    case get("https://#{host}/calendar/") do
      {:ok, html} ->
        years =
          Regex.scan(~r|#{Regex.escape(host)}/(\d{4})/|, html, capture: :all_but_first)
          |> List.flatten()
          |> Enum.uniq()
          |> Enum.sort()

        if years == [], do: {:error, "No public entries found on #{host}."}, else: {:ok, years}

      {:error, :not_found} ->
        {:error, "LiveJournal says there's no journal at #{host}."}

      {:error, _} ->
        {:error, "Couldn't reach #{host} right now. Try again in a little while."}
    end
  end

  defp day_urls(host, year) do
    case get("https://#{host}/#{year}/") do
      {:ok, html} ->
        Regex.scan(~r|https?://#{Regex.escape(host)}/#{year}/\d{2}/\d{2}/|, html)
        |> List.flatten()
        |> Enum.map(&String.replace_prefix(&1, "http://", "https://"))
        |> Enum.uniq()
        |> Enum.sort()

      _ ->
        []
    end
  end

  defp entry_urls(host, day_url) do
    case get(day_url) do
      {:ok, html} ->
        Regex.scan(~r|https?://#{Regex.escape(host)}/(\d+)\.html|, html, capture: :all_but_first)
        |> List.flatten()
        |> Enum.uniq()
        |> Enum.map(&"https://#{host}/#{&1}.html")

      _ ->
        []
    end
  end

  @doc false
  def fetch_entry(url) do
    case get(url) do
      {:ok, html} -> parse_entry_page(html, url)
      _ -> nil
    end
  end

  @doc "Read one LiveJournal entry page. Returns nil when it isn't a public entry."
  def parse_entry_page(html, url) do
    with %{} = meta <- site_entry(html),
         true <- Map.get(meta, "is_public", true) != false,
         raw when is_binary(raw) <- body_block(html) do
      body =
        raw
        |> String.trim()
        |> preformatted_body()

      %{
        title: meta |> Map.get("title") |> clean_title(),
        body_html: body,
        published_at: unix(meta["eventtime"]),
        tags: tags(article_region(html)),
        source_id: url,
        # The post's own comment count ("replycount" appears once, for this
        # entry). Nil when the page doesn't say, so comments are fetched anyway.
        reply_count: reply_count(html)
      }
      |> then(fn e -> if e.body_html, do: e end)
    else
      _ -> nil
    end
  end

  defp reply_count(html) do
    case Regex.run(~r/"replycount":(\d+)/, html, capture: :all_but_first) do
      [n] -> String.to_integer(n)
      _ -> nil
    end
  end

  # ── Comments ──────────────────────────────────────────────────────────────

  @max_thread_expansions 20

  defp with_comments(%{reply_count: 0} = entry, _user, _host), do: Map.put(entry, :comments, [])

  defp with_comments(entry, user, host) do
    comments =
      case Regex.run(~r|/(\d+)\.html|, entry.source_id, capture: :all_but_first) do
        [ditemid] -> fetch_comments(user, host, ditemid)
        _ -> []
      end

    Map.put(entry, :comments, comments)
  end

  @doc false
  def fetch_comments(user, host, ditemid) do
    base = "https://#{host}/__rpc_get_thread?journal=#{user}&itemid=#{ditemid}&flat=&skip=&expand_all=1"

    case get_json(base <> "&thread=") do
      {:ok, %{"comments" => list}} when is_list(list) ->
        # Long threads come back partly collapsed ("loaded": 0). Ask for each
        # collapsed thread once (a bounded number of times) and put its
        # comments where the placeholder was, so the list stays in thread
        # order, which is what the nesting is rebuilt from.
        expand = list |> Enum.filter(&(&1["loaded"] == 0)) |> Enum.take(@max_thread_expansions) |> MapSet.new(& &1["dtalkid"])

        list
        |> Enum.flat_map(fn c ->
          if MapSet.member?(expand, c["dtalkid"]) do
            case get_json(base <> "&thread=#{c["dtalkid"]}") do
              {:ok, %{"comments" => more}} when is_list(more) -> more
              _ -> []
            end
          else
            [c]
          end
        end)
        |> Enum.filter(&(&1["loaded"] != 0))
        |> Enum.uniq_by(& &1["dtalkid"])
        |> threaded_comments(user)
        |> LivejournalComments.finalize(:livejournal, :rendered)

      _ ->
        []
    end
  end

  # The JSON gives each comment's depth ("level") in thread order, not its
  # parent; rebuild parents from the order LJ lists them in.
  defp threaded_comments(list, owner) do
    {out, _stack} =
      Enum.reduce(list, {[], %{}}, fn c, {acc, stack} ->
        level = c["level"] || 1
        parent = if level > 1, do: Map.get(stack, level - 1)
        stack = stack |> Map.put(level, c["dtalkid"]) |> Map.reject(fn {l, _} -> l > level end)

        author = if (c["dname"] || "") == "", do: nil, else: c["dname"]

        comment = %{
          source_id: c["dtalkid"],
          parent_source_id: parent,
          author: if(c["commenter_is_poster"] == 1, do: owner, else: author),
          anonymous?: author == nil and c["commenter_is_poster"] != 1,
          state: if(c["deleted"] == 1 or c["shown"] == 0, do: "D", else: "A"),
          subject: c["subject"],
          body: c["article"],
          date: c["ctime_ts"],
          url: c["thread_url"]
        }

        {[comment | acc], stack}
      end)

    Enum.reverse(out)
  end

  defp get_json(url) do
    case get(url) do
      {:ok, body} -> Jason.decode(body)
      error -> error
    end
  end

  # The page shows the body already formatted (breaks are real <br>s), so only
  # LJ's own tags need converting; line breaks are left alone.
  defp preformatted_body(html), do: LivejournalMarkup.to_html(html, preformatted: true)

  defp site_entry(html) do
    with [_, json_start] <- Regex.run(~r/Site\.entry\s*=\s*(\{.*)/s, html),
         {:ok, map} <- decode_prefix(json_start) do
      map
    else
      _ -> nil
    end
  end

  # Site.entry = {...}; is followed by more script, so decode just the object.
  defp decode_prefix(text) do
    case matching_brace(text, 0, 0, false, false) do
      nil -> :error
      len -> Jason.decode(binary_part(text, 0, len))
    end
  end

  defp matching_brace(<<>>, _i, _depth, _in_str, _esc), do: nil

  defp matching_brace(<<c, rest::binary>>, i, depth, in_str, esc) do
    cond do
      esc -> matching_brace(rest, i + 1, depth, in_str, false)
      in_str and c == ?\\ -> matching_brace(rest, i + 1, depth, true, true)
      c == ?" -> matching_brace(rest, i + 1, depth, not in_str, false)
      in_str -> matching_brace(rest, i + 1, depth, true, false)
      c == ?{ -> matching_brace(rest, i + 1, depth + 1, false, false)
      c == ?} and depth == 1 -> i + 1
      c == ?} -> matching_brace(rest, i + 1, depth - 1, false, false)
      true -> matching_brace(rest, i + 1, depth, false, false)
    end
  end

  # The entry text is the <div class="aentry-post__text ..."> block; find
  # its matching </div> by counting nested divs.
  defp body_block(html) do
    case :binary.match(html, "aentry-post__text") do
      {pos, _} ->
        rest = binary_part(html, pos, byte_size(html) - pos)

        case :binary.match(rest, ">") do
          {gt, 1} ->
            inner = binary_part(rest, gt + 1, byte_size(rest) - gt - 1)
            take_until_close(inner)

          _ ->
            nil
        end

      :nomatch ->
        nil
    end
  end

  defp take_until_close(inner) do
    tags = Regex.scan(~r|<(/?)div\b[^>]*>|i, inner, return: :index)

    Enum.reduce_while(tags, 1, fn [{start, _len}, {_slash_start, slash_len}], depth ->
      depth = if slash_len > 0, do: depth - 1, else: depth + 1
      if depth == 0, do: {:halt, {:done, start}}, else: {:cont, depth}
    end)
    |> case do
      {:done, stop} -> binary_part(inner, 0, stop)
      _ -> nil
    end
  end

  # Just the post itself, so the journal's sidebar tag cloud and related-post
  # links don't end up tagged on every entry.
  defp article_region(html) do
    case Regex.run(~r|<article\b.*?</article>|s, html) do
      [article] -> article
      _ -> ""
    end
  end

  defp tags(html) do
    # Tag links look like https://user.livejournal.com/tag/some%20tag
    Regex.scan(~r|livejournal\.com/tag/([^"'?#<>\s]+)|, html, capture: :all_but_first)
    |> List.flatten()
    |> Enum.map(&URI.decode/1)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
    |> Enum.take(20)
  end

  defp clean_title(nil), do: nil

  defp clean_title(title) do
    t = title |> then(&Regex.replace(~r/<[^>]+>/, &1, "")) |> String.trim()
    if t == "", do: nil, else: String.slice(t, 0, 500)
  end

  defp unix(n) when is_integer(n), do: DateTime.from_unix!(n)
  defp unix(_), do: nil

  # ── HTTP ──────────────────────────────────────────────────────────────────

  @doc false
  def get(url) do
    case Application.get_env(:inkwell, :livejournal_fetcher) do
      fun when is_function(fun, 1) -> fun.(url)
      _ -> http_get(url, 3)
    end
  end

  defp http_get(_url, 0), do: {:error, :too_many_redirects}

  defp http_get(url, redirects_left) do
    Process.sleep(Application.get_env(:inkwell, :livejournal_request_delay_ms, 1100))
    :inets.start()
    :ssl.start()

    request = {String.to_charlist(url), [{~c"user-agent", @user_agent}, {~c"accept", ~c"text/html"}]}

    case :httpc.request(:get, request, [ssl: Inkwell.SSL.httpc_opts(), timeout: 20_000, autoredirect: false], body_format: :binary) do
      {:ok, {{_, 200, _}, _headers, body}} ->
        {:ok, body}

      {:ok, {{_, status, _}, headers, _}} when status in [301, 302, 303, 307, 308] ->
        with {_, location} <- List.keyfind(headers, ~c"location", 0),
             location = to_string(location),
             true <- String.ends_with?(URI.parse(location).host || "", "livejournal.com") do
          http_get(location, redirects_left - 1)
        else
          _ -> {:error, :redirected_away}
        end

      {:ok, {{_, status, _}, _, _}} when status in [404, 410] ->
        {:error, :not_found}

      {:ok, {{_, status, _}, _, _}} ->
        Logger.warning("[LJ import] #{url} answered #{status}")
        {:error, {:status, status}}

      {:error, reason} ->
        Logger.warning("[LJ import] #{url} failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
