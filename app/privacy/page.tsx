// app/privacy/page.tsx
//
// Public privacy policy. Required in two places beyond ordinary good practice:
//
//   1. Google's OAuth verification for the sensitive `adwords` scope will not approve an app whose
//      verified domain has no published privacy policy.
//   2. The Google Ads API Basic Access design document (Section 9) cites this URL, and a reviewer
//      clicks it.
//
// ── EVERY CLAIM HERE IS CHECKED AGAINST THE CODE ────────────────────────────────────────────────
//
// A privacy policy is a representation about real behaviour, so this page was written from the
// actual data flows rather than from a template. The load-bearing specifics and where they come from:
//
//   • Form fields collected            → `LeadInput` / `LeadRow` in lib/leads/intake.ts
//   • Attribution columns              → `emptyAttributionColumns()` in lib/leads/intake.ts
//   • IP is HASHED, never stored raw   → lib/leads/intake.ts (`client_ip_hash`, "Never the raw address")
//   • Card data never reaches us       → app/pay/[invoice]/StripeCardForm.tsx (Stripe Elements)
//   • Ads tag is conversion-only, no
//     GA4 property exists              → app/components/GoogleAdsScript.tsx
//   • Offline conversion upload sends
//     click ID + time + value only     → lib/integrations/google-ads/client.ts (ClickConversion)
//
// If any of those change, this page is wrong and must change with them. That is the whole reason the
// list above exists.
//
// ── AND ONE CLASS OF CLAIM THE CODE CANNOT SETTLE ───────────────────────────────────────────────
//
// This page originally said "We do not run remarketing or retargeting. We do not build audience
// lists." Both halves looked true from in here: no remarketing campaign, no audience code, nothing in
// the repo touching audiences. Tag Assistant then showed the live site sending a `Remarketing` hit to
// AW-17921491739 on every page view — because the Google Ads tag does audience collection BY DEFAULT,
// as an account-level behaviour with no representation in this codebase at all.
//
// So: a claim about what Google's own tag does, or about how the Ads account is configured, cannot be
// verified by reading this repository and must not be written as if it can. Check it in Tag Assistant
// or in the Ads account before it goes on this page. `__tests__/marketing/privacy-policy-stays-true`
// guards the claims that ARE code-derived; it is silent on this one by necessity.

import type { Metadata } from 'next';
import Link from 'next/link';

import '../styles/Privacy.css';

export const metadata: Metadata = {
  // Just the page name: the root layout's title template appends "| Starr Surveying", so including
  // the brand here rendered as "Privacy Policy | Starr Surveying | Starr Surveying".
  title: 'Privacy Policy',
  description:
    'How Starr Surveying collects, uses, and protects your information when you request a survey quote, pay an invoice, or browse our website.',
};

/** Shown in the header and in the "Changes" section, so it is stated once. */
// Bumped 2026-08-07: the remarketing claim was corrected. The policy's own "Changes" section
// promises the date moves when the substance does, so an amendment that leaves it alone is itself a
// small false statement.
const EFFECTIVE_DATE = 'August 7, 2026';

interface Section {
  id: string;
  title: string;
}

/** Drives the on-page contents list AND the section headings, so a new section cannot appear in one
 *  and go missing from the other. */
const SECTIONS: Section[] = [
  { id: 'who-we-are', title: 'Who We Are' },
  { id: 'what-we-collect', title: 'Information We Collect' },
  { id: 'cookies', title: 'Cookies and Advertising' },
  { id: 'conversion-measurement', title: 'How We Measure Our Advertising' },
  { id: 'how-we-use', title: 'How We Use Your Information' },
  { id: 'sharing', title: 'How We Share Information' },
  { id: 'retention', title: 'How Long We Keep Information' },
  { id: 'your-choices', title: 'Your Choices and Rights' },
  { id: 'security', title: 'How We Protect Information' },
  { id: 'children', title: "Children's Privacy" },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact Us' },
];

