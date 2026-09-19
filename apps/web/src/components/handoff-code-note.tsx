/**
 * Shown on the "check your inbox" screen. If the person opens the email in a
 * different browser or app (common with the installed app or an email app's
 * built-in browser), that screen asks for this code before signing this one
 * in too. An attacker who requests a link for someone else's address sees the
 * code on their own screen, so the account owner can't be tricked into
 * handing their session over just by clicking the email.
 */
export function HandoffCodeNote({ code }: { code?: string }) {
  if (!code) return null;

  return (
    <div
      className="rounded-xl border px-4 py-3 text-center"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Opening the email in a different browser or app? Enter this code there to sign in here too:
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ letterSpacing: "0.3em", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
        aria-label={`Sign-in code ${code.split("").join(" ")}`}
      >
        {code}
      </p>
    </div>
  );
}
