// app/AndrewAsh/_ui/VoiceFooter.tsx — the footer.
//
// Server component: it renders settings and nothing interactive, so there is no reason to ship it to
// the browser.
//
// The studio link at the bottom is deliberately quiet — a small text link rather than a button. It is
// Andrew's door, on a page whose audience is clients, and a prominent "Log in" on a freelancer's
// portfolio makes visitors wonder whether they were supposed to have an account.

import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { SiteSettings } from '@/lib/voice/settings';
import { BASE_PATH } from '@/lib/voice/content';

export default function VoiceFooter({ settings }: { settings: SiteSettings }): React.ReactElement {
  const year = new Date().getFullYear();

  return (
    <footer className="vaFooter">
      <div className="vaContainer">
        <div className="vaFooterGrid">
          <div>
            <p className="vaFooterHead">{settings.artistName}</p>
            <p className="vaCardBody" style={{ maxWidth: '32ch', marginBottom: 18 }}>
              {settings.tagline}. Recording remotely for clients anywhere; coaching online and in {settings.location}.
            </p>
            <ul className="vaFooterLinks" style={{ marginTop: 4 }}>
              {settings.email && (
                <li>
                  <a href={`mailto:${settings.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={14} aria-hidden="true" /> {settings.email}
                  </a>
                </li>
              )}
              {settings.phone && (
                <li>
                  <a href={`tel:${settings.phone.replace(/[^0-9+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={14} aria-hidden="true" /> {settings.phone}
                  </a>
                </li>
              )}
              <li style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--va-text-muted)', fontSize: '0.9375rem' }}>
                <MapPin size={14} aria-hidden="true" /> {settings.location}
              </li>
            </ul>
          </div>

          <div>
            <p className="vaFooterHead">Work</p>
            <ul className="vaFooterLinks">
              <li><Link href={`${BASE_PATH}/voice-over`}>Voice over</Link></li>
              <li><Link href={`${BASE_PATH}/voice-over#reels`}>Demo reels</Link></li>
              <li><Link href={`${BASE_PATH}/work`}>Projects</Link></li>
              <li><Link href={`${BASE_PATH}/about#credits`}>Credits</Link></li>
            </ul>
          </div>

          <div>
            <p className="vaFooterHead">Coaching</p>
            <ul className="vaFooterLinks">
              <li><Link href={`${BASE_PATH}/coaching`}>How it works</Link></li>
              <li><Link href={`${BASE_PATH}/coaching#packages`}>Rates &amp; packages</Link></li>
              <li><Link href={`${BASE_PATH}/coaching#faq`}>Questions</Link></li>
              <li><Link href={`${BASE_PATH}/contact?intent=coaching`}>Book a first lesson</Link></li>
            </ul>
          </div>

          <div>
            <p className="vaFooterHead">Get in touch</p>
            <ul className="vaFooterLinks">
              <li><Link href={`${BASE_PATH}/contact`}>Request a quote</Link></li>
              <li><Link href={`${BASE_PATH}/contact?intent=voiceover`}>Ask for a sample read</Link></li>
              <li><Link href={`${BASE_PATH}/about`}>About Andrew</Link></li>
            </ul>
            {settings.socialLinks.length > 0 && (
              <ul className="vaFooterLinks" style={{ marginTop: 16 }}>
                {settings.socialLinks.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="vaFooterBottom">
          <span>
            © {year} {settings.businessName}. All rights reserved.
          </span>
          <span style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href={`${BASE_PATH}/contact`}>Contact</Link>
            <Link href={`${BASE_PATH}/studio`}>Studio</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
