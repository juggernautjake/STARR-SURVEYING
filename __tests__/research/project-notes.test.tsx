// __tests__/research/project-notes.test.tsx — Phase N2.
//
// ── THE NOTES EXISTED, THREE LEVELS DOWN, AND LOST WRITES SILENTLY ──────────────────────────────
//
// Owner: *"be able to write notes and stuff"*.
//
// `analysis_metadata.job_notes` was already persisted and already auto-saved. It rendered in
// exactly one place: **Stage 4 → the Job Prep tab → the "Final Document" sub-tab**. So the notes
// somebody takes *while reading the results* — which is when a surveyor takes them — had nowhere to
// go until the project reached the last stage.
//
// And the save swallowed its own failure:
//
//     } catch { /* silently ignore — next save will retry */ }
//
// The comment is honest about the intent and wrong about the consequence. There is no next save if
// the person stops typing, which is exactly what they do when the note is finished. A dropped
// request left the text in the box, gone on reload, with nothing ever saying so.
//
// Notes are the one category of content the system cannot regenerate. Losing one quietly is the
// worst version of this repository's most common failure — the symptom being silence.

import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { stripJs } from '@/scripts/audit-research-contrast.mjs';
import ProjectNotes, { saveStateLabel, JOB_NOTES_PLACEHOLDER } from
  '@/app/admin/research/components/ProjectNotes';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const render = (over: Partial<React.ComponentProps<typeof ProjectNotes>> = {}) =>
  ReactDOMServer.renderToStaticMarkup(
    React.createElement(ProjectNotes, {
      projectId: 'p1', value: '', onChange: () => {}, ...over,
    }),
  );

describe('the save state is on the screen', () => {
  it('names every state it can be in', () => {
    expect(saveStateLabel({ kind: 'idle' })).toMatch(/auto-saves/i);
    expect(saveStateLabel({ kind: 'saving' })).toBe('Saving…');
    expect(saveStateLabel({ kind: 'saved', at: Date.now() })).toMatch(/^Saved /);
  });

  it('and a FAILURE says so, with the reason', () => {
    // The whole point. "Not saved" is the sentence that was missing, and the reason is what makes
    // it actionable rather than alarming.
    const label = saveStateLabel({ kind: 'failed', message: 'HTTP 500' });
    expect(label).toContain('Not saved');
    expect(label).toContain('HTTP 500');
  });

  it('renders the idle state rather than nothing', () => {
    // A blank status line is indistinguishable from a broken one, and this box is where somebody
    // needs to know whether their typing survived.
    expect(render()).toMatch(/Auto-saves as you type/);
  });
});

