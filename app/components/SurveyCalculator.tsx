'use client';

import { useState, useMemo, useCallback } from 'react';
import { SURVEY_TYPES } from './surveyConfigs';
import {
  SurveyTypeConfig,
  FormField,
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
// SURVEY CALCULATOR COMPONENT
// =============================================================================
export default function SurveyCalculator() {
  // Selected survey type
  const [selectedTypeId, setSelectedTypeId] = useState<string>(SURVEY_TYPES[0].id);

  // Form values keyed by field id
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Rush job toggle
  const [rushJob, setRushJob] = useState<boolean>(false);

  // Get the active survey config
  const activeConfig: SurveyTypeConfig = useMemo(() => {
    return SURVEY_TYPES.find(s => s.id === selectedTypeId) || SURVEY_TYPES[0];
  }, [selectedTypeId]);

  // -------------------------------------------------------------------------
  // Handle survey type change — reset all form fields
  // -------------------------------------------------------------------------
  const handleTypeChange = useCallback((typeId: string) => {
    setSelectedTypeId(typeId);
    setFormValues({});
    setRushJob(false);
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
      // e.g., changing propertyType away from residential clears hasResidence, etc.
      if (fieldId === 'propertyType') {
        const isResidential = value === 'residential_urban' || value === 'residential_rural';
        if (!isResidential) {
          delete next.hasResidence;
          delete next.residenceCorners;
          delete next.residenceSize;
          delete next.garage;
          delete next.numImprovements;
          // Clear any improvement sub-fields
          for (let i = 1; i <= 8; i++) {
            delete next[`improvement${i}Type`];
            delete next[`improvement${i}Corners`];
            delete next[`improvement${i}Size`];
          }
        }
        // Agricultural also gets improvements
        if (value === 'agricultural') {
          // Keep numImprovements but clear residence fields
          delete next.hasResidence;
          delete next.residenceCorners;
          delete next.residenceSize;
          delete next.garage;
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
    const requiredVisible = activeConfig.fields.filter(f => f.required && isFieldVisible(f));
    return requiredVisible.every(f => {
      const val = formValues[f.id];
      return val !== undefined && val !== '';
    });
  }, [activeConfig, formValues, isFieldVisible]);

  // -------------------------------------------------------------------------
  // Dynamic improvement fields
  // -------------------------------------------------------------------------
  const numImprovements = parseInt(formValues.numImprovements || '0') || 0;

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <div className="survey-calculator">
      {/* Survey type selector */}
      <div className="survey-calculator__type-selector">
        <h3 className="survey-calculator__section-title">Select Survey Type</h3>
        <div className="survey-calculator__type-grid">
          {SURVEY_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              className={`survey-calculator__type-btn ${selectedTypeId === type.id ? 'survey-calculator__type-btn--active' : ''}`}
              onClick={() => handleTypeChange(type.id)}
            >
              <span className="survey-calculator__type-name">{type.name}</span>
            </button>
          ))}
        </div>
        <p className="survey-calculator__type-desc">{activeConfig.description}</p>
      </div>

      {/* Form fields */}
      <div className="survey-calculator__form">
        <h3 className="survey-calculator__section-title">Property Details</h3>

        {activeConfig.fields.map(field => {
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
                  onChange={e => handleFieldChange(field.id, e.target.value)}
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
                  onChange={e => handleFieldChange(field.id, e.target.value)}
                />
              )}

              {field.type === 'text' && (
                <input
                  id={field.id}
                  type="text"
                  className="survey-calculator__input"
                  placeholder={field.placeholder}
                  value={formValues[field.id] || ''}
                  onChange={e => handleFieldChange(field.id, e.target.value)}
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  id={field.id}
                  className="survey-calculator__textarea"
                  placeholder={field.placeholder}
                  value={formValues[field.id] || ''}
                  rows={3}
                  onChange={e => handleFieldChange(field.id, e.target.value)}
                />
              )}

              {field.helpText && (
                <span className="survey-calculator__help">{field.helpText}</span>
              )}
            </div>
          );
        })}

        {/* ============================================================= */}
        {/* DYNAMIC IMPROVEMENT FIELDS                                     */}
        {/* Rendered outside the config fields loop because they're        */}
        {/* generated dynamically based on numImprovements value           */}
        {/* ============================================================= */}
        {numImprovements > 0 && isFieldVisible({
          id: 'numImprovements',
          label: '',
          type: 'select',
          required: false,
          showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural', 'agricultural'] },
        }) && (
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

                  {/* Type selector */}
                  <div className="survey-calculator__field">
                    <label htmlFor={typeKey} className="survey-calculator__label">Type</label>
                    <select
                      id={typeKey}
                      className="survey-calculator__select"
                      value={selectedType}
                      onChange={e => handleFieldChange(typeKey, e.target.value)}
                    >
                      {IMPROVEMENT_TYPE.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Additional residence corners (if guest house / mobile home) */}
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
                          onChange={e => handleFieldChange(cornersKey, e.target.value)}
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
                          onChange={e => handleFieldChange(sizeKey, e.target.value)}
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
        )}

        {/* Rush job toggle */}
        <div className="survey-calculator__rush">
          <label className="survey-calculator__rush-label">
            <input
              type="checkbox"
              checked={rushJob}
              onChange={e => setRushJob(e.target.checked)}
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
      {/* PRICE ESTIMATE DISPLAY                                             */}
      {/* ================================================================= */}
      <div className="survey-calculator__estimate">
        <h3 className="survey-calculator__section-title">Estimated Price Range</h3>

        {priceEstimate.showCallMessage ? (
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
            <div className="survey-calculator__price-range">
              <div className="survey-calculator__price-low">
                <span className="survey-calculator__price-label">Low</span>
                <span className="survey-calculator__price-value">
                  ${priceEstimate.low.toLocaleString()}
                </span>
              </div>
              <div className="survey-calculator__price-mid">
                <span className="survey-calculator__price-label">Estimate</span>
                <span className="survey-calculator__price-value survey-calculator__price-value--primary">
                  ${priceEstimate.mid.toLocaleString()}
                </span>
              </div>
              <div className="survey-calculator__price-high">
                <span className="survey-calculator__price-label">High</span>
                <span className="survey-calculator__price-value">
                  ${priceEstimate.high.toLocaleString()}
                </span>
              </div>
            </div>
            {rushJob && (
              <p className="survey-calculator__rush-note">
                Includes 25% rush job premium
              </p>
            )}
            <p className="survey-calculator__disclaimer">
              This is an estimate only. Final pricing may vary based on site conditions found during the survey.
              Contact us for a firm quote.
            </p>
          </div>
        ) : (
          <p className="survey-calculator__incomplete">
            Fill in the required fields above to see your estimate.
          </p>
        )}
      </div>
    </div>
  );
}