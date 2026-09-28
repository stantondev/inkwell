# Your Terms of Service and Privacy Policy

Your server needs its own Terms of Service and Privacy Policy. You run it,
so they're between you and your members; inkwell.social's own policies name
inkwell.social as the operator and don't apply to your server.

Put them here as Markdown:

- `legal/terms.md` → shown at `/terms`
- `legal/privacy.md` → shown at `/privacy`

This folder is mounted into the web container read-only, so edits show up on
the next page load; no restart needed. Until a file exists, its page says the
policy hasn't been published yet and gives your contact address.

If your policies live somewhere else, set `TERMS_URL` / `PRIVACY_URL` in
`.env` instead and those pages will send readers there.

You're welcome to adapt inkwell.social's policies
(https://inkwell.social/terms, https://inkwell.social/privacy) as a starting
point, but change the operator, contact details, jurisdiction and anything
about payments. This isn't legal advice.
