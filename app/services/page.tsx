import type { Metadata } from 'next';
import Link from 'next/link';

// Import Services page styles
import '../styles/Services.css';

export const metadata: Metadata = {
  title: 'Services | Starr Surveying',
  description: 'Professional land surveying services including GPS/GNSS surveying, boundary surveys, construction staking, plats, and legal descriptions in Central Texas.',
};

interface Service {
  icon: string;
  title: string;
  description: string;
}

interface ServiceDetail {
  title: string;
  description: string;
  features: string[];
  meta: string;
  variant: 'blue' | 'red';
}

interface ProcessStep {
  number: string;
  title: string;
  description: string;
}

export default function ServicesPage(): React.ReactElement {
  const services: Service[] = [
    { icon: '📍', title: 'GPS/GNSS Surveying', description: 'High-precision positioning for large areas and complex projects.' },
    { icon: '🗺️', title: 'GIS Services', description: 'Digital mapping and spatial analysis for planning and development.' },
    { icon: '🔧', title: 'Total Station', description: 'Advanced instruments for precise measurements and control points.' },
    { icon: '📋', title: 'Plats & Maps', description: 'Professional plat creation for property divisions and documentation.' },
    { icon: '📄', title: 'Legal Descriptions', description: 'Accurate descriptions for deeds and property records.' },
    { icon: '🏗️', title: 'Construction Staking', description: 'Precise staking and control for construction projects.' },
    { icon: '📐', title: 'Boundary Surveys', description: 'Complete surveys establishing and verifying property lines.' },
    { icon: '🏢', title: 'Topographic Surveys', description: 'Detailed terrain mapping showing features and elevations.' },
    { icon: '🔍', title: 'Deed Research', description: 'Property research and analysis for title work.' },
  ];

  const serviceDetails: ServiceDetail[] = [
    {
      title: 'GPS/GNSS Surveying',
      description: 'State-of-the-art positioning technology for large areas, pipelines, utilities, and development projects.',
      features: [
        'Large property surveys',
        'Utility mapping',
        'Subdivision mapping',
        'Site analysis',
        'Development planning',
        'High-accuracy positioning',
      ],
      meta: 'Turnaround: 3-5 days | Accuracy: ±0.1-0.3 ft',
      variant: 'red',
    },
    {
      title: 'Total Station Surveying',
      description: 'Advanced instruments for precise measurements, detailed documentation, and construction control.',
      features: [
        'Construction staking',
        'Building surveys',
        'Boundary verification',
        'Site control',
        'Detailed measurements',
        'Documentation',
      ],
      meta: 'Turnaround: 2-4 days | Accuracy: ±0.05 ft',
      variant: 'blue',
    },
    {
      title: 'Plats, Deeds & Legal Documents',
      description: 'Professional plats and legal descriptions meeting Texas requirements.',
      features: [
        'Subdivision plats',
        'Legal descriptions',
        'Deed preparation',
        'Property splits',
        'As-built surveys',
        'Mortgage surveys',
      ],
      meta: 'Turnaround: 3-7 days',
      variant: 'red',
    },
  ];

  const processSteps: ProcessStep[] = [
    {
      number: '01',
      title: 'Consultation',
      description: 'Discuss your project needs and requirements',
    },
    {
      number: '02',
      title: 'Research',
      description: 'Review records, deeds, and existing documentation',
    },
    {
      number: '03',
      title: 'Fieldwork',
      description: 'On-site measurements and data collection',
    },
    {
      number: '04',
      title: 'Delivery',
      description: 'Final documents, plats, and survey results',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="services-hero">
        <div className="services-hero__container">
          <div className="services-hero__card">
            <h1 className="services-hero__title">
              Our <span className="services-hero__title-accent">Services</span>
            </h1>
            <p className="services-hero__subtitle">
              Comprehensive surveying solutions for residential, commercial, and development projects throughout Central Texas.
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid Section */}
      <section className="services-grid">
        <div className="services-grid__container">
          <div className="services-grid__header">
            <h2 className="services-grid__title">What We Offer</h2>
            <p className="services-grid__subtitle">
              Professional surveying services for every project type and size.
            </p>
          </div>

          <div className="services-grid__items">
            {services.map((service: Service) => (
              <div key={service.title} className="services-grid__card">
                <span className="services-grid__card-icon">{service.icon}</span>
                <div className="services-grid__card-content">
                  <h3 className="services-grid__card-title">{service.title}</h3>
                  <p className="services-grid__card-desc">{service.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Details Section */}
      <section className="services-details">
        <div className="services-details__container">
          <h2 className="services-details__title">Service Details</h2>
          
          <div className="services-details__list">
            {serviceDetails.map((detail: ServiceDetail) => (
              <div 
                key={detail.title} 
                className={`services-detail ${detail.variant === 'red' ? 'services-detail--red' : ''}`}
              >
                <div className="services-detail__header">
                  <h3 className="services-detail__title">{detail.title}</h3>
                </div>
                <p className="services-detail__desc">{detail.description}</p>
                <div className="services-detail__features">
                  {detail.features.map((feature: string) => (
                    <div key={feature} className="services-detail__feature">
                      <span className="services-detail__feature-icon">✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <p className="services-detail__meta">{detail.meta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="services-process">
        <div className="services-process__container">
          <h2 className="services-process__title">Our Process</h2>
          
          <div className="services-process__grid">
            {processSteps.map((step: ProcessStep) => (
              <div key={step.number} className="services-process__step">
                <span className="services-process__step-number">{step.number}</span>
                <div className="services-process__step-content">
                  <h4 className="services-process__step-title">{step.title}</h4>
                  <p className="services-process__step-desc">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="services-cta">
        <div className="services-cta__container">
          <h2 className="services-cta__title">Need a Service?</h2>
          <p className="services-cta__subtitle">
            Contact us for a free consultation and detailed quote on any service.
          </p>
          <div className="services-cta__buttons">
            <Link href="/contact" className="services-cta__btn services-cta__btn--primary">
              Get Your Quote
            </Link>
            <a href="tel:9366620077" className="services-cta__btn services-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}