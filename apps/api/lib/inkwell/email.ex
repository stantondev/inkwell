defmodule Inkwell.Email do
  @moduledoc """
  Sends transactional emails via SMTP or the Resend API.

  Provider selection:
  - If SMTP_HOST is configured → uses SMTP (via gen_smtp)
  - If RESEND_API_KEY is configured → uses Resend HTTP API
  - If neither → dev mode (logs links to console, no email sent)
  """
  require Logger

  @resend_url "https://api.resend.com/emails"
  @resend_batch_url "https://api.resend.com/emails/batch"

  # ── Public API ──

  @doc "Send a magic link email to the given address."
  def send_magic_link(to_email, magic_link_url) do
    case do_send_email(to_email, "Sign in to Inkwell", magic_link_html(magic_link_url)) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — magic link: #{magic_link_url}")
        {:ok, :no_email_configured, magic_link_url}

      result ->
        result
    end
  end

  @doc "Send a feedback email from a user to the Inkwell team."
  def send_feedback(user, category, message) do
    feedback_to = Application.get_env(:inkwell, :feedback_email, "stanton@inkwell.social")
    subject = "[Inkwell Feedback] #{String.capitalize(category)} from @#{user.username}"

    case do_send_email(feedback_to, subject, feedback_html(user, category, message)) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — feedback from #{user.username}: [#{category}] #{message}")
        {:ok, :no_email_configured}

      result ->
        result
    end
  end

  @doc "Send an email notifying the user their data export is ready for download."
  def send_export_ready(to_email, settings_url) do
    case do_send_email(to_email, "Your Inkwell data export is ready", export_ready_html(settings_url)) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — export ready notification for #{to_email}")
        {:ok, :no_email_configured}

      result ->
        result
    end
  end

  @doc "Send a newsletter subscription confirmation email (double opt-in)."
  def send_newsletter_confirmation(to_email, writer, confirm_url) do
    writer_name = writer.display_name || writer.username
    subject = "Confirm your subscription to #{writer_name}'s newsletter"

    case do_send_email(to_email, subject, newsletter_confirmation_html(writer_name, confirm_url)) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — newsletter confirm link: #{confirm_url}")
        {:ok, :no_email_configured, confirm_url}

      result ->
        result
    end
  end

  @doc "Send an invite 'sealed letter' email to a friend."
  def send_invite_email(to_email, inviter, invite_url, message) do
    inviter_name = inviter.display_name || inviter.username
    subject = "You've received a letter from @#{inviter.username} on Inkwell"

    case do_send_email(to_email, subject, invite_html(inviter, inviter_name, invite_url, message)) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — invite email for #{to_email}: #{invite_url}")
        {:ok, :no_email_configured}

      result ->
        result
    end
  end

  @doc "Send a comment/reply/mention email notification to a user."
  def send_comment_notification(user, actor_name, type, entry_title, entry_url) do
    subject = build_notification_subject(type, actor_name, entry_title)
    unsubscribe_url = build_unsubscribe_url(user.id)

    html = comment_notification_html(actor_name, type, entry_title, entry_url, unsubscribe_url)

    headers = %{
      "List-Unsubscribe" => "<#{unsubscribe_url}>",
      "List-Unsubscribe-Post" => "List-Unsubscribe=One-Click"
    }

    case do_send_email(user.email, subject, html, headers: headers) do
      {:ok, :no_email_configured} ->
        Logger.warning("No email configured — comment notification for #{user.email}")
        {:ok, :no_email_configured}

      result ->
        result
    end
  end

  @doc "Send a batch of emails. Max 100 per call for Resend; SMTP sends sequentially."
  def send_batch(emails) when is_list(emails) do
    case email_provider() do
      :smtp ->
        Inkwell.Email.SmtpAdapter.send_batch(emails)

      :resend ->
        send_batch_via_resend(emails)

      :none ->
        Logger.warning("No email configured — skipping batch of #{length(emails)} emails")
        {:ok, length(emails)}
    end
  end

  @doc """
  Build the HTML for a newsletter email from a journal entry.
  The `{{UNSUBSCRIBE_URL}}` placeholder must be replaced per-recipient by the delivery worker.
  """
  def build_newsletter_html(entry, writer) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
    api_url = Application.get_env(:inkwell, :api_url, "http://localhost:4000")
    writer_name = writer.display_name || writer.username
    newsletter_name = writer.newsletter_name || "#{writer_name}'s Newsletter"
    avatar_url = if writer.avatar_url, do: "#{api_url}/api/avatars/#{writer.username}", else: nil
    entry_url = "#{frontend_url}/#{writer.username}/#{entry.slug}"
    profile_url = "#{frontend_url}/#{writer.username}"

    # Rewrite relative image URLs to absolute
    body_html = (entry.body_html || "")
    |> String.replace(~r{src="/api/images/}, "src=\"#{api_url}/api/images/")
    |> String.replace(~r{src="/api/avatars/}, "src=\"#{api_url}/api/avatars/")

    date_str = if entry.published_at do
      Calendar.strftime(entry.published_at, "%B %d, %Y")
    else
      Calendar.strftime(DateTime.utc_now(), "%B %d, %Y")
    end

    reading_time = max(1, div(entry.word_count || 0, 250))

    cover_image_html = if entry.cover_image_id do
      """
      <img src="#{api_url}/api/images/#{entry.cover_image_id}" alt="" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 8px; margin-bottom: 24px;" />
      """
    else
      ""
    end

    avatar_html = if avatar_url do
      """
      <td style="padding-right: 12px; vertical-align: middle;">
        <img src="#{avatar_url}" width="40" height="40" alt="" style="border-radius: 50%; display: block;" />
      </td>
      """
    else
      ""
    end

    """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Georgia, 'Times New Roman', serif; background: #faf9f6; color: #333; margin: 0; padding: 0;">
      <div style="display:none;max-height:0;overflow:hidden;">#{escape_html(entry.excerpt || "")}</div>
      <div style="max-width: 600px; margin: 0 auto; padding: 32px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
          <tr>
            #{avatar_html}
            <td style="vertical-align: middle;">
              <div style="font-weight: 600; color: #1a1a1a; font-size: 15px;">#{escape_html(writer_name)}</div>
              <div style="font-size: 13px; color: #888;">#{escape_html(newsletter_name)}</div>
            </td>
          </tr>
        </table>

        <h1 style="font-size: 26px; line-height: 1.3; color: #1a1a1a; margin: 0 0 8px; font-family: Georgia, 'Times New Roman', serif;">
          #{escape_html(entry.title || "New post")}
        </h1>

        <div style="font-size: 13px; color: #888; margin-bottom: 24px;">
          #{date_str} &middot; #{reading_time} min read
        </div>

        #{cover_image_html}

        <div style="font-size: 17px; line-height: 1.7; color: #333;">
          #{body_html}
        </div>

        <div style="margin-top: 32px; text-align: center;">
          <a href="#{entry_url}" style="display: inline-block; background: #2d4a8a; color: #fff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Read on Inkwell
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
          <p style="margin: 0 0 8px;">
            You received this because you subscribed to #{escape_html(writer_name)}'s newsletter on
            <a href="https://inkwell.social" style="color: #2d4a8a; text-decoration: none;">Inkwell</a>.
          </p>
          <p style="margin: 0;">
            <a href="{{UNSUBSCRIBE_URL}}" style="color: #999; text-decoration: underline;">Unsubscribe</a> &middot;
            <a href="#{profile_url}" style="color: #999; text-decoration: underline;">View profile</a>
          </p>
        </div>
      </div>
    </body>
    </html>
    """
  end

  # ── Email Provider Dispatch ──

  defp email_provider do
    cond do
      Application.get_env(:inkwell, :smtp) != nil -> :smtp
      has_resend_key?() -> :resend
      true -> :none
    end
  end

  defp has_resend_key? do
    key = Application.get_env(:inkwell, :resend_api_key)
    not is_nil(key) and key != ""
  end

  defp do_send_email(to, subject, html, opts \\ []) do
    from = opts[:from] || Application.get_env(:inkwell, :from_email, "Inkwell <noreply@inkwell.social>")
    extra_headers = opts[:headers] || %{}

    case email_provider() do
      :smtp ->
        Inkwell.Email.SmtpAdapter.send_email(to, subject, html, Keyword.put(opts, :from, from))

      :resend ->
        send_via_resend(to, subject, html, from, extra_headers)

      :none ->
        {:ok, :no_email_configured}
    end
  end

  defp send_via_resend(to, subject, html, from, extra_headers \\ %{}) do
    api_key = Application.get_env(:inkwell, :resend_api_key)

    payload = %{
      from: from,
      to: [to],
      subject: subject,
      html: html
    }

    payload =
      if map_size(extra_headers) > 0 do
        Map.put(payload, :headers, extra_headers)
      else
        payload
      end

    body = Jason.encode!(payload)

    headers = [
      {~c"authorization", ~c"Bearer #{api_key}"},
      {~c"content-type", ~c"application/json"}
    ]

    :ssl.start()
    :inets.start()

    case :httpc.request(
           :post,
           {~c"#{@resend_url}", headers, ~c"application/json", body},
           [ssl: [{:verify, :verify_peer}, {:cacerts, :public_key.cacerts_get()}, {:depth, 3}]],
           []
         ) do
      {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
        {:ok, :sent}

      {:ok, {{_, status, _}, _headers, resp_body}} ->
        Logger.error("Resend API error #{status}: #{to_string(resp_body)}")
        {:error, {:resend_error, status, to_string(resp_body)}}

      {:error, reason} ->
        Logger.error("Resend HTTP error: #{inspect(reason)}")
        {:error, :send_failed}
    end
  end

  defp send_batch_via_resend(emails) do
    api_key = Application.get_env(:inkwell, :resend_api_key)

    body = Jason.encode!(emails)

    headers = [
      {~c"authorization", ~c"Bearer #{api_key}"},
      {~c"content-type", ~c"application/json"}
    ]

    :ssl.start()
    :inets.start()

    case :httpc.request(
           :post,
           {~c"#{@resend_batch_url}", headers, ~c"application/json", body},
           [ssl: [{:verify, :verify_peer}, {:cacerts, :public_key.cacerts_get()}, {:depth, 3}]],
           []
         ) do
      {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
        {:ok, length(emails)}

      {:ok, {{_, status, _}, _headers, resp_body}} ->
        Logger.error("Resend batch API error #{status}: #{to_string(resp_body)}")
        {:error, 0, length(emails)}

      {:error, reason} ->
        Logger.error("Resend batch HTTP error: #{inspect(reason)}")
        {:error, 0, length(emails)}
    end
  end

  # ── HTML Templates ──

  defp escape_html(nil), do: ""
  defp escape_html(text) do
    text
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end

  defp newsletter_confirmation_html(writer_name, confirm_url) do
    """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Georgia, 'Times New Roman', serif; background: #faf9f6; color: #333; margin: 0; padding: 40px 20px;">
      <div style="max-width: 460px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 40px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 8px; color: #1a1a1a; font-weight: 600;">Inkwell</div>
        <p style="color: #666; margin-bottom: 24px; font-size: 16px;">Confirm your subscription</p>
        <p style="color: #333; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          You've been invited to subscribe to <strong>#{escape_html(writer_name)}'s</strong> newsletter on Inkwell.
          Click the button below to confirm.
        </p>
        <a href="#{confirm_url}"
           style="display: inline-block; background: #2d4a8a; color: #fff; text-decoration: none;
                  padding: 14px 32px; border-radius: 24px; font-weight: 600; font-size: 16px;">
          Confirm Subscription
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 32px; line-height: 1.5;">
          This link expires in 7 days.<br/>
          If you didn't request this, you can safely ignore it.
        </p>
      </div>
    </body>
    </html>
    """
  end

  defp feedback_html(user, category, message) do
    category_label = case category do
      "bug" -> "Bug Report"
      "feature" -> "Feature Request"
      _ -> "General Feedback"
    end

    escaped_message = message
      |> String.replace("&", "&amp;")
      |> String.replace("<", "&lt;")
      |> String.replace(">", "&gt;")
      |> String.replace("\n", "<br/>")

    """
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background: #25253e; border-radius: 16px; padding: 40px;">
        <h1 style="font-size: 20px; margin-bottom: 4px; color: #fff;">New Feedback</h1>
        <p style="color: #a0a0b8; margin-bottom: 24px; font-size: 14px;">#{category_label} from <strong>@#{user.username}</strong> (#{user.email})</p>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
          <p style="color: #e0e0e0; font-size: 15px; line-height: 1.6; margin: 0;">#{escaped_message}</p>
        </div>
        <p style="color: #707088; font-size: 12px; margin-top: 24px;">
          Sent from Inkwell Feedback &middot; #{DateTime.utc_now() |> Calendar.strftime("%b %d, %Y at %H:%M UTC")}
        </p>
      </div>
    </body>
    </html>
    """
  end

  defp magic_link_html(url) do
    """
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
      <div style="max-width: 460px; margin: 0 auto; background: #25253e; border-radius: 16px; padding: 40px; text-align: center;">
        <h1 style="font-size: 24px; margin-bottom: 8px; color: #fff;">✏️ inkwell</h1>
        <p style="color: #a0a0b8; margin-bottom: 32px;">Sign in to your journal</p>
        <a href="#{url}"
           style="display: inline-block; background: #7c5bf0; color: #fff; text-decoration: none;
                  padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">
          Sign in to Inkwell
        </a>
        <p style="color: #707088; font-size: 13px; margin-top: 32px; line-height: 1.5;">
          This link expires in 15 minutes.<br/>
          If you didn't request this, you can safely ignore it.
        </p>
      </div>
    </body>
    </html>
    """
  end

  defp export_ready_html(settings_url) do
    """
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
      <div style="max-width: 460px; margin: 0 auto; background: #25253e; border-radius: 16px; padding: 40px; text-align: center;">
        <h1 style="font-size: 24px; margin-bottom: 8px; color: #fff;">✏️ inkwell</h1>
        <p style="color: #a0a0b8; margin-bottom: 32px;">Your data export is ready</p>
        <p style="color: #e0e0e0; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          Your Inkwell data export has been generated and is ready for download.
          Visit your Settings page to download the file.
        </p>
        <a href="#{settings_url}"
           style="display: inline-block; background: #7c5bf0; color: #fff; text-decoration: none;
                  padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">
          Go to Settings
        </a>
        <p style="color: #707088; font-size: 13px; margin-top: 32px; line-height: 1.5;">
          This download link expires in 48 hours.<br/>
          After that, you can request a new export anytime.
        </p>
      </div>
    </body>
    </html>
    """
  end

  defp build_notification_subject("comment", actor, title),
    do: "#{actor} commented on \"#{truncate(title, 50)}\""
  defp build_notification_subject("reply", actor, _title),
    do: "#{actor} replied to your comment"
  defp build_notification_subject("mention", actor, title),
    do: "#{actor} mentioned you on \"#{truncate(title, 50)}\""
  defp build_notification_subject("feedback_mention", actor, _title),
    do: "#{actor} mentioned you on the roadmap"
  defp build_notification_subject("poll_mention", actor, _title),
    do: "#{actor} mentioned you in a poll comment"
  defp build_notification_subject("circle_mention", actor, title),
    do: "#{actor} mentioned you in #{truncate(title, 50)}"
  defp build_notification_subject(_, actor, _title),
    do: "#{actor} interacted with your content"

  defp truncate(nil, _), do: "an entry"
  defp truncate(text, max) when byte_size(text) <= max, do: text
  defp truncate(text, max), do: String.slice(text, 0, max) <> "..."

  defp build_unsubscribe_url(user_id) do
    token = Phoenix.Token.sign(InkwellWeb.Endpoint, "email_unsub", user_id)
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
    "#{frontend_url}/api/email-notifications/unsubscribe?token=#{token}"
  end

  defp build_notification_type_text("comment", actor), do: "#{escape_html(actor)} commented on your entry"
  defp build_notification_type_text("reply", actor), do: "#{escape_html(actor)} replied to your comment"
  defp build_notification_type_text("mention", actor), do: "#{escape_html(actor)} mentioned you in a comment"
  defp build_notification_type_text("feedback_mention", actor), do: "#{escape_html(actor)} mentioned you on the roadmap"
  defp build_notification_type_text("poll_mention", actor), do: "#{escape_html(actor)} mentioned you in a poll comment"
  defp build_notification_type_text("circle_mention", actor), do: "#{escape_html(actor)} mentioned you in a circle discussion"
  defp build_notification_type_text(_, actor), do: "#{escape_html(actor)} interacted with your content"

  defp comment_notification_html(actor_name, type, entry_title, entry_url, unsubscribe_url) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
    escaped_title = escape_html(entry_title || "an entry")
    body_text = build_notification_type_text(type, actor_name)

    """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Georgia, 'Times New Roman', serif; background: #faf9f6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 500px; margin: 0 auto; padding: 32px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #2d4a8a; letter-spacing: 0.1em; text-transform: uppercase;">Inkwell</div>
        </div>

        <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 28px;">
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin: 0 0 16px;">
            #{body_text}
          </p>

          <div style="background: #f8f6f2; border-left: 3px solid #2d4a8a; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <p style="font-size: 15px; color: #1a1a1a; margin: 0; font-weight: 600;">
              #{escaped_title}
            </p>
          </div>

          <div style="text-align: center;">
            <a href="#{entry_url}"
               style="display: inline-block; background: #2d4a8a; color: #fff; text-decoration: none;
                      padding: 12px 28px; border-radius: 24px; font-weight: 600; font-size: 15px;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
              View on Inkwell
            </a>
          </div>
        </div>

        <div style="margin-top: 32px; font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
          <p style="margin: 0 0 8px;">
            You received this because you have email notifications enabled on
            <a href="#{frontend_url}" style="color: #2d4a8a; text-decoration: none;">Inkwell</a>.
          </p>
          <p style="margin: 0;">
            <a href="#{unsubscribe_url}" style="color: #999; text-decoration: underline;">Unsubscribe from email notifications</a>
          </p>
        </div>
      </div>
    </body>
    </html>
    """
  end

  defp invite_html(inviter, inviter_name, invite_url, message) do
    api_url = Application.get_env(:inkwell, :api_url, "http://localhost:4000")
    avatar_url = "#{api_url}/api/avatars/#{inviter.username}"
    escaped_name = escape_html(inviter_name)
    escaped_username = escape_html(inviter.username)

    message_block =
      if message && String.trim(message) != "" do
        escaped_message = escape_html(message)
        """
        <div style="background: #f5f0e6; border-left: 3px solid #2d4a8a; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <p style="font-family: Georgia, serif; font-style: italic; color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0;">
            &ldquo;#{escaped_message}&rdquo;
          </p>
        </div>
        """
      else
        ""
      end

    """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Georgia, serif; background: #faf9f6; color: #333; padding: 40px 20px; margin: 0;">
      <div style="max-width: 460px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e8e4de;">
        <div style="text-align: center; margin-bottom: 32px;">
          <p style="font-family: Georgia, serif; font-size: 14px; color: #2d4a8a; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 8px 0;">Inkwell</p>
          <h1 style="font-family: Georgia, serif; font-size: 22px; color: #2d4a8a; margin: 0 0 12px 0; font-weight: normal;">
            You&rsquo;ve received a sealed letter
          </h1>
          <hr style="border: none; border-top: 1px solid #e8e4de; margin: 0 80px; position: relative;" />
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <img src="#{avatar_url}" alt="" width="48" height="48"
               style="border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 12px;" />
          <p style="font-size: 16px; color: #333; margin: 12px 0 0 0;">
            <strong>@#{escaped_username}</strong> invites you to join Inkwell
          </p>
        </div>

        #{message_block}

        <p style="font-size: 15px; color: #666; line-height: 1.6; text-align: center; margin-bottom: 32px;">
          Inkwell is a social journal &mdash; a place to write, share, and connect on the open social web. No algorithms, no ads, your space.
        </p>

        <div style="text-align: center; margin-bottom: 32px;">
          <a href="#{invite_url}"
             style="display: inline-block; background: #2d4a8a; color: #fff; text-decoration: none;
                    padding: 14px 32px; border-radius: 24px; font-weight: 600; font-size: 16px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            Break the seal &amp; join
          </a>
        </div>

        <p style="color: #999; font-size: 12px; text-align: center; line-height: 1.5; margin-top: 24px;">
          Sent by @#{escaped_username} via Inkwell. This link expires in 30 days.<br/>
          If you don&rsquo;t know #{escaped_name}, you can safely ignore this.
        </p>
      </div>
    </body>
    </html>
    """
  end
end
