'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import CountiesDropdown from '../components/CountiesDropdown';
import { getDirectionsUrl, OFFICE_ADDRESS } from '../components/ServiceAreaMap';

// Import Service Area page styles
import '../styles/ServiceArea.css';

// Dynamically import the map component (client-side only)
const ServiceAreaMap = dynamic(() => import('../components/ServiceAreaMap'), {
  ssr: false,
  loading: () => (
    <div className="placeholder-map placeholder-map--loading">
      <div className="placeholder-map__spinner"></div>
      <p>Loading map...</p>
    </div>
  ),
});

interface CoverageCard {
  icon: string;
  title: string;
  description: string;
}

export default function ServiceAreaPage(): React.ReactElement {
  // Counties within ~175 mile radius of Belton (ALPHABETICALLY SORTED)
  const counties: string[] = [
    'Austin County',
    'Bastrop County',
    'Bell County',
    'Bexar County',
    'Bosque County',
    'Brazoria County',
    'Brazos County',
    'Brown County',
    'Burnet County',
    'Caldwell County',
    'Chambers County',
    'Collin County',
    'Comanche County',
    'Comal County',
    'Coryell County',
    'Dallas County',
    'Denton County',
    'Ellis County',
    'Erath County',
    'Falls County',
    'Fayette County',
    'Fort Bend County',
    'Freestone County',
    'Galveston County',
    'Grimes County',
    'Guadalupe County',
    'Hamilton County',
    'Harris County',
    'Hays County',
    'Hill County',
    'Johnson County',
    'Lampasas County',
    'Lee County',
    'Leon County',
    'Liberty County',
    'Limestone County',
    'Madison County',
    'McLennan County',
    'Milam County',
    'Mills County',
    'Montgomery County',
    'Navarro County',
    'Polk County',
    'Robertson County',
    'San Jacinto County',
    'San Saba County',
    'Tarrant County',
    'Travis County',
    'Trinity County',
    'Walker County',
    'Waller County',
    'Williamson County',
  ];

  const coverageCards: CoverageCard[] = [
    { icon: '🏠', title: 'Residential', description: 'Home buyers, property owners, fence lines' },
    { icon: '🏢', title: 'Commercial', description: 'Business properties, developments, retail' },
    { icon: '🌾', title: 'Agricultural', description: 'Farms, ranches, rural land' },
    { icon: '🏗️', title: 'Construction', description: 'New builds, subdivisions, site prep' },
    { icon: '⚖️', title: 'Legal', description: 'Boundary disputes, easements, title issues' },
    { icon: '🗺️', title: 'Municipal', description: 'Government projects, infrastructure' },
  ];

  const handleGetDirections = (): void => {
    window.open(getDirectionsUrl(), '_blank');
  };

  return (
    <>
      {/* Hero Section */}
      <section className="service-area-hero">
        <div className="service-area-hero__container">
          <div className="service-area-hero__card">
            <h1 className="service-area-hero__title">
              <span className="service-area-hero__title-accent">Service Area</span>
            </h1>
            <p className="service-area-hero__subtitle">
              Professional land surveying throughout Central Texas and beyond. We proudly serve clients within a 175-mile radius of our headquarters.
            </p>
          </div>
        </div>
      </section>

      {/* Map Section with HQ Info Above */}
      <section className="service-area-map">
        <div className="service-area-map__container">
          {/* HQ Info - Centered Above Map */}
          <div className="service-area-map__hq">
            <h2 className="service-area-map__hq-title">Starr Surveying Headquarters</h2>
            <p className="service-area-map__hq-location">Belton, Texas</p>
            <address className="service-area-map__hq-address">{OFFICE_ADDRESS}</address>
            <div className="service-area-map__hq-radius">
              <span className="service-area-map__hq-radius-number">175</span>
              <span className="service-area-map__hq-radius-unit">mile service radius</span>
            </div>
          </div>
          
          {/* Map */}
          <div className="service-area-map__wrapper">
            <ServiceAreaMap />
          </div>

          {/* Get Directions Button - Below Map */}
          <div className="service-area-map__directions">
            <button 
              onClick={handleGetDirections}
              className="service-area-map__directions-btn"
              aria-label="Get driving directions to Starr Surveying Home Office"
            >
              🚗 Get Directions to Our Home Office
            </button>
            <address className="service-area-map__directions-address">
              {OFFICE_ADDRESS}
            </address>
          </div>
        </div>
      </section>

      {/* Counties Section */}
      <section className="service-area-counties">
        <div className="service-area-counties__container">
          {/* Counties Dropdown Component */}
          <CountiesDropdown counties={counties} />

          {/* Travel Notice */}
          <div className="service-area-counties__travel">
            <span className="service-area-counties__travel-icon">🚗</span>
            <div className="service-area-counties__travel-content">
              <strong>Willing to Travel</strong>
              <p>For larger projects, we&apos;re happy to discuss serving areas outside our primary coverage. Travel fees may apply for distant locations.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Coverage Types Section */}
      <section className="service-area-coverage">
        <div className="service-area-coverage__container">
          <h2 className="service-area-coverage__title">What We Survey</h2>
          <div className="service-area-coverage__grid">
            {coverageCards.map((card: CoverageCard, index: number) => (
              <div 
                key={card.title} 
                className={`service-area-coverage__card ${index % 2 === 0 ? 'service-area-coverage__card--red' : 'service-area-coverage__card--blue'}`}
              >
                <span className="service-area-coverage__card-icon">{card.icon}</span>
                <div className="service-area-coverage__card-content">
                  <h4 className="service-area-coverage__card-title">{card.title}</h4>
                  <p className="service-area-coverage__card-desc">{card.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="service-area-cta">
        <div className="service-area-cta__container">
          <h2 className="service-area-cta__title">In Our Service Area?</h2>
          <p className="service-area-cta__subtitle">
            Contact us today for a free consultation and quote on your surveying project.
          </p>
          <div className="service-area-cta__buttons">
            <Link href="/contact" className="service-area-cta__btn service-area-cta__btn--primary">
              Get in Touch
            </Link>
            <a href="tel:9366620077" className="service-area-cta__btn service-area-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}