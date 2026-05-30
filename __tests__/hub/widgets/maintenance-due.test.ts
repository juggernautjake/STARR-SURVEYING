import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, toMaintenanceItem, filterByDue } from '@/lib/hub/widgets/maintenance-due';

describe('maintenance-due', () => {
  it('registers in equipment category', () => {
    expect(getWidget('maintenance-due')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('toMaintenanceItem (R1: real maintenance event shape)', () => {
  it('maps equipment_name / kind / state / scheduled_for|next_due_at', () => {
    expect(toMaintenanceItem({
      id: 'm1', equipment_inventory_id: 'eq-7', equipment_name: 'Trimble R12',
      kind: 'annual_calibration', state: 'scheduled',
      scheduled_for: '2026-06-05T00:00:00Z', next_due_at: '2026-07-01T00:00:00Z',
    })).toEqual({
      id: 'm1', inventory_id: 'eq-7', asset_name: 'Trimble R12',
      task_type: 'Annual Calibration', due_at: '2026-06-05T00:00:00Z', status: 'scheduled',
    });
  });
  it('falls back to next_due_at + generic labels', () => {
    const m = toMaintenanceItem({ id: 'm2', next_due_at: '2026-07-01T00:00:00Z' });
    expect(m.asset_name).toBe('Equipment');
    expect(m.task_type).toBe('Maintenance');
    expect(m.due_at).toBe('2026-07-01T00:00:00Z');
  });
});

describe('filterByDue', () => {
  const NOW = Date.parse('2026-05-30T12:00:00Z');
  const item = (id: string, due: string | null) => ({ id, asset_name: 'x', task_type: 'x', due_at: due });
  const list = [
    item('overdue', '2026-05-20T00:00:00Z'),
    item('thisweek', '2026-06-02T00:00:00Z'),
    item('thismonth', '2026-06-20T00:00:00Z'),
    item('far', '2026-09-01T00:00:00Z'),
    item('nodate', null),
  ];

  it('overdue-only keeps just past-due', () => {
    expect(filterByDue(list, 'overdue-only', NOW).map((i) => i.id)).toEqual(['overdue']);
  });
  it('week keeps overdue + within 7 days', () => {
    expect(filterByDue(list, 'week', NOW).map((i) => i.id)).toEqual(['overdue', 'thisweek']);
  });
  it('month keeps overdue + within 30 days (drops far + dateless)', () => {
    expect(filterByDue(list, 'month', NOW).map((i) => i.id)).toEqual(['overdue', 'thisweek', 'thismonth']);
  });
});
