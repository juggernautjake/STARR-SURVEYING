// __tests__/admin/hub-w9a-pending-bin.test.ts
//
// Slice W9a — consolidated pending-bin widget. Pure helpers +
// source-lock for the widget's size-relative contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pendingLayoutForBucket, totalPendingCount } from '@/lib/hub/widgets/pending-bin';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('totalPendingCount (pure)', () => {
  it('sums receipt + time-off + hours + assignment counts', () => {
    expect(totalPendingCount({
      receipts: [{ id: 'r1' }, { id: 'r2' }],
      timeOff: [{ id: 't1' }],
      hours: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
      assignments: [{ id: 'a1' }],
    })).toBe(7);
  });

  it('returns 0 when every section is empty', () => {
    expect(totalPendingCount({ receipts: [], timeOff: [], hours: [], assignments: [] })).toBe(0);
  });
});

describe('pendingLayoutForBucket (pure)', () => {
  it('maps each bucket to its variant (tiny / small / medium / three / four)', () => {
    expect(pendingLayoutForBucket('tiny')).toBe('tiny');
    expect(pendingLayoutForBucket('small')).toBe('small');
    expect(pendingLayoutForBucket('medium')).toBe('medium');
    expect(pendingLayoutForBucket('large')).toBe('three');
    expect(pendingLayoutForBucket('xlarge')).toBe('four');
  });
});

describe('pending-bin widget registration + render (W9a)', () => {
  const SRC = read('lib/hub/widgets/pending-bin/index.tsx');

  it('registers with id "pending-bin"', () => {
    expect(SRC).toMatch(/defineWidget<PendingContent>\(\{\s*\n\s*id: 'pending-bin'/);
  });

  it('default size is 6×3 (matches the comms-inbox consolidation default)', () => {
    expect(SRC).toMatch(/defaultSize: \{ w: 6, h: 3 \}/);
  });

  it('fans out four parallel reads (receipts / time-off / time-logs / assignments)', () => {
    expect(SRC).toMatch(/Promise\.all\(\[[\s\S]*?'\/api\/admin\/receipts\?status=pending'[\s\S]*?'\/api\/admin\/time-off\?queue=1&status=pending'[\s\S]*?'\/api\/admin\/time-logs\?status=pending'[\s\S]*?'\/api\/admin\/assignments\?due=today'/);
  });

  it("treats 401 / 403 as 'empty' (matches the W5/widget-empty-vs-error pattern)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative testids: tiny / small / medium / large / xlarge', () => {
    expect(SRC).toMatch(/data-testid="pending-bin-tiny"/);
    expect(SRC).toMatch(/data-testid="pending-bin-small"/);
    expect(SRC).toMatch(/data-testid="pending-bin-medium"/);
    expect(SRC).toMatch(/data-testid="pending-bin-large"/);
    expect(SRC).toMatch(/data-testid="pending-bin-xlarge"/);
  });

  it('xlarge fans the layout to four columns (adds time-off alongside the three large columns)', () => {
    expect(SRC).toMatch(/gridTemplateColumns: '1fr 1fr 1fr 1fr'/);
    expect(SRC).toMatch(/<SectionHeader label="Time off"/);
  });
});

describe('register-all wires pending-bin (W9a)', () => {
  it("imports the new widget", () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/pending-bin'/);
  });
});

describe('widget-options registers pending-bin (W9a)', () => {
  it("the schema-coverage spec still passes — pending-bin lives in WIDGET_OPTIONS_REGISTRY", () => {
    const SRC = read('lib/hub/widget-options.ts');
    expect(SRC).toMatch(/'pending-bin':\s*\{\s*source:\s*'none'\s*\}/);
  });
});
