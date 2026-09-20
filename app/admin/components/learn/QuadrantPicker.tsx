'use client';

// app/admin/components/learn/QuadrantPicker.tsx — click the quadrant the bearing falls in.
//
// Owner, 2026-09-20: "Things like having a unit circle/compass and asking the user to select which
// quadrant is the 192 degrees in. Then the user will be able to click on that quadrant of the unit
// circle and it will be highlighted. if they are correct, then that quadrant will get a green
// highlight and check mark, but if not then it will be red with an X."
//
// ── WHY THIS ONE IS WORTH BUILDING FIRST ────────────────────────────────────────────────────────
//
// Quadrant is where surveying students lose the most marks for the least reason. `TAN⁻¹` answers
// between −90° and +90° and cannot know which quadrant you are in; the calculator will hand back
// 53.13° for a line that actually runs southwest, and nothing about the number looks wrong. The fix
// is not more arithmetic — it is being able to see, instantly, where an azimuth points.
//
// A multiple-choice question cannot teach that. Pointing at it can.
//
// ── IT IS A COMPASS, NOT A MATHS UNIT CIRCLE ────────────────────────────────────────────────────
//
// Azimuths run CLOCKWISE FROM NORTH. The mathematical unit circle runs anticlockwise from east.
// Drawing this the maths way and calling it surveying would teach the wrong reflex, so north is up,
// angles increase clockwise, and the quadrants are named NE, SE, SW, NW rather than I–IV.

