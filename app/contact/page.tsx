import type { Metadata } from 'next';
import Link from 'next/link';
import ContactForm from '../components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact Starr Surveying | Free Consultation',
};

export default function ContactPage(): React.ReactElement {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Get in Touch</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Have questions? We're here to help. Reach out for a free consultation and quote.
          </p>
        </div>
      </section>

      {/* Main Contact Section */}
      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-2 gap-12 items-start">
            {/* Contact Info */}
            <div>
              <h2 className="mb-12">Contact Information</h2>
              
              <div className="space-y-8">
                {/* Phone */}
                <div className="card card-accent">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-red mb-3">Call</p>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-brand-gray mb-1">Hank Maddux</p>
                      <a href="tel:9366620077" className="text-2xl font-bold text-brand-dark hover:text-brand-red transition">
                        (936) 662-0077
                      </a>
                    </div>
                    <div>
                      <p className="text-sm text-brand-gray mb-1">Jacob Maddux</p>
                      <a href="tel:2543151123" className="text-2xl font-bold text-brand-dark hover:text-brand-red transition">
                        (254) 315-1123
                      </a>
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div className="card card-accent-blue">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue mb-3">Email</p>
                  <a href="mailto:info@starr-surveying.com" className="text-xl font-semibold text-brand-dark hover:text-brand-blue transition block mb-2">
                    info@starr-surveying.com
                  </a>
                  <p className="text-sm text-brand-gray">We respond within 24 business hours</p>
                </div>

                {/* Address */}
                <div className="card card-accent">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-red mb-3">Address</p>
                  <p className="text-lg font-semibold text-brand-dark mb-1">3779 W FM 436</p>
                  <p className="text-lg font-semibold text-brand-dark mb-4">Belton, TX 76513</p>
                  <p className="text-sm text-brand-gray">Central Texas</p>
                </div>

                {/* Hours */}
                <div className="card card-accent-blue">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue mb-4">Hours</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-dark">Monday - Friday</span>
                      <span className="text-brand-red font-semibold">8:00 AM - 5:00 PM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-dark">Saturday</span>
                      <span className="text-brand-red font-semibold">By Appointment</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-dark">Sunday</span>
                      <span className="text-brand-red font-semibold">Closed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <div className="bg-brand-light rounded-16 p-10 border-l-4 border-brand-red">
                <h3 className="text-2xl font-bold text-brand-dark mb-2">Send us a Message</h3>
                <p className="text-brand-gray mb-8">
                  Fill out the form and we'll contact you shortly with a free consultation and quote.
                </p>
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Area Info */}
      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <div className="card border-l-4 border-brand-blue text-center max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-brand-dark mb-4">Service Area</h3>
            <p className="text-brand-gray mb-6">
              We serve Bell County, Williamson County, Coryell County, Falls County, and surrounding Central Texas areas. Projects outside our primary service area? Contact us anyway.
            </p>
            <Link href="/service-area" className="btn btn-secondary">
              View Full Coverage Map
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section" style={{
        background: 'linear-gradient(135deg, #1D3095 0%, #BD1218 100%)',
        color: 'white'
      }}>
        <div className="container max-w-7xl mx-auto text-center">
          <h2 style={{ 
            background: 'none',
            WebkitBackgroundClip: 'unset',
            WebkitTextFillColor: 'unset',
            backgroundClip: 'unset',
            color: 'white'
          }} className="text-4xl mb-6">
            Need Immediate Assistance?
          </h2>
          <p className="text-lg text-gray-100 mb-10 max-w-2xl mx-auto">
            Call us directly for quick answers and to schedule your survey.
          </p>
          <a href="tel:9366620077" className="btn" style={{
            background: 'white',
            color: '#BD1218',
            fontSize: '1.1rem'
          }}>
            Call Now: (936) 662-0077
          </a>
        </div>
      </section>
    </>
  );
}