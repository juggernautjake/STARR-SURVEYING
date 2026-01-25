import type { Metadata } from 'next';
import Link from 'next/link';
import TeamMember from '../components/TeamMember';
import type { TeamMemberProps } from '../../types';

export const metadata: Metadata = {
  title: 'About Starr Surveying | Our Team',
};

export default function AboutPage(): React.ReactElement {
  const teamMembers: TeamMemberProps[] = [
    {
      name: 'Hank Maddux',
      title: 'Owner & RPLS',
      experience: '15+ Years Professional Experience',
      description: 'Licensed Professional Surveyor with extensive expertise. Leads with integrity and precision.',
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

  return (
    <>
      <section className="hero">
        <div className="container max-w-7xl mx-auto">
          <h1 className="animate-fade-in">About Starr Surveying</h1>
          <p className="text-lg text-brand-gray max-w-2xl">
            Over 15 years of professional surveying expertise guided by integrity and Christian values.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <div className="grid-2 gap-12 items-center">
            <div>
              <h2 className="mb-8">Our Story</h2>
              <p className="text-brand-gray mb-6 leading-relaxed">
                Founded on principles of professionalism, accuracy, and integrity, Starr Surveying has built a reputation for excellence across Central Texas. We believe property boundaries matter—they form the foundation for developments, transfers, and legal clarity.
              </p>
              <p className="text-brand-gray mb-8 leading-relaxed">
                Every project receives our complete attention and expertise. We combine advanced technology with professional knowledge to deliver results you can depend on.
              </p>
              <blockquote className="border-l-4 border-brand-red pl-6 italic text-lg text-brand-dark font-medium">
                "Remove not the ancient landmark, which thy fathers have set."
              </blockquote>
            </div>
            <div className="bg-gradient-to-br from-brand-red to-brand-blue text-white rounded-16 p-12 shadow-lg">
              <h3 className="text-3xl font-bold mb-8">Our Mission</h3>
              <ul className="space-y-6">
                <li className="flex gap-4 items-start">
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="font-semibold mb-1">Precision</p>
                    <p className="text-gray-100 text-sm">Accurate measurements and professional results</p>
                  </div>
                </li>
                <li className="flex gap-4 items-start">
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="font-semibold mb-1">Integrity</p>
                    <p className="text-gray-100 text-sm">Guided by Christian values and honesty</p>
                  </div>
                </li>
                <li className="flex gap-4 items-start">
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="font-semibold mb-1">Expertise</p>
                    <p className="text-gray-100 text-sm">Licensed professionals with deep knowledge</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="section bg-brand-light">
        <div className="container max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="mb-6">Meet Our Team</h2>
            <p className="text-lg text-brand-gray max-w-2xl">
              Experienced professionals dedicated to delivering precision surveying services.
            </p>
          </div>
          <div className="grid-2">
            {teamMembers.map((member: TeamMemberProps) => (
              <TeamMember key={member.name} {...member} />
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="section bg-white">
        <div className="container max-w-7xl mx-auto">
          <h2 className="mb-16 text-center">Why Choose Us?</h2>
          <div className="grid-3">
            <div className="card card-accent">
              <div className="text-3xl mb-4">📚</div>
              <h4>15+ Years</h4>
              <p className="text-sm text-brand-gray">Proven track record with Central Texas clients</p>
            </div>
            <div className="card card-accent-blue">
              <div className="text-3xl mb-4">🔐</div>
              <h4>Licensed Professionals</h4>
              <p className="text-sm text-brand-gray">RPLS certified with legal authority</p>
            </div>
            <div className="card card-accent">
              <div className="text-3xl mb-4">📡</div>
              <h4>Advanced Tech</h4>
              <p className="text-sm text-brand-gray">GPS, GIS, and precision instruments</p>
            </div>
            <div className="card card-accent-blue">
              <div className="text-3xl mb-4">🎯</div>
              <h4>Local Expertise</h4>
              <p className="text-sm text-brand-gray">Deep knowledge of Central Texas area</p>
            </div>
            <div className="card card-accent">
              <div className="text-3xl mb-4">✨</div>
              <h4>Personal Service</h4>
              <p className="text-sm text-brand-gray">Direct communication with decision-makers</p>
            </div>
            <div className="card card-accent-blue">
              <div className="text-3xl mb-4">🤝</div>
              <h4>Integrity First</h4>
              <p className="text-sm text-brand-gray">Built on honesty and Christian values</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
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
            Ready to Work Together?
          </h2>
          <p className="text-gray-100 text-lg mb-10 max-w-2xl mx-auto">
            Contact us today to discuss your surveying needs.
          </p>
          <Link href="/contact" className="btn" style={{
            background: 'white',
            color: '#BD1218'
          }}>
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}