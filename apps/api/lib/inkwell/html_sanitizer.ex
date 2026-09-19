defmodule Inkwell.HtmlSanitizer do
  @moduledoc """
  Centralized HTML sanitization for all user-generated and federated content.

  - `sanitize/1` (strict) — entries, comments, letters, circle posts, bios,
    guestbook and everything that arrives over federation.
  - `sanitize_profile/1` (permissive) — Plus custom profile HTML. Adds layout
    tags, still no scripts, handlers, forms or unsafe URLs.
  - `sanitize_css/1` — Plus custom profile CSS.

  HTML is parsed (html_sanitize_ex / mochiweb) and rebuilt from an allowlist of
  tags and attributes; anything not listed is dropped. Before 2026-09-19 this
  module was a set of regexes over the raw string, which let
  `<img/src=x/onerror=...>`, entity-encoded `javascript:` links and tab-split
  schemes through, and entry bodies weren't sanitized at all. Every stored
  field that is rendered as HTML must go through here.
  """

  alias Inkwell.HtmlSanitizer.{ContentScrubber, ProfileScrubber}

  @doc "Strict sanitization for entries, comments, letters, bios and federated content."
  def sanitize(nil), do: nil
  def sanitize(""), do: ""

  def sanitize(html) when is_binary(html) do
    html |> pre_strip() |> ContentScrubber.sanitize() |> drop_empty_iframes() |> String.trim()
  end

  # An iframe whose src wasn't an allowed player keeps no src; drop the empty box.
  defp drop_empty_iframes(html) do
    Regex.replace(~r/<iframe\b(?![^>]*\bsrc=)[^>]*>.*?<\/iframe>/is, html, "")
  end

  @doc """
  Sanitize a changed HTML field inside an Ecto changeset. Called from every
  schema changeset that stores HTML the web app renders, so no controller,
  worker or importer can skip it.
  """
  def sanitize_change(%Ecto.Changeset{} = changeset, field, mode \\ :strict) do
    case Ecto.Changeset.fetch_change(changeset, field) do
      {:ok, value} when is_binary(value) ->
        clean = if mode == :profile, do: sanitize_profile(value), else: sanitize(value)
        Ecto.Changeset.put_change(changeset, field, clean)

      _ ->
        changeset
    end
  end

  @doc "Permissive sanitization for Plus custom profile HTML."
  def sanitize_profile(nil), do: nil
  def sanitize_profile(""), do: ""

  def sanitize_profile(html) when is_binary(html) do
    html |> pre_strip() |> ProfileScrubber.sanitize() |> drop_empty_iframes() |> String.trim()
  end

  # Elements whose *contents* must go too, not just the tags. The scrubber
  # drops unknown tags but keeps their children as text, which would turn a
  # <script> body into visible junk.
  @drop_with_content ~w(script style template noscript textarea select object embed applet svg math title head)

  defp pre_strip(html) do
    Enum.reduce(@drop_with_content, html, fn tag, acc ->
      acc
      |> then(&Regex.replace(~r/<#{tag}\b[^>]*>.*?<\/#{tag}\s*>/is, &1, ""))
      |> then(&Regex.replace(~r/<\/?#{tag}\b[^>]*>/is, &1, ""))
    end)
  end

  # ── URLs ─────────────────────────────────────────────────────────────────

  @doc false
  # Returns the URL if it's safe to keep in href/src/cite, else nil. Relative
  # and protocol-relative URLs are fine; absolute ones must use an allowed
  # scheme. Browsers ignore tabs/newlines and decode entities inside URLs, so
  # we do the same before looking at the scheme.
  def safe_url(url, kind) when is_binary(url) do
    normalized =
      url
      |> decode_entities()
      |> String.replace(~r/[\x00-\x20\x7f]/u, "")

    cond do
      normalized == "" ->
        nil

      Regex.match?(~r/^[a-zA-Z][a-zA-Z0-9+.\-]*:/, normalized) ->
        scheme = normalized |> String.split(":", parts: 2) |> hd() |> String.downcase()

        cond do
          scheme in ["http", "https"] -> url
          scheme == "mailto" and kind == :link -> url
          scheme == "data" and kind == :image and
              Regex.match?(~r/^data:image\/(png|jpe?g|gif|webp);base64,/i, normalized) ->
            url

          true ->
            nil
        end

      true ->
        # Relative, root-relative, fragment, query or protocol-relative (//host)
        url
    end
  end

  def safe_url(_url, _kind), do: nil

  defp decode_entities(s) do
    s
    |> then(&Regex.replace(~r/&#x([0-9a-f]+);?/i, &1, fn _, hex -> codepoint(String.to_integer(hex, 16)) end))
    |> then(&Regex.replace(~r/&#([0-9]+);?/, &1, fn _, dec -> codepoint(String.to_integer(dec)) end))
    |> String.replace(~r/&colon;?/i, ":")
    |> String.replace(~r/&(tab|newline);?/i, "")
  end

  defp codepoint(n) when n in 0..0xD7FF or n in 0xE000..0x10FFFF, do: <<n::utf8>>
  defp codepoint(_), do: ""

  # ── Inline styles ────────────────────────────────────────────────────────

  @content_style_props ~w(
    text-align color background-color background-image background-size
    background-position background-repeat font-weight font-style font-size
    text-decoration text-indent line-height letter-spacing white-space
    width height max-width min-width max-height min-height float clear
    margin margin-top margin-right margin-bottom margin-left
    padding padding-top padding-right padding-bottom padding-left
    border border-top border-right border-bottom border-left border-color
    border-style border-width border-radius border-collapse
    vertical-align list-style-type display object-fit
  )

  @profile_extra_style_props ~w(
    font-family text-transform text-shadow box-shadow opacity
    position top right bottom left z-index overflow gap
    justify-content align-items flex flex-direction flex-wrap
    grid-template-columns grid-gap transform transition
  )

  @doc false
  def scrub_style(value, mode \\ :content)

  def scrub_style(value, mode) when is_binary(value) do
    allowed =
      case mode do
        :profile -> @content_style_props ++ @profile_extra_style_props
        _ -> @content_style_props
      end

    decls =
      value
      |> String.split(";")
      |> Enum.map(&String.trim/1)
      |> Enum.flat_map(fn decl ->
        case String.split(decl, ":", parts: 2) do
          [prop, val] ->
            prop = prop |> String.trim() |> String.downcase()
            val = String.trim(val)

            if prop in allowed and safe_style_value?(prop, val),
              do: ["#{prop}: #{val}"],
              else: []

          _ ->
            []
        end
      end)

    case decls do
      [] -> nil
      _ -> {"style", Enum.join(decls, "; ")}
    end
  end

  def scrub_style(_value, _mode), do: nil

  defp safe_style_value?(prop, val) do
    lower = String.downcase(val)

    cond do
      val == "" -> false
      String.contains?(val, ["\\", "<", ">", "{", "}", "@", "/*"]) -> false
      String.contains?(lower, ["expression", "javascript:", "vbscript:", "-moz-binding", "behavior"]) -> false
      prop == "position" and String.contains?(lower, "fixed") -> false
      String.contains?(lower, "url(") -> prop == "background-image" and safe_css_urls?(val)
      true -> true
    end
  end

  defp safe_css_urls?(val) do
    Regex.scan(~r/url\(\s*['"]?([^'")]*)['"]?\s*\)/i, val)
    |> Enum.all?(fn [_, u] ->
      u = String.trim(u)
      Regex.match?(~r/^(https?:\/\/|\/)[^\s]*$/i, u)
    end)
  end

  # ── CSS (Plus custom profile CSS) ────────────────────────────────────────

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
end

defmodule Inkwell.HtmlSanitizer.ContentScrubber do
  @moduledoc false
  # Allowlist for everything the editor produces (TipTap StarterKit, tables,
  # task lists, alignment, colour, highlight, spacing, link/circle embeds,
  # photo galleries), @mentions, and ordinary HTML from imports and the
  # fediverse.
  use HtmlSanitizeEx

  alias Inkwell.HtmlSanitizer, as: S

  # Tags with no attributes worth keeping beyond the globals.
  allow_tag_with_these_attributes("br", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("strong", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("b", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("em", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("i", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("u", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("s", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("del", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("ins", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("sub", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("sup", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("small", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("pre", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("figcaption", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("thead", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("tbody", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("tfoot", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("tr", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("caption", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("cite", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("dfn", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("var", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("kbd", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("samp", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("q", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("summary", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("center", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("dl", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("dt", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("dd", ["class", "dir", "lang"])
  allow_tag_with_these_attributes("colgroup", ["class", "dir", "lang"])

  allow_tag_with_these_attributes "a", ["title", "rel", "target", "class", "data-mention", "data-circle-embed-inner", "id", "name"] do
    {"href", url} -> if u = S.safe_url(url, :link), do: {"href", u}
  end

  allow_tag_with_these_attributes "img", ["alt", "title", "width", "height", "loading", "class", "data-image-id"] do
    {"src", url} -> if u = S.safe_url(url, :image), do: {"src", u}
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "blockquote", ["class", "data-spacing"] do
    {"cite", url} -> if u = S.safe_url(url, :link), do: {"cite", u}
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "p", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h1", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h2", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h3", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h4", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h5", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "h6", ["class", "data-spacing", "id", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "span", ["class", "data-mention", "data-spacing", "aria-hidden", "lang", "dir"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "div",
    [
      "class", "data-spacing", "data-type",
      "data-circle-embed", "data-circle-slug", "data-circle-name", "data-circle-description",
      "data-circle-category", "data-circle-members",
      "data-photo-gallery", "data-photo-gallery-wrapper", "data-gallery-layout", "data-gallery-columns",
      "data-link-embed", "data-link-url", "data-link-title", "data-link-description",
      "data-link-thumbnail", "data-link-author", "data-link-provider", "data-link-site",
      "data-link-published", "data-link-type", "lang", "dir"
    ] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "mark", ["class", "data-color"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "figure", ["class", "data-gallery-photo", "data-image-id", "data-photo-order"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes("hr", ["class"])
  allow_tag_with_these_attributes("code", ["class"])
  allow_tag_with_these_attributes("ul", ["class", "data-type", "data-spacing"])
  allow_tag_with_these_attributes("ol", ["start", "type", "reversed", "class", "data-spacing"])
  allow_tag_with_these_attributes("li", ["value", "class", "data-type", "data-checked", "data-spacing"])
  allow_tag_with_these_attributes("label", ["class", "contenteditable"])
  allow_tag_with_these_attributes("details", ["open", "class"])
  allow_tag_with_these_attributes("abbr", ["title", "class"])
  allow_tag_with_these_attributes("time", ["datetime", "class"])

  # Task-list checkboxes only.
  allow_tag_with_these_attributes "input", [] do
    {"type", "checkbox"} -> {"type", "checkbox"}
    {"checked", v} -> {"checked", v}
    {"disabled", v} -> {"disabled", v}
  end

  allow_tag_with_these_attributes "table", ["class"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "td", ["colspan", "rowspan", "scope", "colwidth", "class"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "th", ["colspan", "rowspan", "scope", "colwidth", "class"] do
    {"style", v} -> S.scrub_style(v)
  end

  allow_tag_with_these_attributes "col", ["span", "class"] do
    {"style", v} -> S.scrub_style(v)
  end

  # Video embeds from imported posts (old LiveJournal/WordPress) — only from
  # hosts that are themselves sandboxed players.
  allow_tag_with_these_attributes "iframe", ["width", "height", "allowfullscreen", "frameborder", "title", "loading"] do
    {"src", url} ->
      if Regex.match?(
           ~r{^(https:)?//(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)/(embed|video)/}i,
           String.trim(url)
         ),
         do: {"src", String.trim(url)}
  end
end

defmodule Inkwell.HtmlSanitizer.ProfileScrubber do
  @moduledoc false
  # Plus custom profile HTML: the content allowlist plus layout tags and a
  # wider set of inline style properties. Forms, scripts and handlers are
  # still dropped.
  use HtmlSanitizeEx, extend: Inkwell.HtmlSanitizer.ContentScrubber

  alias Inkwell.HtmlSanitizer, as: S

  allow_tag_with_these_attributes "section", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "article", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "aside", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "header", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "footer", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "nav", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "main", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "address", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "p", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "span", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "div", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h1", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h2", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h3", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h4", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h5", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "h6", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "ul", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "ol", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "li", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "table", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "td", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "th", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "figure", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "blockquote", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "center", ["class", "id", "title", "align", "data-inkwell-widget", "dir", "lang"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "marquee", ["class", "id", "scrollamount", "scrolldelay", "direction", "behavior", "loop", "width", "height"] do
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "img", ["alt", "title", "width", "height", "loading", "class", "id", "align"] do
    {"src", url} -> if u = S.safe_url(url, :image), do: {"src", u}
    {"style", v} -> S.scrub_style(v, :profile)
  end

  allow_tag_with_these_attributes "audio", ["controls", "width", "height", "class", "loop", "muted", "preload"] do
    {"src", url} -> if u = S.safe_url(url, :media), do: {"src", u}
    {"poster", url} -> if u = S.safe_url(url, :image), do: {"poster", u}
  end

  allow_tag_with_these_attributes "video", ["controls", "width", "height", "class", "loop", "muted", "preload"] do
    {"src", url} -> if u = S.safe_url(url, :media), do: {"src", u}
    {"poster", url} -> if u = S.safe_url(url, :image), do: {"poster", u}
  end

  allow_tag_with_these_attributes "source", ["type", "media", "sizes"] do
    {"src", url} -> if u = S.safe_url(url, :media), do: {"src", u}
  end

  allow_tag_with_these_attributes("picture", ["class", "id"])
  allow_tag_with_these_attributes("ruby", ["class", "id"])
  allow_tag_with_these_attributes("rt", ["class", "id"])
  allow_tag_with_these_attributes("rp", ["class", "id"])
  allow_tag_with_these_attributes("wbr", ["class", "id"])
  allow_tag_with_these_attributes("caption", ["class", "id"])
  allow_tag_with_these_attributes("dl", ["class", "id"])
  allow_tag_with_these_attributes("dt", ["class", "id"])
  allow_tag_with_these_attributes("dd", ["class", "id"])
  allow_tag_with_these_attributes("font", ["class", "id"])
end
