'use client';

// app/admin/components/learn/NorthUp.tsx — turn the plan until north is up.
//
// Owner, 2026-09-20: "I want demonstrations and illustrations … or reorienting a drawing to the
// correct north."
//
// ── WHY THIS IS A REAL SKILL AND NOT A PUZZLE ───────────────────────────────────────────────────
//
// Plans arrive rotated. A plat drawn to fit the sheet, a scanned exhibit, a sketch someone made
// facing the other way — the north arrow points wherever it points, and every bearing on the
// drawing is measured from THAT north, not from the top of the page.
//
// The mistake is reading a line as "running up the page, so roughly north" when the arrow says the
// page is turned 40°. It is not an arithmetic mistake and no formula catches it; it comes from
// reading the drawing as if the sheet were the world.
//
// So: a parcel is drawn at some rotation, and you turn it until north points up. Then — and this is
// the part that makes it worth doing rather than a dexterity test — the bearing of the marked line
// is shown, and it has not changed. The line is where it always was. The only thing that moved is
// how easy it is to see.
//
// ── THE ARROW MOVES WITH THE DRAWING ────────────────────────────────────────────────────────────
//
// Everything inside one SVG group, rotated together. If the arrow were drawn separately and kept
// pointing at the answer, the exercise would be aligning two things on a screen rather than
// understanding that the drawing carries its own north.

