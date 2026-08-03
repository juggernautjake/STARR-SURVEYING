// lib/research/packet-offline.ts — what a cached packet is allowed to claim (plan R26).
//
// R26 shipped the crew view and noted why it reads the approved *snapshot* rather than the live
// tables: *"being a single object is what will make it cacheable for a truck with no signal."* The
// caching itself was never built, so today a crew out of signal sees the failure panel — which is
// honest, and useless.
//
// ── THE FAILURE A NAIVE CACHE WOULD CREATE ──────────────────────────────────────────────────────
//
// R26's own rule is that **superseded packets are never offered**: a packet a crew previously worked
// from is evidence of what they were given, not something to work from now. A cache breaks that rule
// by construction. The moment a packet is stored on a device, that device can show a version the
// office has since replaced — and the crew has no way to tell, because a cached packet looks exactly
// like a live one.
//
// So the cache is not "the packet". It is **the packet plus when we last confirmed it**, and this
// module is the rule about what that combination may say. Three cases, and they are different
// enough that collapsing any two of them puts someone on the wrong side of a boundary:
//
//   live        we just read it from the server. Say nothing extra.
//   offline     no signal, and we hold a copy. Show it, and say plainly that it could not be
//               re-checked and may have been superseded since <date>.
//   stale       we hold a copy old enough that it should not be worked from without a re-check.
//
// The third exists because "cached 20 minutes ago" and "cached last month" are not the same claim.
// A packet gets superseded when somebody finds something — a new plat, a conflict, a corrected
// bearing — and that is exactly the update a crew must not miss.
//
// ── WHY THERE IS NO EXPIRY THAT DELETES ─────────────────────────────────────────────────────────
//
// The obvious design drops the copy once it is too old. That is worse: a crew in a canyon with a
// three-week-old packet is better served by a three-week-old packet **labelled as such** than by an
// empty panel, because the empty panel is indistinguishable from "no research exists" — the exact
// confusion R26's four states were built to prevent. Nothing here deletes; it only downgrades what
// the copy is allowed to claim.

/** After this long without a successful re-read, a cached packet is presented as stale.
 *
 *  Twelve hours, chosen so a packet cached the evening before a job is still 'offline' rather than
 *  'stale' when the crew opens it in the morning — that is the ordinary case this exists for, and
 *  flagging it would train people to ignore the flag. A packet from two days ago is a different
 *  thing and says so. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/** Cached copies older than this are not offered at all. See the header: this is NOT an expiry that
 *  deletes, it is the point past which the copy stops being evidence about the job and starts being
 *  a liability — a month-old packet almost certainly predates something. */
export const REFUSE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export type PacketFreshness = 'live' | 'offline' | 'stale' | 'refused' | 'none';

export interface CachedPacket<T> {
  payload: T;
  /** When the server last successfully answered, in epoch ms. */
  fetchedAt: number;
  /** Which packet this is, so a cache cannot silently answer for a different one. */
  jobId: string;
}

export interface OfflineVerdict<T> {
  freshness: PacketFreshness;
  payload: T | null;
  /** Age of the cached copy in ms, when there is one. */
  ageMs: number | null;
  /** Shown to the crew. Empty for 'live' — a live packet needs no explanation. */
  statement: string;
  /** True when the crew should re-check before acting on it. */
  needsRecheck: boolean;
}

/** How old, in words a person reads without arithmetic. */
export function describeAge(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Decide what to show, given a live result (or its absence) and whatever is cached.
 *
 *  `live` is the server's answer when there was one. `cached` is what the device holds. The
 *  `jobId` guard is not paranoia: a cache keyed loosely, or a component remounted on a different
 *  job before its fetch resolves, would otherwise show one job's research on another job's screen —
 *  and a packet is exactly the kind of document nobody re-reads the header of. */
export function resolveOffline<T>(
  jobId: string,
  live: T | null,
  cached: CachedPacket<T> | null,
  now: number,
): OfflineVerdict<T> {
  if (live !== null) {
    return { freshness: 'live', payload: live, ageMs: null, statement: '', needsRecheck: false };
  }

  if (!cached || cached.jobId !== jobId) {
    return {
      freshness: 'none', payload: null, ageMs: null, needsRecheck: true,
      statement:
        'The research for this job could not be read and no copy is stored on this device. This is ' +
        'NOT the same as there being none — check again before assuming nothing was done.',
    };
  }

  const ageMs = Math.max(0, now - cached.fetchedAt);
  const when = describeAge(ageMs);

  if (ageMs > REFUSE_AFTER_MS) {
    return {
      freshness: 'refused', payload: null, ageMs, needsRecheck: true,
      statement:
        `A copy of this job's research is stored on this device but it was last confirmed ${when}, ` +
        `which is too long ago to work from. A packet that old almost certainly predates something. ` +
        `It is not being shown; get signal and re-read it.`,
    };
  }

  if (ageMs > STALE_AFTER_MS) {
    return {
      freshness: 'stale', payload: cached.payload, ageMs, needsRecheck: true,
      statement:
        `OFFLINE COPY, last confirmed ${when}. Do not work from this without re-checking: an approved ` +
        `packet gets superseded when somebody finds a new plat, a conflict or a corrected bearing, ` +
        `and this copy cannot know whether that has happened.`,
    };
  }

  return {
    freshness: 'offline', payload: cached.payload, ageMs, needsRecheck: false,
    statement:
      `OFFLINE COPY, last confirmed ${when}. It could not be re-checked just now, so it may have been ` +
      `superseded since.`,
  };
}

/** Storage key for one job's packet.
 *
 *  Versioned, because the payload shape is this module's contract with the component. A shape change
 *  that reused the key would hand old objects to new code — and the failure would surface as a
 *  half-rendered packet in a truck rather than as an error anywhere a developer looks. */
export const CACHE_VERSION = 1;
export const cacheKey = (jobId: string) => `starr.research-packet.v${CACHE_VERSION}.${jobId}`;

/** Read a cached packet, tolerating every way storage can disappoint.
 *
 *  Private browsing, a full quota, a user who cleared site data, or JSON left by an older version —
 *  all of them mean "no cache", never a crash. A field crew's job page must render. */
export function readCache<T>(jobId: string, storage: Storage | null | undefined): CachedPacket<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPacket<T>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || parsed.jobId !== jobId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Store a packet, and say whether it actually stored.
 *
 *  Returning a boolean rather than swallowing the failure matters: a device with a full quota keeps
 *  serving the crew an older copy while the UI implies the current one is saved for the drive out.
 *  The caller can then say so instead of promising offline access it does not have. */
export function writeCache<T>(
  jobId: string, payload: T, now: number, storage: Storage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(cacheKey(jobId), JSON.stringify({ payload, fetchedAt: now, jobId }));
    return true;
  } catch {
    return false;
  }
}
