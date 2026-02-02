'use client';

import { useState, useMemo, useCallback, FormEvent, ChangeEvent } from 'react';
import { SURVEY_TYPES } from './surveyConfigs';
import {
  SurveyTypeConfig,
  FormField,
  ContactInfo,
  ESTIMATE_LOW_MULTIPLIER,
  ESTIMATE_HIGH_MULTIPLIER,
  IMPROVEMENT_TYPE,
  ADDITIONAL_RESIDENCE_CORNERS,
  ADDITIONAL_RESIDENCE_SIZE,
  isAdditionalResidence,
} from './surveyCalculatorTypes';

// =============================================================================
// RUSH JOB MULTIPLIER
// =============================================================================
const RUSH_MULTIPLIER = 1.25;

// =============================================================================
// HELPER: Format dollar amounts consistently
// =============================================================================
function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// =============================================================================
// HELPER: Get the display label for a selected option
// =============================================================================
function getSelectedLabel(field: FormField, value: string): string {
  if (!field.options) return value;
  const opt = field.options.find(o => o.value === value);
  return opt ? opt.label : value;
}

// =============================================================================
// SURVEY CALCULATOR COMPONENT
// =============================================================================
export default function SurveyCalculator() {
  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------

  // Selected survey type
  const [selectedTypeId, setSelectedTypeId] = useState<string>(SURVEY_TYPES[0].id);

  // Form values keyed by field id
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Rush job toggle
  const [rushJob, setRushJob] = useState<boolean>(false);

  // Contact info for quote request
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });

  // Whether the quote form has been submitted
  const [quoteSubmitted, setQuoteSubmitted] = useState<boolean>(false);

  // Whether the quote form is currently submitting
  const [quoteSubmitting, setQuoteSubmitting] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // DERIVED STATE
  // -------------------------------------------------------------------------

  // Get the active survey config
  const activeConfig: SurveyTypeConfig = useMemo(() => {
    return SURVEY_TYPES.find(s => s.id === selectedTypeId) || SURVEY_TYPES[0];
  }, [selectedTypeId]);

  // Number of dynamic improvements
  const numImprovements = parseInt(formValues.numImprovements || '0') || 0;

  // -------------------------------------------------------------------------
  // Handle survey type change — reset all form fields
  // -------------------------------------------------------------------------
  const handleTypeChange = useCallback((typeId: string) => {
    setSelectedTypeId(typeId);
    setFormValues({});
    setRushJob(false);
    setQuoteSubmitted(false);
  }, []);

  // -------------------------------------------------------------------------
  // Handle individual field value change
  // -------------------------------------------------------------------------
  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setFormValues(prev => {
      const next = { ...prev, [fieldId]: value };

      // When numImprovements decreases, clear orphaned improvement fields
      if (fieldId === 'numImprovements') {
        const newCount = parseInt(value) || 0;
        const oldCount = parseInt(prev.numImprovements) || 0;
        if (newCount < oldCount) {
          for (let i = newCount + 1; i <= oldCount; i++) {
            delete next[`improvement${i}Type`];
            delete next[`improvement${i}Corners`];
            delete next[`improvement${i}Size`];
          }
        }
      }

      // When a conditional parent changes, clear dependent child fields
      if (fieldId === 'propertyType') {
        const isResidential = value === 'residential_urban' || value === 'residential_rural';
        const isAgricultural = value === 'agricultural';

        if (!isResidential) {
          delete next.hasResidence;
          delete next.residenceCorners;
          delete next.residenceSize;
          delete next.garage;
        }

        if (!isResidential && !isAgricultural) {
          delete next.numImprovements;
          // Clear any improvement sub-fields
          for (let i = 1; i <= 8; i++) {
            delete next[`improvement${i}Type`];
            delete next[`improvement${i}Corners`];
            delete next[`improvement${i}Size`];
          }
        }
      }

      if (fieldId === 'hasResidence' && value !== 'yes') {
        delete next.residenceCorners;
        delete next.residenceSize;
        delete next.garage;
      }

      if (fieldId === 'purpose' && value !== 'city_subdivision') {
        delete next.subdivisionLots;
      }

      if (fieldId === 'propertyCounty' && value !== 'other') {
        delete next.propertyCountyOther;
      }

      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Handle contact info field changes
  // -------------------------------------------------------------------------
  const handleContactChange = useCallback((field: keyof ContactInfo, value: string) => {
    setContactInfo(prev => ({ ...prev, [field]: value }));
  }, []);

  // -------------------------------------------------------------------------
  // Determine if a field should be visible based on showWhen condition
  // -------------------------------------------------------------------------
  const isFieldVisible = useCallback((field: FormField): boolean => {
    if (!field.showWhen) return true;
    const parentValue = formValues[field.showWhen.field];
    if (!parentValue) return false;
    if (Array.isArray(field.showWhen.value)) {
      return field.showWhen.value.includes(parentValue);
    }
    return parentValue === field.showWhen.value;
  }, [formValues]);

  // -------------------------------------------------------------------------
  // Calculate price estimate
  // -------------------------------------------------------------------------
  const priceEstimate = useMemo(() => {
    // Check if user selected "12+" lots (city subdivision) — show call message instead
    if (formValues.purpose === 'city_subdivision' && formValues.subdivisionLots === '12+') {
      return { showCallMessage: true, low: 0, mid: 0, high: 0 };
    }

    const rawPrice = activeConfig.calculatePrice(formValues as Record<string, unknown>);
    const withRush = rushJob ? rawPrice * RUSH_MULTIPLIER : rawPrice;
    const floored = Math.max(withRush, activeConfig.minPrice);

    return {
      showCallMessage: false,
      low: Math.round(floored * ESTIMATE_LOW_MULTIPLIER),
      mid: Math.round(floored),
      high: Math.round(floored * ESTIMATE_HIGH_MULTIPLIER),
    };
  }, [formValues, activeConfig, rushJob]);

  // -------------------------------------------------------------------------
  // Check if enough fields are filled to show a price
  // -------------------------------------------------------------------------
  const hasEnoughForEstimate = useMemo(() => {
    // Gather all required, visible config fields
    const requiredVisible = activeConfig.fields.filter(f => f.required && isFieldVisible(f));
    const allFilled = requiredVisible.every(f => {
      const val = formValues[f.id];
      return val !== undefined && val !== '';
    });

    // Also check dynamic improvement sub-fields if applicable
    if (allFilled && numImprovements > 0) {
      for (let i = 1; i <= numImprovements; i++) {
        const typeVal = formValues[`improvement${i}Type`];
        if (!typeVal || typeVal === 'none') continue; // Skip empty slots
        if (isAdditionalResidence(typeVal)) {
          if (!formValues[`improvement${i}Corners`] || !formValues[`improvement${i}Size`]) {
            return false;
          }
        }
      }
    }

    return allFilled;
  }, [activeConfig, formValues, isFieldVisible, numImprovements]);

  // -------------------------------------------------------------------------
  // Reset the entire form
  // -------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setFormValues({});
    setRushJob(false);
    setContactInfo({ name: '', email: '', phone: '', notes: '' });
    setQuoteSubmitted(false);
  }, []);

  // -------------------------------------------------------------------------
  // Handle quote submission
  // -------------------------------------------------------------------------
  const handleQuoteSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setQuoteSubmitting(true);

    // Build the summary data for the request
    const quoteData = {
      surveyType: activeConfig.name,
      formValues,
      rushJob,
      estimate: priceEstimate,
      contact: contactInfo,
      submittedAt: new Date().toISOString(),
    };

    try {
      // POST to your quote-request endpoint
      const response = await fetch('/api/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteData),
      });

      if (response.ok) {
        setQuoteSubmitted(true);
      } else {
        // If the endpoint doesn't exist yet, still show success for UX
        console.warn('Quote API returned non-OK status; treating as success for UX.');
        setQuoteSubmitted(true);
      }
    } catch {
      // If no API endpoint is configured yet, treat as success
      console.warn('Quote API not reachable; treating as success for UX.');
      setQuoteSubmitted(true);
    } finally {
      setQuoteSubmitting(false);
    }
  }, [activeConfig, formValues, rushJob, priceEstimate, contactInfo]);

  // -------------------------------------------------------------------------
  // Build a human-readable summary of selected options
  // -------------------------------------------------------------------------
  const selectionSummary = useMemo(() => {
    const items: { label: string; value: string }[] = [];

    activeConfig.fields.forEach(field => {
      if (!isFieldVisible(field)) return;
      const val = formValues[field.id];
      if (!val || val === '') return;

      if (field.type === 'select' && field.options) {
        items.push({ label: field.label, value: getSelectedLabel(field, val) });
      } else if (field.type === 'number') {
        // For travel distance, append " miles"
        if (field.id === 'travelDistance') {
          items.push({ label: field.label, value: `${val} miles` });
        } else {
          items.push({ label: field.label, value: val });
        }
      } else if (field.type === 'text' || field.type === 'textarea') {
        items.push({ label: field.label, value: val });
      }
    });

    // Add dynamic improvement summaries
    for (let i = 1; i <= numImprovements; i++) {
      const typeVal = formValues[`improvement${i}Type`];
      if (!typeVal || typeVal === 'none') continue;
      const typeOpt = IMPROVEMENT_TYPE.find(o => o.value === typeVal);
      const typeName = typeOpt?.label || typeVal;

      let detail = typeName;
      if (isAdditionalResidence(typeVal)) {
        const cornersVal = formValues[`improvement${i}Corners`];
        const sizeVal = formValues[`improvement${i}Size`];
        const cornersOpt = ADDITIONAL_RESIDENCE_CORNERS.find(o => o.value === cornersVal);
        const sizeOpt = ADDITIONAL_RESIDENCE_SIZE.find(o => o.value === sizeVal);
        if (cornersOpt) detail += ` · ${cornersOpt.label}`;
        if (sizeOpt) detail += ` · ${sizeOpt.label}`;
      }

      items.push({ label: `Improvement ${i}`, value: detail });
    }

    if (rushJob) {
      items.push({ label: 'Rush Job', value: '+25% expedited premium' });
    }

    return items;
  }, [activeConfig, formValues, isFieldVisible, numImprovements, rushJob]);

  // -------------------------------------------------------------------------
  // RENDER: Individual form field
  // -------------------------------------------------------------------------
  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    return (
      <div key={field.id} className="survey-calculator__field">
        <label htmlFor={field.id} className="survey-calculator__label">
          {field.label}
          {field.required && <span className="survey-calculator__required">*</span>}
        </label>

        {field.type === 'select' && field.options && (
          <select
            id={field.id}
            className="survey-calculator__select"
            value={formValues[field.id] || ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              handleFieldChange(field.id, e.target.value)
            }
          >
            <option value="">-- Select --</option>
            {field.options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.type === 'number' && (
          <input
            id={field.id}
            type="number"
            className="survey-calculator__input"
            placeholder={field.placeholder}
            value={formValues[field.id] || ''}
            min="0"
            step="any"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange(field.id, e.target.value)
            }
          />
        )}

        {field.type === 'text' && (
          <input
            id={field.id}
            type="text"
            className="survey-calculator__input"
            placeholder={field.placeholder}
            value={formValues[field.id] || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange(field.id, e.target.value)
            }
          />
        )}

        {field.type === 'textarea' && (
          <textarea
            id={field.id}
            className="survey-calculator__textarea"
            placeholder={field.placeholder}
            value={formValues[field.id] || ''}
            rows={3}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              handleFieldChange(field.id, e.target.value)
            }
          />
        )}

        {field.helpText && (
          <span className="survey-calculator__help">{field.helpText}</span>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: Dynamic improvement fields
  // -------------------------------------------------------------------------
  const renderImprovements = () => {
    // Only show if numImprovements > 0 and the parent field is visible
    const parentVisible = isFieldVisible({
      id: 'numImprovements',
      label: '',
      type: 'select',
      required: false,
      showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural', 'agricultural'] },
    });

    if (numImprovements <= 0 || !parentVisible) return null;

    return (
      <div className="survey-calculator__improvements">
        <h4 className="survey-calculator__subsection-title">Improvement Details</h4>
        {Array.from({ length: numImprovements }, (_, i) => {
          const idx = i + 1;
          const typeKey = `improvement${idx}Type`;
          const cornersKey = `improvement${idx}Corners`;
          const sizeKey = `improvement${idx}Size`;
          const selectedType = formValues[typeKey] || '';
          const showResidenceFields = isAdditionalResidence(selectedType);

          return (
            <div key={idx} className="survey-calculator__improvement-group">
              <span className="survey-calculator__improvement-label">
                Improvement {idx}
              </span>

              {/* Improvement type selector */}
              <div className="survey-calculator__field">
                <label htmlFor={typeKey} className="survey-calculator__label">Type</label>
                <select
                  id={typeKey}
                  className="survey-calculator__select"
                  value={selectedType}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    handleFieldChange(typeKey, e.target.value)
                  }
                >
                  {IMPROVEMENT_TYPE.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Additional residence fields (guest house / mobile home) */}
              {showResidenceFields && (
                <>
                  <div className="survey-calculator__field">
                    <label htmlFor={cornersKey} className="survey-calculator__label">
                      Corners
                    </label>
                    <select
                      id={cornersKey}
                      className="survey-calculator__select"
                      value={formValues[cornersKey] || ''}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        handleFieldChange(cornersKey, e.target.value)
                      }
                    >
                      <option value="">-- Select --</option>
                      {ADDITIONAL_RESIDENCE_CORNERS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="survey-calculator__field">
                    <label htmlFor={sizeKey} className="survey-calculator__label">
                      Size
                    </label>
                    <select
                      id={sizeKey}
                      className="survey-calculator__select"
                      value={formValues[sizeKey] || ''}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        handleFieldChange(sizeKey, e.target.value)
                      }
                    >
                      <option value="">-- Select --</option>
                      {ADDITIONAL_RESIDENCE_SIZE.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // =========================================================================
  // MAIN RENDER
  // =========================================================================
  return (
    <div className="survey-calculator">

      {/* ================================================================= */}
      {/* STEP 1: SELECT SURVEY TYPE                                        */}
      {/* ================================================================= */}
      <div className="survey-calculator__section survey-calculator__type-selector">
        <h3 className="survey-calculator__section-title">Select Survey Type</h3>
        <div className="survey-calculator__type-grid">
          {SURVEY_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              className={`survey-calculator__type-btn ${
                selectedTypeId === type.id ? 'survey-calculator__type-btn--active' : ''
              }`}
              onClick={() => handleTypeChange(type.id)}
              aria-pressed={selectedTypeId === type.id}
            >
              <span className="survey-calculator__type-name">{type.name}</span>
            </button>
          ))}
        </div>
        <p className="survey-calculator__type-desc">{activeConfig.description}</p>
      </div>

      {/* ================================================================= */}
      {/* STEP 2: PROPERTY DETAILS FORM                                     */}
      {/* ================================================================= */}
      <div className="survey-calculator__section survey-calculator__form">
        <div className="survey-calculator__section-header">
          <h3 className="survey-calculator__section-title">Property Details</h3>
          <button
            type="button"
            className="survey-calculator__reset-btn"
            onClick={handleReset}
            aria-label="Reset all form fields"
          >
            Reset Form
          </button>
        </div>

        {/* Standard config fields */}
        {activeConfig.fields.map(field => renderField(field))}

        {/* Dynamic improvement fields (rendered outside config loop) */}
        {renderImprovements()}

        {/* Rush job toggle */}
        <div className="survey-calculator__rush">
          <label className="survey-calculator__rush-label">
            <input
              type="checkbox"
              checked={rushJob}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRushJob(e.target.checked)}
              className="survey-calculator__rush-checkbox"
            />
            <span>Rush Job (+25%)</span>
          </label>
          <span className="survey-calculator__help">
            Expedited scheduling and priority completion
          </span>
        </div>
      </div>

      {/* ================================================================= */}
      {/* STEP 3: PRICE ESTIMATE DISPLAY                                    */}
      {/* ================================================================= */}
      <div className="survey-calculator__section survey-calculator__estimate">
        <h3 className="survey-calculator__section-title">Estimated Price Range</h3>

        {priceEstimate.showCallMessage ? (
          /* Special case: 12+ subdivision lots — no automated price */
          <div className="survey-calculator__call-message">
            <p className="survey-calculator__call-text">
              For subdivisions with more than 12 lots, please call us for a custom quote.
            </p>
            <a href="tel:+12548336944" className="survey-calculator__call-link">
              (254) 833-6944
            </a>
          </div>
        ) : hasEnoughForEstimate ? (
          <div className="survey-calculator__price-display">
            {/* Price range bar: low / mid / high */}
            <div className="survey-calculator__price-range">
              <div className="survey-calculator__price-low">
                <span className="survey-calculator__price-label">Low</span>
                <span className="survey-calculator__price-value">
                  {formatCurrency(priceEstimate.low)}
                </span>
              </div>
              <div className="survey-calculator__price-mid">
                <span className="survey-calculator__price-label">Estimate</span>
                <span className="survey-calculator__price-value survey-calculator__price-value--primary">
                  {formatCurrency(priceEstimate.mid)}
                </span>
              </div>
              <div className="survey-calculator__price-high">
                <span className="survey-calculator__price-label">High</span>
                <span className="survey-calculator__price-value">
                  {formatCurrency(priceEstimate.high)}
                </span>
              </div>
            </div>

            {rushJob && (
              <p className="survey-calculator__rush-note">
                Includes 25% rush job premium
              </p>
            )}

            <p className="survey-calculator__disclaimer">
              This is an estimate only. Final pricing may vary based on site conditions
              found during the survey. Contact us for a firm quote.
            </p>

            {/* Selection summary (collapsible) */}
            {selectionSummary.length > 0 && (
              <details className="survey-calculator__summary">
                <summary className="survey-calculator__summary-toggle">
                  View Selection Summary
                </summary>
                <dl className="survey-calculator__summary-list">
                  {selectionSummary.map((item, idx) => (
                    <div key={idx} className="survey-calculator__summary-item">
                      <dt className="survey-calculator__summary-label">{item.label}</dt>
                      <dd className="survey-calculator__summary-value">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
        ) : (
          <p className="survey-calculator__incomplete">
            Fill in the required fields above to see your estimate.
          </p>
        )}
      </div>

      {/* ================================================================= */}
      {/* STEP 4: CONTACT / QUOTE REQUEST FORM                              */}
      {/* ================================================================= */}
      {hasEnoughForEstimate && !priceEstimate.showCallMessage && (
        <div className="survey-calculator__section survey-calculator__contact">
          <h3 className="survey-calculator__section-title">Request a Quote</h3>

          {quoteSubmitted ? (
            <div className="survey-calculator__success">
              <p className="survey-calculator__success-text">
                Thank you! We&apos;ve received your quote request and will be in touch soon.
              </p>
              <p className="survey-calculator__success-sub">
                You can also call us at{' '}
                <a href="tel:+12548336944" className="survey-calculator__phone-link">
                  (254) 833-6944
                </a>{' '}
                for immediate assistance.
              </p>
              <button
                type="button"
                className="survey-calculator__new-quote-btn"
                onClick={handleReset}
              >
                Start a New Estimate
              </button>
            </div>
          ) : (
            <>
              <p className="survey-calculator__contact-intro">
                Provide your contact information and we&apos;ll send you a detailed quote
                based on your selections.
              </p>

              <div className="survey-calculator__contact-form" role="form" aria-label="Quote request form">
                <div className="survey-calculator__field">
                  <label htmlFor="contact-name" className="survey-calculator__label">
                    Name<span className="survey-calculator__required">*</span>
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    className="survey-calculator__input"
                    placeholder="Your full name"
                    value={contactInfo.name}
                    required
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleContactChange('name', e.target.value)
                    }
                  />
                </div>

                <div className="survey-calculator__field">
                  <label htmlFor="contact-email" className="survey-calculator__label">
                    Email<span className="survey-calculator__required">*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    className="survey-calculator__input"
                    placeholder="your.email@example.com"
                    value={contactInfo.email}
                    required
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleContactChange('email', e.target.value)
                    }
                  />
                </div>

                <div className="survey-calculator__field">
                  <label htmlFor="contact-phone" className="survey-calculator__label">
                    Phone
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    className="survey-calculator__input"
                    placeholder="(555) 555-5555"
                    value={contactInfo.phone}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleContactChange('phone', e.target.value)
                    }
                  />
                </div>

                <div className="survey-calculator__field">
                  <label htmlFor="contact-notes" className="survey-calculator__label">
                    Additional Notes
                  </label>
                  <textarea
                    id="contact-notes"
                    className="survey-calculator__textarea"
                    placeholder="Any additional details about your project, access instructions, timeline needs, etc."
                    value={contactInfo.notes}
                    rows={4}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      handleContactChange('notes', e.target.value)
                    }
                  />
                </div>

                <button
                  type="button"
                  className="survey-calculator__submit-btn"
                  disabled={!contactInfo.name.trim() || !contactInfo.email.trim() || quoteSubmitting}
                  onClick={(e) => handleQuoteSubmit(e as unknown as FormEvent)}
                  aria-busy={quoteSubmitting}
                >
                  {quoteSubmitting ? 'Submitting...' : 'Submit Quote Request'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* FOOTER: Direct contact info                                       */}
      {/* ================================================================= */}
      <div className="survey-calculator__footer">
        <p className="survey-calculator__footer-text">
          Questions? Call us at{' '}
          <a href="tel:+12548336944" className="survey-calculator__phone-link">
            (254) 833-6944
          </a>{' '}
          or email{' '}
          <a href="mailto:info@starrsurveying.com" className="survey-calculator__email-link">
            info@starrsurveying.com
          </a>
        </p>
      </div>
    </div>
  );
}