import { useCallback, useRef, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import {
  azimuthFromPoint, normalize, signedDifference, snap, toDMS, withinTolerance,
} from '@/lib/learn/dial';
import { OUTCOME_MOTION } from '@/lib/learn/reveal';

export interface NorthUpProps {
  /** Where the drawing's north arrow points to begin with, in screen degrees clockwise from up. */
  startRotation?: number;
  /** The azimuth of the highlighted boundary line, in the real world. Unchanged by any rotation. */
  lineAzimuth?: number;
  toleranceDeg?: number;
  onAnswered?: (correct: boolean, rotation: number) => void;
}

const SIZE = 280;
const C = SIZE / 2;

/** A parcel. Deliberately irregular — a square would look the same at four rotations. */
const PARCEL = '-58,-40 46,-56 62,30 6,58 -52,34';

export default function NorthUp({
  startRotation = 128, lineAzimuth = 64, toleranceDeg = 6, onAnswered,
}: NorthUpProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // How far the drawing has been turned FROM its starting position, clockwise.
  const [turned, setTurned] = useState(0);
  const dragFrom = useRef<{ pointer: number; turned: number } | null>(null);
  const [verdict, setVerdict] = useState<null | { correct: boolean; arrowAt: number }>(null);

  /** Where the drawing's north arrow currently points on screen. 0 is up, which is the goal. */
  const arrowAt = normalize(startRotation + turned);

  const azimuthAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = svgRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const x = ((clientX - box.left) / box.width) * SIZE;
    const y = ((clientY - box.top) / box.height) * SIZE;
    return azimuthFromPoint(C, C, x, y);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (verdict) return;
    const az = azimuthAt(e.clientX, e.clientY);
    if (az === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // The grab point is recorded, and the drawing turns by the CHANGE since then. Setting the
    // rotation to the pointer angle directly would make the drawing jump to meet the cursor the
    // instant you touched it — which feels broken, and loses whatever you had already lined up.
    dragFrom.current = { pointer: az, turned };
  }, [azimuthAt, turned, verdict]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const from = dragFrom.current;
    if (!from || verdict) return;
    const az = azimuthAt(e.clientX, e.clientY);
    if (az === null) return;
    setTurned(snap(from.turned + signedDifference(from.pointer, az), 0.5));
  }, [azimuthAt, verdict]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragFrom.current = null;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (verdict) return;
    const step = e.shiftKey ? 1 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setTurned((t) => t + step); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setTurned((t) => t - step); }
  }, [verdict]);

  const check = useCallback(() => {
    const correct = withinTolerance(arrowAt, 0, toleranceDeg);
    setVerdict({ correct, arrowAt });
    onAnswered?.(correct, arrowAt);
  }, [arrowAt, toleranceDeg, onAnswered]);

  const reset = useCallback(() => { setVerdict(null); setTurned(0); }, []);

  /**
   * The marked line, drawn at its TRUE azimuth inside the drawing's own frame.
   *
   * Because the group is rotated by `arrowAt`, a line drawn here at `lineAzimuth` appears on screen
   * at `lineAzimuth + arrowAt` — which is the point. When the drawing is straight the line sits at
   * its real bearing, and until then it does not.
   */
  const lineEnd = (() => {
    const rad = ((lineAzimuth - 90) * Math.PI) / 180;
    return { x: 78 * Math.cos(rad), y: 78 * Math.sin(rad) };
  })();

  const offBy = verdict ? signedDifference(verdict.arrowAt, 0) : signedDifference(arrowAt, 0);

  return (
    <div className="northup" data-testid="north-up">
      <p className="northup__ask">
        This plat was drawn to fit the sheet, so its north arrow is not up the page. Turn the drawing
        until <strong>north points up</strong>.
      </p>

      <svg
        ref={svgRef}
        className={`northup__sheet${verdict && !verdict.correct ? ' northup__sheet--wrong' : ''}`}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="slider"
        tabIndex={0}
        aria-label="Plat drawing. Drag to rotate, or use the arrow keys."
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(arrowAt)}
        aria-valuetext={`North arrow points ${toDMS(arrowAt)} from up${verdict ? (verdict.correct ? ' — correct' : ' — not straight yet') : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* The sheet edge stays put. It is the page, and the page does not turn. */}
        <rect className="northup__page" x={12} y={12} width={SIZE - 24} height={SIZE - 24} rx={6} />
        {/* A guide up the page, so "up" is a visible thing to aim at rather than a feeling. */}
        <line className="northup__up" x1={C} y1={18} x2={C} y2={46} />
        <text className="northup__up-label" x={C} y={14} textAnchor="middle">up the page</text>

        <g transform={`rotate(${arrowAt} ${C} ${C})`} style={{ transformOrigin: `${C}px ${C}px` }}>
          <g transform={`translate(${C} ${C})`}>
            <polygon className="northup__parcel" points={PARCEL} />
            {/* The marked boundary, at its true bearing within the drawing. */}
            <line className="northup__line" x1={0} y1={0} x2={lineEnd.x} y2={lineEnd.y} />
            {/* The drawing's own north arrow, which turns with everything else. */}
            <line className="northup__arrow" x1={0} y1={0} x2={0} y2={-96} />
            <polygon className="northup__arrow-head" points="0,-108 -7,-92 7,-92" />
            <text className="northup__arrow-label" x={0} y={-114} textAnchor="middle">N</text>
          </g>
        </g>
      </svg>

      <p className="northup__readout" aria-hidden="true">
        North arrow is <strong>{toDMS(Math.abs(offBy))}</strong>{' '}
        {Math.abs(offBy) < 0.5 ? 'from up' : offBy > 0 ? 'anticlockwise of up' : 'clockwise of up'}
      </p>

      {!verdict ? (
        <div className="northup__actions">
          <button type="button" className="northup__btn northup__btn--primary" onClick={check} data-testid="northup-check">
            Check
          </button>
          <span className="northup__hint">Drag anywhere on the drawing, or use the arrow keys.</span>
        </div>
      ) : (
        <div
          className={`northup__verdict northup__verdict--${verdict.correct ? 'right' : 'wrong'} ${OUTCOME_MOTION[verdict.correct ? 'right' : 'wrong'].className}`}
          role="status"
        >
          <span className="northup__verdict-icon">
            {verdict.correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
          </span>
          <div>
            <strong>
              {verdict.correct ? 'North is up.' : `Still ${toDMS(Math.abs(offBy))} off.`}
            </strong>
            <p className="northup__why">
              The marked boundary bears <strong>{toDMS(lineAzimuth)}</strong>, and it bore that
              before you touched anything — a bearing is measured from the drawing&apos;s north, not
              from the top of the sheet. Turning the plat changed nothing about the parcel; it only
              made the bearing something you can see rather than something you have to work out.
              {!verdict.correct && (
                <> Keep turning {offBy > 0 ? 'clockwise' : 'anticlockwise'} until the arrow is up.</>
              )}
            </p>
          </div>
          <button type="button" className="northup__again" onClick={reset} data-testid="northup-again">
            <RotateCcw size={13} aria-hidden /> Again
          </button>
        </div>
      )}
    </div>
  );
}
