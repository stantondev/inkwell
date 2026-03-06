defmodule InkwellWeb.CircleController do
  use InkwellWeb, :controller

  alias Inkwell.Circles
  alias Inkwell.Accounts
  alias Inkwell.Social
  alias InkwellWeb.Helpers.MentionHelper

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

    rendered =
      Enum.map(circles, fn circle ->
        render_circle(circle, %{
          is_member: MapSet.member?(membership_ids, circle.id),
          viewer_role: nil
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

          json(conn, %{
            data:
              render_circle(circle, %{
                is_member: viewer_role != nil,
                viewer_role: viewer_role,
                member_preview: Enum.map(member_preview, &render_member/1)
              })
          })
        end
    end
  end

  # ── Authenticated ──────────────────────────────────────────────────────────

  def create(conn, params) do
    user = conn.assigns.current_user

    if user.subscription_tier != "plus" do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Plus subscription required to create circles"})
    else
      case Circles.create_circle(user, params) do
        {:ok, circle} ->
          conn |> put_status(:created) |> json(%{data: render_circle(circle, %{is_member: true, viewer_role: :owner})})

        {:error, :circle_limit_reached} ->
          conn |> put_status(:forbidden) |> json(%{error: "You can create up to 10 circles"})

        {:error, %Ecto.Changeset{} = changeset} ->
          conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})

        {:error, reason} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
      end
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

    rendered =
      Enum.map(memberships, fn membership ->
        render_circle(membership.circle, %{
          is_member: true,
          viewer_role: membership.role
        })
      end)

    json(conn, %{data: rendered})
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

  def create_discussion(conn, %{"id" => circle_id} = params) do
    user = conn.assigns.current_user

    unless Circles.is_member?(circle_id, user.id) do
      conn |> put_status(:forbidden) |> json(%{error: "Members only"})
    else
      # Prompts require owner or moderator
      is_prompt = params["is_prompt"] == true || params["is_prompt"] == "true"
      role = Circles.get_user_role(circle_id, user.id)

      if is_prompt && role not in [:owner, :moderator] do
        conn |> put_status(:forbidden) |> json(%{error: "Only owners and moderators can create prompts"})
      else
        attrs =
          params
          |> Map.put("circle_id", circle_id)
          |> Map.put("author_id", user.id)
          |> Map.put("is_prompt", is_prompt)

        case Circles.create_discussion(attrs) do
          {:ok, discussion} ->
            conn |> put_status(:created) |> json(%{data: render_discussion(discussion)})

          {:error, %Ecto.Changeset{} = changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
        end
      end
    end
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

  def create_response(conn, %{"discussion_id" => did} = params) do
    user = conn.assigns.current_user

    case Circles.get_discussion(did) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})

      discussion ->
        unless Circles.is_member?(discussion.circle_id, user.id) do
          conn |> put_status(:forbidden) |> json(%{error: "Members only"})
        else
          if discussion.is_locked do
            conn |> put_status(:forbidden) |> json(%{error: "This discussion is locked"})
          else
            # Process mentions
            body_text = params["body"] || ""
            body_html = MentionHelper.plain_text_to_html(body_text)
            {processed_body, mentioned_users} = MentionHelper.process_mentions(body_html)

            attrs = %{
              "body" => processed_body,
              "discussion_id" => did,
              "author_id" => user.id
            }

            case Circles.create_response(attrs) do
              {:ok, response} ->
                # Get circle info for notifications
                circle = Circles.get_circle(discussion.circle_id) || discussion.circle

                # Notify discussion author
                if discussion.author_id && discussion.author_id != user.id do
                  Accounts.create_notification(%{
                    type: :circle_response,
                    user_id: discussion.author_id,
                    actor_id: user.id,
                    target_type: "circle_discussion",
                    target_id: discussion.id,
                    data: %{
                      circle_slug: circle.slug,
                      circle_name: circle.name,
                      discussion_title: discussion.title
                    }
                  })
                end

                # Notify mentioned users
                Enum.each(mentioned_users, fn mentioned ->
                  if mentioned.id != user.id && mentioned.id != discussion.author_id do
                    Accounts.create_notification(%{
                      type: :circle_mention,
                      user_id: mentioned.id,
                      actor_id: user.id,
                      target_type: "circle_discussion",
                      target_id: discussion.id,
                      data: %{
                        circle_slug: circle.slug,
                        circle_name: circle.name,
                        discussion_title: discussion.title
                      }
                    })
                  end
                end)

                conn |> put_status(:created) |> json(%{data: render_response(response)})

              {:error, %Ecto.Changeset{} = changeset} ->
                conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})

              {:error, :discussion_not_found} ->
                conn |> put_status(:not_found) |> json(%{error: "Discussion not found"})
            end
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
            avatar_url: owner.avatar_url,
            avatar_frame: owner.avatar_frame,
            subscription_tier: owner.subscription_tier
          }
        end
    }

    base
    |> maybe_put(:is_member, meta[:is_member])
    |> maybe_put(:viewer_role, meta[:viewer_role])
    |> maybe_put(:member_preview, meta[:member_preview])
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
            avatar_url: user.avatar_url,
            avatar_frame: user.avatar_frame,
            subscription_tier: user.subscription_tier
          }
        end
    }
  end

  defp render_discussion(discussion) do
    author = if Ecto.assoc_loaded?(discussion.author) && discussion.author, do: discussion.author, else: nil
    circle = if Ecto.assoc_loaded?(discussion.circle) && discussion.circle, do: discussion.circle, else: nil

    base = %{
      id: discussion.id,
      title: discussion.title,
      body: discussion.body,
      is_prompt: discussion.is_prompt,
      is_pinned: discussion.is_pinned,
      is_locked: discussion.is_locked,
      response_count: discussion.response_count,
      last_response_at: discussion.last_response_at,
      inserted_at: discussion.inserted_at,
      circle_id: discussion.circle_id,
      author:
        if author do
          %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url,
            avatar_frame: author.avatar_frame
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

    %{
      id: response.id,
      body: response.body,
      edited_at: response.edited_at,
      inserted_at: response.inserted_at,
      discussion_id: response.discussion_id,
      author:
        if author do
          %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url,
            avatar_frame: author.avatar_frame
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

  defp has_unique_error?(%Ecto.Changeset{} = changeset) do
    Enum.any?(changeset.errors, fn {_field, {_msg, opts}} ->
      opts[:constraint] == :unique
    end)
  end
end
