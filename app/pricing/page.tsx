'use client';

import { useState } from 'react';
import Link from 'next/link';

// Import Pricing page styles
import '../styles/Pricing.css';

// =============================================================================
// CALCULATOR TYPES AND INTERFACES
// =============================================================================

interface SurveyType {
  id: string;
  name: string;
  baseHours: number;
  perAcreHours: number;
  description: string;
  minPrice: number;
}

interface TerrainType {
  id: string;
  name: string;
  multiplier: number;
  description: string;
}

interface Deliverable {
  id: string;
  name: string;
  additionalHours: number;
  fixedPrice: number;
  description: string;
}

interface AccessType {
  id: string;
  name: string;
  multiplier: number;
}

interface RecordCondition {
  id: string;
  name: string;
  additionalHours: number;
  description: string;
}

// =============================================================================
// CALCULATOR CONSTANTS - Based on research and $140/hour rate
// =============================================================================

const HOURLY_RATE = 140;
const MILEAGE_RATE = 0.70;
const TRAVEL_SPEED_AVG = 45;

const SURVEY_TYPES: SurveyType[] = [
  { id: 'boundary', name: 'Boundary Survey', baseHours: 4, perAcreHours: 0.5, description: 'Establishes property lines and corners', minPrice: 400 },
  { id: 'topographic', name: 'Topographic Survey', baseHours: 6, perAcreHours: 1.2, description: 'Maps elevations, contours, and features', minPrice: 600 },
  { id: 'boundary_topo', name: 'Boundary + Topographic', baseHours: 8, perAcreHours: 1.5, description: 'Combined boundary and topographic survey', minPrice: 900 },
  { id: 'construction', name: 'Construction Staking', baseHours: 3, perAcreHours: 0.4, description: 'Layout stakes for construction projects', minPrice: 300 },
  { id: 'alta', name: 'ALTA/NSPS Survey', baseHours: 12, perAcreHours: 2.0, description: 'Comprehensive commercial survey standard', minPrice: 2000 },
  { id: 'category1a', name: 'Category 1A (Texas)', baseHours: 10, perAcreHours: 1.8, description: 'Texas commercial title survey standard', minPrice: 1500 },
  { id: 'mortgage', name: 'Mortgage/Title Survey', baseHours: 4, perAcreHours: 0.4, description: 'Survey for real estate closings', minPrice: 350 },
  { id: 'subdivision', name: 'Subdivision Platting', baseHours: 16, perAcreHours: 2.5, description: 'Dividing land into multiple lots', minPrice: 2500 },
  { id: 'elevation', name: 'Elevation Certificate', baseHours: 3, perAcreHours: 0.2, description: 'FEMA flood zone compliance', minPrice: 350 },
  { id: 'asbuilt', name: 'As-Built Survey', baseHours: 4, perAcreHours: 0.6, description: 'Documents completed construction', minPrice: 400 },
];

const TERRAIN_TYPES: TerrainType[] = [
  { id: 'flat_clear', name: 'Flat & Clear', multiplier: 1.0, description: 'Open pasture, minimal obstacles' },
  { id: 'flat_some_trees', name: 'Flat with Some Trees', multiplier: 1.15, description: 'Scattered trees, mostly clear' },
  { id: 'rolling', name: 'Rolling/Gentle Hills', multiplier: 1.25, description: 'Moderate elevation changes' },
  { id: 'wooded', name: 'Heavily Wooded', multiplier: 1.4, description: 'Dense tree coverage throughout' },
  { id: 'hilly_wooded', name: 'Hilly & Wooded', multiplier: 1.55, description: 'Steep terrain with dense vegetation' },
  { id: 'very_difficult', name: 'Very Difficult', multiplier: 1.75, description: 'Steep cliffs, swamp, or extreme brush' },
];

const ACCESS_TYPES: AccessType[] = [
  { id: 'easy', name: 'Easy Access (paved road)', multiplier: 1.0 },
  { id: 'moderate', name: 'Moderate (gravel/dirt road)', multiplier: 1.1 },
  { id: 'difficult', name: 'Difficult (rough road/gate access)', multiplier: 1.2 },
  { id: 'very_difficult', name: 'Very Difficult (4WD required)', multiplier: 1.35 },
];

