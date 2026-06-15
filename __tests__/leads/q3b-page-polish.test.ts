// __tests__/leads/q3b-page-polish.test.ts
//
// mobile-and-customer-query-gap Slice Q3b — leads page polish.
// Locks the two user-impact polish items so a future refactor can't
// quietly drop the URL-persisted status filter or the
// Mark-contacted quick action that pairs with the Q2 notification.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('leads admin page — Q3b URL-persisted status filter', () => {
  const SRC = read('app/admin/leads/page.tsx');

  it('imports useRouter for the replace() call', () => {
    expect(SRC).toMatch(/import \{ useRouter, useSearchParams \} from 'next\/navigation'/);
  });

  it('seeds initial state from the `status` URL param', () => {
    expect(SRC).toMatch(
      /const initialStatusFilter = \(\(\) => \{[\s\S]*?searchParams\.get\('status'\) \?\? 'all';/,
    );
  });

  it('exposes a setStatusFilterAndUrl that mirrors state to the URL', () => {
    expect(SRC).toMatch(/const setStatusFilterAndUrl = useCallback/);
    expect(SRC).toMatch(/router\.replace\(`\$\{url\.pathname\}\$\{url\.search\}`, \{ scroll: false \}\)/);
  });

  it('replaces every pipeline-stage click with the URL-aware setter', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setStatusFilterAndUrl\('all'\)\}/);
    expect(SRC).toMatch(
      /onClick=\{\(\) => setStatusFilterAndUrl\(statusFilter === s\.key \? 'all' : s\.key\)\}/,
    );
    // No bare setStatusFilter() click handler should remain.
    expect(SRC).not.toMatch(/onClick=\{\(\) => setStatusFilter\(/);
  });
});

describe('leads admin page — Q3b Mark contacted quick action', () => {
  const SRC = read('app/admin/leads/page.tsx');

  it('renders only for leads still in the `new` state', () => {
    expect(SRC).toMatch(/\{lead\.status === 'new' && \(/);
  });

  it('the button advances the lead to `contacted` via the existing PATCH path', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => void changeStatus\(lead, 'contacted'\)\}/);
  });

  it('carries data-action="mark-contacted" so styling + tests can target it', () => {
    expect(SRC).toMatch(/data-action="mark-contacted"/);
  });
});

describe('admin/leads PATCH — Q3b dismisses the Q2 notification', () => {
  const SRC = read('app/api/admin/leads/route.ts');

  it('only dismisses when status MOVES OFF `new`', () => {
    expect(SRC).toMatch(
      /typeof patch\.status === 'string' &&\s*\n\s*patch\.status !== 'new'/,
    );
  });

  it('updates is_dismissed = true keyed by (source_type, source_id, type)', () => {
    expect(SRC).toMatch(/\.update\(\{ is_dismissed: true \}\)/);
    expect(SRC).toMatch(/\.eq\('source_type', 'leads'\)/);
    expect(SRC).toMatch(/\.eq\('type', 'lead\.new'\)/);
    expect(SRC).toMatch(/\.eq\('is_dismissed', false\)/);
  });

  it('swallows dismissal errors — a notification glitch must not break the status change', () => {
    expect(SRC).toMatch(/console\.error\('\[admin\/leads\] notification dismiss failed:/);
  });
});
