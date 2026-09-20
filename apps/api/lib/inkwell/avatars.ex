defmodule Inkwell.Avatars do
  @moduledoc """
  Public URLs for locally stored avatars and banners.

  Local avatars are stored on the user row as base64 data URIs. Returning
  those inline put the whole image into every payload that mentioned the
  user: on Explore the same 51 KB avatar was embedded three times, in both
  the rendered HTML and the RSC payload, so one page shipped ~450 KB of
  images no browser could cache.

  `/api/avatars/:username` already decodes and serves the bytes with a
  7-day cache and an etag (it exists because federation cannot consume data
  URIs). Pointing responses at it means one cacheable request per avatar no
  matter how often the user appears.

  Because that cache is 7 days, the URL carries a `v` stamp derived from the
  user's `updated_at`; without it a writer who changed their avatar would
  keep seeing the old one. The stamp changes on any profile update, which
  re-fetches an unchanged image occasionally — a far better trade than
  inlining it on every render.

  Remote fediverse actors already store a real URL and pass through
  untouched, as does anything already served over http(s).

  These URLs are host-relative, so they resolve on inkwell.social and on a
  writer's custom domain alike. Anything that leaves the web app — email,
  RSS, ActivityPub — needs an absolute URL and must not use these.
  """

  @doc "Public URL for a user's avatar, or nil when they have none."
  def avatar_url(%{avatar_url: url} = user), do: public_url(url, user, "avatars")
  def avatar_url(_), do: nil

  @doc "Public URL for a user's banner, or nil when they have none."
  def banner_url(%{profile_banner_url: url} = user), do: public_url(url, user, "banners")
  def banner_url(_), do: nil

  defp public_url(url, _user, _kind) when url in [nil, ""], do: nil

  defp public_url("data:" <> _, %{username: username} = user, kind)
       when is_binary(username) and username != "" do
    "/api/#{kind}/#{username}#{version_param(user)}"
  end

  # Already a real URL (remote actor), or a local user with no username yet
  # to build a path from — leave it exactly as stored.
  defp public_url(url, _user, _kind), do: url

  defp version_param(%{updated_at: %DateTime{} = at}), do: "?v=#{DateTime.to_unix(at)}"

  defp version_param(%{updated_at: %NaiveDateTime{} = at}) do
    "?v=#{at |> DateTime.from_naive!("Etc/UTC") |> DateTime.to_unix()}"
  end

  defp version_param(_), do: ""
end
