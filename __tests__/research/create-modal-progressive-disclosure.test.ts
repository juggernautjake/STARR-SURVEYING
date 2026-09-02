// __tests__/research/create-modal-progressive-disclosure.test.ts — Phase C1.
//
// The New Research Project modal asked for TWELVE fields when the required path is three: an
// address (or a Property ID) and a county. City, ZIP, owner, project name and notes are all
// genuinely useful and none of them blocks a run, so they now sit behind a disclosure.
//
// ── WHAT MUST NOT REGRESS ───────────────────────────────────────────────────────────────────────
//
// Hiding a field is only safe if it is still SENT. The form posts `{...newProject}` — a spread — so
// a field moved into the Accordion continues to reach the API for exactly one reason: it is still
// bound to the same state object. If somebody later "tidies" that spread into an explicit field
// list, every collapsed field silently stops being saved, and the modal will look completely
// correct while doing it. That is the failure this file exists to catch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FORM = 'app/admin/research/_tabs/ProjectsTab.tsx';

const raw = fs.readFileSync(path.join(ROOT, FORM), 'utf8');
const src = raw
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // JSX comments — this file explains itself at length

/** The slice of JSX between <Accordion …> and </Accordion>. */
function accordionBody(): string {
  const open = src.indexOf('<Accordion');
  const close = src.indexOf('</Accordion>');
  expect(open, 'the modal should render an Accordion').toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return src.slice(open, close);
}

describe('the required path is short', () => {
  it('uses the shared Accordion primitive rather than a hand-rolled disclosure', () => {
    // A fourth hand-rolled collapsible is how the portal ended up looking like 90 separate screens.
    expect(src).toMatch(/import \{[^}]*Accordion[^}]*\} from '\.\.\/components\/ui'/);
    expect(src).toContain('<Accordion');
  });

  it('keeps the fields a run actually needs in front of the disclosure', () => {
    const body = accordionBody();
    // Property ID, address and county decide whether a run can start and where it routes.
    for (const field of ['parcel_id', 'property_address', 'county']) {
      expect(body, `${field} must stay visible — it is not optional detail`).not.toContain(field);
    }
  });

  it('and the paid-documents toggle, because it is a money decision', () => {
    // Folding away the one control that can spend money would be the worst possible choice of
    // thing to hide.
    expect(accordionBody()).not.toContain('allow_paid_documents');
  });

  it('moves the genuinely optional fields behind it', () => {
    const body = accordionBody();
    for (const field of ['city', 'zip', 'owner_name', 'description']) {
      expect(body, `${field} belongs behind the disclosure`).toContain(field);
    }
  });
});

describe('a hidden field is still a saved field', () => {
  it('the POST body is still a spread of the whole form state', () => {
    // The single line that keeps every collapsed field working. Replacing it with an explicit
    // field list would drop them all, silently, with the UI looking perfect.
    expect(
      src,
      'the collapsed fields reach the API only because the whole state object is spread',
    ).toMatch(/JSON\.stringify\(\{\s*\.\.\.newProject/);
  });

  it('every field behind the disclosure is bound to that same state object', () => {
    for (const field of ['city', 'zip', 'owner_name', 'description']) {
      expect(src, `${field} must write into newProject, not a local`)
        .toMatch(new RegExp(`setNewProject\\(p => \\(\\{ \\.\\.\\.p, ${field}:`));
    }
  });

  it('the reset after a create names EVERY field, so the next project starts clean', () => {
    // A field omitted from the reset object keeps the previous project's value — which is worse
    // than losing it, because it looks deliberate.
    //
    // Re-pointed 2026-09-02. It anchored on the literal `setNewProject({ name:` and checked four
    // hardcoded field names, so wrapping the reset across lines — which seed 624 did, by adding
    // four more fields to it — broke the anchor and `slice(-1)` handed the assertion a newline.
    // It reported a missing `city` that was present.
    //
    // The replacement derives the field list from the state initializer instead of naming four of
    // them, so it now covers every field there is and cannot go stale the next time one is added.
    const initializer = src.slice(
      src.indexOf('const [newProject, setNewProject] = useState({'),
      src.indexOf('  });', src.indexOf('const [newProject, setNewProject] = useState({')),
    );
    const fields = [...initializer.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);

    // CONTROL: an empty field list would make the loop below vacuously true.
    expect(fields.length, 'could not read the state initializer').toBeGreaterThan(8);

    const resetAt = src.indexOf('setNewProject({', src.indexOf('const data = await res.json()'));
    expect(resetAt, 'no post-create reset found').toBeGreaterThan(-1);
    const reset = src.slice(resetAt, resetAt + 600);

    for (const field of fields) {
      expect(reset, `${field} is missing from the post-create reset`).toContain(`${field}:`);
    }
  });
});

describe('the closed state still informs', () => {
  it('summarises what is filled rather than just saying "optional"', () => {
    // A collapsed section that cannot tell you whether anything is inside makes people open it
    // every time, which is worse than not collapsing it at all.
    expect(src).toMatch(/summary=\{/);
    expect(src).toContain('"none set"');
  });
});
