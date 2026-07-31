// scripts/derive-tier-tables.mjs — measure what a creature at each tier actually looks like (N1-1/N1-2).
//
//   npm run derive:tiers            # print the tables
//   npm run derive:tiers -- --write # regenerate lib/dnd/statblocks/tiers.ts
//
// ── WHY MEASURED RATHER THAN COPIED FROM THE BOOK ────────────────────────────────────────────────────
//
// The obvious source is D&D's *Monster Statistics by Challenge Rating* and Pathfinder's *Building
// Creatures*. Neither is in the SRD or the ORC-licensed remaster: they are Dungeon Master's Guide and
// Monster Core content, and embedding either verbatim is the same boundary this bestiary has refused all
// along (G3 — a thing whose licence we cannot state does not get catalogued).
//
// So the tables are MEASURED from the corpus we do hold under CC-BY and OGL: 2,828 D&D creatures and 1,594
// Pathfinder ones, all with a stated AC, HP and tier. That is not a workaround — it is a better source for
// this purpose. A published guideline says what a designer was aiming at; the corpus says what creatures at
// that tier actually are, which is what a derived creature has to sit alongside.
//
// ── MONOTONIC BY CONSTRUCTION ────────────────────────────────────────────────────────────────────────
//
// Raw medians wobble: 5e's CR 24 sample has a lower median HP than CR 23's, because twelve creatures is a
// small sample and one of them is a spellcaster. A target table that dips is worse than one that is
// slightly wrong — it would tell a DM that a harder creature is frailer. So each series is made
// non-decreasing by a pool-adjacent-violators fit, which is the standard isotonic regression: it moves the
// fewest points by the least amount needed, rather than smoothing everything.
import fs from 'node:fs';
import pg from 'pg';

const WRITE = process.argv.includes('--write');
const OUT = 'lib/dnd/statblocks/tiers.ts';
/** Below this, a tier's median is one or two creatures and says nothing. Reported, never silently dropped. */
const MIN_SAMPLE = 3;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Isotonic regression (pool adjacent violators) — the least-moved non-decreasing fit of a series. */
function monotonic(values) {
  const v = values.map((x) => ({ sum: x, n: 1 }));
  const stack = [];
  for (const item of v) {
    let cur = item;
    while (stack.length && stack[stack.length - 1].sum / stack[stack.length - 1].n > cur.sum / cur.n) {
      const prev = stack.pop();
      cur = { sum: prev.sum + cur.sum, n: prev.n + cur.n };
    }
    stack.push(cur);
  }
  const out = [];
  for (const b of stack) for (let i = 0; i < b.n; i++) out.push(Math.round(b.sum / b.n));
  return out;
}

