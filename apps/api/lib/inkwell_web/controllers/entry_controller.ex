defmodule InkwellWeb.EntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, CustomDomains, Inks, Journals, MarginNotes, Polls, Redactions, Repo, Reprints, Social, Stamps, Tipping, WriterSubscriptions}
  alias Inkwell.Avatars
  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Workers.SearchIndexWorker
  alias InkwellWeb.{EntryPublishing, MarginNoteController, UserController}

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
        month: params["month"],
        sort: params["sort"] || "newest",
        # The profile lists journal entries; its corkboard asks for ?kind=sticky.
        kind: if(params["kind"] == "sticky", do: "sticky", else: "entry")
      ]

      # One rule for what this viewer may see (Journals.visible_to/3), so the
      # page and its total agree: pen pals used to see friends-only entries
      # that the page count left out.
      filter_opts = Keyword.put(filter_opts, :viewer, viewer)
      entries = Journals.list_entries(user.id, filter_opts)

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
      total_count = Journals.count_entries_filtered(user.id, count_opts)

      json(conn, %{
        data:
          Enum.map(entries, fn entry ->
            render_entry(entry)
            |> Map.put(:stamps, Map.get(stamp_types_map, entry.id, []))
            |> Map.put(:comment_count, Map.get(comment_counts, entry.id, 0))
          end)
          |> put_sticky_expansions(viewer && viewer.id),
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
        my_reprint = if viewer, do: Reprints.has_reprinted?(viewer.id, entry.id), else: false

        # Eagerly load margin notes (inline marginalia) so the detail page
        # doesn't need a second round trip. Filter out blocked users' notes
        # for the viewer.
        marginalia_exclude_ids =
          if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

        marginalia =
          entry.id
          |> MarginNotes.list_for_entry(exclude_user_ids: marginalia_exclude_ids)
          |> Enum.map(&MarginNoteController.render_note/1)

        orphaned_marginalia =
          entry.id
          |> MarginNotes.list_for_entry(orphaned: true, exclude_user_ids: marginalia_exclude_ids)
          |> Enum.map(&MarginNoteController.render_note/1)

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

        # Look up author's active custom domain for canonical URL resolution
        author_custom_domain = case CustomDomains.get_domain_by_user(user.id) do
          %{status: "active", domain: domain} -> domain
          _ -> nil
        end

        result =
          render_entry_full(entry, user)
          |> Map.put(:stamps, stamp_types)
          |> Map.put(:my_stamp, if(my_stamp, do: Atom.to_string(my_stamp.stamp_type), else: nil))
          |> Map.put(:bookmarked, bookmarked)
          |> Map.put(:my_ink, my_ink)
          |> Map.put(:my_reprint, my_reprint)
          |> Map.put(:series, series_nav)
          |> Map.put(:journal_nav, Journals.adjacent_entries(entry, viewer))
          |> Map.put(:poll, poll_data)
          |> Map.put(:custom_domain, author_custom_domain)
          |> Map.put(:noindex, Journals.held_back_from_search?(user.id))
          |> Map.put(:marginalia, marginalia)
          |> Map.put(:orphaned_marginalia, orphaned_marginalia)
          |> Map.put(:source_sticky, source_sticky_link(entry, viewer))
          |> then(fn rendered -> hd(put_sticky_expansions([rendered], viewer && viewer.id)) end)

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
                avatar_url: Avatars.avatar_url(user),
                avatar_frame: user.avatar_frame,
                avatar_animation: user.avatar_animation,
                subscription_tier: Inkwell.SelfHosted.effective_tier(user)
              })

            json(conn, %{data: teaser})
          end

        true ->
          conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
      end
    else
      :draft -> conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      # Hidden by moderation
      :hidden -> conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
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
                      "sensitive", "content_warning", "published_at",
                      "scheduled_at", "scheduled_options", "source_sticky_id"])
        |> put_source_sticky(user.id)
        |> put_music_metadata()
        |> sanitize_scheduled_options()
        |> Map.put("user_id", user.id)
        |> maybe_clear_custom_filter_id()
        |> put_word_count()
        |> put_excerpt(nil)

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
                      "sensitive", "content_warning", "source_sticky_id"])
        |> put_source_sticky(user.id)
        |> put_music_metadata()
        |> Map.put("user_id", user.id)
        |> maybe_generate_slug(params)
        |> maybe_clear_custom_filter_id()
        |> maybe_auto_series_order()
        |> put_word_count()
        |> put_excerpt(nil)

      with :ok <- validate_custom_filter_ownership(attrs, user.id),
           :ok <- validate_paid_privacy(attrs, user) do
        case Journals.create_entry(attrs) do
          {:ok, entry} ->
            record_entry_creation(user.id)

            entry = EntryPublishing.after_publish(entry, user, params)

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

    with {:ok, entry} <- get_owned_entry(user.id, id),
         :ok <- not_a_sticky(entry) do
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                       "privacy", "user_icon_id", "tags", "published_at", "custom_filter_id",
                       "excerpt", "cover_image_id", "category", "series_id",
                       "sensitive", "content_warning",
                       # Drafts only; published entries ignore these.
                       "scheduled_at", "scheduled_options"])
        |> put_music_metadata()
        |> sanitize_scheduled_options()
        |> maybe_clear_custom_filter_id()
        |> put_word_count()
        |> put_excerpt(entry)

      # Only auto-assign series_order for published entries, not drafts
      attrs = if entry.status == :published, do: maybe_auto_series_order(attrs, entry), else: attrs

      with :ok <- validate_custom_filter_ownership(attrs, user.id) do
        result =
          if entry.status == :draft do
            Journals.update_draft(entry, attrs)
          else
            Journals.update_entry(entry, attrs, subscription_tier: user.subscription_tier || "free")
          end

        case result do
          {:ok, updated} ->
            # Process @mentions in body
            updated = EntryPublishing.process_mentions(updated, user.id)

            federate_edit(entry, updated, user.id)

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
      {:error, :sticky} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Stickies are edited from the sticky itself"})
    end
  end

  # The sticky an entry was expanded from, when the viewer may see it.
  defp source_sticky_link(%{source_sticky_id: nil}, _viewer), do: nil

  defp source_sticky_link(%{source_sticky_id: id}, viewer) do
    case Journals.get_entry(id) do
      %{status: :published} = sticky ->
        if Journals.viewable_by?(sticky, viewer) do
          sticky = Repo.preload(sticky, :user)
          %{slug: sticky.slug, username: sticky.user.username, excerpt: sticky.excerpt}
        end

      _ ->
        nil
    end
  end

  defp not_a_sticky(%{kind: "sticky"}), do: {:error, :sticky}
  defp not_a_sticky(_), do: :ok

  # "Expand into an entry" sends the sticky it came from. Only the writer's own
  # stickies count; anything else is dropped rather than failing the save.
  defp put_source_sticky(%{"source_sticky_id" => id} = attrs, user_id) when is_binary(id) and id != "" do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} ->
        case Journals.get_entry(uuid) do
          %{kind: "sticky", user_id: ^user_id} -> Map.put(attrs, "source_sticky_id", uuid)
          _ -> Map.delete(attrs, "source_sticky_id")
        end

      :error ->
        Map.delete(attrs, "source_sticky_id")
    end
  end

  defp put_source_sticky(attrs, _user_id), do: Map.delete(attrs, "source_sticky_id")

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
                        "sensitive", "content_warning",
                        # Lets an author backdate on publish. Omitted here, the
                        # draft's own published_at (e.g. an imported post's
                        # original date) is preserved by publish_changeset.
                        "published_at"])
        |> put_music_metadata()
          |> maybe_generate_slug(params)
          |> maybe_clear_custom_filter_id()
          |> put_word_count()
          |> put_excerpt(entry)

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
              published = EntryPublishing.after_publish(published, user, params)

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

  # ── Post Manager ─────────────────────────────────────────────────────────

  # GET /api/me/entries — list own entries with filters
  def list_own(conn, params) do
    user = conn.assigns.current_user

    filter_opts = [
      page: parse_int(params["page"], 1),
      per_page: min(parse_int(params["per_page"], 20), 50),
      status: params["status"],
      privacy: params["privacy"],
      category: params["category"],
      series_id: params["series_id"],
      tag: params["tag"],
      search: params["q"],
      sort: params["sort"] || "newest"
    ]

    entries = Journals.list_own_entries(user.id, filter_opts)
    total = Journals.count_own_entries(user.id, Keyword.drop(filter_opts, [:page, :per_page, :sort]))

    entry_ids = Enum.map(entries, & &1.id)
    comment_counts = Journals.count_comments_for_entries(entry_ids)
    read_counts = Inkwell.Reads.counts_for_entries(entry_ids)

    json(conn, %{
      data: Enum.map(entries, fn entry ->
        %{
          id: entry.id,
          title: entry.title,
          slug: entry.slug,
          read_count: Map.get(read_counts, entry.id, 0),
          status: entry.status,
          privacy: entry.privacy,
          category: entry.category,
          series_id: entry.series_id,
          series_name: if(entry.series, do: entry.series.name, else: nil),
          tags: entry.tags || [],
          word_count: entry.word_count || 0,
          ink_count: entry.ink_count || 0,
          reprint_count: entry.reprint_count || 0,
          comment_count: Map.get(comment_counts, entry.id, 0),
          sensitive: entry.sensitive || false,
          cover_image_id: entry.cover_image_id,
          published_at: entry.published_at,
          scheduled_at: entry.scheduled_at,
          updated_at: entry.updated_at,
          created_at: entry.inserted_at,
          kind: entry.kind || "entry",
          excerpt: if(entry.kind == "sticky", do: entry.excerpt)
        }
      end),
      pagination: %{page: filter_opts[:page], per_page: filter_opts[:per_page], total: total}
    })
  end

  # GET /api/me/entries/ids — every entry matching the Posts page filters, so
  # "Select all" works across pages.
  def list_own_ids(conn, params) do
    user = conn.assigns.current_user

    ids =
      Journals.list_own_entry_ids(user.id,
        status: params["status"],
        privacy: params["privacy"],
        category: params["category"],
        series_id: params["series_id"],
        tag: params["tag"],
        search: params["q"],
        sort: params["sort"] || "newest"
      )

    json(conn, %{data: ids})
  end

  @bulk_max_ids 100

  # POST /api/me/entries/bulk — bulk operations
  def bulk_action(conn, %{"action" => action, "entry_ids" => entry_ids} = params)
      when is_list(entry_ids) do
    user = conn.assigns.current_user

    if length(entry_ids) > @bulk_max_ids do
      conn |> put_status(:bad_request) |> json(%{error: "Maximum #{@bulk_max_ids} entries per request"})
    else
      case action do
        "delete" -> handle_bulk_delete(conn, user, entry_ids)
        "update_privacy" -> handle_bulk_privacy(conn, user, entry_ids, params["privacy"])
        "set_series" -> handle_bulk_series(conn, user, entry_ids, params["series_id"])
        "remove_series" -> handle_bulk_series(conn, user, entry_ids, nil)
        "add_tags" -> handle_bulk_tags(conn, user, entry_ids, params["tags"], :add)
        "remove_tags" -> handle_bulk_tags(conn, user, entry_ids, params["tags"], :remove)
        "set_category" -> handle_bulk_category(conn, user, entry_ids, params["category"])
        "publish" -> handle_bulk_publish(conn, user, entry_ids, params["federate_older"] == true)
        _ -> conn |> put_status(:bad_request) |> json(%{error: "Unknown action"})
      end
    end
  end

  def bulk_action(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "Missing action or entry_ids"})
  end

  defp handle_bulk_delete(conn, user, entry_ids) do
    case Journals.bulk_delete_entries(user.id, entry_ids) do
      {:ok, count, entries_meta} ->
        # Fan out deletes for public published entries
        Enum.each(entries_meta, fn meta ->
          if meta.privacy == :public && meta.status == :published && meta.ap_id do
            %{entry_ap_id: meta.ap_id, action: "delete", user_id: meta.user_id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          enqueue_search_delete(meta.id)
        end)

        json(conn, %{ok: true, count: count})

      {:error, :unauthorized} ->
        conn |> put_status(:forbidden) |> json(%{error: "One or more entries not found or not yours"})
    end
  end

  # Entries dated more than this long ago count as "older" when bulk publishing
  # or bulk-making public: they aren't pushed into followers' timelines.
  @quiet_publish_after_days 7

  defp handle_bulk_privacy(conn, user, entry_ids, privacy) when privacy in ~w(public friends_only private) do
    case Journals.bulk_update_privacy(user.id, entry_ids, privacy) do
      {:ok, count, before} ->
        now_public = privacy == "public"
        cutoff = DateTime.add(DateTime.utc_now(), -@quiet_publish_after_days, :day)

        Enum.each(before, fn e ->
          was_public = e.privacy == :public

          cond do
            e.status != :published or was_public == now_public ->
              :ok

            was_public ->
              enqueue_federated_delete(e)

            # Making a batch of old private posts public shouldn't flood
            # followers' timelines, same as bulk publishing (see below). They
            # can still be looked up from the fediverse.
            e.published_at && DateTime.compare(e.published_at, cutoff) == :lt ->
              :ok

            true ->
              enqueue_fan_out(e.id, "create", e.user_id)
          end

          enqueue_search_index(e.id)
        end)

        json(conn, %{ok: true, count: count})

      {:error, :unauthorized} ->
        conn |> put_status(:forbidden) |> json(%{error: "One or more entries not found or not yours"})
    end
  end

  defp handle_bulk_privacy(conn, _user, _entry_ids, _privacy) do
    conn |> put_status(:bad_request) |> json(%{error: "Invalid privacy value"})
  end

  defp handle_bulk_series(conn, user, entry_ids, series_id) do
    case Journals.bulk_update_series(user.id, entry_ids, series_id) do
      {:ok, count} ->
        Enum.each(entry_ids, &enqueue_search_index/1)
        json(conn, %{ok: true, count: count})

      {:error, :unauthorized} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not authorized"})
    end
  end

  defp handle_bulk_tags(conn, user, entry_ids, tags, direction) when is_list(tags) do
    clean_tags = tags |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))

    if clean_tags == [] do
      conn |> put_status(:bad_request) |> json(%{error: "No tags provided"})
    else
      result =
        case direction do
          :add -> Journals.bulk_add_tags(user.id, entry_ids, clean_tags)
          :remove -> Journals.bulk_remove_tags(user.id, entry_ids, clean_tags)
        end

      case result do
        {:ok, count} ->
          Enum.each(entry_ids, &enqueue_search_index/1)
          json(conn, %{ok: true, count: count})

        {:error, :unauthorized} ->
          conn |> put_status(:forbidden) |> json(%{error: "Not authorized"})
      end
    end
  end

  defp handle_bulk_tags(conn, _user, _entry_ids, _tags, _dir) do
    conn |> put_status(:bad_request) |> json(%{error: "tags must be an array"})
  end

  defp handle_bulk_category(conn, user, entry_ids, category) do
    valid = Ecto.Enum.dump_values(Inkwell.Journals.Entry, :category)

    value =
      cond do
        category in [nil, ""] -> {:ok, nil}
        category in valid -> {:ok, String.to_existing_atom(category)}
        true -> :error
      end

    with {:ok, category} <- value,
         {:ok, count} <- Journals.bulk_update_category(user.id, entry_ids, category) do
      Enum.each(entry_ids, &enqueue_search_index/1)
      json(conn, %{ok: true, count: count})
    else
      :error -> conn |> put_status(:bad_request) |> json(%{error: "Unknown category"})
      {:error, :unauthorized} -> conn |> put_status(:forbidden) |> json(%{error: "Not authorized"})
    end
  end

  # Bulk-publishing a batch of old posts (usually an import) used to push every
  # one of them into followers' fediverse timelines as new. Older ones are now
  # published quietly (on the profile, reachable from the fediverse, just not
  # delivered) unless the writer asks for them to be sent (`federate_older`).
  defp handle_bulk_publish(conn, user, entry_ids, federate_older) do
    cutoff = DateTime.add(DateTime.utc_now(), -@quiet_publish_after_days, :day)

    case Journals.bulk_publish_drafts(user.id, entry_ids) do
      {:ok, published} ->
        Enum.each(published, fn entry ->
          older = DateTime.compare(entry.published_at, cutoff) == :lt

          if entry.privacy == :public and (federate_older or not older) do
            %{entry_id: entry.id, action: "create", user_id: entry.user_id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          enqueue_search_index(entry.id)
        end)

        json(conn, %{ok: true, count: length(published)})

      {:error, :not_all_drafts} ->
        conn |> put_status(:bad_request) |> json(%{error: "Some entries are not drafts"})
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

  def validate_custom_filter_ownership(attrs, user_id) do
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
  def maybe_clear_custom_filter_id(%{"privacy" => privacy} = attrs) when privacy != "custom" do
    Map.put(attrs, "custom_filter_id", nil)
  end
  def maybe_clear_custom_filter_id(attrs), do: attrs

  # Cross-post to linked Mastodon accounts if the writer opted in

  # Trigger newsletter send if the writer opted in for this entry

  def get_owned_entry(user_id, entry_id) do
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

  def check_entry_rate_limit(user_id, tier) do
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

  def record_entry_creation(user_id) do
    now = System.system_time(:second)
    cutoff = now - @entry_rate_window

    timestamps =
      case :ets.lookup(:entry_creation_buckets, user_id) do
        [{^user_id, ts}] -> Enum.filter(ts, &(&1 > cutoff))
        [] -> []
      end

    :ets.insert(:entry_creation_buckets, {user_id, [now | timestamps]})
  end

  def check_duplicate(user_id, body_html) do
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
      scheduled_at: entry.scheduled_at,
      ap_id: entry.ap_id,
      status: entry.status,
      word_count: entry.word_count || 0,
      excerpt: entry.excerpt,
      excerpt_custom: entry.excerpt_custom,
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
      reprint_count: entry.reprint_count || 0,
      margin_note_count: entry.margin_note_count || 0,
      quoted_entry_id: entry.quoted_entry_id,
      quoted_remote_entry_id: entry.quoted_remote_entry_id,
      quoted_entry: render_quoted_entry(entry),
      entry_source: entry.source,
      kind: entry.kind || "entry",
      sticky_color: entry.sticky_color,
      source_sticky_id: entry.source_sticky_id,
      created_at: entry.inserted_at,
      updated_at: entry.updated_at
    }
  end

  @doc "True when the viewer turned Stickies off in Settings (they're on by default)."
  def hides_stickies?(%{settings: %{"hide_stickies" => true}}), do: true
  def hides_stickies?(_), do: false

  @doc """
  Adds `expanded_into` (`%{slug, title, username}` or nil) to each rendered
  sticky: the published entry its author wrote from it. The entry has to be
  public, unless the viewer is its author.
  """
  def put_sticky_expansions(items, viewer_id) do
    sticky_ids =
      for %{kind: "sticky", id: id} <- items, do: id

    expansions =
      if sticky_ids == [] do
        %{}
      else
        import Ecto.Query, only: [from: 2, where: 3]

        query =
          from(e in Inkwell.Journals.Entry,
            join: u in assoc(e, :user),
            where: e.source_sticky_id in ^sticky_ids and e.status == :published,
            order_by: [asc: e.published_at],
            select: {e.source_sticky_id, %{slug: e.slug, title: e.title, username: u.username}}
          )

        query =
          if viewer_id,
            do: where(query, [e], e.privacy == :public or e.user_id == ^viewer_id),
            else: where(query, [e], e.privacy == :public)

        query
        |> Repo.all()
        # The first entry written from a sticky wins.
        |> Enum.reverse()
        |> Map.new()
      end

    Enum.map(items, fn
      %{kind: "sticky", id: id} = item -> Map.put(item, :expanded_into, Map.get(expansions, id))
      item -> item
    end)
  end

  defp render_quoted_entry(%{quoted_entry_id: nil, quoted_remote_entry_id: nil}), do: nil
  defp render_quoted_entry(%{quoted_entry_id: qid} = entry) when not is_nil(qid) do
    # Preload the quoted entry if not already loaded
    entry = Repo.preload(entry, [quoted_entry: :user])
    case entry.quoted_entry do
      nil -> nil
      qe ->
        author = qe.user
        %{
          id: qe.id,
          type: "local",
          title: qe.title,
          body_html: qe.body_html,
          excerpt: qe.excerpt || truncate_text(qe.body_html, 300),
          slug: qe.slug,
          cover_image_id: qe.cover_image_id,
          published_at: qe.published_at,
          word_count: qe.word_count,
          ink_count: qe.ink_count || 0,
          reprint_count: qe.reprint_count || 0,
          category: qe.category,
          tags: qe.tags || [],
          mood: qe.mood,
          music: qe.music,
          author: %{
            username: author.username,
            display_name: author.display_name,
            avatar_url: Avatars.avatar_url(author),
            avatar_frame: author.avatar_frame,
            avatar_animation: author.avatar_animation,
            subscription_tier: Inkwell.SelfHosted.effective_tier(author),
            ink_donor_status: author.ink_donor_status
          }
        }
    end
  end
  defp render_quoted_entry(%{quoted_remote_entry_id: qrid} = entry) when not is_nil(qrid) do
    entry = Repo.preload(entry, [quoted_remote_entry: :remote_actor])
    case entry.quoted_remote_entry do
      nil -> nil
      qre ->
        actor = qre.remote_actor
        %{
          id: qre.id,
          type: "remote",
          title: qre.title,
          body_html: qre.body_html,
          excerpt: truncate_text(qre.body_html, 300),
          url: qre.url,
          published_at: qre.published_at,
          ink_count: qre.likes_count || 0,
          tags: qre.tags || [],
          author: %{
            username: actor.username,
            display_name: actor.display_name || actor.username,
            avatar_url: actor.avatar_url,
            avatar_frame: nil,
            domain: actor.domain
          }
        }
    end
  end
  defp render_quoted_entry(_), do: nil

  defp truncate_text(nil, _), do: nil
  defp truncate_text(html, max_len) do
    text = String.replace(html, ~r/<[^>]+>/, "") |> String.trim()
    if String.length(text) > max_len do
      String.slice(text, 0, max_len) <> "..."
    else
      text
    end
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
  # A fediverse player for the media link comes from MediaEmbeds.resolve/1 in
  # the editor. What the client sends back is re-checked against the link and
  # dropped if it doesn't match; changing the link without new metadata clears it.
  defp put_music_metadata(%{"music_metadata" => meta} = attrs),
    do: Map.put(attrs, "music_metadata", Inkwell.MediaEmbeds.sanitize(meta, attrs["music"]))

  defp put_music_metadata(%{"music" => _} = attrs), do: Map.put(attrs, "music_metadata", nil)
  defp put_music_metadata(attrs), do: attrs

  # The publish-time choices a scheduled post keeps until it goes live (see
  # EntryPublishing). Anything else in the map is dropped.
  defp sanitize_scheduled_options(%{"scheduled_options" => opts} = attrs) when is_map(opts) do
    clean =
      %{
        "send_newsletter" => opts["send_newsletter"] == true,
        "newsletter_subject" => if(is_binary(opts["newsletter_subject"]), do: String.slice(opts["newsletter_subject"], 0, 500)),
        "newsletter_scheduled_at" => if(is_binary(opts["newsletter_scheduled_at"]), do: opts["newsletter_scheduled_at"]),
        "crosspost_to" => if(is_list(opts["crosspost_to"]), do: Enum.filter(opts["crosspost_to"], &is_binary/1), else: [])
      }
      |> Map.reject(fn {_k, v} -> is_nil(v) end)

    Map.put(attrs, "scheduled_options", clean)
  end

  defp sanitize_scheduled_options(%{"scheduled_options" => _} = attrs),
    do: Map.put(attrs, "scheduled_options", %{})

  defp sanitize_scheduled_options(attrs), do: attrs

  defp maybe_auto_series_order(%{"series_id" => series_id} = attrs)
       when is_binary(series_id) and series_id != "" do
    Map.put_new(attrs, "series_order", Journals.next_series_order(series_id))
  end
  defp maybe_auto_series_order(%{"series_id" => series_id} = attrs) when series_id in [nil, ""] do
    attrs |> Map.put("series_order", nil)
  end
  defp maybe_auto_series_order(attrs), do: attrs

  # The editor sends series_id on every save, so editing an entry that's
  # already in the series used to move it to the end. Only an entry joining a
  # series (or one without a position yet) gets the next position.
  defp maybe_auto_series_order(%{"series_id" => series_id} = attrs, entry)
       when is_binary(series_id) and series_id == entry.series_id and not is_nil(entry.series_order),
       do: attrs

  defp maybe_auto_series_order(attrs, _entry), do: maybe_auto_series_order(attrs)

  # Excerpts: a blank or missing excerpt is generated from the body. It used to
  # freeze at first save because the editor loaded the generated excerpt into
  # the field and sent it back as if the writer had written it. Now the editor
  # only fills the field with an excerpt the writer wrote (`excerpt_custom`),
  # and a generated one is regenerated whenever the body changes.
  defp put_excerpt(%{"excerpt" => excerpt} = attrs, entry) when is_binary(excerpt) do
    if String.trim(excerpt) == "",
      do: attrs |> Map.put("excerpt_custom", false) |> auto_excerpt(entry),
      else: Map.put(attrs, "excerpt_custom", true)
  end

  defp put_excerpt(%{"excerpt" => nil} = attrs, entry),
    do: attrs |> Map.put("excerpt_custom", false) |> auto_excerpt(entry)

  # No excerpt sent (API clients, bulk tools): keep a written one, refresh a generated one.
  defp put_excerpt(attrs, %{excerpt_custom: true}), do: attrs
  defp put_excerpt(attrs, entry), do: auto_excerpt(attrs, entry)

  defp auto_excerpt(attrs, entry) do
    html =
      cond do
        is_binary(attrs["body_html"]) -> attrs["body_html"]
        Map.has_key?(attrs, "excerpt") and entry != nil -> entry.body_html
        true -> nil
      end

    if is_binary(html), do: Map.put(attrs, "excerpt", excerpt_from_html(html)), else: attrs
  end

  defp excerpt_from_html(html) do
    auto =
      html
      |> String.replace(~r/<[^>]+>/, " ")
      |> decode_html_entities()
      |> String.replace(~r/\s+/, " ")
      |> String.trim()
      |> String.slice(0, 280)

    if auto == "", do: nil, else: auto
  end

  # Fediverse side of an edit. Followers' servers only ever see public
  # entries, so the privacy change decides the activity:
  #   public → public      Update
  #   public → not public  Delete (their copies disappear)
  #   not public → public  Create
  # Mastodon keeps a tombstone for a deleted id and refuses a later Create of
  # it, so an entry made private and then public again won't reappear there
  # (other servers do show it, and it can still be linked and looked up).
  def federate_edit(before, updated, user_id) do
    was_public = before.status == :published and before.privacy == :public
    now_public = updated.status == :published and updated.privacy == :public

    cond do
      was_public and now_public -> enqueue_fan_out(updated.id, "update", user_id)
      was_public -> enqueue_federated_delete(updated)
      now_public and before.status == :published -> enqueue_fan_out(updated.id, "create", user_id)
      true -> :ok
    end
  end

  defp enqueue_fan_out(entry_id, action, user_id) do
    %{entry_id: entry_id, action: action, user_id: user_id}
    |> FanOutWorker.new()
    |> Oban.insert()
  end

  defp enqueue_federated_delete(%{ap_id: ap_id, user_id: user_id}) when is_binary(ap_id) do
    %{entry_ap_id: ap_id, action: "delete", user_id: user_id}
    |> FanOutWorker.new()
    |> Oban.insert()
  end

  defp enqueue_federated_delete(_entry), do: :ok

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

  def format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  # ── Search indexing helpers ───────────────────────────────────────────


  def enqueue_search_index(entry_id) do
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
