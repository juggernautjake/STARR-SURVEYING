// app/pricing/page.tsx
'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

// Import Pricing page styles
import '../styles/Pricing.css';

// Dynamically import calculator to avoid SSR issues
const SurveyCalculator = dynamic(() => import('../components/SurveyCalculator'), {
  ssr: false,
  loading: () => (
    <section className="pricing-calculator">
      <div className="pricing-calculator__container">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
          Loading calculator...
        </div>
      </div>
    </section>
  ),
});

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function PricingPage() {
  const services = [
    { title: 'Boundary Survey', price: '$400 - $2,500+', turnaround: '3-7 business days', description: 'Establishes property lines and corners. Price varies by acreage and complexity.' },
    { title: 'ALTA/NSPS Land Title Survey', price: '$2,000 - $10,000+', turnaround: '5-14 business days', description: 'Comprehensive commercial survey meeting national standards. Required by most lenders.' },
    { title: 'Topographic Survey', price: '$600 - $5,000+', turnaround: '5-10 business days', description: 'Maps terrain contours, elevations, and features for site planning and construction.' },
    { title: 'Elevation Certificate (FEMA)', price: '$350 - $600', turnaround: '3-5 business days', description: 'Official documentation for flood insurance rating or LOMA applications.' },
    { title: 'Construction Staking', price: '$300 - $2,000+', turnaround: '1-3 business days', description: 'Precise layout stakes for buildings, roads, and utilities.' },
    { title: 'Subdivision Platting', price: '$2,500 - $15,000+', turnaround: '2-6 weeks', description: 'Divides land into multiple lots with roads and easements.' },
    { title: 'Mortgage/Loan Survey', price: '$350 - $800', turnaround: '3-5 business days', description: 'Required by lenders for property purchase. Shows boundaries and improvements.' },
    { title: 'As-Built Survey', price: '$400 - $1,500+', turnaround: '3-5 business days', description: 'Documents completed construction for compliance verification.' },
    { title: 'Route/Easement Survey', price: '$500 - $5,000+', turnaround: '5-10 business days', description: 'Surveys linear corridors for utilities, pipelines, or access easements.' },
    { title: 'Legal Description', price: '$250 - $800', turnaround: '2-5 business days', description: 'Creates or verifies written legal descriptions for deeds.' },
  ];

  const factors = [
    { icon: '📏', title: 'Property Size', description: 'Larger properties require more field time' },
    { icon: '📐', title: 'Property Shape', description: 'More corners = more complexity' },
    { icon: '🚗', title: 'Travel Distance', description: 'Distance from Belton affects cost' },
    { icon: '🌲', title: 'Vegetation', description: 'Dense woods increase field time' },
    { icon: '⛰️', title: 'Terrain', description: 'Steep slopes require extra care' },
    { icon: '💧', title: 'Water Features', description: 'Creeks and ponds add complexity' },
    { icon: '📑', title: 'Record Research', description: 'Poor records need more research' },
    { icon: '🔩', title: 'Corner Markers', description: 'Missing markers must be found' },
    { icon: '⏰', title: 'Timeline', description: 'Rush jobs may have additional fees' },
  ];

  const included = [
    { icon: '📋', title: 'Free Consultation', description: 'Discuss your project at no cost' },
    { icon: '📄', title: 'Written Quote', description: 'Detailed pricing before work begins' },
    { icon: '🔍', title: 'Record Research', description: 'Deed and plat research included' },
    { icon: '✅', title: 'Certified Results', description: 'RPLS-stamped documents' },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="pricing-hero">
        <div className="pricing-hero__container">
          <div className="pricing-hero__card">
            <h1 className="pricing-hero__title">
              <span className="pricing-hero__title-accent">Pricing</span>
            </h1>
            <p className="pricing-hero__subtitle">
              Competitive rates for professional surveying services in Central Texas. 
              Transparent pricing with no hidden fees.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Disclaimer Banner */}
      <section className="pricing-disclaimer">
        <div className="pricing-disclaimer__container">
          <div className="pricing-disclaimer__icon">⚠️</div>
          <div className="pricing-disclaimer__content">
            <h3 className="pricing-disclaimer__title">Important Pricing Information</h3>
            <p className="pricing-disclaimer__text">
              The prices shown are <strong>rough estimates only</strong>. Actual pricing 
              depends on property size, location, terrain, records, and project requirements. 
              <strong> Please contact us for an accurate, personalized quote.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Calculator Highlight Banner - NEW */}
      <section className="pricing-calculator-highlight">
        <div className="pricing-calculator-highlight__container">
          <div className="pricing-calculator-highlight__badge">FREE TOOL</div>
          <div className="pricing-calculator-highlight__content">
            <h2 className="pricing-calculator-highlight__title">
              🧮 Get Your Instant Estimate Below!
            </h2>
            <p className="pricing-calculator-highlight__text">
              Use our interactive calculator to get a rough estimate for your project in seconds — completely free, no signup required!
            </p>
          </div>
          <div className="pricing-calculator-highlight__arrow">↓</div>
        </div>
      </section>

      {/* Pricing Calculator */}
      <SurveyCalculator />

      {/* Pricing Grid Section */}
      <section className="pricing-grid">
        <div className="pricing-grid__container">
          <div className="pricing-grid__header">
            <h2 className="pricing-grid__title">Service Pricing Overview</h2>
            <p className="pricing-grid__subtitle">
              Typical price ranges for our services. Your quote will be based on your specific project.
            </p>
          </div>

          <div className="pricing-grid__items">
            {services.map((service) => (
              <div key={service.title} className="pricing-card">
                <div className="pricing-card__main">
                  <div className="pricing-card__header">
                    <h3 className="pricing-card__title">{service.title}</h3>
                  </div>
                  <p className="pricing-card__desc">{service.description}</p>
                  <p className="pricing-card__turnaround">Typical: {service.turnaround}</p>
                </div>
                <div className="pricing-card__price-box">
                  <p className="pricing-card__price">{service.price}</p>
                  <p className="pricing-card__price-label">estimate</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pricing-grid__note">
            <p>
              * All prices are estimates. Final pricing provided after consultation. 
              Rush jobs, travel, or unusual conditions may affect price.
            </p>
          </div>
        </div>
      </section>

      {/* Factors Affecting Price */}
      <section className="pricing-factors">
        <div className="pricing-factors__container">
          <h2 className="pricing-factors__title">What Affects Your Price?</h2>
          <div className="pricing-factors__grid">
            {factors.map((factor) => (
              <div key={factor.title} className="pricing-factors__item">
                <span className="pricing-factors__item-icon">{factor.icon}</span>
                <div className="pricing-factors__item-content">
                  <h4 className="pricing-factors__item-title">{factor.title}</h4>
                  <p className="pricing-factors__item-desc">{factor.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Volume Discount */}
      <section className="pricing-volume">
        <div className="pricing-volume__container">
          <div className="pricing-volume__card">
            <h2 className="pricing-volume__title">Volume &amp; Repeat Customer Discounts</h2>
            <p className="pricing-volume__desc">
              For larger projects, multiple properties, or ongoing work, we offer competitive 
              volume pricing. Title companies, real estate pros, and builders — contact us for partnership rates.
            </p>
            <Link href="/contact" className="pricing-volume__btn">
              Request Custom Quote
            </Link>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="pricing-included">
        <div className="pricing-included__container">
          <h2 className="pricing-included__title">What&apos;s Included</h2>
          <div className="pricing-included__grid">
            {included.map((item) => (
              <div key={item.title} className="pricing-included__item">
                <span className="pricing-included__item-icon">{item.icon}</span>
                <div className="pricing-included__item-content">
                  <h4 className="pricing-included__item-title">{item.title}</h4>
                  <p className="pricing-included__item-desc">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pricing-cta">
        <div className="pricing-cta__container">
          <h2 className="pricing-cta__title">Get Your Exact Quote</h2>
          <p className="pricing-cta__subtitle">
            Contact us directly for an accurate price. We&apos;ll discuss your project and provide a detailed quote.
          </p>
          <div className="pricing-cta__buttons">
            <Link href="/contact" className="pricing-cta__btn pricing-cta__btn--primary">
              Request Quote
            </Link>
            <a href="tel:9366620077" className="pricing-cta__btn pricing-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>

      {/* Bottom Disclaimer */}
      <section className="pricing-bottom-disclaimer">
        <div className="pricing-bottom-disclaimer__container">
          <p className="pricing-bottom-disclaimer__text">
            <strong>Disclaimer:</strong> All pricing is a general guide only and does not constitute a quote. 
            Actual costs may differ based on site conditions and requirements. Prices subject to change. 
            Final pricing provided in formal written quote after consultation.
          </p>
        </div>
      </section>
    </>
  );
}