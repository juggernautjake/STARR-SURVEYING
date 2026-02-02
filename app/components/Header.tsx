'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

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
  ];

  useEffect(() => {
    const handleScroll = (): void => {
      if (!navbarRef.current) return;

      const navbarBottom = navbarRef.current.getBoundingClientRect().bottom;
      const scrolled = navbarBottom < 0;

      setIsScrolled((prev) => {
        // Close the dropdown whenever scroll state changes direction
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
      {/* Header Container - Contains everything */}
      <div className="header-wrapper">
        
        {/* Header Box - Red background with blue border (at top of page) */}
        <header ref={headerRef} className="header-box">
          {/* This is the red background area with blue border */}
        </header>

        {/* Logo - Floats IN FRONT of the header box */}
        <div className="logo-container">
          <img 
            src="/logos/Fancy_Logo_red_darkblue_white_2.png" 
            alt="Starr Surveying Logo" 
            className="logo"
          />
        </div>

        {/* Primary Navbar - Anchored to bottom-right of header box.
            On desktop: shows full link buttons.
            On mobile: shows hamburger + Get Quote, positioned below the header box.
            This element scrolls with the page. */}
        <nav ref={navbarRef} className="navbar">
          <div className="navbar__inner">
            {/* Desktop Navigation */}
            <div className="navbar__desktop">
              {navLinks.map((link: NavLink) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className={`navbar__link ${link.label === 'Pricing' ? 'navbar__link--pricing' : ''}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile Navigation */}
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
                {isOpen && !isScrolled ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {/* Mobile Dropdown - ONLY when the primary navbar is visible (not scrolled away) */}
          {isOpen && !isScrolled && (
            <div className="navbar__dropdown">
              {navLinks.map((link: NavLink) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__dropdown-link ${link.label === 'Pricing' ? 'navbar__dropdown-link--pricing' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>

      {/* Scrolled Header - Fixed bar that appears when the primary navbar scrolls out of view.
          Shows on ALL screen sizes (desktop + mobile).
          Contains: small logo, Get Free Quote, hamburger menu. */}
      {isScrolled && (
        <nav className="scrolled-header">
          <img 
            src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" 
            alt="Starr Surveying Small Logo" 
            className="scrolled-logo"
          />
          <div className="scrolled-right">
            <Link href="/pricing" className="scrolled-quote-btn">
              Get Free Quote
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="scrolled-hamburger"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              {isOpen ? '✕' : '☰'}
            </button>
          </div>
          {isOpen && (
            <div className="scrolled-dropdown">
              {navLinks.map((link: NavLink) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`scrolled-dropdown-link ${link.label === 'Pricing' ? 'scrolled-dropdown-link--pricing' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      )}

      {/* Back to Top Button - Only on desktop (hidden via CSS on mobile) */}
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