defmodule InkwellWeb.CircleController do
  use InkwellWeb, :controller

  alias Inkwell.Repo
  alias Inkwell.Circles
  alias Inkwell.Accounts
  alias Inkwell.Social
  alias Inkwell.Avatars
  alias InkwellWeb.Helpers.MentionHelper
  alias InkwellWeb.EntryController

  # ── Public (optional auth) ─────────────────────────────────────────────────

  def index(conn, params) do
    viewer = conn.assigns[:current_user]
    blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

    {circles, total} =
      Circles.list_circles(
        Map.merge(params, %{exclude_owner_ids: blocked_ids})
      )

    # Batch check memberships for viewer
    membership_ids =
      if viewer, do: Circles.get_user_membership_ids(viewer.id), else: MapSet.new()

    counts = Circles.entry_counts(Enum.map(circles, & &1.id))

    rendered =
      Enum.map(circles, fn circle ->
        render_circle(circle, %{
          is_member: MapSet.member?(membership_ids, circle.id),
          viewer_role: nil,
          entry_count: Map.get(counts, circle.id, 0)
        })
      end)

    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    json(conn, %{
      data: rendered,
      pagination: %{
        page: page,
        per_page: per_page,
        total: total,
        total_pages: ceil(total / max(per_page, 1))
      }
    })
  end

  def show(conn, %{"slug" => slug}) do
    viewer = conn.assigns[:current_user]

    case Circles.get_circle_by_slug(slug) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Circle not found"})

      circle ->
        # Block check
        if viewer && Social.is_blocked_between?(viewer.id, circle.owner_id) do
          conn |> put_status(:not_found) |> json(%{error: "Circle not found"})
        else
          viewer_role =
            if viewer, do: Circles.get_user_role(circle.id, viewer.id), else: nil

          blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

          member_preview =
            Circles.get_member_preview(circle.id)
            |> Enum.reject(fn m -> m.user_id in blocked_ids end)

          is_member = viewer_role != nil

          # Reading the circle page counts as catching up on it.
          if is_member, do: Circles.mark_read(circle.id, viewer.id)

          prompt =
            case Circles.current_prompt(circle, viewer) do
              nil ->
                nil

              entry ->
                entry
                |> render_circle_entry(circle)
                |> Map.put(:response_count, Map.get(Circles.prompt_response_counts([entry.id]), entry.id, 0))
            end

          json(conn, %{
            data:
              render_circle(circle, %{
                is_member: is_member,
                viewer_role: viewer_role,
                member_preview: Enum.map(member_preview, &render_member/1),
                entry_count: Map.get(Circles.entry_counts([circle.id]), circle.id, 0),
                prompt: prompt,
                # The first version's discussions, kept read-only for members.
                has_archive: is_member and circle.discussion_count > 0
              })
          })
        end
    end
  end

  # ── Authenticated ──────────────────────────────────────────────────────────

  def create(conn, params) do
    user = conn.assigns.current_user

    params = Map.take(params, ["name", "description", "category"])

    case Circles.create_circle(user, params) do
      {:ok, circle} ->
        conn |> put_status(:created) |> json(%{data: render_circle(circle, %{is_member: true, viewer_role: :owner})})

      {:error, reason} when reason in [:too_new, :limited, :limit_reached] ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: creation_message(Circles.creation_status(user)), code: to_string(reason)})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})

      {:error, _reason} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Couldn't create the circle"})
    end
  end

  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case Circles.get_circle(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Circle not found"})

      circle ->
        if circle.owner_id != user.id do
          conn |> put_status(:forbidden) |> json(%{error: "Only the circle owner can edit"})
        else
          case Circles.update_circle(circle, params) do
            {:ok, updated} ->
              json(conn, %{data: render_circle(Inkwell.Repo.preload(updated, :owner), %{is_member: true, viewer_role: :owner})})

            {:error, changeset} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
          end
        end
    end
  end

  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Circles.get_circle(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Circle not found"})

      circle ->
        if circle.owner_id != user.id do
          conn |> put_status(:forbidden) |> json(%{error: "Only the circle owner can delete"})
        else
          case Circles.delete_circle(circle) do
            {:ok, _} -> json(conn, %{ok: true})
            {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to delete circle"})
          end
        end
    end
  end

  def my_circles(conn, _params) do
    user = conn.assigns.current_user
    memberships = Circles.get_user_memberships(user.id)
    unread = Circles.unread_counts(user.id)
    counts = Circles.entry_counts(Enum.map(memberships, & &1.circle_id))

    rendered =
      memberships
      |> Enum.map(fn membership ->
        render_circle(membership.circle, %{
          is_member: true,
          viewer_role: membership.role,
          unread_count: Map.get(unread, membership.circle_id, 0),
          entry_count: Map.get(counts, membership.circle_id, 0)
        })
      end)
      # Circles with something new first, then the most recently active.
      |> Enum.sort_by(fn c -> {c.unread_count == 0, -sort_time(c.last_activity_at)} end)

    status = Circles.creation_status(user)

    json(conn, %{
      data: rendered,
      meta: %{
        can_create: status.can_create,
        create_reason: status.reason && to_string(status.reason),
        create_message: if(status.can_create, do: nil, else: creation_message(status)),
        circle_limit: status.limit,
        circles_owned: status.owned
      }
    })
  end

  def join(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Circles.get_circle(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Circle not found"})

      circle ->
        # Block check
        if Social.is_blocked_between?(user.id, circle.owner_id) do
          conn |> put_status(:forbidden) |> json(%{error: "Cannot join this circle"})
        else
          case Circles.join_circle(circle.id, user.id) do
            {:ok, _member} ->
              # Notify circle owner
              if circle.owner_id != user.id do
                Accounts.create_notification(%{
                  type: :circle_new_member,
                  user_id: circle.owner_id,
                  actor_id: user.id,
                  target_type: "circle",
                  target_id: circle.id,
                  data: %{circle_slug: circle.slug, circle_name: circle.name}
                })
              end

              json(conn, %{ok: true})

            {:error, %Ecto.Changeset{} = changeset} ->
              if has_unique_error?(changeset) do
                conn |> put_status(:conflict) |> json(%{error: "Already a member"})
              else
                conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
              end
          end
        end
    end
  end

  def leave(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Circles.leave_circle(id, user.id) do
      {:ok, :left} -> json(conn, %{ok: true})
      {:error, :not_member} -> conn |> put_status(:not_found) |> json(%{error: "Not a member"})
      {:error, :owner_cannot_leave} -> conn |> put_status(:forbidden) |> json(%{error: "Circle owner cannot leave"})
      {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to leave circle"})
    end
  end

  def members(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    unless Circles.is_member?(id, user.id) do
      conn |> put_status(:forbidden) |> json(%{error: "Members only"})
    else
      blocked_ids = Social.get_blocked_user_ids(user.id)

      {members, total} =
        Circles.list_members(id, Map.merge(params, %{exclude_user_ids: blocked_ids}))

      rendered = Enum.map(members, &render_member/1)

      page = parse_int(params["page"], 1)
      per_page = parse_int(params["per_page"], 30)

      json(conn, %{
        data: rendered,
        pagination: %{
          page: page,
          per_page: per_page,
          total: total,
          total_pages: ceil(total / max(per_page, 1))
        }
      })
    end
  end

  # ── Discussions ──────────────────────────────────────────────────────────

  def list_discussions(conn, %{"id" => circle_id} = params) do
    user = conn.assigns.current_user

    unless Circles.is_member?(circle_id, user.id) do
      conn |> put_status(:forbidden) |> json(%{error: "Members only"})
    else
      blocked_ids = Social.get_blocked_user_ids(user.id)

      {discussions, total} =
        Circles.list_discussions(circle_id, Map.merge(params, %{exclude_author_ids: blocked_ids}))

      rendered = Enum.map(discussions, &render_discussion/1)

      page = parse_int(params["page"], 1)
      per_page = parse_int(params["per_page"], 20)

      json(conn, %{
        data: rendered,
        pagination: %{
          page: page,
          per_page: per_page,
          total: total,
          total_pages: ceil(total / max(per_page, 1))
        }
      })
    end
  end

  # The first version's discussions are an archive now; new posts are entries.
  def create_discussion(conn, _params) do
    conn
    |> put_status(:gone)
    |> json(%{error: "Circles now use journal entries. Write an entry and choose this circle in its settings."})
  end

  def show_discussion(conn, %{"discussion_id" => did}) do
    user = conn.assigns.current_user

    case Circles.get_discussion(did) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})

      discussion ->
        unless Circles.is_member?(discussion.circle_id, user.id) do
          conn |> put_status(:forbidden) |> json(%{error: "Members only"})
        else
          json(conn, %{data: render_discussion(discussion)})
        end
    end
  end

  def update_discussion(conn, %{"discussion_id" => did} = params) do
    user = conn.assigns.current_user

    case Circles.get_discussion(did) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})

      discussion ->
        role = Circles.get_user_role(discussion.circle_id, user.id)

        can_edit =
          discussion.author_id == user.id ||
            role in [:owner, :moderator]

        if can_edit do
          {processed_body, body_html, mentioned_users} = process_circle_body(params)

          attrs =
            params
            |> Map.put("body", processed_body)
            |> Map.put("body_html", body_html)

          case Circles.update_discussion(discussion, attrs) do
            {:ok, updated} ->
              # Invalidate translation cache
              Inkwell.Translations.delete_translations_for("circle_discussion", updated.id)

              # Notify newly mentioned users
              circle = Circles.get_circle(discussion.circle_id)

              Enum.each(mentioned_users, fn mentioned ->
                if mentioned.id != user.id do
                  Accounts.create_notification(%{
                    type: :circle_mention,
                    user_id: mentioned.id,
                    actor_id: user.id,
                    target_type: "circle_discussion",
                    target_id: discussion.id,
                    data: %{
                      circle_slug: circle.slug,
                      circle_name: circle.name,
                      discussion_title: updated.title || discussion.title
                    }
                  })
                end
              end)

              updated = Repo.preload(updated, [:author, :circle])
              json(conn, %{data: render_discussion(updated)})

            {:error, changeset} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
          end
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not authorized to edit this discussion"})
        end
    end
  end

  def delete_discussion(conn, %{"discussion_id" => did}) do
    user = conn.assigns.current_user

    case Circles.get_discussion(did) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})

      discussion ->
        role = Circles.get_user_role(discussion.circle_id, user.id)

        can_delete =
          discussion.author_id == user.id ||
            role in [:owner, :moderator]

        if can_delete do
          case Circles.delete_discussion(discussion) do
            {:ok, _} -> json(conn, %{ok: true})
            {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to delete"})
          end
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not authorized to delete this discussion"})
        end
    end
  end

  # ── Responses ──────────────────────────────────────────────────────────────

  def list_responses(conn, %{"discussion_id" => did} = params) do
    user = conn.assigns.current_user

    case Circles.get_discussion(did) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})

      discussion ->
        unless Circles.is_member?(discussion.circle_id, user.id) do
          conn |> put_status(:forbidden) |> json(%{error: "Members only"})
        else
          blocked_ids = Social.get_blocked_user_ids(user.id)

          {responses, total} =
            Circles.list_responses(did, Map.merge(params, %{exclude_author_ids: blocked_ids}))

          rendered = Enum.map(responses, &render_response/1)

          page = parse_int(params["page"], 1)
          per_page = parse_int(params["per_page"], 30)

          json(conn, %{
            data: rendered,
            pagination: %{
              page: page,
              per_page: per_page,
              total: total,
              total_pages: ceil(total / max(per_page, 1))
            }
          })
        end
    end
  end

  def create_response(conn, _params) do
    conn
    |> put_status(:gone)
    |> json(%{error: "Circles now use journal entries. Write an entry and choose this circle in its settings."})
  end

  def update_response(conn, %{"response_id" => rid} = params) do
    user = conn.assigns.current_user

    case Circles.get_response(rid) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Response not found"})

      response ->
        if response.author_id != user.id do
          conn |> put_status(:forbidden) |> json(%{error: "You can only edit your own responses"})
        else
          {processed_body, body_html, _mentioned_users} = process_circle_body(params)

          attrs = %{
            "body" => processed_body,
            "body_html" => body_html
          }

          case Circles.update_response(response, attrs) do
            {:ok, updated} ->
              Inkwell.Translations.delete_translations_for("circle_response", updated.id)
              updated = Repo.preload(updated, :author)
              json(conn, %{data: render_response(updated)})

            {:error, changeset} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
          end
        end
    end
  end

  def delete_response(conn, %{"response_id" => rid}) do
    user = conn.assigns.current_user

    case Circles.get_response(rid) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Response not found"})

      response ->
        role = Circles.get_user_role(response.discussion.circle_id, user.id)

        can_delete =
          response.author_id == user.id ||
            role in [:owner, :moderator]

        if can_delete do
          case Circles.delete_response(response) do
            {:ok, _} -> json(conn, %{ok: true})
            {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to delete"})
          end
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not authorized to delete this response"})
        end
    end
  end

  # ── Entries posted to a circle ───────────────────────────────────────────

  # GET /api/circles/:id/entries?page=&prompt= (optional auth)
  def entries(conn, %{"id" => id} = params) do
    viewer = conn.assigns[:current_user]

    with {:ok, _} <- Ecto.UUID.cast(id),
         %{} = circle <- Circles.get_circle(id),
         false <- viewer != nil and Social.is_blocked_between?(viewer.id, circle.owner_id) do
      page = parse_int(params["page"], 1)
      prompt_id = with p when is_binary(p) <- params["prompt"], {:ok, p} <- Ecto.UUID.cast(p), do: p, else: (_ -> nil)

      {entries, total} = Circles.list_circle_entries(circle, viewer, page: page, per_page: 20, prompt_id: prompt_id)

      comment_counts = Inkwell.Journals.count_comments_for_entries(Enum.map(entries, & &1.id))
      response_counts = Circles.prompt_response_counts(if circle.prompt_entry_id, do: [circle.prompt_entry_id], else: [])

      my_inks =
        if viewer, do: Inkwell.Inks.get_user_inks_for_entries(viewer.id, Enum.map(entries, & &1.id)), else: MapSet.new()

      data =
        Enum.map(entries, fn entry ->
          entry
          |> render_circle_entry(circle)
          |> Map.put(:comment_count, Map.get(comment_counts, entry.id, 0))
          |> Map.put(:my_ink, MapSet.member?(my_inks, entry.id))
          |> Map.put(:response_count, Map.get(response_counts, entry.id))
        end)

      json(conn, %{
        data: data,
        pagination: %{page: page, per_page: 20, total: total, total_pages: ceil(total / 20)}
      })
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Circle not found"})
    end
  end

  # POST /api/circles/:id/prompt {entry_id} — owner or moderator
  def set_prompt(conn, %{"id" => id, "entry_id" => entry_id}) do
    user = conn.assigns.current_user

    with_moderator(conn, id, user, fn circle ->
      case Circles.set_prompt(circle, entry_id, user) do
        {:ok, _} -> json(conn, %{ok: true, prompt_entry_id: entry_id})
        {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Only a published entry in this circle can be its prompt"})
      end
    end)
  end

  def set_prompt(conn, _params),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "entry_id is required"})

  # DELETE /api/circles/:id/prompt — owner or moderator
  def clear_prompt(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with_moderator(conn, id, user, fn circle ->
      {:ok, _} = Circles.clear_prompt(circle)
      json(conn, %{ok: true})
    end)
  end

  # DELETE /api/circles/:id/entries/:entry_id — the owner, a moderator, or the
  # entry's writer takes it out of the circle (it stays on their journal).
  def remove_entry(conn, %{"id" => id, "entry_id" => entry_id}) do
    user = conn.assigns.current_user

    with {:ok, _} <- Ecto.UUID.cast(id),
         {:ok, _} <- Ecto.UUID.cast(entry_id),
         %{} = circle <- Circles.get_circle(id),
         %Inkwell.Journals.Entry{} = entry <- Repo.get(Inkwell.Journals.Entry, entry_id) do
      role = Circles.get_user_role(circle.id, user.id)

      if entry.user_id == user.id or role in [:owner, :moderator] do
        case Circles.detach_entry(circle, entry) do
          {:ok, _} -> json(conn, %{ok: true})
          {:error, _} -> conn |> put_status(:not_found) |> json(%{error: "That entry isn't in this circle"})
        end
      else
        conn |> put_status(:forbidden) |> json(%{error: "Only the circle's owner or moderators can remove posts"})
      end
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  defp with_moderator(conn, id, user, fun) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         %{} = circle <- Circles.get_circle(id) do
      if Circles.get_user_role(circle.id, user.id) in [:owner, :moderator] do
        fun.(circle)
      else
        conn |> put_status(:forbidden) |> json(%{error: "Only the circle's owner or moderators can do that"})
      end
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Circle not found"})
    end
  end

  defp creation_message(%{reason: :too_new, min_account_age_days: days}),
    do: "You can start a circle once your account is #{days} days old. You can join and post in circles now."

  defp creation_message(%{reason: :limited}),
    do: "Your account can't start circles right now. If you think that's a mistake, write to hello@inkwell.social."

  defp creation_message(%{reason: :limit_reached, limit: 3}),
    do: "You've started 3 circles, the most on the free plan. Plus members can start up to 10."

  defp creation_message(%{reason: :limit_reached, limit: limit}),
    do: "You've started #{limit} circles, the most you can have."

  defp creation_message(_), do: nil

  defp sort_time(nil), do: 0
  defp sort_time(%DateTime{} = at), do: DateTime.to_unix(at, :microsecond)
  defp sort_time(%NaiveDateTime{} = at), do: at |> DateTime.from_naive!("Etc/UTC") |> DateTime.to_unix(:microsecond)

  defp render_circle_entry(entry, circle) do
    user = entry.user

    entry
    |> EntryController.render_entry()
    |> Map.drop([:body_raw, :scheduled_at, :custom_filter_id, :newsletter_sent_at])
    |> Map.put(:is_prompt, circle.prompt_entry_id == entry.id)
    |> Map.put(:author, render_person(user))
  end

  defp render_person(nil), do: nil

  defp render_person(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: Avatars.avatar_url(user),
      avatar_frame: user.avatar_frame,
      avatar_animation: user.avatar_animation,
      subscription_tier: Inkwell.SelfHosted.effective_tier(user)
    }
  end

  # ── Member management ────────────────────────────────────────────────────

  def update_member_role(conn, %{"id" => circle_id, "user_id" => target_user_id} = params) do
    user = conn.assigns.current_user
    role = Circles.get_user_role(circle_id, user.id)

    unless role == :owner do
      conn |> put_status(:forbidden) |> json(%{error: "Only the circle owner can change roles"})
    else
      new_role =
        case params["role"] do
          "moderator" -> :moderator
          "member" -> :member
          _ -> nil
        end

      if is_nil(new_role) do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid role"})
      else
        case Circles.update_member_role(circle_id, target_user_id, new_role) do
          {:ok, member} ->
            member = Repo.preload(member, :user)
            json(conn, %{data: render_member(member)})

          {:error, :not_member} ->
            conn |> put_status(:not_found) |> json(%{error: "Member not found"})

          {:error, :cannot_change_owner} ->
            conn |> put_status(:forbidden) |> json(%{error: "Cannot change the owner's role"})

          {:error, :already_that_role} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Member already has that role"})

          {:error, _} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update role"})
        end
      end
    end
  end

  def remove_member(conn, %{"id" => circle_id, "user_id" => target_user_id}) do
    user = conn.assigns.current_user
    role = Circles.get_user_role(circle_id, user.id)

    unless role == :owner do
      conn |> put_status(:forbidden) |> json(%{error: "Only the circle owner can remove members"})
    else
      case Circles.remove_member(circle_id, target_user_id) do
        {:ok, :removed} ->
          json(conn, %{ok: true})

        {:error, :not_member} ->
          conn |> put_status(:not_found) |> json(%{error: "Member not found"})

        {:error, :cannot_remove_owner} ->
          conn |> put_status(:forbidden) |> json(%{error: "Cannot remove the circle owner"})

        {:error, _} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to remove member"})
      end
    end
  end

  # ── Render helpers ─────────────────────────────────────────────────────────

  defp render_circle(circle, meta) do
    owner = if Ecto.assoc_loaded?(circle.owner) && circle.owner, do: circle.owner, else: nil

    base = %{
      id: circle.id,
      name: circle.name,
      slug: circle.slug,
      description: circle.description,
      category: circle.category,
      cover_image_id: circle.cover_image_id,
      member_count: circle.member_count,
      discussion_count: circle.discussion_count,
      is_starter: circle.is_starter,
      last_activity_at: circle.last_activity_at,
      inserted_at: circle.inserted_at,
      owner:
        if owner do
          %{
            id: owner.id,
            username: owner.username,
            display_name: owner.display_name,
            avatar_url: Avatars.avatar_url(owner),
            avatar_frame: owner.avatar_frame,
            avatar_animation: owner.avatar_animation,
            subscription_tier: Inkwell.SelfHosted.effective_tier(owner)
          }
        end
    }

    base
    |> maybe_put(:is_member, meta[:is_member])
    |> maybe_put(:viewer_role, meta[:viewer_role])
    |> maybe_put(:member_preview, meta[:member_preview])
    |> maybe_put(:entry_count, meta[:entry_count])
    |> maybe_put(:unread_count, meta[:unread_count])
    |> maybe_put(:has_archive, meta[:has_archive])
    |> Map.put(:prompt, meta[:prompt])
  end

  defp render_member(member) do
    user = if Ecto.assoc_loaded?(member.user) && member.user, do: member.user, else: nil

    %{
      id: member.id,
      role: member.role,
      joined_at: member.inserted_at,
      user:
        if user do
          %{
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: Avatars.avatar_url(user),
            avatar_frame: user.avatar_frame,
            avatar_animation: user.avatar_animation,
            subscription_tier: Inkwell.SelfHosted.effective_tier(user)
          }
        end
    }
  end

  defp render_discussion(discussion) do
    author = if Ecto.assoc_loaded?(discussion.author) && discussion.author, do: discussion.author, else: nil
    circle = if Ecto.assoc_loaded?(discussion.circle) && discussion.circle, do: discussion.circle, else: nil

    # For backward compat: if body_html is nil (pre-migration), generate on-the-fly
    body_html =
      if discussion.body_html do
        discussion.body_html
      else
        html = MentionHelper.plain_text_to_html(discussion.body || "")
        {processed, _} = MentionHelper.process_mentions(html)
        processed
      end

    base = %{
      id: discussion.id,
      title: discussion.title,
      body: discussion.body,
      body_html: body_html,
      is_prompt: discussion.is_prompt,
      is_pinned: discussion.is_pinned,
      is_locked: discussion.is_locked,
      response_count: discussion.response_count,
      last_response_at: discussion.last_response_at,
      edited_at: discussion.edited_at,
      inserted_at: discussion.inserted_at,
      circle_id: discussion.circle_id,
      author:
        if author do
          %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: Avatars.avatar_url(author),
            avatar_frame: author.avatar_frame,
            avatar_animation: author.avatar_animation
          }
        end
    }

    if circle do
      Map.put(base, :circle, %{id: circle.id, name: circle.name, slug: circle.slug})
    else
      base
    end
  end

  defp render_response(response) do
    author = if Ecto.assoc_loaded?(response.author) && response.author, do: response.author, else: nil

    # body_html should always exist for responses (old ones had mention-processed HTML in body)
    body_html = response.body_html || response.body

    %{
      id: response.id,
      body: response.body,
      body_html: body_html,
      edited_at: response.edited_at,
      inserted_at: response.inserted_at,
      discussion_id: response.discussion_id,
      author:
        if author do
          %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: Avatars.avatar_url(author),
            avatar_frame: author.avatar_frame,
            avatar_animation: author.avatar_animation
          }
        end
    }
  end

  # ── Private helpers ────────────────────────────────────────────────────────

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _default) when is_integer(val), do: max(val, 1)
  defp parse_int(_, default), do: default

  defp format_errors(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end

  # Processes body_html or plain text body into {plain_text_body, processed_html, mentioned_users}
  defp process_circle_body(params) do
    case params["body_html"] do
      html when is_binary(html) and html != "" ->
        sanitized = sanitize_circle_html(html)
        {processed_html, mentioned_users} = MentionHelper.process_mentions(sanitized)
        plain_text = derive_plain_text(processed_html)
        {plain_text, processed_html, mentioned_users}

      _ ->
        # Fallback: plain text body (backward compat for clients without rich text)
        body_text = params["body"] || ""
        html = MentionHelper.plain_text_to_html(body_text)
        {processed_html, mentioned_users} = MentionHelper.process_mentions(html)
        {body_text, processed_html, mentioned_users}
    end
  end

  defp sanitize_circle_html(html), do: Inkwell.HtmlSanitizer.sanitize(html)

  defp derive_plain_text(html) do
    html
    |> String.replace(~r/<br\s*\/?>/, "\n")
    |> String.replace(~r/<\/p>/, "\n")
    |> String.replace(~r/<\/li>/, "\n")
    |> String.replace(~r/<\/blockquote>/, "\n")
    |> String.replace(~r/<[^>]+>/, "")
    |> String.replace(~r/&amp;/, "&")
    |> String.replace(~r/&lt;/, "<")
    |> String.replace(~r/&gt;/, ">")
    |> String.replace(~r/&quot;/, "\"")
    |> String.replace(~r/&#39;/, "'")
    |> String.replace(~r/&nbsp;/, " ")
    |> String.replace(~r/\n{3,}/, "\n\n")
    |> String.trim()
  end

  defp has_unique_error?(%Ecto.Changeset{} = changeset) do
    Enum.any?(changeset.errors, fn {_field, {_msg, opts}} ->
      opts[:constraint] == :unique
    end)
  end
end
