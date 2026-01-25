import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing | Starr Surveying',
};

export default function PricingPage(): React.ReactElement {
  const services = [
    { title: 'Boundary Survey', price: '$400-$1,200', turnaround: '2-4 days', desc: 'Establishes property lines with professional documentation.' },
    { title: 'Topographic Survey', price: '$600-$3,000', turnaround: '3-7 days', desc: 'Terrain mapping showing features and elevations.' },
    { title: 'GPS/GNSS Surveying', price: '$500-$2,000', turnaround: '3-5 days', desc: 'High-precision positioning for large areas.' },
    { title: 'Construction Staking', price: '$300-$1,000', turnaround: '1-2 days', desc: 'Precise control points for construction projects.' },
    { title: 'Legal Description', price: '$200-$500', turnaround: '2-3 days', desc: 'Professional deed and property documentation.' },
    { title: 'GIS Mapping', price: '$800-$5,000', turnaround: '5-10 days', desc: 'Digital mapping and spatial analysis.' },
  ];

  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Pricing</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Competitive rates for professional surveying services in Central Texas.
          </p>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-4">Service Pricing</h2>
          <p className="text-brand-gray mb-12 text-lg">
            Pricing varies based on property size, complexity, and location. Below are typical ranges for our services.
          </p>
          <div className="grid-2 gap-8">
            {services.map((service, idx) => (
              <div key={idx} className={`card ${idx % 2 === 0 ? 'card-accent' : 'card-accent-blue'}`}>
                <h4 className={idx % 2 === 0 ? 'text-brand-red' : 'text-brand-blue'} style={{ color: idx % 2 === 0 ? '#BD1218' : '#1D3095' }}>
                  {service.title}
                </h4>
                <div className="my-4 p-4 bg-white rounded-lg border-l-4" style={{ borderColor: idx % 2 === 0 ? '#BD1218' : '#1D3095' }}>
                  <p className="text-3xl font-bold text-brand-dark mb-1">{service.price}</p>
                  <p className="text-xs text-brand-gray font-semibold">per project</p>
                </div>
                <p className="text-sm text-brand-gray mb-3">{service.desc}</p>
                <p className="text-xs text-brand-gray font-semibold">Turnaround: {service.turnaround}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <div className="card card-accent max-w-2xl mx-auto text-center">
            <h3 className="text-2xl text-brand-red mb-4">Volume Discounts Available</h3>
            <p className="text-brand-gray mb-6">
              For larger projects or multiple properties, we offer competitive volume pricing.
            </p>
            <Link href="/contact" className="btn btn-primary">
              Request Custom Quote
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{
        background: 'linear-gradient(135deg, #BD1218 0%, #1D3095 100%)',
        color: 'white'
      }}>
        <div className="container max-w-7xl mx-auto text-center">
          <h2 style={{ background: 'none', WebkitBackgroundClip: 'unset', WebkitTextFillColor: 'unset', color: 'white' }} className="text-4xl mb-6">
            Get Your Exact Quote
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Contact us for a personalized quote based on your specific project needs.
          </p>
          <Link href="/contact" className="btn" style={{ background: 'white', color: '#BD1218' }}>
            Request Quote
          </Link>
        </div>
      </section>
    </>
  );
}