defmodule Inkwell.Usage.Catalog do
  @moduledoc """
  Every feature Inkwell counts, in one list, so the names stay the same in
  the database, the web app and Admin → Usage.

  Each feature is measured one of three ways:

    * `:db` — what people already leave behind (an entry, a stamp, a letter).
      `sql` selects `(uid, at)`: who did it and when. Counted from the rows.
    * `:state` — a setting or something set up, with no date (a theme, a
      custom domain). `sql` selects `uid` for everyone who has it now.
    * `:tracked` — leaves no trace of its own (a page, a toggle, a button
      that changes nothing stored). Counted in `feature_use_days` and
      `feature_members` by `Inkwell.Usage.record/3`, from the web app's
      `trackFeature()` or straight from the controller that does the work.

  **Tracked keys must match `FEATURES` in `apps/web/src/lib/usage.ts`**
  (`test/inkwell/usage_test.exs` checks it). Add a feature here first.
  Never rename a tracked key: its history is stored under the old name.
  """

  @groups [
    {"writing", "Writing"},
    {"responding", "Reading and responding"},
    {"letters", "Letters and pen pals"},
    {"community", "Community"},
    {"page", "Your page"},
    {"discovery", "Finding things to read"},
    {"tools", "Tools and settings"}
  ]

  # Published, written here (not imported).
  @own_entries "FROM entries WHERE status = 'published' AND imported_from IS NULL"

  @features [
    # ── Writing ────────────────────────────────────────────────────────────
    %{key: "entries", label: "Journal entries", group: "writing", how: :db, core: true,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND kind = 'entry'"},
    %{key: "stickies", label: "Stickies", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND kind = 'sticky'"},
    %{key: "moods", label: "Moods (with a face)", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND mood_key IS NOT NULL"},
    %{key: "location", label: "Current location", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND coalesce(location, '') <> ''"},
    %{key: "entry_music", label: "Listening to (song on an entry)", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND coalesce(music, '') <> ''"},
    %{key: "now_playing", label: "Now playing from ListenBrainz", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND music_metadata->>'service' = 'listenbrainz'"},
    %{key: "cover_images", label: "Cover images", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND cover_image_id IS NOT NULL"},
    %{key: "galleries", label: "Photo galleries", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND body_html LIKE '%data-photo-gallery%'"},
    %{key: "content_warnings", label: "Content warnings", group: "writing", how: :db, core: true,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND sensitive"},
    %{key: "userpics_on_entries", label: "Userpics chosen for entries", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND user_icon_id IS NOT NULL"},
    %{key: "series", label: "Series", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND series_id IS NOT NULL"},
    %{key: "entry_polls", label: "Polls in entries", group: "writing", how: :db,
      sql: "SELECT creator_id AS uid, inserted_at AS at FROM polls WHERE type = 'entry'"},
    %{key: "quote_reprints", label: "Quote reprints", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND (quoted_entry_id IS NOT NULL OR quoted_remote_entry_id IS NOT NULL)"},
    %{key: "post_by_email", label: "Post by Email", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at FROM entries WHERE status = 'published' AND source = 'email'"},
    %{key: "crossposts", label: "Cross-posts to Mastodon", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND crosspost_results IS NOT NULL AND crosspost_results::text NOT IN ('{}', 'null')"},
    %{key: "newsletter_sends", label: "Newsletter sends", group: "writing", how: :db,
      sql: "SELECT writer_id AS uid, inserted_at AS at FROM newsletter_sends"},
    %{key: "scheduled_posts", label: "Scheduled posts", group: "writing", how: :tracked},
    %{key: "drafts_page", label: "Drafts page", group: "writing", how: :tracked},
    %{key: "posts_bulk", label: "Posts page bulk tools", group: "writing", how: :tracked},
    %{key: "posts_export", label: "Posts page spreadsheet download", group: "writing", how: :tracked},
    %{key: "version_history", label: "Version history", group: "writing", how: :tracked},
    %{key: "imports", label: "Imports", group: "writing", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM data_imports"},
    %{key: "archive_mark", label: "Archive postmark on imports", group: "writing", how: :state,
      sql: "SELECT DISTINCT user_id AS uid FROM entries WHERE archive_mark"},

    # ── Reading and responding ────────────────────────────────────────────
    %{key: "footnotes", label: "Footnotes (comments)", group: "responding", how: :db, core: true,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM comments WHERE user_id IS NOT NULL"},
    %{key: "margin_notes", label: "Margin notes", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM margin_notes"},
    %{key: "inks", label: "Inks", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM inks WHERE user_id IS NOT NULL"},
    %{key: "stamps", label: "Stamps", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM stamps WHERE user_id IS NOT NULL"},
    %{key: "stamp_notes", label: "Notes on stamps", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, updated_at AS at FROM stamps WHERE user_id IS NOT NULL AND coalesce(note, '') <> ''"},
    %{key: "reprints", label: "Reprints", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM reprints WHERE user_id IS NOT NULL"},
    %{key: "bookmarks", label: "Bookmarks", group: "responding", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM bookmarks"},
    %{key: "translate", label: "Translate", group: "responding", how: :tracked},
    %{key: "stamp_album", label: "Stamp album", group: "responding", how: :tracked},
    %{key: "reader_stats", label: "Readers page (reader stats)", group: "responding", how: :tracked},
    %{key: "share", label: "Share button", group: "responding", how: :tracked},

    # ── Letters and pen pals ──────────────────────────────────────────────
    %{key: "follows", label: "Following people", group: "letters", how: :db, core: true,
      sql: "SELECT follower_id AS uid, inserted_at AS at FROM relationships WHERE status IN ('accepted', 'pending') AND follower_id IS NOT NULL"},
    %{key: "letters", label: "Letters", group: "letters", how: :db,
      sql: "SELECT sender_id AS uid, inserted_at AS at FROM direct_messages WHERE sender_id IS NOT NULL"},
    %{key: "letter_stamps", label: "Stamps on letters", group: "letters", how: :db,
      sql: "SELECT sender_id AS uid, inserted_at AS at FROM direct_messages WHERE sender_id IS NOT NULL AND stamp_type IS NOT NULL"},
    %{key: "guestbook", label: "Signing guestbooks", group: "letters", how: :db,
      sql: "SELECT author_id AS uid, inserted_at AS at FROM guestbook_entries WHERE author_id IS NOT NULL"},
    %{key: "sticker_gifts", label: "Sticker gifts", group: "letters", how: :db,
      sql: "SELECT sender_id AS uid, inserted_at AS at FROM sticker_gifts WHERE sender_id IS NOT NULL"},
    %{key: "top_friends", label: "Top 6 pen pals", group: "letters", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM top_friends"},
    %{key: "friend_filters", label: "Friend filters", group: "letters", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM friend_filters"},
    %{key: "invites", label: "Email invites", group: "letters", how: :db,
      sql: "SELECT inviter_id AS uid, inserted_at AS at FROM invitations"},

    # ── Community ─────────────────────────────────────────────────────────
    %{key: "circle_posts", label: "Posting in circles", group: "community", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND circle_id IS NOT NULL"},
    %{key: "circle_joins", label: "Joining circles", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM circle_members"},
    %{key: "circles", label: "Circles (visiting)", group: "community", how: :tracked},
    %{key: "poll_votes", label: "Voting in polls", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM poll_votes"},
    %{key: "poll_comments", label: "Poll comments", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM poll_comments WHERE user_id IS NOT NULL"},
    %{key: "roadmap_posts", label: "Roadmap posts", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM feedback_posts WHERE user_id IS NOT NULL"},
    %{key: "roadmap_votes", label: "Roadmap votes", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM feedback_votes"},
    %{key: "roadmap_comments", label: "Roadmap comments", group: "community", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM feedback_comments WHERE user_id IS NOT NULL"},
    %{key: "gazette", label: "Gazette (reading)", group: "community", how: :tracked},
    %{key: "gazette_responses", label: "Writing about a Gazette story", group: "community", how: :db,
      sql: "SELECT user_id AS uid, published_at AS at #{@own_entries} AND gazette_story_id IS NOT NULL"},
    %{key: "reports", label: "Reporting posts or accounts", group: "community", how: :db, core: true,
      sql: "SELECT reporter_id AS uid, inserted_at AS at FROM reports WHERE reporter_id IS NOT NULL"},

    # ── Your page ─────────────────────────────────────────────────────────
    %{key: "arrange", label: "Arrange my page", group: "page", how: :tracked},
    %{key: "own_stickers", label: "Making your own stickers", group: "page", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM user_stickers"},
    %{key: "placed_stickers", label: "Stickers on profile pages", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE jsonb_array_length(coalesce(profile_home->'stickers', '[]'::jsonb)) > 0"},
    %{key: "userpics", label: "Userpics", group: "page", how: :db,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM user_icons"},
    %{key: "avatar_builder", label: "Alien avatar builder", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE avatar_config IS NOT NULL"},
    %{key: "avatar_frames", label: "Avatar frames", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(avatar_frame, 'none') <> 'none'"},
    %{key: "avatar_animations", label: "Avatar animations", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(avatar_animation, 'none') NOT IN ('none', '')"},
    %{key: "profile_themes", label: "A profile theme other than the default", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(profile_theme, 'default') NOT IN ('default', 'classic', '')"},
    %{key: "custom_css", label: "Custom CSS or HTML", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(profile_css, '') <> '' OR coalesce(profile_html, '') <> ''"},
    %{key: "profile_music", label: "Profile song", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(profile_music, '') <> ''"},
    %{key: "listenbrainz", label: "ListenBrainz connected", group: "page", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce(settings->>'listenbrainz_username', '') <> ''"},
    %{key: "custom_domains", label: "Custom domains", group: "page", how: :state,
      sql: "SELECT user_id AS uid FROM custom_domains WHERE status = 'active'"},
    %{key: "site_export", label: "Download as a website", group: "page", how: :tracked},

    # ── Finding things to read ────────────────────────────────────────────
    %{key: "feed", label: "Feed", group: "discovery", how: :tracked, core: true},
    %{key: "explore", label: "Explore", group: "discovery", how: :tracked, core: true},
    %{key: "explore_fediverse", label: "Explore: Fediverse tab", group: "discovery", how: :tracked},
    %{key: "explore_waiting", label: "Explore: Waiting for a reply", group: "discovery", how: :tracked},
    %{key: "explore_ribbon", label: "Explore: This month (ribbon)", group: "discovery", how: :tracked},
    %{key: "first_entry_notices", label: "First-entry notices (welcomers)", group: "discovery", how: :state,
      sql: "SELECT id AS uid FROM users WHERE coalesce((settings->>'first_entry_notices')::boolean, false)"},
    %{key: "search", label: "Search", group: "discovery", how: :tracked},
    %{key: "fediverse_follows", label: "Following fediverse accounts", group: "discovery", how: :db,
      sql: "SELECT follower_id AS uid, inserted_at AS at FROM relationships WHERE remote_actor_id IS NOT NULL AND follower_id IS NOT NULL"},

    # ── Tools and settings ────────────────────────────────────────────────
    %{key: "classic_view", label: "Classic view (2004)", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE settings->>'site_look' = 'classic'"},
    %{key: "push", label: "Push notifications", group: "tools", how: :state,
      sql: "SELECT DISTINCT user_id AS uid FROM push_subscriptions"},
    %{key: "api_keys", label: "API keys (used)", group: "tools", how: :db,
      sql: "SELECT user_id AS uid, last_used_at AS at FROM api_keys WHERE last_used_at IS NOT NULL AND revoked_at IS NULL"},
    %{key: "fediverse_accounts", label: "Mastodon account linked", group: "tools", how: :state,
      sql: "SELECT DISTINCT user_id AS uid FROM fediverse_accounts"},
    %{key: "bluesky_bridge", label: "Share on Bluesky", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE settings->>'bluesky_bridge' = 'on'"},
    %{key: "newsletter_on", label: "Newsletter switched on", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE newsletter_enabled"},
    %{key: "newsletter_digests", label: "Newsletter digests (weekly or every few posts)", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE newsletter_enabled AND newsletter_mode IN ('weekly', 'count')"},
    %{key: "post_by_email_on", label: "Post by Email switched on", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE post_email_token IS NOT NULL"},
    %{key: "redactions", label: "Redactions (muted words)", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE jsonb_array_length(CASE WHEN jsonb_typeof(settings->'redacted_words') = 'array' THEN settings->'redacted_words' ELSE '[]'::jsonb END) > 0"},
    %{key: "data_exports", label: "Data export", group: "tools", how: :db, core: true,
      sql: "SELECT user_id AS uid, inserted_at AS at FROM data_exports"},
    %{key: "help", label: "Help pages", group: "tools", how: :tracked},
    %{key: "whats_new", label: "What's new", group: "tools", how: :tracked},
    %{key: "trick_or_treat", label: "Trick or treat (Hallowe'en pumpkin)", group: "tools", how: :tracked,
      actions: ["treat", "trick"]},
    %{key: "seasonal_off", label: "Holiday decorations turned off", group: "tools", how: :state,
      sql: "SELECT id AS uid FROM users WHERE settings->>'seasonal_decorations' = 'false'"}
  ]

  # `core: true` = never called a retirement candidate: the basics, and the
  # safety and legal ones (reporting, content warnings, data export) that
  # stay however rarely they're used.

  # When a feature arrived (or was rebuilt), so a new one isn't called unused
  # before anyone has had a chance to find it. Missing = older than tracking.
  @added %{
    "stickies" => ~D[2026-09-19],
    "moods" => ~D[2026-09-24],
    "location" => ~D[2026-09-24],
    "userpics" => ~D[2026-09-24],
    "userpics_on_entries" => ~D[2026-09-24],
    "classic_view" => ~D[2026-09-24],
    "gazette" => ~D[2026-09-24],
    "gazette_responses" => ~D[2026-09-24],
    "circle_posts" => ~D[2026-09-24],
    "circle_joins" => ~D[2026-09-24],
    "circles" => ~D[2026-09-24],
    "bluesky_bridge" => ~D[2026-09-21],
    "now_playing" => ~D[2026-10-05],
    "listenbrainz" => ~D[2026-10-05],
    "arrange" => ~D[2026-10-16],
    "own_stickers" => ~D[2026-10-16],
    "placed_stickers" => ~D[2026-10-16],
    "sticker_gifts" => ~D[2026-10-17],
    "site_export" => ~D[2026-10-17],
    "stamps" => ~D[2026-10-17],
    "stamp_notes" => ~D[2026-10-17],
    "stamp_album" => ~D[2026-10-17],
    "letter_stamps" => ~D[2026-10-17],
    "explore_waiting" => ~D[2026-09-27],
    "explore_ribbon" => ~D[2026-09-28],
    "newsletter_digests" => ~D[2026-10-26],
    "posts_export" => ~D[2026-10-26],
    "first_entry_notices" => ~D[2026-10-29],
    "trick_or_treat" => ~D[2026-10-29],
    "seasonal_off" => ~D[2026-10-29]
  }

  # Tracked features start counting when tracking ships; until then they
  # have no numbers at all, which mustn't read as "nobody uses it".
  @tracking_started ~D[2026-10-20]

  def groups, do: @groups

  def all do
    Enum.map(@features, fn f ->
      f
      |> Map.put_new(:core, false)
      |> Map.put_new(:actions, [])
      |> Map.put(:added, Map.get(@added, f.key))
    end)
  end

  def tracking_started, do: @tracking_started

  @doc "Keys that can be recorded with `Inkwell.Usage.record/3`."
  def tracked_keys, do: for(%{how: :tracked, key: k} <- @features, do: k)

  def tracked?(key) when is_binary(key), do: key in tracked_keys()
  def tracked?(_), do: false

  def get(key), do: Enum.find(all(), &(&1.key == key))

  @doc """
  The action to store for a tracked use: `""` (just "used it") or one of the
  feature's own `actions`. Anything else is refused, so a client can't fill
  the table with made-up names.
  """
  def valid_action?(_feature, nil), do: true
  def valid_action?(_feature, ""), do: true
  def valid_action?(%{actions: actions}, action) when is_binary(action), do: action in actions
  def valid_action?(_, _), do: false

  @doc "A detail is only allowed where the feature lists them."
  def valid_detail?(_feature, nil), do: true
  def valid_detail?(_feature, ""), do: true
  def valid_detail?(%{details: details}, detail) when is_binary(detail), do: detail in details
  def valid_detail?(_, _), do: false
end
