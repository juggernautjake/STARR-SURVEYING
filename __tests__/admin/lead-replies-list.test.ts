// __tests__/admin/lead-replies-list.test.ts
//
// LR1 of lead-reply-expansion-2026-06-18.md — locks the per-lead reply
// history card on /admin/leads/[id]. The list:
//   - Pulls from /api/admin/leads/[id]/reply (shipped in edfdc2c).
//   - Renders newest-first per the route's ORDER BY sent_at DESC.
//   - Click-to-expand surfaces the full HTML body + attachments + the
//     send_error when a row failed.
//   - Refreshes when the parent bumps `refreshKey` so the ReplyDialog's
//     onSent surfaces the new row immediately.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('RepliesList component (LR1)', () => {
  const SRC = read('app/admin/leads/[id]/RepliesList.tsx');

  it('renders inside a card with the canonical data-section + testid', () => {
    expect(SRC).toMatch(/data-section="replies"/);
    expect(SRC).toMatch(/data-testid="lead-replies"/);
  });

  it('fetches from the /reply endpoint scoped by the lead id', () => {
    expect(SRC).toMatch(/\/api\/admin\/leads\/\$\{encodeURIComponent\(leadId\)\}\/reply/);
  });

  it('refetches when `refreshKey` changes', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{ void fetchReplies\(\); \}, \[fetchReplies, refreshKey\]\)/);
  });

  it('renders loading + error + empty + populated states', () => {
    expect(SRC).toMatch(/data-testid="lead-replies-loading"/);
    expect(SRC).toMatch(/data-testid="lead-replies-error"/);
    expect(SRC).toMatch(/The office hasn&apos;t replied to this lead yet/);
    expect(SRC).toMatch(/data-testid="lead-replies-list"/);
  });

  it('failed rows get data-failed + an inline error banner', () => {
    expect(SRC).toMatch(/data-failed=\{failed \? 'true' : undefined\}/);
    expect(SRC).toMatch(/data-testid="lead-replies-error-banner"/);
    expect(SRC).toMatch(/⚠ Send failed:/);
  });

  it('header is a button that toggles an aria-expanded panel', () => {
    expect(SRC).toMatch(/aria-expanded=\{isOpen\}/);
    expect(SRC).toMatch(/data-testid="lead-replies-toggle"/);
  });

  it('expands to show the HTML body + attachments + meta', () => {
    expect(SRC).toMatch(/dangerouslySetInnerHTML=\{\{ __html: r\.body_html \}\}/);
    expect(SRC).toMatch(/data-testid="lead-replies-attachments"/);
    expect(SRC).toMatch(/r\.resend_id\.slice\(0, 12\)/);
  });

  it("informational chip variant when no storage_path is present", () => {
    expect(SRC).toMatch(/lead-detail__reply-attachment--info/);
  });

  it("has a Retry button on error", () => {
    expect(SRC).toMatch(/Retry[\s\S]{0,80}<\/button>/);
  });
});

describe('lead detail page wires RepliesList', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it("imports RepliesList", () => {
    expect(SRC).toMatch(/import RepliesList from '\.\/RepliesList'/);
  });

  it("mounts <RepliesList /> after the Notes card", () => {
    expect(SRC).toMatch(/<RepliesList leadId=\{lead\.id\} refreshKey=\{repliesRefreshKey\} \/>/);
  });

  it("tracks repliesRefreshKey state + bumps it from the dialog's onSent", () => {
    expect(SRC).toMatch(/const \[repliesRefreshKey, setRepliesRefreshKey\] = useState\(0\)/);
    expect(SRC).toMatch(/setRepliesRefreshKey\(\(k\) => k \+ 1\)/);
  });
});
