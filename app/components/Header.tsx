'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { NavLink } from '../../types';

const Header = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const navLinks: NavLink[] = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About Us' },
    { href: '/services', label: 'Services' },
    { href: '/regulations', label: 'Resources' },
    { href: '/service-area', label: 'Service Area' },
    { href: '/credentials', label: 'Credentials' },
    { href: '/contact', label: 'Contact' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="container max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <Link href="/" className="flex items-center gap-2">
            <img 
              src="/logos/logo-v3.png" 
              alt="Starr Surveying Logo" 
              className="h-16 w-auto"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link: NavLink) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-starr-red hover:bg-gray-50 rounded transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Link 
            href="/contact"
            className="hidden md:inline-block btn btn-primary text-sm"
          >
            Get Quote
          </Link>

          <button
            className="md:hidden text-starr-red text-2xl"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>

        {isOpen && (
          <nav className="md:hidden bg-gray-50 py-4 border-t border-gray-200">
            {navLinks.map((link: NavLink) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-2 text-sm font-medium text-gray-700 hover:text-starr-red hover:bg-gray-100"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link 
              href="/contact"
              className="block m-4 text-center btn btn-primary text-sm"
              onClick={() => setIsOpen(false)}
            >
              Get Quote
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;