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

  # FEP-0c7f (draft, written for Inkwell): `importedFrom` marks a post brought
  # over from another platform so receivers don't treat it as new.
  @imported_from_term %{
    "importedFrom" => %{"@id" => "https://w3id.org/fep/0c7f#importedFrom", "@type" => "@id"}
  }

  @imported_origins %{
    "livejournal" => {"LiveJournal", "https://www.livejournal.com/"},
    "dreamwidth" => {"Dreamwidth", "https://www.dreamwidth.org/"},
    "wordpress" => {"WordPress", nil},
    "medium" => {"Medium", "https://medium.com/"},
    "substack" => {"Substack", "https://substack.com/"}
  }

  @doc """
  The FEP-0c7f `importedFrom` Link for an imported entry, or nil. `href` is
  the original post when the importer knew it, else the platform's home page.
  WordPress blogs are self-hosted, so without the post's own URL there is no
  honest `href` and the property is left out.
  """
  def imported_from(%{imported_from: origin} = entry) when is_binary(origin) and origin != "" do
    {name, home} = Map.get(@imported_origins, origin, {String.capitalize(origin), nil})

    href =
      case Map.get(entry, :imported_url) do
        "https://" <> _ = url -> url
        _ -> home
      end

    if href, do: %{"type" => "Link", "href" => href, "name" => name}
  end

  def imported_from(_), do: nil

  defp put_imported_from(object, entry) do
    case imported_from(entry) do
      nil -> object
      link -> Map.put(object, "importedFrom", link)
    end
  end

  @doc "The JSON-LD context for an activity or object, with the FEP-0c7f term when it's used."
  def context_for(%{"importedFrom" => _}), do: ap_context() ++ [@imported_from_term]
  def context_for(_), do: ap_context()

  @doc """
  Builds a Create activity wrapping an Article for a published entry.
  """
  def build_create_note(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    article = build_article(entry, author)

    %{
      "@context" => context_for(article),
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
  def build_article(%{kind: "sticky"} = entry, author),
    do: build_sticky_note(entry, author) |> put_imported_from(entry)

  def build_article(entry, author), do: build_entry_article(entry, author) |> put_imported_from(entry)

  defp build_entry_article(entry, author) do
    actor_url = actor_url(author)
    entry_url = entry_ap_url(entry)
    frontend_host = federation_config(:frontend_host)
    instance_host = federation_config(:instance_host)
    page_url = "#{frontend_host}/#{author.username}/#{entry.slug}"

    # Strip <h1> from content — FEP-b2b8 allowed HTML starts at <h2>;
    # the title belongs in `name`, not in the HTML body
    # The editor stores uploaded images as root-relative `/api/images/:id` and
    # mentions as `/username`. Remote servers resolve those against their own
    # host, so every inline image in a federated post was broken on Mastodon.
    sanitized_content =
      entry.body_html
      |> strip_h1_tags()
      |> absolutize_urls(frontend_host)

    # Build content with a clean text hook prepended before the full body.
    # Mastodon truncates Article content aggressively (~100-150 chars displayed),
    # so we front-load a readable title + excerpt + "Read more" link. The full
    # body_html follows after <hr> for clients that render Articles fully
    # (Pleroma, Akkoma, Misskey, etc.).
    content = build_article_content(entry, sanitized_content, page_url)

    article = %{
      "type" => "Article",
      "id" => entry_url,
      "attributedTo" => actor_url,
      "content" => content,
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
    # Always populate summary — Mastodon should show this for Articles but doesn't yet.
    # Having it ready means the moment they implement FEP-b2b8 §Type guidance, it works.
    article =
      cond do
        entry.excerpt && entry.excerpt != "" ->
          Map.put(article, "summary", entry.excerpt)

        entry.body_html ->
          Map.put(article, "summary", auto_generate_summary(entry.body_html, 400))

        true ->
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
    # When no cover image, use the dynamic OG image generator to create a branded card
    # so Mastodon/fediverse preview cards aren't empty
    article =
      if entry.cover_image_id do
        Map.put(article, "image", %{
          "type" => "Image",
          "url" => "https://#{instance_host}/api/images/#{entry.cover_image_id}",
          "mediaType" => "image/jpeg"
        })
      else
        og_params =
          URI.encode_query(%{
            "type" => "entry",
            "title" => entry.title || "Untitled",
            "author" => author.display_name || author.username,
            "username" => author.username,
            "category" => entry.category || "",
            "date" => if(entry.published_at, do: DateTime.to_iso8601(entry.published_at), else: "")
          })

        Map.put(article, "image", %{
          "type" => "Image",
          "url" => "#{frontend_host}/api/og?#{og_params}",
          "mediaType" => "image/png"
        })
      end

    # hashtags + mention tags, and mentioned users in cc so their servers receive it
    article = put_tags_and_mentions(article, entry, frontend_host)

    # Extract inline images from content into `attachment` for pre-fetching
    # (FEP-b2b8 §attachment: embedded media SHOULD also be listed in attachment)
    article =
      case extract_inline_images(sanitized_content) do
        [] -> article
        images -> Map.put(article, "attachment", images)
      end

    # Quote post fields (FEP-e232 Object Links + backward-compat fields)
    # When this entry quotes another entry, include the quote reference so
    # Mastodon 4.4+, Misskey, Akkoma, Pleroma, and Threads can render the quote.
    article = maybe_add_quote_fields(article, entry, frontend_host)

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

  # Hashtag and Mention tags for an entry's object, plus the mentioned users in
  # cc so their servers receive the activity.
  defp put_tags_and_mentions(object, entry, frontend_host) do
    hashtag_tags =
      Enum.map(entry.tags || [], fn tag ->
        %{
          "type" => "Hashtag",
          "name" => "##{tag}",
          "href" => "#{frontend_host}/tag/#{URI.encode_www_form(tag)}"
        }
      end)

    {_, mentioned_users} = InkwellWeb.Helpers.MentionHelper.process_mentions(entry.body_html || "")

    mention_tags =
      Enum.map(mentioned_users, fn user ->
        %{
          "type" => "Mention",
          "href" => "#{frontend_host}/users/#{user.username}",
          "name" => "@#{user.username}@#{URI.parse(frontend_host).host}"
        }
      end)

    object =
      case hashtag_tags ++ mention_tags do
        [] -> object
        tags -> Map.put(object, "tag", tags)
      end

    if mentioned_users != [] do
      mention_uris = Enum.map(mentioned_users, &"#{frontend_host}/users/#{&1.username}")
      Map.put(object, "cc", Enum.uniq((object["cc"] || []) ++ mention_uris))
    else
      object
    end
  end

  # A sticky is a short post, so it goes out as a Note: Mastodon and other
  # microblogging software show a Note in full, where an Article is cut down to
  # its title and a link. No title, summary or preview; the body is the post.
  defp build_sticky_note(entry, author) do
    actor_url = actor_url(author)
    frontend_host = federation_config(:frontend_host)

    note = %{
      "type" => "Note",
      "id" => entry_ap_url(entry),
      "attributedTo" => actor_url,
      "content" => absolutize_urls(entry.body_html, frontend_host),
      "published" => format_datetime(entry.published_at),
      "url" => "#{frontend_host}/#{author.username}/#{entry.slug}",
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"]
    }

    note =
      if entry.updated_at && entry.published_at &&
           DateTime.diff(entry.updated_at, entry.published_at, :second) > 60,
         do: Map.put(note, "updated", format_datetime(entry.updated_at)),
         else: note

    note = put_tags_and_mentions(note, entry, frontend_host)

    if (Map.get(entry, :sensitive) || false) or (Map.get(entry, :admin_sensitive) || false) do
      note
      |> Map.put("sensitive", true)
      |> Map.put("summary", Map.get(entry, :content_warning) || "Sensitive content")
    else
      note
    end
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
      "@context" => context_for(article),
      "type" => "Update",
      "id" => "#{entry_url}/activity#update-#{System.system_time(:nanosecond)}",
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
      "id" => "#{entry_url}#delete-#{System.system_time(:nanosecond)}",
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
      "id" => "#{actor_url}#accept-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "object" => follow_activity
    }
  end

  @doc """
  Builds a Note object representing a user's guestbook post.
  Fediverse users can search for this URL in Mastodon, then reply to sign the guestbook.
  """
  def build_guestbook_post(user) do
    actor_url = actor_url(user)
    instance_host = federation_config(:instance_host)
    frontend_host = federation_config(:frontend_host)

    published =
      case user.inserted_at do
        %DateTime{} = dt -> format_datetime(dt)
        %NaiveDateTime{} = ndt -> NaiveDateTime.to_iso8601(ndt) <> "Z"
        _ -> DateTime.utc_now() |> format_datetime()
      end

    %{
      "@context" => ap_context(),
      "type" => "Note",
      "id" => "https://#{instance_host}/users/#{user.username}/guestbook-post",
      "attributedTo" => actor_url,
      "content" => "<p>Sign my guestbook! Reply to this post from your fediverse account to leave a message on my Inkwell profile. \u270D\uFE0F</p>",
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "published" => published,
      "url" => "#{frontend_host}/#{user.username}#guestbook"
    }
  end

  def build_person(user) do
    actor_url = actor_url(user)
    frontend_host = federation_config(:frontend_host)

    person = %{
      "@context" => [
        "https://www.w3.org/ns/activitystreams",
        "https://w3id.org/security/v1",
        %{
          "inkwell" => "https://inkwell.social/ns#",
          # FEP-400e: a publicly-appendable collection (the guestbook)
          "guestbook" => %{"@id" => "inkwell:guestbook", "@type" => "@id"},
          # FEP-2345: sites allowed to credit this account via fediverse:creator
          "attributionDomains" => %{
            "@id" => "https://joinmastodon.org/ns#attributionDomains",
            "@container" => "@set"
          }
        }
      ],
      "type" => "Person",
      "id" => actor_url,
      "preferredUsername" => user.username,
      "url" => "#{frontend_host}/#{user.username}",
      "inbox" => "#{actor_url}/inbox",
      "outbox" => "#{actor_url}/outbox",
      "followers" => "#{actor_url}/followers",
      "following" => "#{actor_url}/following",
      "endpoints" => %{
        "sharedInbox" => "#{frontend_host}/inbox"
      },
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
          "url" => "https://#{instance_host}/api/avatars/#{user.username}#{image_version(user.avatar_url)}"
        })
      else
        person
      end

    person =
      if user.profile_banner_url do
        Map.put(person, "image", %{
          "type" => "Image",
          "mediaType" => detect_media_type(user.profile_banner_url),
          "url" => "https://#{instance_host}/api/banners/#{user.username}#{image_version(user.profile_banner_url)}"
        })
      else
        person
      end

    # Add featured collection (pinned posts)
    person = Map.put(person, "featured", "#{actor_url}/featured")

    # FEP-400e guestbook: anyone can sign it with a Create{Note} targeting it
    person =
      if user.username == Inkwell.Federation.InstanceActor.username(),
        do: person,
        else: Map.put(person, "guestbook", "#{actor_url}/guestbook")

    # FEP-2345: our entry pages carry <meta name="fediverse:creator">, and
    # Mastodon only honours it for domains the account lists here.
    person = Map.put(person, "attributionDomains", attribution_domains(user))

    # Add social links as PropertyValue attachments (Mastodon profile fields)
    person = add_property_values(person, user)

    person
  end

  # The writer's pages live on inkwell.social and, for Plus members, their own
  # domain. Mastodon also accepts subdomains of what's listed.
  defp attribution_domains(user) do
    frontend = federation_config(:frontend_host) |> to_string() |> URI.parse()

    custom =
      case user.id && Inkwell.CustomDomains.get_domain_by_user(user.id) do
        %{status: "active", domain: domain} when is_binary(domain) -> [domain]
        _ -> []
      end

    Enum.uniq(Enum.filter([frontend.host], &is_binary/1) ++ custom)
  end

  # Mastodon only re-downloads an avatar or banner when its URL changes, so a
  # fixed /api/avatars/:username kept every server showing whatever picture it
  # first saw. A hash of the stored image changes the URL exactly when the
  # image does (a timestamp would also change on every bio edit).
  defp image_version(data) when is_binary(data) and data != "" do
    "?v=" <> (:crypto.hash(:sha256, data) |> Base.url_encode64(padding: false) |> binary_part(0, 12))
  end

  defp image_version(_), do: ""

  @doc """
  Builds an Update{Person} announcing a changed profile (avatar, banner, name,
  bio, links) to followers. Without it, servers only noticed changes whenever
  they happened to re-fetch the actor.
  """
  def build_update_person(user) do
    actor_url = actor_url(user)
    {context, person} = Map.pop(build_person(user), "@context")

    %{
      "@context" => context,
      "type" => "Update",
      "id" => "#{actor_url}#updates/#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => person
    }
  end

  defp add_property_values(person, user) do
    links = user.social_links || %{}

    attachments =
      [
        if(links["website"], do: {"Website", link_html(links["website"])}),
        if(links["bluesky"], do: {"Bluesky", links["bluesky"]}),
        if(links["mastodon"], do: {"Mastodon", link_html(links["mastodon"])}),
        if(links["github"], do: {"GitHub", link_html(profile_link(links["github"], "https://github.com/"))}),
        if(links["twitter"], do: {"X/Twitter", link_html(profile_link(links["twitter"], "https://x.com/"))})
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.map(fn {name, value} ->
        %{"type" => "PropertyValue", "name" => name, "value" => value}
      end)

    if attachments == [] do
      person
    else
      person
      |> Map.put("attachment", attachments)
      |> Map.update("@context", [], fn ctx ->
        ctx ++ ["https://schema.org"]
      end)
    end
  end

  # Settings asks for full URLs; older values may be bare handles.
  defp profile_link("http" <> _ = url, _base), do: url
  defp profile_link(handle, base), do: base <> String.trim_leading(handle, "@")

  defp link_html(url) when is_binary(url) do
    "<a href=\"#{html_escape(url)}\" rel=\"nofollow noopener noreferrer\" target=\"_blank\">#{html_escape(url)}</a>"
  end

  defp html_escape(str) when is_binary(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end
  defp html_escape(text), do: text

  # ── Federated interactions (stamps/comments on remote entries) ──────────

  @doc """
  Builds a Like activity for stamping a remote entry.
  `remote_actor_ap_id` is the AP ID of the post author (used for `to` addressing).
  Like ID is deterministic (hash of object URL) so Undo can reconstruct it exactly.
  """
  def build_like(remote_entry_ap_id, user, remote_actor_ap_id) do
    actor_url = actor_url(user)

    %{
      "@context" => ap_context(),
      "type" => "Like",
      "id" => "#{actor_url}#like-#{object_hash(remote_entry_ap_id)}",
      "actor" => actor_url,
      "to" => [remote_actor_ap_id],
      "object" => remote_entry_ap_id
    }
  end

  @doc """
  Builds an Undo { Like } activity for removing a stamp from a remote entry.
  Inner Like ID matches the original Like's deterministic ID.
  """
  def build_undo_like(remote_entry_ap_id, user, remote_actor_ap_id) do
    actor_url = actor_url(user)
    like_id = "#{actor_url}#like-#{object_hash(remote_entry_ap_id)}"

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-like-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "to" => [remote_actor_ap_id],
      "object" => %{
        "type" => "Like",
        "id" => like_id,
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
      "id" => "#{actor_url}#announce-#{object_hash(entry_ap_id)}",
      "actor" => actor_url,
      "published" => format_datetime(DateTime.utc_now()),
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => entry_ap_id
    }
  end

  @doc """
  Builds an Undo { Announce } activity for un-inking (unboosting) an entry.
  Inner Announce ID matches the original Announce's deterministic ID.
  """
  def build_undo_announce(entry_ap_id, user) do
    actor_url = actor_url(user)
    announce_id = "#{actor_url}#announce-#{object_hash(entry_ap_id)}"

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-announce-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "to" => [@public],
      "cc" => ["#{actor_url}/followers"],
      "object" => %{
        "type" => "Announce",
        "id" => announce_id,
        "actor" => actor_url,
        "object" => entry_ap_id
      }
    }
  end

  # ── Follow / Undo Follow (relay subscriptions) ─────────────────────────

  @doc """
  Builds a Follow activity for subscribing to a relay or remote actor.
  """
  def build_follow(target_actor_url, local_user, opts \\ []) do
    actor_url = actor_url(local_user)

    # unique: true for receivers that drop activity ids they've seen before
    # (Bridgy Fed), when the same follow may legitimately be sent again.
    suffix = if opts[:unique], do: "-#{System.system_time(:nanosecond)}", else: ""

    %{
      "@context" => ap_context(),
      "type" => "Follow",
      "id" => "#{actor_url}#follow-#{object_hash(target_actor_url)}#{suffix}",
      "actor" => actor_url,
      "object" => target_actor_url
    }
  end

  @doc "Builds a Block activity (used to switch off the Bluesky bridge)."
  def build_block(target_actor_url, local_user) do
    actor_url = actor_url(local_user)

    %{
      "@context" => ap_context(),
      "type" => "Block",
      "id" => "#{actor_url}#block-#{object_hash(target_actor_url)}-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "object" => target_actor_url
    }
  end

  @doc "Builds an Undo { Block } for a Block previously sent with `block_id`."
  def build_undo_block(target_actor_url, local_user, block_id) do
    actor_url = actor_url(local_user)

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-block-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "object" => %{"type" => "Block", "id" => block_id, "actor" => actor_url, "object" => target_actor_url}
    }
  end

  @doc """
  Builds an Undo { Follow } activity for unsubscribing from a relay or remote actor.
  Inner Follow ID matches the original Follow's deterministic ID.
  """
  def build_undo_follow(target_actor_url, local_user) do
    actor_url = actor_url(local_user)
    follow_id = "#{actor_url}#follow-#{object_hash(target_actor_url)}"

    %{
      "@context" => ap_context(),
      "type" => "Undo",
      "id" => "#{actor_url}#undo-follow-#{System.system_time(:nanosecond)}",
      "actor" => actor_url,
      "object" => %{
        "type" => "Follow",
        "id" => follow_id,
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
        "content" => absolutize_urls(body_html, federation_config(:frontend_host)),
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

  # ── Comment threads ──────────────────────────────────────────────────────

  @doc """
  The public AP id of a comment written on Inkwell. It is served by
  `FederationController.comment_object/2`.
  """
  def comment_ap_url(comment) do
    "https://#{federation_config(:instance_host)}/comments/#{comment.id}"
  end

  @doc """
  AP id of the fediverse account that wrote a comment, or nil when the comment
  was written on Inkwell.
  """
  def remote_comment_author(%{remote_author: ra}) when is_map(ra) do
    case ra["ap_id"] || ra[:ap_id] do
      ap_id when is_binary(ap_id) and ap_id != "" -> ap_id
      _ -> nil
    end
  end

  def remote_comment_author(_), do: nil

  @doc """
  What a reply to `comment` should put in `inReplyTo`: the fediverse comment's
  own id, or our URL for a comment written on Inkwell.
  """
  def comment_reply_target(comment) do
    # No local author means it arrived from the fediverse with its own id.
    if is_nil(comment.user_id) and is_binary(comment.ap_id),
      do: comment.ap_id,
      else: comment_ap_url(comment)
  end

  @doc """
  Points a reply Create activity at the comment it answers instead of the post.
  When that comment came from the fediverse, its author is also addressed and
  mentioned, so their server threads the reply and notifies them.
  """
  def thread_reply(activity, nil), do: activity

  def thread_reply(activity, parent) do
    activity = Map.update!(activity, "object", &Map.put(&1, "inReplyTo", comment_reply_target(parent)))

    case remote_comment_author(parent) do
      nil ->
        activity

      author ->
        ra = parent.remote_author
        username = ra["username"] || ra[:username]
        domain = ra["domain"] || ra[:domain]

        name =
          if username && domain, do: "@#{username}@#{domain}", else: extract_mention_name(author)

        mention = %{"type" => "Mention", "href" => author, "name" => name}
        address = fn list -> Enum.uniq((list || []) ++ [author]) end

        activity
        |> Map.update("to", [author], address)
        |> Map.update!("object", fn obj ->
          obj
          |> Map.update("to", [author], address)
          |> Map.update("tag", [mention], fn tags ->
            if Enum.any?(tags, &(&1["href"] == author)), do: tags, else: tags ++ [mention]
          end)
        end)
    end
  end

  @doc """
  A comment written on Inkwell as a standalone Note, for remote servers that
  look it up. `in_reply_to` is the AP id of what it answers; `page_url` is where
  a person can read it in context.
  """
  def build_comment_note(comment, user, in_reply_to, page_url) do
    actor = actor_url(user)

    note = %{
      "@context" => ap_context(),
      "type" => "Note",
      "id" => comment_ap_url(comment),
      "attributedTo" => actor,
      "content" => absolutize_urls(comment.body_html || "", federation_config(:frontend_host)),
      "inReplyTo" => in_reply_to,
      "url" => page_url,
      "published" => format_datetime(comment.inserted_at),
      "to" => [@public],
      "cc" => ["#{actor}/followers"]
    }

    if comment.edited_at, do: Map.put(note, "updated", format_datetime(comment.edited_at)), else: note
  end

  # ── Letters to fediverse accounts ────────────────────────────────────────

  @doc """
  A letter to a fediverse account, as a private mention: a Note addressed
  only to them (no Public, no followers), with a Mention tag, which Mastodon
  and others show as a direct message. `kind` is `:create` or `:update`.

  `in_reply_to` is the last note in the conversation so it threads on their
  side; `context` is their server's conversation id when we know it.
  """
  def build_letter_activity(kind, message, author, remote_actor, opts \\ []) do
    actor = actor_url(author)
    note_id = message.ap_id
    recipient = remote_actor.ap_id
    frontend = federation_config(:frontend_host)
    now = format_datetime(DateTime.utc_now())

    profile = Inkwell.Letters.remote_profile_url(remote_actor)
    handle = "@#{remote_actor.username}"

    mention_html =
      ~s(<p><span class="h-card"><a href="#{escape_attr(profile)}" class="u-url mention">) <>
        ~s(@<span>#{escape_text(remote_actor.username)}</span></a></span></p>)

    body =
      case message.body_html do
        html when is_binary(html) and html != "" -> html
        _ -> plain_letter_html(message.body)
      end

    content = mention_html <> absolutize_urls(body, frontend)

    note =
      %{
        "type" => "Note",
        "id" => note_id,
        "attributedTo" => actor,
        "content" => content,
        "published" => format_datetime(message.inserted_at),
        "to" => [recipient],
        "cc" => [],
        "sensitive" => false,
        "tag" => [
          %{"type" => "Mention", "href" => recipient, "name" => "#{handle}@#{remote_actor.domain}"}
        ]
      }
      |> put_if("inReplyTo", Keyword.get(opts, :in_reply_to))
      |> put_if("context", Keyword.get(opts, :context))
      |> put_if("conversation", Keyword.get(opts, :context))
      |> put_if("updated", if(kind == :update, do: now))

    note =
      case extract_inline_images(absolutize_urls(body, frontend)) do
        [] -> note
        images -> Map.put(note, "attachment", images)
      end

    {type, id} =
      case kind do
        :create -> {"Create", "#{note_id}/activity"}
        :update -> {"Update", "#{note_id}/update-#{System.system_time(:nanosecond)}"}
      end

    %{
      "@context" => ap_context(),
      "type" => type,
      "id" => id,
      "actor" => actor,
      "published" => now,
      "to" => [recipient],
      "cc" => [],
      "object" => note
    }
  end

  defp put_if(map, _key, nil), do: map
  defp put_if(map, key, value), do: Map.put(map, key, value)

  defp plain_letter_html(text) do
    (text || "")
    |> String.split(~r/\n{2,}/, trim: true)
    |> Enum.map_join("", fn para ->
      "<p>" <> (para |> escape_text() |> String.replace("\n", "<br>")) <> "</p>"
    end)
  end

  defp escape_text(text) do
    text
    |> to_string()
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
    |> String.replace("'", "&#39;")
  end

  defp escape_attr(text), do: escape_text(text)

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

  # The preview Note is what microblogging consumers show in place of the
  # full Article. Bluesky (via Bridgy Fed) uses its text as the post and adds a
  # link card carrying the title, so the preview is the excerpt alone, kept
  # under Bluesky's 300-character limit and cut at a word boundary rather than
  # ellipsized mid-word by the bridge.
  @preview_max 280

  defp build_preview_content(entry) do
    # A generated excerpt is a flat 280-character slice of the body that stops
    # mid-sentence, so only an excerpt the writer wrote is used as-is.
    source =
      cond do
        Map.get(entry, :excerpt_custom) == true and is_binary(entry.excerpt) and String.trim(entry.excerpt) != "" -> entry.excerpt
        is_binary(entry.body_html) -> entry.body_html
        true -> ""
      end

    text =
      source
      |> strip_html_tags()
      |> decode_entities()
      |> String.replace(~r/\s+/u, " ")
      |> String.trim()

    text =
      if String.length(text) > @preview_max do
        cut = String.slice(text, 0, @preview_max - 1)
        cut = Regex.replace(~r/\s+\S*$/u, cut, "")
        String.trim_trailing(cut, " ,;:-") <> "…"
      else
        text
      end

    if text == "", do: "", else: "<p>#{html_escape(text)}</p>"
  end

  defp strip_html_tags(html) when is_binary(html) do
    Regex.replace(~r/<[^>]+>/, html, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end
  defp strip_html_tags(_), do: ""

  @named_entities %{"amp" => "&", "lt" => "<", "gt" => ">", "quot" => "\"", "apos" => "'", "nbsp" => " "}

  # Plain text out of stored HTML text nodes, so it can be measured and
  # escaped once (otherwise "&amp;" comes out as "&amp;amp;").
  defp decode_entities(text) do
    Regex.replace(~r/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/i, text, fn whole, code ->
      cond do
        String.starts_with?(code, ["#x", "#X"]) -> codepoint(String.to_integer(String.slice(code, 2..-1//1), 16), whole)
        String.starts_with?(code, "#") -> codepoint(String.to_integer(String.slice(code, 1..-1//1)), whole)
        true -> Map.get(@named_entities, String.downcase(code), whole)
      end
    end)
  end

  defp codepoint(n, _whole) when n in 0x20..0xD7FF or n in 0xE000..0x10FFFF, do: <<n::utf8>>
  defp codepoint(_n, whole), do: whole

  # Builds the Article `content` field with a clean text hook prepended.
  # Front-loads title + excerpt + "Read more" link so Mastodon's truncated
  # display shows meaningful text instead of the start of raw HTML body.
  @archive_origin_names %{
    "livejournal" => "LiveJournal",
    "dreamwidth" => "Dreamwidth",
    "wordpress" => "WordPress",
    "medium" => "Medium",
    "substack" => "Substack"
  }

  @doc false
  def archive_line(%{archive_mark: true, imported_from: origin, published_at: %DateTime{} = at}) when is_binary(origin) do
    name = Map.get(@archive_origin_names, origin, String.capitalize(origin))
    "From my #{name} archive, first written #{Calendar.strftime(at, "%B %-d, %Y")}."
  end

  def archive_line(_), do: nil

  defp build_article_content(entry, sanitized_body, page_url) do
    parts = []

    # Title in bold
    parts =
      if entry.title && entry.title != "" do
        parts ++ ["<p><strong>#{html_escape(entry.title)}</strong></p>"]
      else
        parts
      end

    # Archive posts say so up front, so a post from 2004 doesn't read as news.
    parts =
      case archive_line(entry) do
        nil -> parts
        line -> parts ++ ["<p><em>#{html_escape(line)}</em></p>"]
      end

    # Excerpt or auto-generated summary
    excerpt_text =
      cond do
        entry.excerpt && entry.excerpt != "" ->
          entry.excerpt

        sanitized_body ->
          auto_generate_summary(sanitized_body, 300)

        true ->
          nil
      end

    parts =
      if excerpt_text && excerpt_text != "" do
        parts ++ ["<p>#{html_escape(excerpt_text)}</p>"]
      else
        parts
      end

    # Read more link
    parts = parts ++ ["<p>\u{1F4D6} <a href=\"#{page_url}\">Read the full entry on Inkwell</a></p>"]

    # Hashtags inline (Mastodon format)
    parts =
      if entry.tags && length(entry.tags) > 0 do
        frontend_host = federation_config(:frontend_host)
        tag_links = Enum.map(entry.tags, fn tag ->
          "<a href=\"#{frontend_host}/tag/#{URI.encode_www_form(tag)}\" class=\"mention hashtag\" rel=\"tag\">##{tag}</a>"
        end)
        parts ++ ["<p>#{Enum.join(tag_links, " ")}</p>"]
      else
        parts
      end

    # Separator + full body for clients that render Articles fully
    hook = Enum.join(parts, "\n")

    if sanitized_body && sanitized_body != "" do
      hook <> "\n<hr>\n" <> sanitized_body
    else
      hook
    end
  end

  # Auto-generates a summary from HTML content by stripping tags and
  # truncating at a sentence boundary (period, exclamation, or question mark).
  defp auto_generate_summary(html, max_chars) when is_binary(html) do
    plain =
      html
      |> strip_html_tags()
      |> String.trim()

    if String.length(plain) <= max_chars do
      plain
    else
      # Try to break at a sentence boundary
      truncated = String.slice(plain, 0, max_chars)

      case Regex.run(~r/^(.*[.!?])\s/s, truncated) do
        [_, at_sentence] when byte_size(at_sentence) > 50 ->
          String.trim(at_sentence)

        _ ->
          # Fall back to word boundary
          case Regex.run(~r/^(.*)\s\S*$/s, truncated) do
            [_, at_word] -> String.trim(at_word) <> "…"
            _ -> truncated <> "…"
          end
      end
    end
  end

  defp auto_generate_summary(_, _), do: nil

  @doc false
  # Rewrites root-relative `src="/..."` and `href="/..."` attributes to absolute
  # URLs on `base`. Leaves absolute, protocol-relative (`//`), fragment and
  # other schemes untouched.
  def absolutize_urls(nil, _base), do: nil
  def absolutize_urls(html, nil), do: html

  def absolutize_urls(html, base) when is_binary(html) and is_binary(base) do
    base = String.trim_trailing(base, "/")

    Regex.replace(~r/\b(src|href)=(["'])\/(?!\/)/i, html, fn _, attr, quote ->
      "#{attr}=#{quote}#{base}/"
    end)
  end

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
    # Extract images with optional figcaption text (for gallery photos and standalone figures)
    # First try to match images inside <figure> elements with captions
    figure_images =
      Regex.scan(~r/<figure[^>]*>.*?<img[^>]+src="([^"]+)"[^>]*>.*?(?:<figcaption[^>]*>(.*?)<\/figcaption>)?.*?<\/figure>/s, html)
      |> Enum.map(fn
        [_, src, caption] ->
          img = %{"type" => "Image", "url" => src, "mediaType" => guess_image_media_type(src)}
          caption = String.trim(caption || "")
          if caption != "", do: Map.put(img, "name", caption), else: img
        [_, src] ->
          %{"type" => "Image", "url" => src, "mediaType" => guess_image_media_type(src)}
      end)

    figure_srcs = MapSet.new(Enum.map(figure_images, & &1["url"]))

    # Then get standalone images not inside figures
    standalone_images =
      Regex.scan(~r/<img[^>]+src="([^"]+)"/, html)
      |> Enum.map(fn [_, src] ->
        %{"type" => "Image", "url" => src, "mediaType" => guess_image_media_type(src)}
      end)
      |> Enum.reject(fn img -> MapSet.member?(figure_srcs, img["url"]) end)

    (figure_images ++ standalone_images)
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

  # Deterministic short hash of an object URL for stable activity IDs.
  # Like/Announce/Follow IDs use this so Undo can reconstruct the same ID.
  defp object_hash(url) do
    :crypto.hash(:sha256, url)
    |> Base.url_encode64(padding: false)
    |> binary_part(0, 12)
  end

  # ── Quote post fields (FEP-e232 + backward compat) ──────────────────

  @doc false
  # Adds FEP-e232 Object Link tag + quoteUri/quoteUrl/_misskey_quote fields
  # when this entry quotes another entry. Also prepends a fallback
  # `<p class="quote-inline">RE: <a href="...">...</a></p>` to content
  # for servers that don't understand native quote embeds.
  defp maybe_add_quote_fields(article, entry, frontend_host) do
    quoted_ap_id = resolve_quoted_ap_id(entry, frontend_host)

    case quoted_ap_id do
      nil -> article
      ap_id ->
        # FEP-e232: Link in tag array with AP media type
        quote_link = %{
          "type" => "Link",
          "mediaType" => "application/ld+json; profile=\"https://www.w3.org/ns/activitystreams\"",
          "href" => ap_id,
          "name" => "RE: #{ap_id}"
        }

        existing_tags = article["tag"] || []
        article = Map.put(article, "tag", existing_tags ++ [quote_link])

        # Backward-compat fields for Misskey, Akkoma, Pleroma, and older Mastodon
        article =
          article
          |> Map.put("quoteUri", ap_id)
          |> Map.put("quoteUrl", ap_id)
          |> Map.put("_misskey_quote", ap_id)

        # Prepend fallback <p class="quote-inline"> to content for servers
        # that don't render native quote embeds (they show the link as text;
        # servers that DO render embeds hide elements with .quote-inline)
        existing_content = article["content"] || ""
        fallback = "<p class=\"quote-inline\">RE: <a href=\"#{ap_id}\">#{ap_id}</a></p>\n"
        Map.put(article, "content", fallback <> existing_content)
    end
  end

  # Resolves the AP ID of the quoted entry (local or remote)
  defp resolve_quoted_ap_id(entry, frontend_host) do
    cond do
      # Local quoted entry — AP ID is the entry's ap_id field
      Map.get(entry, :quoted_entry_id) != nil ->
        case Inkwell.Repo.get(Inkwell.Journals.Entry, entry.quoted_entry_id) do
          nil -> nil
          quoted -> quoted.ap_id || "#{frontend_host}/entries/#{quoted.id}"
        end

      # Remote quoted entry — AP ID is the remote entry's ap_id field
      Map.get(entry, :quoted_remote_entry_id) != nil ->
        case Inkwell.Repo.get(Inkwell.Federation.RemoteEntry, entry.quoted_remote_entry_id) do
          nil -> nil
          quoted -> quoted.ap_id
        end

      true ->
        nil
    end
  end
end
