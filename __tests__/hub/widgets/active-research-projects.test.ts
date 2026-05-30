// __tests__/hub/widgets/active-research-projects.test.ts
//
// hub-widget-excellence-12 — active-research-projects R1: research_projects
// has no 'active' status (it's upload→…→complete), so "active" = not
// complete, filtered client-side. Locks the pure helpers.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { isActiveProject, humanizeStatus } from '@/lib/hub/widgets/active-research-projects';

describe('active-research-projects — registry', () => {
  it('registers in the research category', () => {
    expect(getWidget('active-research-projects')?.category).toBe('research');
  });
});

describe('isActiveProject (R1: not-complete = active)', () => {
  it('is active for any in-flight workflow status', () => {
    for (const s of ['upload', 'configure', 'analyzing', 'review', 'drawing', 'verifying']) {
      expect(isActiveProject(s)).toBe(true);
    }
  });
  it('is not active when complete or missing', () => {
    expect(isActiveProject('complete')).toBe(false);
    expect(isActiveProject(null)).toBe(false);
    expect(isActiveProject('')).toBe(false);
  });
});

describe('humanizeStatus', () => {
  it('title-cases the workflow status', () => {
    expect(humanizeStatus('analyzing')).toBe('Analyzing');
    expect(humanizeStatus('in_review')).toBe('In Review');
    expect(humanizeStatus(null)).toBe('');
  });
});
