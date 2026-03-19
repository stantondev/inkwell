defmodule InkwellWeb.Plugs.SecurityHeaders do
  @moduledoc """
  Adds security headers to all responses:
  - Content-Security-Policy
  - X-Content-Type-Options
  - X-Frame-Options
  - Referrer-Policy
  - Permissions-Policy
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn
    |> put_resp_header("x-content-type-options", "nosniff")
    |> put_resp_header("x-frame-options", "SAMEORIGIN")
    |> put_resp_header("referrer-policy", "strict-origin-when-cross-origin")
    |> put_resp_header("permissions-policy", "camera=(), microphone=(), geolocation=()")
    |> put_resp_header("content-security-policy", csp_value())
  end

  defp csp_value do
    [
      "default-src 'self'",
      # Scripts: only self (no inline scripts allowed — blocks XSS execution)
      "script-src 'self'",
      # Styles: self + unsafe-inline (needed for Tailwind/CSS-in-JS and user profile styles)
      "style-src 'self' 'unsafe-inline'",
      # Images: self + data URIs (base64 avatars) + any HTTPS (fediverse avatars, cover images)
      "img-src 'self' data: https:",
      # Fonts: self
      "font-src 'self'",
      # Connect: self + API subdomain + Stripe
      "connect-src 'self' https://api.inkwell.social https://api.stripe.com",
      # Frames: Stripe, YouTube, Spotify, SoundCloud (music embeds)
      "frame-src https://js.stripe.com https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://w.soundcloud.com",
      # Media: self + HTTPS (fediverse media)
      "media-src 'self' https:",
      # Base URI: self only (prevents <base> tag hijacking)
      "base-uri 'self'",
      # Form action: self only
      "form-action 'self' https://checkout.stripe.com"
    ]
    |> Enum.join("; ")
  end
end
