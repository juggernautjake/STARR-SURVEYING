'use client';
// app/admin/marketing/RangePicker.tsx — the period control for every advertising tab. A2.
//
// Owner, 2026-08-11: current month by default, *"but I also want the user … to be able to change the
// time frame to review any month, or even the current full year or past years. We should also be
// able to narrow it down to weeks and even individual days."*
//
// ── ONE CONTROL FOR FOUR TABS ───────────────────────────────────────────────────────────────────
//
// Before A1 each page had its own pair of bare `<input type="date">` boxes, defaulting to blank —
// so every page opened on "whatever the API decides" and switching pages lost the period you were
// looking at. This sits in the shell, above the tabs, and the tabs read it. Changing tab keeps the
// month; changing the month keeps the tab.
//
// ── PRESETS AND A CUSTOM RANGE, NOT ONE OR THE OTHER ────────────────────────────────────────────
//
// Presets answer the questions people actually ask ("this month", "last year") in one tap. The
// month/year selects cover "any month, or past years" without needing a preset per month. The
// custom dates cover everything else. Dropping any of the three would push a common question into
// a fiddlier control than it deserves.
//
// All of it lives in the URL — see `rangeToParams` for why a PRESET is stored by name and a CUSTOM
// range by its dates. That distinction is what keeps a bookmark rolling over into the new month
// instead of freezing on the month it was made.

import { useMemo, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';

import {
  PRESET_OPTIONS,
  customRange,
  granularityFor,
  granularityLabel,
  monthRange,
  resolvePreset,
  yearRange,
  type DateRange,
  type PresetId,
} from '@/lib/marketing/date-range';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface RangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Injected so the component is testable and so "now" is read at render, never at module load. */
  now?: Date;
}

export default function RangePicker({ value, onChange, now }: RangePickerProps) {
  const [open, setOpen] = useState(false);
  // Read at render rather than captured in a module constant: a constant would freeze on the
  // server's start time and quietly serve last month for weeks.
  const today = now ?? new Date();

  // Ten years back is enough for any ad account this firm will have, and a bounded list beats a
  // free-form year box that accepts 1987.
  const years = useMemo(() => {
    const y = today.getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, [today]);

  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  const granularity = granularityFor(value);

  const pick = (r: DateRange) => { onChange(r); setOpen(false); };

  return (
    <div className="mkt-range">
      <button
        type="button"
        className="mkt-range__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <CalendarRange size={15} aria-hidden />
        <span className="mkt-range__label">{value.label}</span>
        {/* The bucket the charts use, stated rather than implied. An unlabelled axis is how a
            monthly total gets read as a daily one. */}
        <span className="mkt-range__granularity">{granularityLabel(granularity)}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open ? (
        <div className="mkt-range__panel" role="dialog" aria-label="Choose a period">
          <div className="mkt-range__group">
            <span className="mkt-range__group-label">Quick</span>
            <div className="mkt-range__presets">
              {PRESET_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`mkt-range__preset${value.preset === p.id ? ' mkt-range__preset--active' : ''}`}
                  onClick={() => pick(resolvePreset(p.id as PresetId, today))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mkt-range__group">
            <span className="mkt-range__group-label">A specific month</span>
            <div className="mkt-range__row">
              <select
                aria-label="Month"
                defaultValue={String(today.getMonth() + 1)}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  const y = Number(
                    (document.getElementById('mkt-range-year') as HTMLSelectElement | null)?.value
                      ?? today.getFullYear(),
                  );
                  pick(monthRange(y, m));
                }}
              >
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i + 1}>{n}</option>
                ))}
              </select>
              <select id="mkt-range-year" aria-label="Year" defaultValue={String(today.getFullYear())}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="mkt-range__group">
            <span className="mkt-range__group-label">A whole year</span>
            <div className="mkt-range__presets">
              {years.slice(0, 5).map((y) => (
                <button
                  key={y}
                  type="button"
                  className="mkt-range__preset"
                  onClick={() => pick(yearRange(y))}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="mkt-range__group">
            <span className="mkt-range__group-label">Exact dates</span>
            <div className="mkt-range__row">
              <input
                type="date"
                aria-label="From"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                aria-label="To"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <button
                type="button"
                className="mkt-range__apply"
                onClick={() => {
                  const r = customRange(customFrom, customTo);
                  // Silently ignoring an unparseable pair would look like a dead button; the range
                  // library already swaps a backwards pair, so the only way here is genuinely
                  // invalid input from a keyboard-typed date field.
                  if (r) pick(r);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
