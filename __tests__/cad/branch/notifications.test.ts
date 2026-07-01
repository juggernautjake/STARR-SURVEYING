// __tests__/cad/branch/notifications.test.ts
//
// cad-branching — pure branch/review notification builders.

import { describe, it, expect } from 'vitest';
import {
  buildBranchSubmittedNotification,
  buildBranchAcceptedNotification,
  buildBranchRejectedNotification,
  reviewInboxHref,
} from '@/lib/notifications/branch';

describe('buildBranchSubmittedNotification', () => {
  it('targets the owner and deep-links to the review inbox', () => {
    const n = buildBranchSubmittedNotification({
      owner_email: 'Owner@X.com',
      author_email: 'hank@x.com',
      parent_id: 'p1',
      branch_id: 'b1',
      drawing_name: 'Lot 5 Boundary',
    });
    expect(n).not.toBeNull();
    expect(n!.user_email).toBe('owner@x.com'); // lower-cased
    expect(n!.source_type).toBe('drawing_branch_submitted');
    expect(n!.link).toBe(reviewInboxHref('p1'));
    expect(n!.title).toContain('hank@x.com');
    expect(n!.title).toContain('Lot 5 Boundary');
  });

  it("includes the author's note when present", () => {
    const n = buildBranchSubmittedNotification({
      owner_email: 'o@x.com', author_email: 'a@x.com', parent_id: 'p', branch_id: 'b', note: 'Added the north fence line',
    });
    expect(n!.body).toContain('Added the north fence line');
  });

  it('returns null without an owner or parent', () => {
    expect(buildBranchSubmittedNotification({ owner_email: '', author_email: 'a', parent_id: 'p', branch_id: 'b' })).toBeNull();
    expect(buildBranchSubmittedNotification({ owner_email: 'o', author_email: 'a', parent_id: '', branch_id: 'b' })).toBeNull();
  });
});

describe('buildBranchAcceptedNotification', () => {
  it('targets the author and links to the (now-updated) main drawing', () => {
    const n = buildBranchAcceptedNotification({
      author_email: 'Hank@X.com', reviewer_email: 'boss@x.com', parent_id: 'p1', branch_id: 'b1', drawing_name: 'Lot 5',
    });
    expect(n!.user_email).toBe('hank@x.com');
    expect(n!.source_type).toBe('drawing_branch_accepted');
    expect(n!.link).toBe('/admin/cad?drawing=p1');
    expect(n!.body).toContain('boss@x.com');
  });
});

describe('buildBranchRejectedNotification', () => {
  it('targets the author and links back to their branch', () => {
    const n = buildBranchRejectedNotification({
      author_email: 'hank@x.com', reviewer_email: 'boss@x.com', parent_id: 'p1', branch_id: 'b1', drawing_name: 'Lot 5',
    });
    expect(n!.user_email).toBe('hank@x.com');
    expect(n!.source_type).toBe('drawing_branch_rejected');
    expect(n!.link).toBe('/admin/cad?drawing=b1');
  });
  it('surfaces the reviewer note when given', () => {
    const n = buildBranchRejectedNotification({
      author_email: 'a@x.com', parent_id: 'p', branch_id: 'b', note: 'Please keep the original monument labels',
    });
    expect(n!.body).toContain('Please keep the original monument labels');
  });
  it('returns null without an author or branch id', () => {
    expect(buildBranchRejectedNotification({ author_email: '', parent_id: 'p', branch_id: 'b' })).toBeNull();
    expect(buildBranchRejectedNotification({ author_email: 'a', parent_id: 'p', branch_id: '' })).toBeNull();
  });
});
