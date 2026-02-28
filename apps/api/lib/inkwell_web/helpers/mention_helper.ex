defmodule InkwellWeb.Helpers.MentionHelper do
  @moduledoc """
  Shared utilities for @mention processing in comments.
  Used by both entry comments (CommentController) and feedback comments (FeedbackController).
  """

  import Ecto.Query, only: [from: 2]

  @mention_regex ~r/@([a-zA-Z0-9_-]{1,30})\b/

  @doc """
  Parse @username mentions from HTML body, convert to profile links.
  Returns `{processed_html, mentioned_users}` where `mentioned_users` is a list of
  `%{id: binary, username: string}` maps.
  """
  def process_mentions(body_html) do
    # Extract unique usernames
    usernames =
      Regex.scan(@mention_regex, body_html)
      |> Enum.map(fn [_, username] -> String.downcase(username) end)
      |> Enum.uniq()

    if usernames == [] do
      {body_html, []}
    else
      # Look up all mentioned users in one query
      users =
        from(u in Inkwell.Accounts.User,
          where: fragment("lower(?)", u.username) in ^usernames,
          where: is_nil(u.blocked_at),
          select: %{id: u.id, username: u.username}
        )
        |> Inkwell.Repo.all()

      # Build a lookup map (lowercase username → user)
      user_map = Map.new(users, fn u -> {String.downcase(u.username), u} end)

      # Replace @username with profile links (only for users that exist)
      processed_html =
        Regex.replace(@mention_regex, body_html, fn full_match, username ->
          case Map.get(user_map, String.downcase(username)) do
            nil -> full_match
            user -> ~s(<a href="/#{user.username}" class="mention" data-mention="#{user.username}">@#{user.username}</a>)
          end
        end)

      {processed_html, users}
    end
  end

  @doc """
  Convert plain text to safe HTML. Escapes HTML entities, wraps in <p> tags,
  and converts newlines to <br> tags.

  This is critical for XSS safety when feedback comments (which are plain text input)
  need to be rendered as HTML after mention processing.
  """
  def plain_text_to_html(text) when is_binary(text) do
    text
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
    |> String.replace("\n", "<br>")
    |> then(fn escaped -> "<p>#{escaped}</p>" end)
  end

  def plain_text_to_html(nil), do: ""
end
