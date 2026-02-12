'use client';

import Link from 'next/link';
import { useState, FormEvent, ChangeEvent } from 'react';
import { OFFICE_ADDRESS, OFFICE_ADDRESS_LINE1, OFFICE_ADDRESS_LINE2 } from '../components/ServiceAreaMap';
import { trackConversion } from '../utils/gtag';

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
  propertyAddress: string;
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
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    propertyAddress: '',
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setFormState((prev) => ({ ...prev, loading: true, error: '' }));

    if (!formData.name || !formData.email || !formData.phone || !formData.propertyAddress) {
      setFormState((prev) => ({
        ...prev,
        loading: false,
        error: 'Please fill in all required fields.',
      }));
      return;
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Track Google Ads conversion on successful form submission
        trackConversion();

        setFormState((prev) => ({ ...prev, submitted: true, loading: false }));
        setFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          propertyAddress: '',
          serviceType: '',
          projectDetails: '',
          preferredContact: 'email',
          howHeard: '',
        });
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
      propertyAddress: '',
      serviceType: '',
      projectDetails: '',
      preferredContact: 'email',
      howHeard: '',
    });
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
              <div className="contact-info__hours-row">
                <span className="contact-info__hours-day">Monday - Friday</span>
                <span className="contact-info__hours-time">8:00 AM - 5:00 PM</span>
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

                {/* Property Address - Required */}
                <div className="contact-form__group contact-form__group--full">
                  <label htmlFor="propertyAddress" className="contact-form__label contact-form__label--required">
                    Property Address / Location
                  </label>
                  <input
                    type="text"
                    id="propertyAddress"
                    name="propertyAddress"
                    value={formData.propertyAddress}
                    onChange={handleInputChange}
                    className="contact-form__input"
                    placeholder="Street address, city, or general area of property"
                    required
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
        </div>
      </section>
    </>
  );
}