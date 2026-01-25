import Link from 'next/link';
import type { Metadata } from 'next';
import ServiceCard from './components/ServiceCard';
import type { Service } from '../types';

export const metadata: Metadata = {
  title: 'Starr Surveying - Professional Land Surveying in Belton, TX',
  description: 'Expert surveying services with 15+ years experience. GPS, GIS, and comprehensive solutions for Central Texas.',
};

export default function HomePage(): React.ReactElement {
  const services: Service[] = [
    {
      icon: '📍',
      title: 'GPS/GNSS Surveying',
      description: 'High-precision positioning for large areas, pipelines, and development projects.',
    },
    {
      icon: '🗺️',
      title: 'GIS Services',
      description: 'Digital mapping and spatial analysis for planning, development, and analysis.',
    },
    {
      icon: '🔧',
      title: 'Total Station Surveying',
      description: 'Advanced instruments for precise measurements and construction staking.',
    },
    {
      icon: '📋',
      title: 'Plats & Legal Docs',
      description: 'Professional plat creation and legal descriptions for all property types.',
    },
    {
      icon: '📐',
      title: 'Boundary Surveys',
      description: 'Establish and verify property lines with precision and documentation.',
    },
    {
      icon: '🏗️',
      title: 'Construction Staking',
      description: 'Precise staking and control points for construction projects.',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <h1 className="animate-fade-in">
              Professional Land Surveying for Central Texas
            </h1>
            <p className="text-lg text-brand-gray mb-8 leading-relaxed">
              Precision surveying services backed by 15+ years of experience. Serving Bell County, Williamson County, Coryell County, and surrounding areas with integrity and expertise.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/contact" className="btn btn-primary">
                Get Free Consultation
              </Link>
              <Link href="/services" className="btn btn-outline">
                View Services
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section bg-brand-dark text-white">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-3 text-center">
            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="text-5xl font-bold text-brand-red mb-2">15+</div>
              <p className="text-gray-300 font-medium">Years Experience</p>
            </div>
            <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="text-5xl font-bold text-brand-red mb-2">100+</div>
              <p className="text-gray-300 font-medium">Projects Delivered</p>
            </div>
            <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <div className="text-5xl font-bold text-brand-red mb-2">RPLS</div>
              <p className="text-gray-300 font-medium">Licensed & Certified</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="mb-6">What We Offer</h2>
            <p className="text-lg text-brand-gray max-w-2xl">
              Comprehensive surveying solutions tailored to your project needs, from boundary verification to complex development mapping.
            </p>
          </div>
          <div className="grid-3">
            {services.map((service: Service, idx: number) => (
              <ServiceCard 
                key={service.title} 
                {...service}
                delay={idx * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-2 gap-12 items-center">
            <div>
              <h2 className="mb-8">Why Starr Surveying?</h2>
              <ul className="space-y-6">
                <li className="card card-accent">
                  <h4 className="text-brand-red mb-2">Licensed Professionals</h4>
                  <p className="text-sm text-brand-gray">RPLS-certified surveyors meeting all Texas standards and regulations.</p>
                </li>
                <li className="card card-accent">
                  <h4 className="text-brand-red mb-2">Advanced Technology</h4>
                  <p className="text-sm text-brand-gray">GPS, GIS, and total station equipment for maximum accuracy.</p>
                </li>
                <li className="card card-accent">
                  <h4 className="text-brand-red mb-2">Local Expertise</h4>
                  <p className="text-sm text-brand-gray">Deep knowledge of Central Texas properties and requirements.</p>
                </li>
                <li className="card card-accent">
                  <h4 className="text-brand-red mb-2">Built on Integrity</h4>
                  <p className="text-sm text-brand-gray">Christian values guide our work and client relationships.</p>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-brand-red to-brand-blue text-white rounded-16 p-12 shadow-lg">
                <h3 className="text-3xl font-bold mb-6">15+ Years of Excellence</h3>
                <p className="mb-8 text-lg leading-relaxed">
                  We've built our reputation on precision, professionalism, and reliability. Every project receives our complete attention and expertise.
                </p>
                <Link href="/about" className="inline-block px-8 py-3 bg-white text-brand-red font-semibold rounded-lg hover:shadow-lg transition-all">
                  Learn Our Story
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Area Section */}
      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-2 gap-12 items-center">
            <div className="relative bg-brand-light rounded-16 p-12 flex items-center justify-center h-96">
              <div className="text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-2xl font-bold text-brand-dark mb-2">Central Texas</p>
                <p className="text-brand-gray">5 Primary Counties</p>
              </div>
            </div>
            <div>
              <h2 className="mb-6">Serving Central Texas</h2>
              <p className="text-lg text-brand-gray mb-8">
                Based in Belton, we serve Bell County, Williamson County, Coryell County, Falls County, and surrounding areas.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <span className="text-brand-red font-bold">→</span>
                  <span>Bell County (Belton, Temple, Waco, Killeen)</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-red font-bold">→</span>
                  <span>Williamson County (Georgetown, Round Rock)</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-red font-bold">→</span>
                  <span>Coryell County (Copperas Cove, Gatesville)</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-red font-bold">→</span>
                  <span>Falls County & Surrounding Areas</span>
                </li>
              </ul>
              <p className="text-brand-gray italic mb-8">
                For larger projects, we're willing to travel throughout Texas and beyond.
              </p>
              <Link href="/service-area" className="btn btn-secondary">
                View Full Service Map
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
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
          }} className="mb-4 text-4xl md:text-5xl">
            Ready to Get Started?
          </h2>
          <p className="text-lg mb-10 max-w-2xl mx-auto text-gray-100">
            Contact us today for a free consultation and detailed quote on your surveying project.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact" className="btn" style={{
              background: 'white',
              color: '#BD1218'
            }}>
              Request Quote
            </Link>
            <a href="tel:9366620077" className="btn border-2 border-white text-white hover:bg-white hover:text-brand-red">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}