import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Regulations & Resources | Starr Surveying',
};

export default function RegulationsPage(): React.ReactElement {
  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Resources & Regulations</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Information about Texas surveying standards and professional requirements.
          </p>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-12">Texas Surveying Regulations</h2>
          <div className="space-y-8">
            <div className="card card-accent">
              <h3 className="text-2xl text-brand-red mb-6">Licensed Professional Surveyors (RPLS)</h3>
              <p className="text-brand-gray mb-6">
                Texas law requires all land surveys be performed by or under direct supervision of an RPLS. Professional requirements include:
              </p>
              <ul className="space-y-3 text-brand-gray">
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Degree in surveying or related field</li>
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Minimum 4+ years professional experience</li>
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Pass Fundamentals of Surveying (FS) exam</li>
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Pass Professional Surveyor (PS) exam</li>
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Demonstrated ethics and integrity</li>
                <li className="flex gap-3"><span className="text-brand-red font-bold">✓</span> Continuing education requirements</li>
              </ul>
            </div>

            <div className="card card-accent-blue">
              <h3 className="text-2xl text-brand-blue mb-6">Texas Board of Professional Surveyors</h3>
              <p className="text-brand-gray mb-6">
                The TBPS regulates professional surveyors and ensures compliance with state standards.
              </p>
              <p className="text-brand-gray mb-4">
                Verify surveyor credentials at: <a href="https://www.tdlr.texas.gov" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-red hover:text-brand-blue">www.tdlr.texas.gov</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-12 text-center">Frequently Asked Questions</h2>
          <div className="grid-2 max-w-4xl mx-auto gap-8">
            <div className="card card-accent">
              <h4 className="text-brand-red mb-3">How long does a survey take?</h4>
              <p className="text-sm text-brand-gray">
                Simple boundary surveys: 2-4 days. Complex projects: 5-10 days. We provide timelines with quotes.
              </p>
            </div>
            <div className="card card-accent-blue">
              <h4 className="text-brand-blue mb-3">How much does a survey cost?</h4>
              <p className="text-sm text-brand-gray">
                Costs vary. Boundary surveys: $400-$1,200. Complex projects: $1,000-$5,000+. Contact us for exact pricing.
              </p>
            </div>
            <div className="card card-accent">
              <h4 className="text-brand-red mb-3">Do I need a survey when buying property?</h4>
              <p className="text-sm text-brand-gray">
                Highly recommended. Surveys verify boundaries, identify easements, and reveal encroachments.
              </p>
            </div>
            <div className="card card-accent-blue">
              <h4 className="text-brand-blue mb-3">What is an RPLS?</h4>
              <p className="text-sm text-brand-gray">
                RPLS = Registered Professional Land Surveyor. All surveys must be performed by or under supervision of an RPLS.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{
        background: 'linear-gradient(135deg, #1D3095 0%, #BD1218 100%)',
        color: 'white'
      }}>
        <div className="container max-w-7xl mx-auto text-center">
          <h2 style={{ background: 'none', WebkitBackgroundClip: 'unset', WebkitTextFillColor: 'unset', color: 'white' }} className="text-4xl mb-6">
            Questions About Surveying?
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Our RPLS professionals can clarify any questions about regulations, standards, or your property.
          </p>
          <Link href="/contact" className="btn" style={{ background: 'white', color: '#BD1218' }}>
            Contact Us
          </Link>
        </div>
      </section>
    </>
  );
}