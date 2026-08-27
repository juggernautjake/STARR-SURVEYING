'use client';

import Link from 'next/link';
import { useState, FormEvent, ChangeEvent } from 'react';
import PayInvoiceCTA from '../components/PayInvoiceCTA';
import { OFFICE_ADDRESS, OFFICE_ADDRESS_LINE1, OFFICE_ADDRESS_LINE2 } from '../components/ServiceAreaMap';
import { trackConversion } from '../utils/gtag';
import { openingHoursDisplay } from '@/lib/seo/business';
import { attributionFormFields, readAttribution } from '@/lib/leads/attribution';
import { honeypotValuesFrom } from '@/lib/leads/honeypot';
import HoneypotFields from '@/app/components/HoneypotFields';
import {
  QUOTE_ATTACHMENT_ACCEPT,
  QUOTE_ATTACHMENT_MAX_FILES,
  QUOTE_ATTACHMENT_MAX_TOTAL_BYTES,
  formatBytes,
  validateQuoteAttachments,
} from '@/lib/quote-attachments';

// Import Contact page styles
import '../styles/Contact.css';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  propertyStreet: string;
  propertyCity: string;
  propertyCounty: string;
  propertyNumber: string;
  serviceType: string;
  projectDetails: string;
  preferredContact: string;
  howHeard: string;
}

