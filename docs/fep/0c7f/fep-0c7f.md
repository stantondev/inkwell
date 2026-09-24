---
slug: "0c7f"
authors: Stanton Melvin <hello@inkwell.social>
status: DRAFT
dateReceived: TBD
trackingIssue: TBD
discussionsTo: TBD
---
# FEP-0c7f: Imported Objects

## Summary

People bring their writing to the Fediverse from elsewhere: years of LiveJournal entries, a WordPress blog, a Substack archive, an export from a server that has since shut down. ActivityPub has no way to say that an object is one of these. Receiving servers see a post published today, or a post dated 2004 that arrived today, and treat it as new: it reaches home timelines, notifies the people it mentions, and counts toward trending hashtags.

This proposal defines `importedFrom`, a property that marks an object as brought over from somewhere else and says where. It asks publishers to keep the original publication date and to make imported objects available without pushing them to followers, and it asks receivers to show them as archive material rather than new activity.

It complements [FEP-1580], which moves objects between ActivityPub servers and already asks the new server not to emit activities for them. This proposal covers content from outside ActivityPub and gives FEP-1580 implementations a standard way to mark what they moved.

## Motivation

Moving to the Fediverse usually means leaving your history behind or flooding your followers with it:

- **Flooding.** A writer imports 800 blog posts. If each is delivered as a `Create`, every follower's timeline fills with posts from years ago, hashtag trends are skewed, and people named in 2009 get notifications today.
- **Losing the date.** To avoid that, some software publishes imports as brand-new posts dated today, or not at all. The history is either misdated or gone.
- **No provenance.** A reader who comes across an imported post can't tell it was first written elsewhere, years earlier, or where to find the original.

[FEP-73cd] (Migration User Stories) describes people exporting archives and republishing them on another server (stories 4, 5 and 7). [FEP-1580] handles moves between ActivityPub servers. Neither covers importing from outside ActivityPub, and neither tells receiving servers how to treat an old object when one arrives.

Implementations currently rely on heuristics such as comparing `published` with the time of delivery. Those differ between implementations, can't tell an import from a delayed delivery, and say nothing about where the object came from.

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC-2119].

## Terminology

- **Imported object**: an object whose content was first published somewhere other than its current ActivityPub server (another platform, another website, or another ActivityPub server) and was later brought to its current server by or for its author.
- **Publisher**: the server that hosts the imported object.
- **Receiver**: any other server that obtains the object, whether by delivery, by fetching it, or by reading a collection.

## The `importedFrom` property

`importedFrom` is a property of an Object. Its value is a `Link` describing where the object was originally published.

| Property of the Link | Value |
|---|---|
| `href` | REQUIRED. The object's original location (its old permalink or ActivityPub id). If that is not known, the address of the site or platform it came from. |
| `name` | RECOMMENDED. The human-readable name of the site or platform, such as `"LiveJournal"`. |
| `mediaType` | OPTIONAL. As in ActivityStreams. |

The object's `published` property MUST be the date and time the content was originally published, when known.

Example: a journal entry imported from LiveJournal.

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/fep/0c7f"
  ],
  "type": "Article",
  "id": "https://inkwell.example/entries/550e8400-e29b-41d4-a716-446655440000",
  "attributedTo": "https://inkwell.example/users/alice",
  "name": "The last day of school",
  "content": "<p>…</p>",
  "published": "2004-06-11T21:14:00Z",
  "importedFrom": {
    "type": "Link",
    "href": "https://alice.livejournal.com/12345.html",
    "name": "LiveJournal"
  },
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://inkwell.example/users/alice/followers"]
}
```

Example: an entry from a blog export whose original addresses no longer exist.

```json
{
  "importedFrom": {
    "type": "Link",
    "href": "https://oldblog.example/",
    "name": "Old Blog"
  }
}
```

### Context

The term is defined in the `https://w3id.org/fep/0c7f` namespace:

```json
{
  "@context": {
    "importedFrom": {
      "@id": "https://w3id.org/fep/0c7f#importedFrom",
      "@type": "@id"
    }
  }
}
```

Consumers that don't process JSON-LD SHOULD recognise the compact term `importedFrom`.

## Publishers

1. A publisher that imports an object SHOULD include `importedFrom` on it and MUST keep `importedFrom` on it for as long as it serves the object, including after edits.
2. `published` MUST be the original publication time when it is known. When it isn't, the publisher MAY use the time of import, and SHOULD still include `importedFrom`.
3. A publisher SHOULD NOT deliver `Create` activities for imported objects. It SHOULD make them available by dereferencing their ids and MAY list them in the actor's outbox and other collections. This matches FEP-1580's rule for migrated objects.
4. If the author explicitly asks for imported objects to be delivered to followers, the publisher MAY do so, and MUST include `importedFrom` so receivers can apply the rules below.
5. An `Update` to an imported object is an ordinary edit. It MUST NOT remove `importedFrom` and SHOULD NOT change `published`.
6. Mentions of people in imported content refer to accounts on the original platform. A publisher SHOULD NOT turn them into `Mention` tags addressed to Fediverse actors unless the author has confirmed that each one is the same person.
7. A publisher that migrates objects under FEP-1580 SHOULD add `importedFrom` to them, with `href` set to the object's id on the source server.

