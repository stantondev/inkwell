---
slug: "c0e0"
authors: silverpill <@silverpill@mitra.social>
type: implementation
status: DRAFT
dateReceived: 2024-08-08
discussionsTo: https://socialhub.activitypub.rocks/t/fep-c0e0-emoji-reactions/4443
trackingIssue: https://codeberg.org/fediverse/fep/issues/384
---
# FEP-c0e0: Emoji reactions

## Summary

This document describes how emoji reactions are implemented in [ActivityPub] network.

## History

Misskey supports emoji reactions since version [10.97.0](https://github.com/misskey-dev/misskey/releases/tag/10.97.0) (2019).  
Pleroma supports emoji reactions since version [2.0.0](https://pleroma.social/announcements/2020/03/08/pleroma-major-release-2-0-0/) (2020).

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC-2119].

## EmojiReact activity

`EmojiReact` activity type is considered to be a part of [LitePub] vocabulary. Its full IRI is `http://litepub.social/ns#EmojiReact`.

This activity is similar to `Like` activity. In addition to standard properties of `Like` activity, `EmojiReact` activity MUST have a `content` property. Reaction content MUST be either a single unicode grapheme, or a name of a custom emoji enclosed in colons ([shortcode][Shortcode]).

If custom emoji is used, `EmojiReact` activity MUST have a `tag` property containing a single [`Emoji`][FEP-9098] object. The value of its `name` property MUST contain the name of the custom emoji, and it SHOULD be enclosed in colons. The embedded `Emoji` can originate from a server that is different from the actor's server.

An actor can generate multiple `EmojiReact` activities for a single `object`. However, implementers MAY choose to not allow more than one reaction with the same emoji, or more than one reaction per object.

Example with unicode emoji:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "litepub": "http://litepub.social/ns#",
      "EmojiReact": "litepub:EmojiReact"
    }
  ],
  "actor": "https://alice.social/users/alice",
  "content": "🔥",
  "id": "https://alice.social/activities/65379d47-b7aa-4ef6-8e4f-41149dda1d2c",
  "object": "https://bob.social/objects/57caeb99-424c-4692-b74f-0a6682050932",
  "to": [
    "https://alice.social/users/alice/followers",
    "https://bob.social/users/bob"
  ],
  "type": "EmojiReact"
}
```

Example with custom emoji:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "toot": "http://joinmastodon.org/ns#",
      "Emoji": "toot:Emoji",
      "litepub": "http://litepub.social/ns#",
      "EmojiReact": "litepub:EmojiReact"
    }
  ],
  "actor": "https://alice.social/users/alice",
  "content": ":blobwtfnotlikethis:",
  "id": "https://alice.social/activities/65379d47-b7aa-4ef6-8e4f-41149dda1d2c",
  "object": "https://bob.social/objects/57caeb99-424c-4692-b74f-0a6682050932",
  "tag": [
    {
      "icon": {
        "mediaType": "image/png",
        "type": "Image",
        "url": "https://alice.social/files/1b0510f2-1fb4-43f5-a399-10053bbd8f0f"
      },
      "id": "https://alice.social/emojis/blobwtfnotlikethis",
      "name": ":blobwtfnotlikethis:",
      "type": "Emoji",
      "updated": "2024-02-07T02:21:46.497Z"
    }
  ],
  "to": [
    "https://alice.social/users/alice/followers",
    "https://bob.social/users/bob"
  ],
  "type": "EmojiReact"
}
```

## Like with content

Emoji reaction can also be represented as a `Like` activity. This variant of emoji reaction will processed by non-supporting implementations as a regular "like", and when that is preferable, implementers MAY use `Like` type instead of `EmojiReact` type.

Implementations MUST process `Like` with `content` in the same way as `EmojiReact` activities.

## Undo reaction

Emoji reactions can be retracted using a standard `Undo` activity:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams"
  ],
  "actor": "https://alice.social/users/alice",
  "id": "https://alice.social/activities/99b8f47b-f3a9-4cf5-94a2-95352e7462d6",
  "object": "https://alice.social/activities/65379d47-b7aa-4ef6-8e4f-41149dda1d2c",
  "to": [
    "https://alice.social/users/alice/followers",
    "https://bob.social/users/bob"
  ],
  "type": "Undo"
}
```

## `emojiReactions` collection

The list of emoji reactions to an object can be exposed using the `emojiReactions` property. Its full IRI is `http://fedibird.com/ns#emojiReactions`.

The URL specified by this property MUST resolve to a collection containing `Like` (with `content`) and `EmojiReact` activities.

## Implementations

This document is based on implementations of emoji reactions in Misskey, Pleroma and Fedibird.

A number of other projects announced support for this FEP after it was published:

- [Hollo](https://hollo.social/@hollo/0192479d-cbcc-7e4d-b2f1-1e0f8de61ea7)
- [Mitra](https://codeberg.org/silverpill/mitra/src/commit/3458b584bdb649f32cccac0e55ad10844debd397/FEDERATION.md#supported-feps)
- [PieFed](https://codeberg.org/rimu/pyfedi/src/commit/7ea1930b0601c4a0521da6e37e0a732b38c98c3b/FEDERATION.md#partially-supported-feps)
- [Iceshrimp.NET](https://iceshrimp.dev/iceshrimp/Iceshrimp.NET/src/commit/65d6edf799169a0dc88d895f52a8a32071b5f0c4/FEDERATION.md#supported-feps)

## References

- Christine Lemmer Webber, Jessica Tallon, [ActivityPub][ActivityPub], 2018
- S. Bradner, [Key words for use in RFCs to Indicate Requirement Levels][RFC-2119], 1997
- LitePub contributors, [LitePub protocol suite][LitePub], 2019
- silverpill, [FEP-9098: Custom emojis][FEP-9098], 2025

[ActivityPub]: https://www.w3.org/TR/activitypub/
[RFC-2119]: https://tools.ietf.org/html/rfc2119.html
[LitePub]: https://litepub.social/
[Shortcode]: https://emojipedia.org/shortcodes
[FEP-9098]: https://codeberg.org/fediverse/fep/src/branch/main/fep/9098/fep-9098.md

## Copyright

CC0 1.0 Universal (CC0 1.0) Public Domain Dedication

To the extent possible under law, the authors of this Fediverse Enhancement Proposal have waived all copyright and related or neighboring rights to this work.
