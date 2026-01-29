'use client';

import { useState } from 'react';
import Link from 'next/link';

// Import Resources page styles
import '../styles/Resources.css';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

interface OfficialResource {
  icon: string;
  name: string;
  abbreviation: string;
  description: string;
  url: string;
  phone?: string;
  address?: string;
}

interface SurveyType {
  id: string;
  name: string;
  description: string;
  useCases: string[];
  typical: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface ResearchStep {
  icon: string;
  title: string;
  description: string;
  link?: string;
  linkText?: string;
}

// =============================================================================
// FAQ ACCORDION COMPONENT
// =============================================================================

function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="resources-faq__accordion">
      {items.map((item, index) => (
        <div 
          key={index} 
          className={`resources-faq__item ${openIndex === index ? 'resources-faq__item--open' : ''}`}
        >
          <button
            className="resources-faq__question"
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            aria-expanded={openIndex === index}
          >
            <span>{item.question}</span>
            <span className={`resources-faq__arrow ${openIndex === index ? 'resources-faq__arrow--open' : ''}`}>
              ▼
            </span>
          </button>
          {openIndex === index && (
            <div className="resources-faq__answer">
              <p>{item.answer}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ResourcesPage(): React.ReactElement {
  // Official Texas Resources
  const officialResources: OfficialResource[] = [
    {
      icon: '🏛️',
      name: 'Texas Board of Professional Engineers and Land Surveyors',
      abbreviation: 'TBPELS',
      description: 'The state licensing board that regulates professional land surveyors in Texas. Verify surveyor credentials, file complaints, and access licensing information.',
      url: 'https://pels.texas.gov',
      phone: '(512) 440-7723',
      address: '1917 S. Interstate 35, Austin, TX 78741',
    },
    {
      icon: '🗺️',
      name: 'Texas General Land Office',
      abbreviation: 'GLO',
      description: 'Home to over 35 million land grant records dating back to 1720. Search historical surveys, maps, field notes, and land patents for Texas properties.',
      url: 'https://www.glo.texas.gov',
      phone: '(512) 463-5001',
      address: '1700 N. Congress Ave., Austin, TX 78701',
    },
    {
      icon: '👷',
      name: 'Texas Society of Professional Surveyors',
      abbreviation: 'TSPS',
      description: 'Professional organization for Texas surveyors. Find a surveyor, access education resources, and learn about surveying standards and practices.',
      url: 'https://www.tsps.org',
      phone: '(512) 327-7871',
      address: '2525 Wallingwood Dr., Suite 300, Austin, TX 78746',
    },
  ];

  // Survey Types
  const surveyTypes: SurveyType[] = [
    {
      id: 'boundary',
      name: 'Boundary Survey',
      description: 'Establishes or reestablishes property lines and corners based on legal descriptions, recorded deeds, and physical evidence. The most common type of survey for residential and smaller commercial properties.',
      useCases: ['Property purchases', 'Fence installations', 'Building additions', 'Neighbor disputes', 'Property subdivisions'],
      typical: 'Residential & Commercial',
    },
    {
      id: 'alta',
      name: 'ALTA/NSPS Survey',
      description: 'The gold standard for commercial real estate. Follows strict national standards set by the American Land Title Association and National Society of Professional Surveyors. Includes comprehensive property analysis.',
      useCases: ['Commercial transactions', 'Title insurance', 'Lender requirements', 'Large developments', 'Due diligence'],
      typical: 'Commercial Only',
    },
    {
      id: 'category1a',
      name: 'Category 1A Survey (Texas)',
      description: 'Texas-specific commercial survey standard published by TSPS. Similar to ALTA but follows Texas standards and specifications. Commonly requested for commercial and industrial real estate transactions.',
      useCases: ['Commercial closings', 'Industrial properties', 'Title companies', 'Texas-specific requirements'],
      typical: 'Texas Commercial',
    },
    {
      id: 'topographic',
      name: 'Topographic Survey',
      description: 'Maps the terrain features, elevations, contours, and physical characteristics of a property. Essential for construction planning, drainage design, and site development.',
      useCases: ['Construction planning', 'Drainage design', 'Site development', 'Grading plans', 'Engineering projects'],
      typical: 'Any Property Type',
    },
    {
      id: 'elevation',
      name: 'Elevation Certificate',
      description: 'Documents the elevation of structures relative to flood zones. Required by FEMA for flood insurance purposes and often needed when buying or building in flood-prone areas.',
      useCases: ['Flood insurance', 'FEMA compliance', 'Building permits', 'Property sales in flood zones'],
      typical: 'Flood Zone Properties',
    },
    {
      id: 'construction',
      name: 'Construction Staking',
      description: 'Provides precise layout stakes and control points for construction projects. Ensures buildings, roads, and utilities are constructed in the correct locations per the site plans.',
      useCases: ['New construction', 'Building foundations', 'Road construction', 'Utility installation'],
      typical: 'Construction Sites',
    },
  ];

  // Property Research Steps
  const researchSteps: ResearchStep[] = [
    {
      icon: '📋',
      title: 'Check Your Closing Documents',
      description: 'If you recently purchased property, your survey may be in your closing documents from the title company. Check with your real estate agent or title company first.',
    },
    {
      icon: '🏢',
      title: 'Contact Your County Clerk',
      description: 'County clerks maintain property records including deeds, plats, and sometimes surveys. Visit your local county clerk office or search their online records.',
      link: 'https://www.texaslandrecords.com',
      linkText: 'Texas Land Records Search',
    },
    {
      icon: '📚',
      title: 'Texas General Land Office Archives',
      description: 'The GLO maintains historical survey records, land grants, and maps dating back to the 1700s. Particularly useful for rural properties and historical research.',
      link: 'https://www.glo.texas.gov/archives-and-heritage/search-our-collections',
      linkText: 'Search GLO Archives',
    },
    {
      icon: '🏠',
      title: 'County Appraisal District',
      description: 'Your county appraisal district has property maps and can provide general boundary information, though these are not official surveys.',
    },
    {
      icon: '📞',
      title: 'Contact the Original Surveyor',
      description: 'If you know who surveyed the property previously, contact them directly. Surveyors maintain records and may have copies of previous surveys.',
    },
    {
      icon: '🔍',
      title: 'Commission a New Survey',
      description: 'If existing records are unavailable, outdated, or insufficient, the best option is to hire a licensed professional land surveyor to conduct a new survey.',
    },
  ];

  // FAQ Items
  const faqItems: FAQItem[] = [
    {
      question: 'How long does a typical survey take?',
      answer: 'Timeline varies by survey type and property complexity. A standard residential boundary survey typically takes 2-5 business days from fieldwork to delivery. Larger properties, commercial ALTA surveys, or complex topographic surveys may take 1-3 weeks. Rush services are often available for time-sensitive transactions.',
    },
    {
      question: 'How long is a survey valid?',
      answer: 'Legally, a survey has no expiration date - however, its usefulness depends on whether conditions have changed. Lenders and title companies often require surveys less than 6-12 months old for real estate transactions. If improvements have been added to the property since the last survey, a new survey may be needed.',
    },
    {
      question: 'Do I need a survey to build a fence?',
      answer: 'While not always legally required, we strongly recommend a boundary survey before building a fence. Installing a fence in the wrong location can lead to expensive disputes with neighbors, required removal, and potential legal action. A survey ensures your fence is placed correctly on your property.',
    },
    {
      question: 'What is an RPLS?',
      answer: 'RPLS stands for Registered Professional Land Surveyor. This is the Texas license designation for surveyors authorized to practice land surveying. Only an RPLS can legally prepare and certify surveys in Texas. You can verify an RPLS license on the TBPELS website.',
    },
    {
      question: 'What is the difference between a plat and a survey?',
      answer: 'A plat is a recorded map showing the division of land into lots, typically for a subdivision. It becomes a public record filed with the county. A survey is a document showing the boundaries and features of a specific property. Surveys can be used to create plats, but not all surveys are recorded as plats.',
    },
    {
      question: 'Can I use my neighbor\'s survey?',
      answer: 'No, a survey is prepared for and certified to a specific client. Your neighbor\'s survey was not prepared for you, may not show your complete property, and the surveyor has no liability to you for its accuracy. You need your own survey that is certified to you.',
    },
    {
      question: 'What are easements and why do they matter?',
      answer: 'Easements are legal rights allowing others to use a portion of your property for specific purposes, such as utility lines, drainage, or access roads. They can limit what you can build or how you use parts of your property. A survey will show recorded easements so you understand these limitations.',
    },
    {
      question: 'What is an encroachment?',
      answer: 'An encroachment occurs when a structure, fence, or improvement extends beyond the property line onto neighboring property or into an easement. Surveys identify encroachments, which can affect property sales, title insurance, and relationships with neighbors.',
    },
    {
      question: 'Do I need a survey for a real estate closing?',
      answer: 'It depends on the transaction and lender requirements. Most lenders require a survey for mortgage financing. Cash purchases may not require one, but a survey is always recommended to understand exactly what you are buying and to identify potential issues before closing.',
    },
    {
      question: 'How do I know if a surveyor is licensed?',
      answer: 'Verify surveyor licenses through the Texas Board of Professional Engineers and Land Surveyors (TBPELS) at pels.texas.gov. Search for the surveyor by name or license number. Only hire surveyors with an active RPLS license in good standing.',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="resources-hero">
        <div className="resources-hero__container">
          <div className="resources-hero__card">
            <h1 className="resources-hero__title">
              <span className="resources-hero__title-accent">Resources</span>
            </h1>
            <p className="resources-hero__subtitle">
              Helpful information about land surveying in Texas, including official resources, survey types, and answers to frequently asked questions.
            </p>
          </div>
        </div>
      </section>

      {/* Official Texas Resources Section */}
      <section className="resources-official">
        <div className="resources-official__container">
          <h2 className="resources-official__title">Official Texas Resources</h2>
          <p className="resources-official__intro">
            These government agencies and professional organizations are authoritative sources for land surveying information in Texas.
          </p>

          <div className="resources-official__grid">
            {officialResources.map((resource, index) => (
              <div 
                key={resource.abbreviation} 
                className={`resources-official__card ${index % 2 === 0 ? 'resources-official__card--red' : 'resources-official__card--blue'}`}
              >
                <div className="resources-official__card-header">
                  <span className="resources-official__card-icon">{resource.icon}</span>
                  <div className="resources-official__card-titles">
                    <h3 className="resources-official__card-abbr">{resource.abbreviation}</h3>
                    <p className="resources-official__card-name">{resource.name}</p>
                  </div>
                </div>
                <p className="resources-official__card-desc">{resource.description}</p>
                <div className="resources-official__card-contact">
                  {resource.phone && (
                    <p className="resources-official__card-phone">
                      <strong>Phone:</strong> {resource.phone}
                    </p>
                  )}
                  {resource.address && (
                    <p className="resources-official__card-address">
                      <strong>Address:</strong> {resource.address}
                    </p>
                  )}
                </div>
                <a 
                  href={resource.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="resources-official__card-link"
                >
                  Visit Website →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Survey Types Section */}
      <section className="resources-types">
        <div className="resources-types__container">
          <h2 className="resources-types__title">Types of Land Surveys</h2>
          <p className="resources-types__intro">
            Different survey types serve different purposes. Understanding which survey you need helps ensure you get the right information for your project.
          </p>

          <div className="resources-types__grid">
            {surveyTypes.map((survey, index) => (
              <div 
                key={survey.id} 
                className={`resources-types__card ${index % 2 === 0 ? 'resources-types__card--blue' : 'resources-types__card--red'}`}
              >
                <div className="resources-types__card-header">
                  <h3 className="resources-types__card-title">{survey.name}</h3>
                  <span className="resources-types__card-badge">{survey.typical}</span>
                </div>
                <p className="resources-types__card-desc">{survey.description}</p>
                <div className="resources-types__card-uses">
                  <strong>Common Uses:</strong>
                  <ul>
                    {survey.useCases.map((use, i) => (
                      <li key={i}>{use}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="resources-types__note">
            <p>
              <strong>Not sure which survey type you need?</strong> Contact us for a free consultation. 
              We&apos;ll help you determine the right survey for your specific situation.
            </p>
          </div>
        </div>
      </section>

      {/* Finding Property Records Section */}
      <section className="resources-research">
        <div className="resources-research__container">
          <h2 className="resources-research__title">Finding Property Records</h2>
          <p className="resources-research__intro">
            Looking for an existing survey or property records? Here&apos;s where to start your search.
          </p>

          <div className="resources-research__grid">
            {researchSteps.map((step, index) => (
              <div key={index} className="resources-research__step">
                <div className="resources-research__step-number">{index + 1}</div>
                <div className="resources-research__step-content">
                  <span className="resources-research__step-icon">{step.icon}</span>
                  <h4 className="resources-research__step-title">{step.title}</h4>
                  <p className="resources-research__step-desc">{step.description}</p>
                  {step.link && (
                    <a 
                      href={step.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="resources-research__step-link"
                    >
                      {step.linkText} →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="resources-faq">
        <div className="resources-faq__container">
          <h2 className="resources-faq__title">Frequently Asked Questions</h2>
          <p className="resources-faq__intro">
            Common questions about land surveying in Texas.
          </p>

          <FAQAccordion items={faqItems} />
        </div>
      </section>

      {/* Glossary Quick Reference */}
      <section className="resources-glossary">
        <div className="resources-glossary__container">
          <h2 className="resources-glossary__title">Quick Glossary</h2>
          
          <div className="resources-glossary__grid">
            <div className="resources-glossary__term">
              <h4>Boundary</h4>
              <p>The external limiting lines of a property.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Monument</h4>
              <p>A physical marker (iron pin, cap, or stake) set at a property corner.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Easement</h4>
              <p>A right to use another&apos;s land for a specific purpose.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Encroachment</h4>
              <p>A structure that extends beyond property lines.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Setback</h4>
              <p>Required distance from property lines where no building may be placed.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Plat</h4>
              <p>A recorded map showing the division of land into lots.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Metes &amp; Bounds</h4>
              <p>A legal description using distances and directions.</p>
            </div>
            <div className="resources-glossary__term">
              <h4>Right-of-Way</h4>
              <p>Land reserved for roads, utilities, or public access.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Verify a Surveyor Section */}
      <section className="resources-verify">
        <div className="resources-verify__container">
          <div className="resources-verify__card">
            <div className="resources-verify__content">
              <h2 className="resources-verify__title">⚠️ Always Verify Your Surveyor</h2>
              <p className="resources-verify__desc">
                In Texas, only a Registered Professional Land Surveyor (RPLS) can legally prepare 
                and certify surveys. Before hiring any surveyor, verify their license is active 
                and in good standing with TBPELS.
              </p>
              <div className="resources-verify__buttons">
                <a 
                  href="https://pels.texas.gov/roster/rplssearch.html" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="resources-verify__btn resources-verify__btn--primary"
                >
                  Verify a License
                </a>
                <Link href="/about" className="resources-verify__btn resources-verify__btn--secondary">
                  View Our Credentials
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="resources-cta">
        <div className="resources-cta__container">
          <h2 className="resources-cta__title">Have More Questions?</h2>
          <p className="resources-cta__subtitle">
            We&apos;re here to help. Contact us for a free consultation about your surveying needs.
          </p>
          <div className="resources-cta__buttons">
            <Link href="/contact" className="resources-cta__btn resources-cta__btn--primary">
              Contact Us
            </Link>
            <a href="tel:9366620077" className="resources-cta__btn resources-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>
    </>
  );
}