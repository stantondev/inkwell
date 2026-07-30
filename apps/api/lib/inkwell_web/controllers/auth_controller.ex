defmodule InkwellWeb.AuthController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts
  alias Inkwell.Auth
  alias Inkwell.Auth.LoginHandoff
  alias Inkwell.FraudDetection
  alias Inkwell.Invitations

  require Logger

  # POST /api/auth/magic-link
  def send_magic_link(conn, %{"email" => email} = params) do
    # Honeypot: if the hidden "website" field is filled, silently reject (bots fill hidden fields)
    if params["website"] && params["website"] != "" do
      json(conn, %{ok: true})
    else
      email = String.downcase(String.trim(email))
      terms_accepted = params["terms_accepted"] == true
      existing_user = Accounts.get_user_by_email(email)

      cond do
        # Block disposable email signups (but allow existing users to log in)
        is_nil(existing_user) && FraudDetection.disposable_email?(email) ->
          # Silently succeed — same pattern as honeypot, don't reveal the block
          json(conn, %{ok: true})

        # New user must accept terms
        is_nil(existing_user) && !terms_accepted ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "You must accept the Terms of Service and Privacy Policy to create an account"})

        true ->
        result =
          case existing_user do
            nil ->
              username = derive_username(email)

              case Accounts.create_user(%{
                email: email,
                username: unique_username(username),
                display_name: username
              }) do
                {:ok, new_user} ->
                  # Track invite attribution
                  maybe_accept_invite(new_user, params)

                  case Accounts.set_terms_accepted(new_user) do
                    {:ok, accepted_user} -> {:ok, accepted_user}
                    {:error, _changeset} -> {:ok, new_user}
                  end

                {:error, changeset} ->
                  {:error, changeset}
              end

            existing ->
              if terms_accepted && is_nil(existing.terms_accepted_at) do
                case Accounts.set_terms_accepted(existing) do
                  {:ok, updated} -> {:ok, updated}
                  {:error, _} -> {:ok, existing}
                end
              else
                {:ok, existing}
              end
          end

        case result do
          {:ok, user} ->
            # Create token in Postgres
            token = Auth.create_magic_link_token(user.id)

            # Create a login handoff ID for PWA cross-context auth
            login_session_id = LoginHandoff.create_handoff()

            # Magic link goes to Next.js /auth/verify, which calls Phoenix back server-side.
            # Include lsid so the verify step can complete the handoff for PWA polling.
            magic_link = "#{frontend_url()}/auth/verify?token=#{token}&lsid=#{login_session_id}"

            # Send the email (or fall back to dev mode if no API key)
            case Inkwell.Email.send_magic_link(email, magic_link) do
              {:ok, :sent} ->
                json(conn, %{ok: true, login_session_id: login_session_id})

              {:ok, :no_email_configured, _link} ->
                # No email service configured — return the link directly for dev/testing
                json(conn, %{ok: true, dev_magic_link: magic_link, login_session_id: login_session_id})

              {:error, reason} ->
                # Email is configured but delivery failed. Do NOT return the
                # magic link here: the frontend renders `dev_magic_link` as a
                # clickable "sign in instantly" box, so anyone who could induce
                # a send failure for someone else's address would be handed a
                # working session for that account. The {:ok, :no_email_configured}
                # branch above is the only legitimate source of that field.
                Logger.error("Magic link delivery failed for #{email}: #{inspect(reason)}")

                conn
                |> put_status(:internal_server_error)
                |> json(%{
                  error:
                    "We couldn't send your sign-in email just now. Please try again in a moment."
                })
            end

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: format_changeset_errors(changeset)})
        end
      end
    end
  end

  def send_magic_link(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "email is required"})
  end

  # GET /api/auth/verify?token=TOKEN&lsid=LOGIN_SESSION_ID
  # Called server-side by Next.js /auth/verify route handler.
  # Returns a long-lived API token instead of a session cookie redirect.
  # Optional lsid completes a PWA login handoff so the PWA can claim the session.
  def verify_magic_link(conn, %{"token" => token} = params) do
    case Auth.verify_magic_link_token(token) do
      :error ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid or expired magic link"})

      {:ok, user_id} ->
        user = Accounts.get_user!(user_id)
        Accounts.touch_last_active(user.id)

        # Create a long-lived API session token in Postgres
        api_token = Auth.create_api_session_token(user.id)

        # Complete the PWA login handoff if lsid was provided
        if lsid = params["lsid"] do
          LoginHandoff.complete_handoff(lsid, api_token, render_user(user))
        end

        json(conn, %{
          ok: true,
          token: api_token,
          user: render_user(user)
        })
    end
  end

  def verify_magic_link(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "token is required"})
  end

  # GET /api/auth/verify-email — verify email change token (public, no auth required)
  def verify_email_change(conn, %{"token" => token}) do
    case Auth.verify_email_change_token(token) do
      :error ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid or expired verification link"})

      {:ok, user_id, new_email} ->
        case Accounts.get_user_admin(user_id) do
          nil ->
            conn |> put_status(:not_found) |> json(%{error: "User not found"})

          user ->
            # Re-check email uniqueness (race condition protection)
            case Accounts.get_user_by_email(new_email) do
              nil ->
                case Accounts.update_user_email(user, new_email) do
                  {:ok, _updated} ->
                    json(conn, %{ok: true, email: new_email})

                  {:error, _changeset} ->
                    conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update email"})
                end

              _existing ->
                conn |> put_status(:conflict) |> json(%{error: "This email is already in use by another account"})
            end
        end
    end
  end

  def verify_email_change(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "token is required"})
  end

  # GET /api/auth/me  (requires Bearer token via RequireAuth plug)
  def me(conn, _params) do
    user = conn.assigns.current_user
    unread_count = Accounts.count_unread_notifications(user.id)
    draft_count = Inkwell.Journals.count_drafts(user.id)
    series_count = Inkwell.Journals.count_series(user.id)
    unread_letter_count = Inkwell.Letters.count_unread_letters(user.id)

    # Skip newsletter counts entirely for users who haven't enabled the
    # newsletter (the vast majority). Saves 2 queries per /api/auth/me poll.
    newsletter_fields =
      if user.newsletter_enabled do
        %{
          newsletter_enabled: true,
          subscriber_count: Inkwell.Newsletter.count_subscribers(user.id),
          sends_this_month: Inkwell.Newsletter.count_sends_this_month(user.id),
          send_limit:
            Inkwell.Newsletter.send_limit(Inkwell.SelfHosted.effective_tier(user))
        }
      else
        %{
          newsletter_enabled: false,
          subscriber_count: 0,
          sends_this_month: 0,
          send_limit: 0
        }
      end

    json(conn, %{
      data:
        render_user(user)
        |> Map.put(:unread_notification_count, unread_count)
        |> Map.put(:draft_count, draft_count)
        |> Map.put(:series_count, series_count)
        |> Map.put(:unread_letter_count, unread_letter_count)
        |> Map.merge(newsletter_fields)
    })
  end

  # DELETE /api/auth/session
  def sign_out(conn, _params) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] ->
        Auth.revoke_api_session_token(String.trim(token))
      _ -> :ok
    end

    conn |> clear_session() |> json(%{ok: true})
  end

  # GET /api/auth/claim-session?id=LOGIN_SESSION_ID
  # Called by PWA to claim a completed login handoff.
  # Returns the session token if the magic link was verified in the browser.
  def claim_session(conn, %{"id" => id}) when is_binary(id) and byte_size(id) > 0 do
    case LoginHandoff.claim_handoff(id) do
      {:ok, token, user_data} ->
        json(conn, %{ok: true, token: token, user: user_data})

      :pending ->
        json(conn, %{pending: true})

      :not_found ->
        conn |> put_status(:not_found) |> json(%{expired: true})
    end
  end

  def claim_session(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "id is required"})
  end

  # ── Helpers ─────────────────────────────────────────────────────────────────

  defp render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username,
      avatar_url: user.avatar_url,
      avatar_config: user.avatar_config,
      avatar_frame: user.avatar_frame,
      avatar_animation: user.avatar_animation,
      profile_effect: user.profile_effect,
      profile_effect_intensity: user.profile_effect_intensity,
      bio: user.bio,
      bio_html: user.bio_html,
      pronouns: user.pronouns,
      ap_id: user.ap_id,
      created_at: user.inserted_at,
      is_admin: Accounts.is_admin?(user),
      settings: user.settings || %{},
      subscription_tier: Inkwell.SelfHosted.effective_tier(user),
      self_hosted: Inkwell.SelfHosted.enabled?(),
      terms_accepted_at: user.terms_accepted_at,
      invite_count: Invitations.count_accepted(user.id),
      ink_donor_status: user.ink_donor_status,
      ink_donor_amount_cents: user.ink_donor_amount_cents,
      has_writer_plan: Inkwell.WriterSubscriptions.has_active_plan?(user.id),
      preferred_language: user.preferred_language,
      post_email_enabled: not is_nil(user.post_email_token),
      needs_resubscribe: needs_resubscribe?(user)
    }
  end

  # Detects users who had active Stripe subscriptions (Plus or Donor)
  # but haven't re-subscribed on Square after the processor migration.
  # Returns false if user dismissed the banner via settings.
  defp needs_resubscribe?(user) do
    dismissed = get_in(user.settings || %{}, ["resubscribe_dismissed"]) == true

    if dismissed do
      false
    else
      had_stripe =
        not is_nil(user.stripe_subscription_id) or
        not is_nil(user.ink_donor_stripe_subscription_id)

      has_square =
        not is_nil(user.square_subscription_id) or
        not is_nil(user.square_donor_subscription_id)

      had_stripe and not has_square
    end
  end

  defp derive_username(email) do
    email
    |> String.split("@")
    |> List.first()
    |> String.replace(~r/[^a-zA-Z0-9_]/, "_")
    |> String.slice(0, 25)
  end

  # A derived username is only usable if it satisfies the same rules
  # registration_changeset enforces. This used to check uniqueness ONLY, so
  # anyone whose email local-part was reserved (support@, admin@, noreply@, or
  # anything starting with "inkwell") or shorter than 3 characters (jo@, jd@)
  # got "username is reserved" / "must be 3-30 characters" on a signup form
  # that has no username field — with no way to correct it. Those addresses
  # could never create an account at all.
  defp acceptable_username?(name) do
    String.match?(name, ~r/^[a-zA-Z0-9_]{3,30}$/) and not Accounts.User.reserved_username?(name)
  end

  defp usable_username?(name) do
    acceptable_username?(name) and is_nil(Accounts.get_user_by_username(name))
  end

  defp unique_username(base, attempts \\ 0)

  # Appending digits can't rescue a protected prefix — "inkwellfan_1234" is
  # still reserved — so fall back to a generated name rather than loop.
  defp unique_username(_base, attempts) when attempts >= 5, do: "user_#{:rand.uniform(999_999)}"

  defp unique_username(base, 0) do
    if usable_username?(base), do: base, else: unique_username(base, 1)
  end

  defp unique_username(base, attempts) do
    candidate = "#{base}_#{:rand.uniform(9999)}"
    if usable_username?(candidate), do: candidate, else: unique_username(base, attempts + 1)
  end

  defp format_changeset_errors(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
    |> Enum.map_join("; ", fn {field, errors} ->
      "#{field} #{Enum.join(errors, ", ")}"
    end)
  end

  defp maybe_accept_invite(new_user, params) do
    cond do
      invite_token = params["invite_token"] ->
        Invitations.accept_by_token(invite_token, new_user.id)

      invite_code = params["invite_code"] ->
        Invitations.accept_by_code(invite_code, new_user.id)

      true ->
        :ok
    end
  end

  defp frontend_url do
    Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
  end
end
