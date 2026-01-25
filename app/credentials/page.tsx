import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Credentials | Starr Surveying',
};

export default function CredentialsPage(): React.ReactElement {
  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">Credentials & Qualifications</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Licensed professionals with proven expertise and professional standards.
          </p>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-12 text-center">Professional Licensing</h2>
          <div className="card card-accent max-w-3xl mx-auto">
            <h3 className="text-3xl text-brand-red mb-8">Licensed Professional Surveyor (RPLS)</h3>
            <p className="text-brand-gray mb-8 leading-relaxed">
              Starr Surveying is owned and operated by a Licensed Professional Surveyor registered with the State of Texas. An RPLS designation represents the highest standards of professional competence.
            </p>
            <h4 className="font-semibold text-brand-dark mb-6 text-lg">RPLS Requirements:</h4>
            <ul className="space-y-4 mb-10">
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">Education</p>
                  <p className="text-sm text-brand-gray">Degree in surveying or related field</p>
                </div>
              </li>
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">Experience</p>
                  <p className="text-sm text-brand-gray">Minimum 4+ years professional surveying</p>
                </div>
              </li>
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">FS Exam</p>
                  <p className="text-sm text-brand-gray">Pass Fundamentals of Surveying exam</p>
                </div>
              </li>
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">PS Exam</p>
                  <p className="text-sm text-brand-gray">Pass Professional Surveyor exam</p>
                </div>
              </li>
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">Ethics</p>
                  <p className="text-sm text-brand-gray">Demonstrated professional ethics</p>
                </div>
              </li>
              <li className="flex gap-4 items-start">
                <span className="text-brand-red font-bold text-xl">✓</span>
                <div>
                  <p className="font-semibold text-brand-dark">Continuing Education</p>
                  <p className="text-sm text-brand-gray">Ongoing professional development</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-12 text-center">Our Commitment</h2>
          <div className="grid-3">
            <div className="card card-accent">
              <h4 className="text-brand-red mb-3 font-semibold">Professional Standards</h4>
              <p className="text-sm text-brand-gray">Adhere to highest surveying standards and best practices.</p>
            </div>
            <div className="card card-accent-blue">
              <h4 className="text-brand-blue mb-3 font-semibold">Continuing Education</h4>
              <p className="text-sm text-brand-gray">Stay current with latest technology and methodology.</p>
            </div>
            <div className="card card-accent">
              <h4 className="text-brand-red mb-3 font-semibold">Quality Assurance</h4>
              <p className="text-sm text-brand-gray">Every project reviewed for accuracy and completeness.</p>
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
            Trust the Professionals
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Licensed professionals with training, experience, and commitment to excellence.
          </p>
          <Link href="/contact" className="btn" style={{ background: 'white', color: '#BD1218' }}>
            Contact Us
          </Link>
        </div>
      </section>
    </>
  );
}