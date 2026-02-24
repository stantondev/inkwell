# Direct Messaging — Architecture Design

**Status**: Design only (2026-02-24). No code written. Awaiting approval before implementation.

---

## Overview

Direct Messaging (DMs) lets two Inkwell users exchange private messages with each other. The initial scope is **1:1 only** — no group threads. Federation (sending DMs to Mastodon/ActivityPub peers) is intentionally deferred; federation support requires significant infrastructure work and can be layered on later without breaking the schema.

---

## Scope (v1)

**In scope:**
- 1:1 private conversations between Inkwell users
- Threaded message history per conversation
- Unread count badge in nav (same pattern as notifications)
- Real-time feel via polling (no WebSockets required for v1)
- Soft-delete: users can delete messages on their own side
- Privacy control: only accepted pen pals can DM each other

**Out of scope (v1):**
- Group DMs / multi-user threads
- Federation with external ActivityPub actors
- File/image attachments in DMs
- Message reactions
- Read receipts shown to sender
- Typing indicators

---

## Data Model

### `conversations` table

Represents a 1:1 conversation between two users. Uses canonical ordering to ensure only one row per pair.

```sql
conversations
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  participant_a   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  participant_b   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  last_message_at utc_datetime_usec
  inserted_at     utc_datetime_usec NOT NULL
  updated_at      utc_datetime_usec NOT NULL

  UNIQUE (participant_a, participant_b)
  CHECK (participant_a < participant_b)   -- canonical ordering, always (lower UUID, higher UUID)
```

The canonical ordering constraint (`participant_a < participant_b`) means we never need to query "conversations WHERE (a = me AND b = them) OR (a = them AND b = me)" — it's always a single lookup.

### `direct_messages` table

Individual messages within a conversation.

```sql
direct_messages
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  body            text NOT NULL    -- plain text for now; consider Markdown later
  deleted_by_a    boolean NOT NULL DEFAULT false
  deleted_by_b    boolean NOT NULL DEFAULT false
  inserted_at     utc_datetime_usec NOT NULL
  updated_at      utc_datetime_usec NOT NULL
```

Soft-delete: `deleted_by_a` and `deleted_by_b` track per-participant deletion. A message is fully deleted from a conversation when both sides have deleted it (or when a user is deleted via cascade).

### `conversation_reads` table

Tracks the last-read position per participant, enabling unread counts without marking individual messages.

```sql
conversation_reads
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  last_read_at    utc_datetime_usec NOT NULL

  PRIMARY KEY (conversation_id, user_id)
```

Unread count for a user = count of messages in their conversations where `inserted_at > last_read_at` and `sender_id != user_id`.

### Indexes

```sql
CREATE INDEX idx_dm_conversation_inserted ON direct_messages (conversation_id, inserted_at DESC);
CREATE INDEX idx_conversation_participant ON conversations (participant_a, participant_b);
CREATE INDEX idx_conversation_last_message ON conversations (last_message_at DESC);
```

---

## Privacy Model

- Only users with an **accepted** relationship (`status = :accepted` in `relationships`) can initiate or reply to DMs.
- Blocked users cannot send or receive DMs. The existing `relationships` block state enforces this.
- If a relationship is later removed/blocked, existing conversation history remains readable by both parties but new messages are rejected.

---

## API Design

All endpoints are authenticated (`require_auth` pipeline).

### Conversations

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/conversations` | List all conversations for current user, ordered by `last_message_at DESC`. Returns unread count per conversation. |
| `POST` | `/api/conversations` | Create or find existing conversation with a target user. Body: `{ "username": "penpal" }`. Returns the conversation (existing or new). |
| `GET` | `/api/conversations/:id` | Get conversation metadata + recent messages (paginated, newest first). Marks as read. |

### Messages

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/conversations/:id/messages` | Send a message. Body: `{ "body": "..." }`. Creates message, updates `last_message_at`, fires notification. |
| `DELETE` | `/api/conversations/:id/messages/:msg_id` | Soft-delete a message on the sender's side only. |

### Read state

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/conversations/:id/read` | Mark all messages in conversation as read (upserts `conversation_reads`). Called when user opens a conversation. |

### Unread count

The existing `GET /api/auth/me` response will gain a new field `unread_dm_count` alongside `unread_notification_count`. Computed as: count of conversations where any message exists with `inserted_at > last_read_at` (or no read record exists).

---

## Elixir Context Structure

```
apps/api/lib/inkwell/
  messaging/
    conversation.ex         # Ecto schema for conversations
    direct_message.ex       # Ecto schema for direct_messages
    conversation_read.ex    # Ecto schema for conversation_reads
  messaging.ex              # Context module
    - list_conversations/1
    - get_or_create_conversation/2
    - list_messages/3          (conversation_id, viewer_id, page opts)
    - send_message/3           (conversation_id, sender_id, body)
    - delete_message/3         (message_id, deleter_id)
    - mark_read/2              (conversation_id, user_id)
    - count_unread_dms/1       (user_id)

