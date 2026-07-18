// Dice engine: parse "2d6+3", roll d20 checks with advantage/disadvantage,
// and roll damage with optional crit (double dice).

export interface DieGroup {
  count: number
  sides: number
}

export interface ParsedDice {
  groups: DieGroup[]
  flat: number
}

/** Parse a dice expression like "1d8 + 3", "2d6-1", "1d6+1d4+2". */
export function parseDice(expr: string): ParsedDice {
  const groups: DieGroup[] = []
  let flat = 0
  const cleaned = expr.replace(/\s+/g, '').replace(/−/g, '-')
  // token match: signed dice groups (NdM) or signed flat numbers
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1
      const count = (m[2] === '' ? 1 : parseInt(m[2], 10)) * sign
      groups.push({ count, sides: parseInt(m[3], 10) })
    } else if (m[5]) {
      const sign = m[4] === '-' ? -1 : 1
      flat += sign * parseInt(m[5], 10)
    }
  }
  return { groups, flat }
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export interface DieResult {
  sides: number
  value: number
  sign: number
}

export interface DamageRoll {
  total: number
  dice: DieResult[]
  flat: number
  crit: boolean
  breakdown: string
}

/** Roll a damage/heal expression. If crit, dice counts are doubled. */
export function rollDamage(expr: string, crit = false): DamageRoll {
  const parsed = parseDice(expr)
  const dice: DieResult[] = []
  let total = 0
  for (const g of parsed.groups) {
    const n = Math.abs(g.count) * (crit ? 2 : 1)
    const sign = g.count < 0 ? -1 : 1
    for (let i = 0; i < n; i++) {
      const v = rollDie(g.sides)
      dice.push({ sides: g.sides, value: v, sign })
      total += sign * v
    }
  }
  total += parsed.flat
  const parts: string[] = []
  // group the dice for a compact breakdown
  const byGroup = new Map<string, number[]>()
  for (const d of dice) {
    const k = `${d.sign < 0 ? '-' : ''}d${d.sides}`
    if (!byGroup.has(k)) byGroup.set(k, [])
    byGroup.get(k)!.push(d.value)
  }
  for (const [k, vals] of byGroup) {
    parts.push(`${k.startsWith('-') ? '−' : ''}${k.replace('-', '')}[${vals.join(',')}]`)
  }
  if (parsed.flat !== 0) parts.push(parsed.flat >= 0 ? `+${parsed.flat}` : `−${Math.abs(parsed.flat)}`)
  return { total, dice, flat: parsed.flat, crit, breakdown: parts.join(' ') || '0' }
}

// ── Typed damage (DND_ITEM_BUILDER) ────────────────────────────────────────────────
// A weapon/spell can deal several typed components at once (e.g. 2d8 slashing + 1d6 poison).
// rollTyped rolls each and reports a per-type subtotal so the log can show how much of the
// hit was each damage type. Same-type segments are merged into one part.

export interface TypedSegmentInput {
  /** dice expression for this component, e.g. '2d8', '1d6', or '2d8+3' */
  dice: string
  /** damage type, e.g. 'slashing', 'poison', 'radiant' */
  type: string
}

export interface TypedDamagePart {
  type: string
  total: number
  breakdown: string // e.g. 'd8[3,5] +3'
}

export interface TypedDamageRoll {
  total: number
  parts: TypedDamagePart[] // one per distinct damage type, in first-seen order
  crit: boolean
  breakdown: string // combined, e.g. 'slashing d8[3,5]+3 (11) · poison d6[4] (4)'
}

/** Roll several typed damage components. Empty/invalid segments are skipped. If crit, each
 *  segment's dice counts are doubled (via rollDamage). Same-type segments merge. */
