// __tests__/saas/notifications-prefs.test.ts
//
// `effectiveChannels` is the resolution rule the notification dispatcher
// runs for each fanout: given a user's per-event overrides, the event's
// per-channel defaults, and the event's allowed-channel set, return the
// channels that should actually receive the message. A regression here
// can either silently drop a notification (channel returned empty) or
// fan out to a channel the user explicitly opted out of — both
// user-trust-eroding, so pinning the matrix.

import { describe, it, expect } from 'vitest';
import { effectiveChannels } from '@/lib/saas/notifications/prefs';

const allowAll = { email: true, in_app: true, sms: true } as const;
const allowEmailInApp = { email: true, in_app: true } as const;

describe('effectiveChannels — gate by what the event allows', () => {
  it('drops a channel the event doesn\'t support, even if the user opted in', () => {
    const out = effectiveChannels({ sms: true }, { sms: true }, { email: true });
    expect(out).toEqual([]);
  });

  it('keeps a channel allowed by the event AND opted-in by the user', () => {
    const out = effectiveChannels({ email: true }, {}, allowAll);
    expect(out).toEqual(['email']);
  });

  it('falls back to event defaults when the user has no preference', () => {
    const out = effectiveChannels({}, { email: true, in_app: true, sms: false }, allowAll);
    expect(out).toEqual(['email', 'in_app']);
  });

  it('user opt-OUT beats event default', () => {
    // Event default = email on; user explicitly turned email off.
    const out = effectiveChannels({ email: false }, { email: true }, allowAll);
    expect(out).toEqual([]);
  });

  it('user opt-IN beats event default off', () => {
    // Event default = sms off; user explicitly turned sms on.
    const out = effectiveChannels({ sms: true }, { sms: false }, allowAll);
    expect(out).toEqual(['sms']);
  });

  it('preserves the canonical channel order: email, in_app, sms', () => {
    const out = effectiveChannels(
      { email: true, in_app: true, sms: true },
      {},
      allowAll,
    );
    expect(out).toEqual(['email', 'in_app', 'sms']);
  });

  it('returns an empty array when nothing is allowed', () => {
    const out = effectiveChannels({}, {}, {});
    expect(out).toEqual([]);
  });

  it('handles the "allowed but defaulted off and no user pref" case correctly', () => {
    // event allows email but doesn't default it on, user said nothing → off.
    const out = effectiveChannels({}, {}, allowEmailInApp);
    expect(out).toEqual([]);
  });
});
