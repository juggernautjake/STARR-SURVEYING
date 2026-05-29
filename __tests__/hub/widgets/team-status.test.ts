import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, groupMembers } from '@/lib/hub/widgets/team-status';

describe('team-status — registry', () => {
  it('registers in operational category, manager roles only', () => {
    const def = getWidget('team-status');
    expect(def?.category).toBe('operational');
    expect(def?.allowedRoles).toEqual(['admin', 'developer', 'tech_support', 'equipment_manager']);
  });
});

describe('team-status — capForBucket', () => {
  it('returns expected counts', () => {
    expect(capForBucket('tiny')).toBe(3);
    expect(capForBucket('small')).toBe(6);
    expect(capForBucket('medium')).toBe(10);
    expect(capForBucket('large')).toBe(18);
    expect(capForBucket('xlarge')).toBe(30);
  });
});

describe('team-status — groupMembers', () => {
  const members = [
    { user_email: 'a@x', role: 'field_crew', shift: 'morning', status: 'clocked-in' as const },
    { user_email: 'b@x', role: 'admin',      shift: 'morning', status: 'clocked-in' as const },
    { user_email: 'c@x', role: 'field_crew', shift: 'afternoon', status: 'clocked-in' as const },
    { user_email: 'd@x',                    shift: 'morning', status: 'clocked-in' as const },
  ];

  it('groups by role with No role fallback', () => {
    const out = groupMembers(members, 'role');
    expect(out.get('field_crew')?.map((m) => m.user_email)).toEqual(['a@x', 'c@x']);
    expect(out.get('admin')?.map((m) => m.user_email)).toEqual(['b@x']);
    expect(out.get('No role')?.map((m) => m.user_email)).toEqual(['d@x']);
  });

  it('groups by shift', () => {
    const out = groupMembers(members, 'shift');
    expect(out.get('morning')?.length).toBe(3);
    expect(out.get('afternoon')?.length).toBe(1);
  });
});
