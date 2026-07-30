// __tests__/dnd/ig-curation.test.ts — the spread that makes IG's bestiary usable (B4-2).
//
// The thing worth testing is not "it returns 200 rows" — it is that the 200 are SPREAD. A curation that
// silently degraded into "the first 200 by name" would still pass a count assertion and would give IG a
// catalogue with no bosses in it.
import { describe, it, expect } from 'vitest';
import { crBand, curateForIg, gridFor, CR_BANDS, type CurationRow } from '@/lib/dnd/bestiary/ig-curation';

const row = (name: string, type: string, crSort: number): CurationRow => ({
  slug: `srd51:${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  type,
  cr: String(crSort),
  crSort,
});

/** A source shaped like the real SRD: heavily lopsided toward low-CR beasts. */
function lopsided(): CurationRow[] {
  const rows: CurationRow[] = [];
  for (let i = 0; i < 80; i += 1) rows.push(row(`Beast ${String(i).padStart(2, '0')}`, 'beast', 0.25));
  for (let i = 0; i < 3; i += 1) rows.push(row(`Dragon ${i}`, 'dragon', 20 + i));
  for (let i = 0; i < 6; i += 1) rows.push(row(`Fiend ${i}`, 'fiend', 5 + i));   // CR 5–10, one cell
  for (let i = 0; i < 5; i += 1) rows.push(row(`Undead ${i}`, 'undead', 11 + i)); // CR 11–15, one cell
  for (let i = 0; i < 2; i += 1) rows.push(row(`Ooze ${i}`, 'ooze', 2 + i));
  return rows;
}

describe('crBand', () => {
  it('places each CR in the tier a DM would call it', () => {
    expect(crBand(0)).toBe('trivial');
    expect(crBand(0.125)).toBe('low');
    expect(crBand(0.5)).toBe('low');
    expect(crBand(1)).toBe('early');
    expect(crBand(4)).toBe('early');
    expect(crBand(10)).toBe('mid');
    expect(crBand(16)).toBe('high');
    expect(crBand(30)).toBe('apex');
  });

  it('leaves an unrated creature unplaced rather than defaulting it into a band', () => {
    // A row dropped into "trivial" because it had no CR would be a CR-0 creature that is not one, and the
    // spread report would then claim coverage it does not have.
    expect(crBand(null)).toBeNull();
    expect(crBand(NaN)).toBeNull();
  });

  it('has no gap between bands', () => {
    // Every tenth of a CR from 0 to 30 must land somewhere, or creatures vanish from the grid silently.
    for (let cr = 0; cr <= 30; cr += 0.125) expect(crBand(cr), `CR ${cr}`).not.toBeNull();
  });
});

describe('gridFor', () => {
  it('normalises the source type, so "swarm of Tiny beasts" is a swarm', () => {
    const g = gridFor([row('Rat Swarm', 'swarm of Tiny beasts', 0.25)]);
    expect(g[0].type).toBe('swarm');
  });

  it('drops rows it cannot place instead of bucketing them', () => {
    const g = gridFor([{ slug: 'x', name: 'X', type: null, cr: null, crSort: null }]);
    expect(g).toHaveLength(0);
  });

  it('orders cells and rows by creature properties, not input order', () => {
    const a = gridFor([row('Zed', 'fiend', 1), row('Abe', 'fiend', 1)]);
    const b = gridFor([row('Abe', 'fiend', 1), row('Zed', 'fiend', 1)]);
    expect(a[0].rows.map((r) => r.name)).toEqual(['Abe', 'Zed']);
    expect(b).toEqual(a);
  });
});

describe('curateForIg', () => {
  it('covers every type before taking a second of any one', () => {
    const { picked } = curateForIg(lopsided(), 5);
    expect(new Set(picked.map((p) => p.type)).size).toBe(5);
  });

  it('rescues the high end from a source that is mostly low-CR filler', () => {
    // The point of the whole module. 80 of these 89 rows are CR 1/4 beasts; a naive "first 20" would be
    // twenty beasts and IG would have no boss monsters at all.
    const { picked } = curateForIg(lopsided(), 20);
    const beasts = picked.filter((p) => p.type === 'beast').length;
    expect(beasts).toBeLessThan(picked.length / 2);
    expect(picked.some((p) => (p.crSort ?? 0) >= 17)).toBe(true);
    expect(picked.some((p) => (p.crSort ?? 0) >= 5 && (p.crSort ?? 0) <= 10)).toBe(true);
  });

  it('is reproducible, because the import re-runs and a different 200 would double the catalogue', () => {
    const src = lopsided();
    const first = curateForIg(src, 25).picked.map((p) => p.slug);
    const shuffled = [...src].reverse();
    expect(curateForIg(shuffled, 25).picked.map((p) => p.slug)).toEqual(first);
  });

  it('never picks the same creature twice', () => {
    const { picked } = curateForIg(lopsided(), 96);
    expect(new Set(picked.map((p) => p.slug)).size).toBe(picked.length);
  });

  it('stops at the source, not at the limit — it will not pad', () => {
    const { picked } = curateForIg(lopsided(), 500);
    expect(picked).toHaveLength(96);
  });

  it('reports the (type × band) cells the source cannot fill', () => {
    // "Every type, every difficulty" is a CLAIM. The empty list is how it becomes a measurement — the SRD
    // genuinely has no CR 17+ ooze, and the report should say so rather than let the gap pass unnoticed.
    const { emptyCells, filledCells } = curateForIg(lopsided(), 100);
    expect(filledCells).toBe(5);
    expect(emptyCells).toContainEqual({ type: 'ooze', band: 'apex' });
    expect(emptyCells).not.toContainEqual({ type: 'dragon', band: 'apex' });
    expect(emptyCells).toHaveLength(5 * CR_BANDS.length - 5);
  });

  it('takes the lowest-CR member of a cell first, so a partial run is the approachable half', () => {
    const src = [row('Big', 'fiend', 10), row('Small', 'fiend', 5)];
    expect(curateForIg(src, 1).picked[0].name).toBe('Small');
  });
});
