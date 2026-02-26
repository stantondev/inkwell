defmodule Inkwell.Email do
  @moduledoc """
  Sends transactional emails via the Resend API.
  Requires RESEND_API_KEY to be set in the environment.
  """

  @resend_url "https://api.resend.com/emails"
  @resend_batch_url "https://api.resend.com/emails/batch"

  @doc "Send a magic link email to the given address."
  def send_magic_link(to_email, magic_link_url) do
    api_key = Application.get_env(:inkwell, :resend_api_key)
    from_email = Application.get_env(:inkwell, :from_email, "Inkwell <noreply@inkwell.social>")

    if is_nil(api_key) or api_key == "" do
      # No API key configured — log and return the link for dev/testing
      require Logger
      Logger.warning("RESEND_API_KEY not set — magic link: #{magic_link_url}")
      {:ok, :no_email_configured, magic_link_url}
    else
      body = Jason.encode!(%{
        from: from_email,
        to: [to_email],
        subject: "Sign in to Inkwell",
        html: magic_link_html(magic_link_url)
      })

      headers = [
        {~c"authorization", ~c"Bearer #{api_key}"},
        {~c"content-type", ~c"application/json"}
      ]

      # Ensure ssl/inets are started for :httpc
      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {~c"#{@resend_url}", headers, ~c"application/json", body},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
          {:ok, :sent}

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          require Logger
          Logger.error("Resend API error #{status}: #{to_string(resp_body)}")
          {:error, {:resend_error, status, to_string(resp_body)}}

        {:error, reason} ->
          require Logger
          Logger.error("Resend HTTP error: #{inspect(reason)}")
          {:error, :send_failed}
      end
    end
  end

  @doc "Send a feedback email from a user to the Inkwell team."
  def send_feedback(user, category, message) do
    api_key = Application.get_env(:inkwell, :resend_api_key)
    from_email = Application.get_env(:inkwell, :from_email, "Inkwell <noreply@inkwell.social>")
    feedback_to = Application.get_env(:inkwell, :feedback_email, "stanton@inkwell.social")

    if is_nil(api_key) or api_key == "" do
      require Logger
      Logger.warning("RESEND_API_KEY not set — feedback from #{user.username}: [#{category}] #{message}")
      {:ok, :no_email_configured}
    else
      body = Jason.encode!(%{
        from: from_email,
        to: [feedback_to],
        subject: "[Inkwell Feedback] #{String.capitalize(category)} from @#{user.username}",
        html: feedback_html(user, category, message)
      })

      headers = [
        {~c"authorization", ~c"Bearer #{api_key}"},
        {~c"content-type", ~c"application/json"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {~c"#{@resend_url}", headers, ~c"application/json", body},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
          {:ok, :sent}

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          require Logger
          Logger.error("Resend API error #{status}: #{to_string(resp_body)}")
          {:error, {:resend_error, status, to_string(resp_body)}}

        {:error, reason} ->
          require Logger
          Logger.error("Resend HTTP error: #{inspect(reason)}")
          {:error, :send_failed}
      end
    end
  end

  @doc "Send an email notifying the user their data export is ready for download."
  def send_export_ready(to_email, settings_url) do
    api_key = Application.get_env(:inkwell, :resend_api_key)
    from_email = Application.get_env(:inkwell, :from_email, "Inkwell <noreply@inkwell.social>")

    if is_nil(api_key) or api_key == "" do
      require Logger
      Logger.warning("RESEND_API_KEY not set — export ready notification for #{to_email}")
      {:ok, :no_email_configured}
    else
      body = Jason.encode!(%{
        from: from_email,
        to: [to_email],
        subject: "Your Inkwell data export is ready",
        html: export_ready_html(settings_url)
      })

      headers = [
        {~c"authorization", ~c"Bearer #{api_key}"},
        {~c"content-type", ~c"application/json"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {~c"#{@resend_url}", headers, ~c"application/json", body},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
          {:ok, :sent}

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          require Logger
          Logger.error("Resend API error #{status}: #{to_string(resp_body)}")
          {:error, {:resend_error, status, to_string(resp_body)}}

        {:error, reason} ->
          require Logger
          Logger.error("Resend HTTP error: #{inspect(reason)}")
          {:error, :send_failed}
      end
    end
  end

  # ── Newsletter Email Functions ──

  @doc "Send a batch of emails via Resend's batch API. Max 100 per call."
  def send_batch(emails) when is_list(emails) do
    api_key = Application.get_env(:inkwell, :resend_api_key)

    if is_nil(api_key) or api_key == "" do
      require Logger
      Logger.warning("RESEND_API_KEY not set — skipping batch of #{length(emails)} emails")
      {:ok, length(emails)}
    else
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
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
          {:ok, length(emails)}

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          require Logger
          Logger.error("Resend batch API error #{status}: #{to_string(resp_body)}")
          {:error, 0, length(emails)}

        {:error, reason} ->
          require Logger
          Logger.error("Resend batch HTTP error: #{inspect(reason)}")
          {:error, 0, length(emails)}
      end
    end
  end

  @doc "Send a newsletter subscription confirmation email (double opt-in)."
  def send_newsletter_confirmation(to_email, writer, confirm_url) do
    api_key = Application.get_env(:inkwell, :resend_api_key)
    from_email = Application.get_env(:inkwell, :from_email, "Inkwell <noreply@inkwell.social>")

    writer_name = writer.display_name || writer.username

    if is_nil(api_key) or api_key == "" do
      require Logger
      Logger.warning("RESEND_API_KEY not set — newsletter confirm link: #{confirm_url}")
      {:ok, :no_email_configured, confirm_url}
    else
      body = Jason.encode!(%{
        from: from_email,
        to: [to_email],
        subject: "Confirm your subscription to #{writer_name}'s newsletter",
        html: newsletter_confirmation_html(writer_name, confirm_url)
      })

      headers = [
        {~c"authorization", ~c"Bearer #{api_key}"},
        {~c"content-type", ~c"application/json"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {~c"#{@resend_url}", headers, ~c"application/json", body},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
          {:ok, :sent}

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          require Logger
          Logger.error("Resend API error #{status}: #{to_string(resp_body)}")
          {:error, {:resend_error, status, to_string(resp_body)}}

        {:error, reason} ->
          require Logger
          Logger.error("Resend HTTP error: #{inspect(reason)}")
          {:error, :send_failed}
      end
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
end
