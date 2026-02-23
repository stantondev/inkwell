import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Inkwell Privacy Policy — how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Privacy Policy
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Last Updated: February 22, 2026
      </p>

      <div className="prose-legal flex flex-col gap-8 text-base leading-relaxed">
        <p>
          This Privacy Policy describes how Inkwell (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects,
          uses, shares, and protects your personal information when you use the Inkwell platform at inkwell.social and all
          related services (the &ldquo;Service&rdquo;).
        </p>
        <p>
          We are committed to transparency about our data practices. If you have questions about this policy, please
          contact us at{" "}
          <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            hello@inkwell.social
          </a>.
        </p>

        {/* 1. Information We Collect */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            1. Information We Collect
          </h2>

          <h3 className="font-semibold mt-4 mb-2">1.1 Information You Provide</h3>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Account information:</strong> When you create an account, we collect your email address, username,
              and display name.
            </li>
            <li>
              <strong>Journal content:</strong> The entries, comments, and other content you create on the Service,
              including associated metadata such as mood tags, music metadata, and timestamps.
            </li>
            <li>
              <strong>Profile information:</strong> Any optional information you add to your profile, including biography
              text, avatar images, and custom CSS/HTML profile themes.
            </li>
            <li>
              <strong>Payment information:</strong> If you subscribe to Inkwell Plus, payment information is collected and
              processed by our third-party payment processor, Stripe. We receive limited information such as the last four
              digits of your card, billing address, and transaction history. We do not store full payment card numbers on
              our servers.
            </li>
            <li>
              <strong>Communications:</strong> If you contact us for support, we collect the contents of your messages and
              any attachments.
            </li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">1.2 Information Collected Automatically</h3>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Log data:</strong> When you use the Service, our servers automatically record information including
              your IP address, browser type and version, operating system, referring URL, pages visited, and timestamps.
            </li>
            <li>
              <strong>Device information:</strong> We collect information about the device you use to access the Service,
              including device type, screen resolution, and unique device identifiers.
            </li>
            <li>
              <strong>Cookies and similar technologies:</strong> We use essential cookies to maintain your session and
              preferences. See Section 7 for more details.
            </li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">1.3 Information from Federation</h3>
          <p>
            When users on other ActivityPub-compatible platforms interact with Inkwell (for example, by following an
            Inkwell user or commenting on an entry), we may receive profile information and content from those external
            servers, including usernames, profile pictures, avatars, and message content.
          </p>
        </section>

        {/* 2. How We Use Your Information */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            2. How We Use Your Information
          </h2>
          <p>We use the information we collect for the following purposes:</p>

          <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface)" }}>
                  <th className="text-left px-4 py-2.5 font-semibold border-b" style={{ borderColor: "var(--border)", width: "30%" }}>Purpose</th>
                  <th className="text-left px-4 py-2.5 font-semibold border-b" style={{ borderColor: "var(--border)" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Provide the Service", "To operate, maintain, and deliver Inkwell\u2019s features, including hosting and displaying your journal entries, managing your account, and facilitating federation."],
                  ["Process payments", "To process your Inkwell Plus subscription through our payment processor."],
                  ["Communicate with you", "To send service-related notifications (e.g., account verification, security alerts, billing confirmations) and respond to support inquiries."],
                  ["Improve the Service", "To analyze usage patterns, troubleshoot issues, and improve the performance and reliability of the platform."],
                  ["Enforce our Terms", "To detect and prevent abuse, spam, fraud, and violations of our Terms of Service and Acceptable Use Policy."],
                  ["Legal compliance", "To comply with applicable legal obligations, legal processes, or enforceable governmental requests."],
                ].map(([purpose, desc]) => (
                  <tr key={purpose} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2.5 font-medium align-top">{purpose}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--muted)" }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--accent)" }}>What we do NOT do:</p>
            <ul className="text-sm flex flex-col gap-1" style={{ color: "var(--accent)" }}>
              <li>Inkwell does not sell your personal information to third parties.</li>
              <li>Inkwell does not use your data for targeted advertising.</li>
              <li>Inkwell does not use algorithmic profiling to curate your feed.</li>
              <li>There are no ads on Inkwell.</li>
            </ul>
          </div>
        </section>

        {/* 3. How We Share Your Information */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            3. How We Share Your Information
          </h2>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Federation (ActivityPub):</strong> When you publish content with public or federated visibility,
              your content, username, display name, and avatar are shared with other servers in the ActivityPub network.
              This is a core function of the Service and is necessary for federation to work. Content marked as
              friends-only, private, or using custom filters is not federated.
            </li>
            <li>
              <strong>Payment processor:</strong> We share necessary billing information with our payment processor Stripe
              to process subscription transactions.
            </li>
            <li>
              <strong>Hosting and infrastructure providers:</strong> Your data is stored on and processed by servers
              operated by Fly.io (application hosting and database), Cloudflare (DNS, content delivery, and email
              routing), and Resend (transactional email delivery). These providers process data on our behalf in
              accordance with their respective data processing terms.
            </li>
            <li>
              <strong>Legal requirements:</strong> We may disclose your information if required to do so by law, or if we
              believe in good faith that such disclosure is reasonably necessary to comply with legal process, respond to
              claims, or protect the rights, property, or safety of Inkwell, our users, or the public.
            </li>
            <li>
              <strong>Business transfers:</strong> In the event of a merger, acquisition, reorganization, or sale of
              assets, your information may be transferred to the acquiring entity. We will provide notice of any such
              transfer and any choices you may have regarding your information.
            </li>
          </ul>
        </section>

        {/* 4. Data Retention */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            4. Data Retention
          </h2>
          <p>
            We retain your data only as long as necessary to provide our services. Here&apos;s how long we keep different
            types of information:
          </p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-3">
            <li>
              <strong>Account Data.</strong> Your profile information, journal entries, and other content are retained for
              as long as your account is active. You may delete individual entries at any time, and they are removed
              immediately.
            </li>
            <li>
              <strong>Sessions.</strong> Login sessions expire after 90 days of inactivity. If you use Inkwell regularly,
              your session renews automatically. Magic link tokens used for sign-in expire after 15 minutes and can only
              be used once.
            </li>
            <li>
              <strong>Notifications.</strong> Read notifications are automatically deleted after 90 days. Unread
              notifications are retained until you read or dismiss them.
            </li>
            <li>
              <strong>Drafts.</strong> Unpublished draft entries that have not been edited in over 12 months are
              automatically deleted.
            </li>
            <li>
              <strong>Uploaded Images.</strong> Images uploaded to journal entries that are not included in any entry are
              automatically deleted after 24 hours.
            </li>
            <li>
              <strong>Account Deletion.</strong> You may delete your account at any time from your Settings page. When you
              delete your account, we immediately and permanently delete your profile, journal entries, images,
              relationships, notifications, and all other personal data. Community contributions such as feedback posts
              and comments are preserved in an anonymized form with no personally identifiable information attached.
            </li>
            <li>
              <strong>Automated Cleanup.</strong> We run automated processes daily to remove expired sessions, orphaned
              files, old notifications, and abandoned drafts in accordance with the retention periods described above.
            </li>
          </ul>
        </section>

        {/* 5. Your Rights and Choices */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            5. Your Rights and Choices
          </h2>

          <h3 className="font-semibold mt-4 mb-2">5.1 All Users</h3>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Access and correction:</strong> You can access and update your account information at any time
              through your account settings.
            </li>
            <li>
              <strong>Deletion:</strong> You can delete individual entries and comments, or delete your entire account
              through your account settings.
            </li>
            <li>
              <strong>Data export:</strong> You can export your journal entries, comments, profile data, and account
              information in a standard, machine-readable format through your account settings.
            </li>
            <li>
              <strong>Privacy controls:</strong> You can control the visibility of each journal entry (public,
              friends-only, private, or custom friend filters).
            </li>
            <li>
              <strong>Email preferences:</strong> You can manage your email notification preferences in your account
              settings. Service-critical emails (such as security alerts) cannot be opted out of.
            </li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">5.2 European Economic Area (EEA) and UK Users (GDPR)</h3>
          <p>
            If you are located in the EEA or the United Kingdom, you have additional rights under the General Data
            Protection Regulation (GDPR), including:
          </p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-3">
            <li>
              <strong>Legal basis for processing:</strong> We process your personal data based on: (a) your consent
              (e.g., when you create an account); (b) the performance of our contract with you (the Terms of Service);
              (c) our legitimate interests in operating and improving the Service; and (d) compliance with legal
              obligations.
            </li>
            <li>
              <strong>Right to access:</strong> You have the right to request a copy of the personal data we hold about
              you.
            </li>
            <li>
              <strong>Right to rectification:</strong> You have the right to request correction of inaccurate personal
              data.
            </li>
            <li>
              <strong>Right to erasure:</strong> You have the right to request deletion of your personal data, subject to
              certain exceptions.
            </li>
            <li>
              <strong>Right to restrict processing:</strong> You have the right to request that we limit the processing of
              your personal data in certain circumstances.
            </li>
            <li>
              <strong>Right to data portability:</strong> You have the right to receive your personal data in a
              structured, commonly used, machine-readable format.
            </li>
            <li>
              <strong>Right to object:</strong> You have the right to object to our processing of your personal data based
              on our legitimate interests.
            </li>
            <li>
              <strong>Right to lodge a complaint:</strong> You have the right to lodge a complaint with your local data
              protection supervisory authority.
            </li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>. We will respond to your request within 30 days.
          </p>

          <h3 className="font-semibold mt-4 mb-2">5.3 California Users (CCPA/CPRA)</h3>
          <p>
            If you are a California resident, the California Consumer Privacy Act (CCPA), as amended by the California
            Privacy Rights Act (CPRA), provides you with additional rights:
          </p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-3">
            <li>
              <strong>Right to know:</strong> You have the right to request information about the categories and specific
              pieces of personal information we have collected about you.
            </li>
            <li>
              <strong>Right to delete:</strong> You have the right to request deletion of your personal information,
              subject to certain exceptions.
            </li>
            <li>
              <strong>Right to correct:</strong> You have the right to request correction of inaccurate personal
              information.
            </li>
            <li>
              <strong>Right to opt out of sale/sharing:</strong> Inkwell does not sell your personal information and does
              not share it for cross-context behavioral advertising purposes.
            </li>
            <li>
              <strong>Non-discrimination:</strong> We will not discriminate against you for exercising your privacy
              rights.
            </li>
          </ul>
          <p className="mt-3">
            To exercise your rights, contact us at{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>.
          </p>
        </section>

        {/* 6. Data Security */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            6. Data Security
          </h2>
          <p>
            We implement reasonable technical and organizational measures to protect your personal information, including
            encryption of data in transit (TLS/HTTPS), hashed password storage, and access controls on our
            infrastructure.
          </p>
          <p className="mt-3">
            However, no method of transmission over the internet or electronic storage is completely secure. We cannot
            guarantee the absolute security of your information. If we become aware of a security breach that affects your
            personal data, we will notify you and applicable authorities as required by law.
          </p>
        </section>

        {/* 7. Cookies and Similar Technologies */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            7. Cookies and Similar Technologies
          </h2>
          <p>Inkwell uses the following types of cookies:</p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-3">
            <li>
              <strong>Essential cookies:</strong> These are required for the Service to function, including session
              management and authentication. These cookies cannot be disabled.
            </li>
            <li>
              <strong>Preference cookies:</strong> These remember your settings and preferences (such as theme or display
              preferences).
            </li>
          </ul>
          <p className="mt-3">
            Inkwell does not use advertising cookies or tracking pixels. We do not participate in third-party ad networks.
          </p>
        </section>

        {/* 8. Children's Privacy */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            8. Children&apos;s Privacy
          </h2>
          <p>
            The Service is not directed to children under the age of 16. We do not knowingly collect personal information
            from children under 16. If we become aware that we have collected personal information from a child under 16
            without verification of parental consent, we will take steps to delete that information.
          </p>
          <p className="mt-3">
            If you believe we may have collected information from a child under 16, please contact us at{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>.
          </p>
        </section>

        {/* 9. International Data Transfers */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            9. International Data Transfers
          </h2>
          <p>
            Inkwell&apos;s servers are located in Chicago, IL, USA. If you access the Service from outside this
            jurisdiction, your information may be transferred to, stored, and processed in a country that may not provide
            the same level of data protection as your jurisdiction.
          </p>
        </section>

        {/* 10. Third-Party Links and Federated Content */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            10. Third-Party Links and Federated Content
          </h2>
          <p>
            The Service may contain links to third-party websites or display content from federated servers. This Privacy
            Policy does not apply to third-party services. We encourage you to review the privacy policies of any
            third-party services you interact with.
          </p>
        </section>

        {/* 11. Changes to This Privacy Policy */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            11. Changes to This Privacy Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will notify you by
            posting a notice on the Service and, where possible, by email at least 14 days before the changes take effect.
          </p>
          <p className="mt-3">
            We encourage you to review this Privacy Policy periodically. The &ldquo;Last Updated&rdquo; date at the top
            of this policy indicates when it was most recently revised.
          </p>
        </section>

        {/* 12. Contact Us */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            12. Contact Us
          </h2>
          <p>
            If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please
            contact us at:
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

        {/* Cross-link */}
        <p className="text-sm pt-4 border-t" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          See also: <Link href="/terms" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>Terms of Service</Link>
        </p>
      </div>
    </main>
  );
}
