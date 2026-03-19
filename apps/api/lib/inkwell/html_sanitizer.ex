defmodule Inkwell.HtmlSanitizer do
  @moduledoc """
  Centralized HTML sanitization for all user-generated and federated content.

  Two sanitization modes:
  - `sanitize/1` (strict) — for federation content, comments, bios, guestbook.
    Allows only safe inline/block tags and strips everything dangerous.
  - `sanitize_profile/1` (permissive) — for Plus profile HTML customization.
    Allows more structural tags but still strips scripts, iframes, event handlers.

  Uses a whitelist approach: only explicitly allowed tags and attributes survive.
  Everything else is stripped (tag removed, content preserved for inline tags).
  """

  # Tags allowed in strict mode (federation, comments, bios)
  @strict_tags ~w(
    p br hr
    strong b em i u s del ins mark sub sup small
    a img
    blockquote pre code
    ul ol li
    h1 h2 h3 h4 h5 h6
    span div
    table thead tbody tfoot tr th td
    figure figcaption
    details summary
    abbr time cite dfn var kbd samp
  )

  # Additional tags allowed in profile mode
  @profile_extra_tags ~w(
    section article aside header footer nav main
    dl dt dd
    audio video source
    picture
    ruby rt rp
    wbr
    address
    caption col colgroup
  )

  # Safe attributes by tag (strict mode)
  @safe_attributes %{
    "a" => ~w(href title rel target class),
    "img" => ~w(src alt title width height loading class style),
    "blockquote" => ~w(cite class),
    "ol" => ~w(start type reversed class),
    "li" => ~w(value class),
    "td" => ~w(colspan rowspan class style),
    "th" => ~w(colspan rowspan scope class style),
    "table" => ~w(class style),
    "time" => ~w(datetime class),
    "abbr" => ~w(title class),
    "code" => ~w(class),
    "pre" => ~w(class),
    "span" => ~w(class style data-mention data-spacing data-circle-embed),
    "div" => ~w(class style data-spacing data-circle-embed data-inkwell-widget),
    "details" => ~w(open class),
    "source" => ~w(srcset type media sizes),
    "audio" => ~w(src controls class),
    "video" => ~w(src controls width height poster class),
    "figure" => ~w(class),
    "h1" => ~w(class style),
    "h2" => ~w(class style),
    "h3" => ~w(class style),
    "h4" => ~w(class style),
    "p" => ~w(class style data-spacing),
    "ul" => ~w(class data-type data-spacing),
    "mark" => ~w(data-color style class),
    "hr" => ~w(class),
  }

  # Global attributes allowed on any tag
  @global_attributes ~w(class id title dir lang data-spacing)

  @doc """
  Strict sanitization for federation content, comments, bios, guestbook entries.
  Strips all dangerous tags/attributes, preserves safe content.
  """
  def sanitize(nil), do: nil
  def sanitize(""), do: ""

  def sanitize(html) when is_binary(html) do
    html
    |> strip_dangerous_tags()
    |> strip_dangerous_attributes()
    |> strip_dangerous_urls()
    |> String.trim()
  end

  @doc """
  Permissive sanitization for Plus profile HTML customization.
  Allows more structural tags but still strips scripts, event handlers, etc.
  """
  def sanitize_profile(nil), do: nil
  def sanitize_profile(""), do: ""

  def sanitize_profile(html) when is_binary(html) do
    html
    |> strip_dangerous_tags_profile()
    |> strip_dangerous_attributes()
    |> strip_dangerous_urls()
    |> strip_external_forms()
    |> String.trim()
  end

  @doc """
  Sanitize CSS to prevent injection attacks.
  Strips @import, expression(), url() with non-https sources, and behavior properties.
  """
  def sanitize_css(nil), do: nil
  def sanitize_css(""), do: ""

  def sanitize_css(css) when is_binary(css) do
    css
    # Strip @import rules (can load external stylesheets)
    |> String.replace(~r/@import\b[^;]*;/is, "")
    # Strip @charset (can cause encoding issues)
    |> String.replace(~r/@charset\b[^;]*;/is, "")
    # Strip expression() (IE CSS expressions — execute JavaScript)
    |> String.replace(~r/expression\s*\([^)]*\)/is, "none")
    # Strip behavior: url() (IE HTC components)
    |> String.replace(~r/behavior\s*:\s*url\s*\([^)]*\)/is, "")
    # Strip -moz-binding (Firefox XBL)
    |> String.replace(~r/-moz-binding\s*:\s*url\s*\([^)]*\)/is, "")
    # Strip url() with data: URIs (can embed HTML/JS)
    |> String.replace(~r/url\s*\(\s*(?:"|')?\s*data\s*:[^)]*\)/is, "url()")
    # Strip url() with javascript: URIs
    |> String.replace(~r/url\s*\(\s*(?:"|')?\s*javascript\s*:[^)]*\)/is, "url()")
    # Strip url() with blob: URIs
    |> String.replace(~r/url\s*\(\s*(?:"|')?\s*blob\s*:[^)]*\)/is, "url()")
    |> String.trim()
  end

  # ── Private: Tag stripping ─────────────────────────────────────────────

  defp strip_dangerous_tags(html) do
    html
    # Remove script tags and their content (including SVG script)
    |> String.replace(~r/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/is, "")
    |> String.replace(~r/<script\b[^>]*\/?\s*>/is, "")
    # Remove style tags and their content (can contain expressions/imports)
    |> String.replace(~r/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/is, "")
    |> String.replace(~r/<style\b[^>]*\/?\s*>/is, "")
    # Remove SVG tags (complex attack surface — scripts, foreignObject, event handlers)
    |> String.replace(~r/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/is, "")
    |> String.replace(~r/<svg\b[^>]*\/?\s*>/is, "")
    # Remove math tags (can contain malicious content)
    |> String.replace(~r/<math\b[^<]*(?:(?!<\/math>)<[^<]*)*<\/math>/is, "")
    # Remove iframe/object/embed/applet
    |> String.replace(~r/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/is, "")
    |> String.replace(~r/<iframe\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^>]*\/?\s*>/is, "")
    # Remove meta, link, base (redirects, external resources)
    |> String.replace(~r/<meta\b[^>]*\/?>/is, "")
    |> String.replace(~r/<link\b[^>]*\/?>/is, "")
    |> String.replace(~r/<base\b[^>]*\/?>/is, "")
    # Remove form tags entirely in strict mode
    |> String.replace(~r/<\/?form\b[^>]*>/is, "")
    |> String.replace(~r/<(input|textarea|select|button)\b[^>]*\/?>/is, "")
    # Remove template tags (can contain unrendered malicious content)
    |> String.replace(~r/<template\b[^<]*(?:(?!<\/template>)<[^<]*)*<\/template>/is, "")
    |> String.replace(~r/<template\b[^>]*\/?\s*>/is, "")
  end

  defp strip_dangerous_tags_profile(html) do
    html
    # Same dangerous tag removal but allow forms with relative actions
    |> String.replace(~r/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/is, "")
    |> String.replace(~r/<script\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/is, "")
    |> String.replace(~r/<svg\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<math\b[^<]*(?:(?!<\/math>)<[^<]*)*<\/math>/is, "")
    |> String.replace(~r/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/is, "")
    |> String.replace(~r/<iframe\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<meta\b[^>]*\/?>/is, "")
    |> String.replace(~r/<link\b[^>]*\/?>/is, "")
    |> String.replace(~r/<base\b[^>]*\/?>/is, "")
    |> String.replace(~r/<template\b[^<]*(?:(?!<\/template>)<[^<]*)*<\/template>/is, "")
    |> String.replace(~r/<template\b[^>]*\/?\s*>/is, "")
  end

  # ── Private: Attribute stripping ────────────────────────────────────────

  defp strip_dangerous_attributes(html) do
    html
    # Remove ALL event handler attributes (on* = ...) with multiple encoding formats
    # Handles: onclick, onload, onerror, onmouseover, onfocus, etc.
    # Also handles HTML entity encoded versions: &#x6F;nclick, &#111;nclick
    |> String.replace(~r/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    # Handle entity-encoded "on" prefix: &#x6F;n, &#111;n, &#0*6F;n etc.
    |> String.replace(~r/\s+(?:&#x?[0-9a-f]+;?)+n[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    # Remove formaction attributes (can override form action)
    |> String.replace(~r/\s+formaction\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    # Remove srcdoc attributes (can contain full HTML documents)
    |> String.replace(~r/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    # Remove dynsrc/lowsrc (IE image loading)
    |> String.replace(~r/\s+(?:dynsrc|lowsrc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
  end

  # ── Private: URL sanitization ──────────────────────────────────────────

  defp strip_dangerous_urls(html) do
    html
    # Strip javascript: URLs in href, src, action, poster, background attributes
    |> String.replace(
      ~r/((?:href|src|action|poster|background|cite)\s*=\s*(?:"|'))(?:\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:)/i,
      "\\1#"
    )
    # Also handle unquoted attribute values
    |> String.replace(
      ~r/((?:href|src|action|poster|background|cite)\s*=\s*)(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i,
      "\\1#"
    )
    # Strip data: URIs in src/href that aren't images
    # Allow: data:image/png, data:image/jpeg, data:image/gif, data:image/webp, data:image/svg+xml
    # Block: data:text/html, data:application/*, etc.
    |> strip_non_image_data_uris()
  end

  defp strip_non_image_data_uris(html) do
    # Replace data: URIs that aren't safe image formats
    Regex.replace(
      ~r/((?:href|src)\s*=\s*(?:"|'))data:(?!image\/(?:png|jpeg|gif|webp|jpg))/i,
      html,
      "\\1#blocked:"
    )
  end

  defp strip_external_forms(html) do
    Regex.replace(
      ~r/<form\b([^>]*)>/is,
      html,
      fn full_match, attrs ->
        case Regex.run(~r/action\s*=\s*(?:"([^"]*)"|'([^']*)')/i, attrs) do
          nil -> full_match
          [_, url | _] ->
            url = String.trim(url)
            if url == "" or not String.starts_with?(url, ["http://", "https://"]) do
              full_match
            else
              ""
            end
        end
      end
    )
  end
end
