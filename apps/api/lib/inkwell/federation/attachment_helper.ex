defmodule Inkwell.Federation.AttachmentHelper do
  @moduledoc """
  Extracts image attachments from ActivityPub objects and appends them to body_html.

  Mastodon and other fediverse software include images as `attachment` objects on the AP
  Note/Article, rather than inline in the `content` HTML. This module extracts those
  attachments and appends `<img>` tags so they render on Inkwell's feed cards.
  """

  @image_types ~w(image/jpeg image/png image/gif image/webp image/svg+xml image/avif)

  @doc """
  Given an AP object map, extracts image attachments and appends them to body_html.
  Returns the enriched body_html string.
  """
  def append_image_attachments(body_html, ap_object) when is_binary(body_html) and is_map(ap_object) do
    images = extract_image_attachments(ap_object)

    if images == [] do
      body_html
    else
      # Check if body already contains these image URLs (some platforms inline them)
      new_images =
        Enum.reject(images, fn %{url: url} ->
          String.contains?(body_html, url)
        end)

      if new_images == [] do
        body_html
      else
        image_html =
          if length(new_images) >= 3 do
            # Wrap as a photo gallery for multi-image posts
            figures =
              new_images
              |> Enum.with_index()
              |> Enum.map_join("", fn {img, idx} ->
                alt = escape_attr(img[:name] || "")
                caption_html = if img[:name] && img[:name] != "", do: ~s(<figcaption>#{escape_attr(img[:name])}</figcaption>), else: ""
                ~s(<figure data-gallery-photo data-image-id="" data-photo-order="#{idx}"><img src="#{escape_attr(img.url)}" alt="#{alt}" loading="lazy" />#{caption_html}</figure>)
              end)

            ~s(<div data-photo-gallery data-gallery-layout="grid" data-gallery-columns="3">#{figures}</div>)
          else
            Enum.map_join(new_images, "", fn img ->
              alt = escape_attr(img[:name] || "")
              ~s(<div class="fediverse-attachment"><img src="#{escape_attr(img.url)}" alt="#{alt}" loading="lazy" /></div>)
            end)
          end

        body_html <> image_html
      end
    end
  end

  def append_image_attachments(body_html, _), do: body_html || ""

  @doc """
  Extract image attachment URLs from an AP object's `attachment` field.
  Returns a list of maps with :url, :media_type, and :name keys.
  """
  def extract_image_attachments(ap_object) when is_map(ap_object) do
    attachments = ap_object["attachment"] || []

    attachments
    |> List.wrap()
    |> Enum.filter(&is_image_attachment?/1)
    |> Enum.map(fn att ->
      %{
        url: att["url"],
        media_type: att["mediaType"],
        name: att["name"]
      }
    end)
    |> Enum.filter(fn %{url: url} -> is_binary(url) and String.starts_with?(url, "https://") end)
  end

  def extract_image_attachments(_), do: []

  defp is_image_attachment?(att) when is_map(att) do
    type = att["type"]
    media_type = att["mediaType"] || ""

    (type == "Document" || type == "Image") &&
      media_type in @image_types
  end

  defp is_image_attachment?(_), do: false

  defp escape_attr(str) when is_binary(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("\"", "&quot;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
  end

  defp escape_attr(_), do: ""
end
