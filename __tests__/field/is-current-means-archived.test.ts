// `fieldbook_notes.is_current` means SOFT-ARCHIVE, and only that. Decided 2026-08-16.
//
// ── WHAT THE COLUMN USED TO MEAN, AND WHY IT WAS A BUG ──────────────────────────────────────────
//
// Two live meanings on one column:
//
//   archive (true = active)  — FIVE readers: mobile/lib/fieldNotes.ts (its header says "soft-archive
//                              flips to false") and mobile/lib/jobs.ts filter their lists on it;
//                              /admin/field-data/[id] and /admin/jobs/[id]/field render !is_current
//                              as an "archived" badge; JobNotesPanel shows the same badge.
//   pointer (one per user)   — ONE reader: `action=current` in the learn fieldbook route.
//
// `POST /api/admin/learn/fieldbook` used to run a sweep — "unmark any current entry for this user" —
// before inserting. So writing a note flipped your PREVIOUS note to `is_current = false`, and three
// other surfaces then showed that note to the whole crew as archived.
//
// The count is not the real argument. The pointer is per-user PRIVATE state stored in a SHARED
// column that shared screens read as "archived for everyone". The sweep is gone; the flag now only
// ever changes because somebody archived something.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const fieldbook = strip(read('app/api/admin/learn/fieldbook/route.ts'));
const notesRoute = strip(read('app/api/admin/jobs/[id]/notes/route.ts'));
const mobileNotes = read('mobile/lib/fieldNotes.ts');

describe('nothing clears the flag on a note you did not touch', () => {
  it('the pointer sweep is gone from the fieldbook route', () => {
    // The sweep was `.update({ is_current: false }).eq('user_email', email).eq('is_current', true)`.
    // Its absence is the decision.
    expect(fieldbook).not.toMatch(/update\(\{\s*is_current:\s*false\s*\}\)/);
  });

  it('and no bulk update of the column survives anywhere in that route', () => {
    const sweeps = fieldbook.match(/is_current:\s*false/g) ?? [];
    expect(sweeps, 'a write of is_current:false belongs to archiving a single note, not a sweep')
      .toHaveLength(0);
  });
});

describe('a new note is created active, on both writers', () => {
  it('the personal notebook creates active notes', () => {
    expect(fieldbook).toMatch(/is_current:\s*true/);
  });

  it('and so does a job note', () => {
    // A job note that arrived `false` would render "archived" to the whole crew the moment it was
    // written — the failure the containment in C0d2 was originally added to prevent.
    expect(notesRoute).toMatch(/is_current:\s*true/);
  });
});

describe('the readers agree on the archive meaning', () => {
  it('mobile filters lists to active notes', () => {
    expect(mobileNotes).toMatch(/COALESCE\(is_current, 1\) = 1/);
  });

  it('mobile archives by flipping the flag on ONE note', () => {
    // Soft-delete, scoped to a single row — the only legitimate way this column changes.
    expect(mobileNotes).toMatch(/SET is_current = 0/);
  });

  it('and treats a NULL as active, so rows predating the column are not hidden', () => {
    expect(mobileNotes).toContain('COALESCE(is_current, 1)');
  });
});

describe('reopening the notebook', () => {
  it('asks for the most recently updated ACTIVE note, not a flagged pointer', () => {
    // Unchanged by the decision — it already ordered by updated_at. That is precisely why removing
    // the sweep costs nothing: the same query answers the same question, and now also answers it on
    // the day you archived the note you had open, when the pointer version returned nothing.
    const current = fieldbook.slice(fieldbook.indexOf("action === 'current'"));
    expect(current).toMatch(/\.eq\('is_current', true\)/);
    expect(current).toMatch(/order\('updated_at', \{ ascending: false \}\)/);
  });
});
