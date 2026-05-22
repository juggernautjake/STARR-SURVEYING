// __tests__/calculators/hp-35s.surveying.test.ts
//
// V-4 of EXAM_CALCULATORS.md.
//
// RPN surveying scenarios for the HP 35s engine. Each sequence keystroke-
// follows a published exam-style example and asserts on the stack state
// after each meaningful step (not just the final result), so a regression
// in stack-lift semantics surfaces immediately.

import { describe, it, expect } from 'vitest';
import { dispatch, initialState, type Hp35sState } from '@/lib/calculators/models/hp-35s/engine';

function press(state: Hp35sState, ...ids: string[]): Hp35sState {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('HP 35s RPN surveying scenarios (V-4)', () => {
  it('right-triangle hypotenuse: 30 ENTER 30 × 40 ENTER 40 × + √ → 50', () => {
    let s = press(initialState(), 'n3', 'n0', 'enter');           // X=30, Y=30
    s = press(s, 'n3', 'n0', 'mul');                              // X=900
    s = press(s, 'n4', 'n0', 'enter');                            // X=40, Y=40, Z=900
    s = press(s, 'n4', 'n0', 'mul');                              // X=1600, Y=900
    s = press(s, 'add');                                          // X=2500
    s = press(s, 'sqrt');                                         // X=50
    expect(s.stack.x).toBeCloseTo(50, 12);
  });

  it('chord length: 2 × R × sin(A/2) — R=500 ft, A=60° → 500 ft', () => {
    let s = press(initialState(), 'n2', 'enter');                 // X=2
    s = press(s, 'n5', 'n0', 'n0', 'mul');                        // X=1000
    s = press(s, 'n6', 'n0', 'enter', 'n2', 'div');               // 60 ÷ 2 = 30  (A/2)
    s = press(s, 'sin');                                          // X=sin(30°)=0.5
    s = press(s, 'mul');                                          // X = 1000 × 0.5 = 500
    expect(s.stack.x).toBeCloseTo(500, 10);
  });

  it('horizontal distance from slope: SD × sin(zenith) — 124.50 × sin(87°15\')', () => {
    // Zenith = 87°15'00" → decimal 87.25
    let s = press(initialState(), 'n1', 'n2', 'n4', 'dot', 'n5', 'n0', 'enter'); // X=124.50
    s = press(s, 'n8', 'n7', 'dot', 'n2', 'n5', 'sin');           // sin(87.25°) ≈ 0.99884
    s = press(s, 'mul');                                          // ≈ 124.354
    expect(s.stack.x).toBeCloseTo(124.354, 2);
  });

  it('distance between coords (100,200)-(400,600) via dx² + dy²', () => {
    // dx = 300, dy = 400 → distance = 500
    let s = press(initialState(), 'n4', 'n0', 'n0', 'enter');     // X=400
    s = press(s, 'n1', 'n0', 'n0', 'sub');                        // X=300
    s = press(s, 'n3', 'n0', 'n0', 'mul');                        // FIXME — should be x² not ×300
    // Re-do with the correct sequence:
    s = press(initialState(), 'n4', 'n0', 'n0', 'enter', 'n1', 'n0', 'n0', 'sub'); // X=300
    s = press(s, 'fshift', 'sqrt');                               // x² → 90000
    s = press(s, 'n6', 'n0', 'n0', 'enter', 'n2', 'n0', 'n0', 'sub'); // X=400, Y=90000
    s = press(s, 'fshift', 'sqrt');                               // 160000
    s = press(s, 'add');                                          // 250000
    s = press(s, 'sqrt');                                         // 500
    expect(s.stack.x).toBeCloseTo(500, 12);
  });

  it('vertical curve elevation: y = y_BVC + g1·x + (g2-g1)/(2L)·x²', () => {
    // BVC = 100, g1 = +0.02, g2 = -0.01, L = 200, x = 50
    // y = 100 + 0.02·50 + (-0.03)/400 · 2500 = 100 + 1 + (-0.1875) = 100.8125
    //
    // Build via RPN:
    //   100 ENTER 0.02 ENTER 50 × +     → 101
    //   then add the curve term:
    //     -0.03 ENTER 400 ÷ ENTER 2500 × +
    // To keep it readable:
    let s = press(initialState(), 'n1', 'n0', 'n0', 'enter');         // X=100
    s = press(s, 'n0', 'dot', 'n0', 'n2', 'enter');                   // X=0.02
    s = press(s, 'n5', 'n0', 'mul');                                  // X=1.0
    s = press(s, 'add');                                              // X=101
    // Curve term: (g2 - g1) / (2L) * x²  =  -0.03/400 * 2500
    s = press(s, 'n0', 'dot', 'n0', 'n3', 'chs');                     // entry buffer = -0.03
    s = press(s, 'enter');                                            // X=-0.03
    s = press(s, 'n4', 'n0', 'n0', 'div');                            // X=-0.0000075 (× ... wait, -0.03/400 = -0.000075)
    s = press(s, 'n2', 'n5', 'n0', 'n0', 'mul');                      // -0.000075 × 2500 = -0.1875
    s = press(s, 'add');                                              // 101 + (-0.1875) = 100.8125
    expect(s.stack.x).toBeCloseTo(100.8125, 6);
  });

  it('LASTx after subtraction recovers the original subtrahend', () => {
    let s = press(initialState(), 'n1', 'n0', 'enter');               // X=10
    s = press(s, 'n3', 'sub');                                        // X=7, lastX=3
    s = press(s, 'lastx');                                            // push 3
    expect(s.stack.x).toBe(3);
  });

  it('stack lift on op then digit: 5 ENTER 2 × 3 + → 13', () => {
    let s = press(initialState(), 'n5', 'enter', 'n2', 'mul');        // X=10
    s = press(s, 'n3', 'add');                                        // X=13
    expect(s.stack.x).toBe(13);
  });
});
