// RESEARCH_PLATFORM_DEEP_BUILD R10 — a proposal says WHAT changed on their site.
//
// `diffFingerprints` was written for exactly this and had **no callers anywhere in the repo** — the
// eleventh instance of this codebase's signature defect, found while checking R10's premise rather
// than assuming it needed building. The sweep computed a boolean (`live.skeleton === baseline`) and
// threw the structure away.
//
// The boolean is true of a renamed wrapper div and of a search form replaced by a captcha wall. A
// reviewer cannot tell those apart without opening the site by hand — which is the entire cost the
// triage queue exists to remove.

import { describe, it, expect } from 'vitest';
import { buildBreakageProposal } from '@/lib/research/self-heal-proposals';
import { fingerprintHtml, diffFingerprints } from '@/lib/research/dom-fingerprint';

const base = {
  adapter_id: 'a1',
  health_check_id: 'h1',
  http_status: 200,
  duration_ms: 120,
  probe_summary: 'probe summary',
  prior_config: {},
  prior_field_map: {},
} as const;

const diffOf = (wasHtml: string, nowHtml: string) =>
  diffFingerprints(fingerprintHtml(wasHtml), fingerprintHtml(nowHtml));

describe('the proposal names what changed', () => {
  it('reports similarity and severity instead of a bare mismatch', () => {
    const d = diffOf(
      '<html><body><form><input><input><table><tr><td></td></tr></table></form></body></html>',
      '<html><body><div><p>Access denied</p></div></body></html>',
    );
    const p = buildBreakageProposal({
      ...base, status: 'degraded', fingerprint_match: false, fingerprint_diff: d,
    });
    const detected = (p.diff as { detected: string[] }).detected.join(' ');
    expect(detected).toMatch(/% similar to baseline/);
    expect(detected).toMatch(/healthy|degraded|broken/);
  });

  it('names the structures that disappeared — the captcha-wall signal', () => {
    // The case a reviewer most needs distinguished: the search form is gone.
    const d = diffOf(
      '<html><body><form><input><select></select></form></body></html>',
      '<html><body><div><p>Please verify you are human</p></div></body></html>',
    );
    const p = buildBreakageProposal({
      ...base, status: 'degraded', fingerprint_match: false, fingerprint_diff: d,
    });
    const detected = (p.diff as { detected: string[] }).detected.join(' ');
    expect(detected).toMatch(/Gone:/);
    expect(detected).toMatch(/form|input|select/);
  });

  it('keeps the structured diff alongside the prose', () => {
    // So a later UI can render token lists directly instead of re-parsing a sentence.
    const d = diffOf('<html><body><form><input></form></body></html>', '<html><body><div></div></body></html>');
    const p = buildBreakageProposal({
      ...base, status: 'degraded', fingerprint_match: false, fingerprint_diff: d,
    });
    const fp = (p.diff as { fingerprint: unknown }).fingerprint as { similarity: number; removed: string[] };
    expect(fp).toBeTruthy();
    expect(typeof fp.similarity).toBe('number');
    expect(Array.isArray(fp.removed)).toBe(true);
  });
});

describe('it stays honest when there is nothing to diff', () => {
  it('falls back to the old wording when no baseline existed', () => {
    // No canary baseline is a different thing from "nothing changed", and inventing a diff would be
    // worse than the bare sentence.
    const p = buildBreakageProposal({
      ...base, status: 'degraded', fingerprint_match: false, fingerprint_diff: null,
    });
    const detected = (p.diff as { detected: string[] }).detected.join(' ');
    expect(detected).toMatch(/no longer matches our baseline fingerprint/i);
    expect((p.diff as { fingerprint: unknown }).fingerprint).toBeNull();
  });

  it('says nothing about structure when the fingerprint matched', () => {
    const p = buildBreakageProposal({
      ...base, status: 'broken', fingerprint_match: true, fingerprint_diff: null,
    });
    const detected = (p.diff as { detected: string[] }).detected.join(' ');
    expect(detected).not.toMatch(/structure/i);
    expect(detected).toMatch(/Site returned/);
  });
});

describe('the diff itself', () => {
  it('reports identical pages as identical', () => {
    const html = '<html><body><form><input></form></body></html>';
    const d = diffOf(html, html);
    expect(d.identical).toBe(true);
    expect(d.similarity).toBe(1);
    expect(d.severity).toBe('healthy');
  });

  it('grades a total redesign more severely than a small tweak', () => {
    const before = '<html><body><form><input><input><table><tr><td></td></tr></table></form></body></html>';
    const tweak = '<html><body><form><input><input><input><table><tr><td></td></tr></table></form></body></html>';
    const redesign = '<html><body><p>gone</p></body></html>';
    expect(diffOf(before, tweak).similarity).toBeGreaterThan(diffOf(before, redesign).similarity);
  });
});
