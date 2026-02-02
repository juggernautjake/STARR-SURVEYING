// app/components/SurveyCalculator.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SURVEY_TYPES } from './surveyConfigs';
import { 
  SurveyTypeConfig, 
  FormField, 
  FieldOption, 
  ContactInfo,
  IMPROVEMENT_TYPE,
  ADDITIONAL_RESIDENCE_CORNERS,
  ADDITIONAL_RESIDENCE_SIZE,
  ESTIMATE_LOW_MULTIPLIER,
  ESTIMATE_HIGH_MULTIPLIER,
  isAdditionalResidence
} from './surveyCalculatorTypes';
import { trackConversion } from '../utils/gtag';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFieldLabel(field: FormField, value: string): string {
  if (!field.options) return value;
  const option = field.options.find((o: FieldOption) => o.value === value);
  return option?.label || value;
}

function formatFormDataForEmail(
  surveyType: SurveyTypeConfig,
  formValues: Record<string, unknown>,
  result: { lowEstimate: number; highEstimate: number; basePrice: number; hours?: number },
  rushJob: boolean
): string {
  let text = `SURVEY ESTIMATE REQUEST\n`;
  text += `========================\n\n`;
  text += `Survey Type: ${surveyType.name}\n`;
  text += `Estimated Range: $${result.lowEstimate.toLocaleString()} - $${result.highEstimate.toLocaleString()}\n`;
  if (result.hours) text += `Estimated Field Hours: ${result.hours.toFixed(1)}\n`;
  if (rushJob) text += `Rush Job: Yes (expedited requested)\n`;
  text += `\n------------------------\n`;
  text += `PROJECT DETAILS:\n`;
  text += `------------------------\n\n`;
  
  surveyType.fields.forEach((field: FormField) => {
    const value = formValues[field.id];
    if (value !== undefined && value !== '' && value !== null) {
      const label = getFieldLabel(field, value as string);
      text += `${field.label}: ${label}\n`;
    }
  });
  
  // Add dynamic improvements to email
  const numImprovements = parseInt(formValues.numImprovements as string) || 0;
  if (numImprovements > 0) {
    text += `\nOther Improvements:\n`;
    for (let i = 1; i <= numImprovements; i++) {
      const improvementType = formValues[`improvement${i}Type`] as string;
      if (improvementType && improvementType !== 'none') {
        const typeLabel = getFieldLabel({ options: IMPROVEMENT_TYPE, id: '', label: '', type: 'select', required: false }, improvementType);
        text += `  Improvement ${i}: ${typeLabel}`;
        
        if (isAdditionalResidence(improvementType)) {
          const corners = formValues[`improvement${i}Corners`] as string;
          const size = formValues[`improvement${i}Size`] as string;
          const cornersLabel = getFieldLabel({ options: ADDITIONAL_RESIDENCE_CORNERS, id: '', label: '', type: 'select', required: false }, corners);
          const sizeLabel = getFieldLabel({ options: ADDITIONAL_RESIDENCE_SIZE, id: '', label: '', type: 'select', required: false }, size);
          if (cornersLabel) text += ` - ${cornersLabel}`;
          if (sizeLabel) text += `, ${sizeLabel}`;
        }
        text += `\n`;
      }
    }
  }
  
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
  const [isLargeSubdivision, setIsLargeSubdivision] = useState<boolean>(false);
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
    basePrice: number;
    hours?: number;
  } | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const currentSurveyType = SURVEY_TYPES.find((s: SurveyTypeConfig) => s.id === selectedSurveyType);

  // Reset form when survey type changes
  useEffect(() => {
    setFormValues({});
    setRushJob(false);
    setShowResult(false);
    setIsLargeSubdivision(false);
    setShowSubmitForm(false);
    setSubmitSuccess(false);
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
    setFormValues((prev: Record<string, unknown>) => {
      const newValues = { ...prev, [fieldId]: value };
      
      // Clear dependent fields when parent changes
      if (fieldId === 'propertyType') {
        // If changing away from residential, clear residence-related fields
        if (!['residential_urban', 'residential_rural'].includes(value as string)) {
          delete newValues.hasResidence;
          delete newValues.residenceCorners;
          delete newValues.residenceSize;
          delete newValues.garage;
        }
        // Clear improvements if not residential or agricultural
        if (!['residential_urban', 'residential_rural', 'agricultural'].includes(value as string)) {
          delete newValues.numImprovements;
          // Clear all improvement fields
          for (let i = 1; i <= 8; i++) {
            delete newValues[`improvement${i}Type`];
            delete newValues[`improvement${i}Corners`];
            delete newValues[`improvement${i}Size`];
          }
        }
      }
      
      if (fieldId === 'hasResidence' && value === 'no') {
        delete newValues.residenceCorners;
        delete newValues.residenceSize;
        delete newValues.garage;
      }
      
      if (fieldId === 'numImprovements') {
        const newNum = parseInt(value as string) || 0;
        for (let i = newNum + 1; i <= 8; i++) {
          delete newValues[`improvement${i}Type`];
          delete newValues[`improvement${i}Corners`];
          delete newValues[`improvement${i}Size`];
        }
      }
      
      if (fieldId === 'fieldWork' && value === 'none') {
        delete newValues.acreage;
        delete newValues.corners;
      }
      
      if (fieldId === 'propertyCounty' && value !== 'other') {
        delete newValues.customCounty;
      }
      
      if (fieldId === 'purpose' && value !== 'city_subdivision') {
        delete newValues.lotCount;
      }
      
      return newValues;
    });
    setShowResult(false);
    setIsLargeSubdivision(false);
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

  const resetCalculator = (): void => {
    setFormValues({});
    setRushJob(false);
    setShowResult(false);
    setIsLargeSubdivision(false);
    setShowSubmitForm(false);
    setSubmitSuccess(false);
    setContactInfo({ name: '', email: '', phone: '', notes: '' });
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

    // Check for large subdivision
    if (formValues.purpose === 'city_subdivision' && formValues.lotCount === '12+') {
      setIsLargeSubdivision(true);
      setShowResult(true);
      return;
    }

    const { price, hours } = currentSurveyType.calculatePrice({ ...formValues, rush: rushJob ? 'yes' : 'no' });

    const lowEstimate = Math.round(price * ESTIMATE_LOW_MULTIPLIER);
    const highEstimate = Math.round(price * ESTIMATE_HIGH_MULTIPLIER);

    setResult({
      lowEstimate,
      highEstimate,
      basePrice: Math.round(price),
      hours,
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
      const emailBody = formatFormDataForEmail(currentSurveyType, formValues, result, rushJob);
      const fullBody = `Contact Info:\nName: ${contactInfo.name}\nEmail: ${contactInfo.email}\nPhone: ${contactInfo.phone}\nNotes: ${contactInfo.notes}\n\n${emailBody}`;

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'New Survey Estimate Request',
          text: fullBody,
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        trackConversion();
      } else {
        alert('Failed to send email. Please try again.');
      }
    } catch (error) {
      alert('Error sending email. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: FormField, index: number): JSX.Element | null => {
    if (!shouldShowField(field)) return null;

    if (field.type === 'select') {
      return (
        <div key={field.id} className={`pricing-calculator__field${field.showWhen ? ' pricing-calculator__field--conditional' : ''}`}>
          <label className="pricing-calculator__label">{field.label}{field.required ? ' *' : ''}</label>
          <select
            className="pricing-calculator__select"
            value={(formValues[field.id] as string) || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
          >
            <option value="">Select option</option>
            {field.options?.map((option: FieldOption) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.helpText && <p className="pricing-calculator__help-text">{field.helpText}</p>}
        </div>
      );
    } else if (field.type === 'number') {
      return (
        <div key={field.id} className="pricing-calculator__field">
          <label className="pricing-calculator__label">{field.label}{field.required ? ' *' : ''}</label>
          <input
            type="number"
            className="pricing-calculator__input"
            value={formValues[field.id] as number || ''}
            onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            min={field.min}
            step={field.step || 'any'}
          />
          {field.helpText && <p className="pricing-calculator__help-text">{field.helpText}</p>}
        </div>
      );
    } else if (field.type === 'text') {
      return (
        <div key={field.id} className="pricing-calculator__field">
          <label className="pricing-calculator__label">{field.label}{field.required ? ' *' : ''}</label>
          <input
            type="text"
            className="pricing-calculator__input"
            value={formValues[field.id] as string || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <p className="pricing-calculator__help-text">{field.helpText}</p>}
        </div>
      );
    } else if (field.type === 'textarea') {
      return (
        <div key={field.id} className="pricing-calculator__field pricing-calculator__field--full">
          <label className="pricing-calculator__label">{field.label}{field.required ? ' *' : ''}</label>
          <textarea
            className="pricing-calculator__input"
            value={formValues[field.id] as string || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
          />
          {field.helpText && <p className="pricing-calculator__help-text">{field.helpText}</p>}
        </div>
      );
    }
    return null;
  };

  const renderDynamicImprovements = (): JSX.Element[] => {
    const num = parseInt(formValues.numImprovements as string) || 0;
    const improvements: JSX.Element[] = [];

    for (let i = 1; i <= num; i++) {
      improvements.push(
        <div key={`improvement${i}`} className="pricing-calculator__field pricing-calculator__field--full">
          <h4 className="pricing-calculator__label">Improvement {i}</h4>
          <select
            className="pricing-calculator__select"
            value={formValues[`improvement${i}Type`] as string || ''}
            onChange={(e) => handleFieldChange(`improvement${i}Type`, e.target.value)}
          >
            <option value="">Select type</option>
            {IMPROVEMENT_TYPE.map((option: FieldOption) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isAdditionalResidence(formValues[`improvement${i}Type`] as string) && (
            <>
              <select
                className="pricing-calculator__select"
                value={formValues[`improvement${i}Corners`] as string || ''}
                onChange={(e) => handleFieldChange(`improvement${i}Corners`, e.target.value)}
              >
                <option value="">House Corners</option>
                {ADDITIONAL_RESIDENCE_CORNERS.map((option: FieldOption) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="pricing-calculator__select"
                value={formValues[`improvement${i}Size`] as string || ''}
                onChange={(e) => handleFieldChange(`improvement${i}Size`, e.target.value)}
              >
                <option value="">House Size</option>
                {ADDITIONAL_RESIDENCE_SIZE.map((option: FieldOption) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      );
    }

    return improvements;
  };

  return (
    <section className="pricing-calculator">
      <div className="pricing-calculator__container">
        {/* Toggle Header */}
        <button 
          className={`pricing-calculator__toggle ${isExpanded ? 'pricing-calculator__toggle--expanded' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="pricing-calculator__toggle-content">
            <span className="pricing-calculator__toggle-icon">🧮</span>
            <div className="pricing-calculator__toggle-text">
              <h2 className="pricing-calculator__toggle-title">Survey Pricing Calculator</h2>
              <p className="pricing-calculator__toggle-subtitle">Get a quick estimate based on your project details</p>
            </div>
          </div>
          <span className={`pricing-calculator__toggle-arrow ${isExpanded ? 'pricing-calculator__toggle-arrow--expanded' : ''}`}>▼</span>
        </button>

        {/* Expandable Content */}
        <div className={`pricing-calculator__content ${isExpanded ? 'pricing-calculator__content--expanded' : ''}`}>
          <div className="pricing-calculator__content-inner">
            <p className="pricing-calculator__disclaimer-top">
              This tool provides an approximate estimate. Final quotes may vary based on site visit and exact requirements.
            </p>

            {/* Survey Type Selection */}
            <div className="pricing-calculator__field pricing-calculator__field--full">
              <label className="pricing-calculator__label">Survey Type *</label>
              <select
                className="pricing-calculator__select"
                value={selectedSurveyType}
                onChange={(e) => setSelectedSurveyType(e.target.value)}
              >
                {SURVEY_TYPES.map((type: SurveyTypeConfig) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Form Fields */}
            <div className="pricing-calculator__form">
              {currentSurveyType?.fields.filter(shouldShowField).map((field: FormField, index: number) => renderField(field, index))}
              {renderDynamicImprovements()}
            </div>

            {/* Rush Job Checkbox */}
            <div className="pricing-calculator__field pricing-calculator__field--full">
              <div className="pricing-calculator__checkboxes">
                <label className="pricing-calculator__checkbox-label pricing-calculator__checkbox-label--rush">
                  <input 
                    type="checkbox" 
                    checked={rushJob}
                    onChange={(e) => setRushJob(e.target.checked)}
                  />
                  <span>Rush Job? (+25% expedited fee)</span>
                </label>
              </div>
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

            {/* Results */}
            {showResult && result && !isLargeSubdivision && !submitSuccess && (
              <div 
                ref={resultRef}
                className="pricing-calculator__result"
              >
                <h3 className="pricing-calculator__result-title">💰 Your Estimate</h3>

                <div className="pricing-calculator__result-range">
                  <div className="pricing-calculator__result-amount">
                    <span className="pricing-calculator__result-low">${result.lowEstimate.toLocaleString()}</span>
                    <span className="pricing-calculator__result-separator">to</span>
                    <span className="pricing-calculator__result-high">${result.highEstimate.toLocaleString()}</span>
                  </div>
                  {result.hours !== undefined && (
                    <p className="pricing-calculator__result-hours">
                      Estimated Field Hours: {result.hours.toFixed(1)}
                    </p>
                  )}
                </div>

                <div className="pricing-calculator__result-breakdown">
                  <h4>Estimate Summary:</h4>
                  <ul>
                    <li>Survey Type: {currentSurveyType?.name}</li>
                    <li>Base estimate: ${result.basePrice.toLocaleString()}</li>
                    {rushJob && <li>⚡ Rush fee (+25%): ${Math.round(result.basePrice * 0.25).toLocaleString()}</li>}
                    <li>Includes standard deliverables</li>
                  </ul>
                </div>

                <div className="pricing-calculator__result-disclaimer">
                  <strong>⚠️ Important:</strong> This is a preliminary estimate only and does not constitute a quote.
                  Actual pricing may vary based on site conditions and project requirements.
                </div>

                {!showSubmitForm ? (
                  <div className="pricing-calculator__result-actions">
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
                  <div className="pricing-calculator__contact-form">
                    <h4>Send Estimate Request</h4>
                    <p>We'll review your project and send an official quote.</p>

                    <div className="pricing-calculator__contact-grid">
                      <div>
                        <label>Name *</label>
                        <input
                          type="text"
                          value={contactInfo.name}
                          onChange={(e) => handleContactChange('name', e.target.value)}
                          placeholder="John Smith"
                        />
                      </div>
                      <div>
                        <label>Phone *</label>
                        <input
                          type="tel"
                          value={contactInfo.phone}
                          onChange={(e) => handleContactChange('phone', e.target.value)}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>

                    <label>Email *</label>
                    <input
                      type="email"
                      value={contactInfo.email}
                      onChange={(e) => handleContactChange('email', e.target.value)}
                      placeholder="john@example.com"
                    />

                    <label>Notes (Optional)</label>
                    <textarea
                      value={contactInfo.notes}
                      onChange={(e) => handleContactChange('notes', e.target.value)}
                      placeholder="Additional details..."
                      rows={4}
                    />

                    <div className="pricing-calculator__buttons">
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="pricing-calculator__btn pricing-calculator__btn--primary"
                      >
                        {isSubmitting ? 'Sending...' : 'Submit Request'}
                      </button>
                      <button
                        onClick={() => setShowSubmitForm(false)}
                        className="pricing-calculator__btn pricing-calculator__btn--secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Large Subdivision Message */}
            {showResult && isLargeSubdivision && !submitSuccess && (
              <div ref={resultRef} className="pricing-calculator__result">
                <h3 className="pricing-calculator__result-title">Large Subdivision Project</h3>
                <p className="pricing-calculator__result-disclaimer">
                  For subdivisions with more than 12 lots, please call us for more information and a custom quote.
                </p>
                <div className="pricing-calculator__result-actions">
                  <a href="tel:9366620077" className="pricing-calculator__result-btn">
                    📞 Call (936) 662-0077
                  </a>
                  <Link href="/contact" className="pricing-calculator__result-btn pricing-calculator__result-btn--secondary">
                    Contact Page
                  </Link>
                </div>
              </div>
            )}

            {/* Success Message */}
            {submitSuccess && (
              <div ref={resultRef} className="pricing-calculator__result">
                <h3 className="pricing-calculator__result-title">Request Sent!</h3>
                <p className="pricing-calculator__result-disclaimer">
                  Thank you! We'll review your details and get back to you soon.
                </p>
                <div className="pricing-calculator__result-actions">
                  <button onClick={resetCalculator} className="pricing-calculator__result-btn">
                    New Estimate
                  </button>
                  <Link href="/" className="pricing-calculator__result-btn pricing-calculator__result-btn--secondary">
                    Home Page
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}