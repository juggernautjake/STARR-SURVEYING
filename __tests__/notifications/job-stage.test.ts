// __tests__/notifications/job-stage.test.ts
//
// Slice 2d of hub-widget-excellence-03-notifications. Locks the pure
// job-stage recipient + transition helpers.

import { describe, it, expect } from 'vitest';
import {
  resolveStageRecipients,
  isStageTransition,
} from '@/lib/notifications/job-stage';

describe('resolveStageRecipients', () => {
  it('returns the team emails minus the actor', () => {
    const out = resolveStageRecipients(
      ['crew@x.com', 'lead@x.com', 'admin@x.com'],
      'admin@x.com',
    );
    expect(out).toEqual(['crew@x.com', 'lead@x.com']);
  });

  it('excludes the actor case-insensitively', () => {
    const out = resolveStageRecipients(['Crew@X.com', 'ADMIN@x.com'], 'admin@x.com');
    expect(out).toEqual(['Crew@X.com']);
  });

  it('de-dupes (case-insensitive, keeps first-seen casing) + drops empties', () => {
    const out = resolveStageRecipients(
      ['crew@x.com', 'CREW@x.com', null, '  ', 'lead@x.com'],
      'someone-else@x.com',
    );
    expect(out).toEqual(['crew@x.com', 'lead@x.com']);
  });

  it('returns an empty list when the only member is the actor', () => {
    expect(resolveStageRecipients(['admin@x.com'], 'admin@x.com')).toEqual([]);
  });
});

describe('isStageTransition', () => {
  it('is true when the stage actually changes', () => {
    expect(isStageTransition('research', 'fieldwork')).toBe(true);
  });

  it('is false for a no-op (same stage)', () => {
    expect(isStageTransition('research', 'research')).toBe(false);
  });

  it('is false when either stage is missing/blank', () => {
    expect(isStageTransition(null, 'fieldwork')).toBe(false);
    expect(isStageTransition('research', '')).toBe(false);
    expect(isStageTransition(undefined, undefined)).toBe(false);
  });
});
