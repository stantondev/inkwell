defmodule Inkwell.Bluesky.Engagement do
  @moduledoc """
  What happens to an entry after it's shared to Bluesky (`Bluesky.Poster`),
  brought back to Inkwell:

    * replies become footnotes on the entry, threaded as on Bluesky, with
      the person's name and picture and "on Bluesky"; the writer gets a
      notification for each new one. A reply the writer makes on Bluesky
      shows as their own footnote;
    * likes add to the entry's ink count, reposts and quotes to its reprint
      count (the way Mastodon favourites and boosts already do). Only the
      change since the last look is applied, so an unlike takes one back.

  Everything comes from Bluesky's public AppView (`getPostThread`), which
  needs no token. Left out, by people's own choices: replies the writer
  hid on Bluesky (the threadgate's `hiddenReplies`), and anyone whose
  account asks Bluesky not to show their posts to logged-out visitors (the
  `!no-unauthenticated` label), since entry pages are public web pages.

  Checked when someone opens an entry's footnotes and every 15 minutes for
  recent shares (`Workers.BlueskyEngagementWorker`), less often as the
  share gets older. Replies deleted on Bluesky are not removed yet.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Bluesky, Journals, Repo}
  alias Inkwell.Bluesky.Net
  alias Inkwell.Journals.{Comment, Entry}

  require Logger

  @appview "https://public.api.bsky.app"
  @max_age_days 30

  # ── When to look ───────────────────────────────────────────────────

  @doc "The entry's Bluesky shares: `[{account_id, result_map}]`."
  def shares(%Entry{crosspost_results: results}) when is_map(results) do
    Enum.filter(results, fn {_id, r} -> is_map(r) and r["domain"] == "bsky.app" and is_binary(r["uri"]) end)
  end

  def shares(_), do: []

  @doc "True when a share hasn't been looked at for longer than its age allows."
  def stale?(share, now \\ DateTime.utc_now()) do
    posted = parse(share["posted_at"]) || now
    age = DateTime.diff(now, posted, :second)

    ttl =
      cond do
        age < 2 * 3600 -> 5 * 60
        age < 86_400 -> 20 * 60
        age < 7 * 86_400 -> 2 * 3600
        age < @max_age_days * 86_400 -> 12 * 3600
        true -> 3 * 86_400
      end

    case parse(share["checked_at"]) do
      nil -> true
      checked -> DateTime.diff(now, checked, :second) >= ttl
    end
  end

  @doc "True when any of the entry's Bluesky shares is due a look."
  def due?(entry), do: Enum.any?(shares(entry), fn {_id, s} -> stale?(s) end)

  @doc "Entries with a Bluesky share from the last #{@max_age_days} days (for the sweep)."
  def recent_shared_entry_ids(limit \\ 200) do
    since = DateTime.add(DateTime.utc_now(), -@max_age_days, :day)

    from(e in Entry,
      where: e.status == :published and e.privacy == :public and e.published_at > ^since,
      where:
        fragment(
          "EXISTS (SELECT 1 FROM jsonb_each(coalesce(?, '{}'::jsonb)) r WHERE r.value->>'domain' = 'bsky.app')",
          e.crosspost_results
        ),
      order_by: [desc: e.published_at],
      limit: ^limit,
      select: e.id
    )
    |> Repo.all()
  end

  # ── Looking ────────────────────────────────────────────────────────

  @doc "Bring back replies and counts for every stale share of `entry_id` (or all of them with `force: true`)."
  def refresh(entry_id, opts \\ []) do
    force? = Keyword.get(opts, :force, false)

    with %Entry{} = entry <- Repo.get(Entry, entry_id),
         true <- entry.status == :published and entry.privacy == :public do
      for {account_id, share} <- shares(entry), force? or stale?(share) do
        refresh_share(entry, account_id, share)
      end

      :ok
    else
      _ -> :ok
    end
  end

  defp refresh_share(entry, account_id, share) do
    case fetch_thread(share["uri"]) do
      {:ok, %{"thread" => %{"post" => root} = thread} = body} ->
        account = Bluesky.get(account_id)
        hidden = MapSet.new(get_in(body, ["threadgate", "record", "hiddenReplies"]) || [])
        replies = flatten(thread["replies"] || [], root["uri"], hidden)
        added = add_replies(entry, account, root["uri"], replies)

        update_counts(entry.id, account_id, %{
          "likes" => root["likeCount"] || 0,
          "reposts" => (root["repostCount"] || 0) + (root["quoteCount"] || 0),
          "replies" => root["replyCount"] || 0
        })

        if added > 0, do: Logger.info("Bluesky: #{added} new replies on entry #{entry.id}")
        :ok

      {:error, {:http_error, 400}} ->
        # Post deleted on Bluesky: stop looking, keep what came back.
        update_counts(entry.id, account_id, %{"gone" => true})

      {:error, reason} ->
        Logger.info("Bluesky thread for entry #{entry.id} unavailable: #{inspect(reason)}")
        :error
    end
  end

  defp fetch_thread(uri) do
    base = Application.get_env(:inkwell, :bluesky_appview, @appview)
    Net.get_json(base <> "/xrpc/app.bsky.feed.getPostThread", params: [uri: uri, depth: 10, parentHeight: 0])
  end

  # Depth-first, parents before children, each with the uri it answers.
  # A hidden or opted-out reply takes its whole branch with it.
  @doc false
  def flatten(replies, parent_uri, hidden) do
    replies
    |> Enum.filter(&match?(%{"post" => %{"uri" => _}}, &1))
    |> Enum.sort_by(&(get_in(&1, ["post", "record", "createdAt"]) || ""))
    |> Enum.flat_map(fn %{"post" => post} = node ->
      if MapSet.member?(hidden, post["uri"]) or opted_out?(post["author"]) do
        []
      else
        [{post, parent_uri} | flatten(node["replies"] || [], post["uri"], hidden)]
      end
    end)
  end

  defp opted_out?(%{"labels" => labels}) when is_list(labels),
    do: Enum.any?(labels, &(&1["val"] == "!no-unauthenticated"))

  defp opted_out?(_), do: false

  # ── Replies → footnotes ────────────────────────────────────────────

  defp add_replies(entry, account, root_uri, replies) do
    existing =
      from(c in Comment, where: c.entry_id == ^entry.id and like(c.ap_id, "at://%"), select: {c.ap_id, c.id})
      |> Repo.all()
      |> Map.new()

    {_, added} =
      Enum.reduce(replies, {existing, 0}, fn {post, parent_uri}, {known, added} ->
        if Map.has_key?(known, post["uri"]) do
          {known, added}
        else
          parent_id = if parent_uri == root_uri, do: nil, else: known[parent_uri]

          case create_footnote(entry, account, post, parent_id) do
            {:ok, comment} -> {Map.put(known, post["uri"], comment.id), added + 1}
            _ -> {known, added}
          end
        end
      end)

    added
  end

  defp create_footnote(entry, account, post, parent_id) do
    author = post["author"] || %{}
    own? = account != nil and author["did"] == account.did

    attrs =
      %{
        "entry_id" => entry.id,
        "body_html" => body_html(post),
        "ap_id" => post["uri"],
        "url" => post_url(post),
        "parent_comment_id" => parent_id
      }
      |> then(fn a ->
        if own?,
          do: Map.put(a, "user_id", entry.user_id),
          else: Map.put(a, "remote_author", remote_author(author))
      end)

    with {:ok, comment} <- Journals.create_comment(attrs) do
      backdate(comment, get_in(post, ["record", "createdAt"]))
      unless own?, do: notify(entry, author)
      {:ok, comment}
    else
      {:error, reason} ->
        Logger.info("Bluesky reply #{post["uri"]} not added: #{inspect(reason)}")
        :error
    end
  end

  defp remote_author(author) do
    handle = author["handle"]

    %{
      "username" => handle,
      "domain" => "bsky.app",
      "display_name" => blank_to_nil(author["displayName"]) || handle,
      "avatar_url" => author["avatar"],
      "profile_url" => "https://bsky.app/profile/#{handle || author["did"]}",
      "did" => author["did"],
      "source" => "bluesky"
    }
  end

  defp notify(entry, author) do
    Accounts.create_notification(%{
      user_id: entry.user_id,
      type: :comment,
      target_type: "entry",
      target_id: entry.id,
      data: %{
        entry_id: entry.id,
        entry_title: entry.title,
        remote_actor: %{
          display_name: blank_to_nil(author["displayName"]) || author["handle"],
          username: author["handle"],
          domain: "bsky.app",
          avatar_url: author["avatar"],
          profile_url: "https://bsky.app/profile/#{author["handle"] || author["did"]}",
          source: "bluesky"
        }
      }
    })
  end

  defp backdate(comment, created_at) do
    case parse(created_at) do
      %DateTime{} = at ->
        # Never in the future (clocks on other servers vary).
        at = Enum.min([at, DateTime.utc_now()], DateTime)
        at = %{at | microsecond: {elem(at.microsecond, 0), 6}}
        comment |> Ecto.Changeset.change(inserted_at: at) |> Repo.update()

      _ ->
        :ok
    end
  end

  defp post_url(%{"uri" => "at://" <> rest, "author" => author}) do
    case String.split(rest, "/") do
      [_did, "app.bsky.feed.post", rkey] -> "https://bsky.app/profile/#{author["handle"] || author["did"]}/post/#{rkey}"
      _ -> nil
    end
  end

  defp post_url(_), do: nil

  # ── Text with facets → HTML ────────────────────────────────────────

  @doc false
  def body_html(post) do
    record = post["record"] || %{}
    text = record["text"] || ""

    html =
      if String.valid?(text) do
        text |> segments(record["facets"] || []) |> paragraphs()
      else
        ""
      end

    images =
      case post["embed"] do
        %{"$type" => "app.bsky.embed.images#view", "images" => imgs} when is_list(imgs) ->
          Enum.map_join(imgs, "", fn img ->
            ~s(<p><img src="#{escape(img["fullsize"] || img["thumb"] || "")}" alt="#{escape(img["alt"] || "")}"></p>)
          end)

        _ ->
          ""
      end

    Inkwell.HtmlSanitizer.sanitize(html <> images)
  end

  # Facet ranges are UTF-8 byte offsets into the text.
  defp segments(text, facets) do
    size = byte_size(text)

    ranges =
      facets
      |> Enum.flat_map(fn f ->
        s = get_in(f, ["index", "byteStart"])
        e = get_in(f, ["index", "byteEnd"])
        feature = List.first(f["features"] || [])

        if is_integer(s) and is_integer(e) and s >= 0 and e > s and e <= size and feature,
          do: [{s, e, feature}],
          else: []
      end)
      |> Enum.sort_by(&elem(&1, 0))

    {parts, pos} =
      Enum.reduce(ranges, {[], 0}, fn {s, e, feature}, {acc, pos} ->
        if s < pos do
          {acc, pos}
        else
          before = binary_part(text, pos, s - pos)
          inner = binary_part(text, s, e - s)

          if String.valid?(before) and String.valid?(inner),
            do: {[link(inner, feature), escape(before) | acc], e},
            else: {acc, pos}
        end
      end)

    rest = binary_part(text, pos, size - pos)
    Enum.reverse([escape(rest) | parts]) |> Enum.join()
  end

  defp link(inner, %{"$type" => "app.bsky.richtext.facet#link", "uri" => "http" <> _ = uri}),
    do: ~s(<a href="#{escape(uri)}">#{escape(inner)}</a>)

  defp link(inner, %{"$type" => "app.bsky.richtext.facet#mention", "did" => did}) when is_binary(did),
    do: ~s(<a href="https://bsky.app/profile/#{escape(did)}">#{escape(inner)}</a>)

  defp link(inner, %{"$type" => "app.bsky.richtext.facet#tag", "tag" => tag}) when is_binary(tag),
    do: ~s(<a href="https://bsky.app/hashtag/#{URI.encode(tag)}">#{escape(inner)}</a>)

  defp link(inner, _), do: escape(inner)

  defp paragraphs(""), do: ""

  defp paragraphs(html) do
    html
    |> String.split(~r/\n{2,}/)
    |> Enum.map_join("", fn p -> "<p>" <> String.replace(String.trim(p), "\n", "<br>") <> "</p>" end)
  end

  defp escape(s), do: Plug.HTML.html_escape(s)

  # ── Counts → inks and reprints ─────────────────────────────────────

  # Applies only the change since the last look, under a lock on the entry,
  # and records the new numbers and when we looked on the share itself.
  defp update_counts(entry_id, account_id, counts) do
    Repo.transaction(fn ->
      entry = Repo.one(from e in Entry, where: e.id == ^entry_id, lock: "FOR UPDATE")
      share = (entry.crosspost_results || %{})[account_id] || %{}

      {ink_delta, reprint_delta} =
        if counts["gone"],
          do: {0, 0},
          else: {(counts["likes"] || 0) - (share["likes"] || 0), (counts["reposts"] || 0) - (share["reposts"] || 0)}

      share =
        share
        |> Map.merge(counts)
        |> Map.put("checked_at", DateTime.utc_now() |> DateTime.to_iso8601())

      entry
      |> Ecto.Changeset.change(
        crosspost_results: Map.put(entry.crosspost_results || %{}, account_id, share),
        ink_count: max((entry.ink_count || 0) + ink_delta, 0),
        reprint_count: max((entry.reprint_count || 0) + reprint_delta, 0)
      )
      |> Repo.update!()
    end)

    :ok
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp parse(s) when is_binary(s) do
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse(_), do: nil

  defp blank_to_nil(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end

  defp blank_to_nil(_), do: nil
end
