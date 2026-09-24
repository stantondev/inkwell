# FEDERATION.md

Inkwell is a social journaling platform that federates over ActivityPub. Every member is followable from Mastodon, GoToSocial, Pleroma/Akkoma, Misskey, Pixelfed, NodeBB, WordPress and other fediverse software as `@username@inkwell.social`.

This document follows [FEP-67ff](https://codeberg.org/fediverse/fep/src/branch/main/fep/67ff/fep-67ff.md). It describes what the code does today; when they disagree, the code wins and this file is out of date. Last reviewed 2026-09-24.

## Supported federation protocols and standards

- [ActivityPub](https://www.w3.org/TR/activitypub/), server-to-server only (no client-to-server API)
- [WebFinger](https://www.rfc-editor.org/rfc/rfc7033)
- HTTP signatures:
  - [draft-cavage HTTP Signatures](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures), `rsa-sha256`, sent and verified
  - [RFC 9421 HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421) with [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530) `Content-Digest`, verified on inbound requests (`rsa-v1_5-sha256` only; Mastodon 4.7 sends these)
- [NodeInfo](https://nodeinfo.diaspora.software/protocol) 2.0 and 2.1

## Supported FEPs

| FEP | How Inkwell uses it |
|---|---|
| [FEP-67ff](https://codeberg.org/fediverse/fep/src/branch/main/fep/67ff/fep-67ff.md) FEDERATION.md | This document. NodeInfo 2.1 `software.repository` points to the repository that holds it. |
| [FEP-f1d5](https://codeberg.org/fediverse/fep/src/branch/main/fep/f1d5/fep-f1d5.md) / [FEP-0151](https://codeberg.org/fediverse/fep/src/branch/main/fep/0151/fep-0151.md) NodeInfo | NodeInfo with `metadata.nodeName`, `nodeDescription`, `staffAccounts` and `federation.enabled`. Usage counts leave out suspended accounts, drafts, hidden posts and stored fediverse replies. |
| [FEP-b2b8](https://codeberg.org/fediverse/fep/src/branch/main/fep/b2b8/fep-b2b8.md) Long-form Text | Journal entries are `Article`s with `name`, `summary`, `preview` and a cover `image`. |
| [FEP-e232](https://codeberg.org/fediverse/fep/src/branch/main/fep/e232/fep-e232.md) Object Links | Quote reprints carry an object-link `tag` to the quoted post (plus `quoteUri`, `quoteUrl`, `_misskey_quote` and a `quote-inline` fallback paragraph). Sent only. |
| [FEP-7458](https://codeberg.org/fediverse/fep/src/branch/main/fep/7458/fep-7458.md) Replies collection | When a fediverse post is opened on Inkwell, its `replies` collection is read to fill in the conversation. Inkwell does not publish `replies` collections itself. |
| [FEP-400e](https://codeberg.org/fediverse/fep/src/branch/main/fep/400e/fep-400e.md) Publicly-appendable collections | The profile guestbook. See [Guestbook](#guestbook-fep-400e). |
| [FEP-2345](https://codeberg.org/fediverse/fep/src/branch/main/fep/2345/fep-2345.md) `fediverse:creator` | Entry and profile pages carry `<meta name="fediverse:creator">`; actors list `attributionDomains`. |
| [FEP-0c7f](docs/fep/0c7f/fep-0c7f.md) Imported Objects (**draft by Inkwell, not yet submitted**) | Imported entries carry `importedFrom`; mentions in incoming objects that carry it don't notify. See [Imported entries](#imported-entries-fep-0c7f). |

---

## Hosts

Inkwell runs a web app and an API on separate hosts; both answer on `inkwell.social` for federation.

- Actor, object and collection ids use `https://inkwell.social/...`. The web app proxies these paths to the API (`X-Original-Host` carries the original host so signatures verify).
- A member's profile and entry pages may also be served on their own domain (a Plus feature). Their ActivityPub identity never changes: it stays `@username@inkwell.social`. Server-level endpoints (NodeInfo) return 404 on those domains.
- WebFinger accepts `acct:` resources on `inkwell.social`, `api.inkwell.social` and `inkwell-api.fly.dev`, and always answers with the `inkwell.social` subject.

---

## Actors

Members are `Person` actors.

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1",
    {
      "inkwell": "https://inkwell.social/ns#",
      "guestbook": { "@id": "inkwell:guestbook", "@type": "@id" },
      "attributionDomains": {
        "@id": "https://joinmastodon.org/ns#attributionDomains",
        "@container": "@set"
      }
    }
  ],
  "type": "Person",
  "id": "https://inkwell.social/users/alice",
  "preferredUsername": "alice",
  "name": "Alice",
  "summary": "<p>Bio as HTML</p>",
  "url": "https://inkwell.social/alice",
  "inbox": "https://inkwell.social/users/alice/inbox",
  "outbox": "https://inkwell.social/users/alice/outbox",
  "followers": "https://inkwell.social/users/alice/followers",
  "following": "https://inkwell.social/users/alice/following",
  "featured": "https://inkwell.social/users/alice/featured",
  "guestbook": "https://inkwell.social/users/alice/guestbook",
  "endpoints": { "sharedInbox": "https://inkwell.social/inbox" },
  "discoverable": true,
  "attributionDomains": ["inkwell.social", "alice-writes.example"],
  "publicKey": {
    "id": "https://inkwell.social/users/alice#main-key",
    "owner": "https://inkwell.social/users/alice",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n..."
  },
  "icon": {
    "type": "Image",
    "mediaType": "image/jpeg",
    "url": "https://inkwell.social/api/avatars/alice?v=Xk3p9QaZr1Lm"
  },
  "image": {
    "type": "Image",
    "mediaType": "image/jpeg",
    "url": "https://inkwell.social/api/banners/alice?v=b7Tq0Pw2sNcd"
  },
  "attachment": [
    { "type": "PropertyValue", "name": "Website", "value": "<a href=\"https://example.com\" rel=\"nofollow noopener noreferrer\" target=\"_blank\">https://example.com</a>" }
  ]
}
```

- `icon` and `image` URLs carry `?v=` with a hash of the stored image, so the URL changes exactly when the picture does (Mastodon only re-downloads an avatar when its URL changes). Actors without an avatar or banner omit them.
- `attachment` holds profile links (website, Bluesky, Mastodon, GitHub, X) as `PropertyValue`s.
- `attributionDomains` is `inkwell.social` plus the member's custom domain when one is active (FEP-2345).
- Profile edits that change anything above are sent to followers as `Update{Person}`, at most once a minute per member.
- RSA-2048 keys are generated at signup.
- `GET /users/{username}` is content-negotiated: `application/activity+json` or `application/ld+json` gets the actor; browsers are redirected to the profile page. The same applies to the guestbook URLs below.

An instance actor with the reserved username `relay` signs outbound fetches and follows relays. It has no guestbook.

---

## Objects

### Article (journal entries)

Entries are `Article`s following FEP-b2b8.

```json
{
  "type": "Article",
  "id": "https://inkwell.social/entries/550e8400-e29b-41d4-a716-446655440000",
  "url": "https://inkwell.social/alice/entry-slug",
  "attributedTo": "https://inkwell.social/users/alice",
  "name": "Entry title",
  "summary": "Plain-text excerpt",
  "content": "<p><strong>Entry title</strong></p><p>Excerpt…</p><p><a href=\"…\">Read the full entry on Inkwell</a></p><hr><p>Full body…</p>",
  "published": "2026-03-13T12:00:00Z",
  "updated": "2026-03-13T14:30:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://inkwell.social/users/alice/followers"],
  "image": { "type": "Link", "href": "https://inkwell.social/api/images/…", "mediaType": "image/jpeg" },
  "tag": [{ "type": "Hashtag", "name": "#journaling", "href": "https://inkwell.social/tag/journaling" }],
  "generator": { "type": "Application", "name": "Inkwell", "url": "https://inkwell.social" },
  "preview": { "type": "Note", "content": "Excerpt, at most 280 characters" }
}
```

- Only **public, published** entries federate. Friends-only, custom-list, circle-members-only and private entries are never sent and 404 when fetched.
- `content` starts with a short readable lead (title, excerpt, link, hashtags) and then the full body after an `<hr>`. Mastodon cuts `Article` content short, so the lead is what Mastodon readers see. Clients that render the whole Article get the full text.
- `summary` is the excerpt, always present (generated from the body when the writer didn't write one). For sensitive entries it is the content warning instead; see [Sensitive content](#sensitive-content).
- `preview` is the excerpt alone, cut at a word boundary to at most 280 characters. Bridgy Fed uses it as the Bluesky post text.
- Relative links and images in the body are made absolute.
- Entries fetched by their page URL (`/alice/entry-slug` with an ActivityPub `Accept` header) return the same `Article`.
- Entries imported from another platform and marked as archive posts start their content with a line such as "From my LiveJournal archive, first written March 23, 2004."

### Imported entries (FEP-0c7f)

Entries imported from LiveJournal, Dreamwidth, WordPress, Medium or Substack keep their original `published` date, are not delivered to followers when imported, and carry `importedFrom`:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1",
    { "importedFrom": { "@id": "https://w3id.org/fep/0c7f#importedFrom", "@type": "@id" } }
  ],
  "type": "Article",
  "published": "2004-06-11T21:14:00Z",
  "importedFrom": {
    "type": "Link",
    "href": "https://alice.livejournal.com/12345.html",
    "name": "LiveJournal"
  }
}
```

`href` is the original post when the importer knew it, otherwise the platform's home page. WordPress posts without their original URL have no `importedFrom`. The term's context is only added to objects (and the `Create`/`Update` wrapping them) that use it. FEP-0c7f is Inkwell's own draft; see [docs/fep/0c7f](docs/fep/0c7f/fep-0c7f.md).

### Note (stickies)

Stickies (short posts, up to 500 characters, no title) are sent as `Note`s with the full text, so Mastodon shows them whole. Their ids are also `/entries/{uuid}`.

### Note (comments)

Comments written on Inkwell go out as `Note`s with `inReplyTo`:

- A comment on a **fediverse post** replies to that post, is addressed `to` its author with the public collection and the commenter's followers in `cc`, and carries a `Mention` of the author.
- A comment on an **Inkwell entry** is sent to the entry author's followers' servers so it threads under the entry.
- A reply to another comment points `inReplyTo` at that comment (our `/comments/{id}` or the fediverse comment's own id) and mentions its author.
- Comment ids are `https://inkwell.social/comments/{id}` and dereference to the `Note` (browsers are redirected to the conversation).

Editing or deleting a comment is not federated yet.

### Note (letters)

Letters are Inkwell's private messages. A letter to a fediverse account is a `Create{Note}` addressed to that account alone (`to: [actor]`, `cc: []`) with a `Mention` tag. `inReplyTo` is the previous note in the conversation, and `context`/`conversation` are copied from the other side when known. Edits are sent as `Update`. Letter ids (`/letters/notes/{id}`) return 404, like any private post.

Members can only write to fediverse accounts they follow, that follow them, or that wrote to them first and were accepted.

### Guestbook (FEP-400e)

Each member's guestbook is a publicly-appendable `OrderedCollection` at `/users/{username}/guestbook`:

```json
{
  "type": "OrderedCollection",
  "id": "https://inkwell.social/users/alice/guestbook",
  "attributedTo": "https://inkwell.social/users/alice",
  "totalItems": 7,
  "first": "https://inkwell.social/users/alice/guestbook?page=1"
}
```

- Pages hold 20 items, newest first. Items are ids: `https://inkwell.social/users/alice/guestbook/{id}` for signatures written on Inkwell (these dereference to a `Note` with `target`), or the signer's own object id for fediverse signatures.
- **To sign it**, send a public `Create{Note}` to the owner whose `target` is the collection (either the id string or `{ "type": "OrderedCollection", "id": …, "attributedTo": … }`). The note must be `attributedTo` the actor that sends it. Inkwell stores the note as plain text (at most 500 characters, with a leading @mention of the owner removed) and answers the signer with `Add { object: note, target: guestbook }`.
- When the owner removes a fediverse signature, Inkwell sends the signer `Remove { object: note, target: guestbook }`. A `Delete` of the note from its author removes it too.
- Signatures from accounts the owner blocked, from blocked domains or from defederated servers are dropped without an `Add`.

For Mastodon users, the older way still works. Each member has a public note at `/users/{username}/guestbook-post`, and replying to it signs the guestbook.

### Sensitive content

Entries marked sensitive by their writer or an admin are sent with `sensitive: true`, and `summary` holds the content-warning text (default "Sensitive content"), following Mastodon's convention. Check `sensitive` to tell whether `summary` is a warning or an excerpt.

### Hashtags and mentions

Tags are `Hashtag` objects (`name` with `#`, `href` to `/tag/{tag}`, URL-encoded, so non-Latin tags work). Mentions of members and fediverse accounts are `Mention` tags with an h-card link in the content. Inbound hashtags are stored lowercase without the `#`.

---

## Activities sent

| Activity | When | Sent to |
|---|---|---|
| `Create {Article}` / `Create {Note}` | A public entry or sticky is published, or a published post is made public | Followers |
| `Update {Article}` / `Update {Note}` | A public post is edited | Followers |
| `Delete {Tombstone}` | A public post is deleted, or made non-public | Followers |
| `Update {Person}` | A profile edit changes what the actor shows | Followers |
| `Create {Note}` (comment) | A member comments on a fediverse post or an Inkwell entry | The post's author and the relevant followers |
| `Create {Note}` / `Update {Note}` (letter) | A letter to a fediverse account is sent or edited | That account only |
| `Like` / `Undo {Like}` | A member stamps (or unstamps) a fediverse post | The post's author |
| `Announce` / `Undo {Announce}` | A member reprints (or un-reprints) a public post | The member's followers |
| `Create {Article}` with FEP-e232 tag | A member quote-reprints a post | The member's followers |
| `Follow` / `Undo {Follow}` | A member follows or unfollows a fediverse account; the instance actor subscribes to a relay | That account or relay |
| `Accept {Follow}` | A fediverse account follows a member (accepted automatically) | The follower |
| `Add` / `Remove` | A guestbook signature is accepted or taken down | The signer |
| `Follow`, `Block`, `Undo {Block}` | A member switches sharing to Bluesky on or off (Bridgy Fed opts people in with a follow and out with a block) | `https://bsky.brid.gy/bsky.brid.gy` |

- **Old posts go out quietly.** Drafts dated more than 7 days back that are published in bulk (for example after an import) are not sent to followers unless the writer asks. They can still be fetched. Bulk "make public" follows the same rule.
- **Delivery** is asynchronous, to shared inboxes when available, deduplicated per inbox, with retries for timeouts and 5xx responses and none for 401/403/404/410.
- Inks (Inkwell's discovery signal) are local only and send nothing.

---

## Activities received

Inbox and shared inbox (`POST /users/{username}/inbox`, `POST /inbox`) verify the signature and the actor's origin, then process the activity in the background and answer `202`.

| Activity | Behavior |
|---|---|
| `Follow` | Accepted automatically; `Accept` sent back; the member is notified once. Dropped silently if the member blocked the account or its domain. |
| `Undo {Follow}` | Removes the follower. |
| `Accept {Follow}` | Marks our follow as accepted. For relays, starts receiving relayed posts. |
| `Create {Note/Article/Page}`, reply to an Inkwell entry or comment | Stored as a comment and threaded, **only if the reply is publicly addressed** (public or unlisted). Followers-only and direct replies reach the people they mention as a private notification instead. |
| `Create {Note}` targeting a guestbook | Signs it. See [Guestbook](#guestbook-fep-400e). |
| `Create {Note}`, reply to a guestbook post | Signs the guestbook (the older way). |
| `Create {Note}`, private, to exactly one member | Becomes a letter if the two are connected; otherwise a letter request (if the member accepts them), or a mention notification. |
| `Create {Note/Article/Page}`, other public posts | Stored as a fediverse post for Explore and Feed. A mention of the inbox's owner notifies them, unless the object carries `importedFrom` (FEP-0c7f). Video and audio attachments become players; image attachments are kept. |
| `Update` | Updates the stored comment, post or letter. Only a letter's own author can edit it. |
| `Delete` | Removes the matching comment, post, guestbook signature or letter. A `Delete` of an actor removes that account and everything cached from it. |
| `Like` | Counts as an ink on the entry (Inkwell's discovery signal) and notifies the writer. |
| `Undo {Like}` | Removes that ink. |
| `Announce` | A boost of an Inkwell entry is recorded as a reprint and notifies the writer. An `Announce` from a subscribed relay fetches and stores the relayed post. |
| `Undo {Announce}` | Removes the reprint. |
| Anything else | Accepted with `202` and ignored. |

Additional rules:

- **Duplicates.** Replies and letters are unique by their ActivityPub id; a redelivery (common when a post mentions two members) is stored once and notifies once.
- **Blocks.** A member's blocked accounts and blocked domains cannot comment, sign their guestbook, mention or message them, or follow them. Inbound Likes and Announces are not filtered yet; they only change counts. Admin-defederated domains are dropped for everyone.
- **Deleted accounts.** A `Delete` from an account whose server returns 404/410 for its key is accepted rather than refused. The key is gone, so the signature can never verify, and refusing it only makes the sender retry for days. The account is removed only when it deletes itself.
- **Forwarded activities** (signed by a different server than the actor's) are refused for now. Inkwell does not verify LD Signatures.

---

## Collections

| Collection | URL | Contents |
|---|---|---|
| Outbox | `/users/{username}/outbox` | `Create` activities for public published posts, 20 per page. |
| Followers | `/users/{username}/followers` | `totalItems` only. Members aren't listed. |
| Following | `/users/{username}/following` | `totalItems` only. |
| Featured | `/users/{username}/featured` | Up to 5 entry ids: pinned entries first, then the newest public entries. Mastodon only loads these when it first discovers an account, so this is how a new writer's profile on Mastodon isn't empty. |
| Guestbook | `/users/{username}/guestbook` | FEP-400e collection, paged. See above. |

---

## HTTP signatures

**Outbound POST** (delivery): draft-cavage, `algorithm="rsa-sha256"`, signed headers `(request-target) host date digest`, `Digest: SHA-256=…`, key id `https://inkwell.social/users/{username}#main-key`.

**Outbound GET** (fetching actors): signed with the instance actor's key over `(request-target) host date accept`, so servers that require signed fetches (GoToSocial, Mastodon's authorized fetch mode) answer.

**Inbound:**

1. The scheme is chosen by the shape of the `Signature` header: draft-cavage parameters, or RFC 9421 `sig1=:…:` with a `Signature-Input` header.
2. The key is resolved from `keyId`: fragment ids (`…#main-key`) by removing the fragment, path ids (`…/main-key`, GoToSocial) by fetching the key and following its `owner`.
3. The `Date` header must be within 12 hours.
4. `Digest` (draft-cavage) or `Content-Digest` (RFC 9530) is compared to the actual body when it is covered by the signature.
5. On failure the actor is re-fetched once, in case its key rotated.
6. Missing or invalid signatures get `401`. There is no permissive mode.

Remote actors are cached for 4 hours; failed fetches are cached for 1 hour. Outbound requests time out after 5 seconds.

Only RSA keys are supported; Ed25519 (FEP-521a `assertionMethod`) is not verified.

---

## WebFinger and NodeInfo

- `GET /.well-known/webfinger?resource=acct:{username}@inkwell.social` returns `self` (the actor, `application/activity+json`) and `http://webfinger.net/rel/profile-page`.
- `GET /.well-known/nodeinfo` links NodeInfo 2.0 and 2.1. 2.1 includes `software.repository` and `software.homepage`. `protocols` is `["activitypub"]`. Registrations are open.

---

## Relays

The instance actor can follow ActivityRelay-style relays. Relayed posts arrive as `Announce`s, are fetched, filtered (bot accounts, very short posts and link-only posts are skipped) and kept for 14 days.

---

## Bluesky

Members can opt in to sharing on Bluesky through [Bridgy Fed](https://fed.brid.gy/): switching it on follows the Bridgy Fed actor, switching it off sends it a `Block` (switching on again sends `Undo {Block}` first). Only public posts are bridged.

---

## Known limitations

- No client-to-server ActivityPub.
- No locked accounts: every follow is accepted.
- Friends-only and custom-list posts don't federate at all, not even to followers on other servers.
- Comment edits and deletions aren't federated.
- Inbound `Reject`, `Move`, `Flag` and `Block` are ignored.
- Forwarded activities are refused (no LD Signatures).
- Inbound Likes and Announces from blocked accounts still count.
- Group DMs aren't supported: a private note to more than one member arrives as a mention notification.
- Signing another server's FEP-400e wall from Inkwell isn't supported; only Inkwell guestbooks can be signed.
- The `https://inkwell.social/ns#` namespace document doesn't resolve yet.

---

## Source code

Federation is implemented in the Phoenix API.

| File | Purpose |
|---|---|
| `apps/api/lib/inkwell/federation/activity_builder.ex` | Builds actors, objects and activities |
| `apps/api/lib/inkwell_web/controllers/federation_controller.ex` | Actor, collection, object, WebFinger and NodeInfo endpoints; inbox processing |
| `apps/api/lib/inkwell/federation/http_signature.ex`, `rfc9421.ex` | Signing and verification |
| `apps/api/lib/inkwell/federation/http.ex`, `remote_actor.ex` | Fetching and caching remote actors and objects |
| `apps/api/lib/inkwell/federation/workers/` | Delivery, fan-out, relay, outbox and reply-fetch workers |
| `apps/api/lib/inkwell/guestbook/federation.ex` | Guestbook collection (FEP-400e) |
| `apps/api/lib/inkwell/letters/federation.ex` | Letters to and from fediverse accounts |
| `apps/api/lib/inkwell/federation/bluesky_bridge.ex` | Bluesky sharing via Bridgy Fed |
| `apps/web/src/app/users/`, `inbox/`, `entries/`, `comments/`, `.well-known/` | Next.js proxies that serve these URLs on inkwell.social |

Repository: [github.com/stantondev/inkwell](https://github.com/stantondev/inkwell). Questions and interoperability reports: [inkwell.social/roadmap](https://inkwell.social/roadmap) or hello@inkwell.social.
