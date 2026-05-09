'use client';
// app/admin/cad/components/UnitInput.tsx
//
// Phase 8 §11.5 — drop-in replacement for `<input type="number">`
// that accepts free-form unit-suffixed input ("6in", "0.5ft",
// "45.3000", "N 45-30 E"), parses it via the unit-aware
// parsers in lib/cad/units, and surfaces the canonical value
// (US Survey Feet for length, sq ft for area, decimal-degree
// azimuth for angles) through `onChange`.
//
// Display:
//   - On blur (or Enter), re-formats the surveyor's input
//     to the canonical display unit (so "6in" becomes
//     "0.5 ft" if the field is locked to feet).
//   - On parse failure, the input keeps the raw text and
//     shows a red ring + tooltip with examples.
//   - Optional unit dropdown chip lets the surveyor lock
//     the field to a specific unit for the session.

import { useEffect, useId, useRef, useState } from 'react';
import {
  parseLength,
  parseArea,
  parseAngle,
  feetTo,
  sqftTo,
  type LinearUnit,
  type AreaUnit,
  type AngleMode,
  type ParsedLength,
  type ParsedArea,
  type ParsedAngle,
} from '@/lib/cad/units';

const LENGTH_UNITS: { value: LinearUnit; label: string }[] = [
  { value: 'FT',   label: 'ft' },
  { value: 'IN',   label: 'in' },
  { value: 'MILE', label: 'mi' },
  { value: 'M',    label: 'm'  },
  { value: 'CM',   label: 'cm' },
  { value: 'MM',   label: 'mm' },
];

const AREA_UNITS: { value: AreaUnit; label: string }[] = [
  { value: 'SQ_FT',    label: 'sf'  },
  { value: 'ACRES',    label: 'ac'  },
  { value: 'SQ_M',     label: 'm²'  },
  { value: 'HECTARES', label: 'ha'  },
];

const ANGLE_MODES: { value: AngleMode; label: string }[] = [
  { value: 'AUTO',    label: 'auto' },
  { value: 'AZIMUTH', label: 'az'   },
  { value: 'BEARING', label: 'brg'  },
];

interface CommonProps {
  /** Display label rendered above / inline with the input. */
  label?: string;
  /** Tooltip / aria-description. */
  description?: string;
  /** Standard placeholder text. Defaults to a kind-specific example. */
  placeholder?: string;
  /** Disable input. */
  disabled?: boolean;
  /** Width hint — passes through to className width util. */
  className?: string;
  /** Show the unit dropdown chip. Default true. */
  showUnitDropdown?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** id used to scope `data-autofocus`. */
  autoFocusKey?: string;
}

interface LengthProps extends CommonProps {
  kind: 'length';
  value: number;                       // canonical: feet
  onChange: (canonicalFeet: number) => void;
  defaultUnit?: LinearUnit;            // default 'FT'
  onValid?: (parsed: ParsedLength) => void;
}

interface AreaProps extends CommonProps {
  kind: 'area';
  value: number;                       // canonical: sq ft
  onChange: (canonicalSqft: number) => void;
  defaultUnit?: AreaUnit;              // default 'SQ_FT'
  onValid?: (parsed: ParsedArea) => void;
}

interface AngleProps extends CommonProps {
  kind: 'angle';
  value: number;                       // canonical: decimal-degree azimuth
  onChange: (canonicalAzimuth: number) => void;
  /** AZIMUTH | BEARING | AUTO (default AUTO). */
  angleMode?: AngleMode;
  onValid?: (parsed: ParsedAngle) => void;
}

export type UnitInputProps = LengthProps | AreaProps | AngleProps;

function defaultPlaceholder(props: UnitInputProps): string {
  switch (props.kind) {
    case 'length': return 'e.g. 6in, 0.5ft, 12';
    case 'area':   return 'e.g. 2.5ac, 500sf';
    case 'angle':  return 'e.g. 45.3000, N 45-30 E';
  }
}

function formatLength(canonicalFeet: number, displayUnit: LinearUnit, decimals = 4): string {
  const v = feetTo(canonicalFeet, displayUnit);
  return `${v.toFixed(decimals).replace(/\.?0+$/, '')}`;
}

function formatArea(canonicalSqft: number, displayUnit: AreaUnit, decimals = 4): string {
  const v = sqftTo(canonicalSqft, displayUnit);
  return `${v.toFixed(decimals).replace(/\.?0+$/, '')}`;
}

