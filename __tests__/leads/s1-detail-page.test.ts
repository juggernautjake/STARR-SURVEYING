// __tests__/leads/s1-detail-page.test.ts
//
// mobile-and-customer-query-gap Slice S1 — new-query detail page +
// supporting API. Locks the responsive grid, the four data sections,
// the call-to-action buttons, and the API contract so a future
// refactor can't quietly drop the deep-link target the Q2
// notification routes to.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/api/admin/leads/[id] — single-lead GET endpoint', () => {
  const SRC = read('app/api/admin/leads/[id]/route.ts');

  it('exports a withErrorHandler-wrapped GET', () => {
    expect(SRC).toMatch(/export const GET = withErrorHandler\(/);
  });

  it('gates on admin auth', () => {
    expect(SRC).toMatch(/if \(gate\.error\) return gate\.error;/);
    expect(SRC).toMatch(/if \(!isAdmin\(session\.user\.roles\)\)/);
  });

  it('returns 400 when id is missing, 404 when not found, 200 with the row otherwise', () => {
    expect(SRC).toMatch(/return NextResponse\.json\(\{ error: 'Missing lead id' \}, \{ status: 400 \}\)/);
    expect(SRC).toMatch(/return NextResponse\.json\(\{ error: 'Lead not found' \}, \{ status: 404 \}\)/);
    expect(SRC).toMatch(/return NextResponse\.json\(\{ lead: data \}\);/);
  });

  it('fetches via .eq(id).maybeSingle() so a missing row returns null rather than throwing', () => {
    expect(SRC).toMatch(/\.from\('leads'\)[\s\S]*?\.eq\('id', id\)[\s\S]*?\.maybeSingle\(\);/);
  });
});

describe('/admin/leads/[id] — responsive detail page', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it("declares the 'use client' directive (after the file-level comment block) so React hooks land", () => {
    // The directive must appear BEFORE the first import for Next to
    // honor it; we don't lock it at line 1 because the file leads
    // with an explanatory comment block.
    expect(SRC).toMatch(/^[\s\S]*?'use client';\s*\n[\s\S]*?import /);
  });

  it('reads the dynamic `id` param via useParams', () => {
    expect(SRC).toMatch(/const params = useParams<\{ id: string \}>\(\);/);
  });

  it('fetches the single lead from the dedicated endpoint', () => {
    expect(SRC).toMatch(/`\/api\/admin\/leads\/\$\{encodeURIComponent\(id\)\}`/);
  });

  it('admin-gates the page', () => {
    expect(SRC).toMatch(/const isAdminUser = session\?\.user\?\.roles\?\.includes\('admin'\) \?\? false;/);
    expect(SRC).toMatch(/if \(!isAdminUser\)/);
  });

  it('handles loading / not-found / found explicitly (no blank screens)', () => {
    expect(SRC).toMatch(/data-state="loading"/);
    expect(SRC).toMatch(/data-state="not-found"/);
    expect(SRC).toMatch(/data-testid="lead-detail-page"/);
  });

  it('uses an auto-fit grid that collapses to a single column on phone', () => {
    // Hard contract: every column at least 300px wide before wrapping.
    // 300 was picked so a 320-wide iPhone SE shows one column, an iPad
    // shows two, a desktop shows three or four.
    // lead-attachments-2026-06-18 — the grid moved into a <style jsx>
    // block when the cards got their rounded-corner restyle.
    expect(SRC).toMatch(/grid-template-columns:\s*repeat\(auto-fit, minmax\(300px, 1fr\)\)/);
  });

  it('renders the four detail sections (contact + property + pipeline + notes + audit)', () => {
    expect(SRC).toMatch(/data-section="contact"/);
    expect(SRC).toMatch(/data-section="property"/);
    expect(SRC).toMatch(/data-section="pipeline"/);
    expect(SRC).toMatch(/data-section="notes"/);
    expect(SRC).toMatch(/data-section="audit"/);
  });

  it('exposes a back-to-list affordance', () => {
    expect(SRC).toMatch(/data-action="back-to-list"/);
    expect(SRC).toMatch(/router\.push\('\/admin\/leads'\)/);
  });

  it('shows the Mark contacted CTA only for still-`new` leads', () => {
    expect(SRC).toMatch(/\{lead\.status === 'new' && \(/);
    expect(SRC).toMatch(/data-action="mark-contacted"/);
  });

  it('phone + email render as tel:/mailto: links for one-tap contact on phone', () => {
    expect(SRC).toMatch(/href=\{`mailto:\$\{lead\.email\}`\}/);
    expect(SRC).toMatch(/href=\{`tel:\$\{lead\.phone\}`\}/);
  });

  it('shows the customer notes verbatim with white-space: pre-wrap so newlines survive', () => {
    expect(SRC).toMatch(/data-testid="lead-notes"/);
    // lead-attachments-2026-06-18 — notes now render in a styled
    // <div> with `white-space: pre-wrap` declared in the page's
    // <style jsx> block (instead of inline pre styling).
    expect(SRC).toMatch(/white-space:\s*pre-wrap/);
  });

  it('links to the converted job when present, "not yet" otherwise', () => {
    expect(SRC).toMatch(/lead\.converted_job_id \? \(/);
    expect(SRC).toMatch(/'— \(not yet\)'/);
  });
});

describe('Q2 notification deep link — points at the new S1 detail page', () => {
  const SRC = read('lib/leads/intake.ts');

  it('link: /admin/leads/<id> (NOT the list-with-focus form)', () => {
    expect(SRC).toMatch(/link: `\/admin\/leads\/\$\{leadId\}`/);
  });
});
