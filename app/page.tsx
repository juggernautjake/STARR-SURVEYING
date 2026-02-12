'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, FormEvent, ChangeEvent } from 'react';
import { getDirectionsUrl, OFFICE_ADDRESS } from './components/ServiceAreaMap';
import { trackConversion } from './utils/gtag';

// Import Home page styles
import './styles/Home.css';

// Dynamically import the map component (client-side only)
const ServiceAreaMap = dynamic(() => import('./components/ServiceAreaMap'), {
  ssr: false,
  loading: () => (
    <div className="home-area__map-loading">
      <div className="home-area__map-spinner"></div>
      <p>Loading map...</p>
    </div>
  ),
});

interface Service {
  icon: string;
  title: string;
  description: string;
}

interface WhyItem {
  icon: string;
  title: string;
  description: string;
}

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

export default function HomePage(): React.ReactElement {
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

  const services: Service[] = [
    {
      icon: '📍',
      title: 'Boundary Surveys',
      description: 'Establish and verify property lines with legal documentation for real estate transactions, fencing, and disputes.',
    },
    {
      icon: '🏗️',
      title: 'Construction Staking',
      description: 'Precise layout and control points for building foundations, roads, utilities, and site improvements.',
    },
    {
      icon: '📐',
      title: 'ALTA/NSPS Surveys',
      description: 'Comprehensive land title surveys meeting American Land Title Association standards for commercial transactions.',
    },
    {
      icon: '📋',
      title: 'Subdivision Platting',
      description: 'Create legal plats for dividing property into lots, including easements, setbacks, and dedications.',
    },
    {
      icon: '🗺️',
      title: 'Topographic Surveys',
      description: 'Detailed elevation mapping showing terrain, drainage, and existing features for design and planning.',
    },
    {
      icon: '📄',
      title: 'Legal Descriptions',
      description: 'Metes and bounds descriptions for deeds, easements, and legal documents with precision measurements.',
    },
  ];

  const whyItems: WhyItem[] = [
    {
      icon: '✓',
      title: 'RPLS Licensed',
      description: 'Registered Professional Land Surveyor meeting all Texas Board requirements.',
    },
    {
      icon: '✓',
      title: 'Modern Equipment',
      description: 'GPS/GNSS receivers, robotic total stations, and CAD software for accuracy.',
    },
    {
      icon: '✓',
      title: 'Local Knowledge',
      description: 'Familiar with Central Texas counties, records, and regulations.',
    },
    {
      icon: '✓',
      title: 'Integrity First',
      description: 'Honest pricing, clear communication, and quality workmanship.',
    },
  ];

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

  const handleGetDirections = (): void => {
    window.open(getDirectionsUrl(), '_blank');
  };

  return (
    <>
      {/* Hero Section - Gradient Background with COMBINED Card */}
      <section className="home-hero">
        <div className="home-hero__container">
          {/* Single Combined Card - Content + Stats */}
          <div className="home-hero__card">
            {/* Left: Main Content */}
            <div className="home-hero__content">
              <h1 className="home-hero__title">
                Professional Land Surveying for{' '}
                <span className="home-hero__title-accent">Central Texas</span>
              </h1>
              <p className="home-hero__subtitle">
                Precision surveying services backed by 15+ years of experience. 
                Serving Bell County, Williamson County, and surrounding areas with integrity and expertise.
              </p>
              <div className="home-hero__buttons">
                <Link href="/contact" className="home-hero__btn home-hero__btn--primary">
                  Get Free Consultation
                </Link>
                <Link href="/services" className="home-hero__btn home-hero__btn--secondary">
                  View Services
                </Link>
              </div>
            </div>
            
            {/* Right: Stats */}
            <div className="home-hero__stats">
              <div className="home-hero__stat">
                <div className="home-hero__stat-value">15+</div>
                <div className="home-hero__stat-label">Years Experience</div>
              </div>
              <div className="home-hero__stat">
                <div className="home-hero__stat-value">RPLS</div>
                <div className="home-hero__stat-label">Licensed & Certified</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FREE ESTIMATE BANNER - NEW SECTION */}
      <section className="home-estimate-banner">
        <div className="home-estimate-banner__container">
          <div className="home-estimate-banner__content">
            <div className="home-estimate-banner__icon">🧮</div>
            <div className="home-estimate-banner__text">
              <h3 className="home-estimate-banner__title">Get a Free Estimate Today!</h3>
              <p className="home-estimate-banner__subtitle">
                Use our online calculator to get an instant rough estimate for your surveying project — no obligation!
              </p>
            </div>
          </div>
          <Link href="/pricing" className="home-estimate-banner__btn">
            Try Our Free Calculator →
          </Link>
        </div>
      </section>

      {/* Services Section */}
      <section className="home-services">
        <div className="home-services__container">
          <div className="home-services__header">
            <h2 className="home-services__title">Our Services</h2>
            <p className="home-services__subtitle">
              Professional surveying solutions for residential, commercial, and land development projects throughout Central Texas.
            </p>
          </div>
          
          <div className="home-services__grid">
            {services.map((service: Service) => (
              <div key={service.title} className="home-services__card">
                <span className="home-services__card-icon">{service.icon}</span>
                <div className="home-services__card-content">
                  <h3 className="home-services__card-title">{service.title}</h3>
                  <p className="home-services__card-desc">{service.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="home-services__cta">
            <Link href="/services" className="home-services__link">
              View All Services →
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="home-why">
        <div className="home-why__container">
          <h2 className="home-why__title">Why Starr Surveying?</h2>
          <div className="home-why__grid">
            {whyItems.map((item: WhyItem) => (
              <div key={item.title} className="home-why__item">
                <span className="home-why__item-icon">{item.icon}</span>
                <h4 className="home-why__item-title">{item.title}</h4>
                <p className="home-why__item-desc">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Area Section - Single Map with 150-Mile Radius */}
      <section className="home-area">
        <div className="home-area__container">
          <h2 className="home-area__title">Service Area</h2>
          <p className="home-area__subtitle">
            We proudly serve clients within a 150-mile radius of our Belton headquarters.
          </p>
          <p className="home-area__address">
            📍 {OFFICE_ADDRESS}
          </p>
          
          {/* Single Map Container */}
          <div className="home-area__map-container">
            {/* HQ Info Badge */}
            <div className="home-area__hq-badge">
              <span className="home-area__hq-icon">📍</span>
              <div className="home-area__hq-info">
                <span className="home-area__hq-title">Belton, TX (HQ)</span>
                <span className="home-area__hq-radius">150-mile service radius</span>
              </div>
            </div>
            
            {/* Map */}
            <div className="home-area__map-wrapper">
              <ServiceAreaMap />
            </div>
          </div>

          {/* Get Directions Button - Below Map */}
          <div className="home-area__directions">
            <button 
              onClick={handleGetDirections}
              className="home-area__directions-btn"
              aria-label="Get driving directions to Starr Surveying Home Office"
            >
              🚗 Get Directions to Our Home Office
            </button>
          </div>
          
          {/* Not Sure CTA */}
          <div className="home-area__cta">
            <h3 className="home-area__cta-title">Not sure if we service your location?</h3>
            <p className="home-area__cta-text">
              Contact us today! We serve Bell, Williamson, Coryell, Falls, McLennan, Travis, Madison, Walker, Montgomery counties and beyond.
            </p>
            <div className="home-area__cta-buttons">
              <Link href="/service-area" className="home-area__cta-btn home-area__cta-btn--primary">
                View Full Coverage
              </Link>
              <a href="tel:9366620077" className="home-area__cta-btn home-area__cta-btn--secondary">
                Call (936) 662-0077
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="home-contact">
        <div className="home-contact__container">
          <div className="home-contact__header">
            <h2 className="home-contact__title">Request a Quote</h2>
            <p className="home-contact__subtitle">
              Fill out the form below and we will get back to you within 24 business hours.
            </p>
          </div>

          {formState.submitted ? (
            <div className="home-contact__success">
              <h3 className="home-contact__success-title">Thank You!</h3>
              <p className="home-contact__success-text">
                Your request has been received. We will contact you within 24 business hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="home-contact__form">
              {formState.error && (
                <div className="home-contact__error">{formState.error}</div>
              )}

              <div className="home-contact__form-grid">
                {/* Name - Required */}
                <div className="home-contact__form-group">
                  <label htmlFor="name" className="home-contact__label home-contact__label--required">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="home-contact__input"
                    placeholder="Your full name"
                    required
                  />
                </div>

                {/* Email - Required */}
                <div className="home-contact__form-group">
                  <label htmlFor="email" className="home-contact__label home-contact__label--required">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="home-contact__input"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                {/* Phone - Required */}
                <div className="home-contact__form-group">
                  <label htmlFor="phone" className="home-contact__label home-contact__label--required">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="home-contact__input"
                    placeholder="(123) 456-7890"
                    required
                  />
                </div>

                {/* Company - Optional */}
                <div className="home-contact__form-group">
                  <label htmlFor="company" className="home-contact__label">
                    Company Name (Optional)
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    className="home-contact__input"
                    placeholder="Your company or organization"
                  />
                </div>

                {/* Property Address - Required */}
                <div className="home-contact__form-group home-contact__form-group--full">
                  <label htmlFor="propertyAddress" className="home-contact__label home-contact__label--required">
                    Property Address / Location
                  </label>
                  <input
                    type="text"
                    id="propertyAddress"
                    name="propertyAddress"
                    value={formData.propertyAddress}
                    onChange={handleInputChange}
                    className="home-contact__input"
                    placeholder="Street address, city, or general area of property"
                    required
                  />
                </div>

                {/* Service Type - Optional */}
                <div className="home-contact__form-group">
                  <label htmlFor="serviceType" className="home-contact__label">
                    Service Needed (Optional)
                  </label>
                  <select
                    id="serviceType"
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleInputChange}
                    className="home-contact__select"
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
                <div className="home-contact__form-group">
                  <label htmlFor="preferredContact" className="home-contact__label">
                    Preferred Contact Method
                  </label>
                  <select
                    id="preferredContact"
                    name="preferredContact"
                    value={formData.preferredContact}
                    onChange={handleInputChange}
                    className="home-contact__select"
                  >
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="both">Either</option>
                  </select>
                </div>

                {/* How Heard - Optional */}
                <div className="home-contact__form-group">
                  <label htmlFor="howHeard" className="home-contact__label">
                    How Did You Hear About Us?
                  </label>
                  <select
                    id="howHeard"
                    name="howHeard"
                    value={formData.howHeard}
                    onChange={handleInputChange}
                    className="home-contact__select"
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
                <div className="home-contact__form-group home-contact__form-group--full">
                  <label htmlFor="projectDetails" className="home-contact__label">
                    Project Details (Optional)
                  </label>
                  <textarea
                    id="projectDetails"
                    name="projectDetails"
                    value={formData.projectDetails}
                    onChange={handleInputChange}
                    className="home-contact__textarea"
                    placeholder="Tell us about your project, timeline, or any specific requirements..."
                  ></textarea>
                </div>
              </div>

              <div className="home-contact__form-actions">
                <button
                  type="submit"
                  className="home-contact__submit"
                  disabled={formState.loading}
                >
                  {formState.loading ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="home-contact__reset"
                >
                  Clear Form
                </button>
              </div>

              <p className="home-contact__note">
                * Required fields. We respect your privacy and will never share your information.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section className="home-cta">
        <div className="home-cta__container">
          <h2 className="home-cta__title">Ready to Get Started?</h2>
          <p className="home-cta__subtitle">
            Contact us today for a free consultation and detailed quote on your surveying project.
          </p>
          <div className="home-cta__buttons">
            <Link href="/pricing" className="home-cta__btn home-cta__btn--primary">
              Get Free Estimate
            </Link>
            <a href="tel:9366620077" className="home-cta__btn home-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}