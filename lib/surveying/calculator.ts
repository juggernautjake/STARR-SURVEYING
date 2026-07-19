// lib/surveying/calculator.ts — the operation CATALOG for the Work Mode surveying calculator (owner 2026-07-18:
// "the best formatted calculator for all surveying work … easy to use and intuitive"). The math already lives
// in focused modules (convert / triangle / traverse / angles / math); this ties them into ONE ordered,
// UI-ready list of operations, each declaring its inputs + a pure `compute`. A calculator screen renders this
// catalog and never re-implements a formula — so the buttons and the math can't drift. Pure + tested: every
// op's compute is exercised. No redundancy — each compute just calls the existing function.
import { bearingToAzimuth, type Quadrant } from '@/lib/calculators/bearing-azimuth/convert';
import { formatAzimuth, formatBearing } from '@/lib/cad/geometry/bearing';
import {
  addAngles, subtractAngles, complement, supplement,
  pythagoreanHypotenuse, pythagoreanLeg, lawOfSinesSide, lawOfSinesAngle, lawOfCosinesSide, lawOfCosinesAngle,
} from '@/lib/surveying/triangle';
import { latitudeDeparture } from '@/lib/surveying/traverse';
import { backAzimuth, deflectionAngle, interiorAngle } from '@/lib/surveying/angles';

export type OpCategory = 'convert' | 'angle' | 'triangle' | 'traverse';

