defmodule Inkwell.Federation.ActivityBuilder do
  @moduledoc """
  Builds ActivityPub JSON-LD objects for outbound federation.
  Converts Inkwell entries, comments, and activities into AP-compatible format.

  IMPORTANT: All AP IDs are derived from the configured instance_host at runtime,
  NOT from stored ap_id fields (which may use a different domain like inkwell.social).
  This ensures the actor ID in activities matches the Person endpoint.

  Entries are federated as `Article` objects per FEP-b2b8 (Long-form Text), with a
  `preview` Note included for microblogging consumers (Mastodon etc.) that don't
  display Article objects inline.
  """

  @public "https://www.w3.org/ns/activitystreams#Public"

  @doc """
  Builds a Create activity wrapping an Article for a published entry.
  """
  def build_create_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    article = build_article(entry, author)

    %{
      "@context" => ap_context(),
      "type" => "Create",
      "id" => "#{entry_url}/activity",
      "actor" => actor_url,
      "published" => format_datetime(entry.published_at),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => article
    }
  end

  @doc """
  Builds an Article object from an entry (FEP-b2b8 compliant).
  """
  def build_article(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    frontend_host = federation_config(:frontend_host)
    instance_host = federation_config(:instance_host)
    page_url = "#{frontend_host}/#{author.username}/#{entry.slug}"

    # Strip <h1> from content — FEP-b2b8 allowed HTML starts at <h2>;
    # the title belongs in `name`, not in the HTML body
    sanitized_content = strip_h1_tags(entry.body_html)

    article = %{
      "type" => "Article",
      "id" => entry_url,
      "attributedTo" => actor_url,
      "content" => sanitized_content,
      "published" => format_datetime(entry.published_at),
      "url" => %{
        "type" => "Link",
        "mediaType" => "text/html",
        "href" => page_url
      },
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "generator" => %{
        "type" => "Application",
        "name" => "Inkwell",
        "url" => "https://inkwell.social"
      }
    }

    # title → name (plain text per spec)
    article = if entry.title, do: Map.put(article, "name", entry.title), else: article

    # excerpt → summary (teaser/abstract, per FEP-b2b8 §summary)
    article =
      if entry.excerpt && entry.excerpt != "" do
        Map.put(article, "summary", entry.excerpt)
      else
        article
      end

    # updated timestamp (only when meaningfully different from published_at — >60s gap
    # avoids false positives from the microsecond difference between published_at and
    # updated_at that occurs on initial publication in the same DB transaction)
    article =
      if entry.updated_at && entry.published_at &&
           DateTime.diff(entry.updated_at, entry.published_at, :second) > 60 do
        Map.put(article, "updated", format_datetime(entry.updated_at))
      else
        article
      end

    # cover image → image (for AP consumers that show link card thumbnails)
    article =
      if entry.cover_image_id do
        Map.put(article, "image", %{
          "type" => "Image",
          "url" => "https://#{instance_host}/api/images/#{entry.cover_image_id}",
          "mediaType" => "image/jpeg"
        })
      else
        article
      end

    # hashtags
    article =
      if entry.tags && length(entry.tags) > 0 do
        tags =
          Enum.map(entry.tags, fn tag ->
            %{
              "type" => "Hashtag",
              "name" => "##{tag}",
              "href" => "#{frontend_host}/tag/#{tag}"
            }
          end)

        Map.put(article, "tag", tags)
      else
        article
      end

    # Extract inline images from content into `attachment` for pre-fetching
    # (FEP-b2b8 §attachment: embedded media SHOULD also be listed in attachment)
    article =
      case extract_inline_images(sanitized_content) do
        [] -> article
        images -> Map.put(article, "attachment", images)
      end

    # Content sensitivity flag (Mastodon/fediverse standard)
    is_sensitive = (Map.get(entry, :sensitive, false) || false) || (Map.get(entry, :admin_sensitive, false) || false)

    article =
      if is_sensitive do
        cw_text = Map.get(entry, :content_warning) || "Sensitive content"

        article
        |> Map.put("sensitive", true)
        |> Map.put("summary", cw_text)
      else
        article
      end

    # preview Note for microblogging consumers (Mastodon etc.) per FEP-b2b8 §preview
    Map.put(article, "preview", build_preview_note(entry, actor_url, instance_host))
  end

  # Keep the old name as an alias for any internal callers
  @doc false
  def build_note(entry, author), do: build_article(entry, author)

  @doc """
  Builds an Update activity for an edited entry.
  """
  def build_update_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    article = build_article(entry, author)

    %{
      "@context" => ap_context(),
      "type" => "Update",
      "id" => "#{entry_url}/activity#update-#{System.system_time(:second)}",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => article
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
      },
      "discoverable" => true
    }

    # Add optional fields
    person = if user.display_name, do: Map.put(person, "name", user.display_name), else: person
    person =
      cond do
        user.bio_html -> Map.put(person, "summary", user.bio_html)
        user.bio -> Map.put(person, "summary", user.bio)
        true -> person
      end

    instance_host = federation_config(:instance_host)

    person =
      if user.avatar_url do
        Map.put(person, "icon", %{
          "type" => "Image",
          "mediaType" => detect_media_type(user.avatar_url),
          "url" => "https://#{instance_host}/api/avatars/#{user.username}"
        })
      else
        person
      end

    person =
      if user.profile_banner_url do
        Map.put(person, "image", %{
          "type" => "Image",
          "mediaType" => detect_media_type(user.profile_banner_url),
          "url" => "https://#{instance_host}/api/banners/#{user.username}"
        })
      else
        person
      end

    person
  end

  # ── Federated interactions (stamps/comments on remote entries) ──────────

  @doc """
  Builds a Like activity for stamping a remote entry.
  `remote_actor_ap_id` is the AP ID of the post author (used for `to` addressing).
  """
  def build_like(remote_entry_ap_id, user, remote_actor_ap_id) do
    actor_url = actor_url(user)

    %{
      "@context" => ap_context(),
      "type" => "Like",
      "id" => "#{actor_url}#like-#{System.system_time(:second)}",
      "actor" => actor_url,
      "to" => [remote_actor_ap_id],
      "object" => remote_entry_ap_id
    }
  end

  @doc """
  Builds an Undo { Like } activity for removing a stamp from a remote entry.
  """
  def build_undo_like(remote_entry_ap_id, user, remote_actor_ap_id) do
    actor_url = actor_url(user)

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-like-#{System.system_time(:second)}",
      "actor" => actor_url,
      "to" => [remote_actor_ap_id],
      "object" => %{
        "type" => "Like",
        "id" => "#{actor_url}#like-#{remote_entry_ap_id}",
        "actor" => actor_url,
        "object" => remote_entry_ap_id
      }
    }
  end

  # ── Announce (boost/ink) ─────────────────────────────────────────────────

  @doc """
  Builds an Announce activity for inking (boosting) a public entry.
  Addressed to Public + actor's followers so it appears in followers' timelines.
  """
  def build_announce(entry_ap_id, user) do
    actor_url = actor_url(user)

    %{
      "@context" => ap_context(),
      "type" => "Announce",
      "id" => "#{actor_url}#announce-#{System.system_time(:second)}",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => entry_ap_id
    }
  end

  @doc """
  Builds an Undo { Announce } activity for un-inking (unboosting) an entry.
  """
  def build_undo_announce(entry_ap_id, user) do
    actor_url = actor_url(user)

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-announce-#{System.system_time(:second)}",
      "actor" => actor_url,
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => %{
        "type" => "Announce",
        "id" => "#{actor_url}#announce-#{entry_ap_id}",
        "actor" => actor_url,
        "object" => entry_ap_id
      }
    }
  end

  # ── Follow / Undo Follow (relay subscriptions) ─────────────────────────

  @doc """
  Builds a Follow activity for subscribing to a relay or remote actor.
  """
  def build_follow(target_actor_url, local_user) do
    actor_url = actor_url(local_user)

    %{
      "@context" => ap_context(),
      "type" => "Follow",
      "id" => "#{actor_url}#follow-#{System.system_time(:second)}",
      "actor" => actor_url,
      "object" => target_actor_url
    }
  end

  @doc """
  Builds an Undo { Follow } activity for unsubscribing from a relay or remote actor.
  """
  def build_undo_follow(target_actor_url, local_user) do
    actor_url = actor_url(local_user)

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-follow-#{System.system_time(:second)}",
      "actor" => actor_url,
      "object" => %{
        "type" => "Follow",
        "id" => "#{actor_url}#follow-#{target_actor_url}",
        "actor" => actor_url,
        "object" => target_actor_url
      }
    }
  end

  @doc """
  Builds a Create { Note } activity as a reply to a remote entry.
  Includes proper `to`/`cc` addressing and Mention tags so the reply
  appears in the remote author's thread and triggers a notification.
  """
  def build_reply_note(body_html, in_reply_to_ap_id, user, comment_id, remote_author_ap_id) do
    actor_url = actor_url(user)
    instance_host = federation_config(:instance_host)
    comment_url = "https://#{instance_host}/comments/#{comment_id}"
    followers_url = "#{actor_url}/followers"

    mention_tag = %{
      "type" => "Mention",
      "href" => remote_author_ap_id,
      "name" => extract_mention_name(remote_author_ap_id)
    }

    %{
      "@context" => ap_context(),
      "type" => "Create",
      "id" => "#{comment_url}/activity",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [remote_author_ap_id],
      "cc" => [@public, followers_url],
      "object" => %{
        "type" => "Note",
        "id" => comment_url,
        "attributedTo" => actor_url,
        "content" => body_html,
        "inReplyTo" => in_reply_to_ap_id,
        "published" => format_datetime(DateTime.utc_now()),
        "to" => [remote_author_ap_id],
        "cc" => [@public, followers_url],
        "tag" => [mention_tag]
      }
    }
  end

  @doc """
  Derives `@user@domain` mention name from an AP actor URL.
  e.g. "https://mastodon.social/users/strypey" → "@strypey@mastodon.social"
  """
  def extract_mention_name(ap_url) do
    uri = URI.parse(ap_url)
    username = ap_url |> String.split("/") |> List.last()
    "@#{username}@#{uri.host}"
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

  # ── Private Helpers ──────────────────────────────────────────────────────

  # Builds a Note-type preview for microblogging consumers (FEP-b2b8 §preview).
  # Content: bold title + excerpt (or stripped/truncated body). No "Read more" link.
  defp build_preview_note(entry, actor_url, instance_host) do
    preview = %{
      "type" => "Note",
      "attributedTo" => actor_url,
      "published" => format_datetime(entry.published_at),
      "content" => build_preview_content(entry)
    }

    if entry.cover_image_id do
      Map.put(preview, "attachment", %{
        "type" => "Image",
        "url" => "https://#{instance_host}/api/images/#{entry.cover_image_id}",
        "mediaType" => "image/jpeg"
      })
    else
      preview
    end
  end

  defp build_preview_content(entry) do
    title_html =
      if entry.title && entry.title != "",
        do: "<p><strong>#{html_escape(entry.title)}</strong></p>",
        else: ""

    excerpt_html =
      cond do
        entry.excerpt && entry.excerpt != "" ->
          "<p>#{entry.excerpt}</p>"

        entry.body_html ->
          plain = entry.body_html |> strip_html_tags() |> String.trim()
          truncated = if String.length(plain) > 280, do: String.slice(plain, 0, 280) <> "…", else: plain
          if truncated != "", do: "<p>#{truncated}</p>", else: ""

        true ->
          ""
      end

    title_html <> excerpt_html
  end

  defp strip_html_tags(html) when is_binary(html) do
    Regex.replace(~r/<[^>]+>/, html, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end
  defp strip_html_tags(_), do: ""

  defp html_escape(text) when is_binary(text) do
    text
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end
  defp html_escape(text), do: text

  # Strips <h1> tags from content — FEP-b2b8 allowed HTML starts at <h2>.
  # Replaces <h1> with <h2> to preserve structure rather than removing content.
  defp strip_h1_tags(nil), do: nil
  defp strip_h1_tags(html) do
    html
    |> String.replace(~r/<h1([^>]*)>/, "<h2\\1>")
    |> String.replace("</h1>", "</h2>")
  end

  # Extracts image URLs from <img> tags in HTML content for the `attachment` array.
  defp extract_inline_images(nil), do: []
  defp extract_inline_images(html) do
    Regex.scan(~r/<img[^>]+src="([^"]+)"/, html)
    |> Enum.map(fn [_, src] ->
      %{
        "type" => "Image",
        "url" => src,
        "mediaType" => guess_image_media_type(src)
      }
    end)
    |> Enum.uniq_by(& &1["url"])
  end

  defp guess_image_media_type(url) when is_binary(url) do
    cond do
      String.contains?(url, ".png") -> "image/png"
      String.contains?(url, ".gif") -> "image/gif"
      String.contains?(url, ".webp") -> "image/webp"
      true -> "image/jpeg"
    end
  end

  defp detect_media_type(data_uri) when is_binary(data_uri) do
    case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,/, data_uri) do
      [_, "jpg"] -> "image/jpeg"
      [_, type] -> "image/#{type}"
      _ -> "image/jpeg"
    end
  end
  defp detect_media_type(_), do: "image/jpeg"

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
