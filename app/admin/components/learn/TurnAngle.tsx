'use client';

// app/admin/components/learn/TurnAngle.tsx — point the instrument where the angle says.
//
// Owner, 2026-09-20: "I want demonstrations and illustrations … or turning an instrument in the
// right direction."
//
// ── THE CONCEPT THIS EXISTS FOR ─────────────────────────────────────────────────────────────────
//
// "Angle right 87°14′ from the backsight" is a sentence students can repeat and cannot picture, and
// the failure is invisible in the arithmetic: 90 + 87 is a number whether or not you understood
// what you were adding. Dragging a telescope round until it points somewhere is a different kind of
// knowing, and it is the kind that survives into the field.
//
// Three distinctions get confused constantly, and all three are drag-able here:
//
//   angle right      clockwise from the backsight        the default on nearly every total station
//   angle left       anticlockwise from the backsight
//   deflection       from the EXTENSION of the back line — backsight + 180 first
//
// A deflection of 20° right from a backsight of 90° is 290°, not 110°. Nothing about 110° looks
// wrong, which is exactly why it is worth being able to see.
//
// ── THE BACKSIGHT IS DRAWN, THE FORESIGHT IS NOT ────────────────────────────────────────────────
//
// Showing both lines would make this a game of matching two lines on a screen. Only the back line
// and the instrument are drawn; where the foresight belongs is the question.

