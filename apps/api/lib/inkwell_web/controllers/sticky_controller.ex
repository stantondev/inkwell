defmodule InkwellWeb.StickyController do
  @moduledoc """
  Stickies: short posts (no title, up to 500 characters) that mix into Feed and
  Explore. They're entries with `kind: "sticky"`, so reading, inking, stamping,
  commenting, bookmarking, deleting and moderation all go through the normal
  entry paths. Only writing one is different: the body is plain text, turned
  into HTML here (links, #hashtags, line breaks; @mentions are linked by
  `EntryPublishing` like any entry).
  """
  use InkwellWeb, :controller

  alias Inkwell.Journals
  alias Inkwell.Journals.Entry
  alias InkwellWeb.{EntryController, EntryPublishing}

  @max_tags 10

  # POST /api/stickies — {body, privacy?, custom_filter_id?, color?, sensitive?, content_warning?}
  def create(conn, params) do
    user = conn.assigns.current_user
    tier = user.subscription_tier || "free"
    {body_html, tags} = render_body(params["body"])

    attrs =
      params
      |> Map.take(["privacy", "custom_filter_id", "sensitive", "content_warning"])
      |> Map.put_new("privacy", "public")
      |> Map.merge(%{
        "kind" => "sticky",
        "body_html" => body_html,
        "tags" => tags,
        "sticky_color" => color(params["color"]),
        "user_id" => user.id,
        "word_count" => word_count(body_html),
        "excerpt" => excerpt(body_html)
      })
      |> EntryController.maybe_clear_custom_filter_id()

    with :ok <- EntryController.check_entry_rate_limit(user.id, tier),
         :ok <- EntryController.check_duplicate(user.id, body_html),
         :ok <- EntryController.validate_custom_filter_ownership(attrs, user.id),
         {:ok, entry} <- Journals.create_entry(attrs) do
      EntryController.record_entry_creation(user.id)
      entry = EntryPublishing.after_publish(entry, user, %{})

      conn
      |> put_status(:created)
      |> json(%{data: EntryController.render_entry_full(entry, user)})
    else
      error -> render_error(conn, error)
    end
  end

  # PATCH /api/stickies/:id — same fields as create; anything left out stays.
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- EntryController.get_owned_entry(user.id, id),
         :ok <- sticky(entry) do
      attrs =
        params
        |> Map.take(["privacy", "custom_filter_id", "sensitive", "content_warning"])
        |> then(fn a -> if params["color"], do: Map.put(a, "sticky_color", color(params["color"])), else: a end)
        |> then(fn a ->
          if is_binary(params["body"]) do
            {body_html, tags} = render_body(params["body"])

            Map.merge(a, %{
              "body_html" => body_html,
              "tags" => tags,
              "word_count" => word_count(body_html),
              "excerpt" => excerpt(body_html)
            })
          else
            a
          end
        end)
        |> EntryController.maybe_clear_custom_filter_id()

      with :ok <- EntryController.validate_custom_filter_ownership(attrs, user.id),
           {:ok, updated} <- Journals.update_entry(entry, attrs, subscription_tier: user.subscription_tier || "free") do
        updated = EntryPublishing.process_mentions(updated, user.id)
        EntryController.federate_edit(entry, updated, user.id)
        EntryController.enqueue_search_index(updated.id)
        json(conn, %{data: EntryController.render_entry_full(updated, user)})
      else
        error -> render_error(conn, error)
      end
    else
      error -> render_error(conn, error)
    end
  end

  defp sticky(%Entry{kind: "sticky"}), do: :ok
  defp sticky(_), do: {:error, :not_found}

  defp render_error(conn, {:error, %Ecto.Changeset{} = changeset}) do
    errors = EntryController.format_errors(changeset)
    message = errors |> Map.values() |> List.flatten() |> List.first()

    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: errors, error: sticky_message(errors, message)})
  end

  defp render_error(conn, {:error, :rate_limited}),
    do: conn |> put_status(:too_many_requests) |> json(%{error: "You're posting very fast. Give it a few minutes."})

  defp render_error(conn, {:error, :duplicate}),
    do: conn |> put_status(:conflict) |> json(%{error: "You just posted this sticky."})

  defp render_error(conn, {:error, :filter_not_found}),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})

  defp render_error(conn, {:error, :forbidden}),
    do: conn |> put_status(:forbidden) |> json(%{error: "Not your sticky"})

  defp render_error(conn, {:error, _}),
    do: conn |> put_status(:not_found) |> json(%{error: "Sticky not found"})

  defp sticky_message(%{body_html: [msg | _]}, _), do: "Your sticky #{msg}."
  defp sticky_message(_, msg), do: msg || "Couldn't save your sticky."

  defp color(c) when is_binary(c) do
    if c in Entry.sticky_colors(), do: c, else: "yellow"
  end

  defp color(_), do: "yellow"

  defp word_count(html), do: html |> Entry.plain_text() |> String.split(~r/\s+/, trim: true) |> length()

  defp excerpt(html) do
    text = Entry.plain_text(html)
    if String.length(text) > 280, do: String.slice(text, 0, 279) <> "…", else: text
  end

  @url_regex ~r{https?://[^\s<>"]+}u
  @hashtag_regex ~r/(^|[^\p{L}\p{N}_&#\/])#([\p{L}\p{N}_]{1,50})/u

  @doc """
  Plain text to sticky HTML. Returns `{html, tags}`: text is escaped, URLs and
  #hashtags become links (hashtags in Mastodon's markup so they render as tags
  there too), blank lines separate paragraphs, single newlines become <br>.
  """
  def render_body(text) when is_binary(text) do
    text = text |> String.replace("\r\n", "\n") |> String.trim()

    {paragraphs, tags} =
      text
      |> String.split(~r/\n\s*\n/, trim: true)
      |> Enum.map_reduce([], fn para, tags ->
        {html, found} = render_inline(para)
        {"<p>" <> html <> "</p>", tags ++ found}
      end)

    tags =
      tags
      |> Enum.map(&String.downcase/1)
      |> Enum.uniq()
      |> Enum.take(@max_tags)

    {Enum.join(paragraphs), tags}
  end

  def render_body(_), do: {"", []}

  # Links first, so a #fragment inside a URL isn't read as a hashtag.
  defp render_inline(para) do
    parts = Regex.split(@url_regex, para, include_captures: true)

    {html, tags} =
      Enum.map_reduce(parts, [], fn part, tags ->
        if Regex.match?(~r{\Ahttps?://}, part) do
          {url, trailing} = split_trailing_punctuation(part)
          escaped = escape(url)
          {~s(<a href="#{escaped}" rel="nofollow noopener" target="_blank">#{escape(display_url(url))}</a>) <> escape(trailing), tags}
        else
          {text_html, found} = render_text(part)
          {text_html, tags ++ found}
        end
      end)

    {html |> Enum.join() |> String.replace("\n", "<br>"), tags}
  end

  defp render_text(text) do
    escaped = escape(text)
    found = for [_, _, tag] <- Regex.scan(@hashtag_regex, escaped), do: tag

    html =
      Regex.replace(@hashtag_regex, escaped, fn _, lead, tag ->
        href = "/tag/" <> URI.encode_www_form(String.downcase(tag))
        ~s(#{lead}<a href="#{href}" class="mention hashtag" rel="tag">#<span>#{tag}</span></a>)
      end)

    {html, found}
  end

  # "Look at https://example.com." shouldn't swallow the period.
  defp split_trailing_punctuation(url) do
    case Regex.run(~r/^(.*?)([.,;:!?)\]'"]+)$/u, url) do
      [_, base, trail] when base != "" -> {base, trail}
      _ -> {url, ""}
    end
  end

  defp display_url(url) do
    shown = String.replace(url, ~r{\Ahttps?://(www\.)?}, "")
    if String.length(shown) > 40, do: String.slice(shown, 0, 39) <> "…", else: shown
  end

  defp escape(text), do: text |> Phoenix.HTML.html_escape() |> Phoenix.HTML.safe_to_string()
end
