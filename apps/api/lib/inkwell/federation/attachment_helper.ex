defmodule Inkwell.Federation.AttachmentHelper do
  @moduledoc """
  Turns the `attachment` list on an incoming ActivityPub object into HTML.

  Mastodon, Threads, Pixelfed and most other fediverse software put pictures,
  videos and audio in `attachment` rather than inline in `content`. Images
  become `<img>` (a gallery for three or more), videos become `<video>`, audio
  becomes `<audio>`. Players load straight from the other server; no media
  passes through Inkwell.
  """

  @image_types ~w(image/jpeg image/png image/gif image/webp image/svg+xml image/avif)

  @doc """
  Appends the object's image, video and audio attachments to `body_html`.
  Attachments whose URL already appears in the body (some platforms inline
  them) are skipped.
  """
  def append_media_attachments(body_html, ap_object) when is_binary(body_html) and is_map(ap_object) do
    not_inlined = fn %{url: url} -> not String.contains?(body_html, url) end

    images = ap_object |> extract_image_attachments() |> Enum.filter(not_inlined)
    videos = ap_object |> extract_attachments(:video) |> Enum.filter(not_inlined)
    audios = ap_object |> extract_attachments(:audio) |> Enum.filter(not_inlined)

    body_html <> images_html(images) <> Enum.map_join(videos, "", &video_html/1) <>
      Enum.map_join(audios, "", &audio_html/1)
  end

  def append_media_attachments(body_html, _), do: body_html || ""

  @doc false
  # Kept for callers that only want pictures.
  def append_image_attachments(body_html, ap_object) when is_binary(body_html) and is_map(ap_object) do
    images =
      ap_object
      |> extract_image_attachments()
      |> Enum.reject(fn %{url: url} -> String.contains?(body_html, url) end)

    body_html <> images_html(images)
  end

  def append_image_attachments(body_html, _), do: body_html || ""

  @doc """
  Extract image attachment URLs from an AP object's `attachment` field.
  Returns a list of maps with :url, :media_type, and :name keys.
  """
  def extract_image_attachments(ap_object), do: extract_attachments(ap_object, :image)

  @doc """
  Extract attachments of one kind (`:image`, `:video` or `:audio`).
  Returns maps with :url, :media_type, :name, :width, :height and :poster.
  """
  def extract_attachments(ap_object, kind) when is_map(ap_object) do
    ap_object["attachment"]
    |> List.wrap()
    |> Enum.filter(&is_map/1)
    |> Enum.map(&normalize/1)
    |> Enum.filter(fn att -> att.kind == kind and https?(att.url) end)
  end

  def extract_attachments(_, _), do: []

  # ── Normalizing ────────────────────────────────────────────────────────

  # `url` may be a string, a Link object, or a list of Links (PeerTube offers
  # several renditions). The media type may sit on the attachment or the Link.
  defp normalize(att) do
    {url, link_type} = pick_url(att["url"])
    media_type = downcase(att["mediaType"] || link_type)

    %{
      url: url,
      media_type: media_type,
      kind: kind_of(att["type"], media_type),
      name: text(att["name"]),
      width: positive_int(att["width"]),
      height: positive_int(att["height"]),
      poster: poster_url(att["icon"] || att["preview"])
    }
  end

  defp pick_url(url) when is_binary(url), do: {url, nil}
  defp pick_url(%{"href" => href} = link) when is_binary(href), do: {href, link["mediaType"]}
  # An Image/Document object (e.g. a poster in `icon`) nests its own url.
  defp pick_url(%{"url" => inner} = obj) do
    case pick_url(inner) do
      {url, nil} -> {url, obj["mediaType"]}
      found -> found
    end
  end

  defp pick_url(list) when is_list(list) do
    links = Enum.filter(list, &(is_binary(&1) or is_map(&1)))

    # Prefer a real media file (e.g. video/mp4) over HTML pages or playlists.
    preferred =
      Enum.find(links, fn
        %{"mediaType" => mt} when is_binary(mt) ->
          String.starts_with?(mt, ["video/", "audio/", "image/"]) and
            not String.contains?(mt, "mpegurl")

        _ ->
          false
      end)

    case preferred || List.first(links) do
      nil -> {nil, nil}
      link -> pick_url(link)
    end
  end

  defp pick_url(_), do: {nil, nil}

  defp kind_of(type, media_type) do
    cond do
      media_type in @image_types and type in ["Document", "Image"] -> :image
      is_binary(media_type) and String.starts_with?(media_type, "video/") and type in ["Document", "Video"] -> :video
      is_binary(media_type) and String.starts_with?(media_type, "audio/") and type in ["Document", "Audio"] -> :audio
      # Some servers label the object and leave out mediaType.
      is_nil(media_type) and type == "Video" -> :video
      is_nil(media_type) and type == "Audio" -> :audio
      true -> :other
    end
  end

  defp poster_url(icon) do
    case pick_url(icon) do
      {url, _} when is_binary(url) -> if https?(url), do: url
      _ -> nil
    end
  end

  # ── HTML ───────────────────────────────────────────────────────────────

  defp images_html([]), do: ""

  defp images_html(images) when length(images) >= 3 do
    figures =
      images
      |> Enum.with_index()
      |> Enum.map_join("", fn {img, idx} ->
        caption_html = if img.name, do: ~s(<figcaption>#{escape_attr(img.name)}</figcaption>), else: ""

        ~s(<figure data-gallery-photo data-image-id="" data-photo-order="#{idx}"><img src="#{escape_attr(img.url)}" alt="#{escape_attr(img.name)}" loading="lazy" />#{caption_html}</figure>)
      end)

    ~s(<div data-photo-gallery data-gallery-layout="grid" data-gallery-columns="3">#{figures}</div>)
  end

  defp images_html(images) do
    Enum.map_join(images, "", fn img ->
      ~s(<div class="fediverse-attachment"><img src="#{escape_attr(img.url)}" alt="#{escape_attr(img.name)}" loading="lazy" /></div>)
    end)
  end

  defp video_html(v) do
    attrs =
      [
        ~s(src="#{escape_attr(v.url)}"),
        "controls",
        "playsinline",
        ~s(preload="metadata"),
        v.poster && ~s(poster="#{escape_attr(v.poster)}"),
        v.width && ~s(width="#{v.width}"),
        v.height && ~s(height="#{v.height}"),
        v.name && ~s(title="#{escape_attr(v.name)}")
      ]
      |> Enum.filter(& &1)
      |> Enum.join(" ")

    ~s(<div class="fediverse-attachment fediverse-video"><video #{attrs}></video></div>)
  end

  defp audio_html(a) do
    title = if a.name, do: ~s( title="#{escape_attr(a.name)}"), else: ""

    ~s(<div class="fediverse-attachment fediverse-audio"><audio src="#{escape_attr(a.url)}" controls preload="none"#{title}></audio></div>)
  end

  # ── Helpers ────────────────────────────────────────────────────────────

  defp https?(url), do: is_binary(url) and String.starts_with?(url, "https://")

  defp downcase(s) when is_binary(s), do: s |> String.trim() |> String.downcase()
  defp downcase(_), do: nil

  defp text(s) when is_binary(s), do: if(String.trim(s) == "", do: nil, else: s)
  defp text(_), do: nil

  defp positive_int(n) when is_integer(n) and n > 0 and n < 10_000, do: n
  defp positive_int(_), do: nil

  defp escape_attr(str) when is_binary(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("\"", "&quot;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
  end

  defp escape_attr(_), do: ""
end
