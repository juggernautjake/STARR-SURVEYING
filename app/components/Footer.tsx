'use client';

import Link from 'next/link';

const Footer = (): React.ReactElement => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-starr-dark text-white mt-12">
      <div className="container max-w-7xl mx-auto px-4 py-12">
        <div className="grid-3 mb-8">
          <div>
            <h3 className="text-lg font-bold mb-4 text-starr-red">Starr Surveying</h3>
            <p className="text-gray-300 text-sm">
              Professional land surveying services serving Central Texas with precision and integrity.
            </p>
            <p className="text-gray-400 text-xs mt-4">
              "Remove not the ancient landmark, which thy fathers have set."
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/services" className="text-gray-300 hover:text-starr-red transition">Services</Link></li>
              <li><Link href="/about" className="text-gray-300 hover:text-starr-red transition">About Us</Link></li>
              <li><Link href="/contact" className="text-gray-300 hover:text-starr-red transition">Contact</Link></li>
              <li><Link href="/service-area" className="text-gray-300 hover:text-starr-red transition">Service Area</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-4">Contact Info</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-400">Address</p>
                <p className="text-gray-200">3779 W FM 436, Belton, TX 76513</p>
              </div>
              <div>
                <p className="text-gray-400">Phone</p>
                <p className="text-gray-200">
                  <a href="tel:9366620077" className="hover:text-starr-red transition">
                    (936) 662-0077
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
            <p>&copy; {currentYear} Starr Surveying. All rights reserved.</p>
            <p>Professional Land Surveying | Belton, Texas</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;