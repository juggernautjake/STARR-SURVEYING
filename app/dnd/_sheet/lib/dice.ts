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

/** Roll a d20 check/attack/save with a flat modifier and adv/dis. */
export function rollD20(mod: number, mode: Advantage = 'flat'): D20Roll {
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
    crit: natural === 20,
    fumble: natural === 1,
    breakdown: `${kept}${modStr}`,
  }
}
