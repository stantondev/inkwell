# Fediverse.Party Submission for Inkwell

## Files Ready

- `inkwell.png` — 45x45 PNG logo (goes in `source/img/misc/` in the fediparty repo)
- `inkwell.svg` — 24x24 SVG logo (alternative, goes in `source/img/misc/`)

## JSON Entry

Add this to `source/_data/miscellaneous.json` (in alphabetical order by title):

```json
{
  "title": "Inkwell",
  "source": "https://github.com/stantondev/inkwell",
  "protocols": "ActivityPub",
  "site": "https://inkwell.social",
  "logo": "inkwell.png",
  "description": "Federated social journaling platform. LiveJournal meets MySpace, reimagined with ActivityPub. No algorithms, no ads.",
  "codeLanguage": "Elixir",
  "techStack": "Phoenix, Next.js, PostgreSQL",
  "license": "AGPL-3.0",
  "apClass": true,
  "zotClass": false,
  "diasporaClass": false,
  "OStatusClass": false,
  "categories": ["Blog-Pub", "SN-ma"]
}
```

## How to Submit the PR

### 1. Create a Codeberg account
Go to https://codeberg.org and sign up (it's free, like GitHub).

### 2. Fork the repository
Go to https://codeberg.org/fediverse/fediparty and click "Fork" in the top right.

### 3. Add files via the web UI (easiest method)

**Add the logo:**
- Navigate to `source/img/misc/` in your fork
- Click "Upload File" and upload `inkwell.png`
- Commit with message: "Add Inkwell logo"

**Edit the JSON:**
- Navigate to `source/_data/miscellaneous.json` in your fork
- Click the edit (pencil) icon
- Find the right alphabetical position (after entries starting with "I")
- Add the JSON block above (don't forget the comma after the previous entry!)
- Commit with message: "Add Inkwell - federated social journaling platform"

### 4. Create a Pull Request
- Go to your fork on Codeberg
- Click "New Pull Request"
- Base: `fediverse/fediparty` `main` ← Head: `your-username/fediparty` `main`
- Title: "Add Inkwell - federated social journaling platform"
- Description:

```
Hi! I'd like to add Inkwell to the directory.

**Inkwell** is a federated social journaling platform — LiveJournal meets MySpace, reimagined for 2026 with ActivityPub federation. No algorithms, no ads, user-owned spaces.

- **Site**: https://inkwell.social
- **Source**: https://github.com/stantondev/inkwell
- **Protocol**: ActivityPub (live, confirmed working — users are followable from Mastodon at @username@inkwell.social)
- **Language**: Elixir/Phoenix + Next.js
- **License**: AGPL-3.0

Features include journal entries federated as Article objects (FEP-b2b8), profile customization (themes, music, custom CSS), stamps (reactions), newsletters, and guestbooks.
```
