'use client';
// app/admin/marketing/_tabs/TrendChart.tsx — daily spend and daily clicks. A5.
//
// ── WHY TWO CHARTS AND NOT ONE ──────────────────────────────────────────────────────────────────
//
// Spend is in dollars (~$15/day) and clicks are a count (~35/day). Putting both on one plot needs
// two y-scales, and **a dual-axis chart is the single most misleading form in dashboards**: the
// alignment of the two scales is arbitrary, so wherever the lines happen to cross or diverge the
// chart invents a correlation that is not in the data. Slide one axis and the "story" changes.
//
// So: small multiples. Two stacked plots, one measure each, one y-axis each, sharing an x. Comparing
// shapes down the page is honest; comparing them against a fabricated common scale is not.
//
// ── WHY COLUMNS AND NOT A LINE ──────────────────────────────────────────────────────────────────
//
// Daily spend is a discrete total per day, not a continuous quantity sampled daily. A line segment
// between the 4th and the 6th draws money spent on the 5th — and on a day with no spend at all, it
// draws a slope through zero that never happened. Columns can only claim what is in the data.
//
// ── COLOUR COMES FROM THE THEME, NOT FROM THIS FILE ─────────────────────────────────────────────
//
// One series per plot, painted `var(--theme-accent)`, so the chart is correct in all twelve skins
// including both high-contrast ones. Every theme's accent was checked against its own surface with
// the dataviz validator: all twelve clear the 3:1 floor. A hardcoded blue would have been legible in
// eight of them and invisible in `high-contrast-dark`.
//
// Some accents sit outside the validator's lightness band. That check exists to keep a SET of
// categorical hues comparable to each other; with one series per plot there is no set and no
// adjacent pair, so it does not apply here.

import { useId, useMemo, useState } from 'react';

// Imported here rather than relied on from the parent. It is the same stylesheet either way today,
// and that is precisely the arrangement that rots: move this component, render it from a second
// tab, and it arrives unstyled with nothing failing. The guard in
// __tests__/marketing/marketing-pages-are-styled.test.ts enforces the import for that reason.
import '../Marketing.css';

export interface TrendPoint {
  date: string;
  costMicros: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

const MICROS = 1_000_000;

/** Plot geometry. The container height INCLUDES the x-axis band — sizing to the plot alone is what
 *  gives a chart card its own tiny nested scrollbar. */
const PLOT_H = 108;
const AXIS_H = 18;
const PAD_L = 46;   // room for y-tick labels without clipping "$1,200"
const PAD_R = 6;
const MAX_BAR = 24; // never fill the slot; the band's leftover is deliberate air
const GAP = 2;      // the surface gap — separation is done by space, never by a stroke on the mark

interface Series {
  key: 'spend' | 'clicks';
  title: string;
  /** The plotted value for a day. */
  value: (p: TrendPoint) => number;
  /** How a y-tick and a tooltip render it. */
  format: (v: number) => string;
}

const SERIES: Series[] = [
  {
    key: 'spend',
    title: 'Spend per day',
    value: (p) => p.costMicros / MICROS,
    format: (v) => `$${v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)}`,
  },
  {
    key: 'clicks',
    title: 'Clicks per day',
    value: (p) => p.clicks,
    format: (v) => Math.round(v).toLocaleString(),
  },
];

/** Round a maximum up to a clean axis top — 0 / 10 / 20, never 0 / 17.3 / 34.6. */
function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (raw <= mag * step) return mag * step;
  }
  return mag * 10;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Aug 1", never "1/8".
 *
 * Only three of these are drawn, so spelling the month costs nothing and removes a real ambiguity:
 * this is a Texas and New Mexico firm, where `12/8` reads as December 8th, while the ISO-ish
 * day/month order it was written in means August 12th. A date axis that can be read as two
 * different dates is worse than one with no labels.
 */
const dayLabel = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return `${MONTH_ABBR[Number(m) - 1]} ${Number(d)}`;
};

