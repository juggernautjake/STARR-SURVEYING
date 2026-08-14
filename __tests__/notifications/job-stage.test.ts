// __tests__/notifications/job-stage.test.ts
//
// Slice 2d of hub-widget-excellence-03-notifications.
//
// The `resolveStageRecipients` cases that used to live here moved to
// __tests__/notifications/job-event.test.ts when N3 (2026-08-14) retired that helper in favour of
// `jobRecipients` — which knows about `removed_at` and `declined_at`, neither of which the stage
// resolver had ever heard of. Every property those tests asserted (de-dupe, case-insensitive actor
// exclusion, dropping empties) is asserted there against the surviving function.

import { describe, it, expect } from 'vitest';
import { isStageTransition } from '@/lib/notifications/job-stage';

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
