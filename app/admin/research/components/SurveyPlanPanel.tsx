// app/admin/research/components/SurveyPlanPanel.tsx
// AI-generated field survey plan — plain-English guide for the surveyor
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SurveyPlan, SurveyPlanItem } from '@/lib/research/survey-plan.service';

interface SurveyPlanPanelProps {
  projectId: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ level, notes }: { level: number; notes: string }) {
  const color = level >= 80 ? '#059669' : level >= 60 ? '#D97706' : level >= 40 ? '#F97316' : '#DC2626';
  const label = level >= 80 ? 'High Confidence' : level >= 60 ? 'Good Confidence' : level >= 40 ? 'Limited Data' : 'Minimal Data';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 700, color, fontSize: '0.9rem' }}>{level}% — {label}</span>
      </div>
      <span style={{ color: '#6B7280', fontSize: '0.82rem', flex: 1 }}>{notes}</span>
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #E5E7EB' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{title}</h3>
    </div>
  );
}

function ChecklistItem({ item, onToggle }: { item: SurveyPlanItem & { id: string }; onToggle: (id: string) => void }) {
  const priorityColors: Record<string, string> = {
    critical: '#DC2626',
    important: '#D97706',
    nice_to_have: '#6B7280',
  };
  const priorityLabels: Record<string, string> = {
    critical: 'Critical',
    important: 'Important',
    nice_to_have: 'Nice to Have',
  };
  const priorityKey = item.priority || 'nice_to_have';

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.75rem',
        borderRadius: 6,
        background: item.done ? '#F0FDF4' : '#FAFAFA',
        border: `1px solid ${item.done ? '#BBF7D0' : '#E5E7EB'}`,
        marginBottom: '0.5rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onClick={() => onToggle(item.id)}
      role="checkbox"
      aria-checked={item.done}
      tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(item.id); } }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 4,
          border: `2px solid ${item.done ? '#059669' : '#D1D5DB'}`,
          background: item.done ? '#059669' : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {item.done && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {item.priority && (
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, padding: '0 6px',
              borderRadius: 10, background: `${priorityColors[priorityKey]}18`,
              color: priorityColors[priorityKey], flexShrink: 0, lineHeight: '1.6',
            }}>
              {priorityLabels[priorityKey]}
            </span>
          )}
          <span style={{ fontSize: '0.875rem', color: item.done ? '#6B7280' : '#111827', textDecoration: item.done ? 'line-through' : 'none', fontWeight: 500 }}>
            {item.task}
          </span>
        </div>
        {item.why && !item.done && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6B7280', fontStyle: 'italic' }}>
            Why: {item.why}
          </div>
        )}
      </div>
    </div>
  );
}