describe('the component itself', () => {
  it('renders a textarea with the placeholder', () => {
    const html = render();
    expect(html).toContain('<textarea');
    expect(html).toContain(JOB_NOTES_PLACEHOLDER.slice(0, 40));
  });

  it('points the textarea at its own status line', () => {
    // A screen reader has to be able to reach "Not saved" from the box it applies to.
    const html = render();
    expect(html).toMatch(/aria-describedby="p1-notes-state"/);
    expect(html).toMatch(/id="p1-notes-state"/);
  });

  it('renders as a bare box when no heading is given', () => {
    expect(render()).not.toContain('project-notes__toggle');
  });

  it('and as a collapsible panel when one is', () => {
    const html = render({ heading: 'Notes for this project' });
    expect(html).toContain('project-notes__toggle');
    expect(html).toContain('Notes for this project');
  });

  it('SAYS how much it is holding when collapsed', () => {
    // A collapsed panel that gives no sign it contains anything is a panel nobody opens twice.
    const html = render({ heading: 'Notes', startCollapsed: true, value: 'gate code is 4412' });
    expect(html).toContain('4 words');
    expect(html, 'a collapsed panel must not render its textarea').not.toContain('<textarea');
  });

  it('and says nothing when there is nothing to say', () => {
    const html = render({ heading: 'Notes', startCollapsed: true, value: '   ' });
    expect(html).not.toContain('words');
  });

  it('brings its own stylesheet', () => {
    expect(read('app/admin/research/components/ProjectNotes.tsx')).toContain("import './ProjectNotes.css'");
  });

  it('and every colour it uses is a token that exists', () => {
    const css = read('app/admin/research/components/ProjectNotes.css');
    const tokens = css.match(/var\((--[a-z-]+)/g)?.map((m) => m.slice(4)) ?? [];
    expect(tokens.length).toBeGreaterThanOrEqual(8);
    const defined = read('app/styles/tokens.css') + read('app/styles/themes.css');
    for (const t of tokens) {
      expect(defined, `${t} is read by ProjectNotes.css and defined nowhere`).toContain(`${t}:`);
    }
  });
});

describe('one saver, reachable from everywhere', () => {
  const PAGE = read('app/admin/research/[projectId]/page.tsx');
  const FINAL = read('app/admin/research/[projectId]/_sections/FinalDocumentTab.tsx');
  const NOTES = read('app/admin/research/components/ProjectNotes.tsx');

  it('the project page renders notes OUTSIDE the stage panels', () => {
    // ── THE FIRST VERSION OF THIS ASSERTED POSITION, WHICH IS NOT THE PROPERTY ─────────────────
    //
    // It checked that `<ProjectNotes` appears before the first `{currentStage === 'upload' && …}`.
    // Wrapping the panel in `{currentStage === 'jobprep' && <ProjectNotes …>}` keeps it before that
    // point, so the mutation survived: the panel was gated to one stage and the test was happy.
    //
    // What matters is that nothing GATES it. Read the code immediately before the tag, with
    // comments stripped — the prose above it mentions `currentStage` while explaining exactly this.
    // `stripJs`, not a hand-rolled block-comment strip: the FIRST `<ProjectNotes` in the file is
    // inside a `//` comment saying the save moved into it, so the naive version found the prose and
    // reported the JSX as ungated no matter what was done to it. Twelfth time here.
    const code = stripJs(PAGE);
    const at = code.indexOf('<ProjectNotes');
    expect(at, 'the notes panel is gone').toBeGreaterThan(-1);
    const before = code.slice(Math.max(0, at - 160), at);
    expect(before, 'the notes panel is gated to one stage').not.toContain('currentStage ===');
    expect(before, 'the notes panel is behind some other condition').not.toContain('&& <');
  });

  it('the Job Prep tab renders the SAME component, not a second textarea', () => {
    // Two hand-written textareas against one column is how two boxes come to disagree about what
    // was typed.
    expect(FINAL).toContain('<ProjectNotes');
    expect(FINAL, 'the hand-rolled textarea is back').not.toContain('research-final-doc__notes-textarea');
  });

  it('and the page no longer runs its own debounced save', () => {
    // Two savers racing on one field is worse than one that reports what happened — and the old
    // one is the one that swallowed failures.
    expect(PAGE, 'the duplicate saver is back').not.toContain('jobNotesTimerRef');
    expect(PAGE).not.toContain('setSavingJobNotes');
  });

  it('the silent catch is gone', () => {
    // Read as CODE. The note explaining what the old catch did mentions the same words, and this
    // repository has had a check match its own prose eleven times.
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    expect(code).not.toContain('silently ignore');
  });

  it('and the new one checks the RESPONSE, not just that fetch resolved', () => {
    // `await fetch(...)` without looking at `res.ok` treats a 500 as a save. The old code did not
    // look at all.
    expect(NOTES).toContain('if (!res.ok) throw new Error');
  });

  it('a failed save offers a retry, and keeps what was typed', () => {
    // Without the pending value, a retry after the box has been re-rendered would post whatever is
    // in state now rather than the text that failed.
    expect(NOTES).toContain('pending.current = next');
    expect(NOTES).toContain('void save(pending.current ?? value)');
  });
});