export default function TrendChart({ points }: { points: TrendPoint[] }): React.ReactElement | null {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  // The table view. Not a fallback — the WCAG-clean twin of the chart, so no value is reachable
  // only by hovering. It also happens to be the fastest way to read an exact figure.
  const [showTable, setShowTable] = useState(false);

  const scales = useMemo(() => SERIES.map((s) => ({
    s, max: niceMax(Math.max(...points.map(s.value), 0)),
  })), [points]);

  // One point is not a trend; it is a number, and a one-column bar chart is an anti-pattern. The
  // KPI tiles above already say it better.
  if (points.length < 2) return null;

  const width = 100; // percentage viewBox — the SVG scales to its container
  const band = (width - PAD_L / 6 - PAD_R / 6) / points.length;

  return (
    <section className="mk__panel" data-testid="mk-trend">
      <div className="mk__perfhead">
        <h2 className="mk__h2">Day by day</h2>
        <button
          type="button"
          className="mk__refresh"
          aria-expanded={showTable}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide the numbers' : 'Show the numbers'}
        </button>
      </div>

      {scales.map(({ s, max }) => {
        const titleId = `${uid}-${s.key}`;
        return (
          <figure className="mk__chart" key={s.key}>
            {/* The title names the single series, which is why there is no legend box: one swatch
                restating the heading is data-weight ink doing a label's job. */}
            <figcaption className="mk__chart__title" id={titleId}>{s.title}</figcaption>

            <svg
              className="mk__chart__svg"
              viewBox={`0 0 ${width} ${PLOT_H + AXIS_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-labelledby={titleId}
              onPointerLeave={() => setHover(null)}
            >
              {/* Gridlines: solid hairlines one step off the surface. Dashed reads as "threshold". */}
              {[0, 0.5, 1].map((f) => (
                <line
                  key={f}
                  className="mk__chart__grid"
                  x1={PAD_L / 6} x2={width - PAD_R / 6}
                  y1={PLOT_H - f * PLOT_H} y2={PLOT_H - f * PLOT_H}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {points.map((p, i) => {
                const v = s.value(p);
                const h = max > 0 ? (v / max) * PLOT_H : 0;
                const slot = band;
                const barW = Math.min(slot - GAP / 4, MAX_BAR / 6);
                const x = PAD_L / 6 + i * slot + (slot - barW) / 2;
                return (
                  <g key={p.date}>
                    {/* A transparent full-height hit target: the painted bar for a $0.40 day is two
                        pixels tall, and a hover area the size of the mark is a hover area nobody
                        can land on. */}
                    <rect
                      x={PAD_L / 6 + i * slot} y={0} width={slot} height={PLOT_H}
                      fill="transparent"
                      onPointerEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      tabIndex={0}
                      role="img"
                      aria-label={`${p.date}: ${s.format(v)}`}
                    />
                    {v > 0 && (
                      <rect
                        className={`mk__chart__bar${hover === i ? ' is-hovered' : ''}`}
                        x={x} y={PLOT_H - h} width={barW} height={h}
                        // Rounded data-end, square at the baseline. `ry` alone would round the
                        // bottom too and detach the mark from its own axis.
                        rx={Math.min(barW / 2, 0.7)}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Y ticks and X labels are HTML, not SVG text: the viewBox is stretched by
                `preserveAspectRatio="none"` to fill the width, which would smear any text inside
                it horizontally. */}
            <div className="mk__chart__yaxis" aria-hidden>
              <span>{s.format(max)}</span>
              <span>{s.format(max / 2)}</span>
              <span>0</span>
            </div>

            <div className="mk__chart__xaxis" aria-hidden>
              {/* Selective labels: first, middle and last. A date under all 31 columns is chaos and
                  goes unread, and the tooltip plus the table carry the rest. */}
              <span>{dayLabel(points[0].date)}</span>
              <span>{dayLabel(points[Math.floor(points.length / 2)].date)}</span>
              <span>{dayLabel(points[points.length - 1].date)}</span>
            </div>
          </figure>
        );
      })}

      {/* One tooltip for both plots, listing every series at that day — the pointer never has to
          land on a specific mark to get a value. Values lead, labels follow. */}
      {hover !== null && points[hover] && (
        <p className="mk__chart__readout" role="status">
          <strong>{points[hover].date}</strong>
          {SERIES.map((s) => (
            <span key={s.key}>
              <i className="mk__chart__key" aria-hidden />
              <b>{s.format(s.value(points[hover]))}</b> {s.key === 'spend' ? 'spent' : 'clicks'}
            </span>
          ))}
        </p>
      )}

      {showTable && (
        <div className="mk__scroll">
          <table className="mk__table">
            <thead>
              <tr><th>Day</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Conversions</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>${(p.costMicros / MICROS).toFixed(2)}</td>
                  <td>{p.impressions.toLocaleString()}</td>
                  <td>{p.clicks.toLocaleString()}</td>
                  <td>{p.conversions.toFixed(p.conversions % 1 ? 1 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
