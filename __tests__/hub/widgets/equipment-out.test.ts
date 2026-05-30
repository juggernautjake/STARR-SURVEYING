import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, toEquipmentOut, isOverdue } from '@/lib/hub/widgets/equipment-out';

describe('equipment-out', () => {
  it('registers in equipment category', () => {
    expect(getWidget('equipment-out-today')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('toEquipmentOut (R1: real out_now shape)', () => {
  it('maps equipment_name / checked_out_to_user / reserved_to / inventory id', () => {
    expect(toEquipmentOut({
      id: 'res1',
      equipment_inventory_id: 'eq-7',
      equipment_name: 'Trimble R12',
      checked_out_to_user: 'crew@x.com',
      actual_checked_out_at: '2026-05-30T08:00:00Z',
      reserved_to: '2026-05-31T17:00:00Z',
    })).toEqual({
      id: 'res1',
      inventory_id: 'eq-7',
      asset_name: 'Trimble R12',
      checked_out_to: 'crew@x.com',
      checked_out_at: '2026-05-30T08:00:00Z',
      expected_return_at: '2026-05-31T17:00:00Z',
    });
  });

  it('falls back to "Equipment" when the name is missing', () => {
    expect(toEquipmentOut({ id: 'r' }).asset_name).toBe('Equipment');
  });
});

describe('isOverdue', () => {
  const NOW = Date.parse('2026-05-31T12:00:00Z');
  it('is true when the expected return is past', () => {
    expect(isOverdue('2026-05-30T17:00:00Z', NOW)).toBe(true);
  });
  it('is false for a future return or missing date', () => {
    expect(isOverdue('2026-06-02T17:00:00Z', NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});
