// lib/dnd/dice/throw.ts — the arc a thrown die travels, as a function of time.
//
// OWNER: *"I want it where it looks like the dice are actually being rolled … Please make it so that the impact
// dice roller looks even more like it is actually rolling like a real dice."*
//
// WHAT MAKES A THROW LOOK LIKE A THROW, and it is not the spinning. It is that the spin **slows down and stops
// on a particular face**. A die that spins at a constant rate and then cuts to its result looks like a slot
// machine; a die that decelerates, wobbles and settles looks thrown, because that is the part of the motion your
// eye actually reads. So the trajectory is built backwards from the answer: the rotation that puts the rolled
// face toward the camera is computed first, and everything before it is deceleration into that pose.
//
// THE RESULT IS NEVER DECIDED HERE (plan ground rule G2). `planThrow` is handed the landing face and finds a way
// to arrive at it. It cannot fail to show the right number — at t = 1 the orientation IS the landing orientation,
// exactly, and with animation off that is the only frame drawn.
//
// DETERMINISTIC FROM A SEED. Two dice in the same throw must tumble differently, and the same roll re-rendered
// must tumble identically — the roller adopts a roll already on screen rather than replaying it (RO-7), so a
// trajectory that re-randomised on mount would make switching template look like a re-roll.
import { type Solid, type Vec3 } from './solids';
import {
  type Quat,
  quatFromAxisAngle,
  quatMul,
  quatSlerp,
  orientationFor,
} from './project';

export interface ThrowPlan {
  /** Orientation at normalised time t ∈ [0, 1]. `at(1)` is exactly the settled pose. */
  at: (t: number) => Quat;
  /** The settled pose, for the reduced-motion path — one call, no animation. */
  settled: Quat;
  /** Impact times in [0, 1], for the audio to hit in step with the tumble. */
  impacts: number[];
}

/** A small deterministic PRNG (mulberry32). Same seed, same throw, forever. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 0→1 with zero slope at both ends — the die eases into its final pose instead of arriving abruptly. */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Plan a throw that lands `landingFace` toward the camera.
 *
 * Three things happen at once, and the blend between them is the whole effect:
 *
 * 1. **Tumble** — two simultaneous rotations about different axes, so the die turns over rather than spinning
 *    like a coin. One axis alone reads as a wheel however fast it goes.
 * 2. **Deceleration** — angle accumulates as `1 − (1 − t)³`, so most of the turning happens early and the last
 *    quarter of the throw is slow. This is the part that says "thrown".
 * 3. **Settle** — from about 60% of the way through, the tumble is slerped into the landing orientation. By t = 1
 *    the blend weight is exactly 1, so the final frame is the landing pose to the last bit.
 *
 * The impact times are drawn from the same deceleration curve: hits come thick and fast at first and thin out,
 * which is what a die bouncing across a table actually sounds like.
 */
export function planThrow(seed: number, solid: Solid, landingFace: number): ThrowPlan {
  const rand = rng(seed);

  // Two tumble axes, biased away from the view axis: a die rotating mostly about z looks like a spun coin.
  const axisA: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand() * 0.5 - 0.25];
  const axisB: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand() * 0.5 - 0.25];
  // Several full turns, so the faces genuinely cycle past rather than rocking.
  const turnsA = 2.5 + rand() * 2.5;
  const turnsB = 1.5 + rand() * 2;
  // A final spin about the view axis, so two rolls of the same number do not land identically.
  const settled = orientationFor(solid, landingFace, rand() * Math.PI * 2);

  const at = (tRaw: number): Quat => {
    const t = Math.min(1, Math.max(0, tRaw));
    const eased = 1 - Math.pow(1 - t, 3); // fast, then slow
    const tumble = quatMul(
      quatFromAxisAngle(axisA, turnsA * 2 * Math.PI * eased),
      quatFromAxisAngle(axisB, turnsB * 2 * Math.PI * eased),
    );
    // Hand over to the landing pose across the back half. Starting the blend earlier looks like the die is
    // steered; later looks like it snaps.
    const w = smoothstep(0.58, 1, t);
    return w <= 0 ? tumble : w >= 1 ? settled : quatSlerp(tumble, settled, w);
  };

  // Impacts thin out as the die slows: uniform in "rotation progressed", which bunches them early in time.
  const impacts: number[] = [];
  const HITS = 7;
  for (let i = 1; i <= HITS; i++) {
    const progress = i / (HITS + 1);
    impacts.push(1 - Math.cbrt(1 - progress));
  }
  impacts.push(1); // the settle clack

  return { at, settled, impacts };
}

/**
 * A stable seed for one die in one roll. The token identifies the roll and the index the die within it, so every
 * die in a handful tumbles differently and the whole handful is reproducible.
 */
export function throwSeed(token: number, dieIndex: number): number {
  return (Math.abs(Math.trunc(token)) * 2654435761 + dieIndex * 40503) >>> 0;
}
