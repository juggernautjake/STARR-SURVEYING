'use client';
// lib/hub/widgets/surveying-calculator/index.tsx
//
// C0f of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// The surveying calculator: bearing ↔ azimuth, angle arithmetic, triangles and trig, latitude and
// departure — plus a plain arithmetic pad.
//
// ── WHAT THE DUPLICATION CHECK ACTUALLY FOUND ───────────────────────────────────────────────────
//
// The plan flagged this slice as probably-a-third-copy: traverse and angle maths already exist in
// `lib/cad` and the worker survey stack, so the instruction was to check before porting. Checking
// says port it, for two separate reasons:
//
//   `lib/surveying/calculator.ts` holds SIXTEEN named operations and has exactly ONE consumer —
//   the Work Mode field-crew shell. It is not a copy of anything: CAD's `calculators/` is a
//   generic four-function state machine for its own modal, and CAD's curve/closure/inverse tools
//   operate on drawing geometry rather than on numbers a surveyor types. Deleting the shell would
//   delete all sixteen.
//
//   `lib/jobs/calc.ts` (`evalArithmetic`) has the same single consumer. Dropping the arithmetic pad
//   would leave it orphaned — which this repo actively tests for
//   (`__tests__/lib-orphan-ratchet.test.ts`).
//
// So both modes live here. One widget, because "work out a number in the field" is one job, and a
// surveyor should not have to know which of two tiles does bearings and which does multiplication.

