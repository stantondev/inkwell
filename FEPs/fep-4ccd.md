---
slug: "4ccd"
authors: Evan Prodromou <evan@prodromou.name>
status: DRAFT
dateReceived: 2023-06-21
trackingIssue: https://codeberg.org/fediverse/fep/issues/129
discussionsTo: https://codeberg.org/evanp/fep/issues
---
# FEP-4ccd: Pending Followers Collection and Pending Following Collection

## Summary

This ActivityPub extension defines two collections, `pendingFollowers` and `pendingFollowing`, with which users can review and manage their pending follow requests.

## Motivation

[ActivityPub] represents a directed social graph with `followers` and `following` properties on actors. To initiate a relationship, a `Follow` activity is sent from the potential follower to the followed actor, who can `Accept` or `Reject` it.

Between the time that a `Follow` is sent and the time that it is accepted or rejected, the relationship is in a pending state. This is not represented in the ActivityPub data model.

The new `pendingFollowers` collection can be used to review incoming `Follow` activities to `Accept` or `Reject` them.

The new `pendingFollowing` collection can be used to review outgoing `Follow` activities to `Undo` them.

Because the full activity data is needed to `Accept`, `Reject` or `Undo`, these collections should include `Follow` activities, and not just the actors requesting to follow.

Note that this extension is primarily useful for clients and servers that implement the ActivityPub API. Furthermore, it is primarily useful for actors that manually approve followers. The [manuallyApprovesFollowers](https://swicg.github.io/miscellany#manuallyApprovesFollowers) property in the [ActivityPub Miscellaneous Terms][miscellany] can be used to indicate that an actor manually approves followers.

## Context

The context document for this ActivityPub extension is at `https://purl.archive.org/socialweb/pending`. Its contents are as follows:

```json
{
  "@context": {
    "pdg": "https://purl.archive.org/socialweb/pending#",
    "pendingFollowers": {
      "@id": "pdg:pendingFollowers",
      "@type": "@id"
    },
    "pendingFollowing": {
      "@id": "pdg:pendingFollowing",
      "@type": "@id"
    },
    "pendingFollowersOf": {
      "@id": "pdg:pendingFollowersOf",
      "@type": "@id"
    },
    "pendingFollowingOf": {
      "@id": "pdg:pendingFollowingOf",
      "@type": "@id"
    }
  }
}
```

### Semantic versioning

For compatibility, the context document for this extension has aliases using [semantic versioning][semver].

- `https://purl.archive.org/socialweb/pending/1.1.0`. This version is immutable.
- `https://purl.archive.org/socialweb/pending/1.1`. This version may be updated with bug fixes, documentation, or minor changes, but no new terms.
- `https://purl.archive.org/socialweb/pending/1`. This version may be updated with bug fixes or minor changes, and may include new terms, but will not include breaking changes.
- `https://purl.archive.org/socialweb/pending`. This version may be updated with bug fixes or minor changes, may include new terms, and may include breaking changes. It is the latest version of the context document.

All terms in the context document use the same namespace, `https://purl.archive.org/socialweb/pending#`.

## Properties

As with other ActivityPub properties, the values of these properties can be included by a reference URL, or by an [embedded node object](https://www.w3.org/TR/json-ld11/#embedding).

### `pendingFollowers`

| | |
|---|---|
| URI | `https://purl.archive.org/socialweb/pending#pendingFollowers` |
| Notes | `pendingFollowers` is a collection of `Follow` activities that have been sent **to** the actor, but have not yet been accepted or rejected. Items in the collection MUST be in reverse chronological order. Items in the collections MUST be `Follow` activities. They MUST be unique by `id`. Each `actor` of a `Follow` activity in the collection MUST be unique by `id`. |
| Domain | Object (ActivityPub actor) |
| Range | `OrderedCollection` or `Collection` |
| Functional | Yes |

### `pendingFollowing`

| | |
|---|---|
| URI | `https://purl.archive.org/socialweb/pending#pendingFollowing` |
| Notes | `pendingFollowing` is a property of an actor. It is a collection of `Follow` activities that have been sent **by** the actor, but have not yet been accepted or rejected. They MUST be unique by `id`. Each `object` of a `Follow` activity in the collection MUST be unique by `id`.|
| Domain | Object (ActivityPub actor) |
| Range | `OrderedCollection` or `Collection` |
| Functional | Yes |

### `pendingFollowersOf`

| | |
|---|---|
| URI | `https://purl.archive.org/socialweb/pending#pendingFollowersOf` |
| Notes | This property identifies the actor for which the specified collection is the `pendingFollowers` collection. It is an inverse property of `pendingFollowers`. |
| Domain | `Collection` or `OrderedCollection` |
| Range | Object (ActivityPub actor) |
| Functional | Yes |

### `pendingFollowingOf`

| | |
|---|---|
| URI | `https://purl.archive.org/socialweb/pending#pendingFollowingOf` |
| Notes | This property identifies the actor for which the specified collection is the `pendingFollowing` collection. It is an inverse property of `pendingFollowing`. |
| Domain | `Collection` or `OrderedCollection` |
| Range | Object (ActivityPub actor) |
| Functional | Yes |

## Examples

A publisher can include the `pendingFollowers` and `pendingFollowing` collection in the properties of an actor.

### Actor with `pendingFollowers` and `pendingFollowing`

```json
{
    "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://purl.archive.org/socialweb/pending/1"
    ],
    "id": "https://example.com/evanp",
    "type": "Person",
    "name": "Evan Prodromou",
    "inbox": "https://example.com/evanp/inbox",
    "outbox": "https://example.com/evanp/outbox",
    "following": "https://example.com/evanp/following",
    "followers": "https://example.com/evanp/followers",
    "liked": "https://example.com/evanp/liked",
    "pendingFollowers": "https://example.com/evanp/pendingFollowers",
    "pendingFollowing": {
        "id": "https://example.com/evanp/pendingFollowing",
        "type": "Collection",
        "name": "Pending following for Evan Prodromou",
        "totalItems": 2
    },
    "manuallyApprovesFollowers": true,
    "to": ["as:Public"]
}
```

Notice that the `pendingFollowers` property is a URL, while the `pendingFollowing` property is an embedded object with useful additional properties.

### `pendingFollowers` collection

Retrieving the `pendingFollowers` collection shows incoming follow requests
for this actor.

```json
{
    "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://purl.archive.org/socialweb/pending/1"
    ],
    "id": "https://example.com/evanp/pendingFollowers",
    "type": "OrderedCollection",
    "attributedTo": "https://example.com/evanp",
    "pendingFollowersOf": "https://example.com/evanp",
    "name": "Pending followers for Evan Prodromou",
    "orderedItems": [
        {
            "type": "Follow",
            "id": "https://example.net/alyssa/follow/7",
            "summary": "Alyssa wants to follow Evan",
            "content": "Hey, Evan! It's Alyssa from the conference.",
            "actor": {
                "id": "https://example.net/alyssa",
                "type": "Person",
                "name": "Alyssa P. Hacker"
            },
            "to": "https://example.com/evanp",
            "cc": "as:Public",
            "published": "2023-06-21T12:00:00Z"
        },
        {
            "type": ["http://custom.example/ns/Archive", "Follow"],
            "id": "https://social.example/jokebot3000/follow/287",
            "summary": "Jokebot 3000 wants to follow Evan to archive his jokes",
            "actor": {
                "id": "https://social.example/jokebot3000",
                "type": "Application",
                "name": "Jokebot 3000"
            },
            "to": "https://example.com/evanp",
            "cc": "as:Public",
            "published": "2023-05-07T12:00:00Z"
        }
    ]
}
```

Note that the second, earlier `Follow` activity has a custom `type` property. Note also that the `object` of the `Follow` activities, which will be the same for every activity, is elided for clarity and space.

### `pendingFollowing` collection

```json
{
    "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://purl.archive.org/socialweb/pending/1",
        {"sports": "https://sports.example/ns#"}
    ],
    "id": "https://example.com/evanp/pendingFollowing",
    "type": "Collection",
    "attributedTo": "https://example.com/evanp",
    "pendingFollowingOf": "https://example.com/evanp",
    "name": "Pending following for Evan Prodromou",
    "items": [
        {
            "type": ["sports:Fan", "Follow"],
            "id": "https://example.com/evanp/fan/309",
            "summary": "Evan is a fan of Jimena",
            "actor": "https://example.com/evanp",
            "object": {
                "id": "https://tennis.example/jimena",
                "type": "Person",
                "name": "Jimena Suarez"
            },
            "to": "https://tennis.example/jimena",
            "cc": "as:Public",
            "published": "2023-04-19T12:00:00Z"
        },
        {
            "type": "Follow",
            "id": "https://example.net/evanp/follow/214",
            "summary": "Evan wants to follow Montreal Weather Updates",
            "actor": "https://example.com/evanp",
            "object": {
                "id": "https://weather.example/canada/quebec/montreal",
                "type": "Service",
                "name": "Montreal Weather Updates"
            },
            "to": "https://weather.example/canada/quebec/montreal",
            "cc": "as:Public",
            "published": "2023-02-11T12:00:00Z"
        }
    ]
}
```

Note that the first `Follow` activity has a custom `type` property. Also note that even though the collection's type is `Collection` and the items property is `items`, the activities still must be in reverse chronological order.

## Processing requirements

An actor that manually approves followers SHOULD include the `manuallyApprovesFollowers` property in their actor object, with a value of `true`. This indicates that the actor will review and approve or reject incoming follow requests.

When a server receives an otherwise valid `Follow` activity from a client, it SHOULD add that activity to the `pendingFollowing` collection of the sending actor. The server SHOULD also add the `Follow` activity to the `pendingFollowers` collection of the actor that is being followed, if the followed actor is on the same server.

When a server receives an otherwise valid `Follow` activity from another server, it SHOULD add that activity to the `pendingFollowers` collection of the followed actor.

When a server receives an `Accept` or `Reject` activity with a `Follow` activity as `object` from a client, it SHOULD remove that `Follow` activity from the `pendingFollowers` collection of the actor. The server SHOULD also remove the `Follow` activity from the `pendingFollowing` collection of the actor that initiated the follow, if the following actor is on the same server.

When a server receives an `Accept` or `Reject` activity with a `Follow` activity as `object` from another server, it SHOULD remove that `Follow` activity from the `pendingFollowing` collection of the receiving actor.

When a server receives an `Undo` activity with a `Follow` activity as `object` from a client, it SHOULD remove that `Follow` activity from the `pendingFollowing` collection of the actor that sent the `Follow`. It SHOULD also remove the `Follow` activity from the `pendingFollowers` collection of the actor that was followed, if the followed actor is on the same server.

When a server receives an `Undo` activity with a `Follow` activity as `object` from another server, it SHOULD remove that `Follow` activity from the `pendingFollowers` collection of the receiving actor.

The following [Harel statechart](https://www.sciencedirect.com/science/article/pii/0167642387900359) illustrates the state transitions for a `Follow` activity between actors A1 and A2. The states show which objects belong to which collections, and the transitions show when activities are received and processed via the client API and then the server federation protocol.

![Pending Followers and Following Statechart](./Follow-State-Diagram.drawio.png)

## Security considerations

The `pendingFollowers` and `pendingFollowing` collections are sensitive information about
an actor's social connections. For privacy, some services and actors do not share the `following` or `followers` collections. If not similarly protected, the `pendingFollowers` and `pendingFollowing` collections could be used to infer information about the actor's social connections before they are established.

Some services or actors do not forward `Reject` activities to the actor of a `Follow` activity. Harassing or abusive actors may try to determine if the actor has rejected their follow request by fetching the `pendingFollowers` collection.

For these reasons, publishers SHOULD NOT make the `pendingFollowers` and `pendingFollowing` collections visible to unauthenticated users. Publishers SHOULD NOT make the `pendingFollowers` and `pendingFollowing` collections visible to authenticated users who are not the actor.

## Implementations

- [onepage.pub](https://github.com/evanp/onepage.pub/) is a simple ActivityPub server that implements the `pendingFollowers` and `pendingFollowing` collections.
- [ap](https://github.com/evanp/ap) is a command-line ActivityPub client. It has commands to list and manage the `pendingFollowers` and `pendingFollowing` collections.

## References

- Christine Lemmer Webber, Jessica Tallon, [ActivityPub][ActivityPub], 2018
- Evan Prodromou, [ActivityPub Miscellaneous Terms][miscellany], 2023
- Tom Preston-Werner, [Semantic Versioning 2.0.0][semver], 2017

[ActivityPub]: https://www.w3.org/TR/activitypub/
[semver]: https://semver.org/
[miscellany]: https://swicg.github.io/miscellany/

## Copyright

CC0 1.0 Universal (CC0 1.0) Public Domain Dedication

To the extent possible under law, the authors of this Fediverse Enhancement Proposal have waived all copyright and related or neighboring rights to this work.
