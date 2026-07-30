// __tests__/dnd/bestiary-art.test.ts — what picture a creature may have (B2-3).
//
// The judgement being pinned here is a LICENSING one, and it is the kind that fails quietly and expensively:
// `/dnd` is publicly reachable by direct link, so a wrongly-accepted image is published, not personal use.
// So the tests are mostly about what must be REFUSED, and about the default when a licence is simply not
// stated — unknown is not permissive.
import { describe, it, expect } from 'vitest';
import {
  ANIMAL_SPECIES, acceptImage, attributionFor, isAcceptableLicence, searchTermsFor, speciesQueryFor,
  type CandidateImage,
} from '@/lib/dnd/bestiary/art';

const candidate = (over: Partial<CandidateImage> = {}): CandidateImage => ({
  title: 'File:Wolf.jpg',
  url: 'https://upload.wikimedia.org/wolf.jpg',
  descriptionUrl: 'https://commons.wikimedia.org/wiki/File:Wolf.jpg',
  licenceShortName: 'cc-by-sa-4.0',
  artist: 'A Photographer',
  width: 1200,
  height: 900,
  mime: 'image/jpeg',
  ...over,
});

describe('isAcceptableLicence', () => {
  it('accepts the permissive families', () => {
    for (const l of ['cc0', 'CC0-1.0', 'cc-by-4.0', 'cc-by-sa-3.0', 'pd-old-100', 'PD-US', 'public domain', 'Attribution']) {
      expect(isAcceptableLicence(l), `${l} should be usable`).toBe(true);
    }
  });

  it('ACCEPTS THE STRINGS COMMONS ACTUALLY RETURNS, spaces and all', () => {
    // These are verbatim `LicenseShortName` values from a live query for "Wolf". Commons writes licences
    // for humans — "CC BY-SA 4.0", not "cc-by-sa-4.0" — and matching the SPDX-style form refused two of
    // these three legitimate images until a real query was run. Every entry here came off the wire.
    for (const l of ['Public domain', 'CC BY 3.0', 'CC BY-SA 4.0', 'CC0', 'CC BY-SA 3.0', 'CC BY-SA 2.5', 'CC BY 2.0']) {
      expect(isAcceptableLicence(l), `${l} is a real Commons value and must be usable`).toBe(true);
    }
  });

  it('accepts "No restrictions" — Flickr Commons, and it was being thrown away', () => {
    // Institutions (British Library, national archives) apply this to material they have determined is
    // free to use. It appeared in the refusal tally of a real run, discarding usable museum scans: the
    // allowlist had been written from what SPDX calls things, and Commons has templates SPDX never heard of.
    expect(isAcceptableLicence('No restrictions')).toBe(true);
    expect(isAcceptableLicence('No known copyright restrictions')).toBe(true);
  });

  it('and still refuses the spaced forms of the ones that are not allowed', () => {
    // Normalising must not accidentally widen the allowlist: "CC BY-NC 4.0" is the same refusal as
    // "cc-by-nc-4.0".
    for (const l of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0', 'GFDL 1.2']) {
      expect(isAcceptableLicence(l), `${l} must be refused`).toBe(false);
    }
  });

  it('REFUSES NC and ND — this is a public site, and ND forbids the thumbnails every listing makes', () => {
    for (const l of ['cc-by-nc-4.0', 'cc-by-nd-4.0', 'cc-by-nc-sa-3.0', 'noncommercial']) {
      expect(isAcceptableLicence(l), `${l} must be refused`).toBe(false);
    }
  });

  it('refuses fair-use and non-free, which is what published monster art is', () => {
    expect(isAcceptableLicence('fair use')).toBe(false);
    expect(isAcceptableLicence('non-free')).toBe(false);
  });

  it('TREATS UNSTATED AS UNUSABLE, not as permissive', () => {
    // The whole point. The SRD's own monster PNGs have no stated licence — the project says its CODE is
    // MIT and the underlying MATERIAL is OGL, neither of which covers a picture. Unknown is not yes.
    expect(isAcceptableLicence(null)).toBe(false);
    expect(isAcceptableLicence(undefined)).toBe(false);
    expect(isAcceptableLicence('')).toBe(false);
    expect(isAcceptableLicence('   ')).toBe(false);
  });

  it('is an allowlist — an unrecognised licence is refused rather than assumed', () => {
    // A blocklist says yes to everything nobody thought of, and for licensing the cost of a false negative
    // is one creature falling back to a generated sigil.
    expect(isAcceptableLicence('some-bespoke-museum-terms')).toBe(false);
  });
});

