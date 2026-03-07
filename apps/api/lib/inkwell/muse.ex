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
    You are the Inkwell Muse, a warm and thoughtful writing companion for a social journaling platform called Inkwell. Your voice is literary, inviting, and occasionally playful — like a well-read friend encouraging someone to pick up their pen.

    Your job is to create a single writing prompt that inspires journal entries. The prompt should be:
    - Specific enough to spark ideas, but open enough for personal interpretation
    - Evocative and sensory — invite writers to explore feelings, memories, and observations
    - Occasionally include a creative constraint (word limit, format, starting phrase)
    - Varied in theme: personal reflection, creative writing, observation, memory, imagination, gratitude, curiosity

    Respond with ONLY a JSON object (no markdown, no code blocks) with these keys:
    - "title": A compelling title for the prompt entry (max 100 chars)
    - "body_html": Rich HTML body (2-3 paragraphs of prompt text using <p>, <em>, <strong>, <blockquote> tags). Include the actual prompt/question, some context or inspiration to get writers thinking, and optionally a creative constraint.
    - "tags": Array of 2-4 relevant tags (lowercase, hyphenated)

    Do NOT use generic prompts like "write about your day" or "what are you grateful for". Be specific, evocative, and original.
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
          "Generate a fresh, original writing prompt. Avoid repeating themes from recent prompts.",
          "Make it something that would inspire a thoughtful 300-1000 word journal entry."
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

    body_parts = ["<p><em>A look back at what the Inkwell community has been writing this week.</em></p>"]

    # Stats overview
    body_parts =
      body_parts ++
        [
          "<p>This week, <strong>#{stats.total_entries} entries</strong> were published" <>
            if(stats.new_writers > 0,
              do: " and <strong>#{stats.new_writers} new writers</strong> joined the community.",
              else: "."
            ) <> "</p>"
        ]

    # Top entries
    body_parts =
      if stats.top_entries != [] do
        entries_html =
          stats.top_entries
          |> Enum.map(fn entry ->
            author = if entry.user, do: entry.user.display_name || entry.user.username, else: "Anonymous"
            ink_text = if entry.ink_count > 0, do: " (#{entry.ink_count} inks)", else: ""
            "<li><strong>#{escape_html(entry.title || "Untitled")}</strong> by #{escape_html(author)}#{ink_text}</li>"
          end)
          |> Enum.join("\n")

        body_parts ++ ["<p><strong>Most inked entries this week:</strong></p>", "<ul>#{entries_html}</ul>"]
      else
        body_parts ++ ["<p>Check out <a href=\"/explore\">Explore</a> to discover this week's entries.</p>"]
      end

    # Trending tags
    body_parts =
      if stats.trending_tags != [] do
        tags_text = stats.trending_tags |> Enum.map(&"##{&1}") |> Enum.join(", ")
        body_parts ++ ["<p><strong>Trending tags:</strong> #{tags_text}</p>"]
      else
        body_parts
      end

    # Active circles
    body_parts =
      if stats.active_circles != [] do
        circles_text = Enum.join(stats.active_circles, ", ")

        body_parts ++
          ["<p><strong>Active circles:</strong> #{circles_text}. <a href=\"/circles\">Browse all circles →</a></p>"]
      else
        body_parts
      end

    body_parts =
      body_parts ++
        ["<p><em>Keep writing. Every entry adds something to the world. See you next week.</em></p>"]

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
    You are the Inkwell Muse, writing the monthly "State of the Inkwell" community update. Your voice is warm, celebratory, and forward-looking. This is a brief, uplifting update about how the community is growing.

    Respond with ONLY a JSON object (no markdown, no code blocks) with these keys:
    - "title": e.g. "State of the Inkwell — March 2026"
    - "body_html": 3-4 paragraphs in HTML (<p>, <strong>, <em> tags). Include the stats naturally woven into prose (not just a bullet list). End with encouragement and a look ahead.
    - "tags": ["community-update", "state-of-the-inkwell"]
    """

    user_prompt = """
    Write the State of the Inkwell for #{month_name}.

    Stats:
    - Total community members: #{stats.total_users}
    - Total entries published: #{stats.total_entries}
    - New writers this month: #{stats.new_writers}
    - Entries published this month: #{stats.entries_this_month}
    - Trending tags: #{Enum.join(stats.trending_tags, ", ")}
    - Active circles: #{Enum.join(stats.active_circles, ", ")}

    Keep it brief (3-4 paragraphs), celebratory, and genuine. Don't exaggerate or hype — be honest and warm.
    """

    case ClaudeClient.generate_prompt(system_prompt, user_prompt) do
      {:ok, content} -> {:ok, content}
      {:error, _reason} ->
        # Fallback: generate a simple stats-based update
        {:ok, build_simple_monthly_update(stats, month_name)}
    end
  end

  defp build_simple_monthly_update(stats, month_name) do
    %{
      title: "State of the Inkwell — #{month_name}",
      body_html: """
      <p><em>A monthly look at how our community of writers is growing.</em></p>
      <p>This month, the Inkwell community grew to <strong>#{stats.total_users} writers</strong>, with <strong>#{stats.entries_this_month} new entries</strong> published. #{if stats.new_writers > 0, do: "We welcomed <strong>#{stats.new_writers} new writers</strong> to the community.", else: ""}</p>
      <p>Across the platform, <strong>#{stats.total_entries} entries</strong> have been shared — each one a piece of someone's story, perspective, or imagination.</p>
      <p><em>Thank you for being part of this. Keep writing.</em></p>
      """,
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
      excerpt: excerpt
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
