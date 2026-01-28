'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SURVEY_TYPES } from './surveyConfigs';
import { 
  SurveyTypeConfig, 
  FormField, 
  FieldOption, 
  ContactInfo, 
  HOURLY_RATE, 
  MILEAGE_RATE, 
  TRAVEL_SPEED_AVG 
} from './surveyCalculatorTypes';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFieldLabel(surveyType: SurveyTypeConfig, fieldId: string, value: string): string {
  const field = surveyType.fields.find((f: FormField) => f.id === fieldId);
  if (!field) return value;
  if (field.options) {
    const option = field.options.find((o: FieldOption) => o.value === value);
    return option?.label || value;
  }
  return value;
}

function formatFormDataForEmail(
  surveyType: SurveyTypeConfig,
  formValues: Record<string, unknown>,
  result: { lowEstimate: number; highEstimate: number; estimatedHours: number },
  rushJob: boolean
): string {
  let text = `SURVEY ESTIMATE REQUEST\n`;
  text += `========================\n\n`;
  text += `Survey Type: ${surveyType.name}\n`;
  text += `Estimated Range: $${result.lowEstimate.toLocaleString()} - $${result.highEstimate.toLocaleString()}\n`;
  text += `Estimated Hours: ${result.estimatedHours.toFixed(1)}\n`;
  if (rushJob) text += `Rush Job: Yes (expedited requested)\n`;
  text += `\n------------------------\n`;
  text += `PROJECT DETAILS:\n`;
  text += `------------------------\n\n`;
  
  surveyType.fields.forEach((field: FormField) => {
    const value = formValues[field.id];
    if (value !== undefined && value !== '' && value !== null) {
      const label = field.options 
        ? getFieldLabel(surveyType, field.id, value as string)
        : value;
      text += `${field.label}: ${label}\n`;
    }
  });
  
  return text;
}

// =============================================================================
// CALCULATOR COMPONENT
// =============================================================================

