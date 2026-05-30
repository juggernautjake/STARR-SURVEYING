import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  colorForKind,
  iconForKind,
  labelForKind,
  kindForAction,
  formatAge,
} from '@/lib/hub/widgets/job-activity-feed';

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

describe('job-activity-feed — kindForAction (R1: classify raw actions)', () => {
  it('classifies the real activity_log actions', () => {
    expect(kindForAction('job_stage_changed')).toBe('stage');
    expect(kindForAction('job_file_uploaded')).toBe('file');
    expect(kindForAction('job_photo_uploaded')).toBe('file');
    expect(kindForAction('cad_drawing_saved')).toBe('file');
    expect(kindForAction('job_team_added')).toBe('team');
    expect(kindForAction('job_tag_added')).toBe('tag');
  });
  it('falls back to comment for anything else', () => {
    expect(kindForAction('job_created')).toBe('comment');
    expect(kindForAction('')).toBe('comment');
  });
});

describe('job-activity-feed — formatAge', () => {
  const NOW = Date.parse('2026-05-30T12:00:00Z');
  it('renders a short relative age', () => {
    expect(formatAge('2026-05-30T11:30:00Z', NOW)).toBe('30m');
    expect(formatAge('2026-05-30T09:00:00Z', NOW)).toBe('3h');
    expect(formatAge('2026-05-28T12:00:00Z', NOW)).toBe('2d');
  });
});
