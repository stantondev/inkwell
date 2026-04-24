# Inkwell Outreach Posts — March 2026

Ready-to-post content for spreading the word about Inkwell. Each post is tailored to its community. Copy, review, and post.

---

## 1. Hacker News — Show HN

**Title:** `Show HN: Inkwell – Federated social journaling, like LiveJournal rebuilt for the fediverse`

**Body (text post):**

I built Inkwell because I missed what the internet used to feel like. Personal pages. Long-form writing. Actually getting to know someone through what they wrote. Not engagement bait, not threads, not algorithmic feeds pushing ragebait.

Inkwell is a social journaling platform where you write entries, customize your profile (themes, music, backgrounds — very MySpace energy), and follow other writers. It speaks ActivityPub, so Mastodon users can follow Inkwell writers directly in their timelines, and Inkwell users can follow anyone on the fediverse.

What exists today:

- Rich text editor with moods, music links, cover images, and a distraction-free writing mode
- Stamps instead of likes — things like "felt," "holding space," "beautifully said"
- Inks — a lightweight signal for surfacing good writing (powers a trending section)
- 8 profile themes with custom colors, fonts, layouts, avatar frames, guestbooks, and custom HTML/CSS for Plus users
- Data import from WordPress, Medium, Substack
- Email newsletters for writers (double opt-in, one-click unsubscribe)
- Entry polls, series/collections, version history
- Community roadmap where users vote on what gets built next
- Public API with API key auth

Tech stack: Elixir/Phoenix backend, Next.js frontend, Postgres, deployed on Fly.io. Federation is native in Phoenix — no sidecar. I followed FEP-b2b8 for long-form content, so entries show up properly as Articles in Mastodon feeds with a preview Note for clients that don't render Articles inline.

It's free to use. Plus is $5/mo for custom CSS/HTML, more newsletter sends, and extra customization. No VC, no ads, no growth hacking.

I'm a product manager building this solo and shipping fast. The fediverse community has already been incredibly helpful — they caught issues with my HTTP signatures, helped me understand Article vs Note handling, and pushed me to implement proper content warnings for federation. The roadmap at inkwell.social/roadmap shows everything shipped and what's next.

Would love feedback from this crowd. What would you want from a platform like this?

https://inkwell.social

---

## 2. Reddit — r/journaling

**Title:** `I built a free online journaling platform with privacy controls, mood tracking, and no ads — looking for journalers to try it`

**Body:**

Hey r/journaling — I've been working on a project called Inkwell that I think some of you might find interesting.

It's a social journaling platform, kind of like what LiveJournal was back in the day but rebuilt for 2026. The core idea: you write journal entries, you control who sees them, and there's a community of other writers doing the same thing.

A few things that might matter to journalers here:

**Privacy controls** — Every entry can be public, friends-only, private, or shared with a custom friend filter (like "close friends" or "college crew"). You decide who reads what.

**The writing experience** — Rich text editor with formatting, images you can upload directly, cover images, moods, music links, tags, categories, and a distraction-free mode that strips everything away so it's just you and the page. There's also version history so you can look back at how an entry evolved.

**It's not social media** — There's no algorithm deciding what you see. Your feed is just entries from people you follow, in order. No ads, no tracking. The "likes" are called stamps and they're things like "felt," "holding space," and "beautifully said" — designed for the kind of content people actually journal about.

**You own your data** — You can export everything. You can import from WordPress, Medium, or Substack if you're moving from somewhere else.

It's completely free to use. There's an optional $5/mo tier for people who want extra customization (custom CSS, more newsletter sends, etc.) but all the journaling features are free.

I'm building this solo and iterating fast based on what people actually want. There's a community roadmap where you can suggest features and vote on what gets built. Early users have genuinely shaped the direction of the platform.

If anyone here has been looking for a dedicated journaling space online — not a note-taking app, not a social media platform, but something in between — I'd love for you to try it out and tell me what you think.

https://inkwell.social

---

## 3. Reddit — r/selfhosted

**Title:** `Inkwell — a federated social journaling platform (Elixir/Phoenix + ActivityPub, deployed on Fly.io)`

**Body:**

I built a social journaling platform called Inkwell that federates via ActivityPub. Thought the selfhosted crowd might find the architecture interesting even though it's a hosted service right now.

