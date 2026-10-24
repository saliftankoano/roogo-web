import { Footer } from "../../../components/Footer";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read Roogo's privacy policy to understand how we collect, use, and protect your personal data.",
};

export default function PrivacyPageEn() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-neutral-900">
              Privacy Policy
            </h1>
            <Link
              href="/confidentialite"
              className="text-sm text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
            >
              Version française
            </Link>
          </div>

          <div className="prose prose-sm max-w-none text-neutral-600 space-y-8">
            <p className="text-sm italic">Last updated: April 20, 2026</p>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                1. Who We Are
              </h2>
              <p>
                Roogo is a digital real estate marketplace operated by{" "}
                <strong>Kazedra Technologies</strong>, headquartered in
                Karpala, Ouagadougou, Burkina Faso. We connect property
                owners, agents, and renters for searching, listing, and
                managing real estate.
              </p>
              <p className="mt-2">
                Contact:{" "}
                <a
                  href="mailto:hello@roogobf.com"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogobf.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                2. Data We Collect
              </h2>
              <p>
                Depending on how you use Roogo, we may collect the following
                categories of data:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Identity:</strong> first name, last name.
                </li>
                <li>
                  <strong>Contact:</strong> email address, phone number (used
                  for mobile money payments via PawaPay).
                </li>
                <li>
                  <strong>Precise location:</strong> GPS coordinates collected
                  only when publishing a property listing to pin its location
                  on the map, with your explicit permission.
                </li>
                <li>
                  <strong>Photos and media:</strong> images of properties you
                  publish, stored on our servers.
                </li>
                <li>
                  <strong>Financial data:</strong> mobile money phone number
                  (Orange Money / Moov Money) used to initiate and track rent
                  or service payments via PawaPay. Roogo does not store credit
                  card numbers.
                </li>
                <li>
                  <strong>Account data:</strong> user ID, account type (owner,
                  renter, agent), onboarding status.
                </li>
                <li>
                  <strong>Usage data:</strong> interactions with the app
                  (taps, navigation, session duration) collected via PostHog,
                  including session replay recordings for product improvement
                  purposes.
                </li>
                <li>
                  <strong>Technical data:</strong> IP address, device type,
                  operating system, session identifiers.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                3. How We Use Your Data
              </h2>
              <p>Your data is used to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  Create and manage your user account (authentication via
                  Clerk).
                </li>
                <li>Publish, display, and manage your property listings.</li>
                <li>
                  Facilitate connections between owners and renters, including
                  generating rental agreements.
                </li>
                <li>
                  Process rent and service payments via mobile money (PawaPay —
                  Orange Money, Moov Money).
                </li>
                <li>Pin properties on the map using GPS coordinates.</li>
                <li>
                  Send you notifications about your transactions, payments, and
                  platform activity.
                </li>
                <li>
                  Analyze platform usage to improve it (pseudonymized analytics
                  via PostHog).
                </li>
                <li>Meet our legal obligations and prevent fraud.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                4. Third-Party Service Providers
              </h2>
              <p>
                We use the following sub-processors to operate the platform.
                Each processes your data strictly within the scope of their
                service:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Clerk</strong> — user authentication and account
                  management.
                </li>
                <li>
                  <strong>Supabase</strong> — data storage (PostgreSQL database
                  and file storage).
                </li>
                <li>
                  <strong>PawaPay</strong> — mobile money payment processing
                  (Orange Money, Moov Money).
                </li>
                <li>
                  <strong>PostHog</strong> — product analytics and session
                  replay (pseudonymized data).
                </li>
                <li>
                  <strong>Vercel</strong> — web application hosting.
                </li>
                <li>
                  <strong>Expo / Apple / Google</strong> — mobile app
                  distribution and push notifications.
                </li>
              </ul>
              <p className="mt-3">
                We do not sell your personal data to third parties. We do not
                share your information for third-party advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                5. Data Sharing Between Users
              </h2>
              <p>
                Your contact details (name, phone, email) are only shared with
                another party (owner or renter) once an official connection has
                been established through the platform — an accepted application
                or a signed rental agreement. Published listings are publicly
                visible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                6. Data Retention
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Account data: retained for the lifetime of your account, then
                  deleted within 30 days of a deletion request.
                </li>
                <li>
                  Transaction data and rental agreements: retained for 5 years
                  to comply with legal and accounting obligations.
                </li>
                <li>
                  Analytics data: aggregated and anonymized after 24 months.
                </li>
                <li>
                  Listing photos: deleted when the listing or account is
                  deleted.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                7. Your Rights
              </h2>
              <p>
                In accordance with Burkinabè data protection law and GDPR
                principles, you have the following rights:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Right of access</strong> — obtain a copy of your
                  data.
                </li>
                <li>
                  <strong>Right to rectification</strong> — correct inaccurate
                  data.
                </li>
                <li>
                  <strong>Right to erasure</strong> — request deletion of your
                  account and data via{" "}
                  <Link
                    href="/supprimer-compte"
                    className="text-orange-600 hover:underline"
                  >
                    this page
                  </Link>
                  .
                </li>
                <li>
                  <strong>Right to object</strong> — opt out of analytics data
                  processing.
                </li>
                <li>
                  <strong>Right to portability</strong> — receive your data in
                  a structured format.
                </li>
              </ul>
              <p className="mt-3">
                To exercise these rights, contact us at{" "}
                <a
                  href="mailto:hello@roogobf.com"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogobf.com
                </a>
                . We respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                8. Security
              </h2>
              <p>
                Roogo implements appropriate technical and organizational
                measures: encrypted communications (HTTPS/TLS), role-based
                access control, data isolation via Row-Level Security
                (Supabase), and short-lived authentication tokens (Clerk JWT).
                No system is 100% foolproof; in the event of a data breach we
                will notify you as promptly as possible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                9. Minors
              </h2>
              <p>
                Roogo is not intended for persons under 18 years of age. We do
                not knowingly collect personal data from minors. If you believe
                a minor is using the platform, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                10. Changes to This Policy
              </h2>
              <p>
                We may update this policy from time to time. For material
                changes, we will notify you via an in-app notification or
                email. The last updated date is shown at the top of this page.
                Continued use of the platform after notification constitutes
                acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                11. Governing Law
              </h2>
              <p>
                This policy is governed by the laws of Burkina Faso. Any
                dispute relating to data protection shall be subject to the
                competent jurisdiction of Ouagadougou, Burkina Faso.
              </p>
            </section>

            <section className="border-t pt-6">
              <p className="text-sm">
                <strong>Kazedra Technologies</strong> — Karpala, Ouagadougou,
                Burkina Faso
                <br />
                Email:{" "}
                <a
                  href="mailto:hello@roogobf.com"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogobf.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
