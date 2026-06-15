// __tests__/admin-styling/s2-contract.test.ts
//
// mobile-and-customer-query-gap Slice S2 — web admin design-system
// audit. Locks the contract doc + the migration of every drift name
// the audit identified on the surfaces this plan touched (leads list
// + detail). A future feature can re-introduce a drift name only by
// updating BOTH the doc AND the canonical token table.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('docs/admin-styling-contract.md — present + complete', () => {
  const DOC = read('docs/admin-styling-contract.md');

  it('points at the single source of truth for tokens', () => {
    expect(DOC).toContain('app/styles/tokens.css');
  });

  it('declares the drift → canonical migration table', () => {
    expect(DOC).toMatch(/`--color-primary`[\s\S]*?`--color-brand-navy`/);
    expect(DOC).toMatch(/`--color-surface`[\s\S]*?`--color-bg-card`/);
    expect(DOC).toMatch(/`--color-surface-2`[\s\S]*?`--color-bg-subtle`/);
    expect(DOC).toMatch(/`--color-on-status`[\s\S]*?`--color-text-on-brand`/);
  });

  it('documents the responsive breakpoints + the personas they serve', () => {
    expect(DOC).toMatch(/≤ 480 px/);
    expect(DOC).toMatch(/481–768 px/);
    expect(DOC).toMatch(/769–1023 px/);
    expect(DOC).toMatch(/≥ 1024 px/);
    expect(DOC).toMatch(/44 pt/);
  });

  it('captures the empty / loading / error state contract', () => {
    expect(DOC).toMatch(/data-state="loading"/);
    expect(DOC).toMatch(/data-state="empty"/);
    expect(DOC).toMatch(/data-state="filtered-empty"/);
    expect(DOC).toMatch(/data-state="not-found"/);
    expect(DOC).toMatch(/data-state="error"/);
  });
});

describe('Leads.css — drift names purged (S2 migration)', () => {
  const CSS = read('app/admin/styles/Leads.css');

  it('no `--color-primary` references remain', () => {
    expect(CSS).not.toMatch(/--color-primary[\s,)]/);
  });

  it("no `--color-surface` references remain (the canonical name is `--color-bg-card`)", () => {
    // Must be careful to not flag `--color-bg-card`; lock by leading dash.
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });

  it('no `--color-on-status` references remain', () => {
    expect(CSS).not.toMatch(/--color-on-status/);
  });

  it('uses the canonical brand-navy + bg-card + text-on-brand tokens', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).toMatch(/var\(--color-text-on-brand\)/);
  });
});

describe('leads/[id]/page.tsx — drift names purged (S2 migration)', () => {
  const PAGE = read('app/admin/leads/[id]/page.tsx');

  it('no `--color-surface-2` reference', () => {
    expect(PAGE).not.toMatch(/--color-surface-2/);
  });

  it('the customer-notes background uses --color-bg-subtle', () => {
    expect(PAGE).toMatch(/background: 'var\(--color-bg-subtle\)'/);
  });

  it('no `--color-border` reference inside the DetailRow + grid blocks', () => {
    expect(PAGE).not.toMatch(/--color-border/);
  });
});
