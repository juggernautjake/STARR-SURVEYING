import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Service Area | Starr Surveying',
};

export default function ServiceAreaPage(): React.ReactElement {
  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Service Area</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Professional surveying throughout Central Texas and beyond.
          </p>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-2 gap-12 items-center">
            <div className="bg-brand-light rounded-16 p-12 flex items-center justify-center h-96">
              <div className="text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-2xl font-bold text-brand-dark mb-2">Central Texas</p>
                <p className="text-brand-gray font-medium">5 Primary Counties</p>
              </div>
            </div>
            <div>
              <h2 className="mb-8">Where We Serve</h2>
              <p className="text-brand-gray mb-8 leading-relaxed">
                Based in Belton, we serve Bell County and surrounding Central Texas regions. Our primary service area covers five counties, with flexibility for larger projects throughout Texas.
              </p>
              <h3 className="text-xl font-semibold text-brand-dark mb-6">Primary Service Counties</h3>
              <ul className="space-y-4 mb-10">
                <li className="card card-accent p-4">
                  <p className="font-semibold text-brand-dark">Bell County</p>
                  <p className="text-sm text-brand-gray">Belton, Waco, Temple, Killeen</p>
                </li>
                <li className="card card-accent p-4">
                  <p className="font-semibold text-brand-dark">Williamson County</p>
                  <p className="text-sm text-brand-gray">Georgetown, Round Rock, Cedar Park</p>
                </li>
                <li className="card card-accent p-4">
                  <p className="font-semibold text-brand-dark">Coryell County</p>
                  <p className="text-sm text-brand-gray">Copperas Cove, Gatesville</p>
                </li>
                <li className="card card-accent p-4">
                  <p className="font-semibold text-brand-dark">Falls County</p>
                  <p className="text-sm text-brand-gray">Marlin, Waco area</p>
                </li>
                <li className="card card-accent p-4">
                  <p className="font-semibold text-brand-dark">Surrounding Areas</p>
                  <p className="text-sm text-brand-gray">Burnet, Lampasas, McLennan counties</p>
                </li>
              </ul>
              <div className="bg-blue-50 border-l-4 border-brand-blue p-6 rounded-lg">
                <p className="text-brand-dark font-semibold mb-2">Willing to Travel</p>
                <p className="text-sm text-brand-gray">For larger projects and special circumstances, we're happy to discuss serving areas outside our primary coverage.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{
        background: 'linear-gradient(135deg, #BD1218 0%, #1D3095 100%)',
        color: 'white'
      }}>
        <div className="container max-w-7xl mx-auto text-center">
          <h2 style={{ background: 'none', WebkitBackgroundClip: 'unset', WebkitTextFillColor: 'unset', color: 'white' }} className="text-4xl mb-6">
            In Our Service Area?
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Contact us for a free consultation.
          </p>
          <Link href="/contact" className="btn" style={{ background: 'white', color: '#BD1218' }}>
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}