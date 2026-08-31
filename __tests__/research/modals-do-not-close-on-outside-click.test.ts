// __tests__/research/modals-do-not-close-on-outside-click.test.ts
//
// ── THE OWNER ASKED FOR THIS, AND IT WAS HALF APPLIED ───────────────────────────────────────────
//
// 2026-08-30: *"make it so that clicking off of the modal or window that takes all of the info does
// not close it. We should be required to actually click the exit button."*
//
// A form modal that dismisses on an outside click throws away everything typed, with no
// confirmation and no undo. The New Research Project modal was fixed. The **Edit Project** modal on
// `[projectId]/page.tsx` was not — and it is the one where the data being lost is edits to a record
// that already exists. Found 2026-08-31, a day later, by reading the second modal rather than
// assuming the request had been applied everywhere it applied.
//
// ── FORM MODALS, NOT EVERY DIALOG ───────────────────────────────────────────────────────────────
//
// This is deliberately not a ban on dismiss-by-outside-click. `ResearchRunPanel` has a confirm
// dialog — *"Stop Research Pipeline?"* — whose overlay does close on an outside click, and that is
// RIGHT: clicking away from "are you sure?" means "no", and nothing is lost by taking it that way.
//
// The rule is about modals that CONTAIN A FORM. There, an outside click destroys typed input, and
// the safe reading of an accidental click is the opposite of the safe reading for a confirmation.
// A guard that failed on both would be wrong about half of what it flagged, and a guard that is
// wrong is one people learn to override.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

interface Hit { file: string; line: number }

/**
 * An overlay that closes on click AND wraps a `<form>`.
 *
 * The overlay is found by its `role="dialog"` or an `*-overlay` class; the form is looked for in
 * the ~120 lines after it, which is inside every modal in this portal and short enough not to run
 * into the next one.
 */
function dismissibleFormModals(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const lines = src.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      if (!/-overlay["'`]|role="dialog"/.test(lines[i])) continue;

      // The element's own attributes: from here to the closing `>` of the opening tag.
      const openTag = lines.slice(i, i + 12).join('\n');
      const tagEnd = openTag.indexOf('>');
      const attrs = tagEnd >= 0 ? openTag.slice(0, tagEnd) : openTag;
      if (!/onClick=/.test(attrs)) continue;

      // Does it contain a form? A confirm dialog does not, and is allowed to dismiss.
      const body = lines.slice(i, i + 120).join('\n');
      if (!/<form\b|<input\b|<textarea\b/.test(body)) continue;

      hits.push({ file, line: i + 1 });
    }
  }
  return hits;
}

const FILES = walk('app/admin/research');

describe('the check can fail', () => {
  it('found the research components', () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it('SEES a form modal that dismisses on an outside click', () => {
    const probe = [
      'export function Probe({ open, setOpen }: any) {',
      '  return open ? (',
      '    <div className="research-modal-overlay" onClick={() => setOpen(false)} role="dialog">',
      '      <div className="research-modal">',
      '        <form onSubmit={save}>',
      '          <input value={name} />',
      '        </form>',
      '      </div>',
      '    </div>',
      '  ) : null;',
      '}',
    ].join('\n');
    const tmp = path.join(ROOT, 'app/admin/research/__modal_probe__.tsx');
    fs.writeFileSync(tmp, probe);
    try {
      expect(dismissibleFormModals(['app/admin/research/__modal_probe__.tsx'])).toHaveLength(1);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('does NOT flag a confirm dialog — clicking away from "are you sure?" means no', () => {
    // ResearchRunPanel's "Stop Research Pipeline?" is exactly this shape and is correct.
    const probe = [
      'export function Probe({ open, setOpen }: any) {',
      '  return open ? (',
      '    <div className="rrp__confirm-overlay" onClick={() => setOpen(false)}>',
      '      <div className="rrp__confirm-dialog">',
      '        <p>Are you sure?</p>',
      '        <button onClick={stop}>Stop</button>',
      '      </div>',
      '    </div>',
      '  ) : null;',
      '}',
    ].join('\n');
    const tmp = path.join(ROOT, 'app/admin/research/__modal_probe_confirm__.tsx');
    fs.writeFileSync(tmp, probe);
    try {
      expect(dismissibleFormModals(['app/admin/research/__modal_probe_confirm__.tsx'])).toEqual([]);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe('no research form modal is dismissed by an outside click', () => {
  it('has none', () => {
    const hits = dismissibleFormModals(FILES);
    const lines = hits.map((h) => `${h.file}:${h.line}`);
    expect(
      lines,
      lines.length
        ? 'An outside click on these throws away everything typed, with no confirmation and no '
          + 'undo. The owner asked for this to stop on 2026-08-30. Close on the exit button and on '
          + `Escape; not on a stray click:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });

  it('the two known form modals still offer a deliberate way out', () => {
    // Removing the dismissal must not leave somebody trapped. Both keep Escape and a button.
    const page = fs.readFileSync(path.join(ROOT, 'app/admin/research/[projectId]/page.tsx'), 'utf8');
    expect(page).toContain("if (e.key === 'Escape') setShowEditProject(false)");
    expect(page).toContain('onClick={() => setShowEditProject(false)}');   // the Cancel button

    const tab = fs.readFileSync(path.join(ROOT, 'app/admin/research/_tabs/ProjectsTab.tsx'), 'utf8');
    expect(tab).toContain("if (e.key === 'Escape') setShowCreate(false)");
  });
});