export default function SurveyCalculator() {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedSurveyType, setSelectedSurveyType] = useState<string>('boundary');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [rushJob, setRushJob] = useState<boolean>(false);
  const [showResult, setShowResult] = useState<boolean>(false);
  const [showSubmitForm, setShowSubmitForm] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [result, setResult] = useState<{
    lowEstimate: number;
    highEstimate: number;
    estimatedHours: number;
    travelCost: number;
  } | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const currentSurveyType = SURVEY_TYPES.find((s: SurveyTypeConfig) => s.id === selectedSurveyType);

  // Reset form when survey type changes
  useEffect(() => {
    setFormValues({});
    setShowResult(false);
    setShowSubmitForm(false);
    setSubmitSuccess(false);
    setResult(null);
  }, [selectedSurveyType]);

  // Scroll to results when they appear
  useEffect(() => {
    if (showResult && resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [showResult]);

  const handleFieldChange = (fieldId: string, value: unknown): void => {
    setFormValues((prev: Record<string, unknown>) => ({ ...prev, [fieldId]: value }));
    setShowResult(false);
    setShowSubmitForm(false);
  };

  const handleContactChange = (field: keyof ContactInfo, value: string): void => {
    setContactInfo((prev: ContactInfo) => ({ ...prev, [field]: value }));
  };

  const shouldShowField = (field: FormField): boolean => {
    if (!field.showWhen) return true;
    const currentValue = formValues[field.showWhen.field];
    if (Array.isArray(field.showWhen.value)) {
      return field.showWhen.value.includes(currentValue as string);
    }
    return currentValue === field.showWhen.value;
  };

  const calculateEstimate = (): void => {
    if (!currentSurveyType) return;

    const missingRequired = currentSurveyType.fields.filter(
      (f: FormField) => f.required && shouldShowField(f) && !formValues[f.id]
    );
    if (missingRequired.length > 0) {
      alert(`Please fill in required fields:\n\n• ${missingRequired.map((f: FormField) => f.label).join('\n• ')}`);
      return;
    }

    const estimatedHours = currentSurveyType.calculateHours(formValues);

    // Travel calculation
    const travelDistanceValue = parseFloat(formValues.travelDistance as string) || 0;
    const travelTimeHours = (travelDistanceValue / TRAVEL_SPEED_AVG) * 2;
    const travelMileageCost = travelDistanceValue * MILEAGE_RATE * 2;
    const travelLaborCost = travelTimeHours * (HOURLY_RATE * 0.5);
    const totalTravelCost = travelMileageCost + travelLaborCost;

    let baseCost = (estimatedHours * HOURLY_RATE) + totalTravelCost;

    // Rush multiplier (25% for rush jobs)
    if (rushJob) baseCost *= 1.25;

    const finalCost = Math.max(baseCost, currentSurveyType.minPrice);
    const lowEstimate = Math.round(finalCost * 0.9);
    const highEstimate = Math.round(finalCost * 1.1);

    setResult({
      lowEstimate,
      highEstimate,
      estimatedHours: estimatedHours + travelTimeHours,
      travelCost: Math.round(totalTravelCost),
    });
    setShowResult(true);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!contactInfo.name.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (!contactInfo.email.trim() || !contactInfo.email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    if (!contactInfo.phone.trim() || contactInfo.phone.replace(/\D/g, '').length < 10) {
      alert('Please enter a valid phone number.');
      return;
    }
    if (!currentSurveyType || !result) return;

    setIsSubmitting(true);

    try {
      const formData = formatFormDataForEmail(currentSurveyType, formValues, result, rushJob);
      
      let emailBody = `NEW SURVEY ESTIMATE REQUEST\n\n`;
      emailBody += `CONTACT INFORMATION:\n`;
      emailBody += `Name: ${contactInfo.name}\n`;
      emailBody += `Email: ${contactInfo.email}\n`;
      emailBody += `Phone: ${contactInfo.phone}\n\n`;
      
      if (contactInfo.notes.trim()) {
        emailBody += `ADDITIONAL NOTES:\n${contactInfo.notes}\n\n`;
      }
      
      emailBody += formData;
      emailBody += `\n\nSubmitted: ${new Date().toLocaleString()}`;

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactInfo.name,
          email: contactInfo.email,
          phone: contactInfo.phone,
          subject: `Survey Estimate Request - ${currentSurveyType.name}`,
          message: emailBody,
          source: 'pricing-calculator',
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed');
      }
    } catch {
      // Fallback to mailto
      const mailtoSubject = encodeURIComponent(`Survey Estimate Request - ${currentSurveyType.name}`);
      const mailtoBody = encodeURIComponent(
        `Contact: ${contactInfo.name}\nEmail: ${contactInfo.email}\nPhone: ${contactInfo.phone}\n\n` +
        (contactInfo.notes ? `Notes: ${contactInfo.notes}\n\n` : '') +
        formatFormDataForEmail(currentSurveyType, formValues, result, rushJob)
      );
      window.location.href = `mailto:info@starrsurveying.com?subject=${mailtoSubject}&body=${mailtoBody}`;
      setSubmitSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCalculator = (): void => {
    setFormValues({});
    setRushJob(false);
    setShowResult(false);
    setShowSubmitForm(false);
    setSubmitSuccess(false);
    setResult(null);
    setContactInfo({ name: '', email: '', phone: '', notes: '' });
  };

  return (
    <section className="pricing-calculator">
      <div className="pricing-calculator__container">
        {/* Toggle Button */}
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

        {/* Expandable Content - KEY FIX: Added inline styles to ensure full height */}
        <div 
          className={`pricing-calculator__content ${isExpanded ? 'pricing-calculator__content--expanded' : ''}`}
          style={isExpanded ? { 
            maxHeight: 'none', 
            height: 'auto', 
            overflow: 'visible',
            display: 'block'
          } : undefined}
        >
          <div 
            className="pricing-calculator__content-inner"
            style={{ overflow: 'visible', maxHeight: 'none' }}
          >
            <p className="pricing-calculator__disclaimer-top">
              ⚠️ This calculator provides rough estimates only. Actual pricing depends on site-specific conditions. Contact us for an official quote.
            </p>

            <div className="pricing-calculator__form">
              {/* Survey Type Selection */}
              <div className="pricing-calculator__field pricing-calculator__field--full">
                <label className="pricing-calculator__label">Type of Survey *</label>
                <select
                  className="pricing-calculator__select"
                  value={selectedSurveyType}
                  onChange={(e) => setSelectedSurveyType(e.target.value)}
                >
                  {SURVEY_TYPES.map((survey: SurveyTypeConfig) => (
                    <option key={survey.id} value={survey.id}>{survey.name}</option>
                  ))}
                </select>
                {currentSurveyType && (
                  <p style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    {currentSurveyType.description}
                  </p>
                )}
              </div>

              {/* Dynamic Fields */}
              {currentSurveyType?.fields.map((field: FormField) => {
                if (!shouldShowField(field)) return null;

                const isFullWidth = field.type === 'textarea' || 
                  field.id === 'propertyAddress' || 
                  field.id === 'startLocation' || 
                  field.id === 'endLocation';

                return (
                  <div
                    key={field.id}
                    className={`pricing-calculator__field ${isFullWidth ? 'pricing-calculator__field--full' : ''}`}
                  >
                    <label className="pricing-calculator__label">
                      {field.label} {field.required && '*'}
                    </label>

                    {field.type === 'select' && (
                      <select
                        className="pricing-calculator__select"
                        value={(formValues[field.id] as string) || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        {field.options?.map((opt: FieldOption) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}

                    {field.type === 'text' && (
                      <input
                        type="text"
                        className="pricing-calculator__input"
                        value={(formValues[field.id] as string) || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}

                    {field.type === 'number' && (
                      <input
                        type="number"
                        className="pricing-calculator__input"
                        value={(formValues[field.id] as number) || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}

                    {field.type === 'textarea' && (
                      <textarea
                        className="pricing-calculator__input"
                        value={(formValues[field.id] as string) || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                        style={{ resize: 'vertical', minHeight: '80px' }}
                      />
                    )}

                    {field.helpText && (
                      <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                        {field.helpText}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Rush Job Option */}
              <div className="pricing-calculator__field pricing-calculator__field--full">
                <label className="pricing-calculator__checkbox-label pricing-calculator__checkbox-label--rush">
                  <input
                    type="checkbox"
                    checked={rushJob}
                    onChange={(e) => {
                      setRushJob(e.target.checked);
                      setShowResult(false);
                      setShowSubmitForm(false);
                    }}
                  />
                  <span>⚡ Rush Job - Need expedited timeline (rush fees vary based on schedule and availability - discuss when requesting quote)</span>
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

            {/* Results - KEY FIX: Added ref for scrolling and explicit visibility */}
            {showResult && result && !submitSuccess && (
              <div 
                ref={resultRef}
                className="pricing-calculator__result"
                style={{ 
                  display: 'block', 
                  visibility: 'visible', 
                  opacity: 1,
                  overflow: 'visible',
                  marginTop: '2rem'
                }}
              >
                <h3 className="pricing-calculator__result-title">💰 Your Estimate</h3>

                <div className="pricing-calculator__result-range">
                  <div className="pricing-calculator__result-amount">
                    <span className="pricing-calculator__result-low">${result.lowEstimate.toLocaleString()}</span>
                    <span className="pricing-calculator__result-separator">to</span>
                    <span className="pricing-calculator__result-high">${result.highEstimate.toLocaleString()}</span>
                  </div>
                  <p className="pricing-calculator__result-hours">
                    Estimated time: {result.estimatedHours.toFixed(1)} hours (including travel)
                  </p>
                </div>

                <div className="pricing-calculator__result-breakdown">
                  <h4>Estimate Summary:</h4>
                  <ul>
                    <li>Survey Type: {currentSurveyType?.name}</li>
                    <li>Travel included: ${result.travelCost.toLocaleString()}</li>
                    {rushJob && <li>⚡ Rush fee: To be discussed based on timeline</li>}
                    <li>Includes standard deliverables</li>
                  </ul>
                </div>

                <div className="pricing-calculator__result-disclaimer">
                  <strong>⚠️ Important:</strong> This is a preliminary estimate only and does not constitute a quote.
                  Actual pricing may vary based on site conditions and project requirements.
                </div>

                {/* Submit Form Toggle */}
                {!showSubmitForm ? (
                  <div className="pricing-calculator__result-actions" style={{ marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      className="pricing-calculator__result-btn"
                      onClick={() => setShowSubmitForm(true)}
                    >
                      📧 Send This Estimate & Request Quote
                    </button>
                    <a href="tel:9366620077" className="pricing-calculator__result-btn pricing-calculator__result-btn--secondary">
                      📞 Call (936) 662-0077
                    </a>
                  </div>
                ) : (
                  /* Contact Info Form */
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1.5rem',
                    background: '#F8F9FA',
                    borderRadius: '10px',
                    border: '2px solid #1D3095'
                  }}>
                    <h4 style={{ 
                      fontFamily: 'Sora, sans-serif', 
                      fontSize: '1.1rem', 
                      fontWeight: 600, 
                      color: '#1D3095',
                      marginBottom: '1rem'
                    }}>
                      📧 Send Estimate Request
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: '#4B5563', marginBottom: '1rem' }}>
                      We&apos;ll review your project details and send you an official quote.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label className="pricing-calculator__label">Your Name *</label>
                        <input
                          type="text"
                          className="pricing-calculator__input"
                          value={contactInfo.name}
                          onChange={(e) => handleContactChange('name', e.target.value)}
                          placeholder="John Smith"
                          style={{ marginBottom: 0 }}
                        />
                      </div>
                      <div>
                        <label className="pricing-calculator__label">Phone Number *</label>
                        <input
                          type="tel"
                          className="pricing-calculator__input"
                          value={contactInfo.phone}
                          onChange={(e) => handleContactChange('phone', e.target.value)}
                          placeholder="(555) 123-4567"
                          style={{ marginBottom: 0 }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <label className="pricing-calculator__label">Email Address *</label>
                      <input
                        type="email"
                        className="pricing-calculator__input"
                        value={contactInfo.email}
                        onChange={(e) => handleContactChange('email', e.target.value)}
                        placeholder="john@example.com"
                        style={{ marginBottom: 0 }}
                      />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <label className="pricing-calculator__label">Additional Notes (Optional)</label>
                      <textarea
                        className="pricing-calculator__input"
                        value={contactInfo.notes}
                        onChange={(e) => handleContactChange('notes', e.target.value)}
                        placeholder="Any additional details, questions, or scheduling preferences..."
                        rows={4}
                        style={{ marginBottom: 0, resize: 'vertical', minHeight: '100px' }}
                      />
                    </div>

                    <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="pricing-calculator__btn pricing-calculator__btn--primary"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        style={{ flex: 1, minWidth: '200px' }}
                      >
                        {isSubmitting ? 'Sending...' : '✉️ Submit Request'}
                      </button>
                      <button
                        type="button"
                        className="pricing-calculator__btn pricing-calculator__btn--secondary"
                        onClick={() => setShowSubmitForm(false)}
                        style={{ flex: 1, minWidth: '150px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Success Message */}
            {submitSuccess && (
              <div 
                ref={resultRef}
                className="pricing-calculator__result" 
                style={{ 
                  background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                  border: '2px solid #10B981',
                  marginTop: '2rem'
                }}
              >
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>✅</span>
                  <h3 style={{ 
                    fontFamily: 'Sora, sans-serif', 
                    fontSize: '1.5rem', 
                    fontWeight: 700, 
                    color: '#065F46',
                    marginBottom: '0.75rem'
                  }}>
                    Request Sent Successfully!
                  </h3>
                  <p style={{ color: '#047857', marginBottom: '1.5rem' }}>
                    Thank you! We&apos;ll review your project and get back to you within 1-2 business days.
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="pricing-calculator__result-btn"
                      onClick={resetCalculator}
                      style={{ background: '#10B981' }}
                    >
                      Start New Estimate
                    </button>
                    <Link href="/contact" className="pricing-calculator__result-btn pricing-calculator__result-btn--secondary">
                      Contact Page
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}