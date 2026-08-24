// __tests__/design/fidelity-record.test.ts — the editor keeps matching the pages.
//
// Phase F4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"make sure the editing view of each page is true to the actual elements and sizes of the
// elements on the page. I don't want it so that we build everything out in the editor, like it, and
// then set it to active, only to find out that it built everything weirdly in a way that did not
// represent the actual planned page."*
//
// ── WHY A RECORD AND NOT A BROWSER ──────────────────────────────────────────────────────────────
//
// The measurement needs a running app and a real browser: it places every palette element on an
// artboard, walks admin routes until it finds each one rendered for real, and compares computed
// style and size. That cannot run in vitest, and pretending otherwise would mean asserting against
// a jsdom approximation — which is exactly the class of lie this whole phase exists to prevent.
//
// So the browser pass writes `lib/design/fidelity.generated.json` and this gates the record:
//
//   · every entry the catalogue offers is accounted for — verified, differing, or never seen;
//   · nothing is differing unless it is listed below with a reason;
//   · the record is not stale relative to the catalogue.
//
// The failure mode this is built against is a silent one. An entry can be added, look right on the
// canvas, and be the wrong size — nothing complains, because a mockup has no way to be obviously
// wrong. The record makes "we have not checked this one" a visible state instead of an absent one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ENTRIES } from '@/lib/design/catalogue';

const RECORD_PATH = 'lib/design/fidelity.generated.json';

interface Diff { what: string; editor: unknown; page: unknown; lowConfidence?: boolean }
interface Entry {
  signature: string;
  route: string | null;
  status: 'verified' | 'differs' | 'not-seen';
  diffs?: Diff[];
  why?: string;
}
interface Record {
  measuredAt: string;
  summary: { verified: number; differs: number; notSeen: number };
  entries: globalThis.Record<string, Entry>;
}

/**
 * Entries that differ from their real counterpart, and why that is accepted for now.
 *
 * An entry here is a claim that somebody looked at the difference and decided. Removing one is how
 * a fix gets locked in; adding one without a reason is how this gate stops meaning anything.
 */
