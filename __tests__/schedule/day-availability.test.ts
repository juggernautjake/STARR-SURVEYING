// "Who and what is free on Thursday" — one page instead of three (audit §2.4).
//
// The module under test deliberately decides nothing about availability itself: the personnel and
// equipment engines own that, and they are what the reserve button enforces. What it DOES own is the
// date→window conversion (where a timezone bug lives) and the reduction of three assessment shapes
// to one row type. Both are tested here; neither engine is re-tested.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TIMEZONE,
  dayWindow,
  summariseDay,
  vehicleRow,
  type VehicleDayRow,
} from '@/lib/scheduling/day-availability';
import type { PersonAssessment } from '@/lib/personnel/availability';
import type { UnitAssessment } from '@/lib/equipment/availability';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('a date is turned into the window the engines take', () => {
  it('starts the day at midnight where the firm is, not at UTC midnight', () => {
    // Central Daylight Time in August: UTC−5. Midnight local is 05:00Z.
    const w = dayWindow('2026-08-06', 'America/Chicago');
    expect(w.from).toBe('2026-08-06T05:00:00.000Z');
    expect(w.to).toBe('2026-08-07T05:00:00.000Z');
  });

  it('follows the zone across the DST boundary without anybody remembering it', () => {
    // Standard time in January: UTC−6. Same call, an hour different, because the zone says so.
    expect(dayWindow('2026-01-15', 'America/Chicago').from).toBe('2026-01-15T06:00:00.000Z');
  });

  it('is exactly 24 hours long on an ordinary day', () => {
    const w = dayWindow('2026-08-06', 'America/Chicago');
    expect(Date.parse(w.to) - Date.parse(w.from)).toBe(24 * 3600_000);
  });

  it('does not take the page down when the firm’s timezone setting is a typo', () => {
    // Wrong by hours is bad. A 500 on the dispatcher's morning page is worse.
    expect(() => dayWindow('2026-08-06', 'Not/AZone')).not.toThrow();
  });

  it('defaults to where the firm is, not to where the server is', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/Chicago');
    expect(dayWindow('2026-08-06').from).toBe(dayWindow('2026-08-06', DEFAULT_TIMEZONE).from);
  });
});

describe('vehicles, whose rules live here because they have no engine', () => {
  const base: VehicleDayRow = {
    id: 'v1',
    name: 'Truck 3',
    license_plate: 'ABC-1234',
    active: true,
    registration_expires_on: '2027-01-01',
    inspection_expires_on: '2027-01-01',
    insurance_expires_on: '2027-01-01',
  };

  it('rules out a truck whose registration lapsed before the day', () => {
    const r = vehicleRow({ ...base, registration_expires_on: '2026-07-01' }, '2026-08-06');
    expect(r.free).toBe(false);
    expect(r.blockers.join(' ')).toContain('Registration expired');
  });

  it('warns rather than grounds when a date is merely close', () => {
    const r = vehicleRow({ ...base, inspection_expires_on: '2026-08-14' }, '2026-08-06');
    expect(r.free).toBe(true);
    expect(r.warnings.join(' ')).toContain('Inspection expires');
  });

  it('warns rather than grounds when a date was never entered', () => {
    // Grounding the fleet over a blank field is how a dispatcher learns to ignore the column.
    const r = vehicleRow({ ...base, insurance_expires_on: null }, '2026-08-06');
    expect(r.free).toBe(true);
    expect(r.warnings.join(' ')).toContain('not recorded');
  });

  it('rules out a truck that is not in the active fleet', () => {
    expect(vehicleRow({ ...base, active: false }, '2026-08-06').free).toBe(false);
  });

  it('never claims a free truck is unclaimed — nothing records that', () => {
    const client = read('app/admin/availability/AvailabilityClient.tsx');
    expect(client).toContain('not one nobody else has claimed');
  });
});

describe('the three shapes become one', () => {
  const person = (over: Partial<PersonAssessment> = {}): PersonAssessment => ({
    user_email: 'hank@example.com',
    display_name: 'Hank',
    hard_blocks: [],
    soft_warns: [],
    assignable: true,
    ...over,
  });
  const unit = (over: Partial<UnitAssessment> = {}): UnitAssessment => ({
    equipment_inventory_id: 'e1',
    name: 'GPS Rover 2',
    category: 'gnss',
    item_kind: 'durable',
    current_status: 'available',
    next_available_at: null,
    home_location: null,
    vehicle_id: null,
    hard_blocks: [],
    soft_warns: [],
    assignable: true,
    ...over,
  });

  it('quotes the engine’s own refusal instead of writing a second vocabulary', () => {
    const blocked = person({
      assignable: false,
      hard_blocks: [{
        code: 'capacity_overlap', severity: 'block', conflicting_job_id: 'j1',
        conflicting_assignment_id: 'a1', assigned_from: '', assigned_to: '', state: 'confirmed',
        message: 'Assigned to job 422 for this window.',
      }],
    });
    const { crew } = summariseDay([blocked], [], [], '2026-08-06');
    expect(crew[0]!.blockers).toEqual(['Assigned to job 422 for this window.']);
  });

  it('puts what you CAN send at the top', () => {
    const { crew } = summariseDay(
      [person({ user_email: 'z@x.com', display_name: 'Zoe', assignable: false, hard_blocks: [] }), person()],
      [], [], '2026-08-06',
    );
    expect(crew.map((r) => r.free)).toEqual([true, false]);
  });

  it('counts each column separately, so one empty subsystem is visible', () => {
    const s = summariseDay([person()], [unit({ assignable: false })], [], '2026-08-06');
    expect(s.counts).toMatchObject({ crewFree: 1, crewTotal: 1, equipmentFree: 0, equipmentTotal: 1, vehiclesTotal: 0 });
  });

  it('keeps soft warnings visible rather than dropping them', () => {
    const s = summariseDay([], [unit({ soft_warns: [{ code: 'calibration_due', severity: 'warn', message: 'Calibration due in 9 days.' } as never] })], [], '2026-08-06');
    expect(s.equipment[0]!.warnings).toEqual(['Calibration due in 9 days.']);
    expect(s.equipment[0]!.free).toBe(true);
  });
});

describe('the page does not become a fourth calendar', () => {
  const route = read('app/api/admin/availability/route.ts');

  it('asks the existing engines instead of re-deriving availability', () => {
    expect(route).toContain('assessForSkillCohort');
    expect(route).toContain('assessCategory');
    // No second definition of "busy" — no direct read of the assignment or reservation tables here.
    expect(route).not.toContain('job_team');
    expect(route).not.toContain('equipment_reservations');
  });

  it('degrades a column at a time, and says which', () => {
    expect(route).toContain('Promise.allSettled');
    expect(route).toContain('degraded');
  });

  it('takes the firm’s timezone from settings, not from the server', () => {
    expect(route).toContain("eq('key', 'general')");
    expect(route).not.toMatch(/new Date\(\)\.getTimezoneOffset/);
  });

  it('keeps the calendars it did not replace one click away', () => {
    const client = read('app/admin/availability/AvailabilityClient.tsx');
    for (const href of ['/admin/calendar', '/admin/personnel/crew-calendar', '/admin/equipment/timeline', '/admin/time-off']) {
      expect(client, `${href} is not linked`).toContain(href);
    }
  });
});
