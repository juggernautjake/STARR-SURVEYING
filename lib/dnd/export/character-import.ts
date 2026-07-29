// lib/dnd/export/character-import.ts — read back what `characterToJson` wrote (P9-1, audit H-1).
//
// The export has always been the loss-less machine format — "export character sheets with literally
// everything on them", and it delivers. Nothing could read it. `/api/dnd/characters/import` is a different
// thing entirely (file upload → AI ingestion), so a user's own perfect backup could only be recovered by
// handing it to a model and hoping. A backup you cannot restore is not a backup.
//
// PARSING LIVES HERE, NOT IN THE ROUTE, so the round-trip can be tested without a database. That test —
// export → parse → deep-equal — is also the strongest guard the EXPORT has ever had on its completeness
// claim: if a field stops surviving the trip, it fails here rather than being discovered by someone
// restoring a character they had already deleted.
import { normalizeSystem } from '../systems';
import type { CharacterExport } from './character-export';

/** What a valid import produced, ready for the row insert. */
export interface ParsedCharacterImport {
  name: string;
  system: string;
  sheet_type: string;
  bio: Record<string, unknown> | null;
  data: unknown;
  /** The export's own timestamp, kept for the caller to report — NEVER written to `updated_at`, which
   *  must reflect when this row was actually written. */
  exportedUpdatedAt: string | null;
}

export type ParseResult =
  | { ok: true; value: ParsedCharacterImport }
  | { ok: false; error: string };

/** The largest export we will parse. A sheet with inlined art is well under this; a 5 MB JSON body is
 *  either a mistake or an attack, and either way the answer is the same. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate an exported character document.
 *
 * Accepts the object OR the raw JSON text, because a caller has one or the other depending on whether the
 * user pasted a file or uploaded it, and making each caller remember to `JSON.parse` first is how one of
 * them ends up not doing it.
 *
 * Returns a result rather than throwing: every failure here is a user pasting the wrong file, which
 * deserves a sentence explaining what was wrong with it, not a 500.
 */
export function parseCharacterExport(input: unknown): ParseResult {
  let doc: unknown = input;

  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_BYTES) return { ok: false, error: 'That file is too large to import.' };
    try {
      doc = JSON.parse(input);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
  }

  if (!isPlainObject(doc)) return { ok: false, error: 'An exported character must be a JSON object.' };

  const name = typeof doc.name === 'string' ? doc.name.trim() : '';
  if (!name) return { ok: false, error: 'That file has no character name — it may not be a character export.' };

  // `data` is the sheet itself and the only genuinely required payload. Its ABSENCE is a different error
  // from its being the wrong shape, because the two mean different things to whoever is holding the file:
  // one is "wrong file", the other is "damaged file".
  if (!('data' in doc)) {
    return { ok: false, error: 'That file has no character data — it may not be a character export.' };
  }
  if (!isPlainObject(doc.data)) {
    return { ok: false, error: 'The character data in that file is damaged (expected an object).' };
  }

  // The system is NORMALISED, never trusted. An export carries whatever the row had, including `null` for
  // an older character made before the field existed, and a hand-edited file could carry anything at all.
  // `normalizeSystem` is the same function every other write path uses, so an import cannot create a
  // character in a system the rest of the app does not believe in.
  const system = normalizeSystem(doc.system);

  // sheet_type decides which shell renders. An unrecognised one would render nothing, so an unknown value
  // falls back to 'default' rather than being preserved faithfully into a blank page.
  const rawSheet = typeof doc.sheet_type === 'string' ? doc.sheet_type.trim() : '';
  const sheet_type = rawSheet || 'default';

  return {
    ok: true,
    value: {
      name: name.slice(0, 200),
      system,
      sheet_type,
      bio: isPlainObject(doc.bio) ? doc.bio : null,
      data: doc.data,
      exportedUpdatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    },
  };
}

/**
 * The fields an export round-trips. Used by the round-trip test and by nothing else — its value is that it
 * is a single, explicit list a reader can check the export against.
 *
 * `artSrc`/`tokenSrc` are deliberately absent: they exist on `CharacterExport` for the HTML path only
 * (the route inlines images as data URIs for a self-contained document) and `characterToJson` does not
 * emit them. Recording that here means the omission is a decision rather than a thing someone forgot.
 */
export const ROUND_TRIP_FIELDS: (keyof CharacterExport)[] = ['name', 'system', 'sheet_type', 'bio', 'data', 'updatedAt'];
