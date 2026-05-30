import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, vehicleColor, toVehicle, filterVehicles } from '@/lib/hub/widgets/vehicles-status';

describe('vehicles-status', () => {
  it('registers in equipment category', () => {
    expect(getWidget('vehicles-status')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
  it('color per (active-derived) status', () => {
    expect(vehicleColor('available')).toBe('var(--theme-success)');
    expect(vehicleColor('offline')).toBe('var(--theme-fg-muted)');
  });
});

describe('toVehicle (R1: real vehicles shape — active-derived status)', () => {
  it('maps name / license_plate + derives available/offline from active', () => {
    expect(toVehicle({ id: 'v1', name: 'Truck 3', license_plate: 'ABC-123', active: true }))
      .toEqual({ id: 'v1', name: 'Truck 3', license_plate: 'ABC-123', status: 'available' });
    expect(toVehicle({ id: 'v2', name: 'Old Van', active: false }).status).toBe('offline');
  });
  it('defaults active (undefined) to available + falls back the name', () => {
    expect(toVehicle({ id: 'v3' })).toEqual({ id: 'v3', name: 'Vehicle', license_plate: null, status: 'available' });
  });
});

describe('filterVehicles', () => {
  const rows = [
    toVehicle({ id: 'a', name: 'A', active: true }),
    toVehicle({ id: 'b', name: 'B', active: false }),
  ];
  it('all / active / inactive', () => {
    expect(filterVehicles(rows, 'all').map((v) => v.id)).toEqual(['a', 'b']);
    expect(filterVehicles(rows, 'active').map((v) => v.id)).toEqual(['a']);
    expect(filterVehicles(rows, 'inactive').map((v) => v.id)).toEqual(['b']);
  });
});
