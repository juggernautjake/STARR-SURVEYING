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
        <div className="logo-container">
          <img 
            src="/logos/Fancy_Logo_red_darkblue_white_2.png" 
            alt="Starr Surveying Logo" 
            className="logo"
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
                  className={`navbar__link ${link.label === 'Pricing' ? 'navbar__link--pricing' : ''}`}
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

      {/* Scrolled Header — fixed bar, all screen sizes */}
      {isScrolled && (
        <nav className="scrolled-header">
          {/* Mini logo - clickable to home */}
          <Link href="/" aria-label="Go to home page">
            <img 
              src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" 
              alt="Starr Surveying Small Logo" 
              className="scrolled-logo"
            />
          </Link>
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
              {isOpen ? 'CLOSE' : 'MENU'}
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