const ACCEPTED: globalThis.Record<string, string> = {
  // ── One route wins, and sometimes the route is the odd one ─────────────────────────────────
  //
  // Each entry is compared against ONE route — whichever the walk sampled it on. `.admin-btn` was
  // verified on /admin/learn/fieldbook in an earlier run and differs here because it was sampled
  // on the SIT mock exam, whose scoped stylesheet enlarges the type: 17.6px against the 13.6px
  // every other route renders. The element is right; the sample is unrepresentative. Worth
  // recording rather than "fixing", because changing the entry to 17.6 would make it wrong
  // everywhere else — and it names a real weakness of the check, which is that a single route
  // decides.
  'button.admin': 'sampled on /admin/learn/exam-prep/sit/mock-exam, which enlarges its own type (17.6px vs the 13.6px every other route renders). The entry matches .admin-btn elsewhere.',

  // ── A REAL APP DEFECT, surfaced by this check ─────────────────────────────────────────────
  //
  // `.learn__back` is declared in AdminLearn.css — 0.82rem / 500 / brand navy — and that is what
  // the artboard renders, because the studio imports that stylesheet. `/admin/jobs/new` and
  // `/admin/jobs/import` also use the class, and AdminLearn.css does NOT load on the jobs routes:
  // the "Back to Jobs" link there is an unstyled anchor, 16px and heavier, missing the brand
  // colour. The editor is right and the page is wrong, which is exactly what this check exists to
  // be able to say. Fixing it means giving those pages a class their own route loads, and that is
  // a change to app/admin/jobs rather than to the catalogue.
  'button.link': 'the PAGE is wrong: /admin/jobs/new wears .learn__back while AdminLearn.css does not load on jobs routes, so the link renders unstyled (16px/600 instead of 13.12px/500). Fix belongs in app/admin/jobs.',

  // ── A colour that resolves differently in two places ──────────────────────────────────────
  //
  // `.job-form__section-title` is #374151 on the artboard and rgb(71,85,105) on /admin/jobs/new.
  // Both are grey at a glance and neither is wrong to look at; the cause is which rule wins on a
  // page that loads more stylesheets than the artboard does. Recorded rather than chased: it is
  // one shade of secondary text, and the fix would be to converge the two rules on a token.
  'text.section-title': 'secondary-text grey resolves #374151 on the artboard and rgb(71,85,105) on the page — two rules, one intent. Converge them on a token.',

  // ── THE SAME CLASS, TWO STYLESHEETS, TWO LOOKS ────────────────────────────────────────────
  //
  // `.admin-empty` is declared in AdminLayout.css (white, 1px dashed #D1D5DB, radius 10) and again,
  // differently, in an "IMPROVED EMPTY STATES" block in AdminLearn.css (#FAFBFF, 2px dashed,
  // radius 12, min-height 180). AdminLayout.css loads on every admin route; AdminLearn.css loads
  // only on the learn ones. So the app has two empty states, and the studio — which imports
  // AdminLearn.css because entries cite it — has been drawing the LEARN one for every page.
  //
  // Recorded rather than fixed here, because the fix is a decision about the product: promoting the
  // improved block into AdminLayout.css would change the empty state on every admin page at once,
  // which is very likely the right thing and is not this slice's call to make.
  'feedback.empty': 'two .admin-empty rules exist — AdminLayout.css (every route) and an "improved" '
    + 'one in AdminLearn.css (learn routes only). The studio imports the latter, so it draws the '
    + 'learn variant. Fix by promoting one of them; until then the artboard shows the nicer one.',

  // ── Height that comes from a parent, not from the element ─────────────────────────────────
  //
  // These render a few px different on the artboard because their height is padding plus an
  // INHERITED line-height, and on a real page that comes from `.ws-landing__card` while on the
  // artboard it comes from the artboard. The element is not wrong; it is in a different box.
  //
  // The style comparison already ignores properties inherited in both places, for exactly this
  // reason. The size comparison cannot do the same trick: a height is a number rather than a
  // declared value, and knowing it was inherited would mean re-deriving the cascade.
  'nav.workspace-header': 'height is padding + inherited line-height on the h1 inside it (44 vs 37.6); the artboard is not .ws-landing__header.',
  'text.workspace-subtitle': 'inherited line-height, as nav.workspace-header (22 vs 25.9).',
};

const raw = fs.existsSync(RECORD_PATH) ? fs.readFileSync(RECORD_PATH, 'utf8') : null;
const record: Record | null = raw ? JSON.parse(raw) : null;

