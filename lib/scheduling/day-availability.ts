// lib/scheduling/day-availability.ts — "who and what is free on Thursday", as one answer (§2.4).
//
// Audit §2.4 counted ten time/schedule surfaces, four of them calendars, and named the cost:
// *"A dispatcher deciding 'who and what is available Thursday' has to open three pages."*
//
// This module does the two things that cannot be borrowed from the existing engines:
//
//   1. Turn a DATE into the WINDOW those engines take. They speak in instants; a dispatcher speaks
//      in days, and the conversion is where a timezone bug lives.
//   2. Reduce three different assessment shapes to one row type, so the page renders one table
//      three times instead of three tables that drift apart.
//
// It deliberately decides NOTHING about availability itself. `lib/personnel/availability.ts` and
// `lib/equipment/availability.ts` own that, and they are what the reserve button enforces. A second
// opinion here would eventually tell a dispatcher somebody is free and then refuse the booking.

import type { PersonAssessment } from '@/lib/personnel/availability';
import type { UnitAssessment } from '@/lib/equipment/availability';

/** Used when the firm has not set one. Central time is where the firm is, and the alternative
 *  default — the server's own zone — is a property of a data centre, not of a business. */
export const DEFAULT_TIMEZONE = 'America/Chicago';

/** The working day, as an instant range.
 *
 *  Midnight-to-midnight in the FIRM's zone, not UTC and not the server's. UTC midnight would put the
 *  first six hours of a Texas Thursday inside Wednesday, which is exactly the shift when a crew is
 *  loading trucks and a dispatcher is looking at this page.
 *
 *  The offset is derived from the zone at that date rather than hard-coded, so the two weeks a year
 *  when Texas is UTC−5 instead of UTC−6 are right without anybody remembering them. */
export function dayWindow(date: string, timezone: string = DEFAULT_TIMEZONE): { from: string; to: string } {
  const from = zonedStartOfDay(date, timezone);
  const to = new Date(from.getTime() + 24 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Midnight on `date` in `timezone`, as a real instant.
 *
 *  Done by measuring the zone's offset at roughly that moment and subtracting it, rather than by
 *  string arithmetic on a formatted date — the string form silently produces the wrong instant on
 *  the two DST days a year, and those are ordinary working days. */
function zonedStartOfDay(date: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Provisional: treat the wall time as UTC, then correct by the zone's offset at that instant.
  const guess = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0);
  const offsetMs = zoneOffsetMs(new Date(guess), timezone);
  // One correction is enough except within an hour of a DST boundary, where the corrected instant
  // can land on the other side of it — so the offset is re-measured there and applied again.
  const first = new Date(guess - offsetMs);
  const secondOffset = zoneOffsetMs(first, timezone);
  return secondOffset === offsetMs ? first : new Date(guess - secondOffset);
}

/** How far `timezone` is ahead of UTC at `instant`, in milliseconds. Negative in the Americas. */
function zoneOffsetMs(instant: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      // Intl renders midnight as "24" in some ICU versions with hour12:false.
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - instant.getTime();
  } catch {
    // An unknown zone string (a typo in settings) must not take the dispatcher's page down. UTC is
    // wrong by hours; a 500 is wrong by the whole page.
    return 0;
  }
}

export interface VehicleDayRow {
  id: string;
  name: string;
  license_plate: string | null;
  active: boolean | null;
  registration_expires_on: string | null;
  inspection_expires_on: string | null;
  insurance_expires_on: string | null;
}

/** One row shape for all three columns. `blockers` is the sentence the reader needs; `free` is the
 *  only thing they filter on. */
export interface DayResourceRow {
  kind: 'crew' | 'equipment' | 'vehicle';
  id: string;
  label: string;
  sublabel: string | null;
  free: boolean;
  /** Why not, in words the engines already produced. Empty when free. */
  blockers: string[];
  /** Attached but not blocking — a soft warning stays visible rather than being dropped. */
  warnings: string[];
  /** Where to go to act on it. */
  href: string | null;
}

