// Render the three panels this session shipped, instead of grepping their source.
//
// Every test I wrote for `RotationPanel`, `VendorAccountsPanel` and the offline banner in
// `JobResearchPacket` asserts that the FILE CONTAINS a string. That proves the code says the right
// thing. It proves nothing about which branch produces it, or that anything reaches the screen —
// and this repo's recorded lesson is exactly that: a green 15,000-test suite missed three
// rendering-condition bugs in one pass, because string assertions cannot see a render.
//
// `react-dom/server` rather than @testing-library, matching `__tests__/admin/sidebar-render.test.tsx`
// and the rest of this suite (node environment, no extra dependency).
//
// ── WHAT THIS CAN AND CANNOT SEE ────────────────────────────────────────────────────────────────
//
// `renderToString` does not run effects, so the fetch-driven states of two of these panels are not
// reachable this way. That is stated rather than papered over: what IS covered is every branch that
// depends on props alone, plus the pure display rules — which is where the actual decisions live.
// The rules were exported from VendorAccountsPanel for this reason.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

vi.mock('lucide-react', () => new Proxy({}, {
  get: () => () => React.createElement('span'),
}));

import RotationPanel, { explainFailure } from '@/app/admin/research/components/RotationPanel';
import { balanceLine, topupLine, type AccountRow } from '@/app/admin/research/components/VendorAccountsPanel';

const html = (el: React.ReactElement) => ReactDOMServer.renderToStaticMarkup(el);

// ── RotationPanel ───────────────────────────────────────────────────────────────────────────────

describe('RotationPanel renders', () => {
  const base = { projectId: 'p1', calls: [{ bearing: 'N 0°00\'00" E', distance: 100 }], onClose: () => {} };

  it('renders nothing at all when closed', () => {
    // A modal that renders an invisible overlay still swallows clicks.
    expect(html(<RotationPanel {...base} isOpen={false} />)).toBe('');
  });

  it('renders the tie form by default, not the backsight one', () => {
    // Tied corners are the checkable basis; a backsight is exact and unverifiable. Which one the
    // panel opens on is a real choice and was never asserted.
    const out = html(<RotationPanel {...base} isOpen />);
    expect(out).toContain('Tied corners (GPS)');
    expect(out).toContain('Measured N (ft)');
    expect(out).not.toContain('You are holding');
  });

  it('starts with two tie rows, because one tie is not a fit', () => {
    const out = html(<RotationPanel {...base} isOpen />);
    expect((out.match(/IRF at fence/g) ?? []).length).toBe(2);
  });

  it('leaves "also solve for scale" off', () => {
    // A floating scale absorbs grid-vs-ground and unit errors. Defaulting it on would hide both.
    const out = html(<RotationPanel {...base} isOpen />);
    const box = /<input type="checkbox"[^>]*\/?>/.exec(out)?.[0] ?? '';
    expect(box).not.toContain('checked');
  });

  it('says the shape is untouched, on the panel and not only in a result', () => {
    expect(html(<RotationPanel {...base} isOpen />)).toContain('The shape is untouched');
  });

  it('disables nothing when there are calls, and still renders with none', () => {
    // The button is disabled by the PAGE when calls is empty; the panel itself must not crash.
    expect(() => html(<RotationPanel {...base} calls={[]} isOpen />)).not.toThrow();
  });
});

// ── VendorAccountsPanel's display rules ─────────────────────────────────────────────────────────

describe('a balance is never rendered as a bare number', () => {
  const row = (o: Partial<AccountRow> = {}): AccountRow => ({
    vendor_id: 'texasfile', display_name: 'TexasFile', account_status: 'active',
    account_identifier: null, credential_env_var: null,
    balance_usd: null, balance_source: 'unknown', balance_checked_at: null,
    auto_topup_enabled: false, low_water_usd: null, topup_to_usd: null,
    monthly_ceiling_usd: null, min_topup_interval_mins: 60, card_last4: null,
    ...o,
  });

  it('distinguishes "no account" from "no money"', () => {
    expect(balanceLine(row({ account_status: 'none' }))).toContain('not a balance of $0.00');
  });

  it('says UNKNOWN rather than showing zero', () => {
    expect(balanceLine(row())).toContain('Balance UNKNOWN');
    expect(balanceLine(row())).toContain('Not zero');
  });

  it('treats a present source with an absent figure as unknown', () => {
    // The branch that matters: `balance_source: 'confirmed'` with a null amount must not print
    // "$0.00 confirmed from the vendor" — a confirmed reading of nothing is not a reading.
    expect(balanceLine(row({ balance_source: 'confirmed', balance_usd: null })))
      .toContain('Balance UNKNOWN');
  });

  it('marks an inferred balance as an estimate and never drops the tilde', () => {
    const s = balanceLine(row({ balance_source: 'inferred', balance_usd: 42.5 }));
    expect(s).toContain('~$42.50');
    expect(s).toContain('INFERRED');
  });

  it('handles a numeric string from Postgres, not just a number', () => {
    // DECIMAL columns come back as strings through PostgREST. `Number('42.50')` works; a bare
    // `.toFixed` on the string would throw and blank the panel.
    expect(balanceLine(row({ balance_source: 'confirmed', balance_usd: '42.50', balance_checked_at: '2026-08-03T00:00:00Z' })))
      .toContain('$42.50');
  });
});