function formatAzimuth(azimuth: number, decimals = 4): string {
  return azimuth.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Shared unit-aware input. The signature is discriminated by `kind`
 * so the canonical value type stays correct on both `value` and
 * `onChange`.
 */
export default function UnitInput(props: UnitInputProps) {
  const reactId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string>(() => formatInitial(props));
  const [error, setError] = useState<string | null>(null);
  const [unitOverride, setUnitOverride] = useState<LinearUnit | AreaUnit | undefined>(undefined);
  const [angleModeOverride, setAngleModeOverride] = useState<AngleMode | undefined>(undefined);

  // External value changed — re-render the draft (unless the input
  // is currently focused; we don't fight the surveyor's typing).
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setDraft(formatInitial(props));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, unitOverride, angleModeOverride]);

  function commit(raw: string) {
    if (raw.trim() === '') {
      setError(null);
      return;
    }
    if (props.kind === 'length') {
      const unit = unitOverride as LinearUnit ?? props.defaultUnit ?? 'FT';
      const r = parseLength(raw, unit);
      if (!r) {
        setError('Try "6in", "0.5ft", or a plain number.');
        return;
      }
      setError(null);
      props.onChange(r.feet);
      props.onValid?.(r);
      // Reformat the input to the display unit's canonical form.
      setDraft(`${formatLength(r.feet, unit)}`);
    } else if (props.kind === 'area') {
      const unit = unitOverride as AreaUnit ?? props.defaultUnit ?? 'SQ_FT';
      const r = parseArea(raw, unit);
      if (!r) {
        setError('Try "2.5ac", "500sf", or a plain number.');
        return;
      }
      setError(null);
      props.onChange(r.sqft);
      props.onValid?.(r);
      setDraft(`${formatArea(r.sqft, unit)}`);
    } else {
      const angleMode = angleModeOverride ?? props.angleMode ?? 'AUTO';
      const r = parseAngle(raw, angleMode);
      if (!r) {
        setError('Try "45.3000", "N 45-30 E", or a decimal degree.');
        return;
      }
      setError(null);
      props.onChange(r.azimuth);
      props.onValid?.(r);
      setDraft(formatAzimuth(r.azimuth));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(formatInitial(props));
      setError(null);
      e.currentTarget.blur();
    }
  }

  const placeholder = props.placeholder ?? defaultPlaceholder(props);
  const ringClass = error
    ? 'border-red-500 focus:border-red-400'
    : 'border-gray-600 focus:border-blue-500';

  return (
    <div className={`relative ${props.className ?? ''}`}>
      {props.label && (
        <label htmlFor={reactId} className="block text-[11px] text-gray-400 mb-0.5">
          {props.label}
        </label>
      )}
      <div className="flex items-stretch gap-1">
        <input
          ref={inputRef}
          id={reactId}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={props.disabled}
          autoFocus={props.autoFocus}
          aria-invalid={error != null}
          aria-describedby={error ? `${reactId}-error` : undefined}
          title={props.description}
          data-autofocus={props.autoFocusKey}
          className={`flex-1 min-w-0 bg-gray-700 text-white text-xs px-2 py-1.5 rounded outline-none border ${ringClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        {props.showUnitDropdown !== false && props.kind === 'length' && (
          <UnitDropdown
            options={LENGTH_UNITS}
            value={(unitOverride as LinearUnit | undefined) ?? props.defaultUnit ?? 'FT'}
            onChange={(u) => setUnitOverride(u)}
            ariaLabel="Length unit"
          />
        )}
        {props.showUnitDropdown !== false && props.kind === 'area' && (
          <UnitDropdown
            options={AREA_UNITS}
            value={(unitOverride as AreaUnit | undefined) ?? props.defaultUnit ?? 'SQ_FT'}
            onChange={(u) => setUnitOverride(u)}
            ariaLabel="Area unit"
          />
        )}
        {props.showUnitDropdown !== false && props.kind === 'angle' && (
          <UnitDropdown
            options={ANGLE_MODES}
            value={angleModeOverride ?? props.angleMode ?? 'AUTO'}
            onChange={(m) => setAngleModeOverride(m as AngleMode)}
            ariaLabel="Angle mode"
          />
        )}
      </div>
      {error && (
        <p id={`${reactId}-error`} className="text-[10px] text-red-400 mt-1 leading-tight">
          {error}
        </p>
      )}
    </div>
  );
}

function formatInitial(props: UnitInputProps): string {
  if (props.kind === 'length') {
    const unit = props.defaultUnit ?? 'FT';
    return formatLength(props.value, unit);
  }
  if (props.kind === 'area') {
    const unit = props.defaultUnit ?? 'SQ_FT';
    return formatArea(props.value, unit);
  }
  return formatAzimuth(props.value);
}

interface UnitDropdownProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}

function UnitDropdown<T extends string>({ options, value, onChange, ariaLabel }: UnitDropdownProps<T>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      className="bg-gray-800 border border-gray-600 text-gray-300 text-[10px] rounded px-1.5 outline-none focus:border-blue-500 hover:bg-gray-700 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
