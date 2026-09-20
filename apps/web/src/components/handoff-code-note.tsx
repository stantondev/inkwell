/**
 * Shown on the "check your inbox" screen — but only once the emailed link has
 * actually been opened in a different browser or app, which the claim-session
 * poll reports back as `awaiting_code`.
 *
 * It used to render for everyone, the moment the link was sent. Almost nobody
 * needs it (opening the link in the same browser signs you straight in), so a
 * big 4-digit number sat on the screen looking like something you were meant
 * to find in the email — which isn't there, and isn't supposed to be.
 *
 * Why a code at all: an attacker who requests a link for someone else's
 * address sees the code on their own screen, never on the victim's, so the
 * victim can't be tricked into handing over their session just by clicking
 * the unexpected email.
 */
export function HandoffCodeNote({ code, awaiting }: { code?: string; awaiting: boolean }) {
  if (!code) return null;

  if (!awaiting) {
    // Quiet reassurance, so nobody goes hunting the email for a code.
    return (
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Open the link in this browser and you&apos;ll be signed in straight away. If you open it
        somewhere else, come back here — we&apos;ll show you what to do.
      </p>
    );
  }

  return (
    <div
      className="rounded-xl border px-4 py-3 text-center"
      style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
        You opened the link somewhere else. Type this code there to sign in here too:
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{
          letterSpacing: "0.3em",
          color: "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
        aria-label={`Sign-in code ${code.split("").join(" ")}`}
      >
        {code}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        You&apos;re already signed in on that other screen — you can just carry on there instead.
      </p>
    </div>
  );
}
