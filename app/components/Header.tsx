'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/business';

// Single CSS file for all screen sizes
import '../styles/Header.css';

// TypeScript interface for navigation links
interface NavLink {
  href: string;
  label: string;
}

const Header = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const navbarRef = useRef<HTMLDivElement | null>(null);

  const navLinks: NavLink[] = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/services', label: 'Services' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/service-area', label: 'Service Area' },
    { href: '/resources', label: 'Resources' },
    { href: '/credentials', label: 'Credentials' },
    { href: '/contact', label: 'Contact' },
    // payment-portal-discoverability-2026-06-22 — customer-facing
    // payment portal at /pay. Styled as a CTA-flavored link (green
    // accent below) so it reads as a high-intent action, not just
    // another regular page.
    { href: '/pay', label: 'Pay Invoice' },
  ];

  useEffect(() => {
    const handleScroll = (): void => {
      if (!navbarRef.current) return;

      const navbarBottom = navbarRef.current.getBoundingClientRect().bottom;
      const scrolled = navbarBottom < 0;

      setIsScrolled((prev) => {
        if (prev !== scrolled) {
          setIsOpen(false);
        }
        return scrolled;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = (): void => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Header Container */}
      <div className="header-wrapper">
        
        {/* Header Box - Red background with blue border */}
        <header ref={headerRef} className="header-box" />

        {/* Logo - Floats IN FRONT of the header box (NOT clickable) */}
        {/* ── `priority` AND `sizes`, ADDED 2026-08-25. MEASURED ON THE LIVE SITE, NOT GUESSED. ──
            The served markup for this image was:

              loading="lazy" ... srcSet="/_next/image?...&w=3840 1x"

            Two separate faults in one tag, on the first element of every page:

            1. LAZY-LOADED ABOVE THE FOLD. `next/image` lazy-loads by default, and this logo is almost
               certainly the Largest Contentful Paint element on a phone. Deferring the LCP image is the
               textbook LCP regression — the browser will not even request it until layout says it is
               near the viewport, on an element that is AT the top of the viewport. LCP is a Core Web
               Vitals metric and therefore a ranking input, and it is also simply what "the site feels
               slow" means to a visitor who just paid us a click to get here.

            2. ONE 3840px CANDIDATE. Without `sizes`, Next emits a srcSet of exactly one entry — the
               3840px rendition (25.7 KB measured) — and a 390px phone had no smaller option to choose.
               With `sizes` it emits the full ladder and the browser picks by viewport and pixel ratio.

            `sizes` IS `100vw`, AND THAT IS DELIBERATE. The tempting value is a narrow one like `600px`,
            because the logo is height-constrained rather than width-constrained. It would be wrong:
            `--logo-max-height` climbs from 118px on a phone to 480px on the widest breakpoint, and at
            the source ratio of 3014:618 a 480px-tall logo is 2342px WIDE. A `600px` hint would tell the
            browser to fetch a rendition four times too small and the wordmark would render soft on
            every large display. `100vw` tracks the real ladder closely enough at both ends.

            `priority` sets fetchpriority=high and removes the lazy attribute. */}
        <div className="logo-container">
          <Image
            src="/logos/Fancy_Logo_red_darkblue_white_2.png"
            alt="Starr Surveying Logo"
            className="logo"
            width={3014}
            height={618}
            priority
            sizes="100vw"
          />
        </div>

        {/* Primary Navbar — anchored below header box on mobile, bottom-right on desktop */}
        <nav ref={navbarRef} className="navbar">
          <div className="navbar__inner">
            {/* Desktop Navigation */}
            <div className="navbar__desktop">
              {navLinks.map((link: NavLink) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className={`navbar__link ${link.label === 'Pricing' ? 'navbar__link--pricing' : ''}${link.label === 'Pay Invoice' ? ' navbar__link--pay' : ''}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile Navigation — sits below header, scrolls with page */}
            <div className="navbar__mobile">
              <Link href="/pricing" className="navbar__quote-btn-mobile">
                Get Quote
              </Link>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="navbar__hamburger"
                aria-label="Toggle menu"
                aria-expanded={isOpen && !isScrolled}
              >
                {isOpen && !isScrolled ? 'CLOSE' : 'MENU'}
              </button>
            </div>
          </div>

          {/* Mobile Dropdown — ONLY when primary navbar is visible */}
          {isOpen && !isScrolled && (
            <div className="navbar__dropdown">
              {/* CALL FIRST, added 2026-08-25.
                  A visitor who opens this menu on a phone had no way to ring the office from it: every
                  `tel:` link on the site sits in a CTA block partway down a page, so calling meant
                  closing the menu and hunting for one. The number is the fastest route to a job for a
                  trade business, and this is the one control that is on every page at the top.
                  Tracked automatically — the delegated `tel:` listener in GoogleAdsScript reports it as
                  a Phone Click conversion, with no wiring here. */}
              <a href={`tel:${PHONE_E164}`} className="navbar__dropdown-link navbar__dropdown-link--call">
                📞 Call {PHONE_DISPLAY}
              </a>
              {navLinks.map((link: NavLink) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__dropdown-link ${link.label === 'Pricing' ? 'navbar__dropdown-link--pricing' : ''}${link.label === 'Pay Invoice' ? ' navbar__dropdown-link--pay' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>

      {/* Scrolled Header — fixed bar, all screen sizes */}
      {isScrolled && (
        <nav className="scrolled-header">
          {/* Mini logo - clickable to home */}
          <Link href="/" aria-label="Go to home page">
            <Image 
              src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" 
              alt="Starr Surveying Small Logo" 
              className="scrolled-logo"
              width={120}
              height={44}
            />
          </Link>
          <div className="scrolled-right">
            <Link href="/pay" className="scrolled-pay-btn">
              Pay Invoice
            </Link>
            <Link href="/pricing" className="scrolled-quote-btn">
              Get Free Quote
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="scrolled-hamburger"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              {isOpen ? 'CLOSE' : 'MENU'}
            </button>
          </div>
          {isOpen && (
            <div className="scrolled-dropdown">
              {/* Same reasoning as the primary dropdown above — and this is the menu that is reachable
                  from anywhere on a long page, which is where somebody decides to stop reading and ring. */}
              <a href={`tel:${PHONE_E164}`} className="scrolled-dropdown-link scrolled-dropdown-link--call">
                📞 Call {PHONE_DISPLAY}
              </a>
              {navLinks.map((link: NavLink) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`scrolled-dropdown-link ${link.label === 'Pricing' ? 'scrolled-dropdown-link--pricing' : ''}${link.label === 'Pay Invoice' ? ' scrolled-dropdown-link--pay' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      )}

      {/* Back to Top — desktop only (hidden on mobile via CSS) */}
      {isScrolled && (
        <button onClick={scrollToTop} className="back-to-top" aria-label="Back to top">
          <span className="back-to-top__arrow">↑</span>
          <span className="back-to-top__text">Top</span>
        </button>
      )}
    </>
  );
};

export default Header;