**Stack:** Elixir/Phoenix 1.8 backend, Next.js frontend, Postgres 16. Federation is handled natively in Phoenix — no sidecar service. HTTP signatures, WebFinger, actor endpoints, inbox/outbox, the whole thing. Entries federate as Article objects per FEP-b2b8 with a preview Note for Mastodon clients that don't display Articles inline.

**What it does:** Long-form social journaling with per-entry privacy controls, stamps instead of likes, community discovery via "inks" (like boosts but for surfacing good writing), profile customization (themes, custom HTML/CSS, music embeds), email newsletters for writers, and a public API with key auth.

**Federation details that might be interesting:**
- Inbound Mastodon Likes become Inks (community discovery signal, powers trending)
- Inbound Boosts also become Inks (bidirectional federation)
- Outbound stamps send as AP Likes with proper `to` addressing
- Content warnings federate both directions (sensitive flag + summary field)
- Remote entry verification worker periodically HEAD-checks federated content and cleans up 404s/410s
- Avatars served via HTTPS URLs so they actually display on remote instances (not inline base64)

The code isn't open source yet — that's something I'm considering but haven't committed to. Right now it's a hosted platform at inkwell.social, free to use, with a $5/mo Plus tier for power users.

I'd be interested in hearing from this community. Is self-hostability something that would matter to you for a platform like this? Would you run your own instance if you could?

https://inkwell.social

---

## 4. Reddit — r/degoogle

**Title:** `Built a social journaling platform with no ads, no tracking, no Google anything — and it federates with Mastodon`

**Body:**

For those of you working to get away from the big platforms, I wanted to share something I've been building.

Inkwell is a social journaling platform — think LiveJournal or early MySpace, but rebuilt for 2026 with modern privacy standards. The short version of why it might interest this community:

- **No ads, ever.** The business model is an optional $5/mo subscription for power features. Free tier has everything you need to write and share.
- **No tracking.** No analytics pixels, no behavioral tracking, no selling data.
- **No algorithm.** Your feed is entries from people you follow, in chronological order. That's it.
- **You own your data.** Full export, data import from WordPress/Medium/Substack, per-entry privacy controls.
- **Federated via ActivityPub.** Your Inkwell profile is followable from Mastodon, Pixelfed, or any fediverse app. You're not locked into another walled garden.

It's a different kind of social platform. The emphasis is on long-form personal writing — journal entries, not posts. The reaction system uses "stamps" (things like "felt" and "holding space") instead of likes. Profiles are customizable with themes, music, backgrounds, and custom HTML/CSS.

I built this because I got tired of every platform being optimized for engagement instead of expression. If you're here because you want more control over your online presence, Inkwell might be worth a look.

https://inkwell.social

---

## 5. Reddit — r/writing

**Title:** `Free writing platform with a rich editor, newsletters, and no algorithm — looking for writers to try it out`

**Body:**

I've been building a platform called Inkwell that's designed specifically for writers who want a home for their work that isn't Medium, isn't Substack, and isn't another social media feed optimized for engagement.

What makes it different:

**The editor is actually good.** Rich text with formatting, text alignment, highlight colors, tables, task lists, images (upload directly, not just URLs), cover images, and a distraction-free mode. There's also mood tracking and music links if you want to capture the vibe of when you were writing.

**Built-in newsletters.** You can enable email subscriptions on your profile. Readers subscribe, you check a box when publishing an entry, and it goes out as an email. Double opt-in, one-click unsubscribe, the whole compliance thing handled for you. Free tier gets 500 subscribers and 2 sends/month.

**No algorithm deciding who reads you.** When someone follows you, they see your entries. That's the deal. No "suggested content" drowning out the people they actually chose to follow.

**Customizable profile pages.** Eight themes, custom colors, fonts, layouts, music player, guestbook. If you remember MySpace or LiveJournal, it's that energy but with a modern editor underneath.

**It federates.** Your profile is followable from Mastodon and the wider fediverse. Your writing reaches people on other platforms without you having to cross-post.

It's free. There's a Plus tier at $5/mo for custom CSS/HTML, more newsletter capacity, and extra customization. I'm a solo builder and I'm shipping features fast based on what writers actually ask for — the roadmap is public and community-driven.

If you've been looking for somewhere to put your writing that feels like yours, I'd love for you to check it out.