export function rollTyped(segments: TypedSegmentInput[], crit = false): TypedDamageRoll {
  const order: string[] = []
  const byType = new Map<string, { total: number; breakdowns: string[] }>()
  for (const seg of segments) {
    if (!seg || !seg.dice || !seg.dice.trim()) continue
    const type = (seg.type || 'untyped').trim() || 'untyped'
    const roll = rollDamage(seg.dice, crit)
    if (!byType.has(type)) { byType.set(type, { total: 0, breakdowns: [] }); order.push(type) }
    const acc = byType.get(type)!
    acc.total += roll.total
    acc.breakdowns.push(roll.breakdown)
  }
  const parts: TypedDamagePart[] = order.map((type) => {
    const acc = byType.get(type)!
    return { type, total: acc.total, breakdown: acc.breakdowns.join(' + ') }
  })
  const total = parts.reduce((s, p) => s + p.total, 0)
  const breakdown = parts.map((p) => `${p.type} ${p.breakdown} (${p.total})`).join(' · ')
  return { total, parts, crit, breakdown }
}

/** Build the typed segments for a weapon roll: the primary damage with `flat` (ability mod
 *  + rage/surge) folded into its dice string, followed by each typed bonus die. Pure so the
 *  store and tests share it. Skips blank bonus entries. */
export function weaponSegments(
  primary: { dice: string; type: string },
  bonus: { dice: string; type: string }[] | undefined,
  flat: number,
): TypedSegmentInput[] {
  const primaryDice = flat !== 0 ? `${primary.dice}${flat > 0 ? `+${flat}` : `${flat}`}` : primary.dice
  return [
    { dice: primaryDice, type: primary.type || 'untyped' },
    ...(bonus ?? []).filter((b) => b?.dice?.trim()).map((b) => ({ dice: b.dice, type: b.type || 'untyped' })),
  ]
}

/** Parse a `weapon_bonus_dice` effect value into a typed damage segment. The value is a dice
 *  expression with an OPTIONAL trailing damage type: "1d6" → untyped, "1d6 fire" → fire, "2d4 + 1 cold"
 *  → cold. The dice portion is everything up to the last word when that word isn't dice-ish; a bare
 *  "1d6" stays untyped. Returns null for a blank/no-dice value so a malformed effect is skipped, not
 *  rolled as zero. Pure so the store and its test share exactly one parser. */
export function parseBonusDamageSegment(value: string): TypedSegmentInput | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  // A trailing type word is a token that contains no digit and no 'd'-die marker (so "fire", "cold",
  // "radiant" split off, but "1d6" / "d8" / "3" stay part of the dice).
  const m = raw.match(/^(.*?)[\s]+([a-zA-Z]+)$/)
  let dice = raw
  let type = 'untyped'
  if (m && !/\d/.test(m[2]) && !/^d\d/i.test(m[2])) {
    dice = m[1].trim()
    type = m[2].toLowerCase()
  }
  if (!dice || !/\d*d\d+/i.test(dice)) return null
  return { dice, type }
}

export type Advantage = 'flat' | 'adv' | 'dis'

export interface D20Roll {
  total: number
  natural: number // the natural d20 kept
  rolls: number[] // both dice if adv/dis
  mod: number
  mode: Advantage
  crit: boolean // natural 20
  fumble: boolean // natural 1
  breakdown: string
}

/** Roll a d20 check/attack/save with a flat modifier and adv/dis. `critMin` is the lowest natural that
 *  counts as a critical hit (20 normally; 19 for Improved Critical, 18 for Superior) — only attack rolls
 *  pass anything below 20. A natural 1 is never a crit even if critMin were pushed absurdly low. */
export function rollD20(mod: number, mode: Advantage = 'flat', critMin = 20): D20Roll {
  const a = rollDie(20)
  let rolls = [a]
  let natural = a
  if (mode === 'adv' || mode === 'dis') {
    const b = rollDie(20)
    rolls = [a, b]
    natural = mode === 'adv' ? Math.max(a, b) : Math.min(a, b)
  }
  const total = natural + mod
  const modStr = mod === 0 ? '' : mod > 0 ? ` + ${mod}` : ` − ${Math.abs(mod)}`
  const kept =
    mode === 'flat'
      ? `d20[${natural}]`
      : `d20[${rolls.join(',')}]→${natural}`
  return {
    total,
    natural,
    rolls,
    mod,
    mode,
    crit: natural >= critMin && natural !== 1,
    fumble: natural === 1,
    breakdown: `${kept}${modStr}`,
  }
}
