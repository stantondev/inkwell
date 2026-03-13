# FEDERATION.md

Inkwell is a federated social journaling platform built on ActivityPub. Users are discoverable and followable from Mastodon, Pleroma, GoToSocial, Pixelfed, and other fediverse software at `@username@inkwell.social`.

This document follows the [FEP-67ff](https://codeberg.org/fediverse/fep/src/branch/main/fep/67ff/fep-67ff.md) convention for describing federation behavior.

## Supported Federation Protocols and Standards

- [ActivityPub](https://www.w3.org/TR/activitypub/) (Server-to-Server only)
- [WebFinger](https://www.rfc-editor.org/rfc/rfc7033) (RFC 7033)
- [HTTP Signatures](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures) (Cavage draft, RSA-SHA256)
- [NodeInfo 2.1](https://nodeinfo.diaspora.software/protocol)

## Supported FEPs

- [FEP-67ff: FEDERATION.md](https://codeberg.org/fediverse/fep/src/branch/main/fep/67ff/fep-67ff.md) — this document
- [FEP-b2b8: Long-form Text](https://codeberg.org/fediverse/fep/src/branch/main/fep/b2b8/fep-b2b8.md) — entries federated as `Article` with `preview` Note for microblogging consumers
- [FEP-7458: Using replies collection](https://codeberg.org/fediverse/fep/src/branch/main/fep/7458/fep-7458.md) — inbound replies accepted regardless of visibility scope (not just Public-addressed)

---

## ActivityPub Details

### Actor Type

Inkwell users are represented as `Person` actors.

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1"
  ],
  "type": "Person",
  "id": "https://inkwell-api.fly.dev/users/alice",
  "preferredUsername": "alice",
  "name": "Alice",
  "summary": "<p>Bio as HTML</p>",
  "url": "https://inkwell.social/alice",
  "inbox": "https://inkwell-api.fly.dev/users/alice/inbox",
  "outbox": "https://inkwell-api.fly.dev/users/alice/outbox",
  "followers": "https://inkwell-api.fly.dev/users/alice/followers",
  "following": "https://inkwell-api.fly.dev/users/alice/following",
  "discoverable": true,
  "publicKey": {
    "id": "https://inkwell-api.fly.dev/users/alice#main-key",
    "owner": "https://inkwell-api.fly.dev/users/alice",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  },
  "icon": {
    "type": "Image",
    "mediaType": "image/jpeg",
    "url": "https://inkwell-api.fly.dev/api/avatars/alice"
  },
  "image": {
    "type": "Image",
    "mediaType": "image/jpeg",
    "url": "https://inkwell-api.fly.dev/api/banners/alice"
  }
}
```

- `id` and inbox/outbox URLs use the API host (`inkwell-api.fly.dev`)
- `url` points to the frontend profile page (`inkwell.social`)
- `icon` and `image` are served as binary images from API endpoints (not inline data URIs)
- RSA-2048 key pairs are generated on user registration
- Actors without an avatar or banner omit those fields entirely

### Object Types

#### Article (Journal Entries)

Inkwell publishes journal entries as `Article` objects per [FEP-b2b8](https://codeberg.org/fediverse/fep/src/branch/main/fep/b2b8/fep-b2b8.md).

```json
{
  "type": "Article",
  "id": "https://inkwell-api.fly.dev/entries/550e8400-e29b-41d4-a716-446655440000",
  "attributedTo": "https://inkwell-api.fly.dev/users/alice",
  "name": "Entry Title",
  "content": "<p>Full entry body as HTML</p>",
  "summary": "Plain text excerpt (max 300 chars)",
  "url": "https://inkwell.social/alice/entry-slug",
  "published": "2026-03-13T12:00:00Z",
  "updated": "2026-03-13T14:30:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://inkwell-api.fly.dev/users/alice/followers"],
  "image": {
    "type": "Link",
    "href": "https://inkwell-api.fly.dev/api/images/image-uuid",
    "mediaType": "image/jpeg"
  },
  "tag": [
    {
      "type": "Hashtag",
      "name": "#journaling",
      "href": "https://inkwell.social/tag/journaling"
    }
  ],
  "generator": {
    "type": "Application",
    "name": "Inkwell",
    "url": "https://inkwell.social"
  },
  "preview": {
    "type": "Note",
    "content": "<p><strong>Entry Title</strong></p><p>Excerpt text...</p>"
  }
}
```

- Only **public, published** entries are federated
- `name` is the entry title (plain text). Omitted if the entry has no title
- `summary` is the entry excerpt (plain text). **Not** a content warning — see Sensitive Content below
- `updated` is included only when the entry was edited more than 60 seconds after publication (avoids false positives from same-transaction timestamp differences)
- `image` is the cover image, if one exists
- `preview` contains a simplified `Note` for microblogging consumers (e.g., Mastodon) that don't render `Article` objects inline. Contains the title as bold text plus the excerpt or a truncated body

#### Note (Replies)

Comments on remote entries are sent as `Note` objects with `inReplyTo`:

```json
{
  "type": "Note",
  "id": "https://inkwell-api.fly.dev/users/alice#reply-1710000000",
  "attributedTo": "https://inkwell-api.fly.dev/users/alice",
  "content": "<p>Great post!</p>",
  "inReplyTo": "https://remote.example/posts/12345",
  "published": "2026-03-13T12:00:00Z",
  "to": ["https://remote.example/users/bob"],
  "cc": [
    "https://www.w3.org/ns/activitystreams#Public",
    "https://inkwell-api.fly.dev/users/alice/followers"
  ],
  "tag": [
    {
      "type": "Mention",
      "href": "https://remote.example/users/bob",
      "name": "@bob@remote.example"
    }
  ]
}
```

- Reply is addressed `to` the original post author (ensures notification)
- Public URI and commenter's followers in `cc`
- `Mention` tag included with `@user@domain` name

### Sensitive Content

When an entry is marked as sensitive (by author or admin):

```json
{
  "type": "Article",
  "sensitive": true,
  "summary": "Content warning text here",
  ...
}
```

- `sensitive: true` flag follows the Mastodon convention
- `summary` is repurposed as the content warning text (max 200 chars). Falls back to "Sensitive content" if no warning text is set
- When `sensitive` is true, `summary` is always the content warning — never the excerpt. Non-sensitive entries use `summary` for the excerpt per FEP-b2b8

### Hashtags

- Entry tags are included in the `tag` array as `Hashtag` objects
- `name` is prefixed with `#` (e.g., `#journaling`)
- `href` links to the tag browse page on Inkwell
- Inbound hashtags are normalized to lowercase and stored without the `#` prefix

---

## Activities Sent (Outbound)

| Activity | When | Addressing |
|---|---|---|
| `Create { Article }` | Entry published with public visibility | `to: [Public]`, `cc: [followers]` |
| `Update { Article }` | Published entry edited | `to: [Public]`, `cc: [followers]` |
| `Delete { Tombstone }` | Entry or comment deleted | `to: [Public]`, `cc: [followers]` |
| `Follow` | Relay subscription (from instance actor) | `to: [relay actor]` |
| `Accept { Follow }` | Inbound Follow request auto-accepted | `to: [remote actor]` |
| `Undo { Follow }` | Relay unsubscription | `to: [relay actor]` |
| `Like` | User stamps a remote entry | `to: [post author]` |
| `Undo { Like }` | User removes stamp from remote entry | `to: [post author]` |
| `Announce` | User inks (boosts) a public entry | `to: [Public]`, `cc: [followers]` |
| `Undo { Announce }` | User removes ink from entry | `to: [Public]`, `cc: [followers]` |
| `Create { Note }` | User comments on a remote entry | `to: [post author]`, `cc: [Public, followers]` |

**Delivery**: Activities are sent asynchronously via background workers to the shared inbox (preferred) or individual inbox of each remote follower. Duplicate inbox URLs are deduplicated before delivery.

---

## Activities Handled (Inbound)

All inbound activities **require a valid HTTP Signature**. Activities with missing, malformed, or invalid signatures are rejected with `401 Unauthorized`.

| Activity | Behavior |
|---|---|
| `Follow` | Auto-accepted. Creates follower relationship. Sends `Accept` back. Creates notification for the local user. Duplicate Follow re-sends Accept without creating a new notification. |
| `Undo { Follow }` | Removes follower relationship. |
| `Create { Note }` (reply) | If `inReplyTo` references a local entry, stored as a federated comment. Replies to unknown entries are silently ignored. Accepts replies regardless of addressing (per FEP-7458). |
| `Create { Note/Article/Page }` (standalone) | Public posts stored as remote entries for Explore discovery. Non-public posts are ignored. |
| `Update { Note/Article/Page }` | Updates existing comment body or remote entry content in-place. |
| `Delete` | Removes the matching comment or remote entry. Associated data (inks, stamps, comments) cleaned up via foreign key cascade. |
| `Accept { Follow }` | Marks our outbound Follow request as accepted. Sets mutual follow flags. For relay subscriptions, triggers outbox backfill. |
| `Like` | Creates a federated ink on the liked entry. Increments `ink_count`. Creates notification. Deduplicated by `[remote_actor_id, entry_id]`. |
| `Undo { Like }` | Removes the federated ink. Decrements `ink_count`. |
| `Announce` | If the announced object is a local entry, creates a federated ink (boost). If the announced object is remote and from a relay, fetches and stores the object. |
| `Undo { Announce }` | Removes the federated ink created by the Announce. |
| Other types | Logged and silently accepted (202). |

### Inkwell-Specific Mapping

Inkwell has two interaction types that map to/from standard ActivityPub activities:

- **Stamps** (appreciation tokens like postage stamps) map to `Like` in ActivityPub. Stamping a remote entry sends a `Like`; receiving a `Like` creates a federated ink (not a stamp — stamps are a local-only UI concept)
- **Inks** (discovery/boost signal) map to `Announce` in ActivityPub. Inking a public entry sends an `Announce` (appears as a boost on Mastodon); receiving an `Announce` of a local entry creates a federated ink

---

## Content Negotiation

The actor endpoint (`GET /users/{username}`) is content-negotiated:
- Requests with `Accept: application/activity+json` or `Accept: application/ld+json` receive the AP Person JSON
- All other requests are redirected to the frontend profile page

Entry objects are similarly content-negotiated:
- `GET /entries/{uuid}` returns Article JSON for AP requests, 404 otherwise
- `GET /{username}/{slug}` — the Next.js middleware detects AP Accept headers on 2-segment paths and proxies to the API for Article JSON

---

## WebFinger

**Endpoint**: `GET /.well-known/webfinger?resource=acct:{username}@{domain}`

Returns a JRD (JSON Resource Descriptor) with:
- `rel: "self"` pointing to the AP actor endpoint (`application/activity+json`)
- `rel: "http://webfinger.net/rel/profile-page"` pointing to the frontend profile (`text/html`)

Accepted domains: `inkwell.social`, `api.inkwell.social`, `inkwell-api.fly.dev`.

---

## NodeInfo

**Schema**: [NodeInfo 2.1](https://nodeinfo.diaspora.software/protocol)

**Discovery**: `GET /.well-known/nodeinfo` returns a links array pointing to `GET /nodeinfo/2.1`.

**Response** includes:
- `software.name`: `"inkwell"`
- `software.repository`: `"https://github.com/stantondev/inkwell"`
- `software.homepage`: `"https://inkwell.social"`
- `protocols`: `["activitypub"]`
- `usage.users.total`, `usage.users.activeHalfyear`, `usage.users.activeMonth`
- `usage.localPosts` (published entries), `usage.localComments`
- `openRegistrations`: `true`

---

## HTTP Signatures

**Algorithm**: `rsa-sha256` (Cavage draft)

**Outbound signing**:
- Headers signed: `(request-target)`, `host`, `date`, `digest`
- Digest: SHA-256 of the request body, Base64-encoded
- Key ID format: `{actor_url}#main-key`

**Inbound verification**:
1. Parse `Signature` header to extract `keyId`, `headers`, `signature`
2. Derive actor URI from `keyId` (strip `#` fragment)
3. Fetch remote actor document (cached 24 hours)
4. Extract `publicKeyPem` from actor's `publicKey` object
5. Reconstruct signing string from the headers listed in the signature
6. Verify via RSA public key

**Hard reject**: All inbound inbox activities without a valid signature are rejected with `401 Unauthorized`. There is no permissive/soft-fail mode.

---

## Shared Inbox

Inkwell accepts activities at both:
- **User inbox**: `POST /users/{username}/inbox`
- **Shared inbox**: `POST /inbox`

Both endpoints perform identical signature verification and activity processing. Remote servers should prefer the shared inbox to reduce delivery requests.

---

## Relay Support

Inkwell supports subscribing to ActivityPub relays for content discovery.

**Subscription flow**:
1. Admin enters a relay actor URL
2. Inkwell sends `Follow` from an instance actor (reserved username `"relay"`)
3. Relay sends `Accept { Follow }`
4. Relay broadcasts `Announce { Note/Article/Page }` activities
5. Inkwell fetches the announced objects and stores them as remote entries

**Supported relay protocols**: ActivityRelay-style relays that broadcast via `Announce` activities. The relay actor is followed directly (not the Public collection).

**Content retention**: Relay-sourced content is retained for 14 days, then automatically cleaned up.

---

## Collections

| Collection | URL | Behavior |
|---|---|---|
| Outbox | `/users/{username}/outbox` | Paginated (20 items/page). Contains `Create { Article }` activities for public published entries only. |
| Followers | `/users/{username}/followers` | Returns total count only (`totalItems`). Individual follower URIs are not exposed. |
| Following | `/users/{username}/following` | Returns total count only (`totalItems`). Individual following URIs are not exposed. |

---

## Content Limits

| Field | Maximum |
|---|---|
| Entry title | 500 characters |
| Entry body | No hard limit (HTML) |
| Entry excerpt | 300 characters |
| Content warning | 200 characters |
| Display name | 100 characters |
| Bio (plain text) | 2,000 characters |
| Bio (HTML) | 10,000 characters |
| Comment body | 2,000 characters |
| Hashtags per entry | No explicit limit |

---

## Remote Entry Verification

Inkwell periodically verifies that remote (fediverse) entries still exist at their source by making HTTP HEAD requests to the original URL. Entries returning 404 or 410 are deleted locally (with cascade cleanup of associated inks, comments, and stamps). Entries returning 5xx are assumed temporarily unavailable and skipped. Verification runs every 4 hours in batches of 50 with per-domain rate limiting.

---

## Known Interoperability Notes

- **Mastodon Article rendering**: Mastodon does not natively display `Article` objects inline in timelines. Inkwell includes a `preview` Note inside each Article so Mastodon users see a title + excerpt summary. The full article is accessible via the `url` link.
- **Two-host architecture**: Inkwell uses separate domains for the API (`inkwell-api.fly.dev` / `api.inkwell.social`) and frontend (`inkwell.social`). AP actor IDs use the API host. The frontend proxies federation requests via `X-Original-Host` header to ensure HTTP signature verification succeeds.
- **Follow auto-accept**: All Follow requests are automatically accepted. There is no manual approval / locked account mode.
- **Client-to-Server**: Not implemented. Inkwell uses a custom REST API for client interactions, not the ActivityPub C2S protocol.
- **Sensitive content summary conflict**: When an entry is sensitive, the `summary` field contains the content warning text (Mastodon convention). When an entry is not sensitive, `summary` contains the excerpt (FEP-b2b8 convention). Consumers should check the `sensitive` flag to determine which interpretation applies.

---

## Source Code

Federation is implemented natively in Elixir/Phoenix (no sidecar).

| File | Purpose |
|---|---|
| `apps/api/lib/inkwell/federation/activity_builder.ex` | Builds outbound AP activities and objects |
| `apps/api/lib/inkwell_web/controllers/federation_controller.ex` | Inbox processing, actor/outbox/webfinger endpoints |
| `apps/api/lib/inkwell/federation/http_signature.ex` | HTTP Signature signing and verification |
| `apps/api/lib/inkwell/federation/http.ex` | Signed HTTP client for fetching remote actors/objects |
| `apps/api/lib/inkwell/federation/remote_actor.ex` | Remote actor caching and fetching |
| `apps/api/lib/inkwell/federation/remote_entries.ex` | Remote entry storage and queries |
| `apps/api/lib/inkwell/federation/relays.ex` | Relay subscription management |
| `apps/api/lib/inkwell/federation/workers/` | Async delivery, fan-out, relay content, outbox fetch workers |

Repository: [github.com/stantondev/inkwell](https://github.com/stantondev/inkwell)