describe('acceptImage', () => {
  it('accepts a well-licensed, large-enough image', () => {
    const r = acceptImage(candidate());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.image.licence).toBe('CC-BY-SA-4.0');
      expect(r.image.attribution).toContain('A Photographer');
      expect(r.image.sourceUrl).toContain('commons.wikimedia.org');
    }
  });

  it('refuses a thumbnail-sized file, which would look worse than the generated sigil', () => {
    const r = acceptImage(candidate({ width: 90, height: 90 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/too small/);
  });

  it('refuses formats a browser will not render inline', () => {
    const r = acceptImage(candidate({ mime: 'image/tiff' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/format/);
  });

  it('gives a REASON, so a run can report coverage honestly instead of a silent count (G6)', () => {
    const r = acceptImage(candidate({ licenceShortName: 'cc-by-nc-4.0' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain('cc-by-nc-4.0');
  });
});

describe('attributionFor', () => {
  it('names the author when there is one', () => {
    expect(attributionFor(candidate())).toBe(
      'A Photographer — CC-BY-SA-4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Wolf.jpg)',
    );
  });

  it('omits the author rather than inventing "Unknown"', () => {
    // Public-domain engravings usually have no recorded artist. "Unknown" reads as though nobody looked.
    const a = attributionFor(candidate({ artist: null, licenceShortName: 'pd-old-100' }));
    expect(a).toBe('PD-OLD-100, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Wolf.jpg)');
    expect(a).not.toMatch(/unknown/i);
  });

  it('strips the HTML Commons wraps an artist name in', () => {
    const a = attributionFor(candidate({ artist: '<a href="/wiki/User:X" title="User:X">Jane Roe</a>' }));
    expect(a).toContain('Jane Roe');
    expect(a).not.toContain('<a');
  });

  it('always cites the Commons page, which is where the claim is verified', () => {
    expect(attributionFor(candidate())).toContain('https://commons.wikimedia.org/wiki/File:Wolf.jpg');
  });
});

describe('searchTermsFor', () => {
  it('strips size and age qualifiers, which are not what a picture shows', () => {
    const t = searchTermsFor('Adult Red Dragon', 'dragon');
    expect(t[0]).toBe('Adult Red Dragon');
    expect(t).toContain('Red Dragon');
  });

  it('falls back to the head noun for a creature with no species mapping', () => {
    // "Giant Poisonous Snake" used to be the example here and is now in ANIMAL_SPECIES (→ "Naja"), which
    // is strictly better. A fantasy compound still needs the head-noun fallback.
    expect(searchTermsFor('Giant Shadow Wyrm', 'dragon')).toContain('Wyrm');
  });

  it('ends with the creature TYPE, the widest net', () => {
    // Without it a whole category can come back empty; with it, a "monstrosity" at least gets something.
    const t = searchTermsFor('Chuul', 'aberration');
    expect(t[t.length - 1]).toBe('aberration');
  });

  it('never repeats a term, and never emits a two-letter fragment', () => {
    const t = searchTermsFor('Ox', 'beast');
    expect(new Set(t).size).toBe(t.length);
    expect(t.every((x) => x.length > 2)).toBe(true);
  });

  it('drops parenthetical qualifiers', () => {
    expect(searchTermsFor('Dragon (Chromatic)', 'dragon')[0]).toBe('Dragon');
  });

  it('handles a name that is entirely qualifiers without producing junk', () => {
    // "Swarm of Insects" strips to "Insects"; a name that strips to nothing must not yield "" as a query.
    const t = searchTermsFor('Swarm of Insects', 'beast');
    expect(t).toContain('Insects');
    expect(t.every((x) => x.trim().length > 2)).toBe(true);
  });
});

describe('ANIMAL_SPECIES — the subset that is safe to automate', () => {
  it('queries a real animal by its SPECIES, not its D&D name', () => {
    expect(searchTermsFor('Wolf', 'beast')).toEqual(['Canis lupus']);
    expect(searchTermsFor('Brown Bear', 'beast')).toEqual(['Ursus arctos']);
  });

  it('maps "Giant Rat" to the species — the phrase itself returns an inflatable', () => {
    // A live check returned "Giant Rat in front of Tivoli Village": a giant inflatable protest rat
    // photographed through a car windscreen, correctly licensed and completely wrong. "Rattus norvegicus"
    // cannot match a novelty balloon, which is the entire argument for this table.
    expect(searchTermsFor('Giant Rat', 'beast')).toEqual(['Rattus norvegicus']);
  });

  it('SHORT-CIRCUITS — a real animal never falls back to its common name', () => {
    // Falling through after the species missed would reintroduce exactly the failure the table prevents.
    const terms = searchTermsFor('Giant Rat', 'beast');
    expect(terms).toHaveLength(1);
    expect(terms.join(' ')).not.toMatch(/giant rat/i);
  });

  it('leaves fantasy creatures to the generic path, where a human still has to look', () => {
    expect(speciesQueryFor('Lich')).toBeNull();
    expect(speciesQueryFor('Ancient Silver Dragon')).toBeNull();
    expect(searchTermsFor('Lich', 'undead').length).toBeGreaterThan(1);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(speciesQueryFor('  wolf ')).toBe('Canis lupus');
  });

  it('every entry is a plausible taxon rather than a common name', () => {
    // A common name slipping into this table would silently reintroduce the ambiguity it exists to remove.
    for (const [creature, species] of Object.entries(ANIMAL_SPECIES)) {
      expect(species.length, `${creature} has an empty species`).toBeGreaterThan(3);
      expect(species[0], `${species} should be a capitalised taxon`).toBe(species[0].toUpperCase());
    }
  });
});