apps/api/lib/inkwell_web/
  controllers/
    conversation_controller.ex
    message_controller.ex
```

---

## Controller Response Shapes

### `GET /api/conversations`

```json
{
  "data": [
    {
      "id": "...",
      "other_user": {
        "username": "alice",
        "display_name": "Alice",
        "avatar_url": "..."
      },
      "last_message": {
        "body": "Hey, how are you?",
        "sender_username": "alice",
        "inserted_at": "2026-02-24T10:00:00Z"
      },
      "unread_count": 3,
      "last_message_at": "2026-02-24T10:00:00Z"
    }
  ]
}
```

### `GET /api/conversations/:id`

```json
{
  "data": {
    "id": "...",
    "other_user": { "username": "alice", "display_name": "Alice", "avatar_url": "..." },
    "messages": [
      {
        "id": "...",
        "body": "Hey!",
        "sender_username": "alice",
        "is_mine": false,
        "inserted_at": "2026-02-24T10:00:00Z"
      }
    ],
    "page": 1,
    "has_more": false
  }
}
```

### `POST /api/conversations/:id/messages`

```json
{
  "data": {
    "id": "...",
    "body": "Thanks!",
    "sender_username": "stanton",
    "is_mine": true,
    "inserted_at": "2026-02-24T10:01:00Z"
  }
}
```

---

## Notification Integration

Sending a DM creates a notification of type `:dm` for the recipient (if not currently in the conversation). Notification payload:

```json
{
  "type": "dm",
  "actor": { "username": "alice", ... },
  "conversation_id": "...",
  "preview": "Hey, how are you?"   // first 60 chars of message
}
```

The notification links to `/messages/:conversation_id`.

Self-notification is suppressed (same pattern as stamps/comments).

---

## Frontend Routes

| Route | Component | Notes |
|---|---|---|
| `/messages` | Messages index — list of conversations | Server component wrapper, client list |
| `/messages/:id` | Conversation thread | Client component with polling |

### Polling Strategy (v1)

No WebSockets in v1. The conversation thread page polls `GET /api/conversations/:id?since=<last_message_id>` every **5 seconds** when the tab is focused (`visibilitychange` API). On tab blur, polling stops. This gives near-real-time feel without infrastructure cost.

The `since` param: server returns only messages with `inserted_at > message[since].inserted_at`. This avoids refetching the whole history on each poll.

### Nav Integration

- Desktop nav: new envelope icon between Notifications bell and Profile avatar, with unread badge (capped at "9+")
- Mobile hamburger: "Messages" entry with count badge, same position as Notifications
- `unread_dm_count` sourced from `GET /api/auth/me` (refreshed every page visit via middleware)

---

## Migration Plan

Three new migrations (to be numbered sequentially after `000014`):

```
20260222000015_create_conversations.exs
20260222000016_create_direct_messages.exs
20260222000017_create_conversation_reads.exs
```

Could be combined into one migration for cleanliness, but three keeps the rollback granularity clear.

---

## Open Questions (to resolve before building)

1. **Message length limit** — 2000 chars? 5000? Same as journal entry max?
2. **Markdown in DMs** — Plain text is simpler and safer. Rich text (bold/italic links) is nice but adds TipTap complexity. Recommendation: plain text v1, links auto-detected on render.
3. **Pagination** — Load 50 messages at a time, infinite scroll upward (like iMessage). Or simpler: just load last 100 and show "Load older" link?
4. **Delete behavior** — If both sides delete a message, remove from DB immediately? Or keep for audit? Recommendation: soft-delete forever (matches feedback post anonymous preservation pattern).
5. **Relationship requirement strictness** — Should users be able to DM before following each other, if they've spoken before? Or always require accepted pen-pal status? Recommendation: accepted pen-pals only (protects against spam, consistent with site ethos).
6. **Message notifications** — Should every message create a notification, or only the first unread message per conversation? Recommendation: only if the recipient has no unread messages in that conversation yet (avoids notification spam).

---

## Effort Estimate

| Phase | Work | Estimate |
|---|---|---|
| Schema + migrations | 3 tables, indexes | 0.5 days |
| Elixir context + controllers | CRUD + auth checks | 1 day |
| Phoenix routes + auth | Wire up API | 0.5 days |
| Next.js proxy routes | 5–6 route handlers | 0.5 days |
| Messages index page | List of conversations | 0.5 days |
| Conversation thread page | Messages + send form + polling | 1.5 days |
| Nav badge + auth/me integration | Unread count | 0.5 days |
| Notifications integration | New DM notification type | 0.5 days |
| **Total** | | **~5.5 days** |
