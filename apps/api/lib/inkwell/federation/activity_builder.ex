defmodule Inkwell.Federation.ActivityBuilder do
  @moduledoc """
  Builds ActivityPub JSON-LD objects for outbound federation.
  Converts Inkwell entries, comments, and activities into AP-compatible format.

  IMPORTANT: All AP IDs are derived from the configured instance_host at runtime,
  NOT from stored ap_id fields (which may use a different domain like inkwell.social).
  This ensures the actor ID in activities matches the Person endpoint.
  """

  @public "https://www.w3.org/ns/activitystreams#Public"

  @doc """
  Builds a Create activity wrapping a Note for a published entry.
  """
  def build_create_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    note = build_note(entry, author)

    %{
      "@context" => ap_context(),
      "type" => "Create",
      "id" => "#{entry_url}/activity",
      "actor" => actor_url,
      "published" => format_datetime(entry.published_at),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => note
    }
  end

  @doc """
  Builds a Note object from an entry.
  """
  def build_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    frontend_host = federation_config(:frontend_host)
    page_url = "#{frontend_host}/#{author.username}/#{entry.slug}"

    note = %{
      "type" => "Note",
      "id" => entry_url,
      "attributedTo" => actor_url,
      "content" => entry.body_html,
      "published" => format_datetime(entry.published_at),
      "url" => page_url,
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"]
    }

    # Add title as "name" if present (Mastodon shows this)
    note = if entry.title, do: Map.put(note, "name", entry.title), else: note

    # Add hashtags
    note =
      if entry.tags && length(entry.tags) > 0 do
        tags = Enum.map(entry.tags, fn tag ->
          %{
            "type" => "Hashtag",
            "name" => "##{tag}",
            "href" => "#{frontend_host}/tag/#{tag}"
          }
        end)
        Map.put(note, "tag", tags)
      else
        note
      end

    note
  end

  @doc """
  Builds an Update activity for an edited entry.
  """
  def build_update_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    note = build_note(entry, author)

    %{
      "@context" => ap_context(),
      "type" => "Update",
      "id" => "#{entry_url}/activity#update-#{System.system_time(:second)}",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => note
    }
  end

  @doc """
  Builds a Delete activity for a removed entry.
  """
  def build_delete(entry_ap_id, author) do
    actor_url = actor_url(author)
    # For delete, use the stored ap_id since the entry may already be gone
    # Re-map to current host if it uses the old domain
    entry_url = remap_ap_id(entry_ap_id)

    %{
      "@context" => ap_context(),
      "type" => "Delete",
      "id" => "#{entry_url}#delete-#{System.system_time(:second)}",
      "actor" => actor_url,
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => %{
        "type" => "Tombstone",
        "id" => entry_url
      }
    }
  end

  @doc """
  Builds an Accept activity in response to a Follow.
  """
  def build_accept(follow_activity, local_user) do
    actor_url = actor_url(local_user)

    %{
      "@context" => ap_context(),
      "type" => "Accept",
      "id" => "#{actor_url}#accept-#{System.system_time(:second)}",
      "actor" => actor_url,
      "object" => follow_activity
    }
  end

  @doc """
  Builds a Person object for a local user (used by the actor endpoint).
  """
  def build_person(user) do
    actor_url = actor_url(user)
    frontend_host = federation_config(:frontend_host)

    person = %{
      "@context" => [
        "https://www.w3.org/ns/activitystreams",
        "https://w3id.org/security/v1"
      ],
      "type" => "Person",
      "id" => actor_url,
      "preferredUsername" => user.username,
      "url" => "#{frontend_host}/#{user.username}",
      "inbox" => "#{actor_url}/inbox",
      "outbox" => "#{actor_url}/outbox",
      "followers" => "#{actor_url}/followers",
      "following" => "#{actor_url}/following",
      "publicKey" => %{
        "id" => "#{actor_url}#main-key",
        "owner" => actor_url,
        "publicKeyPem" => user.public_key
      }
    }

    # Add optional fields
    person = if user.display_name, do: Map.put(person, "name", user.display_name), else: person
    person = if user.bio, do: Map.put(person, "summary", user.bio), else: person

    person =
      if user.avatar_url do
        Map.put(person, "icon", %{
          "type" => "Image",
          "url" => user.avatar_url
        })
      else
        person
      end

    person
  end

  # ── URL Helpers ──────────────────────────────────────────────────────────

  @doc """
  Constructs the canonical actor URL from config, ignoring the stored ap_id.
  """
  def actor_url(user) do
    instance_host = federation_config(:instance_host)
    "https://#{instance_host}/users/#{user.username}"
  end

  @doc """
  Constructs the canonical entry AP URL from config.
  Uses the entry's stored ID to build a stable URL.
  """
  def entry_ap_url(entry) do
    instance_host = federation_config(:instance_host)
    "https://#{instance_host}/entries/#{entry.id}"
  end

  @doc """
  Remaps an ap_id from the legacy domain to the current instance host.
  """
  def remap_ap_id(ap_id) when is_binary(ap_id) do
    instance_host = federation_config(:instance_host)
    # Replace old domain with current host
    ap_id
    |> String.replace("https://inkwell.social/", "https://#{instance_host}/")
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp ap_context do
    [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ]
  end

  defp format_datetime(nil), do: nil
  defp format_datetime(%DateTime{} = dt) do
    DateTime.to_iso8601(dt)
  end

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key)
  end
end
