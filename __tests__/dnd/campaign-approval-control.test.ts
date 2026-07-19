// __tests__/dnd/campaign-approval-control.test.ts — the DM approval control wiring (posts the review route,
// requires a reason on rejection, reports the new state). Source-anchored (the fetch can't run in a unit test).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/CampaignApprovalControl.tsx'), 'utf8');

describe('DM approval control', () => {
  it('is a client component that shows the approval label + Approve / Request-changes actions', () => {
    expect(SRC).toContain("'use client'");
    expect(SRC).toContain('approvalLabel(approval)');
    expect(SRC).toContain('>Approve<');
    expect(SRC).toContain('>Request changes<');
  });

  it('POSTs the approval route with the reviewed status', () => {
    expect(SRC).toContain('/characters/${characterId}/approval');
    expect(SRC).toContain("method: 'POST'");
    expect(SRC).toContain("review('approved')");
    expect(SRC).toContain("review('rejected')");
  });

  it('requires a reason before a rejection is sent', () => {
    expect(SRC).toContain("next === 'rejected'");
    expect(SRC).toMatch(/if \(!reason\.trim\(\)\) return/);
  });

  it('reports the new approval back to the parent', () => {
    expect(SRC).toContain('onChange?.(j.approval');
  });
});
