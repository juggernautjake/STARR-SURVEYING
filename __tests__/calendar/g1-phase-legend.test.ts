// __tests__/calendar/g1-phase-legend.test.ts
//
// job-calendar Slice G1 — phase-color tokens + interactive legend.
// Locks the token table additions, the page wiring for the legend +
// hidden-phase filter, and the legend CSS contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PHASE_COLORS } from '@/lib/calendar/month-grid';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('tokens.css — G1 phase-color tokens', () => {
  const SRC = read('app/styles/tokens.css');

  it('declares --color-phase-research / field-work / drawing-deliverables', () => {
    expect(SRC).toMatch(/--color-phase-research:[\s\S]*?#[0-9A-Fa-f]{6}/);
    expect(SRC).toMatch(/--color-phase-field-work:[\s\S]*?#[0-9A-Fa-f]{6}/);
    expect(SRC).toMatch(/--color-phase-drawing-deliverables:[\s\S]*?#[0-9A-Fa-f]{6}/);
  });

  it('CSS tokens match the React-side PHASE_COLORS source of truth', () => {
    const expectPair = (cssName: string, jsKey: string) => {
      const re = new RegExp(`--color-phase-${cssName}:\\s*([#0-9A-Fa-f]+)`);
      const m = SRC.match(re);
      expect(m, `token --color-phase-${cssName} not found`).toBeTruthy();
      expect(m![1].toUpperCase()).toBe(PHASE_COLORS[jsKey].toUpperCase());
    };
    expectPair('research', 'research');
    expectPair('field-work', 'field_work');
    expectPair('drawing-deliverables', 'drawing_deliverables');
  });
});

describe('/admin/calendar/page.tsx — G1 legend wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('holds a Set<string> of hidden phases in component state', () => {
    expect(SRC).toMatch(/const \[hiddenPhases, setHiddenPhases\] = useState<Set<string>>/);
  });

  it('exposes a togglePhase that flips a phase in/out of the set', () => {
    expect(SRC).toMatch(/const togglePhase = useCallback\(\(phase: string\)/);
    expect(SRC).toMatch(/if \(next\.has\(phase\)\) next\.delete\(phase\);/);
    expect(SRC).toMatch(/else next\.add\(phase\);/);
  });

  it('filters events through hiddenPhases BEFORE grouping into the day map', () => {
    expect(SRC).toMatch(
      /const visibleEvents = useMemo\([\s\S]*?events\.filter\(\(e\) => !hiddenPhases\.has\(e\.event_type\)\)/,
    );
    expect(SRC).toMatch(/groupEventsByDay\(visibleEvents\)/);
  });

  it('renders three legend chips with stable phase + action data-attrs', () => {
    expect(SRC).toMatch(/data-testid="calendar-legend"/);
    expect(SRC).toMatch(/data-action=\{`toggle-phase-\$\{phase\}`\}/);
    expect(SRC).toMatch(/data-phase=\{phase\}/);
  });

  it('marks the hidden state via data-hidden so the CSS can mute the chip', () => {
    expect(SRC).toMatch(/data-hidden=\{hidden \? 'true' : undefined\}/);
  });

  it('each swatch uses the React-side PHASE_COLORS map (one source of truth)', () => {
    expect(SRC).toMatch(/background: PHASE_COLORS\[phase\]/);
  });
});

describe('Calendar.css — G1 legend styling', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the legend container + chip', () => {
    expect(CSS).toMatch(/\.calendar-page__legend \{/);
    expect(CSS).toMatch(/\.calendar-page__legend-chip \{/);
  });

  it('mutes the chip under [data-hidden] so users see what is filtered', () => {
    expect(CSS).toMatch(/\.calendar-page__legend-chip\[data-hidden='true'\] \{[\s\S]*?opacity:/);
  });

  it('swatch is a small pill', () => {
    expect(CSS).toMatch(/\.calendar-page__legend-swatch \{[\s\S]*?border-radius: 999px/);
  });

  it('still passes the no-drift admin styling contract', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
