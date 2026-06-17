// app/admin/components/calculator/models/BearingAzimuth.tsx
//
// Slice P3-ba — surveyor utility for quick bearing ↔ azimuth
// conversions. The user keeps moving between field crews who write
// bearings ("N 32° 15' 40\" E") and CAD systems that read azimuths
// ("122° 15' 40\""); this calc flips between the two forms at the
// click of a button.
//
// Layout (top → bottom):
//   1) Mode toggle:           [ Bearing | Azimuth ]
//   2) Quadrant selector:     [ NE  NW  SE  SW ]   (Bearing mode only)
//   3) DMS inputs:            deg ° min ' sec "
//   4) Output panel:          live converted value in the OTHER form
//   5) Copy button so the surveyor can paste the result into the
//      next field.
//
// All conversion math lives in lib/calculators/bearing-azimuth/convert.ts
// and is exercised by a separate unit test file. This component is
// thin UI over those pure functions.

'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  azimuthToBearing,
  bearingToAzimuth,
  decimalToDms,
  dmsToDecimal,
  formatBearing,
  formatAzimuth,
  QUADRANTS,
  type Quadrant,
} from '@/lib/calculators/bearing-azimuth/convert';

type Mode = 'bearing' | 'azimuth';

interface DmsForm {
  deg: string;
  min: string;
  sec: string;
}

const EMPTY_DMS: DmsForm = { deg: '0', min: '0', sec: '0' };

function parseDmsForm(form: DmsForm): { deg: number; min: number; sec: number } {
  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  return { deg: num(form.deg), min: num(form.min), sec: num(form.sec) };
}

export function BearingAzimuth() {
  const [mode, setMode] = useState<Mode>('bearing');
  const [quadrant, setQuadrant] = useState<Quadrant>('NE');
  const [dms, setDms] = useState<DmsForm>(EMPTY_DMS);
  const [copied, setCopied] = useState(false);

  // Derived: the parsed input as decimal degrees, plus the converted
  // form. Re-runs only when the user edits inputs / flips mode.
  const conversion = useMemo(() => {
    const parsed = parseDmsForm(dms);
    const inputDecimal = dmsToDecimal(parsed);

    if (mode === 'bearing') {
      const inRange = inputDecimal >= 0 && inputDecimal <= 90;
      const azimuth = bearingToAzimuth(quadrant, inputDecimal);
      const azDms = decimalToDms(azimuth);
      return {
        inRange,
        outputLabel: 'Azimuth',
        outputText: formatAzimuth(azDms),
        copyText: formatAzimuth(azDms),
      };
    }

    // Azimuth → Bearing
    const inRange = inputDecimal >= 0 && inputDecimal < 360;
    const bearing = azimuthToBearing(inputDecimal);
    const bDms = decimalToDms(bearing.decimal);
    return {
      inRange,
      outputLabel: `Bearing (${bearing.quadrant})`,
      outputText: formatBearing(bearing.quadrant, bDms),
      copyText: formatBearing(bearing.quadrant, bDms),
    };
  }, [mode, quadrant, dms]);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(conversion.copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard denied — silently skip */
    }
  }, [conversion.copyText]);

  const handleReset = useCallback(() => {
    setDms(EMPTY_DMS);
    setQuadrant('NE');
  }, []);

  const showQuadrant = mode === 'bearing';

  return (
    <div className="bearing-az" data-testid="bearing-az">
      {/* ── Mode toggle ─────────────────────────────────────────── */}
      <div className="bearing-az__row" role="tablist" aria-label="Input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'bearing'}
          className={`bearing-az__mode ${mode === 'bearing' ? 'bearing-az__mode--active' : ''}`}
          onClick={() => setMode('bearing')}
          data-testid="bearing-az-mode-bearing"
        >
          Bearing
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'azimuth'}
          className={`bearing-az__mode ${mode === 'azimuth' ? 'bearing-az__mode--active' : ''}`}
          onClick={() => setMode('azimuth')}
          data-testid="bearing-az-mode-azimuth"
        >
          Azimuth
        </button>
      </div>

      {/* ── Quadrant (Bearing mode only) ────────────────────────── */}
      {showQuadrant && (
        <div className="bearing-az__row" role="radiogroup" aria-label="Quadrant">
          {QUADRANTS.map((q) => (
            <button
              key={q}
              type="button"
              role="radio"
              aria-checked={quadrant === q}
              className={`bearing-az__quad ${quadrant === q ? 'bearing-az__quad--active' : ''}`}
              onClick={() => setQuadrant(q)}
              data-testid={`bearing-az-quad-${q}`}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── DMS inputs ──────────────────────────────────────────── */}
      <fieldset className="bearing-az__dms" aria-label="Degrees, minutes, seconds">
        <label className="bearing-az__field">
          <span className="bearing-az__field-label">Degrees</span>
          <div className="bearing-az__input-wrap">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={dms.deg}
              onChange={(e) => setDms((cur) => ({ ...cur, deg: e.target.value }))}
              data-testid="bearing-az-deg"
            />
            <span className="bearing-az__unit">°</span>
          </div>
        </label>
        <label className="bearing-az__field">
          <span className="bearing-az__field-label">Minutes</span>
          <div className="bearing-az__input-wrap">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={59}
              value={dms.min}
              onChange={(e) => setDms((cur) => ({ ...cur, min: e.target.value }))}
              data-testid="bearing-az-min"
            />
            <span className="bearing-az__unit">&apos;</span>
          </div>
        </label>
        <label className="bearing-az__field">
          <span className="bearing-az__field-label">Seconds</span>
          <div className="bearing-az__input-wrap">
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              min={0}
              value={dms.sec}
              onChange={(e) => setDms((cur) => ({ ...cur, sec: e.target.value }))}
              data-testid="bearing-az-sec"
            />
            <span className="bearing-az__unit">&quot;</span>
          </div>
        </label>
      </fieldset>

      {/* ── Output panel ────────────────────────────────────────── */}
      <section
        className={`bearing-az__output ${conversion.inRange ? '' : 'bearing-az__output--warn'}`}
        aria-live="polite"
      >
        <div className="bearing-az__output-label">{conversion.outputLabel}</div>
        <div className="bearing-az__output-value" data-testid="bearing-az-output">
          {conversion.outputText}
        </div>
        {!conversion.inRange && (
          <div className="bearing-az__warn" role="alert">
            {mode === 'bearing'
              ? 'Bearing angle should be between 0° and 90°.'
              : 'Azimuth should be between 0° and 360°.'}
          </div>
        )}
      </section>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="bearing-az__actions">
        <button
          type="button"
          className="bearing-az__action"
          onClick={handleCopy}
          data-testid="bearing-az-copy"
        >
          {copied ? '✓ Copied' : '📋 Copy result'}
        </button>
        <button
          type="button"
          className="bearing-az__action bearing-az__action--ghost"
          onClick={handleReset}
          data-testid="bearing-az-reset"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
