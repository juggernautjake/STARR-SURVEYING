import type { Metadata } from 'next';
import Link from 'next/link';
import ServiceCard from '../components/ServiceCard';
import type { Service } from '../../types';

export const metadata: Metadata = {
  title: 'Services | Starr Surveying',
};

export default function ServicesPage(): React.ReactElement {
  const services: Service[] = [
    { icon: '📍', title: 'GPS/GNSS Surveying', description: 'High-precision positioning for large areas and complex projects.' },
    { icon: '🗺️', title: 'GIS Services', description: 'Digital mapping and spatial analysis for planning and development.' },
    { icon: '🔧', title: 'Total Station Surveying', description: 'Advanced instruments for precise measurements and control points.' },
    { icon: '📋', title: 'Plats & Maps', description: 'Professional plat creation for property divisions and documentation.' },
    { icon: '📄', title: 'Legal Descriptions', description: 'Accurate descriptions for deeds and property records.' },
    { icon: '🏗️', title: 'Construction Staking', description: 'Precise staking and control for construction projects.' },
    { icon: '📐', title: 'Boundary Surveys', description: 'Complete surveys establishing and verifying property lines.' },
    { icon: '🏢', title: 'Topographic Surveys', description: 'Detailed terrain mapping showing features and elevations.' },
    { icon: '🔍', title: 'Deed Research', description: 'Property research and analysis for title work.' },
  ];

  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Our Services</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Comprehensive surveying solutions for residential, commercial, and development projects.
          </p>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="mb-6">What We Offer</h2>
            <p className="text-lg text-brand-gray">Professional surveying services for every project type and size.</p>
          </div>
          <div className="grid-3 mb-16">
            {services.map((service: Service, idx: number) => (
              <ServiceCard key={service.title} {...service} delay={idx * 0.05} />
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-16">Service Details</h2>
          <div className="space-y-12">
            <div className="card card-accent">
              <h3 className="text-2xl text-brand-red mb-4">GPS/GNSS Surveying</h3>
              <p className="text-brand-gray mb-6">
                State-of-the-art positioning technology for large areas, pipelines, utilities, and development projects.
              </p>
              <div className="grid-2 gap-8 mb-6">
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Large property surveys</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Utility mapping</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Subdivision mapping</li>
                </ul>
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Site analysis</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Development planning</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> High-accuracy positioning</li>
                </ul>
              </div>
              <p className="text-xs text-brand-gray font-semibold">Turnaround: 3-5 days | Accuracy: ±0.1-0.3 ft</p>
            </div>

            <div className="card card-accent-blue">
              <h3 className="text-2xl text-brand-blue mb-4">Total Station Surveying</h3>
              <p className="text-brand-gray mb-6">
                Advanced instruments for precise measurements, detailed documentation, and construction control.
              </p>
              <div className="grid-2 gap-8 mb-6">
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Construction staking</li>
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Building surveys</li>
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Boundary verification</li>
                </ul>
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Site control</li>
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Detailed measurements</li>
                  <li className="flex gap-2"><span className="text-brand-blue">✓</span> Documentation</li>
                </ul>
              </div>
              <p className="text-xs text-brand-gray font-semibold">Turnaround: 2-4 days | Accuracy: ±0.05 ft</p>
            </div>

            <div className="card card-accent">
              <h3 className="text-2xl text-brand-red mb-4">Plats, Deeds & Legal Documents</h3>
              <p className="text-brand-gray mb-6">
                Professional plats and legal descriptions meeting Texas requirements.
              </p>
              <div className="grid-2 gap-8 mb-6">
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Subdivision plats</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Legal descriptions</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Deed preparation</li>
                </ul>
                <ul className="space-y-2 text-sm text-brand-gray">
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Property splits</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> As-built surveys</li>
                  <li className="flex gap-2"><span className="text-brand-red">✓</span> Mortgage surveys</li>
                </ul>
              </div>
              <p className="text-xs text-brand-gray font-semibold">Turnaround: 3-7 days</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{
        background: 'linear-gradient(135deg, #BD1218 0%, #1D3095 100%)',
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
            Need a Service?
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Contact us for a free consultation and detailed quote on any service.
          </p>
          <Link href="/contact" className="btn" style={{
            background: 'white',
            color: '#BD1218'
          }}>
            Get Your Quote
          </Link>
        </div>
      </section>
    </>
  );
}