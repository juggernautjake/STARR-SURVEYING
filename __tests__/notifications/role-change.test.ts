// __tests__/notifications/role-change.test.ts
//
// notifications-completeness-pass Slice 3 — locks the pure role-change
// notification builder. The 6 kinds (role / credential added /
// credential removed / bonus / credits / note) replace the inline
// hand-rolled `notifyEmployee()` insert that used to live in
// /api/admin/employees/manage. Pay raises route through the existing
// pay-raise builder and are covered there.

import { describe, it, expect } from 'vitest';
import { buildRoleChangeNotification } from '@/lib/notifications/role-change';

describe('buildRoleChangeNotification — role', () => {
  it('promotes (positive pay impact) → /admin/my-pay with money in the body', () => {
    const out = buildRoleChangeNotification({
      user_email: 'crew@x.com', kind: 'role',
      label: 'Crew Chief', previous_label: 'Crew Member',
      pay_impact_per_hour: 2.5,
    });
    expect(out).toMatchObject({
      user_email: 'crew@x.com',
      type: 'profile_change',
      source_type: 'role',
      title: '🎉 Role updated: Crew Chief',
      link: '/admin/my-pay',
    });
    expect(out!.body).toContain('promoted to Crew Chief');
    expect(out!.body).toContain('+$2.50/hr');
  });

  it('negative impact reads as "reassigned"', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'role', label: 'Field', pay_impact_per_hour: -1,
    });
    expect(out!.body).toContain('reassigned to Field');
    expect(out!.body).toContain('-$1.00/hr');
  });

  it('zero pay impact → /admin/profile, no money in body', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'role', label: 'Researcher', pay_impact_per_hour: 0,
    });
    expect(out!.link).toBe('/admin/profile');
    expect(out!.body).not.toContain('$');
  });

  it('returns null without a new role label', () => {
    expect(buildRoleChangeNotification({ user_email: 'a@x.com', kind: 'role' })).toBeNull();
  });
});

describe('buildRoleChangeNotification — credential_added', () => {
  it('bonus credential → /admin/my-pay with the bonus rate in body', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'credential_added',
      label: 'RPLS', amount: 5,
    });
    expect(out).toMatchObject({
      type: 'profile_change',
      source_type: 'credential_added',
      title: '🏅 Credential earned: RPLS',
      link: '/admin/my-pay',
    });
    expect(out!.body).toContain('+$5.00/hr');
  });

  it('zero-bonus credential → /admin/profile, no rate in body', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'credential_added', label: 'CPR', amount: 0,
    });
    expect(out!.link).toBe('/admin/profile');
    expect(out!.body).not.toContain('+$');
  });
});

describe('buildRoleChangeNotification — credential_removed', () => {
  it('builds a friendly removal notice', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'credential_removed', label: 'CPR',
    });
    expect(out).toMatchObject({
      source_type: 'credential_removed',
      title: 'Credential removed: CPR',
      link: '/admin/profile',
    });
  });
});

describe('buildRoleChangeNotification — bonus', () => {
  it('composes a money-formatted title + reason in body → /admin/my-pay', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'bonus', amount: 150, reason: 'Great job on the boundary stake',
    });
    expect(out).toMatchObject({
      source_type: 'bonus',
      title: '🎁 Bonus awarded — $150.00',
      link: '/admin/my-pay',
    });
    expect(out!.body).toContain('Great job on the boundary stake');
  });

  it('returns null on non-positive amount', () => {
    expect(buildRoleChangeNotification({ user_email: 'a@x.com', kind: 'bonus', amount: 0 })).toBeNull();
    expect(buildRoleChangeNotification({ user_email: 'a@x.com', kind: 'bonus', amount: -10 })).toBeNull();
  });
});

describe('buildRoleChangeNotification — credits', () => {
  it('floors the points + composes a learning-credits title', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'credits', amount: 12.7, reason: 'Module quiz',
    });
    expect(out).toMatchObject({
      source_type: 'learning_credits',
      title: '📚 12 learning credits awarded',
      link: '/admin/profile',
    });
  });
});

describe('buildRoleChangeNotification — note', () => {
  it('uses the reason as the body, fixed title', () => {
    const out = buildRoleChangeNotification({
      user_email: 'a@x.com', kind: 'note', reason: 'Don\'t forget the safety vest at the next job.',
    });
    expect(out).toMatchObject({
      source_type: 'admin_note',
      title: '📋 Admin note',
      link: '/admin/profile',
    });
    expect(out!.body).toBe("Don't forget the safety vest at the next job.");
  });

  it('returns null without a note', () => {
    expect(buildRoleChangeNotification({ user_email: 'a@x.com', kind: 'note' })).toBeNull();
  });
});

describe('buildRoleChangeNotification — guards', () => {
  it('returns null on empty user email', () => {
    expect(buildRoleChangeNotification({ user_email: '', kind: 'role', label: 'X' })).toBeNull();
  });
  it('lowercases + trims the email', () => {
    const out = buildRoleChangeNotification({
      user_email: ' Crew@X.COM ', kind: 'role', label: 'Lead', pay_impact_per_hour: 0,
    });
    expect(out!.user_email).toBe('crew@x.com');
  });
});
