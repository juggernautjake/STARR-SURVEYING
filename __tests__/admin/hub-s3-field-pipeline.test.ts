// __tests__/admin/hub-s3-field-pipeline.test.ts
//
// Slice S3 of widget-size-responsive-content-2026-06-18 —
// per-bucket growth for the two non-legacy field-data + drawings
// widgets. The four legacy widgets in S3
// (active-research-projects, recent-drawings, drawings-in-progress,
// job-activity-feed) are deferred per the plan: their behaviour
// either already lives behind the consolidated `drawings-hub` /
// `activity` tiles, or the growth past tiny adds rows without
// substance.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  countByType,
} from '@/lib/hub/widgets/field-data-pending';
import {
  countByStatus,
} from '@/lib/hub/widgets/pipeline-status';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('field-data-pending pure helpers (S3)', () => {
  it('countByType buckets captures + sorts descending by count', () => {
    const out = countByType([
      { id: '1', job_id: 'j', data_type: 'point', collected_at: '' },
      { id: '2', job_id: 'j', data_type: 'POINT', collected_at: '' }, // case-insensitive
      { id: '3', job_id: 'j', data_type: 'photo', collected_at: '' },
      { id: '4', job_id: 'j', data_type: 'note', collected_at: '' },
      { id: '5', job_id: 'j', data_type: 'point', collected_at: '' },
    ]);
    expect(out).toEqual([
      { type: 'point', count: 3 },
      { type: 'photo', count: 1 },
      { type: 'note', count: 1 },
    ]);
  });

  it("falls back to 'other' when data_type is missing", () => {
    const out = countByType([{ id: '1', job_id: 'j', data_type: '', collected_at: '' }]);
    expect(out).toEqual([{ type: 'other', count: 1 }]);
  });
});

describe('field-data-pending rendering contract (S3)', () => {
  const SRC = read('lib/hub/widgets/field-data-pending/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`field-data-pending-\$\{bucket\}`\}/);
  });

  it("type-breakdown chip strip renders at medium+", () => {
    expect(SRC).toMatch(/const showTypeChips = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="field-data-pending-type-chips"/);
  });

  it('"Open field-data queue" CTA is xlarge-only', () => {
    expect(SRC).toMatch(/const showQueueCta = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="field-data-pending-cta"/);
  });
});

describe('pipeline-status pure helpers (S3)', () => {
  it('countByStatus buckets runs into the four canonical statuses', () => {
    const runs = [
      { id: '1', name: 'A', status: 'running' as const },
      { id: '2', name: 'B', status: 'success' as const },
      { id: '3', name: 'C', status: 'failed' as const },
      { id: '4', name: 'D', status: 'failed' as const },
      { id: '5', name: 'E', status: 'queued' as const },
      { id: '6', name: 'F', status: 'success' as const },
    ];
    expect(countByStatus(runs)).toEqual({ running: 1, success: 2, failed: 2, queued: 1 });
  });

  it('returns all-zero for an empty list', () => {
    expect(countByStatus([])).toEqual({ running: 0, success: 0, failed: 0, queued: 0 });
  });
});

describe('pipeline-status rendering contract (S3)', () => {
  const SRC = read('lib/hub/widgets/pipeline-status/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`pipeline-status-\$\{bucket\}`\}/);
  });

  it('status chip strip renders at medium+', () => {
    expect(SRC).toMatch(/const showStatusChips = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="pipeline-status-status-chips"/);
  });

  it('failure footer (recent-failures detail) is xlarge-only', () => {
    expect(SRC).toMatch(/const showFailureFooter = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="pipeline-status-failure-footer"/);
  });
});