interface ContactInfo {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  link?: string;
  linkType?: 'tel' | 'email' | 'external';
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ContactPage(): React.ReactElement {
  // One source for the weekday hours — see the note beside the hours card below.
  const hours = openingHoursDisplay();

  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    propertyStreet: '',
    propertyCity: '',
    propertyCounty: '',
    propertyNumber: '',
    serviceType: '',
    projectDetails: '',
    preferredContact: 'email',
    howHeard: '',
  });

  const [formState, setFormState] = useState({
    loading: false,
    submitted: false,
    error: '',
  });

  const [attachments, setAttachments] = useState<File[]>([]);

  const serviceTypes = [
    'Boundary Survey',
    'Construction Staking',
    'ALTA/NSPS Survey',
    'Subdivision Plat',
    'Topographic Survey',
    'Legal Description',
    'Elevation Certificate',
    'As-Built Survey',
    'Other',
  ];

  const howHeardOptions = [
    'Google Search',
    'Referral',
    'Word of Mouth',
    'Social Media',
    'Title Company',
    'Real Estate Agent',
    'Other',
  ];

  const contactCards: ContactInfo[] = [
    {
      icon: '📞',
      label: 'Hank Maddux',
      value: '(936) 662-0077',
      link: 'tel:9366620077',
      linkType: 'tel',
    },
    {
      icon: '📞',
      label: 'Jacob Maddux',
      value: '(254) 315-1123',
      link: 'tel:2543151123',
      linkType: 'tel',
    },
    {
      icon: '✉️',
      label: 'Email',
      value: 'info@starr-surveying.com',
      subValue: 'We respond within 24 hours',
      link: 'mailto:info@starr-surveying.com',
      linkType: 'email',
    },
    {
      icon: '📍',
      label: 'Address',
      value: OFFICE_ADDRESS_LINE1,
      subValue: OFFICE_ADDRESS_LINE2,
    },
  ];

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAttachmentChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;
    const merged = [...attachments, ...incoming];
    const err = validateQuoteAttachments(merged);
    if (err) {
      setFormState((prev) => ({ ...prev, error: err.message }));
      e.target.value = '';
      return;
    }
    setAttachments(merged);
    setFormState((prev) => ({ ...prev, error: '' }));
    e.target.value = '';
  };

  const handleAttachmentRemove = (index: number): void => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setFormState((prev) => ({ ...prev, loading: true, error: '' }));

    if (
      !formData.name ||
      !formData.email ||
      !formData.phone ||
      !formData.propertyStreet ||
      !formData.propertyCity ||
      // Property ID deliberately NOT required — it is the county parcel number, which a customer
      // has to leave the page to look up. See the note in app/api/contact/route.ts.
      !formData.propertyCounty
    ) {
      setFormState((prev) => ({
        ...prev,
        loading: false,
        error: 'Please fill in all required fields.',
      }));
      return;
    }

    try {
      // G1-2 — where this visitor came from, captured on the FIRST page they landed on (see
      // `AttributionCapture`). Read at submit time because by now they are usually on a clean URL.
      const attribution = { ...attributionFormFields(readAttribution()), ...honeypotValuesFrom(e.currentTarget) };
      let response: Response;
      if (attachments.length > 0) {
        const body = new FormData();
        for (const [key, value] of Object.entries(formData)) {
          body.append(key, value);
        }
        for (const [key, value] of Object.entries(attribution)) {
          body.append(key, value);
        }
        for (const file of attachments) {
          body.append('attachments', file, file.name);
        }
        response = await fetch('/api/contact', { method: 'POST', body });
      } else {
        response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, ...attribution }),
        });
      }

      if (response.ok) {
        // Track the Google Ads conversion, keyed by the server's reference number so a retry or a
        // back/forward-cache restore cannot count the same lead twice.
        const ref = await response.clone().json().then((j) => j?.reference).catch(() => undefined);
        trackConversion(ref, 'contact_page');

        setFormState((prev) => ({ ...prev, submitted: true, loading: false }));
        setFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          propertyStreet: '',
          propertyCity: '',
          propertyCounty: '',
          propertyNumber: '',
          serviceType: '',
          projectDetails: '',
          preferredContact: 'email',
          howHeard: '',
        });
        setAttachments([]);
      } else {
        setFormState((prev) => ({
          ...prev,
          loading: false,
          error: 'Failed to submit. Please try again or call us directly.',
        }));
      }
    } catch {
      setFormState((prev) => ({
        ...prev,
        loading: false,
        error: 'An error occurred. Please try again or call us directly.',
      }));
    }
  };

  const handleReset = (): void => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      propertyStreet: '',
      propertyCity: '',
      propertyCounty: '',
      propertyNumber: '',
      serviceType: '',
      projectDetails: '',
      preferredContact: 'email',
      howHeard: '',
    });
    setAttachments([]);
    setFormState({ loading: false, submitted: false, error: '' });
  };

  return (
    <>
      {/* Hero Section */}
      <section className="contact-hero">
        <div className="contact-hero__container">
          <div className="contact-hero__card">
            <h1 className="contact-hero__title">
              <span className="contact-hero__title-accent">Contact Us</span>
            </h1>
            <p className="contact-hero__subtitle">
              Have questions? We&apos;re here to help. Reach out for a free consultation and quote on your surveying project.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Info Section */}
      <section className="contact-info">
        <div className="contact-info__container">
          <div className="contact-info__grid">
            {contactCards.map((card, index) => (
              <div 
                key={card.label} 
                className={`contact-info__card ${index % 2 === 0 ? 'contact-info__card--red' : 'contact-info__card--blue'}`}
              >
                <span className="contact-info__card-icon">{card.icon}</span>
                <div className="contact-info__card-content">
                  <p className="contact-info__card-label">{card.label}</p>
                  {card.link ? (
                    <a href={card.link} className="contact-info__card-value">
                      {card.value}
                    </a>
                  ) : (
                    <p className="contact-info__card-value">{card.value}</p>
                  )}
                  {card.subValue && (
                    <p className="contact-info__card-sub">{card.subValue}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Hours Card */}
          <div className="contact-info__hours">
            <h3 className="contact-info__hours-title">🕐 Business Hours</h3>
            <div className="contact-info__hours-grid">
              {/* Rendered from lib/seo/business.ts, not written here. This line said "8:00 AM" while
                  the Google Business Profile said 9:00, and 9:00 was the true one — so the site spent
                  years telling people to call an office an hour before anyone arrived. Reading the
                  constant means the hours a customer sees and the hours the JSON-LD publishes are the
                  same fact, changed in one place. */}
              <div className="contact-info__hours-row">
                <span className="contact-info__hours-day">{hours.days}</span>
                <span className="contact-info__hours-time">{hours.time}</span>
              </div>
              <div className="contact-info__hours-row">
                <span className="contact-info__hours-day">Saturday</span>
                <span className="contact-info__hours-time">By Appointment</span>
              </div>
              <div className="contact-info__hours-row">
                <span className="contact-info__hours-day">Sunday</span>
                <span className="contact-info__hours-time">Closed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="contact-form-section">
        <div className="contact-form-section__container">
          <div className="contact-form-section__header">
            <h2 className="contact-form-section__title">Request a Free Quote</h2>
            <p className="contact-form-section__subtitle">
              Fill out the form below and we&apos;ll get back to you within 24 business hours with a detailed quote.
            </p>
          </div>

          {formState.submitted ? (
            <div className="contact-form-section__success">
              <div className="contact-form-section__success-icon">✓</div>
              <h3 className="contact-form-section__success-title">Thank You!</h3>
              <p className="contact-form-section__success-text">
                Your request has been received. We will contact you within 24 business hours.
              </p>
              <button 
                onClick={() => setFormState({ loading: false, submitted: false, error: '' })}
                className="contact-form-section__success-btn"
              >
                Submit Another Request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="contact-form">
              {/* A1-3 — invisible bot trap. Read at submit by honeypotValuesFrom(). */}
              <HoneypotFields />
              {formState.error && (
                <div className="contact-form__error">{formState.error}</div>
              )}

              <div className="contact-form__grid">
                {/* Name - Required */}
                <div className="contact-form__group">
                  <label htmlFor="name" className="contact-form__label contact-form__label--required">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="Your full name"
                    required
                  />
                </div>

                {/* Email - Required */}
                <div className="contact-form__group">
                  <label htmlFor="email" className="contact-form__label contact-form__label--required">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                {/* Phone - Required */}
                <div className="contact-form__group">
                  <label htmlFor="phone" className="contact-form__label contact-form__label--required">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="(123) 456-7890"
                    required
                  />
                </div>

                {/* Company - Optional */}
                <div className="contact-form__group">
                  <label htmlFor="company" className="contact-form__label">
                    Company Name
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="Your company (optional)"
                  />
                </div>

                {/* Property Street - Required */}
                <div className="contact-form__group contact-form__group--full">
                  <label htmlFor="propertyStreet" className="contact-form__label contact-form__label--required">
                    Property Street Address
                  </label>
                  <input
                    type="text"
                    id="propertyStreet"
                    name="propertyStreet"
                    value={formData.propertyStreet}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="123 Main St"
                    required
                  />
                </div>

                {/* Property City - Required */}
                <div className="contact-form__group">
                  <label htmlFor="propertyCity" className="contact-form__label contact-form__label--required">
                    City
                  </label>
                  <input
                    type="text"
                    id="propertyCity"
                    name="propertyCity"
                    value={formData.propertyCity}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="Belton"
                    required
                  />
                </div>

                {/* Property County - Required */}
                <div className="contact-form__group">
                  <label htmlFor="propertyCounty" className="contact-form__label contact-form__label--required">
                    County
                  </label>
                  <input
                    type="text"
                    id="propertyCounty"
                    name="propertyCounty"
                    value={formData.propertyCounty}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="Bell"
                    required
                  />
                </div>

                {/* Property ID — OPTIONAL. It is the county appraisal district's parcel number, which
                    most customers have to leave the page to look up. Asked for because it saves the
                    office a lookup when it is known, never demanded. */}
                <div className="contact-form__group">
                  <label htmlFor="propertyNumber" className="contact-form__label">
                    Property ID <span className="contact-form__optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="propertyNumber"
                    name="propertyNumber"
                    value={formData.propertyNumber}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="CAD account or parcel number — if you know it"
                  />
                </div>

                {/* Service Type - Optional */}
                <div className="contact-form__group">
                  <label htmlFor="serviceType" className="contact-form__label">
                    Service Needed
                  </label>
                  <select
                    id="serviceType"
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleInputChange}
                    className="contact-form__select"
                  >
                    <option value="">-- Select a service --</option>
                    {serviceTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preferred Contact - Optional */}
                <div className="contact-form__group">
                  <label htmlFor="preferredContact" className="contact-form__label">
                    Preferred Contact Method
                  </label>
                  <select
                    id="preferredContact"
                    name="preferredContact"
                    value={formData.preferredContact}
                    onChange={handleInputChange}
                    className="contact-form__select"
                  >
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="both">Either</option>
                  </select>
                </div>

                {/* How Heard - Optional */}
                <div className="contact-form__group contact-form__group--full">
                  <label htmlFor="howHeard" className="contact-form__label">
                    How Did You Hear About Us?
                  </label>
                  <select
                    id="howHeard"
                    name="howHeard"
                    value={formData.howHeard}
                    onChange={handleInputChange}
                    className="contact-form__select"
                  >
                    <option value="">-- Select an option --</option>
                    {howHeardOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project Details - Optional */}
                <div className="contact-form__group contact-form__group--full">
                  <label htmlFor="projectDetails" className="contact-form__label">
                    Project Details
                  </label>
                  <textarea
                    id="projectDetails"
                    name="projectDetails"
                    value={formData.projectDetails}
                    onChange={handleInputChange}
                    className="contact-form__textarea"
                    placeholder="Tell us about your project, timeline, or any specific requirements..."
                  ></textarea>
                </div>

                {/* Attachments - Optional */}
                <div className="contact-form__group contact-form__group--full">
                  <label htmlFor="contact-attachments" className="contact-form__label">
                    Attach Files (Optional)
                  </label>
                  <div className="contact-form__attachments">
                    <label htmlFor="contact-attachments" className="contact-form__attachments-btn">
                      <span aria-hidden="true">📎</span> Choose files…
                      <input
                        type="file"
                        id="contact-attachments"
                        name="attachments"
                        multiple
                        accept={QUOTE_ATTACHMENT_ACCEPT}
                        onChange={handleAttachmentChange}
                        className="contact-form__attachments-input"
                      />
                    </label>
                    <span className="contact-form__attachments-hint">
                      Photos, PDFs, docs, or CAD files. Up to {QUOTE_ATTACHMENT_MAX_FILES} files,{' '}
                      {formatBytes(QUOTE_ATTACHMENT_MAX_TOTAL_BYTES)} total.
                    </span>
                    {attachments.length > 0 && (
                      <ul className="contact-form__attachments-list">
                        {attachments.map((file, idx) => (
                          <li key={`${file.name}-${idx}`} className="contact-form__attachments-item">
                            <span className="contact-form__attachments-name">{file.name}</span>
                            <span className="contact-form__attachments-size">{formatBytes(file.size)}</span>
                            <button
                              type="button"
                              onClick={() => handleAttachmentRemove(idx)}
                              className="contact-form__attachments-remove"
                              aria-label={`Remove ${file.name}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="contact-form__actions">
                <button
                  type="submit"
                  className="contact-form__submit"
                  disabled={formState.loading}
                >
                  {formState.loading ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="contact-form__reset"
                >
                  Clear Form
                </button>
              </div>

              <p className="contact-form__note">
                * Required fields. We respect your privacy and will never share your information.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Service Area Section */}
      <section className="contact-area">
        <div className="contact-area__container">
          <div className="contact-area__card">
            <div className="contact-area__icon">🗺️</div>
            <div className="contact-area__content">
              <h3 className="contact-area__title">Our Service Area</h3>
              <p className="contact-area__text">
                We serve Bell County, Williamson County, Coryell County, Falls County, McLennan County, 
                Travis County, and surrounding Central Texas areas within a 150-mile radius of Belton.
              </p>
              <p className="contact-area__note">
                Projects outside our primary service area? Contact us anyway — we&apos;re happy to discuss!
              </p>
              <Link href="/service-area" className="contact-area__btn">
                View Full Coverage Map →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="contact-cta">
        <div className="contact-cta__container">
          <h2 className="contact-cta__title">Need Immediate Assistance?</h2>
          <p className="contact-cta__subtitle">
            Call us directly for quick answers and to schedule your survey.
          </p>
          <div className="contact-cta__buttons">
            <a href="tel:9366620077" className="contact-cta__btn contact-cta__btn--primary">
              📞 Call (936) 662-0077
            </a>
            <a href="mailto:info@starr-surveying.com" className="contact-cta__btn contact-cta__btn--secondary">
              ✉️ Send Email
            </a>
          </div>
          {/* payment-portal-discoverability-2026-06-22 — surface the
              customer payment portal at the bottom of the contact
              page, since "I need to pay my invoice" is a common
              reason someone hits Contact. */}
          <div style={{ marginTop: '2rem' }}>
            <PayInvoiceCTA variant="ribbon" />
          </div>
        </div>
      </section>
    </>
  );
}