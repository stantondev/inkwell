defmodule Inkwell.Email do
  @moduledoc """
  Sends transactional emails via the Resend API.
  Requires RESEND_API_KEY to be set in the environment.
  """

  @resend_url "https://api.resend.com/emails"

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
end