export interface OpInput {
  key: string;
  label: string;
  /** 'number' — decimal degrees or a length; 'quadrant' — one of NE/SE/SW/NW. */
  kind: 'number' | 'quadrant';
}
export type OpResult = { value: string } | { error: string };
export interface SurveyingOperation {
  id: string;
  label: string;
  category: OpCategory;
  inputs: OpInput[];
  /** Pure compute over the named inputs (numbers, or a quadrant string). Returns a formatted value or an error
   *  message — never throws, never returns NaN (impossible inputs surface as a friendly error). */
  compute: (args: Record<string, number | string>) => OpResult;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const orErr = (v: number | null | undefined, fmt: (n: number) => string, err = 'Not possible with those values.'): OpResult =>
  v == null || !Number.isFinite(v) ? { error: err } : { value: fmt(v) };
const deg = (n: number) => `${(Math.round(n * 1e4) / 1e4)}°`;
const len = (n: number) => `${Math.round(n * 1e4) / 1e4}`;

export const SURVEYING_OPERATIONS: SurveyingOperation[] = [
  // ── Conversions ──
  {
    id: 'bearing-to-azimuth', label: 'Bearing → Azimuth', category: 'convert',
    inputs: [{ key: 'quadrant', label: 'Quadrant', kind: 'quadrant' }, { key: 'angle', label: 'Angle (°)', kind: 'number' }],
    compute: (a) => orErr(bearingToAzimuth(a.quadrant as Quadrant, num(a.angle)), (n) => formatAzimuth(n)),
  },
  {
    id: 'azimuth-to-bearing', label: 'Azimuth → Bearing', category: 'convert',
    inputs: [{ key: 'azimuth', label: 'Azimuth (°)', kind: 'number' }],
    compute: (a) => {
      const az = num(a.azimuth);
      if (!Number.isFinite(az)) return { error: 'Enter an azimuth.' };
      return { value: formatBearing(az) };
    },
  },
  // ── Angle arithmetic ──
  { id: 'angle-add', label: 'Add angles', category: 'angle', inputs: [{ key: 'a', label: 'A (°)', kind: 'number' }, { key: 'b', label: 'B (°)', kind: 'number' }], compute: (a) => orErr(addAngles(num(a.a), num(a.b)), deg) },
  { id: 'angle-subtract', label: 'Subtract angles', category: 'angle', inputs: [{ key: 'a', label: 'A (°)', kind: 'number' }, { key: 'b', label: 'B (°)', kind: 'number' }], compute: (a) => orErr(subtractAngles(num(a.a), num(a.b)), deg) },
  { id: 'complement', label: 'Complement (90−a)', category: 'angle', inputs: [{ key: 'a', label: 'Angle (°)', kind: 'number' }], compute: (a) => orErr(complement(num(a.a)), deg, 'Complement needs 0–90°.') },
  { id: 'supplement', label: 'Supplement (180−a)', category: 'angle', inputs: [{ key: 'a', label: 'Angle (°)', kind: 'number' }], compute: (a) => orErr(supplement(num(a.a)), deg, 'Supplement needs 0–180°.') },
  { id: 'back-azimuth', label: 'Back-azimuth', category: 'angle', inputs: [{ key: 'az', label: 'Azimuth (°)', kind: 'number' }], compute: (a) => orErr(backAzimuth(num(a.az)), deg) },
  {
    id: 'deflection', label: 'Deflection angle', category: 'angle',
    inputs: [{ key: 'from', label: 'From az (°)', kind: 'number' }, { key: 'to', label: 'To az (°)', kind: 'number' }],
    compute: (a) => { const d = deflectionAngle(num(a.from), num(a.to)); return d ? { value: `${deg(d.angle)} ${d.direction}` } : { error: 'Enter both directions.' }; },
  },
  { id: 'interior-angle', label: 'Interior angle', category: 'angle', inputs: [{ key: 'in', label: 'Incoming az (°)', kind: 'number' }, { key: 'out', label: 'Outgoing az (°)', kind: 'number' }], compute: (a) => orErr(interiorAngle(num(a.in), num(a.out)), deg) },
  // ── Triangles ──
  { id: 'pyth-hyp', label: 'Pythagorean: hypotenuse', category: 'triangle', inputs: [{ key: 'a', label: 'Leg a', kind: 'number' }, { key: 'b', label: 'Leg b', kind: 'number' }], compute: (a) => orErr(pythagoreanHypotenuse(num(a.a), num(a.b)), len) },
  { id: 'pyth-leg', label: 'Pythagorean: leg', category: 'triangle', inputs: [{ key: 'hyp', label: 'Hypotenuse', kind: 'number' }, { key: 'leg', label: 'Known leg', kind: 'number' }], compute: (a) => orErr(pythagoreanLeg(num(a.hyp), num(a.leg)), len) },
  { id: 'los-side', label: 'Law of sines: side', category: 'triangle', inputs: [{ key: 'side', label: 'Known side', kind: 'number' }, { key: 'known', label: 'Its angle (°)', kind: 'number' }, { key: 'want', label: 'Wanted angle (°)', kind: 'number' }], compute: (a) => orErr(lawOfSinesSide(num(a.side), num(a.known), num(a.want)), len) },
  { id: 'los-angle', label: 'Law of sines: angle', category: 'triangle', inputs: [{ key: 'want', label: 'Side opp. wanted', kind: 'number' }, { key: 'known', label: 'Known side', kind: 'number' }, { key: 'angle', label: 'Its angle (°)', kind: 'number' }], compute: (a) => orErr(lawOfSinesAngle(num(a.want), num(a.known), num(a.angle)), deg) },
  { id: 'loc-side', label: 'Law of cosines: side', category: 'triangle', inputs: [{ key: 'a', label: 'Side a', kind: 'number' }, { key: 'b', label: 'Side b', kind: 'number' }, { key: 'C', label: 'Included angle (°)', kind: 'number' }], compute: (a) => orErr(lawOfCosinesSide(num(a.a), num(a.b), num(a.C)), len) },
  { id: 'loc-angle', label: 'Law of cosines: angle', category: 'triangle', inputs: [{ key: 'a', label: 'Side a', kind: 'number' }, { key: 'b', label: 'Side b', kind: 'number' }, { key: 'c', label: 'Side c (opposite)', kind: 'number' }], compute: (a) => orErr(lawOfCosinesAngle(num(a.a), num(a.b), num(a.c)), deg) },
  // ── Traverse ──
  {
    id: 'lat-dep', label: 'Latitude & departure', category: 'traverse',
    inputs: [{ key: 'az', label: 'Azimuth (°)', kind: 'number' }, { key: 'dist', label: 'Distance', kind: 'number' }],
    compute: (a) => { const ld = latitudeDeparture(num(a.az), num(a.dist)); return ld ? { value: `Lat ${len(ld.latitude)} · Dep ${len(ld.departure)}` } : { error: 'Enter azimuth + distance.' }; },
  },
];

/** Operations grouped by category, in catalog order — the shape a tabbed calculator UI renders. */
export function operationsByCategory(): [OpCategory, SurveyingOperation[]][] {
  const order: OpCategory[] = ['convert', 'angle', 'triangle', 'traverse'];
  return order.map((cat) => [cat, SURVEYING_OPERATIONS.filter((o) => o.category === cat)]);
}

/** Look up one operation by id. */
export function findOperation(id: string): SurveyingOperation | undefined {
  return SURVEYING_OPERATIONS.find((o) => o.id === id);
}