import React, { useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import { operationsByCategory, type SurveyingOperation } from '@/lib/surveying/calculator';
import { evalArithmetic, formatCalcResult } from '@/lib/jobs/calc';

export interface SurveyingCalculatorContent extends Record<string, unknown> {
  /** Which pane opens first. A crew doing traverse work all day should not re-pick it each time. */
  defaultMode: 'surveying' | 'basic';
}

const DEFAULTS: SurveyingCalculatorContent = { defaultMode: 'surveying' };

const CAT_LABEL: Record<string, string> = {
  convert: 'Bearing / Azimuth',
  angle: 'Angles',
  triangle: 'Triangles & Trig',
  traverse: 'Traverse',
};

function SurveyingCalculatorWidget({ size, content }: WidgetProps<SurveyingCalculatorContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [mode, setMode] = useState<'surveying' | 'basic'>(settings.defaultMode);

  const groups = useMemo(() => operationsByCategory(), []);
  const [opId, setOpId] = useState(groups[0][1][0].id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [expr, setExpr] = useState('');

  const op: SurveyingOperation | undefined = useMemo(
    () => groups.flatMap(([, ops]) => ops).find((o) => o.id === opId),
    [groups, opId],
  );

  // A blank numeric field becomes NaN, and each operation returns its own friendly error for that —
  // so an incomplete form explains what it wants instead of showing a wrong number.
  const result = useMemo(() => {
    if (!op) return { error: 'Pick an operation.' };
    const args: Record<string, number | string> = {};
    for (const inp of op.inputs) {
      args[inp.key] = inp.kind === 'quadrant' ? (vals[inp.key] ?? 'NE') : Number(vals[inp.key]);
    }
    return op.compute(args);
  }, [op, vals]);

  const basicResult = evalArithmetic(expr);
  const basicPreview = basicResult === null ? '' : formatCalcResult(basicResult);
  const tiny = bucket === 'tiny';

  return (
    <div style={st.wrap}>
      <div style={st.modes} role="tablist" aria-label="Calculator mode">
        {(['surveying', 'basic'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            style={{ ...st.modeBtn, ...(mode === m ? st.modeBtnOn : null) }}
          >
            {m === 'surveying' ? (tiny ? 'Survey' : 'Surveying') : 'Basic'}
          </button>
        ))}
      </div>

      {mode === 'surveying' ? (
        <div style={st.body}>
          <select
            value={opId}
            onChange={(e) => { setOpId(e.target.value); setVals({}); }}
            aria-label="Surveying operation"
            style={st.field}
          >
            {groups.map(([cat, ops]) => (
              <optgroup key={cat} label={CAT_LABEL[cat] ?? cat}>
                {ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>

          <div style={st.inputs}>
            {op?.inputs.map((inp) => (
              <label key={inp.key} style={st.label}>
                {inp.label}
                {inp.kind === 'quadrant' ? (
                  <select
                    value={vals[inp.key] ?? 'NE'}
                    onChange={(e) => setVals((v) => ({ ...v, [inp.key]: e.target.value }))}
                    aria-label={inp.label}
                    style={st.field}
                  >
                    {['NE', 'SE', 'SW', 'NW'].map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={vals[inp.key] ?? ''}
                    onChange={(e) => setVals((v) => ({ ...v, [inp.key]: e.target.value }))}
                    placeholder="0"
                    aria-label={inp.label}
                    style={st.field}
                  />
                )}
              </label>
            ))}
          </div>

          <div
            aria-live="polite"
            style={{ ...st.result, color: 'error' in result ? 'var(--theme-fg-secondary)' : 'var(--theme-accent)' }}
          >
            {'error' in result ? result.error : `= ${result.value}`}
          </div>
        </div>
      ) : (
        <div style={st.body}>
          <input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && basicPreview) setExpr(basicPreview); }}
            placeholder="0"
            aria-label="Calculator expression"
            style={{ ...st.field, textAlign: 'right', fontSize: '1.15rem' }}
          />
          <div aria-live="polite" style={{ ...st.result, minHeight: 22 }}>
            {basicPreview && `= ${basicPreview}`}
          </div>
          {!tiny && (
            <div style={st.keys}>
              {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '(', ')'].map((k) => (
                <button key={k} type="button" style={st.key} onClick={() => setExpr((e) => e + k)}>{k}</button>
              ))}
              <button type="button" style={{ ...st.key, gridColumn: 'span 2', color: 'var(--theme-warning)' }} onClick={() => setExpr('')}>C</button>
              <button type="button" style={st.key} onClick={() => setExpr((e) => e.slice(0, -1))}>⌫</button>
              <button
                type="button"
                style={{ ...st.key, background: 'var(--theme-accent)', color: 'var(--theme-accent-fg, #fff)' }}
                onClick={() => { if (basicPreview) setExpr(basicPreview); }}
              >
                =
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SurveyingCalculatorSettings({ value, onChange }: WidgetSettingsFormProps<SurveyingCalculatorContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 }}>
          Opens on
        </span>
        <select
          value={settings.defaultMode}
          onChange={(e) => onChange({ ...settings, defaultMode: e.target.value as SurveyingCalculatorContent['defaultMode'] })}
        >
          <option value="surveying">Surveying operations</option>
          <option value="basic">Basic arithmetic</option>
        </select>
      </label>
    </div>
  );
}

defineWidget<SurveyingCalculatorContent>({
  id: 'surveying-calculator',
  label: 'Surveying Calculator',
  description: 'Bearings, azimuths, angles, triangles, traverse — plus a plain arithmetic pad.',
  category: 'personal',
  iconName: 'Calculator',
  defaultSize: { w: 3, h: 3 },
  // 1×1 is the catalogue-wide contract (Slice 217). The tiny bucket drops the keypad; the operation
  // picker and its result still fit.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: SurveyingCalculatorWidget,
  SettingsForm: SurveyingCalculatorSettings,
});

const st: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 'var(--hub-spc-2, 8px)' },
  modes: { display: 'flex', gap: 4, flexShrink: 0 },
  modeBtn: {
    flex: 1,
    minWidth: 0,
    height: 28,
    borderRadius: 6,
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-secondary)',
    fontSize: 'var(--hub-font-xs, 0.75rem)',
    fontWeight: 600,
    cursor: 'pointer',
    font: 'inherit',
    whiteSpace: 'nowrap',
  },
  modeBtnOn: { background: 'var(--theme-accent)', color: 'var(--theme-accent-fg, #fff)', borderColor: 'var(--theme-accent)' },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' },
  inputs: { display: 'grid', gap: 6 },
  label: { display: 'grid', gap: 3, fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', minWidth: 0 },
  field: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    height: 'var(--input-height, 40px)',
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-surface)',
    color: 'var(--theme-fg-primary)',
    font: 'inherit',
    fontSize: 'var(--hub-font-sm, 0.875rem)',
  },
  result: { textAlign: 'right', fontSize: '1.05rem', minHeight: 24, fontWeight: 600, color: 'var(--theme-fg-secondary)' },
  keys: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 },
  key: {
    height: 34,
    borderRadius: 6,
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-primary)',
    fontSize: '0.95rem',
    cursor: 'pointer',
    font: 'inherit',
  },
};
