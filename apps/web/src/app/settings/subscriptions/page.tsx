export default function SubscriptionsSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-xl font-bold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Writer Plans
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create a monthly subscription plan for your readers.
        </p>
      </div>

      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <h3
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Writer Subscription Plans
          </h3>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--muted)", color: "white" }}
          >
            Paused
          </span>
        </div>

        <p className="text-sm mb-3" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Writer subscription plans require Stripe Connect for marketplace split payments (92% to you, 8% to Inkwell).
          Our Stripe account is temporarily unavailable while we complete business registration.
        </p>

        <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          This feature will return once Stripe access is restored. No existing subscriber data has been lost.
        </p>

        <div
          className="mt-4 pt-3 text-xs"
          style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
        >
          Questions? Visit the{" "}
          <a href="/roadmap" className="underline" style={{ color: "var(--accent)" }}>
            Roadmap
          </a>{" "}
          or{" "}
          <a href="/help/contact" className="underline" style={{ color: "var(--accent)" }}>
            contact us
          </a>.
        </div>
      </div>
    </div>
  );
}
