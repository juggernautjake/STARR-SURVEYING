import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, colorForKind, iconForKind, labelForKind } from '@/lib/hub/widgets/job-activity-feed';

describe('job-activity-feed', () => {
  it('registers in work category', () => {
    expect(getWidget('job-activity-feed')?.category).toBe('work');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
  it('icon + color + label per kind', () => {
    expect(iconForKind('stage')).toBe('🔄');
    expect(iconForKind('file')).toBe('📎');
    expect(colorForKind('stage')).toBe('var(--theme-accent)');
    expect(colorForKind('file')).toBe('var(--theme-info)');
    expect(labelForKind('comment')).toBe('Comments');
    expect(labelForKind('tag')).toBe('Tag changes');
  });
});