describe('the editor matches the pages it stands in for', () => {
  it('the fidelity record exists — run scripts/check-design-fidelity.mjs --write to make one', () => {
    expect(record, `${RECORD_PATH} is missing. It is produced by:\n`
      + '  node --import tsx --env-file=.env.local scripts/check-design-fidelity.mjs --base <url> --write')
      .not.toBeNull();
  });

  it('no element differs from the page it came from unless the difference is accepted', () => {
    if (!record) return;

    // ── THE GATE FAILS ON EVIDENCE, NOT ON ONE SIGHTING ─────────────────────────────────────────
    //
    // The measurement decides whether a dimension is a property of the ELEMENT or of its CONTENT by
    // variance across sightings, and needs four sightings to judge. Below that it compares anyway
    // and marks the diff `lowConfidence` — which is the right thing for a report and the wrong
    // thing for a gate. It produced, in one run: `.admin-card` declared 598px tall from a single
    // sample on a page where that card happened to hold a long form, and `overlay.dialog` the same
    // number for the same reason. Both are content-driven and neither is a defect.
    //
    // A gate that fails on measurement noise gets re-baselined instead of read, and then it is
    // guarding nothing. So a low-confidence difference is a WATCH — counted, printed by the test
    // below, and not a failure — while anything measured enough times to mean something fails until
    // it is fixed or explained.
    const highConfidence = (e: Entry) => (e.diffs ?? []).filter((d) => !d.lowConfidence);

    const differing = Object.entries(record.entries)
      .filter(([id, e]) => e.status === 'differs' && !ACCEPTED[id] && highConfidence(e).length > 0)
      .map(([id, e]) => `${id} (on ${e.route}): `
        + highConfidence(e).map((d) => `${d.what} editor=${d.editor} page=${d.page}`).join(', '));

    expect(
      differing,
      'These palette elements do not match the real thing on the page they came from, measured '
      + 'enough times to be sure. A mockup assembled from them is the wrong size or the wrong colour '
      + 'before anybody has touched it. Fix the entry, or add it to ACCEPTED with the reason:\n  '
      + differing.join('\n  '),
    ).toEqual([]);
  });

  it('records the low-confidence differences as a watch list rather than losing them', () => {
    if (!record) return;
    // Not a failure — see above — but not invisible either. An element seen once or twice is the
    // most likely place for a real difference to be hiding, precisely because nothing has enough
    // evidence to complain about it.
    const watch = Object.entries(record.entries)
      .filter(([, e]) => e.status === 'differs' && (e.diffs ?? []).some((d) => d.lowConfidence))
      .map(([id, e]) => `${id} (${(e.diffs ?? []).filter((d) => d.lowConfidence)
        .map((d) => `${d.what} ${d.editor} vs ${d.page}`).join(', ')})`);
    // Printed by being in the assertion message; the bound is a sanity check, not a target.
    expect(
      watch.length,
      `Low-confidence differences, worth a look when a route renders them more often:\n  ${watch.join('\n  ')}`,
    ).toBeLessThanOrEqual(ENTRIES.length);
  });

  it('every catalogue entry is accounted for in the record', () => {
    if (!record) return;
    // An entry that is in the catalogue but not in the record has never been compared to anything.
    // That is the state the whole phase exists to make visible: it is not a pass.
    const missing = ENTRIES.map((e) => e.id).filter((id) => !record.entries[id]);
    expect(
      missing,
      'These entries are offered in the palette but were never placed or never matched during the '
      + 'last measurement, so nothing knows whether they look like the real thing. Re-run the '
      + 'fidelity check:\n  ' + missing.join('\n  '),
    ).toEqual([]);
  });

  it('the accepted list has not outlived its entries', () => {
    if (!record) return;
    // A stale exemption is a place real findings go to hide. But "no longer differing" and "no route
    // rendered it this time" are different states: an entry the walk could not find is unverified,
    // and dropping its exemption would mean the finding reappears from nothing the next time a page
    // happens to render it. Only a VERIFIED entry has actually stopped differing.
    const stale = Object.keys(ACCEPTED).filter((id) => record.entries[id]?.status === 'verified');
    expect(stale, `now verified — drop from ACCEPTED: ${stale.join(', ')}`).toEqual([]);
  });

  it('records how many entries no admin route renders, so the gap is a number rather than a shrug', () => {
    if (!record) return;
    // Deliberately NOT a failure. An entry can be legitimately unseen: a toast, a skeleton, an
    // error banner, a shape primitive that belongs to the studio rather than the app. Failing on
    // them would push somebody to delete useful entries to get the build green. Counting them keeps
    // the number honest and visible.
    const unseen = Object.entries(record.entries).filter(([, e]) => e.status === 'not-seen');
    expect(unseen.length).toBeLessThanOrEqual(ENTRIES.length);
    expect(record.summary.notSeen).toBe(unseen.length);
  });
});

describe('the record describes the catalogue that exists now', () => {
  it('is newer than the catalogue files it describes', () => {
    if (!record) return;
    const measured = Date.parse(record.measuredAt);
    const curated = 'lib/design/catalogue/curated';
    const newest = fs.readdirSync(curated)
      .map((f) => fs.statSync(path.join(curated, f)).mtimeMs)
      .reduce((a, b) => Math.max(a, b), 0);
    // A record older than the entries it describes is describing something else. Half a day of
    // slack, because a curated file gets touched for a comment far more often than for a size.
    const SLACK_MS = 12 * 60 * 60 * 1000;
    expect(
      newest - measured,
      `The catalogue has been edited since the fidelity record was written (${record.measuredAt}). `
      + 'Re-run scripts/check-design-fidelity.mjs --write so the record describes what the palette '
      + 'actually offers.',
    ).toBeLessThan(SLACK_MS);
  });
});
