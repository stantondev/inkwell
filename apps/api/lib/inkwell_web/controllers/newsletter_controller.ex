defmodule InkwellWeb.NewsletterController do
  use InkwellWeb, :controller

  alias Inkwell.Newsletter
  alias Inkwell.Accounts

  # ── Public Endpoints (no auth) ──

  # GET /api/newsletter/confirm?token=...
  def confirm(conn, %{"token" => token}) do
    case Newsletter.confirm_subscriber(token) do
      {:ok, subscriber} ->
        writer = Accounts.get_user!(subscriber.writer_id)
        json(conn, %{
          ok: true,
          writer: %{
            username: writer.username,
            display_name: writer.display_name || writer.username
          }
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Invalid or expired confirmation link"})
    end
  end

  def confirm(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "token is required"})
  end

  # GET /api/newsletter/unsubscribe?token=...
  def unsubscribe(conn, %{"token" => token}) do
    case Newsletter.unsubscribe_by_token(token) do
      {:ok, subscriber} ->
        writer = Accounts.get_user!(subscriber.writer_id)
        json(conn, %{
          ok: true,
          writer: %{
            username: writer.username,
            display_name: writer.display_name || writer.username
          }
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Invalid unsubscribe link"})
    end
  end

  def unsubscribe(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "token is required"})
  end

  # GET /api/newsletter/:username — public subscribe page data
  def subscribe_page(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      writer ->
        if writer.newsletter_enabled do
          subscriber_count = Newsletter.count_subscribers(writer.id)
          json(conn, %{
            data: %{
              username: writer.username,
              display_name: writer.display_name || writer.username,
              avatar_url: writer.avatar_url,
              avatar_frame: writer.avatar_frame,
              bio: writer.bio,
              newsletter_name: writer.newsletter_name,
              newsletter_description: writer.newsletter_description,
              subscriber_count: subscriber_count
            }
          })
        else
          conn |> put_status(:not_found) |> json(%{error: "Newsletter not enabled"})
        end
    end
  end

  # POST /api/newsletter/:username/subscribe
  def subscribe(conn, %{"username" => username, "email" => email} = params) do
    # Honeypot check
    if params["website"] && params["website"] != "" do
      json(conn, %{ok: true})
    else
      case Accounts.get_user_by_username(username) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: "User not found"})

        writer ->
          if !writer.newsletter_enabled do
            conn |> put_status(:not_found) |> json(%{error: "Newsletter not enabled"})
          else
            if Newsletter.at_subscriber_limit?(writer.id, writer.subscription_tier) do
              conn |> put_status(422) |> json(%{error: "This newsletter has reached its subscriber limit"})
            else
              # Check if the subscriber is a logged-in Inkwell user
              user_id = if conn.assigns[:current_user], do: conn.assigns.current_user.id, else: nil

              case Newsletter.subscribe(writer.id, email, source: "subscribe_page", user_id: user_id) do
                {:ok, %{status: "confirmed"}} ->
                  json(conn, %{ok: true, already_confirmed: true})

                {:ok, subscriber} ->
                  # Send confirmation email
                  frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
                  confirm_url = "#{frontend_url}/newsletter/confirm?token=#{subscriber.confirm_token}"

                  case Inkwell.Email.send_newsletter_confirmation(email, writer, confirm_url) do
                    {:ok, :sent} ->
                      json(conn, %{ok: true})

                    {:ok, :no_email_configured, link} ->
                      json(conn, %{ok: true, dev_confirm_link: link})

                    {:error, _reason} ->
                      json(conn, %{ok: true})
                  end

                {:error, changeset} ->
                  conn
                  |> put_status(422)
                  |> json(%{error: format_errors(changeset)})
              end
            end
          end
      end
    end
  end

  def subscribe(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "email is required"})
  end

  # ── Authenticated Endpoints ──

  # GET /api/newsletter/settings
  def get_settings(conn, _params) do
    user = conn.assigns.current_user
    subscriber_count = Newsletter.count_subscribers(user.id)
    pending_count = Newsletter.count_pending_subscribers(user.id)
    limit = Newsletter.subscriber_limit(user.subscription_tier)

    json(conn, %{
      data: %{
        newsletter_enabled: user.newsletter_enabled || false,
        newsletter_name: user.newsletter_name,
        newsletter_description: user.newsletter_description,
        newsletter_reply_to: user.newsletter_reply_to,
        subscriber_count: subscriber_count,
        pending_count: pending_count,
        subscriber_limit: limit,
        sends_this_month: Newsletter.count_sends_this_month(user.id),
        send_limit: Newsletter.send_limit(user.subscription_tier)
      }
    })
  end

  # PATCH /api/newsletter/settings
  def update_settings(conn, params) do
    user = conn.assigns.current_user
    is_plus = (user.subscription_tier || "free") == "plus"

    allowed_fields = %{
      "newsletter_enabled" => params["newsletter_enabled"],
      "newsletter_description" => params["newsletter_description"]
    }

    # Plus-only fields
    allowed_fields = if is_plus do
      allowed_fields
      |> Map.put("newsletter_name", params["newsletter_name"])
      |> Map.put("newsletter_reply_to", params["newsletter_reply_to"])
    else
      allowed_fields
    end

    # Filter out nil values (don't clear fields that weren't sent)
    attrs = allowed_fields |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

    case Accounts.update_user_profile(user, attrs) do
      {:ok, updated_user} ->
        subscriber_count = Newsletter.count_subscribers(updated_user.id)
        pending_count = Newsletter.count_pending_subscribers(updated_user.id)
        limit = Newsletter.subscriber_limit(updated_user.subscription_tier)

        json(conn, %{
          data: %{
            newsletter_enabled: updated_user.newsletter_enabled || false,
            newsletter_name: updated_user.newsletter_name,
            newsletter_description: updated_user.newsletter_description,
            newsletter_reply_to: updated_user.newsletter_reply_to,
            subscriber_count: subscriber_count,
            pending_count: pending_count,
            subscriber_limit: limit,
            sends_this_month: Newsletter.count_sends_this_month(updated_user.id),
            send_limit: Newsletter.send_limit(updated_user.subscription_tier)
          }
        })

      {:error, changeset} ->
        conn |> put_status(422) |> json(%{errors: format_errors(changeset)})
    end
  end

  # GET /api/newsletter/subscribers
  def list_subscribers(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 50)
    status = params["status"]

    {subscribers, total} = Newsletter.list_subscribers(user.id,
      page: page, per_page: per_page, status: status)

    json(conn, %{
      data: Enum.map(subscribers, &render_subscriber/1),
      pagination: %{page: page, per_page: per_page, total: total}
    })
  end

  # DELETE /api/newsletter/subscribers/:id
  def remove_subscriber(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Newsletter.remove_subscriber(id, user.id) do
      {:ok, _} -> json(conn, %{ok: true})
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "Subscriber not found"})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "Not your subscriber"})
    end
  end

  # POST /api/newsletter/send
  def send_newsletter(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user
    scheduled_at = params["scheduled_at"]

    # Plus-only: scheduled sends
    if scheduled_at && (user.subscription_tier || "free") != "plus" do
      conn |> put_status(:forbidden) |> json(%{error: "Scheduled sends require Inkwell Plus"})
    else
      case Inkwell.Journals.get_entry(entry_id) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

        entry ->
          if entry.user_id != user.id do
            conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
          else
            if entry.newsletter_sent_at do
              conn |> put_status(422) |> json(%{error: "This entry has already been sent as a newsletter"})
            else
              parsed_scheduled = if scheduled_at do
                case DateTime.from_iso8601(scheduled_at) do
                  {:ok, dt, _} -> dt
                  _ -> nil
                end
              else
                nil
              end

              case Newsletter.create_send(entry, user,
                subject: params["subject"],
                scheduled_at: parsed_scheduled) do
                {:ok, send} ->
                  json(conn, %{data: render_send(send)})

                {:error, :no_subscribers} ->
                  conn |> put_status(422) |> json(%{error: "You have no confirmed subscribers"})

                {:error, :send_limit_exceeded} ->
                  limit = Newsletter.send_limit(user.subscription_tier)
                  conn |> put_status(422) |> json(%{error: "You've reached your monthly limit of #{limit} newsletter sends. #{if (user.subscription_tier || "free") != "plus", do: "Upgrade to Plus for more sends.", else: "Your limit resets at the start of next month."}"})

                {:error, changeset} ->
                  conn |> put_status(422) |> json(%{errors: format_errors(changeset)})
              end
            end
          end
      end
    end
  end

  def send_newsletter(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "entry_id is required"})
  end

  # GET /api/newsletter/sends
  def list_sends(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    # Free users see last 10, Plus see all
    per_page = if (user.subscription_tier || "free") != "plus" do
      min(per_page, 10)
    else
      per_page
    end

    {sends, total} = Newsletter.list_sends(user.id, page: page, per_page: per_page)

    json(conn, %{
      data: Enum.map(sends, &render_send/1),
      pagination: %{page: page, per_page: per_page, total: total}
    })
  end

  # DELETE /api/newsletter/sends/:id
  def cancel_send(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Newsletter.cancel_send(id, user.id) do
      {:ok, send} -> json(conn, %{data: render_send(send)})
      {:error, :cannot_cancel} -> conn |> put_status(422) |> json(%{error: "Can only cancel queued sends"})
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "Send not found"})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "Not your send"})
    end
  end

  # POST /api/newsletter/import
  def import_subscribers(conn, %{"emails" => emails}) when is_list(emails) do
    user = conn.assigns.current_user

    unless user.newsletter_enabled do
      conn |> put_status(:forbidden) |> json(%{error: "Newsletter is not enabled"})
    else
      cap = Newsletter.import_cap(user.subscription_tier)

      if length(emails) > cap do
        conn |> put_status(422) |> json(%{error: "Too many emails. Maximum #{cap} per import for your plan."})
      else
        case Newsletter.import_subscribers(user.id, emails, user.subscription_tier) do
          {:ok, result} ->
            # Enqueue confirmation email worker if there are new subscribers
            if result.imported > 0 do
              %{writer_id: user.id, subscriber_ids: result.new_subscriber_ids}
              |> Inkwell.Workers.NewsletterImportWorker.new()
              |> Oban.insert()
            end

            json(conn, %{
              data: %{
                imported: result.imported,
                skipped: result.skipped,
                invalid: result.invalid
              }
            })

          {:error, reason} ->
            conn |> put_status(422) |> json(%{error: inspect(reason)})
        end
      end
    end
  end

  def import_subscribers(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "emails list is required"})
  end

  # GET /api/newsletter/stats
  def stats(conn, _params) do
    user = conn.assigns.current_user
    subscriber_count = Newsletter.count_subscribers(user.id)
    pending_count = Newsletter.count_pending_subscribers(user.id)
    limit = Newsletter.subscriber_limit(user.subscription_tier)

    json(conn, %{
      data: %{
        subscriber_count: subscriber_count,
        pending_count: pending_count,
        subscriber_limit: limit,
        newsletter_enabled: user.newsletter_enabled || false,
        sends_this_month: Newsletter.count_sends_this_month(user.id),
        send_limit: Newsletter.send_limit(user.subscription_tier)
      }
    })
  end

  # ── Renderers ──

  defp render_subscriber(sub) do
    %{
      id: sub.id,
      email: sub.email,
      status: sub.status,
      source: sub.source,
      confirmed_at: sub.confirmed_at,
      unsubscribed_at: sub.unsubscribed_at,
      created_at: sub.inserted_at
    }
  end

  defp render_send(send) do
    %{
      id: send.id,
      entry_id: send.entry_id,
      subject: send.subject,
      status: send.status,
      recipient_count: send.recipient_count,
      sent_count: send.sent_count,
      failed_count: send.failed_count,
      scheduled_at: send.scheduled_at,
      started_at: send.started_at,
      completed_at: send.completed_at,
      created_at: send.inserted_at,
      entry: if(Ecto.assoc_loaded?(send.entry) && send.entry, do: %{
        id: send.entry.id,
        title: send.entry.title,
        slug: send.entry.slug
      }, else: nil)
    }
  end

  # ── Helpers ──

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> default
    end
  end
  defp parse_int(val, _default) when is_integer(val), do: val

  defp format_errors(%Ecto.Changeset{} = changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
  defp format_errors(error) when is_binary(error), do: error
  defp format_errors(_), do: "Unknown error"
end
