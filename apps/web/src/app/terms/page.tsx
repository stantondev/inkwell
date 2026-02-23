import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Inkwell Terms of Service — the rules that govern your use of the platform.",
};

export default function TermsPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Terms of Service
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Last Updated: February 22, 2026
      </p>

      <div className="prose-legal flex flex-col gap-8 text-base leading-relaxed">
        <p>
          Welcome to Inkwell (&ldquo;Inkwell,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          Inkwell is a federated social journaling platform operated by Inkwell, a sole proprietorship based in Indiana.
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Inkwell platform, including
          our website at inkwell.social, our applications, and all related services (collectively, the &ldquo;Service&rdquo;).
        </p>
        <p>
          By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree to these
          Terms, you may not use the Service.
        </p>

        {/* 1. Eligibility */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            1. Eligibility
          </h2>
          <p>
            You must be at least 16 years of age to use the Service. If you are between 16 and 18 years of age (or the
            age of majority in your jurisdiction), you represent that your parent or legal guardian has reviewed and agreed
            to these Terms on your behalf.
          </p>
          <p className="mt-3">
            By using the Service, you represent and warrant that you have the legal capacity to enter into a binding
            agreement and that your use of the Service does not violate any applicable law or regulation.
          </p>
        </section>

        {/* 2. Your Account */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            2. Your Account
          </h2>
          <p>
            To use certain features of the Service, you must create an account. You agree to provide accurate, current,
            and complete information during registration and to update such information as necessary to keep it accurate.
          </p>
          <p className="mt-3">
            You are solely responsible for maintaining the confidentiality of your account credentials and for all activity
            that occurs under your account. You agree to notify us immediately at{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>{" "}
            if you become aware of any unauthorized use of your account.
          </p>
          <p className="mt-3">
            We reserve the right to suspend or terminate your account if any information provided proves to be inaccurate,
            not current, or incomplete, or if we have reasonable grounds to suspect a violation of these Terms.
          </p>
        </section>

        {/* 3. The Service and Beta Status */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            3. The Service and Beta Status
          </h2>
          <p>
            Inkwell is currently in open beta. During the beta period, the Service is provided on an &ldquo;as is&rdquo;
            and &ldquo;as available&rdquo; basis. Features may change, be added, or be removed without advance notice. We
            do not guarantee uninterrupted availability, and data loss may occur during the beta period, though we will
            make reasonable efforts to prevent it.
          </p>
          <p className="mt-3">
            We will make reasonable efforts to notify you of material changes to the Service, but we are not obligated to
            maintain any particular feature or functionality.
          </p>
        </section>

        {/* 4. Content Ownership and Licenses */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            4. Content Ownership and Licenses
          </h2>

          <h3 className="font-semibold mt-4 mb-2">4.1 Your Content</h3>
          <p>
            You retain full ownership of all content you create, upload, or post through the Service (&ldquo;Your
            Content&rdquo;). Inkwell does not claim any ownership rights in Your Content.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.2 License to Inkwell</h3>
          <p>
            By posting content on the Service, you grant Inkwell a worldwide, non-exclusive, royalty-free license to host,
            store, display, reproduce, and distribute Your Content solely as necessary to operate and provide the Service.
            This includes distributing Your Content via the ActivityPub protocol to federated servers when you publish
            content with public or federated visibility settings.
          </p>
          <p className="mt-3">
            This license terminates when you delete Your Content from the Service, subject to the federation provisions in
            Section 5 and reasonable backup retention periods.
          </p>

          <h3 className="font-semibold mt-4 mb-2">4.3 Responsibility for Your Content</h3>
          <p>
            You represent and warrant that you own or have the necessary rights to post Your Content and that Your Content
            does not infringe or violate the intellectual property rights, privacy rights, or any other rights of any
            third party.
          </p>
        </section>

        {/* 5. Federation and the Open Social Web */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            5. Federation and the Open Social Web
          </h2>
          <p>
            Inkwell uses the ActivityPub protocol to federate with other platforms on the open social web (such as
            Mastodon, Ghost, and others). You acknowledge and agree to the following:
          </p>
          <ul className="list-disc pl-6 mt-3 flex flex-col gap-3">
            <li>
              <strong>Distribution of public content.</strong> When you publish content with public or federated
              visibility, that content may be distributed to and cached by third-party servers that we do not own or
              control.
            </li>
            <li>
              <strong>Limited control over federated copies.</strong> While we will send deletion requests to federated
              servers when you delete content, we cannot guarantee that all copies will be removed from all third-party
              servers. Remote servers may retain cached copies in accordance with their own policies.
            </li>
            <li>
              <strong>Incoming federated content.</strong> Content from users on other federated platforms may appear in
              your feed or interactions. Such content is subject to the terms and moderation policies of its originating
              server, and Inkwell is not responsible for the accuracy, legality, or appropriateness of federated content
              from external sources.
            </li>
            <li>
              <strong>Privacy settings apply locally.</strong> Inkwell&apos;s per-entry privacy controls (friends-only,
              private, custom filters) are enforced on Inkwell&apos;s servers. Content marked as &ldquo;public&rdquo; and
              federated to external servers is subject to those servers&apos; privacy and display implementations.
            </li>
          </ul>
        </section>

        {/* 6. Acceptable Use */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            6. Acceptable Use
          </h2>
          <p>You agree not to use the Service to:</p>
          <ol className="list-[lower-alpha] pl-6 mt-3 flex flex-col gap-2">
            <li>
              Post, transmit, or distribute content that is unlawful, defamatory, obscene, abusive, threatening,
              harassing, or that promotes violence, hatred, or discrimination against any individual or group;
            </li>
            <li>
              Post or distribute child sexual abuse material (CSAM) or any content that sexually exploits or endangers
              minors;
            </li>
            <li>
              Impersonate any person or entity, or falsely state or misrepresent your affiliation with any person or
              entity;
            </li>
            <li>
              Engage in doxxing, stalking, or the non-consensual sharing of another person&apos;s private information;
            </li>
            <li>Distribute spam, malware, viruses, or other harmful code;</li>
            <li>
              Attempt to gain unauthorized access to other users&apos; accounts, the Service&apos;s infrastructure, or
              any connected systems;
            </li>
            <li>
              Use the Service in any manner that could interfere with, disrupt, or impose an unreasonable burden on the
              Service or its infrastructure;
            </li>
            <li>
              Use automated systems, bots, or scrapers to access the Service in a manner that exceeds reasonable use,
              without our prior written consent;
            </li>
            <li>Violate any applicable local, state, national, or international law or regulation.</li>
          </ol>
          <p className="mt-3">
            We reserve the right to remove content and suspend or terminate accounts that violate this Section, at our
            sole discretion.
          </p>
        </section>

        {/* 7. Profile Customization */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            7. Profile Customization
          </h2>
          <p>
            Inkwell allows users to customize their profiles using CSS and HTML within a sandboxed environment (Shadow
            DOM). You agree that your profile customizations will not attempt to break out of the sandbox, inject
            malicious scripts, impersonate Inkwell interface elements, or create deceptive or misleading experiences for
            other users.
          </p>
          <p className="mt-3">
            We reserve the right to disable or revert profile customizations that we determine, in our sole discretion, to
            be harmful, deceptive, or disruptive.
          </p>
        </section>

        {/* 8. Paid Subscriptions */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            8. Paid Subscriptions (Inkwell Plus)
          </h2>

          <h3 className="font-semibold mt-4 mb-2">8.1 Billing and Renewal</h3>
          <p>
            Inkwell Plus is a subscription service billed at $5.00 USD per month (or such other price as may be in effect
            at the time of your subscription). Your subscription will automatically renew each billing cycle unless you
            cancel before the renewal date.
          </p>

          <h3 className="font-semibold mt-4 mb-2">8.2 Cancellation</h3>
          <p>
            You may cancel your Inkwell Plus subscription at any time through your account settings. Upon cancellation,
            you will retain access to Plus features until the end of your current billing period. After that, your account
            will revert to the free tier.
          </p>

          <h3 className="font-semibold mt-4 mb-2">8.3 Refunds</h3>
          <p>
            Subscription fees are generally non-refundable. However, we may offer refunds at our discretion on a
            case-by-case basis. If you believe you are entitled to a refund, please contact us at{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>.
          </p>

          <h3 className="font-semibold mt-4 mb-2">8.4 Price Changes</h3>
          <p>
            We may change the price of Inkwell Plus from time to time. Any price changes will be communicated to you at
            least 30 days before they take effect. Your continued use of the subscription after the price change takes
            effect constitutes your agreement to the new price.
          </p>

          <h3 className="font-semibold mt-4 mb-2">8.5 Payment Processing</h3>
          <p>
            Payments are processed by our third-party payment processor, Stripe. Your payment information is handled
            directly by the payment processor and is subject to their terms and privacy policy. Inkwell does not store your
            full payment card details.
          </p>
        </section>

        {/* 9. Copyright and DMCA Policy */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            9. Copyright and DMCA Policy
          </h2>
          <p>
            Inkwell respects the intellectual property rights of others and expects its users to do the same. If you
            believe that your copyrighted work has been copied in a way that constitutes copyright infringement, please
            provide our designated DMCA agent with the following information:
          </p>
          <ol className="list-[lower-alpha] pl-6 mt-3 flex flex-col gap-2">
            <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf;</li>
            <li>Identification of the copyrighted work claimed to have been infringed;</li>
            <li>
              Identification of the material claimed to be infringing and information sufficient to locate it on the
              Service;
            </li>
            <li>Your contact information, including address, telephone number, and email address;</li>
            <li>
              A statement that you have a good faith belief that the use of the material is not authorized by the
              copyright owner, its agent, or the law;
            </li>
            <li>
              A statement, made under penalty of perjury, that the information in your notice is accurate and that you are
              the copyright owner or authorized to act on the copyright owner&apos;s behalf.
            </li>
          </ol>
          <p className="mt-3">
            <strong>DMCA Agent:</strong> Stanton Melvin,{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>, 1127 Pennington Ln, Westfield, IN 46074
          </p>
          <p className="mt-3">
            Upon receipt of a valid takedown notice, we will remove or disable access to the allegedly infringing material
            and notify the user who posted it. Users may submit a counter-notification if they believe the takedown was
            made in error.
          </p>
        </section>

        {/* 10. Termination */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            10. Termination
          </h2>

          <h3 className="font-semibold mt-4 mb-2">10.1 By You</h3>
          <p>
            You may delete your account at any time through your account settings. Upon deletion, we will remove your
            profile and content from public display. Federated copies of previously public content on third-party servers
            are subject to the limitations described in Section 5.
          </p>

          <h3 className="font-semibold mt-4 mb-2">10.2 By Inkwell</h3>
          <p>
            We may suspend or terminate your account at any time for any reason, including but not limited to a violation
            of these Terms. Where practicable, we will provide notice and an opportunity to export your data before
            termination, unless the violation is severe (such as posting CSAM or engaging in conduct that poses an
            imminent threat to others).
          </p>

          <h3 className="font-semibold mt-4 mb-2">10.3 Effect of Termination</h3>
          <p>
            Upon termination, your right to use the Service immediately ceases. Sections 4, 5, 12, 13, 14, and 15
            survive termination.
          </p>
        </section>

        {/* 11. Disclaimers */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            11. Disclaimers
          </h2>
          <p className="uppercase text-sm">
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
            either express or implied, including but not limited to implied warranties of merchantability, fitness for a
            particular purpose, and non-infringement. Inkwell does not warrant that the Service will be uninterrupted,
            error-free, or secure, or that any defects will be corrected.
          </p>
          <p className="uppercase text-sm mt-3">
            Inkwell does not endorse, warrant, or assume responsibility for any content posted by users or any third-party
            content received via federation.
          </p>
        </section>

        {/* 12. Limitation of Liability */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            12. Limitation of Liability
          </h2>
          <p className="uppercase text-sm">
            To the maximum extent permitted by applicable law, Inkwell and its officers, directors, employees, and agents
            shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of
            profits, data, use, or goodwill, arising out of or related to your use of or inability to use the Service,
            regardless of the theory of liability.
          </p>
          <p className="uppercase text-sm mt-3">
            In no event shall Inkwell&apos;s total liability to you for all claims arising out of or related to these
            Terms or the Service exceed the greater of (a) the amount you have paid to Inkwell in the twelve (12) months
            preceding the claim, or (b) fifty dollars ($50.00 USD).
          </p>
        </section>

        {/* 13. Dispute Resolution */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            13. Dispute Resolution
          </h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the State of Indiana, without
            regard to its conflict of law provisions. Any disputes arising under or in connection with these Terms shall be
            subject to the exclusive jurisdiction of the state and federal courts located in Hamilton County, Indiana.
          </p>
        </section>

        {/* 15. Indemnification (note: original doc skips 14) */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            14. Indemnification
          </h2>
          <p>
            You agree to indemnify, defend, and hold harmless Inkwell and its officers, directors, employees, and agents
            from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys&apos;
            fees) arising out of or in any way connected with: (a) your use of the Service; (b) Your Content; (c) your
            violation of these Terms; or (d) your violation of any third-party rights.
          </p>
        </section>

        {/* 16. Changes to These Terms */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            15. Changes to These Terms
          </h2>
          <p>
            We may update these Terms from time to time. If we make material changes, we will notify you by posting a
            notice on the Service and, where possible, by email. Your continued use of the Service after the updated Terms
            take effect constitutes your acceptance of the revised Terms.
          </p>
          <p className="mt-3">We encourage you to review these Terms periodically.</p>
        </section>

        {/* 17. Data Portability */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            16. Data Portability
          </h2>
          <p>
            We believe your data is yours. Inkwell provides tools to export your journal entries, comments, profile data,
            and account information in a standard, machine-readable format. For information on data export and portability,
            please see our <Link href="/privacy" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>Privacy Policy</Link>.
          </p>
        </section>

        {/* 18. Open Source Software */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            17. Open Source Software
          </h2>
          <p>
            Portions of the Inkwell platform are released as open source software under the AGPL-3.0 license and are
            available at our GitHub repository. These Terms govern your use of the hosted Inkwell service at
            inkwell.social, which is separate from and in addition to the terms of any open source license that may apply
            to the underlying code.
          </p>
        </section>

        {/* 19. Contact Information */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            18. Contact Information
          </h2>
          <p>If you have questions about these Terms, please contact us at:</p>
          <p className="mt-3">
            <strong>Inkwell</strong><br />
            Email:{" "}
            <a href="mailto:hello@inkwell.social" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a><br />
            Address: 1127 Pennington Ln, Westfield, IN 46074
          </p>
        </section>
      </div>
    </main>
  );
}
