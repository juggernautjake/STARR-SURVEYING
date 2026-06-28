// __tests__/leads/s1b-list-card-polish.test.ts
//
// mobile-and-customer-query-gap Slice S1b — list-page card design
// upgrade. Locks the new lead-card structure + the responsive CSS
// rules so a future refactor can't quietly lose the phone /
// tablet polish.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('leads list page — S1b card polish', () => {
  const SRC = read('app/admin/leads/page.tsx');

  it('imports the dedicated Leads.css stylesheet', () => {
    expect(SRC).toMatch(/import '\.\.\/styles\/Leads\.css';/);
  });

  it('scopes the page wrapper with the .leads-page class so CSS overrides bind', () => {
    expect(SRC).toMatch(/className="jobs-page leads-page"/);
  });

  it('renders the new .lead-card markup (data-testid + status colour CSS variable)', () => {
    expect(SRC).toMatch(/className="lead-card"/);
    expect(SRC).toMatch(/data-testid="lead-card"/);
    expect(SRC).toMatch(/'--lead-status-color': statusOption\?\.color \?\? '#6B7280'/);
  });

  it('shows a status pill + relative-age timestamp in the card header', () => {
    expect(SRC).toMatch(/className="lead-card__status"/);
    expect(SRC).toMatch(/className="lead-card__age"/);
    expect(SRC).toMatch(/formatRelativeAge\(lead\.created_at\)/);
  });

  it('phone / email render as tel:/mailto: links for one-tap contact', () => {
    expect(SRC).toMatch(/href=\{`mailto:\$\{lead\.email\}`\}/);
    // Phone now routes through phoneHref() (normalises digits for the dialler)
    // with a raw `tel:${lead.phone}` fallback — still a one-tap tel: link.
    expect(SRC).toMatch(/href=\{phoneHref\(lead\.phone\) \?\? `tel:\$\{lead\.phone\}`\}/);
  });

  it('exposes an Open → link to the detail page on every card', () => {
    expect(SRC).toMatch(/href=\{`\/admin\/leads\/\$\{lead\.id\}`\}/);
    expect(SRC).toMatch(/data-action="view-detail"/);
  });

  it('keeps the Q3b Mark contacted CTA conditional on status === new', () => {
    expect(SRC).toMatch(/\{lead\.status === 'new' && \(/);
    expect(SRC).toMatch(/data-action="mark-contacted"/);
  });

  it('the Delete button stays as the danger-class variant', () => {
    expect(SRC).toMatch(/className="lead-card__btn lead-card__btn--danger"/);
    expect(SRC).toMatch(/data-action="delete-lead"/);
  });
});

describe('formatRelativeAge — pure helper inline in page.tsx', () => {
  const SRC = read('app/admin/leads/page.tsx');

  it('covers minutes / hours / days / months / years', () => {
    expect(SRC).toMatch(/`\$\{min\}m ago`/);
    expect(SRC).toMatch(/`\$\{hr\}h ago`/);
    expect(SRC).toMatch(/`\$\{day\}d ago`/);
    expect(SRC).toMatch(/`\$\{mo\}mo ago`/);
    expect(SRC).toMatch(/`\$\{yr\}y ago`/);
  });

  it("returns 'just now' for sub-minute deltas + future dates", () => {
    expect(SRC).toMatch(/return 'just now'/);
  });

  it('returns empty string on a parse failure (never crashes a card render)', () => {
    expect(SRC).toMatch(/catch \{\s*\n\s*return '';\s*\n\s*\}/);
  });
});

describe('Leads.css — responsive contract', () => {
  const CSS = read('app/admin/styles/Leads.css');

  it('declares the .lead-card surface', () => {
    expect(CSS).toMatch(/\.lead-card \{/);
  });

  it('uses a [data-focused] selector for the Q3 deep-link outline', () => {
    expect(CSS).toMatch(/\.lead-card\[data-focused='true'\] \{[\s\S]*?outline: 2px solid/);
  });

  it('draws the per-card status accent bar via --lead-status-color', () => {
    expect(CSS).toMatch(/\.lead-card::before \{[\s\S]*?background: var\(--lead-status-color/);
  });

  it('tablet breakpoint (769–1199) widens the minmax floor to 320px', () => {
    expect(CSS).toMatch(
      /@media \(min-width: 769px\) and \(max-width: 1199px\) \{[\s\S]*?leads-page \.jobs-page__grid \{[\s\S]*?minmax\(320px, 1fr\)/,
    );
  });

  it('phone breakpoint (≤768px) collapses to one column + full-width buttons', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?leads-page \.jobs-page__grid \{[\s\S]*?grid-template-columns: 1fr/);
    expect(CSS).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?\.lead-card__btn \{[\s\S]*?width: 100%/);
  });

  it('phone buttons hit Apple HIG min touch target (44pt)', () => {
    expect(CSS).toMatch(/min-height: 44px;/);
  });
});
