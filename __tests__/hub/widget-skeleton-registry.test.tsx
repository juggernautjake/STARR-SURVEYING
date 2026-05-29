// __tests__/hub/widget-skeleton-registry.test.tsx
//
// Slice 204 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the declarative skeleton field on WidgetDefinition + the two
// canonical widgets (my-jobs, team-status) declaring their own.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { getWidget, getWidgetSkeleton } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';
import { MyJobsSkeleton } from '@/lib/hub/widgets/my-jobs';
import { TeamStatusSkeleton } from '@/lib/hub/widgets/team-status';

describe('WidgetDefinition.Skeleton — optional field', () => {
  it('exposes the registered Skeleton component via getWidgetSkeleton', () => {
    expect(getWidgetSkeleton('my-jobs')).toBe(MyJobsSkeleton);
    expect(getWidgetSkeleton('team-status')).toBe(TeamStatusSkeleton);
  });

  it('returns null for widgets that did not declare a Skeleton', () => {
    // Pick any registered widget that hasn't been migrated to a
    // custom skeleton yet — outstanding-invoices fits the bill.
    const def = getWidget('outstanding-invoices');
    expect(def).toBeDefined();
    expect(def!.Skeleton).toBeUndefined();
    expect(getWidgetSkeleton('outstanding-invoices')).toBeNull();
  });

  it('returns null for unknown widget ids', () => {
    expect(getWidgetSkeleton('nope-not-real')).toBeNull();
  });
});

describe('MyJobsSkeleton — renders rows matching rowLimit + bucket', () => {
  it('renders the loading status surface', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <MyJobsSkeleton
        size={{ w: 6, h: 3 }}
        content={{
          filter: 'mine',
          stage: 'fieldwork',
          columns: ['name'],
          sortBy: 'updated',
          rowLimit: 10,
          showStageColors: true,
        }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading jobs"');
  });

  it('caps the row count at the bucket-determined max even when rowLimit is huge', () => {
    // Tiny bucket (w=2, h=1) caps at 2 visible rows in
    // capForBucket('tiny'), regardless of settings.rowLimit.
    const html = ReactDOMServer.renderToStaticMarkup(
      <MyJobsSkeleton
        size={{ w: 2, h: 1 }}
        content={{
          filter: 'mine',
          stage: 'fieldwork',
          columns: ['name'],
          sortBy: 'updated',
          rowLimit: 50,
          showStageColors: true,
        }}
      />,
    );
    // Two <li> tags in the markup. Counting the literal
    // closing tag string is a stable invariant.
    const liCloseCount = (html.match(/<\/li>/g) ?? []).length;
    expect(liCloseCount).toBe(2);
  });
});

describe('TeamStatusSkeleton — renders bucket-capped rows', () => {
  it('renders the loading status surface', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <TeamStatusSkeleton size={{ w: 4, h: 3 }} content={{ groupBy: 'none' }} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading team status"');
  });

  it('caps at 5 rows even when the bucket allows more (avoid runaway skeletons)', () => {
    // xlarge bucket (w=8, h=6) caps at 30 in capForBucket('xlarge'),
    // but the skeleton applies its own ceiling of 5 so the loading
    // state doesn't dominate the cell.
    const html = ReactDOMServer.renderToStaticMarkup(
      <TeamStatusSkeleton size={{ w: 8, h: 6 }} content={{ groupBy: 'none' }} />,
    );
    const liCloseCount = (html.match(/<\/li>/g) ?? []).length;
    expect(liCloseCount).toBeLessThanOrEqual(5);
  });
});
