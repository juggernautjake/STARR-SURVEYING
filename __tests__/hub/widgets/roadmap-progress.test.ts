// __tests__/hub/widgets/roadmap-progress.test.ts
//
// hub-widget-excellence-13 — roadmap-progress R1: the roadmap GET
// returns { modules, overall_progress: { percentage } }, not a
// { roadmap } object. Locks the pure rollup mapper.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { toRoadmap } from '@/lib/hub/widgets/roadmap-progress';

describe('roadmap-progress — registry', () => {
  it('registers in the learning category', () => {
    expect(getWidget('roadmap-progress')?.category).toBe('learning');
  });
});

describe('toRoadmap (R1: derive rollup from modules + overall_progress)', () => {
  it('builds the rollup with overall percent + first incomplete module', () => {
    const r = toRoadmap({
      modules: [
        { title: 'Boundary Basics', percentage: 100 },
        { title: 'Traverse Math', percentage: 40 },
        { title: 'Geodesy', percentage: 0 },
      ],
      overall_progress: { percentage: 47 },
    })!;
    expect(r).toEqual({
      id: 'overall', name: 'Learning Roadmap', percent_complete: 47, current_module: 'Traverse Math',
    });
  });

  it('clamps/rounds the percent + tolerates a missing overall', () => {
    expect(toRoadmap({ modules: [{ title: 'M', percentage: 0 }] })!.percent_complete).toBe(0);
    expect(toRoadmap({ modules: [{ title: 'M', percentage: 0 }], overall_progress: { percentage: 33.6 } })!.percent_complete).toBe(34);
  });

  it('current_module is null when everything is complete', () => {
    expect(toRoadmap({ modules: [{ title: 'M', percentage: 100 }], overall_progress: { percentage: 100 } })!.current_module).toBeNull();
  });

  it('returns null when there are no modules (empty state)', () => {
    expect(toRoadmap({ modules: [] })).toBeNull();
    expect(toRoadmap({})).toBeNull();
  });
});
