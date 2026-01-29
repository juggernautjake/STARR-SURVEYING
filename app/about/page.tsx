import type { Metadata } from 'next';
import Link from 'next/link';

// Import About page styles
import '../styles/About.css';

export const metadata: Metadata = {
  title: 'About Starr Surveying | Our Team & Story',
  description: 'Learn about Starr Surveying - over 15 years of professional land surveying expertise in Central Texas, guided by integrity and Christian values.',
};

interface TeamMember {
  name: string;
  title: string;
  experience?: string;
  description: string;
}

interface WhyCard {
  icon: string;
  title: string;
  description: string;
}

interface MissionItem {
  icon: string;
  label: string;
  description: string;
}

export default function AboutPage(): React.ReactElement {
  const teamMembers: TeamMember[] = [
    {
      name: 'Hank Maddux',
      title: 'Owner & RPLS# 6706',
      experience: '15+ Years Professional Experience',
      description: 'Licensed Professional Land Surveyor with extensive expertise. Leads with integrity and precision.',
    },
    {
      name: 'Jacob Maddux',
      title: 'Party Chief',
      experience: 'Building RPLS Certification',
      description: 'Dedicated professional learning advanced surveying techniques and preparing for licensure.',
    },
    {
      name: 'Stephen Ash',
      title: 'Field Crew / Technician',
      description: 'Experienced technician with strong technical knowledge and hands-on expertise.',
    },
    {
      name: 'Cyvonne',
      title: 'Field Crew',
      description: 'Team member providing field support and technical expertise on every project.',
    },
  ];

  const whyCards: WhyCard[] = [
    {
      icon: '📚',
      title: '15+ Years',
      description: 'Proven track record with Central Texas clients',
    },
    {
      icon: '🔐',
      title: 'Licensed Pros',
      description: 'RPLS certified with legal authority',
    },
    {
      icon: '📡',
      title: 'Advanced Tech',
      description: 'GPS, GIS, and precision instruments',
    },
    {
      icon: '🎯',
      title: 'Local Expertise',
      description: 'Deep knowledge of Central Texas',
    },
    {
      icon: '✨',
      title: 'Personal Service',
      description: 'Direct communication with decision-makers',
    },
    {
      icon: '🤝',
      title: 'Integrity First',
      description: 'Built on honesty and Christian values',
    },
  ];

  const missionItems: MissionItem[] = [
    {
      icon: '✓',
      label: 'Precision',
      description: 'Accurate measurements and professional results',
    },
    {
      icon: '✓',
      label: 'Integrity',
      description: 'Guided by Christian values and honesty',
    },
    {
      icon: '✓',
      label: 'Expertise',
      description: 'Licensed professionals with deep knowledge',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="about-hero">
        <div className="about-hero__container">
          <div className="about-hero__card">
            <h1 className="about-hero__title">
              About <span className="about-hero__title-accent">Starr Surveying</span>
            </h1>
            <p className="about-hero__subtitle">
              Over 15 years of professional surveying expertise guided by integrity and Christian values.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="about-story">
        <div className="about-story__container">
          {/* Left: Story Content */}
          <div className="about-story__content">
            <h2 className="about-story__title">Our Story</h2>
            <p className="about-story__text">
              Founded on principles of professionalism, accuracy, and integrity, Starr Surveying has built a reputation for excellence across Central Texas. We believe property boundaries matter—they form the foundation for developments, transfers, and legal clarity.
            </p>
            <p className="about-story__text about-story__text--desktop">
              Every project receives our complete attention and expertise. We combine advanced technology with professional knowledge to deliver results you can depend on.
            </p>
            <blockquote className="about-story__quote">
              &ldquo;Remove not the ancient landmark, which thy fathers have set.&rdquo;
            </blockquote>
            <p className="about-story__quote-source">— Proverbs 22:28</p>
          </div>

          {/* Right: Mission Card */}
          <div className="about-story__mission">
            <h3 className="about-story__mission-title">Our Mission</h3>
            <ul className="about-story__mission-list">
              {missionItems.map((item: MissionItem) => (
                <li key={item.label} className="about-story__mission-item">
                  <span className="about-story__mission-icon">{item.icon}</span>
                  <div className="about-story__mission-content">
                    <p className="about-story__mission-label">{item.label}</p>
                    <p className="about-story__mission-desc">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="about-team">
        <div className="about-team__container">
          <div className="about-team__header">
            <h2 className="about-team__title">Meet Our Team</h2>
            <p className="about-team__subtitle">
              Experienced professionals dedicated to delivering precision surveying services.
            </p>
          </div>

          <div className="about-team__grid">
            {teamMembers.map((member: TeamMember) => (
              <div key={member.name} className="about-team__card">
                <div className="about-team__card-header">
                  <h3 className="about-team__card-name">{member.name}</h3>
                  <p className="about-team__card-title">{member.title}</p>
                  {member.experience && (
                    <p className="about-team__card-experience">{member.experience}</p>
                  )}
                </div>
                <p className="about-team__card-desc">{member.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="about-why">
        <div className="about-why__container">
          <h2 className="about-why__title">Why Choose Us?</h2>
          <div className="about-why__grid">
            {whyCards.map((card: WhyCard) => (
              <div key={card.title} className="about-why__card">
                <span className="about-why__card-icon">{card.icon}</span>
                <div className="about-why__card-content">
                  <h4 className="about-why__card-title">{card.title}</h4>
                  <p className="about-why__card-desc">{card.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="about-cta">
        <div className="about-cta__container">
          <h2 className="about-cta__title">Ready to Work Together?</h2>
          <p className="about-cta__subtitle">
            Contact us today to discuss your surveying needs.
          </p>
          <div className="about-cta__buttons">
            <Link href="/contact" className="about-cta__btn about-cta__btn--primary">
              Get in Touch
            </Link>
            <a href="tel:9366620077" className="about-cta__btn about-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}