// __tests__/research/edit-project-modal-is-mounted.test.tsx — Phase B5 (under B1a).
//
// Third extraction from `[projectId]/page.tsx`, and the one that had a live bug in it an hour
// earlier: the overlay closed on an outside click, so a stray click beside the form threw away
// every edit. The owner asked for that to stop on 2026-08-30 and it reached only the NEW project
// modal.
//
// **The fix landed first, on its own, with its own guard. Then this moved the code.** Doing both in
// one commit turns the diff from "these lines moved" into "these lines moved AND something
// changed", which is the shape a regression hides in — and here the change was the whole point, so
// burying it would have been worse than usual.
//
// The 79 moved lines were compared byte-for-byte against `HEAD`, allowing only the prop renames.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import EditProjectModal from '../../app/admin/research/[projectId]/_sections/EditProjectModal';

const ROOT = process.cwd();
const PAGE = fs.readFileSync(path.join(ROOT, 'app/admin/research/[projectId]/page.tsx'), 'utf8');

const VALUE = {
  name: 'Bell County Courthouse',
  description: 'A description',
  property_address: '101 E Central Ave',
  county: 'Bell',
  state: 'TX',
  // J1 — the job link. `null` is the ordinary case: most projects are not attached to one.
  job_id: null,
};

const render = (over: Partial<React.ComponentProps<typeof EditProjectModal>> = {}) =>
  ReactDOMServer.renderToStaticMarkup(
    React.createElement(EditProjectModal, {
      open: true, value: VALUE, onChange: () => {}, onSubmit: () => {},
      onClose: () => {}, saving: false, ...over,
    }),
  );

describe('the page still mounts it', () => {
  it('imports the section', () => {
    // The type came along in J1 (`EditProjectValue` now carries `job_id`), so the import is no
    // longer bare. Matched on the module rather than the exact clause: the property this asserts is
    // "the page uses THIS file", and pinning the punctuation would make every future named export
    // a test failure with nothing wrong.
    expect(PAGE).toMatch(/import EditProjectModal[^;]*from '\.\/_sections\/EditProjectModal'/);
  });

  it('renders it unconditionally — the open/closed decision moved INSIDE', () => {
    // B2 learned that `{false && <X />}` satisfies a naive is-it-rendered check. Here the guard is
    // stronger than "no condition on the line": the component takes `open` and returns null itself,
    // so the page has no condition to get wrong.
    const line = PAGE.split('\n').find((l) => l.includes('<EditProjectModal'))!;
    expect(line).not.toMatch(/&&|\?/);
    expect(line.trim().startsWith('<EditProjectModal')).toBe(true);
    expect(PAGE).toContain('open={showEditProject}');
  });

  it('passes the form state and every callback', () => {
    const at = PAGE.indexOf('<EditProjectModal');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    for (const prop of ['value={editProjectData}', 'onChange={setEditProjectData}',
      'onSubmit={handleSaveProject}', 'saving={savingProject}']) {
      expect(el, `${prop} is missing`).toContain(prop);
    }
  });

  it('the old inline markup is gone from the page', () => {
    expect(PAGE).not.toContain('{showEditProject && (');
  });
});

describe('it renders nothing when closed', () => {
  it('returns null rather than a hidden overlay', () => {
    // A closed modal that still renders its overlay covers the page with an invisible layer that
    // swallows every click — a bug that looks like "the page stopped responding".
    expect(render({ open: false })).toBe('');
  });
});

describe('what the owner asked for is still true here', () => {
  it('the overlay has no click handler', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/admin/research/[projectId]/_sections/EditProjectModal.tsx'), 'utf8');
    const overlay = src.slice(src.indexOf('research-modal-overlay'), src.indexOf('research-modal"'));
    expect(overlay, 'a click beside the form must not discard the edits').not.toContain('onClick');
  });

  it('but Escape and Cancel both still close it', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/admin/research/[projectId]/_sections/EditProjectModal.tsx'), 'utf8');
    expect(src).toContain("if (e.key === 'Escape') onClose()");
    expect(render()).toContain('research-modal__cancel');
  });

  it('and the inner stopPropagation went with the handler it guarded', () => {
    // It existed only to stop a click inside the form reaching the overlay's close handler. With no
    // handler there it guards nothing, and a stray stopPropagation makes the next reader wonder.
    const src = fs.readFileSync(
      path.join(ROOT, 'app/admin/research/[projectId]/_sections/EditProjectModal.tsx'), 'utf8');
    expect(src).not.toContain('stopPropagation');
  });
});

describe('the form itself', () => {
  it('shows the current values', () => {
    const html = render();
    expect(html).toContain('value="Bell County Courthouse"');
    expect(html).toContain('value="101 E Central Ave"');
  });

  it('cannot be submitted without a name', () => {
    // The submit is disabled on an empty name AND the handler re-checks it — two gates, because a
    // disabled button is a UI courtesy rather than a rule.
    expect(render({ value: { ...VALUE, name: '   ' } })).toMatch(/<button[^>]*disabled/);
    expect(PAGE).toContain('!editProjectData.name.trim()');
  });

  it('says it is saving, and stops accepting a second submit', () => {
    const html = render({ saving: true });
    expect(html).toContain('Saving...');
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
