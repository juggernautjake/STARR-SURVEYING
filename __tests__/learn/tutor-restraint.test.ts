// The tutor hints while a problem is open, and explains once it has been attempted.
//
// Owner, 2026-09-19, choosing how much the tutor should give away: "Knows the current chunk, won't
// give answers away — it sees the section you're on and your attempt, and it hints and explains
// rather than handing over the solution until you've submitted. Useful for learning without
// becoming a way to skip the problem."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const ROUTE = 'app/api/admin/learn/ai-tutor/route.ts';
const TUTOR = 'app/admin/components/learn/DeeperLearningTutor.tsx';
const PANEL = 'app/admin/components/learn/PracticePanel.tsx';
const PAGE = 'app/admin/learn/exam-prep/sit/module/[id]/page.tsx';

describe('the restraint itself', () => {
  const route = read(ROUTE);

  it('only applies while a problem is open and unattempted', () => {
    expect(route).toContain('problemOpen && !problemAttempted');
  });

  it('lifts entirely once they submit', () => {
    // Right or wrong. Somebody who has just been marked needs the whole explanation, and making
    // them earn it twice is the fastest way to make them stop asking.
    expect(route).toContain('problemOpen && problemAttempted');
    expect(route).toContain('Explain freely and completely');
  });

  it('does not muzzle the tutor when no problem is open', () => {
    // Reading a section, asking about a formula, revising afterwards — a tutor that withheld
    // explanations generally would be a worse tutor, not a stricter one.
    const guarded = route.slice(route.indexOf('THE STUDENT HAS A PROBLEM OPEN'));
    expect(guarded.length).toBeGreaterThan(0);
    expect(route.indexOf('...(problemOpen')).toBeGreaterThan(-1);
  });

  it('is written as a teaching stance, not as a refusal', () => {
    // What actually works on a model: "ask them what they have tried" produces a Socratic reply,
    // "do not reveal the answer" produces a closed door — and a closed door makes somebody shut
    // the panel.
    expect(route).toContain('DO help them get started');
    expect(route).toContain('a hint they can act on, not a closed door');
  });

  it('offers a similar problem rather than the one in front of them', () => {
    expect(route).toContain('work a SIMILAR problem with different numbers');
  });
});

describe('knowing which problem is open', () => {
  it('the panel reports each problem as unattempted when it opens', () => {
    const panel = read(PANEL);
    expect(panel).toContain('onProblemChange?.(current ? { statement: current.problem.question_text, attempted: false } : null)');
  });

  it('the panel reports the attempt the moment it is graded', () => {
    const panel = read(PANEL);
    expect(panel).toContain('attempted: true');
  });

  it('leaving practice clears it', () => {
    // Or the tutor goes on withholding answers about a problem that is no longer on screen.
    const panel = read(PANEL);
    expect(panel).toContain('useEffect(() => () => { onProblemChange?.(null); }');
  });

  it('the page hands it to the tutor lazily', () => {
    const page = read(PAGE);
    expect(page).toContain('getOpenProblem: () => openProblemRef.current');
    // A ref, not state: re-rendering the whole module page every time somebody moves to the next
    // problem would be a cost for nothing.
    expect(page).toContain('openProblemRef = useRef');
  });

  it('the tutor sends it with the message', () => {
    const tutor = read(TUTOR);
    expect(tutor).toContain('openProblem: context.getOpenProblem?.() ?? undefined');
  });
});

describe('practice from a formula', () => {
  it('every formula card offers it', () => {
    // Owner: "we have the formulas page, and I would need the opportunity to do practice problems
    // for the formulas."
    const page = read(PAGE);
    expect(page).toContain('fs-module__formula-practice');
    expect(page).toContain("onClick={() => setActiveTab('practice')}");
  });

  it('sends you to the practice panel rather than opening a second runner', () => {
    // The panel already owns the queue, the difficulty filter and the tally; a second problem
    // runner on the formulas tab would be a second place for that state to be wrong.
    const page = read(PAGE);
    expect(page).not.toMatch(/formulas[\s\S]{0,400}<MultiStepProblem/);
  });

  it('is styled, and stays reachable without a hover', () => {
    const css = read('app/admin/styles/AdminLearn.css');
    expect(css).toContain('.fs-module__formula-practice {');
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.fs-module__formula-practice \{ opacity: 1; \}/);
  });
});
