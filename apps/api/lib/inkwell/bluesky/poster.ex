defmodule Inkwell.Bluesky.Poster do
  @moduledoc """
  Share an Inkwell entry from the writer's own Bluesky account: a short post
  (title, opening lines, a few hashtags; 300 characters at most) with a link
  card back to the entry. The card's picture is the entry's share image
  (`/api/og/entry/...`, the same one Facebook and Mastodon show), so every
  entry gets one, cover or not.

  Entries behind a content warning share only the warning and the title, as
  on Inkwell's own share cards.
  """

  alias Inkwell.Bluesky

  @max_graphemes 300
  @max_hashtags 3
  @max_blob_bytes 976_000

  @doc "Post `entry` (with `:user` preloaded) from `account`. Returns `{:ok, %{uri, url}}`."
  def post(entry, account) do
    url = entry_url(entry)
    thumb = upload_thumb(entry, account)
    record = build_record(entry, url, thumb)

    case Bluesky.call(account, :post, "com.atproto.repo.createRecord",
           json: %{"repo" => account.did, "collection" => "app.bsky.feed.post", "record" => record}
         ) do
      {:ok, %{"uri" => uri}} -> {:ok, %{uri: uri, url: web_url(account, uri)}}
      {:ok, _} -> {:error, :invalid_response}
      error -> error
    end
  end

  @doc false
  def build_record(entry, url, thumb \\ nil) do
    {text, facets} = build_text(entry)

    external =
      %{
        "uri" => url,
        "title" => card_title(entry),
        "description" => card_description(entry)
      }
      |> then(fn e -> if thumb, do: Map.put(e, "thumb", thumb), else: e end)

    %{
      "$type" => "app.bsky.feed.post",
      "text" => text,
      "createdAt" => DateTime.utc_now() |> DateTime.to_iso8601(),
      "embed" => %{"$type" => "app.bsky.embed.external", "external" => external}
    }
    |> then(fn r -> if facets == [], do: r, else: Map.put(r, "facets", facets) end)
  end

  @doc false
  def build_text(entry) do
    title = clean(entry.title)
    cw? = entry.sensitive || entry.admin_sensitive

    body =
      if cw?,
        do: "Content warning: " <> (clean(entry.content_warning) || "sensitive"),
        else: clean(entry.excerpt) || clean(strip(entry.body_html)) || ""

    tags =
      (entry.tags || [])
      |> Enum.map(&String.replace(&1, ~r/[^\p{L}\p{N}_]/u, ""))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq_by(&String.downcase/1)
      |> Enum.take(@max_hashtags)

    tag_text = Enum.map_join(tags, " ", &("#" <> &1))
    tag_len = if tag_text == "", do: 0, else: String.length(tag_text) + 2

    head = if title, do: title, else: ""
    head_len = if head == "", do: 0, else: String.length(head) + 2
    room = @max_graphemes - head_len - tag_len

    {head, body} =
      cond do
        room >= 20 -> {head, fit(body, room)}
        head != "" -> {fit(head, @max_graphemes - tag_len), ""}
        true -> {"", fit(body, @max_graphemes - tag_len)}
      end

    main = [head, body] |> Enum.reject(&(&1 == "")) |> Enum.join("\n\n")
    text = if tag_text == "" or main == "", do: main <> tag_text, else: main <> "\n\n" <> tag_text
    {text, tag_facets(text, tags)}
  end

  # Hashtag facets need UTF-8 byte offsets into the final text.
  defp tag_facets(_text, []), do: []

  defp tag_facets(text, tags) do
    tags
    |> Enum.reduce({[], 0}, fn tag, {acc, from} ->
      needle = "#" <> tag
      rest = binary_part(text, from, byte_size(text) - from)

      case :binary.match(rest, needle) do
        {pos, len} ->
          start = from + pos

          facet = %{
            "index" => %{"byteStart" => start, "byteEnd" => start + len},
            "features" => [%{"$type" => "app.bsky.richtext.facet#tag", "tag" => tag}]
          }

          {[facet | acc], start + len}

        :nomatch ->
          {acc, from}
      end
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp fit(_text, room) when room <= 0, do: ""

  defp fit(text, room) do
    if String.length(text) <= room do
      text
    else
      cut = String.slice(text, 0, room - 1)
      # Prefer to stop at a word.
      cut =
        case Regex.run(~r/^(.*\S)\s+\S*$/su, cut) do
          [_, words] when byte_size(words) > 0 -> words
          _ -> cut
        end

      String.trim_trailing(cut, ".,;: ") <> "…"
    end
  end

  defp card_title(entry), do: clean(entry.title) || fit(clean(strip(entry.body_html)) || "An entry on Inkwell", 80)

  defp card_description(entry) do
    if entry.sensitive || entry.admin_sensitive,
      do: "Content warning: " <> (clean(entry.content_warning) || "sensitive"),
      else: fit(clean(entry.excerpt) || clean(strip(entry.body_html)) || "", 280)
  end

  defp upload_thumb(entry, account) do
    with {:ok, type, bytes} <- card_image(entry),
         {:ok, %{"blob" => blob}} <-
           Bluesky.call(account, :post, "com.atproto.repo.uploadBlob",
             body: bytes,
             headers: [{"content-type", type}]
           ) do
      blob
    else
      _ -> nil
    end
  end

  # The drawn share card (1200x630) for the entry.
  defp card_image(entry) do
    url =
      Inkwell.Instance.frontend_url() <>
        "/api/og/entry/#{URI.encode(entry.user.username)}/#{URI.encode(entry.slug)}?v=#{DateTime.to_unix(updated(entry), :millisecond)}"

    case Inkwell.Bluesky.Net.request(:get, url, headers: [{"accept", "image/png,image/jpeg"}], decode_body: false) do
      {:ok, %{status: 200, body: body}} when is_binary(body) and byte_size(body) <= @max_blob_bytes ->
        case Inkwell.Images.detect_type(body) do
          "png" -> {:ok, "image/png", body}
          "jpeg" -> {:ok, "image/jpeg", body}
          _ -> {:error, :not_an_image}
        end

      _ ->
        {:error, :no_card}
    end
  end

  defp updated(%{updated_at: %DateTime{} = at}), do: at
  defp updated(%{updated_at: %NaiveDateTime{} = at}), do: DateTime.from_naive!(at, "Etc/UTC")
  defp updated(_), do: DateTime.utc_now()

  def entry_url(entry), do: "#{Inkwell.Instance.frontend_url()}/#{entry.user.username}/#{entry.slug}"

  # at://did/app.bsky.feed.post/rkey → https://bsky.app/profile/did/post/rkey
  defp web_url(account, "at://" <> rest) do
    case String.split(rest, "/") do
      [_did, "app.bsky.feed.post", rkey] -> "https://bsky.app/profile/#{account.handle || account.did}/post/#{rkey}"
      _ -> nil
    end
  end

  defp web_url(_, _), do: nil

  defp strip(nil), do: nil

  defp strip(html) do
    html
    |> String.replace(~r/<(br|\/p|\/h\d|\/li|\/blockquote)[^>]*>/i, " ")
    |> String.replace(~r/<[^>]*>/, "")
    |> InkwellWeb.FederationController.decode_html_entities()
  end

  defp clean(nil), do: nil

  defp clean(s) when is_binary(s) do
    case s |> InkwellWeb.FederationController.decode_html_entities() |> String.replace(~r/\s+/u, " ") |> String.trim() do
      "" -> nil
      t -> t
    end
  end
end
