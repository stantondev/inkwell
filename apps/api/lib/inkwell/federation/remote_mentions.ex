defmodule Inkwell.Federation.RemoteMentions do
  @moduledoc """
  `@user@server` mentions of fediverse accounts in entries and stickies
  (Jon Henshaw's roadmap post, 2026-10-11).

  `link/1` finds handles in the post's text, looks each account up (our
  `remote_actors` cache first, else WebFinger + the actor document), and
  turns the handle into a Mastodon-style mention link: it reads `@recollect`,
  the full handle is in the title, and it points at the account's own
  profile page. Handles that can't be found are left as typed.

  The link carries `data-mention="user@server"`; `mentioned_actors/1` reads
  those back when the post is federated, for the Mention tags (which notify
  the person on their server) and for delivery to their inbox.

  Lookups happen only when a post is published or a published post is
  saved, never on draft autosaves. At most 10 handles per post; a handle
  that failed isn't looked up again for an hour.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Federation.{Http, RemoteActor, RemoteActorSchema}

  @max_handles 10
  @failure_ttl_seconds 3600
  @cache :remote_mention_cache

  # A handle in text: not glued to a word, an @ or a URL path before it, and
  # a real-looking domain after it.
  @handle_regex ~r/(?<![\w@\/.:-])@([A-Za-z0-9_][A-Za-z0-9_.-]{0,63})@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})(?![\w@-])/u

  @doc """
  Turn `@user@server` handles in `html` into mention links. Returns
  `{html, actors}`.
  """
  def link(html) when is_binary(html) do
    handles = handles_in(html)

    {local, remote} = Enum.split_with(handles, fn {_, domain} -> local_domain?(domain) end)

    actors =
      remote
      |> Enum.take(@max_handles)
      |> Enum.map(fn {user, domain} -> {{String.downcase(user), String.downcase(domain)}, resolve(user, domain)} end)
      |> Enum.reject(fn {_, actor} -> is_nil(actor) end)
      |> Map.new()

    if map_size(actors) == 0 and local == [] do
      {html, []}
    else
      {replace_in_text(html, actors), Map.values(actors)}
    end
  end

  def link(other), do: {other, []}

  @doc "Distinct `{user, domain}` handles in the text of `html` (outside links)."
  def handles_in(html) when is_binary(html) do
    html
    |> text_segments()
    |> Enum.flat_map(fn text -> Regex.scan(@handle_regex, text) end)
    |> Enum.map(fn [_, user, domain] -> {user, domain} end)
    |> Enum.uniq_by(fn {u, d} -> {String.downcase(u), String.downcase(d)} end)
  end

  def handles_in(_), do: []

  @doc """
  The fediverse accounts a post's (already linked) HTML mentions, from the
  `data-mention="user@server"` attributes `link/1` wrote. Cache only, no
  network.
  """
  def mentioned_actors(html) when is_binary(html) do
    pairs =
      Regex.scan(~r/data-mention="([^"@\s]+)@([^"@\s]+)"/, html)
      |> Enum.map(fn [_, u, d] -> {String.downcase(u), String.downcase(d)} end)
      |> Enum.uniq()
      |> Enum.take(@max_handles)

    Enum.flat_map(pairs, fn {u, d} -> List.wrap(cached_actor(u, d)) end)
  end

  def mentioned_actors(_), do: []

  @doc "How the mention reads: @user (Mastodon's h-card form)."
  def mention_html(%RemoteActorSchema{} = actor) do
    user = escape(actor.username)
    domain = escape(actor.domain)

    ~s(<span class="h-card"><a href="#{escape(profile_url(actor))}" class="u-url mention" ) <>
      ~s(data-mention="#{user}@#{domain}" title="@#{user}@#{domain}">@<span>#{user}</span></a></span>)
  end

  def profile_url(%RemoteActorSchema{raw_data: %{"url" => url}}) when is_binary(url), do: url
  def profile_url(%RemoteActorSchema{ap_id: ap_id}), do: ap_id

  # ── Lookup ───────────────────────────────────────────────────────────────

  defp resolve(user, domain) do
    key = {String.downcase(user), String.downcase(domain)}

    cond do
      actor = cached_actor(elem(key, 0), elem(key, 1)) -> actor
      recently_failed?(key) -> nil
      true -> lookup(user, domain, key)
    end
  end

  defp lookup(user, domain, key) do
    with {:ok, actor_uri} <- webfinger(user, domain),
         {:ok, %RemoteActorSchema{} = actor} <- RemoteActor.fetch(actor_uri) do
      actor
    else
      reason ->
        Logger.info("[RemoteMentions] @#{user}@#{domain} not found: #{inspect(reason)}")
        :ets.insert(@cache, {key, System.system_time(:second)})
        nil
    end
  rescue
    e ->
      Logger.warning("[RemoteMentions] lookup of @#{user}@#{domain} failed: #{Exception.message(e)}")
      nil
  end

  defp webfinger(user, domain) do
    resource = "acct:#{user}@#{domain}"
    url = "https://#{domain}/.well-known/webfinger?resource=#{URI.encode_www_form(resource)}"

    with {:ok, {200, body}} <- Http.get(url, [{~c"accept", ~c"application/jrd+json, application/json"}]),
         {:ok, %{"links" => links}} when is_list(links) <- Jason.decode(body),
         %{"href" => href} when is_binary(href) <-
           Enum.find(links, fn l ->
             is_map(l) and l["rel"] == "self" and is_binary(l["type"]) and
               (l["type"] == "application/activity+json" or String.contains?(l["type"], "activitystreams"))
           end) do
      {:ok, href}
    else
      other -> {:error, other}
    end
  end

  defp cached_actor(user, domain) do
    from(a in RemoteActorSchema,
      where: fragment("lower(?)", a.username) == ^user and fragment("lower(?)", a.domain) == ^domain,
      order_by: [desc: a.updated_at],
      limit: 1
    )
    |> Repo.one()
  end

  defp recently_failed?(key) do
    case :ets.lookup(@cache, key) do
      [{^key, at}] -> System.system_time(:second) - at < @failure_ttl_seconds
      _ -> false
    end
  rescue
    ArgumentError -> false
  end

  defp local_domain?(domain), do: Inkwell.Instance.local_host?(String.downcase(domain))

  # ── HTML handling ────────────────────────────────────────────────────────

  # Text between tags, skipping anything inside <a>…</a> (already a link).
  defp text_segments(html) do
    html
    |> tokens()
    |> Enum.reduce({[], 0}, fn
      {:tag, tag}, {acc, depth} -> {acc, anchor_depth(tag, depth)}
      {:text, text}, {acc, 0} -> {[text | acc], 0}
      {:text, _}, {acc, depth} -> {acc, depth}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp replace_in_text(html, actors) do
    html
    |> tokens()
    |> Enum.map_reduce(0, fn
      {:tag, tag}, depth ->
        {tag, anchor_depth(tag, depth)}

      {:text, text}, 0 ->
        replaced =
          Regex.replace(@handle_regex, text, fn whole, user, domain ->
            cond do
              # @name@inkwell.social is one of our members: leave "@name" for
              # MentionHelper, which links members.
              local_domain?(domain) -> "@" <> user
              actor = Map.get(actors, {String.downcase(user), String.downcase(domain)}) -> mention_html(actor)
              true -> whole
            end
          end)

        {replaced, 0}

      {:text, text}, depth ->
        {text, depth}
    end)
    |> elem(0)
    |> IO.iodata_to_binary()
  end

  defp tokens(html) do
    Regex.split(~r/<[^>]*>/, html, include_captures: true, trim: false)
    |> Enum.map(fn
      "<" <> _ = tag -> {:tag, tag}
      text -> {:text, text}
    end)
  end

  defp anchor_depth(tag, depth) do
    cond do
      Regex.match?(~r/^<a[\s>]/i, tag) -> depth + 1
      Regex.match?(~r/^<\/a\s*>/i, tag) -> max(depth - 1, 0)
      true -> depth
    end
  end

  defp escape(nil), do: ""
  defp escape(s), do: s |> to_string() |> Phoenix.HTML.html_escape() |> Phoenix.HTML.safe_to_string()
end
