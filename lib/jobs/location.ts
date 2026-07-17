// lib/jobs/location.ts — turn a job's property location + customer phone into tap-to-act links.
//
// In the field a worker wants to (a) tap the address and have their phone's navigation app route them
// there, and (b) tap the customer's number to dial. Both are just URL builders over the job's stored
// columns (address/city/state/zip, latitude/longitude, client_phone), so they're pure + unit-tested and
// the web job page + the mobile app + the Work Mode hub all build the same links from one place.

export interface JobLocation {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

const clean = (s: unknown): string => (s == null ? '' : String(s).trim());
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A one-line formatted address from the parts, e.g. "123 Main St, Austin, TX 78701". Empty when none. */
export function formatJobAddress(job: JobLocation): string {
  const street = clean(job.address);
  const cityState = [clean(job.city), [clean(job.state), clean(job.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityState].filter(Boolean).join(', ');
}

/** True when the job has anything to navigate to (coordinates or an address). */
export function hasJobLocation(job: JobLocation): boolean {
  return (num(job.latitude) != null && num(job.longitude) != null) || formatJobAddress(job).length > 0;
}

/**
 * A navigation URL the device routes to its maps/navigation app. Prefers exact coordinates when present
 * (most accurate for a rural boundary corner), else the formatted address. Returns '' when there's
 * nothing to route to. Uses the Google Maps universal directions URL — iOS/Android open it in the
 * user's maps app (or offer the chooser), so it honors "the navigation app of my choice".
 */
export function jobMapsUrl(job: JobLocation): string {
  const lat = num(job.latitude);
  const lng = num(job.longitude);
  let destination: string;
  if (lat != null && lng != null) {
    destination = `${lat},${lng}`;
  } else {
    const addr = formatJobAddress(job);
    if (!addr) return '';
    destination = addr;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** A `tel:` href for dialing a phone number (keeps a leading + for international, strips other symbols).
 *  Empty when the number has no digits. */
export function telHref(phone: string | null | undefined): string {
  const raw = clean(phone);
  if (!raw) return '';
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `tel:${plus}${digits}` : '';
}
