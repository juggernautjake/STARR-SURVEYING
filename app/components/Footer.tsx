'use client';

import Link from 'next/link';

// Footer CSS
import '../styles/Footer.css';

// TypeScript interfaces
interface FooterLink {
  href: string;
  label: string;
}

interface ContactInfo {
  icon: string;
  label: string;
  value: string;
  href?: string;
}

const Footer = (): React.ReactElement => {
  const currentYear = new Date().getFullYear();

  const quickLinks: FooterLink[] = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About Us' },
    { href: '/services', label: 'Services' },
    { href: '/pricing', label: 'Pricing' },
  ];

  const serviceLinks: FooterLink[] = [
    { href: '/service-area', label: 'Service Area' },
    { href: '/regulations', label: 'Resources' },
    { href: '/credentials', label: 'Credentials' },
    { href: '/contact', label: 'Contact' },
  ];

  const contactInfo: ContactInfo[] = [
    {
      icon: '📍',
      label: 'Address',
      value: '3779 W FM 436, Belton, TX 76513',
    },
    {
      icon: '📞',
      label: 'Phone',
      value: '(936) 662-0077',
      href: 'tel:9366620077',
    },
    {
      icon: '✉️',
      label: 'Email',
      value: 'info@starrsurveying.com',
      href: 'mailto:info@starrsurveying.com',
    },
  ];

  return (
    <footer className="footer">
      {/* Angled Top Edge */}
      <div className="footer__angle"></div>
      
      {/* Main Footer Content */}
      <div className="footer__main">
        <div className="footer__container">
          
          {/* Company Info Column */}
          <div className="footer__column footer__column--brand">
            <div className="footer__logo-wrapper">
              <img 
                src="/logos/starr_surveying_logo_aug_2024_alt.png" 
                alt="Starr Surveying Logo" 
                className="footer__logo"
              />
            </div>
            <p className="footer__tagline">
              Professional land surveying services serving Central Texas with precision and integrity.
            </p>
            <p className="footer__quote">
              "Remove not the ancient landmark, which thy fathers have set."
            </p>
            <p className="footer__quote-source">— Proverbs 22:28</p>
          </div>

          {/* Quick Links Column */}
          <div className="footer__column">
            <h3 className="footer__heading">Quick Links</h3>
            <ul className="footer__links">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="footer__link">
                    <span className="footer__link-arrow">›</span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services Column */}
          <div className="footer__column">
            <h3 className="footer__heading">More Info</h3>
            <ul className="footer__links">
              {serviceLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="footer__link">
                    <span className="footer__link-arrow">›</span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Column */}
          <div className="footer__column footer__column--contact">
            <h3 className="footer__heading">Contact Us</h3>
            <div className="footer__contact-list">
              {contactInfo.map((info, index) => (
                <div key={index} className="footer__contact-item">
                  <span className="footer__contact-icon">{info.icon}</span>
                  <div className="footer__contact-text">
                    <span className="footer__contact-label">{info.label}</span>
                    {info.href ? (
                      <a href={info.href} className="footer__contact-value footer__contact-value--link">
                        {info.value}
                      </a>
                    ) : (
                      <span className="footer__contact-value">{info.value}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* CTA Button */}
            <Link href="/contact" className="footer__cta">
              Get a Free Quote
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="footer__bottom">
        <div className="footer__bottom-container">
          <p className="footer__copyright">
            © {currentYear} Starr Surveying. All rights reserved.
          </p>
          <p className="footer__location">
            Professional Land Surveying • Belton, Texas
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;