import { useCallback, useMemo, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';

export type QuadrantId = 'NE' | 'SE' | 'SW' | 'NW';

interface QuadrantDef {
  id: QuadrantId;
  label: string;
  /** Azimuth range, clockwise from north, in degrees. */
  from: number;
  to: number;
  /** How a bearing in this quadrant is written, and how it converts. */
  bearing: string;
  convert: string;
}

export const QUADRANTS: QuadrantDef[] = [
  { id: 'NE', label: 'NE', from: 0, to: 90, bearing: 'N … E', convert: 'Bearing = Azimuth' },
  { id: 'SE', label: 'SE', from: 90, to: 180, bearing: 'S … E', convert: 'Bearing = 180° − Azimuth' },
  { id: 'SW', label: 'SW', from: 180, to: 270, bearing: 'S … W', convert: 'Bearing = Azimuth − 180°' },
  { id: 'NW', label: 'NW', from: 270, to: 360, bearing: 'N … W', convert: 'Bearing = 360° − Azimuth' },
];

/** Which quadrant an azimuth falls in. Exported and pure so it can be tested without a browser. */
export function quadrantOf(azimuth: number): QuadrantId {
  // Normalised first: 450° is 90°, and −30° is 330°. A student typing either deserves the right
  // answer rather than an error.
  const a = ((azimuth % 360) + 360) % 360;
  // A boundary belongs to the quadrant it OPENS. 90° is due east, which is the start of SE by this
  // convention — and the component never asks about an exact boundary, precisely because the
  // convention is arbitrary and testing somebody on an arbitrary choice teaches nothing.
  if (a < 90) return 'NE';
  if (a < 180) return 'SE';
  if (a < 270) return 'SW';
  return 'NW';
}

/** The bearing an azimuth corresponds to, written the way a deed would. */
export function bearingOf(azimuth: number): string {
  const a = ((azimuth % 360) + 360) % 360;
  const q = quadrantOf(a);
  const angle = q === 'NE' ? a : q === 'SE' ? 180 - a : q === 'SW' ? a - 180 : 360 - a;
  const deg = Math.floor(angle);
  const min = Math.round((angle - deg) * 60);
  const ns = q === 'NE' || q === 'NW' ? 'N' : 'S';
  const ew = q === 'NE' || q === 'SE' ? 'E' : 'W';
  return `${ns} ${deg}°${String(min).padStart(2, '0')}′ ${ew}`;
}

export interface QuadrantPickerProps {
  /** The azimuth being asked about, in degrees clockwise from north. */
  azimuth: number;
  /** Called the first time they answer, so a lesson can record it. */
  onAnswered?: (correct: boolean, picked: QuadrantId) => void;
}

const SIZE = 260;
const C = SIZE / 2;
const R = SIZE / 2 - 26;

/** The wedge path for one quadrant, drawn clockwise from north. */
function wedge(fromDeg: number, toDeg: number): string {
  // SVG y grows downward, and azimuth is clockwise from north, so north (0°) is −y and the sweep
  // is naturally clockwise on screen. This is the one place the compass convention meets the
  // drawing convention, and getting it wrong mirrors the whole diagram.
  const pt = (deg: number) => {
    const rad = (deg - 90) * Math.PI / 180;
    return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
  };
  const [x1, y1] = pt(fromDeg);
  const [x2, y2] = pt(toDeg);
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`;
}

export default function QuadrantPicker({ azimuth, onAnswered }: QuadrantPickerProps) {
  const answer = useMemo(() => quadrantOf(azimuth), [azimuth]);
  const [picked, setPicked] = useState<QuadrantId | null>(null);
  const correct = picked !== null && picked === answer;

  const choose = useCallback((id: QuadrantId) => {
    if (picked !== null) return;
    setPicked(id);
    onAnswered?.(id === answer, id);
  }, [picked, answer, onAnswered]);

  const reset = useCallback(() => setPicked(null), []);

  // The needle. Only drawn AFTER they answer — showing it up front would be showing the answer,
  // since the whole question is "where does this point".
  const needle = useMemo(() => {
    const rad = (azimuth - 90) * Math.PI / 180;
    return { x: C + (R - 8) * Math.cos(rad), y: C + (R - 8) * Math.sin(rad) };
  }, [azimuth]);

  return (
    <div className="qpick" data-testid="quadrant-picker">
      <p className="qpick__ask">
        Which quadrant does an azimuth of <strong>{azimuth}°</strong> fall in?
      </p>

      <svg
        className={`qpick__dial${picked ? (correct ? ' qpick__dial--right' : ' qpick__dial--wrong') : ''}`}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label={`Compass. Choose the quadrant containing azimuth ${azimuth} degrees.`}
      >
        {QUADRANTS.map((q) => {
          const isAnswer = q.id === answer;
          const isPicked = q.id === picked;
          const state = picked === null ? 'idle'
            : isPicked && isAnswer ? 'right'
            : isPicked ? 'wrong'
            // Once they are wrong, the correct wedge is shown too — being told "no" without being
            // shown "there" is the least useful possible feedback.
            : isAnswer ? 'reveal' : 'dim';
          return (
            <path
              key={q.id}
              d={wedge(q.from, q.to)}
              className={`qpick__wedge qpick__wedge--${state}`}
              onClick={() => choose(q.id)}
              role="button"
              tabIndex={picked === null ? 0 : -1}
              aria-label={`${q.label} quadrant, azimuth ${q.from} to ${q.to} degrees`}
              aria-pressed={isPicked}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(q.id); } }}
            />
          );
        })}

        {/* Cardinal labels, outside the dial so a wedge highlight never hides them. */}
        <text className="qpick__cardinal" x={C} y={14} textAnchor="middle">N</text>
        <text className="qpick__cardinal" x={SIZE - 8} y={C + 4} textAnchor="middle">E</text>
        <text className="qpick__cardinal" x={C} y={SIZE - 4} textAnchor="middle">S</text>
        <text className="qpick__cardinal" x={10} y={C + 4} textAnchor="middle">W</text>

        {QUADRANTS.map((q) => {
          const mid = (q.from + q.to) / 2;
          const rad = (mid - 90) * Math.PI / 180;
          return (
            <text
              key={q.id}
              className="qpick__wedge-label"
              x={C + R * 0.58 * Math.cos(rad)}
              y={C + R * 0.58 * Math.sin(rad) + 5}
              textAnchor="middle"
            >
              {q.label}
            </text>
          );
        })}

        {picked !== null && (
          <>
            <line className="qpick__needle" x1={C} y1={C} x2={needle.x} y2={needle.y} />
            <circle className="qpick__hub" cx={C} cy={C} r={4} />
          </>
        )}
      </svg>

      {picked !== null && (
        <div className={`qpick__verdict qpick__verdict--${correct ? 'right' : 'wrong'}`} role="status">
          <span className="qpick__verdict-icon">
            {correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
          </span>
          <div>
            <strong>{correct ? 'Correct' : `Not quite — it is ${answer}`}</strong>
            <p className="qpick__verdict-why">
              {azimuth}° is {bearingOf(azimuth)}.{' '}
              {QUADRANTS.find((q) => q.id === answer)!.convert}, because the azimuth is between{' '}
              {QUADRANTS.find((q) => q.id === answer)!.from}° and{' '}
              {QUADRANTS.find((q) => q.id === answer)!.to}°.
            </p>
          </div>
          <button type="button" className="qpick__again" onClick={reset} data-testid="qpick-again">
            <RotateCcw size={13} aria-hidden /> Again
          </button>
        </div>
      )}
    </div>
  );
}