## Receivers

1. A receiver MUST NOT reject an object only because its `published` time is far in the past.
2. A receiver that obtains an object with `importedFrom`, whether by delivery, by fetching it, or through a collection:
   1. SHOULD NOT present it as new: it SHOULD NOT place it at the top of home or public timelines, and MAY place it by its `published` time instead.
   2. SHOULD NOT create notifications because of it, such as for mentions, replies or quotes.
   3. SHOULD NOT count it toward trending hashtags, links or posts.
   4. SHOULD show readers that it was imported, with the name of the source when one is given and the original publication date.
3. Replies, likes and boosts of an imported object are new activity and are handled normally.
4. `importedFrom` is a claim by the publisher, not proof. A receiver MUST NOT treat it as evidence that the author wrote or owned the original. A receiver MAY show `href` as a link, SHOULD NOT fetch it automatically, and MUST NOT use it to change the object's attribution.

## Relation to other proposals

- **[FEP-1580] (Move actor objects with a migration collection)** says timestamps must be preserved, that the target server should not emit activities for migrated objects, and that servers "MAY add … additional properties to indicate an object has been migrated". `importedFrom` is offered as that property.
- **[FEP-73cd] (Migration user stories)**: stories 4, 5 and 7 describe exported archives being republished elsewhere; this proposal describes how the result should federate.
- **[FEP-6fcd] (Account export container format)**: an importer reading such an archive can set `importedFrom.href` to each object's original id.
- **[FEP-b2b8] (Long-form text)**: the property applies to `Article` objects without changing anything else about them.

## Security and privacy considerations

- **Backdating.** Nothing stops a publisher from giving a new object an old `published` time with `importedFrom`, for example to avoid moderation queues or rate limits that key on recent activity. Receivers MAY apply their usual moderation to imported objects, and MAY treat unusually large numbers of them from one actor as suspicious.
- **False provenance.** `importedFrom` can name any URL. This is why receivers must not treat it as proof of authorship and should not fetch it automatically (which would also make every receiver a request amplifier toward that URL).
- **Old mentions.** Content written years ago on another platform may name people who never expected it to reach them. Not notifying on imported objects, and not converting old mentions into `Mention` tags, limits that exposure.
- **Visibility.** Importing does not change who may see an object. Publishers MUST apply the author's chosen audience; private or friends-only posts from the original platform MUST NOT become public by being imported.

## Implementations

- **Inkwell** (<https://inkwell.social>): imports from LiveJournal, Dreamwidth, WordPress, Medium and Substack keep their original dates and are not delivered to followers. Drafts dated more than 7 days back that are published in bulk are not delivered unless the author asks. Imported entries record their source platform and, when the importer knows it, their original URL, and can show an "archive" mark. Emitting `importedFrom` is planned.

## Open questions

- Should there be a separate `importedAt` time, distinct from `published`?
- Should `importedFrom` allow a list, for content that passed through more than one platform?
- Should imported comments by other people from the original platform be in scope?
- Should a publisher send one notice when a large import finishes (for example "Alice brought over 800 posts from LiveJournal"), and if so, how should it be shaped?

## References

- [ActivityPub] Christine Lemmer-Webber, Jessica Tallon, Erin Shepherd, Amy Guy, Evan Prodromou, [ActivityPub], 2018
- [ActivityStreams] James M Snell, Evan Prodromou, [Activity Streams 2.0], 2017
- [RFC-2119] S. Bradner, [Key words for use in RFCs to Indicate Requirement Levels][RFC-2119], 1997
- [FEP-1580] Jonny Saunders, [FEP-1580: Move Actor Objects with a migration Collection][FEP-1580]
- [FEP-73cd] [FEP-73cd: Migration User Stories][FEP-73cd]
- [FEP-6fcd] [FEP-6fcd: Account Export Container Format][FEP-6fcd]
- [FEP-b2b8] [FEP-b2b8: Long-form Text][FEP-b2b8]
- [FEP-888d] [FEP-888d: Using https://w3id.org/fep as a base for FEP-specific namespaces][FEP-888d]

[ActivityPub]: https://www.w3.org/TR/activitypub/
[Activity Streams 2.0]: https://www.w3.org/TR/activitystreams-core/
[RFC-2119]: https://tools.ietf.org/html/rfc2119
[FEP-1580]: https://codeberg.org/fediverse/fep/src/branch/main/fep/1580/fep-1580.md
[FEP-73cd]: https://codeberg.org/fediverse/fep/src/branch/main/fep/73cd/fep-73cd.md
[FEP-6fcd]: https://codeberg.org/fediverse/fep/src/branch/main/fep/6fcd/fep-6fcd.md
[FEP-b2b8]: https://codeberg.org/fediverse/fep/src/branch/main/fep/b2b8/fep-b2b8.md
[FEP-888d]: https://codeberg.org/fediverse/fep/src/branch/main/fep/888d/fep-888d.md

## Copyright

CC0 1.0 Universal (CC0 1.0) Public Domain Dedication

To the extent possible under law, the authors of this Fediverse Enhancement Proposal have waived all copyright and related or neighboring rights to this work.
