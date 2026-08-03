// Putting an old survey on the grid you are shooting — the entry point, not the arithmetic.
//
// `bearing-rotation.ts` has solved this since S4 and had no caller of any kind: no route, no page,
// no service. The one Phase I operation that a PERSON has to start, because it needs field
// measurements only they can supply, was the one with no way to start it.
//
// What these tests defend is mostly what the answer MEANS. The arithmetic has its own tests in the
// worker suite; the mistakes available HERE are about presenting a result as more certain than it is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  rotateRecord, observedScale, explainScale, formatRotationLabel, SCALE_NOTEWORTHY_PPM,
  type RecordCall,
} from '@/lib/research/rotation.service';

/** A 1000 ft square, bearings on an assumed north. */
const square: RecordCall[] = [
  { bearing: 'N 0°00\'00" E', distance: 1000 },
  { bearing: 'N 90°00\'00" E', distance: 1000 },
  { bearing: 'S 0°00\'00" E', distance: 1000 },
  { bearing: 'S 90°00\'00" W', distance: 1000 },
];

/** Rotate a point about the origin by `deg` clockwise-from-north, the way the grid would see it. */
function spin(p: { n: number; e: number }, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { n: p.n * Math.cos(r) - p.e * Math.sin(r), e: p.n * Math.sin(r) + p.e * Math.cos(r) };
}

describe('a record survey measured from a different north', () => {
  it('recovers the rotation from tied corners', () => {
    // The record's corners are at (1000,0), (1000,1000), (0,1000), (0,0); the ground sees them
    // turned 2°, which is the 1–3° the owner described.
    const ties = [
      { label: 'NE', callIndex: 0, measured: spin({ n: 1000, e: 0 }, 2) },
      { label: 'SE', callIndex: 1, measured: spin({ n: 1000, e: 1000 }, 2) },
      { label: 'SW', callIndex: 2, measured: spin({ n: 0, e: 1000 }, 2) },
    ];
    const r = rotateRecord(square, { kind: 'ties', ties });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rotationDeg).toBeCloseTo(2, 6);
    expect(r.rotated).toHaveLength(4);
    expect(r.rotated[0]!.rotatedAzimuthDeg).toBeCloseTo(2, 6);
  });

  it('does not change the shape — every internal angle survives', () => {
    // This is why rotation is the right operation and "fixing the bearings" is not: the internal
    // angles are the original surveyor's actual observations.
    const ties = [
      { label: 'A', callIndex: 0, measured: spin({ n: 1000, e: 0 }, 2) },
      { label: 'B', callIndex: 1, measured: spin({ n: 1000, e: 1000 }, 2) },
    ];
    const r = rotateRecord(square, { kind: 'ties', ties });
    if (!r.ok) return;
    const az = r.rotated.map((c) => c.rotatedAzimuthDeg);
    for (let i = 0; i + 1 < az.length; i++) {
      expect(((az[i + 1]! - az[i]!) + 360) % 360).toBeCloseTo(90, 6);
    }
    expect(r.caveats.join(' ')).toContain('SHAPE is untouched');
  });

  it('says the rotated bearings are not what the record says', () => {
    // A rotated bearing on a plat would be a misrecital of the record.
    const r = rotateRecord(square, {
      kind: 'ties',
      ties: [
        { label: 'A', callIndex: 0, measured: spin({ n: 1000, e: 0 }, 2) },
        { label: 'B', callIndex: 1, measured: spin({ n: 1000, e: 1000 }, 2) },
      ],
    });
    if (!r.ok) return;
    expect(r.caveats.join(' ')).toContain('must still recite the record call');
  });
});

