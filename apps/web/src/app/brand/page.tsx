import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trademark & Brand Policy",
  description: "Inkwell Trademark and Brand Usage Policy — guidelines for using the Inkwell name, logo, and brand assets.",
  openGraph: {
    title: "Trademark & Brand Policy — Inkwell",
    description: "Guidelines for using the Inkwell name, logo, and brand assets.",
    url: "https://inkwell.social/brand",
  },
  alternates: { canonical: "https://inkwell.social/brand" },
};

export default function BrandPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Trademark &amp; Brand Usage Policy
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Last Updated: February 22, 2026 &middot; Version 1.0
      </p>

      <div className="prose-legal flex flex-col gap-8 text-base leading-relaxed">

        {/* 1. Purpose */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            1. Purpose
          </h2>
          <p>
            Inkwell is an open source project released under the GNU Affero General Public License v3.0 (AGPL-3.0). While
            the source code is freely available to use, modify, and distribute under the terms of that license, the
            Inkwell name, logo, brand assets, and associated trademarks are not covered by the AGPL-3.0 and are separately
            protected.
          </p>
          <p className="mt-3">
            This Trademark and Brand Usage Policy explains what you can and cannot do with the Inkwell brand. The goal is
            simple: protect the integrity of the Inkwell name so users always know when they are interacting with the
            official Inkwell service, while still allowing the open source community to talk about, reference, and build on
            the project.
          </p>
        </section>

        {/* 2. What This Policy Covers */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            2. What This Policy Covers
          </h2>
          <p>
            The following are trademarks and brand assets owned by Stanton Melvin DBA Inkwell (collectively, the
            &ldquo;Inkwell Marks&rdquo;):
          </p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-2">
            <li>
              <strong>Word marks:</strong> &ldquo;Inkwell,&rdquo; &ldquo;Inkwell Social,&rdquo;
              &ldquo;inkwell.social,&rdquo; &ldquo;Inkwell Plus&rdquo;
            </li>
            <li>
              <strong>Logos:</strong> The Inkwell logo, logotype, and icon in all formats and variations
            </li>
            <li>
              <strong>Visual identity:</strong> The Inkwell brand color palette, typography choices, and distinctive visual
              design elements as used in the official Inkwell service
            </li>
            <li>
              <strong>Taglines:</strong> &ldquo;Your journal. Your pen pals. Your space.&rdquo; and &ldquo;no ads,
              ever&rdquo;
            </li>
          </ul>
        </section>

        {/* 3. Permitted Uses */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            3. Permitted Uses (No Permission Needed)
          </h2>

          <h3 className="font-semibold mt-4 mb-2">3.1 Referring to Inkwell</h3>
          <p>
            You may use the Inkwell name in text to truthfully refer to the Inkwell project or service. For example:
          </p>
          <ul className="list-disc pl-6 mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--muted)" }}>
            <li>&ldquo;This application is compatible with Inkwell.&rdquo;</li>
            <li>&ldquo;Built using the Inkwell open source codebase.&rdquo;</li>
            <li>&ldquo;This server federates with inkwell.social.&rdquo;</li>
          </ul>
          <p className="mt-3">
            When referring to Inkwell in text, please use the word &ldquo;Inkwell&rdquo; with a capital &ldquo;I&rdquo;
            and lowercase &ldquo;nkwell.&rdquo; Do not stylize it as &ldquo;INKWELL,&rdquo; &ldquo;InkWell,&rdquo; or
            &ldquo;inkWell&rdquo; in running text (the all-caps treatment is reserved for official brand usage in titles
            and headers).
          </p>

          <h3 className="font-semibold mt-4 mb-2">3.2 Community and Educational Use</h3>
          <p>
            You may use the Inkwell name and logo in presentations, blog posts, articles, videos, tutorials, and
            educational materials that discuss or reference the Inkwell project, provided that the use does not imply
            official endorsement, sponsorship, or affiliation with the Inkwell project unless such a relationship exists.
          </p>

          <h3 className="font-semibold mt-4 mb-2">3.3 Linking and Attribution</h3>
          <p>
            You may use the Inkwell logo to link to inkwell.social or to the Inkwell GitHub repository, provided you use
            an unmodified version of the logo and do not alter its proportions, colors, or design.
          </p>
        </section>

        {/* 4. Restricted Uses */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            4. Restricted Uses (Permission Required)
          </h2>
          <p>
            The following uses require prior written permission from Inkwell. To request permission, email{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.1 Forks and Derivative Services</h3>
          <p>
            If you fork the Inkwell codebase and run your own instance, you must choose a different name, logo, and brand
            identity for your service. You may not call your service &ldquo;Inkwell,&rdquo; use the Inkwell logo, or
            present your service in a way that could be confused with the official Inkwell platform.
          </p>
          <p className="mt-3">You are encouraged to credit Inkwell as the upstream project. Acceptable examples:</p>
          <ul className="list-disc pl-6 mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--muted)" }}>
            <li>&ldquo;[YourProjectName] is based on the Inkwell open source project.&rdquo;</li>
            <li>&ldquo;Powered by the Inkwell codebase. [YourProjectName] is not affiliated with inkwell.social.&rdquo;</li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">4.2 Merchandise and Physical Goods</h3>
          <p>
            You may not produce merchandise (stickers, shirts, mugs, etc.) bearing the Inkwell name or logo without prior
            written permission.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.3 Domain Names and Social Media Accounts</h3>
          <p>
            You may not register domain names, social media accounts, or app store listings that include
            &ldquo;Inkwell&rdquo; or &ldquo;inkwell&rdquo; in a way that could suggest an official Inkwell presence (e.g.,
            inkwell-app.com, @inkwellofficial, InkwellPlus). Exceptions may be granted for community fan pages that are
            clearly identified as unofficial.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.4 Platform Usernames</h3>
          <p>
            Usernames on inkwell.social that contain or begin with &ldquo;inkwell&rdquo; are reserved exclusively for
            official use. This includes any variation such as &ldquo;inkwell123&rdquo;, &ldquo;inkwellofficial&rdquo;,
            &ldquo;inkwell_support&rdquo;, or similar. Accounts registered with such usernames may be reclaimed or
            renamed at any time without prior notice.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.5 Commercial Use</h3>
          <p>
            You may not use the Inkwell Marks in advertising, marketing materials, or product names for commercial
            products or services without prior written permission.
          </p>
        </section>

        {/* 5. Prohibited Uses */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            5. Prohibited Uses (Never Permitted)
          </h2>
          <p>The following uses of the Inkwell Marks are never permitted, regardless of context:</p>
          <ol className="list-[lower-alpha] pl-6 mt-3 flex flex-col gap-2">
            <li>
              Using the Inkwell name or logo to imply that your product, service, or fork is the official Inkwell service
              or is endorsed, sponsored, or affiliated with Inkwell when it is not.
            </li>
            <li>
              Modifying the Inkwell logo (altering colors, proportions, adding elements, combining with other logos) and
              presenting the modified version as an official Inkwell mark.
            </li>
            <li>
              Using the Inkwell Marks in connection with any product, service, or content that is unlawful, defamatory,
              harmful, or that violates the Inkwell{" "}
              <Link href="/terms" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                Terms of Service
              </Link>.
            </li>
            <li>Incorporating the Inkwell Marks into your own trademark, trade name, or logo.</li>
            <li>
              Using the Inkwell Marks in a manner that disparages or tarnishes the Inkwell project or its community.
            </li>
          </ol>
        </section>

        {/* 6. Quick Reference */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            6. Quick Reference
          </h2>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr style={{ background: "var(--surface)" }}>
                    <th className="text-left px-4 py-2.5 font-semibold border-b" style={{ borderColor: "var(--border)" }}>Use Case</th>
                    <th className="text-left px-4 py-2.5 font-semibold border-b" style={{ borderColor: "var(--border)", width: "110px" }}>Permitted?</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Blog post saying \u201cI moved from Mastodon to Inkwell\u201d", true, "Yes"],
                    ["Conference talk about the Inkwell architecture", true, "Yes"],
                    ["Linking to inkwell.social with the Inkwell logo", true, "Yes"],
                    ["\u201cCompatible with Inkwell\u201d on your ActivityPub app", true, "Yes"],
                    ["Running a fork and calling it \u201cInkwell\u201d", false, "No"],
                    ["Running a fork called \u201cMyJournal, based on Inkwell\u201d", true, "Yes, with attribution"],
                    ["Selling \u201cInkwell\u201d branded stickers", false, "Requires permission"],
                    ["Registering inkwell-hosting.com", false, "Requires permission"],
                    ["Using the Inkwell logo in your own app\u2019s logo", false, "Never"],
                  ] as [string, boolean, string][]).map(([useCase, ok, label]) => (
                    <tr key={useCase} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-2.5">{useCase}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: ok ? "var(--success, #16a34a)" : "var(--danger, #dc2626)" }}>
                        {label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 7. Relationship to AGPL */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            7. Relationship to the AGPL-3.0 License
          </h2>
          <p>
            The AGPL-3.0 license governs your rights to use, modify, and distribute the Inkwell source code. This
            Trademark and Brand Usage Policy is separate from and in addition to the AGPL-3.0. Nothing in the AGPL-3.0
            grants you any rights to use the Inkwell Marks.
          </p>
          <p className="mt-3">
            To be clear: you have the right under the AGPL-3.0 to fork the code, modify it, and run your own service. You
            do not have the right to call that service &ldquo;Inkwell&rdquo; or use the Inkwell brand assets. This is a
            standard practice in open source projects (similar policies are maintained by Mozilla/Firefox, Mastodon,
            WordPress, and many others).
          </p>
        </section>

        {/* 8. Brand Asset Files */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            8. Brand Asset Files
          </h2>
          <p>
            Official Inkwell brand assets (logo files, color palette, and usage guidelines) are available at:{" "}
            <a
              href="https://github.com/stantondev/inkwellsocial-brand-assets"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              github.com/stantondev/inkwellsocial-brand-assets
            </a>
          </p>
          <p className="mt-3">
            These assets are provided solely for the permitted uses described in this policy. Downloading or possessing
            these files does not grant any trademark license beyond what is described here.
          </p>
        </section>

        {/* 9. Enforcement */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            9. Enforcement
          </h2>
          <p>
            We monitor the use of the Inkwell Marks and will take action to address misuse. If you become aware of any use
            of the Inkwell Marks that you believe violates this policy, please report it to{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>.
          </p>
          <p className="mt-3">
            If we determine that your use of the Inkwell Marks violates this policy, we will typically reach out to you
            first and request that you correct the issue. We prefer collaborative resolution. However, we reserve the
            right to take further action, including legal action, to protect the Inkwell Marks if necessary.
          </p>
        </section>

        {/* 10. Changes to This Policy */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            10. Changes to This Policy
          </h2>
          <p>
            We may update this policy from time to time. Material changes will be announced via the Inkwell blog and/or
            GitHub repository. The &ldquo;Last Updated&rdquo; date at the top of this document indicates the most recent
            revision.
          </p>
        </section>

        {/* 11. Contact */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            11. Contact
          </h2>
          <p>
            For questions about this policy, trademark usage requests, or to report misuse:
          </p>
          <p className="mt-3">
            <strong>Inkwell</strong><br />
            Email:{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a><br />
            Address: 1127 Pennington Ln, Westfield, IN 46074
          </p>
        </section>

        {/* Cross-links */}
        <p className="text-sm pt-4 border-t" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          See also:{" "}
          <Link href="/terms" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>Terms of Service</Link>
          {" "}&middot;{" "}
          <Link href="/privacy" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>Privacy Policy</Link>
        </p>
      </div>
    </main>
  );
}