async function main() {
  const raw = (fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/) || [])[1];
  const c = new pg.Client({ connectionString: raw.trim(), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const out = {};
  for (const [key, system] of [['dnd5e', 'dnd5e-2014'], ['pf2', 'pathfinder2e']]) {
    const rows = (await c.query(
      'select cr_sort, statblock from dnd_creatures where system = $1 and cr_sort is not null',
      [system],
    )).rows;

    const by = new Map();
    for (const r of rows) {
      const t = Number(r.cr_sort);
      const sb = r.statblock || {};
      if (sb.ac == null || sb.hp == null) continue;
      if (!by.has(t)) by.set(t, { ac: [], hp: [], atk: [], fort: [], ref: [], will: [], per: [] });
      const cell = by.get(t);
      cell.ac.push(sb.ac);
      cell.hp.push(sb.hp);

      // ── N2-3: the fields a NATIVE Pathfinder block cannot do without ─────────────────────────────
      //
      // Every published PF2 creature prints Fort/Ref/Will and a Perception modifier. A derived block had
      // neither — saves are DROPPED when crossing families (a 5e block's "WIS +3" names a save Pathfinder
      // has not got, correctly refused) and Perception lived inside 5e's `senses` prose as "passive
      // Perception 13", which is 5e's vocabulary and not a PF2 line at all.
      //
      // So a derived Pathfinder creature was recognisably not a Pathfinder creature, whatever its AC said.
      // Measured here from the same corpus and by the same method as AC and HP, which keeps N1 intact:
      // the numbers still come from creatures that exist rather than from a book we may not quote.
      //
      // Parsed out of the free-text lines the import stored them in — `saves` is "Fort +8, Ref +5, Will
      // +6" and `senses` is "Perception +6; low-light-vision". Each name is matched INDIVIDUALLY rather
      // than by position, because a creature with only two of the three would otherwise shift the others
      // into the wrong column and nothing would look wrong.
      for (const [name, bucket] of [['fort', cell.fort], ['ref', cell.ref], ['will', cell.will]]) {
        const m = new RegExp(`\\b${name}[a-z]*\\s*([+-]\\d+)`, 'i').exec(sb.saves || '');
        if (m) bucket.push(Number(m[1]));
      }
      const per = /\bperception\s*([+-]\d+)/i.exec(sb.senses || '');
      if (per) cell.per.push(Number(per[1]));
      // Attack bonus, from the entries that ACTUALLY CARRY ONE.
      //
      // The missing-value guard is the whole line: `Number('')` is 0 and `Number.isFinite(0)` is true, so
      // a naive read pushes a zero for every trait, reaction and Multiattack — which is most entries — and
      // the median comes out 0 at every tier. It did, on the first run, across both systems: a table of
      // zeroes that looked like "no creature has an attack bonus" rather than like a parsing bug.
      for (const e of sb.entries || []) {
        if (e.toHit == null || e.toHit === '') continue;
        const n = Number(String(e.toHit).replace('+', ''));
        if (Number.isFinite(n)) cell.atk.push(n);
      }
    }

    const tiers = [...by.keys()].filter((t) => by.get(t).ac.length >= MIN_SAMPLE).sort((a, b) => a - b);
    const thin = [...by.keys()].filter((t) => by.get(t).ac.length < MIN_SAMPLE).sort((a, b) => a - b);
    const ac = monotonic(tiers.map((t) => median(by.get(t).ac)));
    const hp = monotonic(tiers.map((t) => median(by.get(t).hp)));
    const atk = monotonic(tiers.map((t) => median(by.get(t).atk) ?? 0));

    // MEASURED ONLY WHERE THE SYSTEM ACTUALLY PRINTS THEM, per tier rather than per table. 5e creatures
    // legitimately have no saving throws — most do not — so a 5e "median save" would be a number invented
    // out of the minority that happen to carry one, which is the N1-1 zero-table bug wearing a hat. A tier
    // whose creatures do not state a field gets `null` and the derivation simply omits the line.
    const opt = (field) => tiers.map((t) => {
      const xs = by.get(t)[field];
      return xs.length >= MIN_SAMPLE ? median(xs) : null;
    });
    // Monotonic only across the tiers that HAVE a value; nulls are put back afterwards so a gap does not
    // silently borrow its neighbour's number.
    const fit = (vals) => {
      const idx = vals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
      const fitted = monotonic(idx.map((i) => vals[i]));
      const back = vals.slice();
      idx.forEach((i, k) => { back[i] = fitted[k]; });
      return back;
    };
    const fort = fit(opt('fort'));
    const ref = fit(opt('ref'));
    const will = fit(opt('will'));
    const per = fit(opt('per'));

    out[key] = { system, tiers, ac, hp, atk, fort, ref, will, per, samples: tiers.map((t) => by.get(t).ac.length), thin };

    const cover = (a) => `${a.filter((v) => v !== null).length}/${tiers.length}`;
    console.log(`\n=== ${system} — ${rows.length} rated creatures, ${tiers.length} usable tiers ===`);
    console.log(`  save/perception coverage — Fort ${cover(fort)}, Ref ${cover(ref)}, Will ${cover(will)}, Perception ${cover(per)}`);
    console.log('tier    n     AC    HP   atk   Fort  Ref  Will  Perc');
    const pad = (v, w) => String(v === null ? '—' : v).padStart(w);
    tiers.forEach((t, i) => console.log(
      String(t).padStart(5), String(by.get(t).ac.length).padStart(4),
      String(ac[i]).padStart(6), String(hp[i]).padStart(5), String(atk[i]).padStart(5),
      pad(fort[i], 6), pad(ref[i], 4), pad(will[i], 5), pad(per[i], 5),
    ));
    if (thin.length) console.log(`  (${thin.length} tier(s) below the ${MIN_SAMPLE}-creature minimum, omitted: ${thin.join(', ')})`);
  }

  if (!WRITE) { console.log('\n--write to regenerate ' + OUT); await c.end(); return; }

  const stamp = (k) => {
    const d = out[k];
    return `/** Measured from ${d.tiers.reduce((n, t, i) => n + d.samples[i], 0)} creatures across ${d.tiers.length} tiers of \`${d.system}\`. */
export const ${k.toUpperCase()}_TIERS: TierRow[] = [
${d.tiers.map((t, i) => {
      // Omitted entirely rather than written as null: an absent property IS the statement "this system
      // does not print this line", and every 5e row would otherwise carry four nulls saying it four times.
      const extra = [['fort', d.fort[i]], ['ref', d.ref[i]], ['will', d.will[i]], ['perception', d.per[i]]]
        .filter(([, v]) => v !== null)
        .map(([n, v]) => `, ${n}: ${v}`)
        .join('');
      return `  { tier: ${t}, ac: ${d.ac[i]}, hp: ${d.hp[i]}, attack: ${d.atk[i]}${extra}, sample: ${d.samples[i]} },`;
    }).join('\n')}
];`;
  };

  fs.mkdirSync('lib/dnd/statblocks', { recursive: true });
  fs.writeFileSync(OUT, `// lib/dnd/statblocks/tiers.ts — what a creature at each tier actually looks like (N1-1/N1-2).
//
// GENERATED by \`npm run derive:tiers -- --write\`. Do not hand-edit: re-run it instead, so the numbers stay
// a measurement of the catalogue rather than someone's memory of one.
//
// MEASURED, NOT COPIED. D&D's *Monster Statistics by Challenge Rating* and Pathfinder's *Building
// Creatures* are Dungeon Master's Guide and Monster Core content — neither is in the SRD or the
// ORC-licensed remaster, and embedding either verbatim is the boundary this bestiary has refused all along.
// These come from the ${out.dnd5e.tiers.reduce((n, t, i) => n + out.dnd5e.samples[i], 0) + out.pf2.tiers.reduce((n, t, i) => n + out.pf2.samples[i], 0)} CC-BY/OGL creatures we do hold, which is also the better source for the job: a
// guideline says what a designer aimed at, the corpus says what creatures at that tier ARE.
//
// EACH SERIES IS NON-DECREASING, by isotonic regression (pool adjacent violators). Raw medians wobble on
// small samples — 5e's CR 24 measured lower HP than CR 23 — and a target table that dips would tell a DM a
// harder creature is frailer.

export interface TierRow {
  /** CR for D&D, level for Pathfinder. Fractional CRs are their numeric value (¼ → 0.25). */
  tier: number;
  ac: number;
  hp: number;
  /** Median attack bonus across the tier's creatures. 0 where the tier's creatures carry no to-hit. */
  attack: number;

  // ── N2-3: the lines only SOME systems print ────────────────────────────────────────────────────────
  //
  // Optional because their absence is a FACT ABOUT THE SYSTEM, not missing data. Measured coverage:
  // Pathfinder prints Fort/Ref/Will and a Perception modifier on **25 of 25** tiers — every published
  // creature has them — and D&D prints them on **0 of 31**, because most 5e creatures state no saving
  // throws at all and 5e writes perception as "passive Perception 13" inside its senses line.
  //
  // That asymmetry is why a derived Pathfinder block used to be recognisably not a Pathfinder block: saves
  // are correctly DROPPED when crossing families (a 5e block's "WIS +3" names a save Pathfinder has not
  // got) and nothing replaced them. These are the replacement, measured the same way as AC and HP.
  fort?: number;
  ref?: number;
  will?: number;
  perception?: number;

  /** How many creatures this row was measured from — so a thin tier is visible rather than implied. */
  sample: number;
}

${stamp('dnd5e')}

${stamp('pf2')}
`);
  console.log(`\nWrote ${OUT}`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