import { useCallback, useRef, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import {
  azimuthFromPoint, normalize, signedDifference, snap, toDMS, turnedTo, withinTolerance,
} from '@/lib/learn/dial';
import { OUTCOME_MOTION } from '@/lib/learn/reveal';

export interface TurnAngleProps {
  /** Where the backsight points, as an azimuth. */
  backsight: number;
  /** The angle to turn, in degrees. */
  angle: number;
  direction: 'right' | 'left';
  /** A deflection is measured from the extension of the back line, not from the backsight itself. */
  deflection?: boolean;
  /** How close counts. Generous by default — this tests understanding, not mouse control. */
  toleranceDeg?: number;
  onAnswered?: (correct: boolean, aimed: number) => void;
}

const SIZE = 280;
const C = SIZE / 2;
const R = SIZE / 2 - 30;

function pt(azimuth: number, radius: number): { x: number; y: number } {
  const rad = ((azimuth - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) };
}

export default function TurnAngle({
  backsight, angle, direction, deflection = false, toleranceDeg = 4, onAnswered,
}: TurnAngleProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [aim, setAim] = useState<number>(() => normalize(backsight));
  const [dragging, setDragging] = useState(false);
  const [verdict, setVerdict] = useState<null | { correct: boolean; aimed: number }>(null);

  const target = turnedTo(backsight, angle, direction, deflection);
  const base = deflection ? normalize(backsight + 180) : normalize(backsight);

  /**
   * Where the pointer is, in the SVG's own coordinates.
   *
   * The viewBox is 280 wide and the element on screen is whatever CSS made it, so the ratio has to
   * come from the live bounding box. Using clientX directly works at exactly one screen size and
   * is off by a scale factor everywhere else — including, quietly, on a phone.
   */
  const azimuthAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = svgRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const x = ((clientX - box.left) / box.width) * SIZE;
    const y = ((clientY - box.top) / box.height) * SIZE;
    return azimuthFromPoint(C, C, x, y);
  }, []);

  const moveTo = useCallback((clientX: number, clientY: number) => {
    if (verdict) return;
    const az = azimuthAt(clientX, clientY);
    if (az === null) return;
    // Half a degree. Fine enough to hit a 4° window deliberately, coarse enough that the readout
    // is not a blur of decimals while the hand moves.
    setAim(snap(az, 0.5));
  }, [azimuthAt, verdict]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (verdict) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    moveTo(e.clientX, e.clientY);
  }, [moveTo, verdict]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    moveTo(e.clientX, e.clientY);
  }, [dragging, moveTo]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  /** Arrow keys, because a dial that only takes a mouse is a dial some people cannot use. */
  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (verdict) return;
    const step = e.shiftKey ? 0.5 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setAim((a) => normalize(a + step)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setAim((a) => normalize(a - step)); }
  }, [verdict]);

  const check = useCallback(() => {
    const correct = withinTolerance(aim, target, toleranceDeg);
    setVerdict({ correct, aimed: aim });
    onAnswered?.(correct, aim);
  }, [aim, target, toleranceDeg, onAnswered]);

  const reset = useCallback(() => { setVerdict(null); setAim(normalize(backsight)); }, [backsight]);

  const backEnd = pt(base, R);
  const aimEnd = pt(aim, R);
  const targetEnd = pt(target, R);
  const off = verdict ? signedDifference(verdict.aimed, target) : 0;

  const label = deflection
    ? `Deflection ${toDMS(angle)} ${direction}`
    : `Angle ${direction} ${toDMS(angle)}`;

  return (
    <div className="turn" data-testid="turn-angle">
      <p className="turn__ask">
        The instrument is set up with a backsight on azimuth <strong>{toDMS(backsight)}</strong>.
        Turn <strong>{label}</strong> and point the telescope at the foresight.
      </p>

      <svg
        ref={svgRef}
        className={`turn__dial${verdict && !verdict.correct ? ' turn__dial--wrong' : ''}`}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="slider"
        tabIndex={0}
        aria-label="Telescope direction. Drag, or use the arrow keys."
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(aim)}
        aria-valuetext={`${toDMS(aim)}${verdict ? (verdict.correct ? ' — correct' : ' — not right') : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <circle className="turn__face" cx={C} cy={C} r={R} />

        {/* Ticks every 30°, longer at the cardinals, so the dial can be read without a protractor. */}
        {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => {
          const outer = pt(a, R);
          const inner = pt(a, a % 90 === 0 ? R - 12 : R - 7);
          return <line key={a} className="turn__tick" x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />;
        })}
        <text className="turn__cardinal" x={C} y={16} textAnchor="middle">N</text>
        <text className="turn__cardinal" x={SIZE - 8} y={C + 4} textAnchor="middle">E</text>
        <text className="turn__cardinal" x={C} y={SIZE - 5} textAnchor="middle">S</text>
        <text className="turn__cardinal" x={10} y={C + 4} textAnchor="middle">W</text>

        {/* The back line. Dashed and grey: it is a reference, not an answer. When the angle is a
            deflection this is the EXTENSION, drawn from the far side, which is the whole point. */}
        <line className="turn__back" x1={C} y1={C} x2={backEnd.x} y2={backEnd.y} />
        <text
          className="turn__back-label"
          x={pt(base, R - 26).x}
          y={pt(base, R - 26).y}
          textAnchor="middle"
        >
          {deflection ? 'extension' : 'BS'}
        </text>

        {/* The correct line, only once they have committed. */}
        {verdict && (
          <line className="turn__target" x1={C} y1={C} x2={targetEnd.x} y2={targetEnd.y} />
        )}

        {/* The telescope. */}
        <line
          className={`turn__aim${verdict ? (verdict.correct ? ' turn__aim--right' : ' turn__aim--wrong') : ''}`}
          x1={C} y1={C} x2={aimEnd.x} y2={aimEnd.y}
        />
        <circle className="turn__handle" cx={aimEnd.x} cy={aimEnd.y} r={7} />
        <circle className="turn__hub" cx={C} cy={C} r={5} />
      </svg>

      <p className="turn__readout" aria-hidden="true">
        Telescope: <strong>{toDMS(aim)}</strong>
      </p>

      {!verdict ? (
        <div className="turn__actions">
          <button type="button" className="turn__btn turn__btn--primary" onClick={check} data-testid="turn-check">
            Check
          </button>
          <span className="turn__hint">Drag the handle, or use the arrow keys. Shift for fine steps.</span>
        </div>
      ) : (
        <div
          className={`turn__verdict turn__verdict--${verdict.correct ? 'right' : 'wrong'} ${OUTCOME_MOTION[verdict.correct ? 'right' : 'wrong'].className}`}
          role="status"
        >
          <span className="turn__verdict-icon">
            {verdict.correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
          </span>
          <div>
            <strong>{verdict.correct ? 'On the foresight.' : `${toDMS(Math.abs(off))} off.`}</strong>
            <p className="turn__why">
              {deflection ? (
                <>
                  A deflection is measured from the <em>extension</em> of the back line, so you start
                  from {toDMS(base)} — not from the backsight at {toDMS(backsight)} — and turn{' '}
                  {toDMS(angle)} {direction}. The foresight is {toDMS(target)}.
                </>
              ) : (
                <>
                  {toDMS(backsight)} {direction === 'right' ? '+' : '−'} {toDMS(angle)} ={' '}
                  {toDMS(target)}. Angle {direction} turns{' '}
                  {direction === 'right' ? 'clockwise' : 'anticlockwise'} from the backsight.
                </>
              )}
              {!verdict.correct && (
                <> You were {off > 0 ? 'anticlockwise of it' : 'clockwise of it'}.</>
              )}
            </p>
          </div>
          <button type="button" className="turn__again" onClick={reset} data-testid="turn-again">
            <RotateCcw size={13} aria-hidden /> Again
          </button>
        </div>
      )}
    </div>
  );
}