export default function PrivacyPolicyPage(): React.ReactElement {
  return (
    <main className="privacy">
      {/* ── Hero ────────────────────────────────────────────────────────────────────────────── */}
      <section className="privacy-hero">
        <div className="privacy-hero__container">
          <div className="privacy-hero__card">
            <h1 className="privacy-hero__title">Privacy Policy</h1>
            <p className="privacy-hero__subtitle">
              How we collect, use, and protect your information.
            </p>
            <p className="privacy-hero__date">
              Effective {EFFECTIVE_DATE}
            </p>
          </div>
        </div>
      </section>

      <div className="privacy-body">
        <div className="privacy-body__container">
          {/* ── Contents ──────────────────────────────────────────────────────────────────── */}
          <nav className="privacy-toc" aria-label="Contents">
            <h2 className="privacy-toc__heading">Contents</h2>
            <ol className="privacy-toc__list">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="privacy-toc__link">{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {/* ── 1. Who we are ─────────────────────────────────────────────────────────────── */}
          <section id="who-we-are" className="privacy-section">
            <h2 className="privacy-section__title">Who We Are</h2>
            <p>
              Starr Surveying is the trade name of Starr Technical Services Inc., a licensed land
              surveying firm based in Belton, Texas. We perform boundary surveys, ALTA/NSPS land title
              surveys, topographic surveys, subdivision platting, and construction staking for property
              owners, builders, developers, and title companies in Central Texas.
            </p>
            <p>
              This policy explains what happens to your information when you visit{' '}
              <strong>www.starr-surveying.com</strong>, request a quote, send us a message, or pay an
              invoice through our website. It applies to this website and the services we provide
              through it.
            </p>
            <p>
              We are a small family business. We do not sell personal information, and we do not share
              it with anyone except the service providers listed below who help us run the company.
            </p>
          </section>

          {/* ── 2. What we collect ────────────────────────────────────────────────────────── */}
          <section id="what-we-collect" className="privacy-section">
            <h2 className="privacy-section__title">Information We Collect</h2>

            <h3 className="privacy-section__sub">Information you give us</h3>
            <p>
              When you request a quote or contact us through the website, we collect what you enter on
              the form:
            </p>
            <ul className="privacy-list">
              <li>Your name</li>
              <li>Your email address</li>
              <li>Your phone number, if you provide one</li>
              <li>The address or location of the property to be surveyed</li>
              <li>The type of survey you need, and the estimated acreage if you tell us</li>
              <li>Any project details or description you write</li>
              <li>Any files you attach, such as a deed, plat, or site plan</li>
              <li>How you heard about us, if you answer that question</li>
            </ul>
            <p>
              You choose what to send us. Only your name and a way to reach you are needed for us to
              respond.
            </p>

            <h3 className="privacy-section__sub">Payment information</h3>
            <p>
              If you pay an invoice online, your card details are entered into a secure form hosted by{' '}
              <strong>Stripe</strong>, our payment processor, and are transmitted directly to Stripe.{' '}
              <strong>
                Your full card number never reaches our servers and we never see or store it.
              </strong>{' '}
              We receive only a confirmation that the payment succeeded, the amount, and a reference
              identifier so we can mark your invoice paid.
            </p>

            <h3 className="privacy-section__sub">Information collected automatically</h3>
            <p>
              When you arrive from an online advertisement or a search result and then submit a form,
              we record a small amount of technical information alongside your inquiry so we can tell
              which advertising actually brings us work:
            </p>
            <ul className="privacy-list">
              <li>
                An advertising click identifier supplied by Google, if you arrived by clicking one of
                our ads
              </li>
              <li>
                Campaign tracking values in the web address you arrived on, such as the campaign or
                keyword name
              </li>
              <li>The page you landed on and the website that referred you, if any</li>
              <li>The date and time you first arrived</li>
              <li>Your browser type and version</li>
              <li>
                A one-way <strong>hashed</strong> form of your IP address.{' '}
                <strong>We do not store your actual IP address.</strong> The hash lets us recognise
                duplicate submissions without keeping the address itself.
              </li>
            </ul>
            <p>
              None of this identifies you personally on its own. It becomes associated with you only
              because you chose to submit a form.
            </p>

            <h3 className="privacy-section__sub">Employee accounts</h3>
            <p>
              Our staff sign in to an internal administration area using their Google account, which
              provides us their name, email address, and profile picture. This applies only to our
              employees. Customers do not have accounts on this website.
            </p>
          </section>

          {/* ── 3. Cookies ────────────────────────────────────────────────────────────────── */}
          <section id="cookies" className="privacy-section">
            <h2 className="privacy-section__title">Cookies and Advertising</h2>
            <p>
              We use Google&apos;s advertising tag on this website. It sets cookies that let Google tell
              us when a visit that came from one of our ads turned into an inquiry. This is how we know
              whether our advertising is worth what we spend on it.
            </p>
            <div className="privacy-callout">
              <p className="privacy-callout__title">What we deliberately do not do</p>
              <ul className="privacy-list privacy-list--tight">
                <li>
                  <strong>We do not run a general web analytics profile on this site.</strong> There is
                  no Google Analytics property installed. We are not building a picture of how you
                  browse.
                </li>
                <li>
                  <strong>We do not run remarketing or retargeting campaigns.</strong> We do not show
                  you our ads elsewhere on the internet based on your visit here. Google&apos;s
                  advertising tag does collect data that Google can use to build advertising audiences,
                  which is on by default for advertisers — we simply do not use it. You can switch this
                  off for your own Google account in{' '}
                  <a
                    href="https://myadcenter.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="privacy-link"
                  >
                    My Ad Center
                  </a>
                  .
                </li>
                <li>
                  <strong>We do not sell your information</strong> and we do not share it for
                  cross-context behavioural advertising.
                </li>
              </ul>
            </div>
            <p>
              You can control advertising cookies in several ways. Your browser settings let you block
              or delete cookies. Google&apos;s own{' '}
              <a
                href="https://myadcenter.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="privacy-link"
              >
                My Ad Center
              </a>{' '}
              lets you manage how Google personalises ads for you. Blocking these cookies does not
              affect your ability to use this website or to request a quote.
            </p>
          </section>

          {/* ── 4. Conversion measurement ─────────────────────────────────────────────────── */}
          <section id="conversion-measurement" className="privacy-section">
            <h2 className="privacy-section__title">How We Measure Our Advertising</h2>
            <p>
              We want to be specific about this, because it is the one place where information about
              your inquiry travels back to Google.
            </p>
            <p>
              When an inquiry that came from one of our ads progresses through our normal business
              process — we send a quote, you accept it, the job is completed and the invoice is paid —
              we report that progress back to our own Google Ads account so that Google can tell which
              of our ads produce real work rather than just form submissions.
            </p>
            <p>What we send to Google for this purpose is limited to:</p>
            <ul className="privacy-list">
              <li>The advertising click identifier Google itself supplied when you clicked the ad</li>
              <li>The date and time the milestone happened</li>
              <li>The currency and dollar amount involved</li>
            </ul>
            <div className="privacy-callout privacy-callout--strong">
              <p>
                <strong>
                  We do not send your name, email address, phone number, property address, or any other
                  personal detail to Google.
                </strong>{' '}
                We do not upload hashed customer identifiers. The click identifier is a value Google
                created, and it is meaningful only inside our own advertising account.
              </p>
            </div>
          </section>

          {/* ── 5. How we use ─────────────────────────────────────────────────────────────── */}
          <section id="how-we-use" className="privacy-section">
            <h2 className="privacy-section__title">How We Use Your Information</h2>
            <ul className="privacy-list">
              <li>To respond to your inquiry and prepare a quote</li>
              <li>To perform the surveying work you hire us to do</li>
              <li>To communicate with you about your project by email, phone, or text message</li>
              <li>To invoice you and process your payment</li>
              <li>To keep the business records we are required to keep as a licensed surveying firm</li>
              <li>
                To measure whether our advertising is working, as described in the section above
              </li>
              <li>To protect the website against spam and abuse</li>
            </ul>
            <p>
              We do not use your information to build advertising profiles, and we do not sell or rent
              it to anyone.
            </p>
          </section>

          {/* ── 6. Sharing ────────────────────────────────────────────────────────────────── */}
          <section id="sharing" className="privacy-section">
            <h2 className="privacy-section__title">How We Share Information</h2>
            <p>
              We share information only with the service providers that make our business run, and only
              to the extent each one needs. They are bound by their own agreements to protect it.
            </p>
            <div className="privacy-table-wrap">
              <table className="privacy-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>What it does for us</th>
                    <th>What it receives</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Vercel</td>
                    <td>Hosts this website</td>
                    <td>Technical request data</td>
                  </tr>
                  <tr>
                    <td>Supabase</td>
                    <td>Stores our business records</td>
                    <td>Your inquiry, job, and invoice records</td>
                  </tr>
                  <tr>
                    <td>Stripe</td>
                    <td>Processes card payments</td>
                    <td>Your card details and payment amount</td>
                  </tr>
                  <tr>
                    <td>Resend</td>
                    <td>Delivers our email</td>
                    <td>Your email address and message content</td>
                  </tr>
                  <tr>
                    <td>Twilio</td>
                    <td>Sends text message updates</td>
                    <td>Your phone number and message content</td>
                  </tr>
                  <tr>
                    <td>Google</td>
                    <td>Advertising and conversion measurement</td>
                    <td>Click identifier, timestamp, and amount only</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We may also disclose information when the law requires it, when a court orders it, or when
              it is necessary to establish or defend a legal claim. If our business is ever sold or
              merged, customer records would transfer as part of that business.
            </p>
          </section>

          {/* ── 7. Retention ──────────────────────────────────────────────────────────────── */}
          <section id="retention" className="privacy-section">
            <h2 className="privacy-section__title">How Long We Keep Information</h2>
            <p>
              Survey records are professional records. Texas rules governing licensed land surveyors,
              together with the long-term nature of boundary work, mean that completed survey files,
              field notes, and the records identifying the property and the client are kept
              indefinitely. A boundary survey may need to be referenced decades later, sometimes by a
              future owner of the same property.
            </p>
            <p>
              Inquiries that never became jobs are kept for a limited period so we can follow up and
              understand our own sales activity, and are then removed. Payment records are kept as long
              as tax and accounting rules require.
            </p>
          </section>

          {/* ── 8. Your choices ───────────────────────────────────────────────────────────── */}
          <section id="your-choices" className="privacy-section">
            <h2 className="privacy-section__title">Your Choices and Rights</h2>
            <p>You can always:</p>
            <ul className="privacy-list">
              <li>Ask us what information we hold about you</li>
              <li>Ask us to correct anything that is wrong</li>
              <li>
                Ask us to delete information that we are not required to keep as a professional or tax
                record
              </li>
              <li>Ask us to stop contacting you, or reply STOP to any text message</li>
              <li>Block advertising cookies through your browser or Google&apos;s ad settings</li>
            </ul>
            <p>
              Texas residents have rights under the Texas Data Privacy and Security Act, including the
              right to know what personal data we process, to correct it, to delete it, to obtain a copy
              of it, and to appeal if we decline a request. We do not sell personal data and we do not
              use it for targeted advertising or profiling, so there is nothing to opt out of on those
              points.
            </p>
            <p>
              To make any request, email{' '}
              <a href="mailto:info@starr-surveying.com" className="privacy-link">
                info@starr-surveying.com
              </a>{' '}
              or call{' '}
              <a href="tel:9366620077" className="privacy-link">
                (936) 662-0077
              </a>
              . We will respond within 45 days. We may need to verify who you are before releasing
              information, which usually means confirming details of a project we did for you.
            </p>
          </section>

          {/* ── 9. Security ───────────────────────────────────────────────────────────────── */}
          <section id="security" className="privacy-section">
            <h2 className="privacy-section__title">How We Protect Information</h2>
            <ul className="privacy-list">
              <li>All traffic to and from this website is encrypted using HTTPS.</li>
              <li>
                Card numbers are handled entirely by Stripe and never pass through or rest on our
                systems.
              </li>
              <li>
                Our internal administration area requires each employee to sign in, and access is
                limited by role, so staff see only what their job requires.
              </li>
              <li>
                Visitor IP addresses are stored only as a one-way hash, never in their original form.
              </li>
              <li>
                Credentials for the services we use are held as encrypted configuration and are never
                published in our website code.
              </li>
            </ul>
            <p>
              No system is perfectly secure, and we will not pretend otherwise. If a breach ever affects
              your information, we will notify you as the law requires.
            </p>
          </section>

          {/* ── 10. Children ──────────────────────────────────────────────────────────────── */}
          <section id="children" className="privacy-section">
            <h2 className="privacy-section__title">Children&apos;s Privacy</h2>
            <p>
              This is a business website for professional surveying services. It is not directed to
              children, and we do not knowingly collect information from anyone under 13. If you believe
              a child has sent us information, contact us and we will delete it.
            </p>
          </section>

          {/* ── 11. Changes ───────────────────────────────────────────────────────────────── */}
          <section id="changes" className="privacy-section">
            <h2 className="privacy-section__title">Changes to This Policy</h2>
            <p>
              If we change how we handle information, we will update this page and change the effective
              date at the top. This version is effective {EFFECTIVE_DATE}.
            </p>
          </section>

          {/* ── 12. Contact ───────────────────────────────────────────────────────────────── */}
          <section id="contact" className="privacy-section">
            <h2 className="privacy-section__title">Contact Us</h2>
            <p>Questions about this policy, or about your information, come straight to us:</p>
            <address className="privacy-contact">
              <span className="privacy-contact__name">Starr Surveying</span>
              <span>Starr Technical Services Inc.</span>
              <span>3779 W FM 436, Belton, TX 76513</span>
              <span>
                <a href="tel:9366620077" className="privacy-link">(936) 662-0077</a>
              </span>
              <span>
                <a href="mailto:info@starr-surveying.com" className="privacy-link">
                  info@starr-surveying.com
                </a>
              </span>
            </address>
            <div className="privacy-cta">
              <Link href="/contact" className="privacy-cta__button">
                Request a Free Quote
              </Link>
              <Link href="/" className="privacy-cta__link">
                Return to home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
