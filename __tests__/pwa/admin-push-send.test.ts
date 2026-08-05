// __tests__/pwa/admin-push-send.test.ts
//
// The delivery half of the business app's notifications: turning a bell row into a phone banner and
// an app-icon badge. The owner's ask — "a notification symbol on the app icon whenever there is a
// new notification" — is only met if `notify()` fans out to the recipient's devices AND the payload
// carries the unread count the icon badge shows.
//
// These lock the contract that could regress silently: the count is included, a dead endpoint is
// disabled (not retried forever), a transient failure is not treated as dead, and no subscriptions
// means no attempt.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── supabase mock: a per-table chainable/awaitable builder ──────────────────────────────────────
const state: {
  userId: string | null;
  subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }>;
  unread: number;
  updates: Array<{ id: unknown; patch: Record<string, unknown> }>;
} = { userId: 'u-1', subs: [], unread: 0, updates: [] };

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        _table: table,
        _update: null as Record<string, unknown> | null,
        select() { return b; },
        eq() { return b; },
        is() { return b; },
        update(patch: Record<string, unknown>) { b._update = patch; return b; },
        maybeSingle() {
          if (table === 'registered_users') {
            return Promise.resolve({ data: state.userId ? { id: state.userId } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // Awaited directly (no maybeSingle): list query, count query, or an update.
        then(resolve: (v: unknown) => unknown) {
          if (b._update) {
            state.updates.push({ id: 'captured', patch: b._update });
            return resolve({ data: null, error: null });
          }
          if (table === 'admin_push_subscriptions') return resolve({ data: state.subs, error: null });
          if (table === 'notifications') return resolve({ count: state.unread, error: null });
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  },
}));

// ── web-push mock: report whatever we tell it, per subscription ──────────────────────────────────
const sendResults = vi.fn();
vi.mock('@/lib/push/web-push', () => ({
  sendPush: (subs: unknown[], payload: string) => sendResults(subs, payload),
}));

const { sendAdminPush } = await import('@/lib/push/admin-push');

beforeEach(() => {
  state.userId = 'u-1';
  state.subs = [];
  state.unread = 0;
  state.updates = [];
  sendResults.mockReset();
});

describe('sendAdminPush — the delivery contract', () => {
  it('sends to every live device, and the payload carries the unread count for the app-icon badge', async () => {
    state.subs = [{ id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', failure_count: 0 }];
    state.unread = 4;
    sendResults.mockResolvedValue([{ sub: state.subs[0], result: { ok: true } }]);

    await sendAdminPush('crew@starr.com', { title: 'New lead', body: 'Acme wants a survey', href: '/admin/leads' });

    expect(sendResults).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendResults.mock.calls[0][1] as string);
    expect(payload.unreadCount).toBe(4);
    expect(payload.title).toBe('New lead');
    expect(payload.href).toBe('/admin/leads');
  });

  it('does not attempt a send when the user has no live subscriptions', async () => {
    state.subs = [];
    await sendAdminPush('crew@starr.com', { title: 'x' });
    expect(sendResults).not.toHaveBeenCalled();
  });

  it('does nothing (no throw) when the email resolves to no user', async () => {
    state.userId = null;
    await expect(sendAdminPush('ghost@starr.com', { title: 'x' })).resolves.toBeUndefined();
    expect(sendResults).not.toHaveBeenCalled();
  });

  it('disables a device the push service says is GONE (404/410)', async () => {
    state.subs = [{ id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', failure_count: 0 }];
    sendResults.mockResolvedValue([{ sub: state.subs[0], result: { ok: false, gone: true } }]);

    await sendAdminPush('crew@starr.com', { title: 'x' });

    const disabling = state.updates.find((u) => 'disabled_at' in u.patch);
    expect(disabling).toBeDefined();
    expect(disabling!.patch.disabled_at).not.toBeNull();
  });

  it('does NOT disable on a single transient failure — it only counts a strike', async () => {
    state.subs = [{ id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', failure_count: 0 }];
    sendResults.mockResolvedValue([{ sub: state.subs[0], result: { ok: false, gone: false, status: 500 } }]);

    await sendAdminPush('crew@starr.com', { title: 'x' });

    const update = state.updates.find((u) => 'failure_count' in u.patch);
    expect(update).toBeDefined();
    expect(update!.patch.failure_count).toBe(1);
    expect(update!.patch.disabled_at).toBeNull();
  });

  it('never throws even if the push transport itself rejects', async () => {
    state.subs = [{ id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', failure_count: 0 }];
    sendResults.mockRejectedValue(new Error('transport blew up'));
    await expect(sendAdminPush('crew@starr.com', { title: 'x' })).resolves.toBeUndefined();
  });
});
