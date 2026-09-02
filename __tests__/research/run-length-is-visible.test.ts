import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildRunState, chosenBudgetMs, formatElapsed } from '@/lib/research/run-state';

// D3 — "surface the chosen run length on the run view: '24 of 30 minutes' is only meaningful when
// the 30 is visible."
//
// The line existed and rendered only when the run-console had supplied a `budgetMs`. That arrives
// after the console is fetched and only when the run record carries a ceiling, so for the opening
// stretch of every run — and for any run whose console read failed — the screen showed an elapsed
// clock counting up against nothing. "24 minutes" tells a reader nothing about whether to keep
// waiting.
//
// The run's CHOSEN length is known the moment it starts: the operator picked it in the dialog and it
// travels on the run's settings.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the chosen run length stands in until the console has one', () => {
  it('CONTROL: no settings means no invented ceiling', () => {
    // The failure this must not have is a confident default. A run with no known length must show no
    // ceiling rather than "of 30 minutes" for a run nobody configured at 30.
    expect(chosenBudgetMs(null)).toBeNull();
    expect(chosenBudgetMs({})).toBeNull();
  });

  it('reads the length the operator picked', () => {
    expect(chosenBudgetMs({ maxResearchTimeMinutes: 30 })).toBe(30 * 60_000);
    expect(chosenBudgetMs({ maxResearchTimeMinutes: 15 })).toBe(15 * 60_000);
    expect(chosenBudgetMs({ maxResearchTimeMinutes: 60 })).toBe(60 * 60_000);
  });

  it('treats an out-of-range value as absent rather than clamping it', () => {
    // Settings are data off the wire. Clamping 600 to 60 would render a ceiling nobody chose, and a
    // confident wrong number is worse here than no number: the operator would stop waiting early.
    expect(chosenBudgetMs({ maxResearchTimeMinutes: 600 })).toBeNull();
    expect(chosenBudgetMs({ maxResearchTimeMinutes: 1 })).toBeNull();
    expect(chosenBudgetMs({ maxResearchTimeMinutes: Number.NaN })).toBeNull();
    expect(chosenBudgetMs({ maxResearchTimeMinutes: '30' as unknown as number })).toBeNull();
  });

  it('the console wins when it has an answer', () => {
    // The console reads the run record, which is what the worker actually enforced. If the two
    // disagree, the enforced one is the true one.
    const state = buildRunState({
      poll: { status: 'running', settings: { maxResearchTimeMinutes: 30 } } as never,
      console: { time: { elapsedMs: 0, budgetMs: 45 * 60_000, fractionUsed: 0, looksStalled: false, headline: '' } } as never,
    });
    expect(state.budgetMs).toBe(45 * 60_000);
  });

  it('and the chosen length fills the gap before it does', () => {
    const state = buildRunState({
      poll: { status: 'running', settings: { maxResearchTimeMinutes: 30 } } as never,
      console: null,
    });
    expect(state.budgetMs, 'the run view has no ceiling to show').toBe(30 * 60_000);
  });

  it('a run with neither shows no ceiling at all', () => {
    const state = buildRunState({ poll: { status: 'running' } as never, console: null });
    expect(state.budgetMs).toBeNull();
  });
});

describe('the run view puts the ceiling where the clock is', () => {
  const VIEW = read('app/admin/research/components/ResearchRunView.tsx');

  it('the elapsed counter shows elapsed AND the ceiling', () => {
    // It read `value={formatElapsed(state.elapsedMs)}` — a number with nothing to measure it against,
    // in the one place a person looks for the time.
    expect(VIEW).toContain('formatElapsed(state.elapsedMs)} / ${formatElapsed(state.budgetMs)');
  });

  it('falls back to the bare clock when there is no ceiling', () => {
    // Rendering "12:34 / 00:00" would be worse than the original.
    const at = VIEW.indexOf('label="Elapsed"');
    const block = VIEW.slice(at, at + 700);
    expect(block).toContain('state.budgetMs != null');
  });

  it('says what the ceiling MEANS, not just its value', () => {
    // A budget stop is not a failure — that is the whole of the run-state work — so the hint says
    // what happens at the ceiling rather than leaving a reader to assume the run dies there.
    const at = VIEW.indexOf('label="Elapsed"');
    const block = VIEW.slice(at, at + 700);
    expect(block).toMatch(/stops there and keeps what it found/i);
  });
});

describe('formatElapsed renders a ceiling sensibly', () => {
  it('30 minutes reads as 30:00, not 1800', () => {
    expect(formatElapsed(30 * 60_000)).toBe('30:00');
  });

  it('an hour keeps its hour', () => {
    expect(formatElapsed(60 * 60_000)).toBe('1:00:00');
  });
});
