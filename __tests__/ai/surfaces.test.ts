// The AI surfaces, not just the AI plumbing (audit §5, Phase 3 items 14–16).
//
// `__tests__/ai/core.test.ts` covers `lib/ai` — the client, the model roster, the tool registry, the
// context digest. Everything it asserts passed while all three features were invisible: the routes
// existed and nothing rendered them. This repo's most common defect is "authored but not wired", so
// these tests assert the WIRING, and structurally rather than by rendering — a mounted-in-the-layout
// claim is about a file's imports, and a jsdom render of the admin shell would need a session, a
// router, four providers and a network layer to prove less.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { atOrAbove, countBySeverity, type ProactiveAlertRow } from '@/lib/hub/widgets/proactive-alerts';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('item 14 — the assistant is actually on the page', () => {
  const layout = read('app/admin/components/AdminLayoutClient.tsx');

  it('mounts the dock and its provider in the admin layout', () => {
    expect(layout).toContain('AssistantProvider');
    expect(layout).toContain('<AssistantDock />');
  });

  it('loads the dock stylesheet from the layout, since the dock is on every page', () => {
    // The same reasoning the messaging + discussions stylesheets are imported here: a component
    // rendered by the layout cannot get its CSS from a route segment.
    expect(layout).toContain("styles/AdminAssistant.css");
  });

  it('sends the current page with every question', () => {
    // The route builds its grounding from `page.path`; without it the assistant is answering
    // "what is this page for" about no page at all.
    const provider = read('app/admin/components/assistant/AssistantProvider.tsx');
    expect(provider).toContain('page: { path: pathname }');
  });

  it('routes an approval back through the server rather than executing client-side', () => {
    // The confirmation gate is a round trip by design (D4). A client that ran the tool itself, or
    // set an `approved: true` flag, would be the client authorising its own write.
    const provider = read('app/admin/components/assistant/AssistantProvider.tsx');
    expect(provider).toContain('confirmedTool');
    expect(provider).not.toMatch(/runTool\s*\(/);
  });

  it('keeps the floating pill open while the assistant panel is open', () => {
    // The pill hides its buttons when collapsed, and the panel is a child of its button.
    expect(read('app/admin/components/FloatingActionMenu.tsx')).toContain('.assistant-panel');
  });
});

describe('item 15 — the empty help drawers reach the generator', () => {
  const drawer = read('app/admin/components/nav/HelpDrawer.tsx');

  it('asks the generate route when nothing is curated', () => {
    expect(drawer).toContain('/api/admin/help/generate');
  });

  it('still renders curated help synchronously, with no fetch in front of it', () => {
    // Curated entries are local and instant. A spinner before content we already have would be a
    // regression on precisely the pages somebody bothered to document.
    expect(drawer).toContain('lookupHelp(pathname, workspaceHref)');
    expect(drawer).toMatch(/if \(!open \|\| curated\) return;/);
  });

  it('labels generated help as generated', () => {
    // A reader who cannot tell a guess from a fact trusts them equally.
    expect(drawer).toMatch(/source === 'generated'/);
    expect(drawer).toContain('Written by AI');
  });

  it('no longer answers a stuck user with the name of a source file', () => {
    expect(drawer).not.toContain('help-catalog.ts</code>');
  });

  it('offers the assistant as the fallback behind the fallback', () => {
    expect(drawer).toContain('openAssistant');
  });
});

describe('item 16 — proactive alerts reach a channel people watch', () => {
  it('delivers into the existing notifications table, not a second inbox', () => {
    const proactive = read('lib/ai/proactive.ts');
    expect(proactive).toContain('deliverProactiveAlerts');
    expect(proactive).toContain('notifyMany');
    expect(proactive).toContain("source_type: 'proactive_alert'");
  });

  it('writes the ledger AFTER sending, so a crash re-sends instead of swallowing', () => {
    const proactive = read('lib/ai/proactive.ts');
    const send = proactive.indexOf('await notifyMany(');
    const ledger = proactive.indexOf('await markDelivered(announced');
    expect(send).toBeGreaterThan(-1);
    expect(ledger).toBeGreaterThan(send);
  });

  it('only asks for roles that exist', () => {
    // `manager` and `owner` are not in the UserRole union. A PostgREST filter for a role nobody has
    // returns zero rows, which looks exactly like "there was nothing to send".
    const proactive = read('lib/ai/proactive.ts');
    // The ROLES filter specifically, not "the first `.or(` in the file". This matched the first one
    // until 2026-08-13, when a receipts filter (`expense_nature.is.null,…`) was added above it and
    // the test started asserting about somebody else's query — failing while the code it is about
    // was unchanged and correct. A test that finds its subject by position finds a new subject
    // whenever the file grows.
    const filter = proactive.match(/\.or\('(roles\.[^']+)'\)/)?.[1] ?? '';
    expect(filter, 'no roles filter found in lib/ai/proactive.ts').not.toBe('');
    expect(filter).toContain('roles.cs.{admin}');
    expect(filter).not.toContain('manager');
    expect(filter).not.toContain('owner');
  });

  it('runs on a schedule rather than on somebody opening a page', () => {
    expect(exists('app/api/cron/proactive-alerts/route.ts')).toBe(true);
    const vercel = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons.some((c) => c.path === '/api/cron/proactive-alerts')).toBe(true);
  });

  it('registers the standing view as a hub widget', () => {
    expect(read('lib/hub/widgets/register-all.ts')).toContain("import './proactive-alerts'");
  });
});

describe('the alert widget filters the way somebody raising the floor expects', () => {
  const rows: ProactiveAlertRow[] = [
    { dedupeKey: 'a', severity: 'urgent', title: 'u', detail: '' },
    { dedupeKey: 'b', severity: 'warn', title: 'w', detail: '' },
    { dedupeKey: 'c', severity: 'info', title: 'i', detail: '' },
  ];

  it('"worth watching and above" includes urgent', () => {
    // Getting this backwards hides exactly the alerts the setting was raised to see.
    const kept = atOrAbove(rows, 'warn').map((r) => r.severity);
    expect(kept).toEqual(['urgent', 'warn']);
  });

  it('"urgent only" keeps just the urgent ones', () => {
    expect(atOrAbove(rows, 'urgent').map((r) => r.severity)).toEqual(['urgent']);
  });

  it('"everything" changes nothing', () => {
    expect(atOrAbove(rows, 'all')).toHaveLength(3);
  });

  it('counts every severity, including the ones with none', () => {
    expect(countBySeverity(rows)).toEqual({ urgent: 1, warn: 1, info: 1 });
    expect(countBySeverity([])).toEqual({ urgent: 0, warn: 0, info: 0 });
  });
});