const RECORD_CONDITIONS: RecordCondition[] = [
  { id: 'recent', name: 'Recent Survey Available (< 5 years)', additionalHours: 0, description: 'Good records on file' },
  { id: 'older', name: 'Older Survey Available (5-20 years)', additionalHours: 1, description: 'May need verification' },
  { id: 'old', name: 'Old Records Only (20+ years)', additionalHours: 2, description: 'Significant research needed' },
  { id: 'none', name: 'No Previous Survey / Poor Records', additionalHours: 4, description: 'Extensive research required' },
];

const DELIVERABLES: Deliverable[] = [
  { id: 'plat', name: 'Certified Survey Plat', additionalHours: 1.5, fixedPrice: 0, description: 'Sealed and signed survey drawing' },
  { id: 'legal_desc', name: 'Legal Description', additionalHours: 1, fixedPrice: 0, description: 'Metes and bounds or lot/block description' },
  { id: 'corners_marked', name: 'Corner Markers Set', additionalHours: 0, fixedPrice: 25, description: 'Per corner - iron pins or caps' },
  { id: 'cad_files', name: 'Digital CAD Files', additionalHours: 0.5, fixedPrice: 50, description: 'AutoCAD DWG/DXF format' },
  { id: 'pdf_files', name: 'Digital PDF Files', additionalHours: 0, fixedPrice: 0, description: 'PDF copies of survey (included)' },
  { id: 'gis_data', name: 'GIS Data Package', additionalHours: 1, fixedPrice: 75, description: 'Shapefiles and georeferenced data' },
  { id: 'extra_copies', name: 'Additional Hard Copies (each)', additionalHours: 0, fixedPrice: 15, description: 'Extra printed and sealed copies' },
];

const SHAPE_COMPLEXITY = [
  { id: 'regular', name: 'Regular (4 sides, rectangular)', multiplier: 1.0 },
  { id: 'irregular', name: 'Irregular (5-6 sides)', multiplier: 1.15 },
  { id: 'complex', name: 'Complex (7+ sides or curves)', multiplier: 1.3 },
];

// =============================================================================
// CALCULATOR COMPONENT WITH COLLAPSIBLE DROPDOWN
// =============================================================================

