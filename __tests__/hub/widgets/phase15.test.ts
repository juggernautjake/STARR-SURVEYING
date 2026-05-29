import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/recent-drawings';
import '@/lib/hub/widgets/drawings-in-progress';
import '@/lib/hub/widgets/active-research-projects';
import { pipelineColor } from '@/lib/hub/widgets/pipeline-status';

describe('phase 15 — CAD + research widgets', () => {
  it('recent-drawings registered in cad category', () => {
    expect(getWidget('recent-drawings')?.category).toBe('cad');
  });
  it('drawings-in-progress registered in cad category', () => {
    expect(getWidget('drawings-in-progress')?.category).toBe('cad');
  });
  it('active-research-projects registered in research category', () => {
    expect(getWidget('active-research-projects')?.category).toBe('research');
  });
  it('pipeline-status registered in research category', () => {
    expect(getWidget('pipeline-status')?.category).toBe('research');
  });
  it('pipelineColor exposes each run state', () => {
    expect(pipelineColor('success')).toBe('var(--theme-success)');
    expect(pipelineColor('running')).toBe('var(--theme-accent)');
    expect(pipelineColor('failed')).toBe('var(--theme-danger)');
    expect(pipelineColor('queued')).toBe('var(--theme-fg-muted)');
  });
});
