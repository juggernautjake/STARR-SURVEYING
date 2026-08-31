// __tests__/research/project-header-section-is-mounted.test.tsx — Phase B3 (under B1a).
//
// Second extraction from `[projectId]/page.tsx`. Same discipline as B2, and the same first
// assertion: the one that matters is about the PAGE, not about the section. An extraction nothing
// mounts is a deletion with extra steps.
//
// ── THE HEXES CAME ACROSS UNCHANGED, ON PURPOSE ─────────────────────────────────────────────────
//
// `#D1D5DB`, `#FECACA` and `#DC2626` are inline in this header and there are tokens for all three.
// They were not tidied on the way out. Each extraction is made trustworthy by comparing the moved
// lines byte-for-byte against `HEAD`; changing colours in the same commit turns the diff from
// "these lines moved" into "these lines moved AND something changed", which is the shape a real
// regression hides in. The inline-hex ratchet is per-file, so the count moves from `page.tsx` to
// the section and the total is unchanged — nothing is lost by doing it separately.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import ProjectHeader from '../../app/admin/research/[projectId]/_sections/ProjectHeader';

const ROOT = process.cwd();
const PAGE = fs.readFileSync(path.join(ROOT, 'app/admin/research/[projectId]/page.tsx'), 'utf8');

describe('the page still mounts it', () => {
  it('imports the section', () => {
    expect(PAGE).toContain("import ProjectHeader from './_sections/ProjectHeader'");
  });

  it('renders it, unconditionally', () => {
    // B2 learned this the hard way: `{false && <ProjectHeader ...}` satisfies a naive "is it
    // rendered?" check while putting nothing on screen.
    const line = PAGE.split('\n').find((l) => l.includes('<ProjectHeader'))!;
    expect(line, 'the header should not be behind a condition').not.toMatch(/&&|\?/);
    expect(line.trim().startsWith('<ProjectHeader')).toBe(true);
  });

  it('passes the project and both actions', () => {
    const at = PAGE.indexOf('<ProjectHeader');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    expect(el).toContain('project={project}');
    expect(el).toContain('onEdit={openEditProject}');
    expect(el).toContain('onArchive={handleArchiveProject}');
  });

  it('the old inline markup is gone', () => {
    expect(PAGE, 'the header should live in exactly one place')
      .not.toContain('<div className="research-page__header">');
  });
});

describe('what the header renders', () => {
  const render = (p: React.ComponentProps<typeof ProjectHeader>['project']) =>
    ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProjectHeader, { project: p, onEdit: () => {}, onArchive: () => {} }),
    );

  it('shows the name always', () => {
    expect(render({ name: 'Bell County Courthouse' })).toContain('Bell County Courthouse');
  });

  it('renders the county as a badge, with the state appended', () => {
    const html = render({ name: 'x', property_address: '1 Main St', county: 'Bell', state: 'TX' });
    expect(html).toContain('research-county-badge');
    expect(html).toContain('Bell County, TX');
  });

  it('falls back to a bare state when there is no county', () => {
    // The two branches are mutually exclusive by construction — `{project.county && …}` and
    // `{!project.county && project.state && …}`. Collapsing them would print the state twice.
    const html = render({ name: 'x', property_address: '1 Main St', state: 'TX' });
    expect(html).not.toContain('research-county-badge');
    expect(html).toContain(', TX');
  });

  it('does not print a stray comma or badge when neither is known', () => {
    const html = render({ name: 'x', property_address: '1 Main St' });
    expect(html).not.toContain('research-county-badge');
    expect(html).not.toContain('County');
  });

  it('omits the address line entirely when there is no address', () => {
    // Rendering an empty pin icon on a project with no address is worse than rendering nothing.
    expect(render({ name: 'x' })).not.toContain('research-county-badge');
    expect(render({ name: 'x', county: 'Bell' }), 'the county rides on the address line')
      .not.toContain('Bell County');
  });

  it('both actions are labelled for a screen reader', () => {
    // "Edit Details" and "Archive" are clear on screen; the aria-labels say which PROJECT-level
    // thing they act on, since the page has several other edit buttons further down.
    const html = render({ name: 'x' });
    expect(html).toContain('aria-label="Edit project details"');
    expect(html).toContain('aria-label="Archive project"');
  });
});
