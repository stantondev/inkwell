import Link from "next/link";

interface SignupCtaProps {
  /** Heading text — defaults to "Start your own journal" */
  heading?: string;
  /** Subheading text */
  subheading?: string;
  /** CTA button text — defaults to "Get started" */
  buttonText?: string;
  /** Variant style */
  variant?: "card" | "banner";
}

export function SignupCta({
  heading = "Start your own journal on Inkwell",
  subheading = "No algorithms, no ads — just your writing, your way. Customize your space, connect with readers, and join the open social web.",
  buttonText = "Get started — it's free",
  variant = "card",
}: SignupCtaProps) {
  if (variant === "banner") {
    return (
      <div className="signup-cta-banner rounded-xl border p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5">
          {/* Pen nib icon */}
          <div className="signup-cta-icon flex-shrink-0" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="signup-cta-heading text-sm font-semibold">
              {heading}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {subheading}
            </p>
          </div>
          <Link
            href="/get-started"
            className="signup-cta-button rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-90"
          >
            {buttonText}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="signup-cta-card rounded-2xl border p-6 sm:p-8 text-center mx-auto" style={{ maxWidth: 520 }}>
      {/* Pen nib icon */}
      <div className="signup-cta-icon mx-auto mb-4" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </div>
      <h3 className="signup-cta-heading text-lg font-semibold mb-2">
        {heading}
      </h3>
      <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--muted)" }}>
        {subheading}
      </p>
      <Link
        href="/get-started"
        className="signup-cta-button inline-block rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        {buttonText}
      </Link>
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        Free to use. Part of the{" "}
        <Link href="/guide#fediverse" className="underline hover:no-underline" style={{ color: "var(--accent)" }}>
          open social web
        </Link>
        .
      </p>
    </div>
  );
}
