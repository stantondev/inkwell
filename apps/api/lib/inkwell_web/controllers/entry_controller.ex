defmodule InkwellWeb.EntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Inks, Journals, Newsletter, OAuth, Polls, Redactions, Repo, Social, Stamps, Tipping, WriterSubscriptions}
  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Workers.{CrosspostWorker, SearchIndexWorker}
  alias InkwellWeb.UserController

  @free_draft_limit 10

  # GET /api/users/:username/entries — public listing
  def index(conn, %{"username" => username} = params) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username) do
      viewer = conn.assigns[:current_user]

      # Block check: if either user blocked the other, return empty
      if viewer && viewer.id != user.id && Social.is_blocked_between?(viewer.id, user.id) do
        conn |> put_status(:forbidden) |> json(%{error: "Not available"})
      else

      page = parse_int(params["page"], 1)
      per_page = parse_int(params["per_page"], 20)

      # Search & filter params
      filter_opts = [
        page: page,
        per_page: per_page,
        search: params["q"],
        category: params["category"],
        tag: params["tag"],
        year: params["year"],
        sort: params["sort"] || "newest"
      ]

      entries =
        cond do
          viewer && viewer.id == user.id ->
            # Owner: see everything (published only — drafts are separate)
            Journals.list_entries(user.id, filter_opts)

          viewer && Social.is_friend?(viewer.id, user.id) ->
            # Friends: public + friends_only + custom + paid (if subscribed) entries
            privacies = [:public, :friends_only, :custom]
            privacies = if WriterSubscriptions.is_subscribed?(viewer.id, user.id), do: privacies ++ [:paid], else: privacies
            all = Journals.list_entries(user.id, Keyword.put(filter_opts, :privacy, privacies))
            Enum.filter(all, fn entry ->
              entry.privacy != :custom || viewer_in_custom_filter?(entry, viewer.id)
            end)

          viewer && WriterSubscriptions.is_subscribed?(viewer.id, user.id) ->
            # Subscribers (not friends): public + paid
            Journals.list_entries(user.id, Keyword.put(filter_opts, :privacy, [:public, :paid]))

          true ->
            Journals.list_entries(user.id, Keyword.put(filter_opts, :privacy, :public))
        end

      # Apply viewer's redacted words filter (never redact own entries)
      entries =
        if viewer && viewer.id != user.id do
          Redactions.filter_entries(entries, Redactions.get_redacted_words(viewer))
        else
          entries
        end

      entry_ids = Enum.map(entries, & &1.id)
      stamp_types_map = Stamps.get_stamp_types_for_entries(entry_ids)
      comment_counts = Journals.count_comments_for_entries(entry_ids)

      # Total count for pagination UI (respects active filters)
      count_opts = Keyword.drop(filter_opts, [:page, :per_page, :sort])
      total_count =
        cond do
          viewer && viewer.id == user.id ->
            Journals.count_entries_filtered(user.id, count_opts)
          true ->
            Journals.count_entries_filtered(user.id, Keyword.put(count_opts, :privacy, :public))
        end

      json(conn, %{
        data: Enum.map(entries, fn entry ->
          render_entry(entry)
          |> Map.put(:stamps, Map.get(stamp_types_map, entry.id, []))
          |> Map.put(:comment_count, Map.get(comment_counts, entry.id, 0))
        end),
        pagination: %{page: page, per_page: per_page, total: total_count}
      })
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # GET /api/users/:username/entries/:slug — single entry
  def show(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         entry when not is_nil(entry) <- Journals.get_entry_by_slug(user.id, slug),
         :published <- entry.status do

      viewer = conn.assigns[:current_user]

      # Block check: if blocked between viewer and entry author, return 404
      if viewer && viewer.id != user.id && Social.is_blocked_between?(viewer.id, user.id) do
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      else

      render_with_stamps = fn ->
        stamp_types = Stamps.get_entry_stamp_types(entry.id)
        my_stamp = if viewer, do: Stamps.get_user_stamp(viewer.id, entry.id), else: nil
        bookmarked = if viewer, do: Bookmarks.get_user_bookmark(viewer.id, entry.id) != nil, else: false
        my_ink = if viewer, do: Inks.has_inked?(viewer.id, entry.id), else: false

        entry_with_user = %{entry | user: user}
        series_nav = Journals.get_series_navigation(entry_with_user)

        # Load entry poll if one exists
        poll_data =
          case Polls.get_poll_for_entry(entry.id) do
            nil -> nil
            poll ->
              my_vote = if viewer, do: Polls.get_user_vote(viewer.id, poll.id), else: nil
              InkwellWeb.PollController.render_poll(poll, my_vote)
          end

        result =
          render_entry_full(entry, user)
          |> Map.put(:stamps, stamp_types)
          |> Map.put(:my_stamp, if(my_stamp, do: Atom.to_string(my_stamp.stamp_type), else: nil))
          |> Map.put(:bookmarked, bookmarked)
          |> Map.put(:my_ink, my_ink)
          |> Map.put(:series, series_nav)
          |> Map.put(:poll, poll_data)

        # Include per-entry postage stats for the author only
        if viewer && viewer.id == user.id do
          tip_stats = Tipping.get_entry_tip_stats(entry.id)
          result
          |> Map.put(:tip_total_cents, tip_stats.total_cents)
          |> Map.put(:tip_count, tip_stats.count)
        else
          result
        end
      end

      cond do
        entry.privacy == :public ->
          json(conn, %{data: render_with_stamps.()})

        entry.privacy == :private ->
          if viewer && viewer.id == user.id do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        entry.privacy == :friends_only ->
          if viewer && (viewer.id == user.id || Social.is_friend?(viewer.id, user.id)) do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        entry.privacy == :custom ->
          if viewer && (viewer.id == user.id || viewer_in_custom_filter?(entry, viewer.id)) do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        entry.privacy == :paid ->
          if viewer && (viewer.id == user.id || WriterSubscriptions.is_subscribed?(viewer.id, user.id)) do
            json(conn, %{data: render_with_stamps.()})
          else
            # Return paywall teaser — title, excerpt, cover, author info, but no body
            plan = WriterSubscriptions.get_active_plan_for_writer(user.id)

            teaser =
              render_entry(entry)
              |> Map.put(:body_html, nil)
              |> Map.put(:is_paywalled, true)
              |> Map.put(:writer_plan, if(plan, do: %{
                id: plan.id,
                name: plan.name,
                price_cents: plan.price_cents,
                subscriber_count: plan.subscriber_count
              }, else: nil))
              |> Map.put(:author, %{
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                avatar_frame: user.avatar_frame,
                subscription_tier: user.subscription_tier
              })

            json(conn, %{data: teaser})
          end

        true ->
          conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
      end
    else
      :draft -> conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # GET /api/entries/:id — fetch own entry for editing (works for both drafts and published)
  def show_own(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_owned_entry(user.id, id) do
      {:ok, entry} ->
        poll_data =
          case Polls.get_poll_for_entry(entry.id) do
            nil -> nil
            poll ->
              my_vote = Polls.get_user_vote(user.id, poll.id)
              InkwellWeb.PollController.render_poll(poll, my_vote)
          end

        result = render_entry_full(entry, user) |> Map.put(:poll, poll_data)
        json(conn, %{data: result})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
    end
  end

  @free_entry_limit 10
  @plus_entry_limit 30
  @entry_rate_window 3_600  # 1 hour in seconds

  # POST /api/entries
  def create(conn, params) do
    user = conn.assigns.current_user
    is_draft = params["status"] == "draft"
    tier = user.subscription_tier || "free"

    # Anti-spam: per-user creation rate limit (Free: 10/hr, Plus: 30/hr)
    with :ok <- check_entry_rate_limit(user.id, tier),
         # Anti-spam: reject duplicate body_html within 60 seconds
         :ok <- check_duplicate(user.id, params["body_html"]) do
      create_entry(conn, params, user, is_draft, tier)
    else
      {:error, :rate_limited} ->
        limit = if tier == "plus", do: @plus_entry_limit, else: @free_entry_limit
        conn |> put_status(:too_many_requests) |> json(%{error: "Rate limit exceeded. Maximum #{limit} entries per hour."})

      {:error, :duplicate} ->
        conn |> put_status(:conflict) |> json(%{error: "You already posted this content. Please wait before reposting."})
    end
  end

  defp create_entry(conn, params, user, is_draft, _tier) do
    if is_draft do
      if (user.subscription_tier || "free") != "plus" && Journals.count_drafts(user.id) >= @free_draft_limit do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "draft_limit_reached"})
      else
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                      "privacy", "user_icon_id", "tags", "custom_filter_id",
                      "excerpt", "cover_image_id", "category", "series_id",
                      "sensitive", "content_warning"])
        |> Map.put("user_id", user.id)
        |> maybe_clear_custom_filter_id()
        |> put_word_count()
        |> maybe_auto_excerpt()

      case Journals.create_draft(attrs) do
        {:ok, entry} ->
          record_entry_creation(user.id)
          conn
          |> put_status(:created)
          |> json(%{data: render_entry_full(entry, user)})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{errors: format_errors(changeset)})
      end
      end
    else
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                      "privacy", "user_icon_id", "tags", "published_at", "custom_filter_id",
                      "excerpt", "cover_image_id", "category", "series_id",
                      "sensitive", "content_warning"])
        |> Map.put("user_id", user.id)
        |> maybe_generate_slug(params)
        |> maybe_clear_custom_filter_id()
        |> maybe_auto_series_order()
        |> put_word_count()
        |> maybe_auto_excerpt()

      with :ok <- validate_custom_filter_ownership(attrs, user.id),
           :ok <- validate_paid_privacy(attrs, user) do
        case Journals.create_entry(attrs) do
          {:ok, entry} ->
            record_entry_creation(user.id)
            # Fan out to federated followers for public entries
            if entry.privacy == :public do
              %{entry_id: entry.id, action: "create", user_id: user.id}
              |> FanOutWorker.new()
              |> Oban.insert()
            end

            # Send as newsletter if requested
            maybe_send_newsletter(entry, user, params)

            # Cross-post to linked Mastodon accounts if requested
            maybe_enqueue_crossposts(entry, user, params)

            # Index in Meilisearch
            enqueue_search_index(entry.id)

            conn
            |> put_status(:created)
            |> json(%{data: render_entry_full(entry, user)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      else
        {:error, :filter_not_found} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})

        {:error, :paid_requires_plus} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Paid entries require a Plus subscription"})

        {:error, :paid_requires_connect} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Paid entries require Stripe Connect to be enabled"})

        {:error, :paid_requires_plan} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Paid entries require an active subscription plan"})
      end
    end
  end

  # PATCH /api/entries/:id
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, id) do
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                       "privacy", "user_icon_id", "tags", "published_at", "custom_filter_id",
                       "excerpt", "cover_image_id", "category", "series_id",
                       "sensitive", "content_warning"])
        |> maybe_clear_custom_filter_id()
        |> put_word_count()
        |> maybe_auto_excerpt()

      # Only auto-assign series_order for published entries, not drafts
      attrs = if entry.status == :published, do: maybe_auto_series_order(attrs), else: attrs

      with :ok <- validate_custom_filter_ownership(attrs, user.id) do
        result =
          if entry.status == :draft do
            Journals.update_draft(entry, attrs)
          else
            Journals.update_entry(entry, attrs, subscription_tier: user.subscription_tier || "free")
          end

        case result do
          {:ok, updated} ->
            # Fan out updates for published public entries
            if updated.status == :published && updated.privacy == :public do
              %{entry_id: updated.id, action: "update", user_id: user.id}
              |> FanOutWorker.new()
              |> Oban.insert()
            end

            # Re-index in Meilisearch (published entries only)
            if updated.status == :published, do: enqueue_search_index(updated.id)

            json(conn, %{data: render_entry_full(updated, user)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      else
        {:error, :filter_not_found} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # POST /api/entries/:id/publish — transition draft → published
  def publish(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, id) do
      if entry.status != :draft do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Entry is already published"})
      else
        attrs =
          params
          |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                        "privacy", "user_icon_id", "tags", "custom_filter_id",
                        "excerpt", "cover_image_id", "category", "series_id",
                        "sensitive", "content_warning"])
          |> maybe_generate_slug(params)
          |> maybe_clear_custom_filter_id()
          |> put_word_count()
          |> maybe_auto_excerpt()

        # Inherit series_id from the existing entry if not in publish params,
        # then auto-assign series_order for the newly published entry
        attrs =
          if not Map.has_key?(attrs, "series_id") and entry.series_id != nil do
            Map.put(attrs, "series_id", entry.series_id)
          else
            attrs
          end
          |> maybe_auto_series_order()

        with :ok <- validate_custom_filter_ownership(attrs, user.id) do
          case Journals.publish_draft(entry, attrs) do
            {:ok, published} ->
              # Fan out to federated followers for public entries
              if published.privacy == :public do
                %{entry_id: published.id, action: "create", user_id: user.id}
                |> FanOutWorker.new()
                |> Oban.insert()
              end

              # Send as newsletter if requested
              maybe_send_newsletter(published, user, params)

              # Cross-post to linked Mastodon accounts if requested
              maybe_enqueue_crossposts(published, user, params)

              # Index in Meilisearch
              enqueue_search_index(published.id)

              json(conn, %{data: render_entry_full(published, user)})

            {:error, changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{errors: format_errors(changeset)})
          end
        else
          {:error, :filter_not_found} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})
        end
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # GET /api/drafts — list current user's drafts
  def list_drafts(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    drafts = Journals.list_drafts(user.id, page: page, per_page: per_page)

    json(conn, %{
      data: Enum.map(drafts, &render_entry/1),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # DELETE /api/entries/:id
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    result =
      if Accounts.is_admin?(user) do
        try do
          {:ok, Journals.get_entry!(id)}
        rescue
          Ecto.NoResultsError -> {:error, :not_found}
        end
      else
        get_owned_entry(user.id, id)
      end

    with {:ok, entry} <- result do
      # Capture AP ID before deletion for federated delete notification
      entry_ap_id = entry.ap_id
      entry_user_id = entry.user_id
      was_public = entry.privacy == :public && entry.status == :published

      {:ok, _} = Journals.delete_entry(entry)

      # Fan out delete to federated followers
      if was_public && entry_ap_id do
        %{entry_ap_id: entry_ap_id, action: "delete", user_id: entry_user_id}
        |> FanOutWorker.new()
        |> Oban.insert()
      end

      # Remove from Meilisearch
      enqueue_search_delete(entry.id)

      send_resp(conn, :no_content, "")
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # ── Helpers ───────────────────────────────────────────────────────────────

  defp viewer_in_custom_filter?(entry, viewer_id) do
    entry = Repo.preload(entry, :custom_filter)

    case entry.custom_filter do
      nil -> false
      filter -> viewer_id in filter.member_ids
    end
  end

  defp validate_custom_filter_ownership(attrs, user_id) do
    cond do
      attrs["privacy"] != "custom" -> :ok
      is_nil(attrs["custom_filter_id"]) -> :ok
      true ->
        filters = Social.list_friend_filters(user_id)
        if Enum.any?(filters, &(&1.id == attrs["custom_filter_id"])) do
          :ok
        else
          {:error, :filter_not_found}
        end
    end
  end

  defp validate_paid_privacy(%{"privacy" => "paid"}, user) do
    cond do
      (user.subscription_tier || "free") != "plus" -> {:error, :paid_requires_plus}
      !user.stripe_connect_enabled -> {:error, :paid_requires_connect}
      !WriterSubscriptions.has_active_plan?(user.id) -> {:error, :paid_requires_plan}
      true -> :ok
    end
  end

  defp validate_paid_privacy(_attrs, _user), do: :ok

  # Clear custom_filter_id when privacy is not :custom
  defp maybe_clear_custom_filter_id(%{"privacy" => privacy} = attrs) when privacy != "custom" do
    Map.put(attrs, "custom_filter_id", nil)
  end
  defp maybe_clear_custom_filter_id(attrs), do: attrs

  # Cross-post to linked Mastodon accounts if the writer opted in
  defp maybe_enqueue_crossposts(entry, user, params) do
    crosspost_to = params["crosspost_to"]

    if is_list(crosspost_to) and entry.privacy == :public do
      accounts = OAuth.list_fediverse_accounts(user.id)
      account_ids = Enum.map(accounts, & &1.id) |> MapSet.new()

      Enum.each(crosspost_to, fn account_id ->
        if MapSet.member?(account_ids, account_id) do
          %{entry_id: entry.id, fediverse_account_id: account_id}
          |> CrosspostWorker.new()
          |> Oban.insert()
        end
      end)
    end
  end

  # Trigger newsletter send if the writer opted in for this entry
  defp maybe_send_newsletter(entry, user, params) do
    send_newsletter = params["send_newsletter"]

    if send_newsletter == true and entry.privacy == :public and (user.newsletter_enabled || false) do
      scheduled_at = case params["newsletter_scheduled_at"] do
        nil -> nil
        dt_string when is_binary(dt_string) ->
          case DateTime.from_iso8601(dt_string) do
            {:ok, dt, _} -> dt
            _ -> nil
          end
        _ -> nil
      end

      Newsletter.create_send(entry, user,
        subject: params["newsletter_subject"],
        scheduled_at: scheduled_at
      )
    end
  end

  defp get_owned_entry(user_id, entry_id) do
    entry = Journals.get_entry!(entry_id)

    if entry.user_id == user_id do
      {:ok, entry}
    else
      {:error, :forbidden}
    end
  rescue
    Ecto.NoResultsError ->
      {:error, :not_found}
  end

  # --- Anti-spam helpers ---

  defp check_entry_rate_limit(user_id, tier) do
    now = System.system_time(:second)
    cutoff = now - @entry_rate_window
    limit = if tier == "plus", do: @plus_entry_limit, else: @free_entry_limit

    timestamps =
      case :ets.lookup(:entry_creation_buckets, user_id) do
        [{^user_id, ts}] -> Enum.filter(ts, &(&1 > cutoff))
        [] -> []
      end

    if length(timestamps) >= limit do
      {:error, :rate_limited}
    else
      :ok
    end
  end

  defp record_entry_creation(user_id) do
    now = System.system_time(:second)
    cutoff = now - @entry_rate_window

    timestamps =
      case :ets.lookup(:entry_creation_buckets, user_id) do
        [{^user_id, ts}] -> Enum.filter(ts, &(&1 > cutoff))
        [] -> []
      end

    :ets.insert(:entry_creation_buckets, {user_id, [now | timestamps]})
  end

  defp check_duplicate(user_id, body_html) do
    if Journals.recent_duplicate?(user_id, body_html) do
      {:error, :duplicate}
    else
      :ok
    end
  end

  defp maybe_generate_slug(attrs, params) do
    if Map.has_key?(attrs, "title") && attrs["title"] not in [nil, ""] do
      slug =
        attrs["title"]
        |> String.downcase()
        |> String.replace(~r/[^a-z0-9\s-]/, "")
        |> String.replace(~r/\s+/, "-")
        |> String.slice(0, 60)
        |> then(fn s -> "#{s}-#{:erlang.unique_integer([:positive])}" end)

      Map.put(attrs, "slug", slug)
    else
      ts = DateTime.utc_now() |> DateTime.to_unix()
      Map.put(attrs, "slug", "entry-#{ts}")
    end
  end

  def render_entry(entry) do
    %{
      id: entry.id,
      user_id: entry.user_id,
      title: entry.title,
      body_html: entry.body_html,
      body_raw: entry.body_raw,
      mood: entry.mood,
      music: entry.music,
      music_metadata: entry.music_metadata,
      privacy: entry.privacy,
      custom_filter_id: entry.custom_filter_id,
      user_icon_id: entry.user_icon_id,
      slug: entry.slug,
      tags: entry.tags,
      published_at: entry.published_at,
      ap_id: entry.ap_id,
      status: entry.status,
      word_count: entry.word_count || 0,
      excerpt: entry.excerpt,
      cover_image_id: entry.cover_image_id,
      category: entry.category,
      series_id: entry.series_id,
      series_order: entry.series_order,
      newsletter_sent_at: entry.newsletter_sent_at,
      sensitive: entry.sensitive || false,
      content_warning: entry.content_warning,
      admin_sensitive: entry.admin_sensitive || false,
      is_sensitive: (entry.sensitive || false) || (entry.admin_sensitive || false),
      ink_count: entry.ink_count || 0,
      created_at: entry.inserted_at,
      updated_at: entry.updated_at
    }
  end

  def render_entry_full(entry, author) do
    entry
    |> render_entry()
    |> Map.put(:author, UserController.render_user(author))
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val

  # Compute word_count from body_html and put it into attrs
  defp put_word_count(%{"body_html" => html} = attrs) when is_binary(html) do
    count =
      html
      |> String.replace(~r/<[^>]+>/, " ")
      |> String.split(~r/\s+/)
      |> Enum.reject(&(&1 == ""))
      |> length()

    Map.put(attrs, "word_count", count)
  end
  defp put_word_count(attrs), do: attrs

  # Auto-populate excerpt from body_html if not provided
  # Auto-assign series_order when adding to a series
  defp maybe_auto_series_order(%{"series_id" => series_id} = attrs)
       when is_binary(series_id) and series_id != "" do
    Map.put_new(attrs, "series_order", Journals.next_series_order(series_id))
  end
  defp maybe_auto_series_order(%{"series_id" => nil} = attrs) do
    attrs |> Map.put("series_order", nil)
  end
  defp maybe_auto_series_order(attrs), do: attrs

  defp maybe_auto_excerpt(%{"excerpt" => excerpt} = attrs)
       when is_binary(excerpt) and byte_size(excerpt) > 0, do: attrs
  defp maybe_auto_excerpt(%{"body_html" => html} = attrs) when is_binary(html) do
    auto =
      html
      |> String.replace(~r/<[^>]+>/, " ")
      |> decode_html_entities()
      |> String.replace(~r/\s+/, " ")
      |> String.trim()
      |> String.slice(0, 280)

    if auto != "", do: Map.put(attrs, "excerpt", auto), else: attrs
  end
  defp maybe_auto_excerpt(attrs), do: attrs

  # Decode HTML entities to their Unicode characters for plain-text excerpts
  defp decode_html_entities(text) do
    text
    # Numeric decimal entities: &#8620; → ↬
    |> then(fn t ->
      Regex.replace(~r/&#(\d+);/, t, fn _full, code ->
        try do
          <<String.to_integer(code)::utf8>>
        rescue
          _ -> ""
        end
      end)
    end)
    # Numeric hex entities: &#x21AC; → ↬
    |> then(fn t ->
      Regex.replace(~r/&#x([0-9a-fA-F]+);/i, t, fn _full, hex ->
        try do
          <<String.to_integer(hex, 16)::utf8>>
        rescue
          _ -> ""
        end
      end)
    end)
    # Common named entities
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&#39;", "'")
    |> String.replace("&apos;", "'")
    |> String.replace("&nbsp;", " ")
    |> String.replace("&mdash;", "—")
    |> String.replace("&ndash;", "–")
    |> String.replace("&hellip;", "…")
    |> String.replace("&lsquo;", "\u2018")
    |> String.replace("&rsquo;", "\u2019")
    |> String.replace("&ldquo;", "\u201C")
    |> String.replace("&rdquo;", "\u201D")
    # Strip any remaining named entities we don't handle
    |> String.replace(~r/&[a-zA-Z]+;/, "")
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  # ── Search indexing helpers ───────────────────────────────────────────

  defp enqueue_search_index(entry_id) do
    %{action: "index_entry", entry_id: entry_id}
    |> SearchIndexWorker.new()
    |> Oban.insert()
  end

  defp enqueue_search_delete(entry_id) do
    %{action: "delete_entry", entry_id: entry_id}
    |> SearchIndexWorker.new()
    |> Oban.insert()
  end
end