describe('auto top-up off is stated, not implied by an unchecked box', () => {
  const row = (o: Partial<AccountRow> = {}): AccountRow => ({
    vendor_id: 'v', display_name: null, account_status: 'active',
    account_identifier: null, credential_env_var: null,
    balance_usd: null, balance_source: 'unknown', balance_checked_at: null,
    auto_topup_enabled: false, low_water_usd: null, topup_to_usd: null,
    monthly_ceiling_usd: null, min_topup_interval_mins: 60, card_last4: null,
    ...o,
  });

  it('counts how many limits are missing, and pluralises', () => {
    expect(topupLine(row())).toContain('3 of its three limits are unset');
    expect(topupLine(row({ low_water_usd: 10, topup_to_usd: 50 })))
      .toContain('1 of its three limits is unset');
  });

  it('distinguishes "off with limits set" from "off and unconfigured"', () => {
    const configured = topupLine(row({ low_water_usd: 10, topup_to_usd: 50, monthly_ceiling_usd: 200 }));
    expect(configured).toContain('The limits are set');
    expect(configured).not.toContain('not configured to charge');
  });

  it('says when it is ON but no card can be charged', () => {
    expect(topupLine(row({ auto_topup_enabled: true, low_water_usd: 10, topup_to_usd: 50, monthly_ceiling_usd: 200 })))
      .toContain('NO CARD ON FILE');
  });

  it('prints the full instruction when it is genuinely armed', () => {
    const s = topupLine(row({
      auto_topup_enabled: true, low_water_usd: 10, topup_to_usd: 50,
      monthly_ceiling_usd: 200, card_last4: '4242',
    }));
    expect(s).toContain('at $10.00 charge up to $50.00');
    expect(s).toContain('ceiling $200.00/month');
    expect(s).toContain('•••• 4242');
  });

  it('does not treat a zero limit as unset', () => {
    // 0 and null are different instructions — a ceiling of zero forbids every top-up. If this
    // counted 0 as missing, the panel would say "unset" about a deliberate freeze.
    expect(topupLine(row({ low_water_usd: 0, topup_to_usd: 0, monthly_ceiling_usd: 0 })))
      .toContain('The limits are set');
  });
});

describe('a failure says what to do, not just a status code', () => {
  // Driving the panel in a browser showed it printing "Request failed (401)" — a status code and
  // nothing else. Every other message in this panel tells the reader what to do next, and this one,
  // the only one they see when something breaks, did not.
  const res = (status: number, body?: unknown): Response => ({
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  } as unknown as Response);

  it('prefers the route\'s own reason over anything invented here', async () => {
    // The route answers a well-formed question it cannot serve WITH a reason. That reason is better
    // than any status-code guess.
    const msg = await explainFailure(res(400, { error: 'basis.ties[] is required for a ties fit.' }));
    expect(msg).toBe('basis.ties[] is required for a ties fit.');
  });

  it('tells an unauthenticated user to sign in, and that nothing was lost', async () => {
    const msg = await explainFailure(res(401));
    expect(msg).toContain('Sign in again');
    expect(msg).toContain('nothing was saved');
  });

  it('says a server failure is not the surveyor\'s measurements', async () => {
    const msg = await explainFailure(res(500));
    expect(msg).toContain('not a problem with your measurements');
  });

  it('survives a non-JSON body instead of throwing', async () => {
    // An HTML error page is not a reason, and a panel that throws while reporting a failure shows
    // the user nothing at all.
    await expect(explainFailure(res(502))).resolves.toContain('502');
  });

  it('still names the status when it has nothing better', async () => {
    expect(await explainFailure(res(418))).toContain('418');
  });
});