describe('a robotic setup holding one line', () => {
  it('computes the rotation from a backsight', () => {
    const r = rotateRecord(square, {
      kind: 'backsight',
      recordBearing: 'N 0°00\'00" E',
      measuredBearing: 'N 2°00\'00" E',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rotationDeg).toBeCloseTo(2, 6);
  });

  it('marks it unchecked, because one line has no redundancy', () => {
    // If the backsight is on the wrong monument, every rotated call is wrong by the same amount and
    // the arithmetic looks perfect.
    const r = rotateRecord(square, {
      kind: 'backsight', recordBearing: 'N 0°00\'00" E', measuredBearing: 'N 2°00\'00" E',
    });
    if (!r.ok) return;
    expect(r.unchecked).toBe(true);
    expect(r.nextStep).toContain('second known record corner');
  });

  it('refuses a bearing it cannot read rather than defaulting to north', () => {
    const r = rotateRecord(square, {
      kind: 'backsight', recordBearing: 'illegible', measuredBearing: 'N 2°00\'00" E',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('illegible');
  });
});

describe('one tie is not a fit', () => {
  it('is flagged unchecked even though the residual is zero', () => {
    // The residual is zero by construction — not because the survey agrees with the ground, but
    // because there is nothing left over to disagree.
    const r = rotateRecord(square, {
      kind: 'ties',
      ties: [{ label: 'only', callIndex: 0, measured: { n: 1000, e: 35 } }],
    });
    if (!r.ok) return;
    expect(r.unchecked).toBe(true);
    expect(r.fit!.rmsResidual).toBe(0);
    expect(r.statement).toContain('ONE common point');
  });

  it('two ties still count as unchecked', () => {
    const r = rotateRecord(square, {
      kind: 'ties',
      ties: [
        { label: 'A', callIndex: 0, measured: spin({ n: 1000, e: 0 }, 2) },
        { label: 'B', callIndex: 1, measured: spin({ n: 1000, e: 1000 }, 2) },
      ],
    });
    if (!r.ok) return;
    expect(r.unchecked).toBe(true);
  });
});

describe('the scale is observed even when it is not fitted', () => {
  // The gap this found: fitRotation(points, false) returns `scale: 1` — a hardcoded constant, not an
  // observation. So on the DEFAULT path a record recited in varas and walked as feet came back with
  // enormous residuals and nothing naming the cause. The residuals say something is wrong; only the
  // ratio says the UNITS are wrong.
  const varaTies = [
    // The ground is 25/9 × the record: the description is in varas, walked as feet.
    { label: 'A', callIndex: 0, measured: { n: 1000 * (25 / 9), e: 0 } },
    { label: 'B', callIndex: 1, measured: { n: 1000 * (25 / 9), e: 1000 * (25 / 9) } },
    { label: 'C', callIndex: 2, measured: { n: 0, e: 1000 * (25 / 9) } },
  ];

  it('computes the ratio without fitting it', () => {
    const s = observedScale(varaTies.map((t) => ({
      label: t.label,
      record: [{ n: 1000, e: 0 }, { n: 1000, e: 1000 }, { n: 0, e: 1000 }][varaTies.indexOf(t)]!,
      measured: t.measured,
    })));
    expect(s).toBeCloseTo(25 / 9, 6);
  });

  it('names a vara as a vara instead of reporting a scale', () => {
    const r = rotateRecord(square, { kind: 'ties', ties: varaTies });
    if (!r.ok) return;
    expect(r.caveats.join(' ')).toContain('that is the VARA');
    expect(r.caveats.join(' ')).toContain('Fix the units');
  });

  it('does not APPLY a scale nobody asked for', () => {
    // Applying an observed scale would silently resize the boundary. The two numbers are kept apart
    // precisely so a diagnostic cannot be mistaken for a correction.
    const r = rotateRecord(square, { kind: 'ties', ties: varaTies });
    if (!r.ok) return;
    expect(r.appliedScale).toBe(1);
    expect(r.observedScale).toBeCloseTo(25 / 9, 6);
  });

  it('recognises a grid-versus-ground factor as expected rather than as a disagreement', () => {
    const s = explainScale(1.00009);
    expect(s).toContain('combined factor');
    expect(s).toContain('not a disagreement about the boundary');
  });

  it('says when a ratio is neither a grid factor nor a unit ratio', () => {
    expect(explainScale(1.05)).toContain('check that the tied corners are the corners the record calls for');
  });

  it('stays quiet about noise', () => {
    const tiny = 1 + (SCALE_NOTEWORTHY_PPM / 2) / 1_000_000;
    const ties = [
      { label: 'A', callIndex: 0, measured: { n: 1000 * tiny, e: 0 } },
      { label: 'B', callIndex: 1, measured: { n: 1000 * tiny, e: 1000 * tiny } },
      { label: 'C', callIndex: 2, measured: { n: 0, e: 1000 * tiny } },
    ];
    const r = rotateRecord(square, { kind: 'ties', ties });
    if (!r.ok) return;
    expect(r.caveats.join(' ')).not.toContain('combined factor');
  });

  it('needs two points to see a ratio at all', () => {
    expect(observedScale([{ label: 'A', record: { n: 0, e: 0 }, measured: { n: 5, e: 5 } }])).toBeNull();
  });
});

describe('what it refuses', () => {
  it('will not tie to a corner the record could not place', () => {
    const broken: RecordCall[] = [
      { bearing: 'illegible', distance: null },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
    ];
    const r = rotateRecord(broken, {
      kind: 'ties',
      ties: [{ label: 'bad', callIndex: 0, measured: { n: 10, e: 10 } }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('could not place');
  });

  it('keeps a usable tie when only some are unplaceable, and says which were dropped', () => {
    const mixed: RecordCall[] = [
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'illegible', distance: null },
    ];
    const r = rotateRecord(mixed, {
      kind: 'ties',
      ties: [
        { label: 'good', callIndex: 0, measured: { n: 1000, e: 0 } },
        { label: 'bad', callIndex: 1, measured: { n: 5, e: 5 } },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.caveats.join(' ')).toContain('"bad"');
  });

  it('refuses an empty description', () => {
    const r = rotateRecord([], { kind: 'backsight', recordBearing: 'N 0 E', measuredBearing: 'N 2 E' });
    expect(r.ok).toBe(false);
  });
});

describe('the rotation reads the way a surveyor says it', () => {
  it('names the sense instead of relying on a minus sign', () => {
    expect(formatRotationLabel(1.705)).toBe('1°42\'18" clockwise');
    expect(formatRotationLabel(-1.705)).toBe('1°42\'18" counter-clockwise');
  });
});

describe('the route exists and reaches the service', () => {
  // The whole reason for this slice: the arithmetic was unreachable.
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/research/[projectId]/rotation/route.ts'), 'utf8');

  it('calls rotateRecord', () => {
    expect(route).toContain('rotateRecord(body.calls, body.basis)');
  });

  it('requires a session', () => {
    expect(route).toContain('if (!session?.user?.email)');
  });

  it('returns a declined rotation as a 200 with its reason, not as an error', () => {
    // A reason delivered as a 4xx lands in an error toast, which is where reasons go to be dismissed.
    expect(route).toContain('return NextResponse.json(result);');
  });
});

describe('a person can actually reach it', () => {
  // The arithmetic existed since S4 with no route, no page and no button. A service and a route that
  // nothing opens repeats the same defect one layer up.
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/[projectId]/boundary/page.tsx'), 'utf8');
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/components/RotationPanel.tsx'), 'utf8');

  it('the boundary viewer renders the panel', () => {
    expect(page).toContain('import RotationPanel');
    expect(page).toContain('<RotationPanel');
  });

  it('has a control that opens it', () => {
    expect(page).toContain('setRotationOpen(true)');
  });

  it('hands the viewer\'s own calls to the panel', () => {
    // Re-fetching could rotate a description the person is not looking at.
    expect(page).toMatch(/calls=\{calls\.map/);
  });

  it('the panel posts to the rotation route', () => {
    expect(panel).toContain('/rotation`');
  });

  it('converts the 1-based call numbers the UI shows to the 0-based index the service takes', () => {
    // Off by one here ties every corner to the wrong call and still returns a plausible rotation.
    expect(panel).toContain('callIndex: Number(t.callIndex) - 1');
  });

  it('shows the unchecked warning above the rotation, not below it', () => {
    const warn = panel.indexOf('Nothing here can check this rotation');
    const value = panel.indexOf('{result.rotationLabel}');
    expect(warn).toBeGreaterThan(-1);
    expect(value).toBeGreaterThan(-1);
    expect(warn).toBeLessThan(value);
  });

  it('shows record and rotated bearings side by side', () => {
    expect(panel).toContain('the record call is never replaced');
    expect(panel).toContain('{c.recordBearing}');
    expect(panel).toContain('{c.rotatedBearing}');
  });

  it('says an observed scale was not applied when it was not', () => {
    expect(panel).toContain("result.appliedScale === 1 && ' (not applied)'");
  });
});