function DataSourceList({ sources }: { sources: SurveyPlan['data_sources_used'] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div>
      {sources.map((s, i) => (
        <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <span style={{ color: '#9CA3AF', fontSize: '0.8rem', flexShrink: 0, marginTop: 2 }}>🔗</span>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>
                  {s.source}
                </a>
              ) : s.source}
            </div>
            {s.data_obtained && (
              <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{s.data_obtained}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#FEE2E2', text: '#DC2626' },
    high:     { bg: '#FEF3C7', text: '#D97706' },
    medium:   { bg: '#FEF9C3', text: '#CA8A04' },
    low:      { bg: '#F0FDF4', text: '#059669' },
  };
  const c = colors[severity] || colors.low;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.text }}>
      {severity.toUpperCase()}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SurveyPlanPanel({ projectId }: SurveyPlanPanelProps) {
  const [plan, setPlan] = useState<SurveyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<string>('summary');

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/survey-plan`);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as SurveyPlan;
      setPlan(data);
      // Initialize checklist state (all unchecked unless persisted)
      const initial: Record<string, boolean> = {};
      data.pre_field_research?.items?.forEach((item, i) => {
        const id = `pre_${i}`;
        initial[id] = item.done || false;
      });
      setChecklistState(prev => ({ ...initial, ...prev })); // keep any user-toggled state
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load survey plan');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  function toggleItem(id: string) {
    setChecklistState(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
        Generating field survey plan…
        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#9CA3AF' }}>
          This may take up to 30 seconds on first load.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#DC2626' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
        <strong>Could not generate plan:</strong> {error}
        <br />
        <button
          onClick={() => void loadPlan()}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!plan) return null;

  const sections = [
    { key: 'summary',      label: '📋 Summary',         title: 'Property Summary' },
    { key: 'research',     label: '🔍 Pre-Field',        title: 'Pre-Field Research Checklist' },
    { key: 'equipment',    label: '🧰 Equipment',        title: 'Equipment & Supplies' },
    { key: 'field',        label: '📏 Field Steps',      title: 'Field Procedures' },
    { key: 'monuments',    label: '⬤ Monuments',        title: 'Monument Recovery Strategy' },
    { key: 'boundary',     label: '🗺️ Boundary',         title: 'Boundary Reconstruction' },
    { key: 'discrepancies',label: '⚠️ Discrepancies',    title: 'Discrepancies to Investigate' },
    { key: 'sources',      label: '🔗 Sources',          title: 'Data Sources & Links' },
    { key: 'schedule',     label: '📅 Schedule',         title: 'Office-to-Field Timeline' },
    { key: 'nextsteps',    label: '🚀 Next Steps',       title: 'Next Steps & Setup' },
  ];

  const completedPre = (plan.pre_field_research?.items || []).filter((_, i) => checklistState[`pre_${i}`]).length;
  const totalPre = plan.pre_field_research?.items?.length || 0;

  return (
    <div style={{ display: 'flex', gap: '1rem', height: '100%', minHeight: 600 }}>
      {/* Sidebar nav */}
      <div style={{ width: 180, flexShrink: 0 }}>
        <div style={{ position: 'sticky', top: 0 }}>
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.5rem 0.75rem', borderRadius: 6, border: 'none',
                background: activeSection === s.key ? '#EFF6FF' : 'transparent',
                color: activeSection === s.key ? '#1D4ED8' : '#374151',
                fontWeight: activeSection === s.key ? 700 : 400,
                fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.1rem',
              }}
            >
              {s.label}
              {s.key === 'research' && totalPre > 0 && (
                <span style={{ float: 'right', fontSize: '0.7rem', color: '#6B7280' }}>
                  {completedPre}/{totalPre}
                </span>
              )}
            </button>
          ))}
          <div style={{ marginTop: '1rem', borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem' }}>
            <button
              onClick={() => void loadPlan()}
              style={{ display: 'block', width: '100%', padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              ↻ Refresh Plan
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 700 }}>
        <ConfidenceBadge level={plan.confidence_level} notes={plan.confidence_notes} />

        {/* Summary */}
        {activeSection === 'summary' && (
          <div>
            <SectionHeader title="Property Summary" icon="📋" />
            <p style={{ fontSize: '1rem', lineHeight: 1.7, color: '#111827', marginBottom: '1.25rem' }}>
              {plan.property_summary}
            </p>
            {plan.key_facts && plan.key_facts.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {plan.key_facts.map((f, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{f.value || '—'}</div>
                  </div>
                ))}
              </div>
            )}
            {plan.closure_check && (
              <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', borderRadius: 8, background: plan.closure_check.acceptable ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${plan.closure_check.acceptable ? '#BBF7D0' : '#FECACA'}` }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.25rem', color: plan.closure_check.acceptable ? '#059669' : '#DC2626' }}>
                  {plan.closure_check.acceptable ? '✓' : '⚠'} Deed Closure: {plan.closure_check.closure_ratio}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#374151' }}>{plan.closure_check.note}</div>
              </div>
            )}
          </div>
        )}

        {/* Pre-field research checklist */}
        {activeSection === 'research' && (
          <div>
            <SectionHeader title={plan.pre_field_research?.title || 'Pre-Field Research Checklist'} icon="🔍" />
            {plan.pre_field_research?.description && (
              <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '1rem' }}>
                {plan.pre_field_research.description}
              </p>
            )}
            {completedPre > 0 && (
              <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>
                ✓ {completedPre} of {totalPre} items completed
              </div>
            )}
            {(plan.pre_field_research?.items || []).map((item, i) => (
              <ChecklistItem
                key={i}
                item={{ ...item, id: `pre_${i}`, done: checklistState[`pre_${i}`] ?? item.done }}
                onToggle={toggleItem}
              />
            ))}
          </div>
        )}

        {/* Equipment */}
        {activeSection === 'equipment' && (
          <div>
            <SectionHeader title={plan.equipment_checklist?.title || 'Equipment & Supplies'} icon="🧰" />
            {(plan.equipment_checklist?.items || []).map((cat, i) => (
              <div key={i} style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat.category}
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {cat.items.map((item, j) => (
                    <li key={j} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Field procedures */}
        {activeSection === 'field' && (
          <div>
            <SectionHeader title="Field Procedures" icon="📏" />
            {(plan.field_procedures || []).map((step, i) => (
              <div key={i} style={{ marginBottom: '1.25rem', padding: '1rem', background: '#FAFAFA', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, flexShrink: 0 }}>
                    {step.step}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>{step.title}</span>
                      {step.phase && <span style={{ fontSize: '0.75rem', color: '#6B7280', background: '#F3F4F6', padding: '1px 8px', borderRadius: 10 }}>{step.phase}</span>}
                      {step.estimated_time && <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>⏱ {step.estimated_time}</span>}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 0.5rem' }}>{step.plain_english}</p>
                    {step.technical_notes && (
                      <div style={{ fontSize: '0.8rem', color: '#6B7280', background: '#F9FAFB', padding: '0.5rem 0.75rem', borderRadius: 4, borderLeft: '3px solid #D1D5DB' }}>
                        <em>Surveyor notes: </em>{step.technical_notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Monuments */}
        {activeSection === 'monuments' && (
          <div>
            <SectionHeader title={plan.monument_recovery?.title || 'Monument Recovery Strategy'} icon="⬤" />
            {plan.monument_recovery?.description && (
              <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '1rem' }}>
                {plan.monument_recovery.description}
              </p>
            )}
            {(plan.monument_recovery?.monuments || []).map((mon, i) => (
              <div key={i} style={{ marginBottom: '1rem', padding: '0.875rem', background: '#FAFAFA', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', marginBottom: '0.5rem' }}>
                  {mon.location} — <span style={{ fontWeight: 400, color: '#6B7280' }}>{mon.type}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.2rem' }}>How to Find</div>
                    <div style={{ fontSize: '0.8rem', color: '#374151' }}>{mon.search_method}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: '0.2rem' }}>If Found</div>
                    <div style={{ fontSize: '0.8rem', color: '#374151' }}>{mon.found_action}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: '0.2rem' }}>If Not Found</div>
                    <div style={{ fontSize: '0.8rem', color: '#374151' }}>{mon.not_found_action}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Boundary reconstruction */}
        {activeSection === 'boundary' && (
          <div>
            <SectionHeader title={plan.boundary_reconstruction?.title || 'Boundary Reconstruction'} icon="🗺️" />
            {plan.boundary_reconstruction?.description && (
              <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '0.75rem' }}>
                {plan.boundary_reconstruction.description}
              </p>
            )}
            {plan.boundary_reconstruction?.method && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
                <strong>Method: {plan.boundary_reconstruction.method}</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
                  {plan.boundary_reconstruction.explanation}
                </p>
              </div>
            )}
            {plan.boundary_reconstruction?.priority_evidence && plan.boundary_reconstruction.priority_evidence.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Evidence Priority (highest to lowest):</div>
                <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {plan.boundary_reconstruction.priority_evidence.map((e, i) => (
                    <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.2rem' }}>{e}</li>
                  ))}
                </ol>
              </div>
            )}
            {plan.boundary_reconstruction?.potential_conflicts && plan.boundary_reconstruction.potential_conflicts.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#D97706', marginBottom: '0.5rem' }}>⚠ Potential Conflicts:</div>
                {plan.boundary_reconstruction.potential_conflicts.map((c, i) => (
                  <div key={i} style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem', background: '#FFFBEB', borderRadius: 6, border: '1px solid #FDE68A' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400E', marginBottom: '0.25rem' }}>{c.description}</div>
                    <div style={{ fontSize: '0.8rem', color: '#78350F' }}><em>Recommendation: </em>{c.recommendation}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Discrepancies */}
        {activeSection === 'discrepancies' && (
          <div>
            <SectionHeader title="Discrepancies to Investigate" icon="⚠️" />
            {(!plan.discrepancies_to_investigate || plan.discrepancies_to_investigate.length === 0) ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#059669' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✓</div>
                No discrepancies identified yet.
              </div>
            ) : (
              plan.discrepancies_to_investigate.map((d, i) => (
                <div key={i} style={{ marginBottom: '1rem', padding: '0.875rem', background: '#FAFAFA', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <SeverityBadge severity={d.severity} />
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}>{d.description}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#374151', padding: '0.4rem 0.6rem', background: '#F3F4F6', borderRadius: 4 }}>
                    <em>Field action: </em>{d.field_action}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Data sources */}
        {activeSection === 'sources' && (
          <div>
            <SectionHeader title="Data Sources & Links" icon="🔗" />
            {(!plan.data_sources_used || plan.data_sources_used.length === 0) ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                No data sources available yet. Run a property search to populate links.
              </div>
            ) : (
              <DataSourceList sources={plan.data_sources_used} />
            )}
          </div>
        )}

        {/* Schedule */}
        {activeSection === 'schedule' && (
          <div>
            <SectionHeader title="Office-to-Field Timeline" icon="📅" />
            {(plan.office_to_field_sequence || []).map((day, i) => (
              <div key={i} style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1D4ED8', marginBottom: '0.5rem' }}>{day.day}</div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {day.tasks.map((t, j) => (
                    <li key={j} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
            {plan.special_considerations && plan.special_considerations.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <SectionHeader title="Special Considerations" icon="📌" />
                {plan.special_considerations.map((c, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{c.category}</div>
                    <div style={{ fontSize: '0.875rem', color: '#374151' }}>{c.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Next Steps */}
        {activeSection === 'nextsteps' && (
          <div>
            <SectionHeader title="Next Steps & Setup" icon="🚀" />
            {plan.next_steps && plan.next_steps.length > 0 ? (
              <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
                {plan.next_steps.map((step, i) => (
                  <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ color: '#6B7280' }}>No additional steps at this time.</p>
            )}
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
              <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                💡 To Enable Full Automated Research
              </div>
              <p style={{ fontSize: '0.85rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>
                Set the following environment variables to activate the complete pipeline:
              </p>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem', fontSize: '0.85rem', color: '#374151' }}>
                <li><code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 3 }}>ANTHROPIC_API_KEY</code> — Required for AI analysis (get one at console.anthropic.com)</li>
                <li><code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 3 }}>WORKER_URL</code> — URL of your DigitalOcean research worker (enables Playwright scraping)</li>
                <li><code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 3 }}>WORKER_API_KEY</code> — API key for the worker service</li>
              </ul>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9CA3AF' }}>
              Plan generated at {new Date(plan.generated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