export interface DaySummary {
  crew: DayResourceRow[];
  equipment: DayResourceRow[];
  vehicles: DayResourceRow[];
  counts: { crewFree: number; crewTotal: number; equipmentFree: number; equipmentTotal: number; vehiclesFree: number; vehiclesTotal: number };
}

function crewRow(p: PersonAssessment): DayResourceRow {
  return {
    kind: 'crew',
    id: p.user_email,
    label: p.display_name || p.user_email,
    sublabel: p.display_name ? p.user_email : null,
    free: p.assignable,
    blockers: p.hard_blocks.map((b) => b.message),
    warnings: p.soft_warns.map((w) => w.message),
    href: `/admin/people/${encodeURIComponent(p.user_email)}`,
  };
}

function equipmentRow(u: UnitAssessment): DayResourceRow {
  return {
    kind: 'equipment',
    id: u.equipment_inventory_id,
    label: u.name || 'Unnamed item',
    sublabel: u.category,
    free: u.assignable,
    blockers: u.hard_blocks.map((b) => b.message),
    warnings: u.soft_warns.map((w) => w.message),
    href: `/admin/equipment/${u.equipment_inventory_id}`,
  };
}

/** Vehicles have no availability engine, so the rules are stated here — and stated narrowly.
 *
 *  Only two things make a truck unavailable for a whole day without a booking system: it is retired
 *  from the fleet, or a legally-required date has lapsed. Both are facts already in the row. What is
 *  NOT inferred is "somebody has it" — nothing records that per day, and guessing would produce a
 *  confident wrong answer, which on this page is worse than an admitted gap. */
export function vehicleRow(v: VehicleDayRow, date: string): DayResourceRow {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (v.active === false) blockers.push('Not in the active fleet.');

  const lapsed = (label: string, on: string | null) => {
    if (!on) {
      // Unknown is a warning, not a block. A missing inspection date usually means nobody entered
      // it, and grounding the fleet over a blank field is how a dispatcher learns to ignore this
      // column entirely.
      warnings.push(`${label} date not recorded.`);
      return;
    }
    if (on < date) blockers.push(`${label} expired ${on}.`);
    else if (daysBetween(date, on) <= 14) warnings.push(`${label} expires ${on}.`);
  };
  lapsed('Registration', v.registration_expires_on);
  lapsed('Inspection', v.inspection_expires_on);
  lapsed('Insurance', v.insurance_expires_on);

  return {
    kind: 'vehicle',
    id: v.id,
    label: v.name,
    sublabel: v.license_plate,
    free: blockers.length === 0,
    blockers,
    warnings,
    href: '/admin/vehicles',
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function summariseDay(
  crew: PersonAssessment[],
  equipment: UnitAssessment[],
  vehicles: VehicleDayRow[],
  date?: string,
): DaySummary {
  const day = date ?? new Date().toISOString().slice(0, 10);
  const crewRows = crew.map(crewRow);
  const equipmentRows = equipment.map(equipmentRow);
  const vehicleRows = vehicles.map((v) => vehicleRow(v, day));
  return {
    crew: sortFreeFirst(crewRows),
    equipment: sortFreeFirst(equipmentRows),
    vehicles: sortFreeFirst(vehicleRows),
    counts: {
      crewFree: crewRows.filter((r) => r.free).length,
      crewTotal: crewRows.length,
      equipmentFree: equipmentRows.filter((r) => r.free).length,
      equipmentTotal: equipmentRows.length,
      vehiclesFree: vehicleRows.filter((r) => r.free).length,
      vehiclesTotal: vehicleRows.length,
    },
  };
}

/** Free first, then alphabetical. The dispatcher is assembling a crew, so the answer to "who CAN I
 *  send" belongs at the top; the blocked rows stay below because "Jacob has the cert but is on Job
 *  #422" is the second thing they need and scrolling for it is fine. */
function sortFreeFirst(rows: DayResourceRow[]): DayResourceRow[] {
  return [...rows].sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
