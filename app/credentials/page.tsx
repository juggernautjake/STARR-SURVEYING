'use client';

import Link from 'next/link';

// Import Credentials page styles
import '../styles/Credentials.css';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

interface RPLSRequirement {
  icon: string;
  title: string;
  description: string;
}

interface CommitmentCard {
  icon: string;
  title: string;
  description: string;
  variant: 'red' | 'blue';
}

interface CertificationBadge {
  title: string;
  issuer: string;
  description: string;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function CredentialsPage(): React.ReactElement {
  // RPLS Requirements
  const rplsRequirements: RPLSRequirement[] = [
    {
      icon: '🎓',
      title: 'Education',
      description: 'Degree in surveying, geomatics, or related field from an accredited institution',
    },
    {
      icon: '⏱️',
      title: 'Experience',
      description: 'Minimum 4+ years of progressive professional surveying experience under RPLS supervision',
    },
    {
      icon: '📝',
      title: 'Fundamentals Exam (FS)',
      description: 'Pass the NCEES Fundamentals of Surveying examination',
    },
    {
      icon: '📋',
      title: 'Professional Exam (PS)',
      description: 'Pass the NCEES Principles and Practice of Surveying examination',
    },
    {
      icon: '🏛️',
      title: 'Texas State Exam (TSSE)',
      description: 'Pass the Texas-specific surveying examination on state laws and practices',
    },
    {
      icon: '📚',
      title: 'Continuing Education',
      description: 'Complete required professional development hours each renewal cycle',
    },
  ];

  // Commitment Cards
  const commitmentCards: CommitmentCard[] = [
    {
      icon: '⭐',
      title: 'Professional Standards',
      description: 'We adhere to the highest surveying standards set by TBPELS and TSPS, ensuring every project meets or exceeds industry requirements.',
      variant: 'red',
    },
    {
      icon: '🔬',
      title: 'Modern Technology',
      description: 'We invest in state-of-the-art GPS/GNSS equipment and software to deliver the most accurate results possible.',
      variant: 'blue',
    },
    {
      icon: '✅',
      title: 'Quality Assurance',
      description: 'Every survey undergoes thorough review and verification before delivery to ensure accuracy and completeness.',
      variant: 'red',
    },
    {
      icon: '📖',
      title: 'Continuing Education',
      description: 'We stay current with the latest surveying techniques, technology, and legal requirements through ongoing professional development.',
      variant: 'blue',
    },
    {
      icon: '🤝',
      title: 'Client Communication',
      description: 'We believe in clear, honest communication throughout every project, keeping you informed at every step.',
      variant: 'red',
    },
    {
      icon: '⚡',
      title: 'Timely Delivery',
      description: 'We understand deadlines matter and work efficiently to deliver quality results on schedule.',
      variant: 'blue',
    },
  ];

  // Certifications
  const certifications: CertificationBadge[] = [
    {
      title: 'RPLS',
      issuer: 'Texas Board of Professional Engineers and Land Surveyors',
      description: 'Registered Professional Land Surveyor - Licensed to practice land surveying in Texas',
    },
    {
      title: 'NCEES',
      issuer: 'National Council of Examiners for Engineering and Surveying',
      description: 'Successfully passed all required national examinations',
    },
    {
      title: 'TSPS Member',
      issuer: 'Texas Society of Professional Surveyors',
      description: 'Active member of the state professional organization',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="credentials-hero">
        <div className="credentials-hero__container">
          <div className="credentials-hero__card">
            <h1 className="credentials-hero__title">
              <span className="credentials-hero__title-accent">Credentials</span>
            </h1>
            <p className="credentials-hero__subtitle">
              Licensed professionals with proven expertise, rigorous training, and a commitment to excellence in every survey we perform.
            </p>
          </div>
        </div>
      </section>

      {/* RPLS License Section */}
      <section className="credentials-license">
        <div className="credentials-license__container">
          <div className="credentials-license__header">
            <div className="credentials-license__badge">RPLS</div>
            <div className="credentials-license__header-text">
              <h2 className="credentials-license__title">Registered Professional Land Surveyor</h2>
              <p className="credentials-license__subtitle">
                Starr Surveying is owned and operated by a Registered Professional Land Surveyor (RPLS) 
                licensed by the State of Texas. This designation represents the highest standard of 
                professional competence in land surveying.
              </p>
            </div>
          </div>

          <div className="credentials-license__info">
            {/* Our Licensed Surveyor Card - Front and Center */}
            <div className="credentials-license__info-card credentials-license__info-card--surveyor">
              <h3 className="credentials-license__info-title">Our Licensed Surveyor</h3>
              <div className="credentials-license__surveyor-details">
                <p className="credentials-license__surveyor-name">Henry S. Maddux</p>
                <p className="credentials-license__surveyor-number">RPLS# 6706</p>
                <p className="credentials-license__surveyor-status">Status: Registered ✓</p>
                <p className="credentials-license__surveyor-granted">Licensed: December 15, 2017</p>
                <p className="credentials-license__surveyor-expires">Expires: December 31, 2026</p>
              </div>
            </div>

            {/* What is an RPLS Card */}
            <div className="credentials-license__info-card">
              <h3 className="credentials-license__info-title">What is an RPLS?</h3>
              <p className="credentials-license__info-text">
                An RPLS is a professional licensed by TBPELS (Texas Board of Professional Engineers and 
                Land Surveyors) to practice land surveying in Texas. Only an RPLS can legally prepare, 
                sign, and seal official survey documents in the state. This protects consumers by ensuring 
                surveys are performed by qualified, accountable professionals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Requirements Section */}
      <section className="credentials-requirements">
        <div className="credentials-requirements__container">
          <h2 className="credentials-requirements__title">RPLS Licensing Requirements</h2>
          <p className="credentials-requirements__intro">
            Becoming a Registered Professional Land Surveyor in Texas requires meeting rigorous standards:
          </p>

          <div className="credentials-requirements__grid">
            {rplsRequirements.map((req, index) => (
              <div 
                key={req.title} 
                className={`credentials-requirements__card ${index % 2 === 0 ? 'credentials-requirements__card--red' : 'credentials-requirements__card--blue'}`}
              >
                <div className="credentials-requirements__card-icon">{req.icon}</div>
                <div className="credentials-requirements__card-content">
                  <h4 className="credentials-requirements__card-title">{req.title}</h4>
                  <p className="credentials-requirements__card-desc">{req.description}</p>
                </div>
                <div className="credentials-requirements__card-check">✓</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications Section */}
      <section className="credentials-certs">
        <div className="credentials-certs__container">
          <h2 className="credentials-certs__title">Certifications &amp; Memberships</h2>

          <div className="credentials-certs__grid">
            {certifications.map((cert, index) => (
              <div 
                key={cert.title} 
                className={`credentials-certs__card ${index % 2 === 0 ? 'credentials-certs__card--red' : 'credentials-certs__card--blue'}`}
              >
                <div className="credentials-certs__card-badge">{cert.title}</div>
                <p className="credentials-certs__card-issuer">{cert.issuer}</p>
                <p className="credentials-certs__card-desc">{cert.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="credentials-commitment">
        <div className="credentials-commitment__container">
          <h2 className="credentials-commitment__title">Our Professional Commitment</h2>
          <p className="credentials-commitment__intro">
            Beyond credentials, we are committed to delivering exceptional service on every project.
          </p>

          <div className="credentials-commitment__grid">
            {commitmentCards.map((card) => (
              <div 
                key={card.title} 
                className={`credentials-commitment__card ${card.variant === 'red' ? 'credentials-commitment__card--red' : 'credentials-commitment__card--blue'}`}
              >
                <span className="credentials-commitment__card-icon">{card.icon}</span>
                <h4 className="credentials-commitment__card-title">{card.title}</h4>
                <p className="credentials-commitment__card-desc">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verify License Section */}
      <section className="credentials-verify">
        <div className="credentials-verify__container">
          <div className="credentials-verify__card">
            <div className="credentials-verify__icon">🔍</div>
            <div className="credentials-verify__content">
              <h3 className="credentials-verify__title">Verify Our License</h3>
              <p className="credentials-verify__desc">
                You can verify any Texas RPLS license through the official TBPELS website. 
                We encourage all clients to verify surveyor credentials before hiring.
              </p>
              <div className="credentials-verify__surveyor-info">
                <p className="credentials-verify__surveyor-label">Search for our license:</p>
                <p className="credentials-verify__surveyor-name">Henry S. Maddux, RPLS# 6706</p>
              </div>
              <a 
                href="https://pels.texas.gov/roster/rplssearch.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="credentials-verify__btn"
              >
                TBPELS License Lookup →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="credentials-cta">
        <div className="credentials-cta__container">
          <h2 className="credentials-cta__title">Trust the Professionals</h2>
          <p className="credentials-cta__subtitle">
            When you choose Starr Surveying, you&apos;re choosing licensed professionals with the 
            training, experience, and commitment to deliver accurate, reliable results.
          </p>
          <div className="credentials-cta__buttons">
            <Link href="/contact" className="credentials-cta__btn credentials-cta__btn--primary">
              Get Started
            </Link>
            <a href="tel:9366620077" className="credentials-cta__btn credentials-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}