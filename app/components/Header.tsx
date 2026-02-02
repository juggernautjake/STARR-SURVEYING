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
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);
  const headerRef = useRef<HTMLElement | null>(null);

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
      const scrolled = window.scrollY > 50;
      setIsScrolled(scrolled);
      setShowBackToTop(scrolled);

      if (headerRef.current) {
        const headerBottom = headerRef.current.getBoundingClientRect().bottom;
        setShowBackToTop(headerBottom < 0);
      }
    };

    window.addEventListener('scroll', handleScroll);
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

        {/* Navbar - Connected to bottom-right of header box */}
        <nav className="navbar">
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
                aria-expanded={isOpen}
              >
                {isOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {/* Mobile Dropdown */}
          {isOpen && (
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

      {/* Scrolled Header for Desktop */}
      {isScrolled && (
        <nav className="scrolled-header">
          <Link href="/pricing" className="scrolled-quote-btn">
            Get Free Quote
          </Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="scrolled-hamburger"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            ☰
          </button>
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

      {/* Back to Top Button - Only on desktop */}
      {showBackToTop && (
        <button onClick={scrollToTop} className="back-to-top" aria-label="Back to top">
          <span className="back-to-top__arrow">↑</span>
          <span className="back-to-top__text">Top</span>
        </button>
      )}
    </>
  );
};

export default Header;