https://inkwell.social

---

## 6. Reddit — r/nostalgia (or r/90s / r/2000s)

**Title:** `Remember LiveJournal and MySpace? I built a modern version with customizable profiles, mood tracking, and music on your page`

**Body:**

This might be a weird post for this sub but I think some of you will get it.

I spent way too long thinking about why the internet felt different in the early 2000s. LiveJournal entries where people actually wrote about their lives. MySpace pages with custom backgrounds and music auto-playing (sorry). The feeling that you were visiting someone's actual space online, not just scrolling past their content in a feed.

So I built Inkwell. It's a social journaling platform that brings back a lot of that energy:

- Write journal entries with moods (remember mood: melancholy?)
- Add music to your entries and profile
- Customize your page with themes, backgrounds, custom colors, fonts, and even HTML/CSS if you want to go full MySpace
- Follow other writers ("pen pals") and see their entries in your feed
- Guestbooks on profiles (yes, actual guestbooks)
- Top 6 friends displayed on your profile

But it's not a nostalgia gimmick. It's a real platform with a modern editor, privacy controls (public/friends-only/private per entry), image uploads, email newsletters, and it connects to Mastodon and the wider fediverse via ActivityPub.

No ads, no algorithm, no tracking. Free to use.

If you ever miss the era when having an online presence meant making something that felt like yours, you might like this.

https://inkwell.social

---

## 7. Mastodon / Fediverse

**Post (toot):**

Been shipping a lot on Inkwell lately and wanted to share what's new for the fediverse crowd:

✨ Inks — a discovery signal that federates bidirectionally. Your boosts on Mastodon create inks on Inkwell (and vice versa). Powers a "Trending This Week" section.

📮 Real postage stamp designs for reactions — scalloped borders, ink-pressed effect, per-stamp rotation. They look like actual stamps on a letter.

🗳️ Native polls — both in-entry and community-wide

💬 Rich text DMs, @mentions in comments, comment editing

📰 Newsletters — writers can send entries as emails to subscribers

Plus: content warnings that federate properly, remote entry verification (404s get cleaned up), and Article objects per FEP-b2b8.

We're a small community right now and that's actually what makes it fun — the roadmap is genuinely shaped by the people using it. If you've been looking for a long-form writing space that's native to the fediverse, come check it out.

https://inkwell.social

#fediverse #activitypub #inkwell #journaling #writing #indieweb #livejournal

---

## 8. BONUS — Reddit r/InternetIsBeautiful

**Title:** `Inkwell — a free social journaling platform with customizable profiles, mood tracking, and fediverse federation`

**Body:**

Sharing a project I've been building: Inkwell is a social journaling platform inspired by the best parts of LiveJournal and early MySpace, rebuilt for 2026.

You write journal entries, customize your profile page (8 themes, custom colors/fonts/backgrounds, music player, guestbook, custom HTML/CSS), and follow other writers. It connects to Mastodon and the fediverse via ActivityPub so your writing isn't trapped in another walled garden.

Instead of likes there are "stamps" — reactions like "felt," "holding space," and "beautifully said" that are designed for personal writing rather than content.

Free to use, no ads, no algorithm, no tracking.

https://inkwell.social

---

## Posting Notes

**General rules of thumb for Reddit:**
- Don't post to more than 2-3 subreddits in one day (looks spammy)
- Space posts out by at least a few hours
- Respond to every comment genuinely — this is where the real growth happens
- If a subreddit removes your post, don't repost. Message the mods politely.
- Check each subreddit's rules before posting (sidebar on desktop, "About" on mobile)

**Suggested posting schedule:**
- **Day 1:** Show HN + r/journaling
- **Day 2:** r/selfhosted + Mastodon toot
- **Day 3:** r/degoogle + r/writing
- **Day 4:** r/nostalgia or r/InternetIsBeautiful (pick one)

**After posting:**
- Engage with every comment for at least the first 2-3 hours
- On HN, the first hour of engagement is critical for staying on the front page
- Save any feature requests or bug reports people mention — add them to the roadmap

**Communities to participate in (not post to, just engage):**
- r/journaling — answer questions, share journaling tips
- r/fediverse — you're already active here, keep it up
- r/indieweb — comment on others' projects
- r/blogging — help people with their writing workflow questions
