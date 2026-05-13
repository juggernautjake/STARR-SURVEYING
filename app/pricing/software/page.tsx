// app/pricing/software/page.tsx
//
// SaaS bundle pricing page. Tile per bundle (Recon / Draft / Field /
// Office / Academy / Firm Suite) with monthly + annual price toggle
// and a "Start free trial" CTA wiring into /signup?bundle=<id>.
//
// Phase D-10 of CUSTOMER_PORTAL.md. Lives at /pricing/software for
// now — the surveying-services pricing page at /pricing stays put
// until the marketing-site rework that moves it to /services/pricing.

import Link from 'next/link';
import {
  BUNDLES,
  BUNDLE_ORDER,
  annualPriceCents,
  formatBundlePrice,
} from '@/lib/saas/bundles';

export const metadata = {
  title: 'Software Pricing — Starr Software',
  description:
    '14-day free trial, no card required. Per-bundle pricing for Recon, Draft, Field, Office, Academy, and Firm Suite.',
};

export default function SoftwarePricingPage() {
  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '3rem 1.5rem 5rem',
    }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '2.6rem', margin: '0 0 0.75rem' }}>
          Software pricing
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.05rem', maxWidth: 640, margin: '0 auto' }}>
          Pick the bundles your firm needs. 14-day free trial — no card required.
          Annual billing saves 20%.
        </p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem',
      }}>
        {BUNDLE_ORDER.map((id) => {
          const b = BUNDLES[id];
          const annual = annualPriceCents(b.monthlyBaseCents);
          const annualPerMonth = Math.round(annual / 12);
          const isFirmSuite = id === 'firm_suite';
          return (
            <article key={id} style={{
              padding: '1.5rem',
              background: isFirmSuite
                ? 'linear-gradient(160deg, rgba(252,211,77,0.12), rgba(255,255,255,0.04))'
                : 'rgba(255,255,255,0.04)',
              border: isFirmSuite ? '1px solid rgba(252,211,77,0.35)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 360,
            }}>
              {isFirmSuite && (
                <div style={{
                  alignSelf: 'flex-start',
                  background: '#FCD34D',
                  color: '#0F1419',
                  padding: '0.15rem 0.55rem',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: '0.6rem',
                }}>
                  Most popular
                </div>
              )}
              <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.4rem', margin: '0 0 0.4rem' }}>
                {b.label}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                {b.tagline}
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1.8rem', fontFamily: 'Sora,sans-serif', fontWeight: 700 }}>
                    {formatBundlePrice(b.monthlyBaseCents)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    /mo {b.includedSeats !== null ? `· ${b.includedSeats} seats incl.` : 'per seat'}
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                  or {formatBundlePrice(annualPerMonth)}/mo billed annually ({formatBundlePrice(annual)}/yr)
                </div>
                {b.perSeatOverageCents !== null && b.includedSeats !== null && (
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    +{formatBundlePrice(b.perSeatOverageCents)}/mo per additional seat
                  </div>
                )}
              </div>

              {b.implies.length > 0 && (
                <ul style={{
                  margin: '0 0 1.25rem',
                  padding: 0,
                  listStyle: 'none',
                  fontSize: '0.82rem',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                }}>
                  {b.implies.map((impl) => (
                    <li key={impl}>
                      <span style={{ color: '#10B981', marginRight: '0.4rem', fontWeight: 700 }}>✓</span>
                      Includes {BUNDLES[impl].label}
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ marginTop: 'auto' }}>
                <Link
                  href={`/signup?plan=${id}`}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '0.65rem 1rem',
                    background: isFirmSuite ? '#FCD34D' : 'rgba(255,255,255,0.08)',
                    color: isFirmSuite ? '#0F1419' : '#FFF',
                    border: isFirmSuite ? 0 : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: '0.92rem',
                    textDecoration: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  Start free trial →
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <section style={{
        marginTop: '3rem',
        padding: '1.75rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        textAlign: 'center',
      }}>
        <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.3rem', margin: '0 0 0.5rem' }}>
          Need something else?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem' }}>
          Custom plans, on-premise install, or surveying-services pricing? Reach out.
        </p>
        <Link
          href="/contact"
          style={{
            display: 'inline-block',
            padding: '0.55rem 1.2rem',
            color: '#FFF',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 500,
            fontFamily: 'inherit',
          }}
        >
          Talk to us
        </Link>
      </section>
    </div>
  );
}
