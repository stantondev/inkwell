/**
 * Throwaway dev route for manually testing the marginalia anchoring
 * module. Not linked from anywhere. Paste or edit prose on the left,
 * click "Compute anchor from selection" to capture an anchor, then
 * click "Resolve anchors" to re-find them — useful for verifying
 * resilience to edits.
 *
 * Visit at: http://localhost:3000/dev/marginalia-test
 */

import { MarginaliaTestHarness } from "./harness";

export const metadata = {
  title: "Marginalia anchoring test",
  robots: { index: false, follow: false },
};

const FIXTURE_HTML = `
<p>The first rule of the ink is to let it flow. If you try to <strong>force</strong> the pen, you will only end up with a smear.</p>
<p>Writing every day is a practice, not a hobby. The second rule is to return to the page even when you have nothing to say.</p>
<p>And the third rule: share what you write. A letter sealed in a drawer is a letter that never arrived.</p>
`;

export default function MarginaliaTestPage() {
  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 28 }}>
        Marginalia anchoring test harness
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Development-only. Select text in the left pane, click{" "}
        <em>Compute anchor</em>, then edit the text and click <em>Resolve</em>{" "}
        to verify the anchor still finds the passage.
      </p>
      <MarginaliaTestHarness initialHtml={FIXTURE_HTML.trim()} />
    </main>
  );
}
