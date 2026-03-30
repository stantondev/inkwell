defmodule Inkwell.Muse do
  @moduledoc """
  The Inkwell Muse — an AI-powered content bot that posts thoughtful writing
  prompts to an official @muse account.

  Three content types:
  - Daily writing prompts (Claude-generated, 9am UTC)
  - Weekly roundups (auto-generated from DB stats, Sunday 10am UTC)
  - Monthly community updates (1st of month, Claude-assisted with real stats)

  Requires: ANTHROPIC_API_KEY, MUSE_ENABLED=true, a user with the muse username.
  """

  import Ecto.Query
  alias Inkwell.{Accounts, Journals, Repo}
  alias Inkwell.Journals.Entry
  alias Inkwell.Muse.ClaudeClient

  require Logger

  # ── Configuration ──────────────────────────────────────────────────────────

  @doc "Returns true if the Muse feature is enabled."
  def enabled? do
    Application.get_env(:inkwell, :muse_enabled, false)
  end

  @doc "Get the Muse user account, or nil if not found."
  def get_muse_user do
    username = Application.get_env(:inkwell, :muse_username, "muse")
    Accounts.get_user_by_username(username)
  end

  # ── Daily Writing Prompt ───────────────────────────────────────────────────

  @doc "Generate and publish a daily writing prompt."
  def create_daily_prompt do
    with {:ok, user} <- ensure_muse_user(),
         context <- build_prompt_context(),
         {:ok, content} <- generate_or_fallback(context) do
      publish_entry(user, content, "writing-prompt")
    end
  end

  defp generate_or_fallback(context) do
    system_prompt = daily_prompt_system()
    user_prompt = daily_prompt_user(context)

    case ClaudeClient.generate_prompt(system_prompt, user_prompt) do
      {:ok, content} ->
        {:ok, content}

      {:error, reason} ->
        Logger.warning("[Muse] Claude API failed (#{inspect(reason)}), using evergreen prompt")
        get_evergreen_prompt()
    end
  end

  defp daily_prompt_system do
    """
    You are the Inkwell Muse, a writing prompt bot for a social journaling platform. You post short, punchy prompts that spark journal entries and community conversation.

    CRITICAL RULES:
    - Keep it SHORT. The body should be 1-2 sentences max. Under 50 words total.
    - Be direct. Ask a question or make a provocation. No preamble, no context paragraphs, no flowery setup.
    - Sound like a friend asking a question, not an AI writing a blog post about writing.
    - No "creative constraints" or "optional challenges" — just the prompt itself.
    - Prompts should invite personal stories people actually want to share and read.

    Respond with ONLY a JSON object (no markdown, no code blocks) with these keys:
    - "title": Short hook, under 50 chars. Think tweet, not headline.
    - "body_html": One <p> tag with 1-2 sentences. That's it. No <em>, <strong>, <blockquote> — just the question.
    - "tags": Array of 2-3 relevant tags (lowercase, hyphenated)

    GOOD examples of body_html:
    - "<p>What's a sound that instantly takes you somewhere else? Where does it take you?</p>"
    - "<p>Describe a meal where something changed between the first bite and the last.</p>"
    - "<p>What's something you were completely wrong about? When did you realize?</p>"

    BAD examples (too long, too literary):
    - "There's a sound — maybe a screen door closing, rain on a tin roof..." (too much setup)
    - "We all carry conversations that ended too soon..." (preamble before the actual prompt)
    - "Food is never just food. It's memory, identity, love..." (editorializing)
    """
  end

  defp daily_prompt_user(context) do
    parts = [
      "Today is #{context.date_string} (#{context.day_of_week}).",
      "Season: #{context.season}."
    ]

    parts =
      if context.trending_tags != [] do
        tags = Enum.join(context.trending_tags, ", ")
        parts ++ ["Trending tags on Inkwell this week: #{tags}."]
      else
        parts
      end

    parts =
      if context.active_circles != [] do
        circles = Enum.join(context.active_circles, ", ")
        parts ++ ["Active writing circles: #{circles}."]
      else
        parts
      end

    parts =
      parts ++
        [
          "",
          "Generate a short, original writing prompt. 1-2 sentences max. Just the question, no setup."
        ]

    Enum.join(parts, "\n")
  end

  # ── Weekly Roundup ─────────────────────────────────────────────────────────

  @doc "Generate and publish a weekly roundup from platform data (no AI needed)."
  def create_weekly_roundup do
    with {:ok, user} <- ensure_muse_user(),
         stats <- gather_weekly_stats() do
      content = build_roundup_content(stats)
      publish_entry(user, content, "weekly-roundup")
    end
  end

  defp gather_weekly_stats do
    since = DateTime.utc_now() |> DateTime.add(-7 * 86400, :second)

    %{
      top_entries: get_top_entries_this_week(since),
      new_writers: count_new_writers(since),
      total_entries: count_entries_this_week(since),
      trending_tags: get_trending_tags(since),
      active_circles: get_active_circle_names()
    }
  end

  defp build_roundup_content(stats) do
    now = DateTime.utc_now()
    week_ending = Calendar.strftime(now, "%B %d, %Y")

    new_writers_text = if stats.new_writers > 0, do: ", #{stats.new_writers} new writers", else: ""

    body_parts = [
      "<p>#{stats.total_entries} entries published this week#{new_writers_text}.</p>"
    ]

    # Top entries
    body_parts =
      if stats.top_entries != [] do
        entries_html =
          stats.top_entries
          |> Enum.map(fn entry ->
            author = if entry.user, do: entry.user.display_name || entry.user.username, else: "Anonymous"
            "<li>#{escape_html(entry.title || "Untitled")} by #{escape_html(author)}</li>"
          end)
          |> Enum.join("\n")

        body_parts ++ ["<p>Most inked this week:</p>", "<ul>#{entries_html}</ul>"]
      else
        body_parts
      end

    # Trending tags
    body_parts =
      if stats.trending_tags != [] do
        tags_text = stats.trending_tags |> Enum.map(&"##{&1}") |> Enum.join(", ")
        body_parts ++ ["<p>Trending: #{tags_text}</p>"]
      else
        body_parts
      end

    %{
      title: "This Week on Inkwell — #{week_ending}",
      body_html: Enum.join(body_parts, "\n"),
      tags: ["weekly-roundup", "community"]
    }
  end

  # ── Monthly Community Update ───────────────────────────────────────────────

  @doc "Generate and publish a monthly community update (Claude-assisted with real stats)."
  def create_monthly_update do
    with {:ok, user} <- ensure_muse_user(),
         stats <- gather_monthly_stats(),
         {:ok, content} <- generate_monthly_content(stats) do
      publish_entry(user, content, "monthly-update")
    end
  end

  defp gather_monthly_stats do
    since = DateTime.utc_now() |> DateTime.add(-30 * 86400, :second)

    total_users = Repo.aggregate(Inkwell.Accounts.User, :count)
    total_entries = Repo.aggregate(Entry, :count)

    %{
      total_users: total_users,
      total_entries: total_entries,
      new_writers: count_new_writers(since),
      entries_this_month: count_entries_this_week(since),
      trending_tags: get_trending_tags(since),
      active_circles: get_active_circle_names()
    }
  end

  defp generate_monthly_content(stats) do
    now = DateTime.utc_now()
    month_name = Calendar.strftime(now, "%B %Y")

    system_prompt = """
    You are the Inkwell Muse, writing a brief monthly community update for a social journaling platform.

    RULES:
    - Keep it short. 2 short paragraphs max.
    - Lead with the key stats as a quick summary line, then one paragraph of genuine reflection.
    - Sound casual and human, not like a press release or corporate blog.
    - No hype, no superlatives, no "incredible" or "amazing." Just honest.

    Respond with ONLY a JSON object (no markdown, no code blocks) with these keys:
    - "title": e.g. "State of the Inkwell — March 2026"
    - "body_html": 2 short paragraphs in HTML (<p> tags). Stats summary + brief reflection.
    - "tags": ["community-update", "state-of-the-inkwell"]
    """

    user_prompt = """
    Write a brief State of the Inkwell for #{month_name}.

    Stats: #{stats.total_users} members, #{stats.total_entries} total entries, #{stats.new_writers} new writers this month, #{stats.entries_this_month} entries this month.
    Trending tags: #{Enum.join(stats.trending_tags, ", ")}.
    Active circles: #{Enum.join(stats.active_circles, ", ")}.

    2 short paragraphs. Stats first, then a brief reflection. Keep it casual.
    """

    case ClaudeClient.generate_prompt(system_prompt, user_prompt) do
      {:ok, content} -> {:ok, content}
      {:error, _reason} ->
        # Fallback: generate a simple stats-based update
        {:ok, build_simple_monthly_update(stats, month_name)}
    end
  end

  defp build_simple_monthly_update(stats, month_name) do
    new_writers_text = if stats.new_writers > 0, do: " #{stats.new_writers} new writers joined.", else: ""
    %{
      title: "State of the Inkwell — #{month_name}",
      body_html: "<p>#{stats.total_users} writers, #{stats.total_entries} entries total. #{stats.entries_this_month} new entries this month.#{new_writers_text}</p><p>Thanks for writing. See you next month.</p>",
      tags: ["community-update", "state-of-the-inkwell"]
    }
  end

  # ── Helpers ────────────────────────────────────────────────────────────────

  defp ensure_muse_user do
    case get_muse_user() do
      nil ->
        Logger.warning("[Muse] Muse user account not found. Create a user with username '#{Application.get_env(:inkwell, :muse_username, "muse")}'.")
        {:error, :muse_user_not_found}

      user ->
        {:ok, user}
    end
  end

  defp publish_entry(user, content, content_type) do
    tags =
      (content.tags || [])
      |> Enum.map(&String.downcase/1)
      |> Enum.uniq()

    # Add content_type tag if not present
    tags = if content_type in tags, do: tags, else: [content_type | tags]

    word_count = count_words(content.body_html)
    excerpt = derive_excerpt(content.body_html)

    attrs = %{
      user_id: user.id,
      title: content.title,
      body_html: content.body_html,
      privacy: :public,
      status: :published,
      tags: tags,
      word_count: word_count,
      excerpt: excerpt,
      source: "muse"
    }

    case Journals.create_entry(attrs) do
      {:ok, entry} ->
        Logger.info("[Muse] Published #{content_type}: \"#{content.title}\" (#{entry.id})")

        # Fan out to fediverse followers
        %{entry_id: entry.id, action: "create", user_id: user.id}
        |> Inkwell.Federation.Workers.FanOutWorker.new()
        |> Oban.insert()

        {:ok, entry}

      {:error, changeset} ->
        Logger.error("[Muse] Failed to publish #{content_type}: #{inspect(changeset.errors)}")
        {:error, changeset}
    end
  end

  defp build_prompt_context do
    now = DateTime.utc_now()
    since = DateTime.utc_now() |> DateTime.add(-7 * 86400, :second)

    %{
      date_string: Calendar.strftime(now, "%B %d, %Y"),
      day_of_week: Calendar.strftime(now, "%A"),
      season: get_season(now),
      trending_tags: get_trending_tags(since),
      active_circles: get_active_circle_names()
    }
  end

  defp get_season(%DateTime{month: month}) do
    cond do
      month in [12, 1, 2] -> "winter"
      month in [3, 4, 5] -> "spring"
      month in [6, 7, 8] -> "summer"
      month in [9, 10, 11] -> "autumn"
    end
  end

  defp get_trending_tags(since) do
    Entry
    |> where([e], e.status == :published and e.privacy == :public)
    |> where([e], e.published_at >= ^since)
    |> where([e], fragment("array_length(?, 1) > 0", e.tags))
    |> select([e], e.tags)
    |> Repo.all()
    |> List.flatten()
    |> Enum.frequencies()
    |> Enum.sort_by(fn {_tag, count} -> -count end)
    |> Enum.take(10)
    |> Enum.map(fn {tag, _count} -> tag end)
  end

  defp get_top_entries_this_week(since) do
    Entry
    |> where([e], e.status == :published and e.privacy == :public)
    |> where([e], e.published_at >= ^since)
    |> where([e], e.ink_count >= 1)
    |> where([e], e.sensitive == false and e.admin_sensitive == false)
    |> order_by([e], [desc: e.ink_count, desc: e.published_at])
    |> limit(5)
    |> preload(:user)
    |> Repo.all()
  end

  defp count_new_writers(since) do
    Inkwell.Accounts.User
    |> where([u], u.inserted_at >= ^since)
    |> where([u], not is_nil(u.username))
    |> Repo.aggregate(:count)
  end

  defp count_entries_this_week(since) do
    Entry
    |> where([e], e.status == :published)
    |> where([e], e.published_at >= ^since)
    |> Repo.aggregate(:count)
  end

  defp get_active_circle_names do
    since = DateTime.utc_now() |> DateTime.add(-7 * 86400, :second)

    Inkwell.Circles.Circle
    |> where([c], c.last_activity_at >= ^since)
    |> where([c], c.discussion_count > 0)
    |> order_by([c], [desc: c.last_activity_at])
    |> limit(5)
    |> select([c], c.name)
    |> Repo.all()
  end

  defp count_words(html) when is_binary(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> length()
  end

  defp count_words(_), do: 0

  defp derive_excerpt(html) when is_binary(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
    |> String.slice(0, 280)
  end

  defp derive_excerpt(_), do: ""

  defp escape_html(text) when is_binary(text) do
    text
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end

  defp escape_html(_), do: ""

  # ── Evergreen Prompts ──────────────────────────────────────────────────────

  @doc "Get a random evergreen prompt from the curated library."
  def get_evergreen_prompt do
    path = Application.app_dir(:inkwell, "priv/content/evergreen_prompts.json")

    case File.read(path) do
      {:ok, data} ->
        case Jason.decode(data) do
          {:ok, %{"prompts" => prompts}} when is_list(prompts) and length(prompts) > 0 ->
            prompt = Enum.random(prompts)

            {:ok,
             %{
               title: prompt["title"],
               body_html: prompt["body_html"],
               tags: prompt["tags"] || ["writing-prompt"]
             }}

          _ ->
            Logger.warning("[Muse] Invalid evergreen prompts file format")
            {:error, :invalid_format}
        end

      {:error, reason} ->
        Logger.warning("[Muse] Could not read evergreen prompts: #{inspect(reason)}")
        {:error, :file_not_found}
    end
  end
end
