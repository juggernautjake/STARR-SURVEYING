// __tests__/admin/equipment-assignment.test.ts
//
// E2 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — locks the direct
// check-out/check-in state machine.

import { describe, it, expect } from 'vitest';
import {
  canCheckOut, statusForCheckout, statusAfterReturn, needsMaintenanceTriage,
  checkoutEventType, checkinEventType, assignmentTargetLabel, isUuid,
} from '@/lib/equipment/assignment';

describe('canCheckOut', () => {
  it('allows available (and null/legacy) items', () => {
    expect(canCheckOut('available').ok).toBe(true);
    expect(canCheckOut(null).ok).toBe(true);
    expect(canCheckOut(undefined).ok).toBe(true);
  });
  it('blocks items that are not available with a reason', () => {
    for (const s of ['in_use', 'loaned_out', 'maintenance', 'lost', 'retired']) {
      const r = canCheckOut(s);
      expect(r.ok).toBe(false);
      expect(r.reason && r.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('statusForCheckout', () => {
  it('maps destination → inventory status', () => {
    expect(statusForCheckout('crew')).toBe('in_use');
    expect(statusForCheckout('vehicle')).toBe('in_use');
    expect(statusForCheckout('maintenance')).toBe('maintenance');
    expect(statusForCheckout('other')).toBe('loaned_out');
  });
});

describe('statusAfterReturn + triage', () => {
  it('good/fair → available; damaged → maintenance; lost → lost', () => {
    expect(statusAfterReturn('good')).toBe('available');
    expect(statusAfterReturn('fair')).toBe('available');
    expect(statusAfterReturn('damaged')).toBe('maintenance');
    expect(statusAfterReturn('lost')).toBe('lost');
  });
  it('only damaged/lost trigger maintenance triage', () => {
    expect(needsMaintenanceTriage('good')).toBe(false);
    expect(needsMaintenanceTriage('fair')).toBe(false);
    expect(needsMaintenanceTriage('damaged')).toBe(true);
    expect(needsMaintenanceTriage('lost')).toBe(true);
  });
});

describe('event types', () => {
  it('checkout event type by destination', () => {
    expect(checkoutEventType('crew')).toBe('checked_out');
    expect(checkoutEventType('vehicle')).toBe('checked_out');
    expect(checkoutEventType('maintenance')).toBe('maintenance_scheduled');
    expect(checkoutEventType('other')).toBe('loaned_out');
  });
  it('checkin event type by condition', () => {
    expect(checkinEventType('good')).toBe('checked_in');
    expect(checkinEventType('fair')).toBe('checked_in');
    expect(checkinEventType('damaged')).toBe('damaged_returned');
    expect(checkinEventType('lost')).toBe('lost_returned');
  });
});

describe('assignmentTargetLabel', () => {
  it('prefers the resolved name, falls back to label', () => {
    expect(assignmentTargetLabel({ assigned_kind: 'crew', assigned_user_name: 'Andy' })).toBe('Andy');
    expect(assignmentTargetLabel({ assigned_kind: 'vehicle', assigned_vehicle_name: 'Truck 3' })).toBe('Truck 3');
    expect(assignmentTargetLabel({ assigned_kind: 'maintenance', assigned_label: 'NIST cal' })).toBe('maintenance (NIST cal)');
    expect(assignmentTargetLabel({ assigned_kind: 'other', assigned_label: 'County loaner' })).toBe('County loaner');
    expect(assignmentTargetLabel({ assigned_kind: 'crew' })).toBe('a crew member');
  });
});

describe('isUuid', () => {
  it('validates UUID shape', () => {
    expect(isUuid('a0000000-0000-4000-a000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