function PricingCalculator() {
  // Expanded/collapsed state
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Form state
  const [surveyType, setSurveyType] = useState('boundary');
  const [acreage, setAcreage] = useState('1');
  const [travelDistance, setTravelDistance] = useState('25');
  const [terrain, setTerrain] = useState('flat_clear');
  const [access, setAccess] = useState('easy');
  const [records, setRecords] = useState('older');
  const [shape, setShape] = useState('regular');
  const [numCorners, setNumCorners] = useState('4');
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>(['plat', 'pdf_files']);
  const [rushJob, setRushJob] = useState(false);
  
  // Result state
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<{
    lowEstimate: number;
    highEstimate: number;
    estimatedHours: number;
    breakdown: {
      baseLabor: number;
      travelCost: number;
      deliverableCost: number;
      multiplierEffect: number;
    };
  } | null>(null);

  const handleDeliverableChange = (deliverableId: string, checked: boolean) => {
    if (checked) {
      setSelectedDeliverables([...selectedDeliverables, deliverableId]);
    } else {
      setSelectedDeliverables(selectedDeliverables.filter(id => id !== deliverableId));
    }
  };

  const calculateEstimate = () => {
    const selectedSurvey = SURVEY_TYPES.find(s => s.id === surveyType)!;
    const selectedTerrain = TERRAIN_TYPES.find(t => t.id === terrain)!;
    const selectedAccess = ACCESS_TYPES.find(a => a.id === access)!;
    const selectedRecords = RECORD_CONDITIONS.find(r => r.id === records)!;
    const selectedShape = SHAPE_COMPLEXITY.find(s => s.id === shape)!;

    const acres = parseFloat(acreage) || 1;
    const distance = parseFloat(travelDistance) || 0;
    const corners = parseInt(numCorners) || 4;

    let fieldHours = selectedSurvey.baseHours + (selectedSurvey.perAcreHours * acres);
    fieldHours += selectedRecords.additionalHours;

    let deliverableHours = 0;
    let deliverableFixedCost = 0;
    
    selectedDeliverables.forEach(delId => {
      const del = DELIVERABLES.find(d => d.id === delId);
      if (del) {
        deliverableHours += del.additionalHours;
        if (del.id === 'corners_marked') {
          deliverableFixedCost += del.fixedPrice * corners;
        } else if (del.id === 'extra_copies') {
          deliverableFixedCost += del.fixedPrice * 2;
        } else {
          deliverableFixedCost += del.fixedPrice;
        }
      }
    });

    const estimatedHours = fieldHours + deliverableHours;
    const travelTimeHours = (distance / TRAVEL_SPEED_AVG) * 2;
    const travelMileageCost = distance * MILEAGE_RATE * 2;
    const travelLaborCost = travelTimeHours * (HOURLY_RATE * 0.5);
    const totalTravelCost = travelMileageCost + travelLaborCost;
    const baseLaborCost = estimatedHours * HOURLY_RATE;
    const totalMultiplier = selectedTerrain.multiplier * selectedAccess.multiplier * selectedShape.multiplier;
    const multiplierEffect = baseLaborCost * (totalMultiplier - 1);
    const rushMultiplier = rushJob ? 1.5 : 1.0;
    const subtotal = (baseLaborCost * totalMultiplier + totalTravelCost + deliverableFixedCost) * rushMultiplier;
    const finalEstimate = Math.max(subtotal, selectedSurvey.minPrice);
    const lowEstimate = Math.round(finalEstimate * 0.85);
    const highEstimate = Math.round(finalEstimate * 1.20);

    setResult({
      lowEstimate,
      highEstimate,
      estimatedHours: estimatedHours + travelTimeHours,
      breakdown: {
        baseLabor: Math.round(baseLaborCost),
        travelCost: Math.round(totalTravelCost),
        deliverableCost: Math.round(deliverableFixedCost),
        multiplierEffect: Math.round(multiplierEffect),
      },
    });
    setShowResult(true);
  };

  const resetCalculator = () => {
    setSurveyType('boundary');
    setAcreage('1');
    setTravelDistance('25');
    setTerrain('flat_clear');
    setAccess('easy');
    setRecords('older');
    setShape('regular');
    setNumCorners('4');
    setSelectedDeliverables(['plat', 'pdf_files']);
    setRushJob(false);
    setShowResult(false);
    setResult(null);
  };

  return (
    <section className="pricing-calculator">
      <div className="pricing-calculator__container">
        {/* Clickable Header/Toggle */}
        <button 
          className={`pricing-calculator__toggle ${isExpanded ? 'pricing-calculator__toggle--expanded' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <div className="pricing-calculator__toggle-content">
            <span className="pricing-calculator__toggle-icon">🧮</span>
            <div className="pricing-calculator__toggle-text">
              <h2 className="pricing-calculator__toggle-title">Online Estimate Calculator</h2>
              <p className="pricing-calculator__toggle-subtitle">
                {isExpanded ? 'Click to close calculator' : 'Click here to get a rough estimate for your project'}
              </p>
            </div>
          </div>
          <span className={`pricing-calculator__toggle-arrow ${isExpanded ? 'pricing-calculator__toggle-arrow--expanded' : ''}`}>
            ▼
          </span>
        </button>

        {/* Expandable Calculator Content */}
        <div className={`pricing-calculator__content ${isExpanded ? 'pricing-calculator__content--expanded' : ''}`}>
          <div className="pricing-calculator__content-inner">
            <p className="pricing-calculator__disclaimer-top">
              ⚠️ This calculator provides rough estimates only. Actual pricing depends on site-specific conditions. Contact us for an official quote.
            </p>

            <div className="pricing-calculator__form">
              {/* Survey Type */}
              <div className="pricing-calculator__field pricing-calculator__field--full">
                <label className="pricing-calculator__label">Type of Survey *</label>
                <select
                  className="pricing-calculator__select"
                  value={surveyType}
                  onChange={(e) => setSurveyType(e.target.value)}
                >
                  {SURVEY_TYPES.map(survey => (
                    <option key={survey.id} value={survey.id}>
                      {survey.name} - {survey.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Acreage */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Property Size (acres) *</label>
                <input
                  type="number"
                  className="pricing-calculator__input"
                  value={acreage}
                  onChange={(e) => setAcreage(e.target.value)}
                  min="0.1"
                  max="1000"
                  step="0.1"
                  placeholder="1"
                />
              </div>

              {/* Number of Corners */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Number of Corners/Sides</label>
                <input
                  type="number"
                  className="pricing-calculator__input"
                  value={numCorners}
                  onChange={(e) => setNumCorners(e.target.value)}
                  min="3"
                  max="20"
                  step="1"
                  placeholder="4"
                />
              </div>

              {/* Property Shape */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Property Shape</label>
                <select
                  className="pricing-calculator__select"
                  value={shape}
                  onChange={(e) => setShape(e.target.value)}
                >
                  {SHAPE_COMPLEXITY.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Travel Distance */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Distance from Belton, TX (miles)</label>
                <input
                  type="number"
                  className="pricing-calculator__input"
                  value={travelDistance}
                  onChange={(e) => setTravelDistance(e.target.value)}
                  min="0"
                  max="200"
                  step="5"
                  placeholder="25"
                />
              </div>

              {/* Terrain */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Terrain Conditions</label>
                <select
                  className="pricing-calculator__select"
                  value={terrain}
                  onChange={(e) => setTerrain(e.target.value)}
                >
                  {TERRAIN_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.name} - {t.description}</option>
                  ))}
                </select>
              </div>

              {/* Access */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Property Access</label>
                <select
                  className="pricing-calculator__select"
                  value={access}
                  onChange={(e) => setAccess(e.target.value)}
                >
                  {ACCESS_TYPES.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Existing Records */}
              <div className="pricing-calculator__field">
                <label className="pricing-calculator__label">Existing Survey Records</label>
                <select
                  className="pricing-calculator__select"
                  value={records}
                  onChange={(e) => setRecords(e.target.value)}
                >
                  {RECORD_CONDITIONS.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Deliverables */}
              <div className="pricing-calculator__field pricing-calculator__field--full">
                <label className="pricing-calculator__label">Deliverables Needed</label>
                <div className="pricing-calculator__checkboxes">
                  {DELIVERABLES.map(del => (
                    <label key={del.id} className="pricing-calculator__checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedDeliverables.includes(del.id)}
                        onChange={(e) => handleDeliverableChange(del.id, e.target.checked)}
                      />
                      <span>
                        {del.name}
                        {del.fixedPrice > 0 && ` (+$${del.fixedPrice})`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rush Job */}
              <div className="pricing-calculator__field pricing-calculator__field--full">
                <label className="pricing-calculator__checkbox-label pricing-calculator__checkbox-label--rush">
                  <input
                    type="checkbox"
                    checked={rushJob}
                    onChange={(e) => setRushJob(e.target.checked)}
                  />
                  <span>⚡ Rush Job - Expedited timeline (+50% surcharge)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="pricing-calculator__buttons">
                <button
                  type="button"
                  className="pricing-calculator__btn pricing-calculator__btn--primary"
                  onClick={calculateEstimate}
                >
                  Calculate Estimate
                </button>
                <button
                  type="button"
                  className="pricing-calculator__btn pricing-calculator__btn--secondary"
                  onClick={resetCalculator}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Results */}
            {showResult && result && (
              <div className="pricing-calculator__result">
                <h3 className="pricing-calculator__result-title">💰 Your Estimate</h3>
                
                <div className="pricing-calculator__result-range">
                  <div className="pricing-calculator__result-amount">
                    <span className="pricing-calculator__result-low">${result.lowEstimate.toLocaleString()}</span>
                    <span className="pricing-calculator__result-separator">to</span>
                    <span className="pricing-calculator__result-high">${result.highEstimate.toLocaleString()}</span>
                  </div>
                  <p className="pricing-calculator__result-hours">
                    Estimated time: {result.estimatedHours.toFixed(1)} hours
                  </p>
                </div>

                <div className="pricing-calculator__result-breakdown">
                  <h4>Estimate Breakdown:</h4>
                  <ul>
                    <li>Base Labor: ${result.breakdown.baseLabor.toLocaleString()}</li>
                    <li>Travel: ${result.breakdown.travelCost.toLocaleString()}</li>
                    <li>Deliverables: ${result.breakdown.deliverableCost.toLocaleString()}</li>
                    {result.breakdown.multiplierEffect > 0 && (
                      <li>Terrain/Access Adjustments: +${result.breakdown.multiplierEffect.toLocaleString()}</li>
                    )}
                    {rushJob && <li>Rush Fee: +50%</li>}
                  </ul>
                </div>

                <div className="pricing-calculator__result-disclaimer">
                  <strong>⚠️ Important:</strong> This is a preliminary estimate only and does not constitute a quote. 
                  Actual pricing may differ based on site-specific conditions, unforeseen complications, 
                  and detailed project requirements. Prices are subject to change. 
                  Contact us for an official, binding quote.
                </div>

                <div className="pricing-calculator__result-actions">
                  <Link href="/contact" className="pricing-calculator__result-btn">
                    Get Official Quote
                  </Link>
                  <a href="tel:9366620077" className="pricing-calculator__result-btn pricing-calculator__result-btn--secondary">
                    Call (936) 662-0077
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

interface PricingService {
  title: string;
  price: string;
  turnaround: string;
  description: string;
}

interface IncludedItem {
  icon: string;
  title: string;
  description: string;
}

export default function PricingPage(): React.ReactElement {
  const services: PricingService[] = [
    { title: 'Boundary Survey', price: '$400-$1,200', turnaround: '2-4 days', description: 'Establishes property lines with professional documentation.' },
    { title: 'Topographic Survey', price: '$600-$3,000', turnaround: '3-7 days', description: 'Terrain mapping showing features and elevations.' },
    { title: 'GPS/GNSS Surveying', price: '$500-$2,000', turnaround: '3-5 days', description: 'High-precision positioning for large areas.' },
    { title: 'Construction Staking', price: '$300-$1,000', turnaround: '1-2 days', description: 'Precise control points for construction projects.' },
    { title: 'Legal Description', price: '$200-$500', turnaround: '2-3 days', description: 'Professional deed and property documentation.' },
    { title: 'GIS Mapping', price: '$800-$5,000', turnaround: '5-10 days', description: 'Digital mapping and spatial analysis.' },
  ];

  const includedItems: IncludedItem[] = [
    { icon: '📋', title: 'Free Consultation', description: 'Discuss your project needs at no cost' },
    { icon: '📄', title: 'Written Quote', description: 'Detailed pricing before work begins' },
    { icon: '🔍', title: 'Deed Research', description: 'Property records and title research' },
    { icon: '✅', title: 'Certified Results', description: 'RPLS-stamped professional documents' },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="pricing-hero">
        <div className="pricing-hero__container">
          <div className="pricing-hero__card">
            <h1 className="pricing-hero__title">
              <span className="pricing-hero__title-accent">Pricing</span>
            </h1>
            <p className="pricing-hero__subtitle">
              Competitive rates for professional surveying services in Central Texas. Transparent pricing with no hidden fees.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Disclaimer Banner */}
      <section className="pricing-disclaimer">
        <div className="pricing-disclaimer__container">
          <div className="pricing-disclaimer__icon">⚠️</div>
          <div className="pricing-disclaimer__content">
            <h3 className="pricing-disclaimer__title">Important Pricing Information</h3>
            <p className="pricing-disclaimer__text">
              The prices shown below are <strong>rough estimates only</strong> and are intended to give you a general idea of costs. 
              Actual pricing depends on property size, location, terrain complexity, and specific project requirements. 
              Prices may also change during a project if specifications or scope change. 
              <strong> Please contact us for an accurate, personalized quote.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Calculator (Collapsible) */}
      <PricingCalculator />

      {/* Pricing Grid Section */}
      <section className="pricing-grid">
        <div className="pricing-grid__container">
          <div className="pricing-grid__header">
            <h2 className="pricing-grid__title">Service Pricing</h2>
            <p className="pricing-grid__subtitle">
              Typical price ranges for our services. Your actual quote may vary based on project specifics.
            </p>
          </div>

          <div className="pricing-grid__items">
            {services.map((service: PricingService) => (
              <div key={service.title} className="pricing-card">
                <div className="pricing-card__main">
                  <div className="pricing-card__header">
                    <h3 className="pricing-card__title">{service.title}</h3>
                  </div>
                  <p className="pricing-card__desc">{service.description}</p>
                  <p className="pricing-card__turnaround">Turnaround: {service.turnaround}</p>
                </div>
                <div className="pricing-card__price-box">
                  <p className="pricing-card__price">{service.price}</p>
                  <p className="pricing-card__price-label">estimate</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pricing-grid__note">
            <p>
              * All prices are estimates and subject to change based on project specifications, 
              site conditions, and scope changes during the project.
            </p>
          </div>
        </div>
      </section>

      {/* Factors Affecting Price Section */}
      <section className="pricing-factors">
        <div className="pricing-factors__container">
          <h2 className="pricing-factors__title">What Affects Your Price?</h2>
          <div className="pricing-factors__grid">
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">📏</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Property Size</h4>
                <p className="pricing-factors__item-desc">Larger properties require more time and resources</p>
              </div>
            </div>
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">🚗</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Travel Distance</h4>
                <p className="pricing-factors__item-desc">Distance from our office affects total cost</p>
              </div>
            </div>
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">🌳</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Terrain &amp; Access</h4>
                <p className="pricing-factors__item-desc">Dense vegetation or difficult terrain adds time</p>
              </div>
            </div>
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">📑</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Deliverables</h4>
                <p className="pricing-factors__item-desc">Type and number of documents needed</p>
              </div>
            </div>
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">⏰</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Timeline</h4>
                <p className="pricing-factors__item-desc">Rush jobs may incur additional fees</p>
              </div>
            </div>
            <div className="pricing-factors__item">
              <span className="pricing-factors__item-icon">🔄</span>
              <div className="pricing-factors__item-content">
                <h4 className="pricing-factors__item-title">Scope Changes</h4>
                <p className="pricing-factors__item-desc">Changes during project may affect final price</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Volume Discount Section */}
      <section className="pricing-volume">
        <div className="pricing-volume__container">
          <div className="pricing-volume__card">
            <h2 className="pricing-volume__title">Volume Discounts Available</h2>
            <p className="pricing-volume__desc">
              For larger projects or multiple properties, we offer competitive volume pricing. Contact us to discuss your specific needs.
            </p>
            <Link href="/contact" className="pricing-volume__btn">
              Request Custom Quote
            </Link>
          </div>
        </div>
      </section>

      {/* What's Included Section */}
      <section className="pricing-included">
        <div className="pricing-included__container">
          <h2 className="pricing-included__title">What&apos;s Included</h2>
          
          <div className="pricing-included__grid">
            {includedItems.map((item: IncludedItem) => (
              <div key={item.title} className="pricing-included__item">
                <span className="pricing-included__item-icon">{item.icon}</span>
                <div className="pricing-included__item-content">
                  <h4 className="pricing-included__item-title">{item.title}</h4>
                  <p className="pricing-included__item-desc">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pricing-cta">
        <div className="pricing-cta__container">
          <h2 className="pricing-cta__title">Get Your Exact Quote</h2>
          <p className="pricing-cta__subtitle">
            The only way to get an accurate price is to contact us directly. We&apos;ll discuss your project and provide a detailed quote.
          </p>
          <div className="pricing-cta__buttons">
            <Link href="/contact" className="pricing-cta__btn pricing-cta__btn--primary">
              Request Quote
            </Link>
            <a href="tel:9366620077" className="pricing-cta__btn pricing-cta__btn--secondary">
              Call (936) 662-0077
            </a>
          </div>
        </div>
      </section>

      {/* Bottom Disclaimer */}
      <section className="pricing-bottom-disclaimer">
        <div className="pricing-bottom-disclaimer__container">
          <p className="pricing-bottom-disclaimer__text">
            <strong>Disclaimer:</strong> All pricing information on this page is provided as a general guide only 
            and does not constitute a binding quote or contract. Actual project costs may differ significantly 
            based on site-specific conditions, project requirements, and other factors. Prices are subject to 
            change without notice. Final pricing will be provided in a formal written quote after consultation. 
            Scope changes or unforeseen conditions discovered during a project may result in price adjustments.
          </p>
        </div>
      </section>
    </>
  );
}