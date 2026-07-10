'use client'
// Vendored from ../neon-odyssey-sheet. Persistence is DB-backed when the provider
// is given a `characterId` (C3: loads `dnd_characters.data` on mount + debounced
// autosave via /api/dnd/characters/:id); otherwise it falls back to localStorage
// for the C2 static preview / standalone mode. loadInitial is a lazy useState
// initializer wrapped in try/catch → SSR-safe (falls back to the bundled `lazzuh`).
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Character, InvItem, ActiveEffect, Spell } from '../types'
import { lazzuh } from '../data/lazzuh'
import { profBonusForLevel, abilityMod, ragesForLevel, rageDamageForLevel, maxHpForLevel, speedForLevel, MAX_BUILT_LEVEL } from '../rules/dnd'
import { rollD20, rollDamage, parseDice, rollDie, rollTyped, weaponSegments, type Advantage } from '../lib/dice'

const STORAGE_KEY = 'neon-odyssey:lazzuh:v7'

export interface RollEntry {
  id: number
  label: string
  kind: 'check' | 'save' | 'attack' | 'damage' | 'heal' | 'temp' | 'raw'
  total: number
  breakdown: string
  crit?: boolean
  fumble?: boolean
  mode?: Advantage
  tag?: string
}

export interface ActiveRoll {
  token: number
  landing: number // number the wheel lands on
  min: number
  max: number
  isD20: boolean
  crit: boolean
  fumble: boolean
  entry: Omit<RollEntry, 'id'>
}

interface RollD20Opts {
  kind?: RollEntry['kind']
  strMelee?: boolean
  advantage?: boolean
  disadvantage?: boolean
  tag?: string
}
interface RollDmgOpts {
  flat?: number
  rageable?: boolean
  crit?: boolean
  kind?: RollEntry['kind']
  tag?: string
}

interface Ctx {
  char: Character
  setChar: (updater: (c: Character) => Character) => void
  reset: () => void
  importChar: (c: Character) => void
  /** Refetch the DB-backed sheet and apply it (e.g. after an AI edit — I3).
   *  Resolves true if the DB was reachable and the sheet applied, false otherwise. */
  reloadFromDb: () => Promise<boolean>
  /** L10 offline-safe: the last DB save failed / the sheet loaded from the local
   *  cache. Edits keep working and are cached locally; they sync when the DB returns. */
  offline: boolean
  pb: number
  /** DM mode (§6.8.1): unlocks the DM override panel + full edit control. */
  isDM: boolean
  /** Viewer can edit this character (owner OR DM) — gates owner-level tools. */
  canWrite: boolean
  /** The DB-backed character id (null in localStorage/preview mode) — used by the
   *  DM edit log (C11a) and realtime sync (C11b). */
  characterId: string | null
  /** The character's campaign id (null in preview / for a campaign-less character) —
   *  lets on-sheet stream tools post to the shared roll feed + subscribe to campaign
   *  reactions for the live influence meter. */
  campaignId: string | null
  /** Character media (art/token) from the DB row (Phase D1/D2). */
  media: { artUrl: string | null; tokenUrl: string | null }
  /** Update the in-memory art/token pointers after an upload so the sheet reflects
   *  the new image immediately (the DB row is written by the media endpoint). */
  setMedia: (m: { artUrl: string | null; tokenUrl: string | null }) => void
  /** Editable descriptions from the DB `bio` column (Phase D3). */
  bio: Record<string, string>
  /** Merge-patch the descriptions and persist to the `bio` column (DB mode). */
  saveDescriptions: (patch: Record<string, string>) => void

  advMode: Advantage
  setAdvMode: (m: Advantage) => void
  transformActive: boolean
  topFormId: string | null // the top Surge form you'd transform into (null if none unlocked)
  transform: () => void
  endTransform: () => void
  nextTurn: () => void
  useFormAbility: (id: string) => void
  setExhaustion: (n: number) => void
  recklessActive: boolean
  toggleReckless: () => void
  editMode: boolean
  setEditMode: (b: boolean) => void
  setLevel: (n: number) => void
  maxLevel: number
  // Temporary-edit mode: when on, number edits are reversible.
  tempMode: boolean
  setTempMode: (b: boolean) => void
  tempOverrides: Record<string, number>
  recordOverride: (path: string, original: number) => void
  clearOverride: (path: string) => void
  clearAllOverrides: () => void

  log: RollEntry[]
  clearLog: () => void
  activeRoll: ActiveRoll | null
  commitRoll: (entry: Omit<RollEntry, 'id'>) => void
  resetStage: () => void

  rollCheck: (label: string, mod: number, opts?: RollD20Opts) => void
  rollDmg: (label: string, diceExpr: string, opts?: RollDmgOpts) => void
  rollWeaponDamage: (item: InvItem, opts?: { crit?: boolean }) => void
  rollExpr: (label: string, expr: string, kind?: RollEntry['kind']) => void
  castSpell: (spell: Spell) => void

  adjustHp: (delta: number) => void
  addActiveEffect: (ae: ActiveEffect) => void
  removeActiveEffect: (id: string) => void
  setResource: (id: string, current: number) => void
  shortRest: () => void
  longRest: () => void
  rollDeathSave: () => void
  spendHitDie: () => void
}

const CharacterContext = createContext<Ctx | null>(null)

function loadInitial(): Character {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.meta && parsed.abilities) return parsed as Character
    }
  } catch {
    /* ignore */
  }
  return structuredClone(lazzuh)
}

/** Write a numeric value to a known editable path (used to restore temp overrides). */
function applyPathValue(c: Character, path: string, val: number): Character {
  if (path.startsWith('ability.')) {
    const k = path.split('.')[1] as keyof Character['abilities']
    return { ...c, abilities: { ...c.abilities, [k]: val } }
  }
  const map: Record<string, keyof Character['combat']> = {
    'combat.currentHp': 'currentHp',
    'combat.maxHp': 'maxHp',
    'combat.ac': 'ac',
    'combat.speed': 'speed',
    'combat.saveDC': 'saveDCOverride',
  }
  const key = map[path]
  if (key) return { ...c, combat: { ...c.combat, [key]: val } }
  return c
}

function unlockedFormsOf(c: Character) {
  return c.forms.filter((f) => f.unlockLevel <= c.meta.level)
}
/** The top Surge form (highest non-Base you've unlocked), or null. */
function topSurgeFormId(c: Character): string | null {
  const nb = unlockedFormsOf(c).filter((f) => f.id !== 'base')
  return nb.length ? nb[nb.length - 1].id : null
}
/** The form you drop to when a Surge ends: your highest at-will Held form. */
function highestHeldId(c: Character): string {
  const u = unlockedFormsOf(c)
  if (c.meta.level >= 20) return u.length ? u[u.length - 1].id : 'base' // capstone: hold the top form
  const nb = u.filter((f) => f.id !== 'base')
  if (nb.length <= 1) return 'base'
  return nb[nb.length - 2].id
}
/** Fresh per-Surge use counts for a form's limited abilities. */
function freshUses(c: Character, formId: string | null): Record<string, number> {
  const out: Record<string, number> = {}
  c.forms.find((f) => f.id === formId)?.abilities?.forEach((a) => {
    if (a.uses) out[a.id] = a.uses
  })
  return out
}

export function CharacterProvider({
  children,
  characterId,
  campaignId,
  isDM = false,
  canWrite,
}: {
  children: React.ReactNode
  /** When set (C3), the sheet loads/saves `dnd_characters.data` via the API for
   *  that row. When omitted, it falls back to localStorage (the C2 static preview
   *  / standalone mode). */
  characterId?: string
  /** The character's campaign (enables on-sheet stream→feed + reaction wiring). */
  campaignId?: string
  /** DM mode (§6.8.1) — surfaces the DM override panel + full edit control. */
  isDM?: boolean
  /** Whether the viewer can edit this character (owner OR DM). Gates owner-level
   *  tools like the art/token uploader; defaults to DM when not supplied. */
  canWrite?: boolean
}) {
  const dbMode = !!characterId
  const [char, setCharState] = useState<Character>(() =>
    dbMode ? structuredClone(lazzuh) : loadInitial(),
  )
  const [advMode, setAdvMode] = useState<Advantage>('flat')
  const [recklessActive, setRecklessActive] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [tempMode, setTempMode] = useState(false)
  const [log, setLog] = useState<RollEntry[]>([])
  const [activeRoll, setActiveRoll] = useState<ActiveRoll | null>(null)
  const idRef = useRef(1)
  const tokenRef = useRef(1)
  // C3 persistence. `dbPhase` gates autosave so we never PATCH the fallback
  // character over real data before the initial load resolves; `lastSavedRef`
  // dedupes redundant PATCHes (incl. the no-op right after hydration).
  const [dbPhase, setDbPhase] = useState<'loading' | 'ready'>(dbMode ? 'loading' : 'ready')
  const [media, setMedia] = useState<{ artUrl: string | null; tokenUrl: string | null }>({ artUrl: null, tokenUrl: null })
  const [bio, setBioState] = useState<Record<string, string>>({})
  const lastSavedRef = useRef<string | null>(null)
  // L10 offline-safe: per-character write-through localStorage cache + save retry.
  // `offline` is true whenever the last save failed or the sheet loaded from cache.
  const cacheKey = characterId ? `dnd:char-cache:${characterId}` : null
  const [offline, setOffline] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false) // serialize PATCHes so an older save can't land last
  // Realtime (C11b): the broadcast channel + a per-client id to ignore our own pings.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const clientIdRef = useRef<string>('')

  // localStorage persistence — preview / standalone mode only.
  useEffect(() => {
    if (dbMode) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(char))
    } catch {
      /* ignore */
    }
  }, [char, dbMode])

  // Refetch the saved sheet from the DB and apply it (shared by the mount load and
  // the on-demand reload after an AI edit — I3). Sets lastSavedRef so the incoming
  // state isn't immediately echo-saved.
  const reloadFromDb = useCallback(async (): Promise<boolean> => {
    if (!characterId) return false
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}`)
      if (!res.ok) return false
      const character = (await res.json())?.character
      const d = character?.data
      if (d && d.meta && d.abilities) {
        setCharState(d as Character)
        lastSavedRef.current = JSON.stringify(d)
      }
      if (character) {
        setMedia({ artUrl: character.art_url ?? null, tokenUrl: character.token_url ?? null })
        setBioState(character.bio ?? {})
      }
      setOffline(false)
      return true
    } catch {
      return false // keep the current character; the caller may hydrate from cache
    }
  }, [characterId])

  // DB load on mount. If the row is empty/new, keep the fallback character — the
  // first edit's autosave seeds the row. If the DB is unreachable (L10), hydrate the
  // last-known sheet from the local cache instead of the bundled Lazzuh fallback, and
  // flag offline so edits are cached + retried rather than lost.
  useEffect(() => {
    if (!characterId) return
    let cancelled = false
    reloadFromDb()
      .then((ok) => {
        if (ok || cancelled) return
        try {
          const raw = cacheKey ? localStorage.getItem(cacheKey) : null
          if (raw) {
            const d = JSON.parse(raw)
            if (d && d.meta && d.abilities) {
              lastSavedRef.current = JSON.stringify(d)
              setCharState(d as Character)
            }
          }
        } catch {
          /* ignore a corrupt cache */
        }
        setOffline(true)
      })
      .finally(() => {
        if (!cancelled) setDbPhase('ready')
      })
    return () => {
      cancelled = true
    }
  }, [characterId, reloadFromDb, cacheKey])

  // L10 write-through cache: mirror the live sheet into localStorage so a reload while
  // offline restores the latest state (incl. edits not yet saved to the DB).
  useEffect(() => {
    if (!cacheKey || dbPhase !== 'ready') return
    try {
      localStorage.setItem(cacheKey, JSON.stringify(char))
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [char, cacheKey, dbPhase])

  useEffect(() => () => {
    if (retryRef.current) clearTimeout(retryRef.current)
  }, [])

  // Realtime sync (C11b): one broadcast channel per character. After any client
  // saves, it pings here; other viewers refetch through the authed API — data
  // never rides the public channel. This is a broadcast ping, NOT table-level
  // Realtime: the /dnd cookie auth isn't a Supabase-auth session, so Realtime RLS
  // wouldn't see dnd users. Refetch enforces the real (C4) authorization.
  useEffect(() => {
    if (!characterId) return
    if (!clientIdRef.current) {
      clientIdRef.current = `c_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    }
    const channel = supabase.channel(`dnd:character:${characterId}`, { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'changed' }, (msg) => {
        if ((msg.payload as { senderId?: string })?.senderId === clientIdRef.current) return
        fetch(`/api/dnd/characters/${characterId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            const character = j?.character
            const d = character?.data
            if (d && d.meta && d.abilities) {
              lastSavedRef.current = JSON.stringify(d) // don't echo-save the incoming state
              setCharState(d as Character)
            }
            if (character) {
              setMedia({ artUrl: character.art_url ?? null, tokenUrl: character.token_url ?? null })
              setBioState(character.bio ?? {})
            }
          })
          .catch(() => {})
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [characterId])

  // DB autosave: debounced PATCH of the whole sheet `data` after any change, then
  // ping the channel so other viewers refetch (C11b). L10: on a failed save we flag
  // offline + schedule a retry (the state is already in the write-through cache, so
  // nothing is lost); `retryTick` re-runs this effect to re-send the latest sheet.
  useEffect(() => {
    if (!dbMode || dbPhase !== 'ready') return
    const serialized = JSON.stringify(char)
    if (serialized === lastSavedRef.current) return
    const failed = () => {
      setOffline(true)
      if (retryRef.current) clearTimeout(retryRef.current)
      retryRef.current = setTimeout(() => setRetryTick((n) => n + 1), 4000)
    }
    const t = setTimeout(() => {
      // If a save is already in flight, don't start a second (out-of-order) one — retry
      // shortly with whatever the latest state is then.
      if (savingRef.current) {
        if (retryRef.current) clearTimeout(retryRef.current)
        retryRef.current = setTimeout(() => setRetryTick((n) => n + 1), 300)
        return
      }
      savingRef.current = true
      fetch(`/api/dnd/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: char }),
      })
        .then((res) => {
          if (res.ok) {
            lastSavedRef.current = serialized
            setOffline(false)
            channelRef.current?.send({
              type: 'broadcast',
              event: 'changed',
              payload: { senderId: clientIdRef.current },
            })
          } else {
            failed()
          }
        })
        .catch(failed)
        .finally(() => {
          savingRef.current = false
        })
    }, 800)
    return () => clearTimeout(t)
  }, [char, dbMode, dbPhase, characterId, retryTick])

  const setChar = useCallback((updater: (c: Character) => Character) => setCharState((c) => updater(c)), [])

  // D3: merge-patch the editable descriptions and persist them to the `bio` column
  // (separate from the sheet `data` autosave). No-ops the network call in preview mode.
  const saveDescriptions = useCallback(
    (patch: Record<string, string>) => {
      setBioState((prev) => {
        const next = { ...prev, ...patch }
        if (characterId) {
          void fetch(`/api/dnd/characters/${characterId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bio: next }),
          }).catch(() => {})
        }
        return next
      })
    },
    [characterId],
  )

  const reset = useCallback(() => {
    setCharState(structuredClone(lazzuh))
    setRecklessActive(false)
  }, [])

  const importChar = useCallback((c: Character) => setCharState(structuredClone(c)), [])

  const pb = useMemo(
    () => char.profBonusOverride ?? profBonusForLevel(char.meta.level),
    [char.profBonusOverride, char.meta.level],
  )

  const commitRoll = useCallback((entry: Omit<RollEntry, 'id'>) => {
    setLog((l) => [{ ...entry, id: idRef.current++ }, ...l].slice(0, 40))
  }, [])

  const stage = useCallback(
    (entry: Omit<RollEntry, 'id'>, o: { landing: number; min: number; max: number; isD20: boolean; crit?: boolean; fumble?: boolean }) => {
      setActiveRoll({
        token: tokenRef.current++,
        landing: o.landing,
        min: o.min,
        max: o.max,
        isD20: o.isD20,
        crit: !!o.crit,
        fumble: !!o.fumble,
        entry,
      })
    },
    [],
  )

  const rollCheck = useCallback(
    (label: string, mod: number, opts: RollD20Opts = {}) => {
      const hasAdv = advMode === 'adv' || (recklessActive && !!opts.strMelee) || !!opts.advantage
      const hasDis = advMode === 'dis' || !!opts.disadvantage
      const mode: Advantage = hasAdv && hasDis ? 'flat' : hasAdv ? 'adv' : hasDis ? 'dis' : 'flat'
      // Exhaustion: −2 to every d20 test per level (2024 rules), applied automatically.
      const exh = char.combat.exhaustion || 0
      const r = rollD20(mod - 2 * exh, mode)
      const tags: string[] = []
      if (recklessActive && opts.strMelee) tags.push('RECKLESS')
      if (opts.advantage) tags.push('ADV')
      if (exh > 0) tags.push(`EXH −${2 * exh}`)
      if (opts.tag) tags.push(opts.tag)
      stage(
        {
          label,
          kind: opts.kind ?? 'check',
          total: r.total,
          breakdown: r.breakdown,
          crit: r.crit,
          fumble: r.fumble,
          mode,
          tag: tags.join(' · ') || undefined,
        },
        { landing: r.natural, min: 1, max: 20, isD20: true, crit: r.crit, fumble: r.fumble },
      )
    },
    [advMode, recklessActive, char.combat.exhaustion, stage],
  )

  const rollDmg = useCallback(
    (label: string, diceExpr: string, opts: RollDmgOpts = {}) => {
      const dmg = rollDamage(diceExpr, opts.crit)
      const flat = opts.flat ?? 0
      const rage = opts.rageable && char.combat.transformActive ? char.combat.rageDamageBonus : 0
      const total = dmg.total + flat + rage
      const parts = [dmg.breakdown]
      if (flat) parts.push(flat >= 0 ? `+${flat}` : `−${Math.abs(flat)}`)
      if (rage) parts.push(`+${rage} surge`)
      const tags: string[] = []
      if (opts.crit) tags.push('CRIT ×2 DICE')
      if (rage) tags.push('SURGED')
      if (opts.tag) tags.push(opts.tag)
      // spin range roughly covers plausible totals
      const parsed = parseDice(diceExpr)
      const maxDie = parsed.groups.reduce((s, g) => s + Math.abs(g.count) * g.sides * (opts.crit ? 2 : 1), 0)
      stage(
        { label, kind: opts.kind ?? 'damage', total, breakdown: parts.join(' '), tag: tags.join(' · ') || undefined },
        { landing: total, min: Math.max(1, flat + rage + 1), max: Math.max(2, maxDie + flat + rage), isD20: false },
      )
    },
    [char.combat.transformActive, char.combat.rageDamageBonus, stage],
  )

  // Roll a homebrew weapon's damage: primary (typed, + ability mod) plus any typed bonus dice
  // (e.g. +1d6 poison). Reports a per-type breakdown so the log shows how much of the hit was
  // each damage type. Adds surge/rage to the primary type when the weapon is rageable + surged.
  const rollWeaponDamage = useCallback(
    (item: InvItem, opts: { crit?: boolean } = {}) => {
      const w = item.weapon
      if (!w) return
      const abilityKey = w.ability ?? 'str'
      const mod = abilityMod(char.abilities[abilityKey])
      const rage = item.tags?.includes('weapon') && char.combat.transformActive ? char.combat.rageDamageBonus : 0
      const flat = mod + rage
      const segments = weaponSegments(w.damage, w.bonus, flat)
      const typed = rollTyped(segments, opts.crit)
      const tags: string[] = []
      if (opts.crit) tags.push('CRIT ×2 DICE')
      if (rage) tags.push('SURGED')
      // spin range roughly covers plausible totals across all segments
      const maxV = segments.reduce((s, seg) => {
        const p = parseDice(seg.dice)
        return s + p.groups.reduce((g2, g) => g2 + Math.abs(g.count) * g.sides * (opts.crit ? 2 : 1), 0) + Math.max(0, p.flat)
      }, 0)
      stage(
        { label: `${item.name} — damage`, kind: 'damage', total: typed.total, breakdown: typed.breakdown, tag: tags.join(' · ') || undefined },
        { landing: typed.total, min: Math.max(1, flat + 1), max: Math.max(2, maxV), isD20: false },
      )
    },
    [char.abilities, char.combat.transformActive, char.combat.rageDamageBonus, stage],
  )

  const rollExpr = useCallback(
    (label: string, expr: string, kind: RollEntry['kind'] = 'raw') => {
      const dmg = rollDamage(expr)
      const parsed = parseDice(expr)
      const maxV = parsed.groups.reduce((s, g) => s + Math.abs(g.count) * g.sides, 0) + parsed.flat
      stage(
        { label, kind, total: dmg.total, breakdown: dmg.breakdown },
        { landing: dmg.total, min: 1, max: Math.max(2, maxV), isD20: false },
      )
    },
    [stage],
  )

  // Cast a spell: spend the level's slot (cantrips are free), roll the spell attack and/or
  // typed damage, roll healing, or log a save/utility cast with its DC.
  const castSpell = useCallback(
    (spell: Spell) => {
      const sc = char.spellcasting
      const mod = sc ? abilityMod(char.abilities[sc.ability]) : 0
      const pb = profBonusForLevel(char.meta.level)
      const saveDC = char.combat.saveDCOverride ?? 8 + pb + mod
      const label = spell.alias ? `${spell.name} (“${spell.alias}”)` : spell.name
      if (spell.level > 0) {
        setCharState((c) => {
          const slot = c.spellcasting?.slots?.[spell.level as 1]
          if (!slot || slot.current <= 0) return c
          return { ...c, spellcasting: { ...c.spellcasting!, slots: { ...c.spellcasting!.slots, [spell.level]: { ...slot, current: slot.current - 1 } } } }
        })
      }
      if (spell.attack) rollCheck(`${label} — spell attack`, pb + mod, { kind: 'attack' })
      if (spell.damage && spell.damage.length) {
        const typed = rollTyped(spell.damage.map((d) => ({ dice: d.dice, type: d.type })))
        const tag = spell.save ? `${spell.save.ability.toUpperCase()} save DC ${saveDC}` : undefined
        const maxV = spell.damage.reduce((s, d) => { const p = parseDice(d.dice); return s + p.groups.reduce((g2, g) => g2 + Math.abs(g.count) * g.sides, 0) + Math.max(0, p.flat) }, 0)
        stage(
          { label: `${label} — damage`, kind: 'damage', total: typed.total, breakdown: typed.breakdown, tag },
          { landing: typed.total, min: 1, max: Math.max(2, maxV), isD20: false },
        )
      } else if (spell.heal) {
        rollExpr(`${label} — heal`, spell.heal, 'heal')
      } else if (!spell.attack) {
        commitRoll({ label: `${label} — cast`, kind: 'raw', total: 0, breakdown: spell.save ? `${spell.save.ability.toUpperCase()} save DC ${saveDC}` : spell.level > 0 ? `L${spell.level} slot spent` : 'cantrip' })
      }
    },
    [char.spellcasting, char.abilities, char.meta.level, char.combat.saveDCOverride, rollCheck, rollExpr, stage, commitRoll],
  )

  const clearLog = useCallback(() => setLog([]), [])
  const resetStage = useCallback(() => setActiveRoll(null), [])

  const transformActive = char.combat.transformActive
  const topFormId = topSurgeFormId(char)

  // Surge into your top form. First Surge each long rest is free; each extra
  // one before a long rest costs a level of Exhaustion. Resets the form's uses.
  const transform = useCallback(() => {
    setCharState((c) => {
      const top = topSurgeFormId(c)
      if (!top) return c // nothing to Surge into yet (level < 3)
      const form = c.forms.find((f) => f.id === top)
      const willExhaust = c.combat.transformsThisRest >= 1
      return {
        ...c,
        activeFormId: top,
        combat: {
          ...c.combat,
          transformActive: true,
          transformTurnsLeft: form?.durationTurns ?? 10,
          transformsThisRest: c.combat.transformsThisRest + 1,
          exhaustion: Math.min(6, c.combat.exhaustion + (willExhaust ? 1 : 0)),
          abilityUses: freshUses(c, top),
        },
      }
    })
  }, [])

  const endTransform = useCallback(() => {
    setCharState((c) => ({
      ...c,
      activeFormId: highestHeldId(c),
      combat: { ...c.combat, transformActive: false, transformTurnsLeft: 0, abilityUses: {} },
    }))
  }, [])

  const nextTurn = useCallback(() => {
    setCharState((c) => {
      if (!c.combat.transformActive) return c
      const left = c.combat.transformTurnsLeft - 1
      if (left <= 0) {
        return { ...c, activeFormId: highestHeldId(c), combat: { ...c.combat, transformActive: false, transformTurnsLeft: 0, abilityUses: {} } }
      }
      return { ...c, combat: { ...c.combat, transformTurnsLeft: left } }
    })
  }, [])

  const useFormAbility = useCallback((id: string) => {
    setCharState((c) => {
      const cur = c.combat.abilityUses[id]
      if (cur === undefined) return c // at-will ability, nothing to spend
      return { ...c, combat: { ...c.combat, abilityUses: { ...c.combat.abilityUses, [id]: Math.max(0, cur - 1) } } }
    })
  }, [])

  const setExhaustion = useCallback((n: number) => {
    setCharState((c) => ({ ...c, combat: { ...c.combat, exhaustion: Math.max(0, Math.min(6, Math.round(n))) } }))
  }, [])

  // Temp-override bookkeeping: record the original value the first time a path is
  // edited temporarily; clear it on a permanent edit or revert.
  const recordOverride = useCallback((path: string, original: number) => {
    setCharState((c) => {
      if (c.tempOverrides && path in c.tempOverrides) return c // keep the earliest original
      return { ...c, tempOverrides: { ...(c.tempOverrides ?? {}), [path]: original } }
    })
  }, [])
  const clearOverride = useCallback((path: string) => {
    setCharState((c) => {
      if (!c.tempOverrides || !(path in c.tempOverrides)) return c
      const next = { ...c.tempOverrides }
      delete next[path]
      return { ...c, tempOverrides: next }
    })
  }, [])
  const clearAllOverrides = useCallback(() => {
    setCharState((c) => {
      let nc = c
      for (const [path, orig] of Object.entries(c.tempOverrides ?? {})) nc = applyPathValue(nc, path, orig)
      return { ...nc, tempOverrides: {} }
    })
  }, [])

  const toggleReckless = useCallback(() => setRecklessActive((v) => !v), [])

  // Set the character's level and recompute everything the level drives:
  // proficiency (via pb), rage & laser uses, speed, hit dice, and max HP.
  const setLevel = useCallback((n: number) => {
    const level = Math.max(1, Math.min(MAX_BUILT_LEVEL, Math.round(n)))
    setRecklessActive(false)
    setCharState((c) => {
      const conMod = abilityMod(c.abilities.con)
      const maxHp = maxHpForLevel(level, conMod)
      const speed = speedForLevel(level)
      return {
        ...c,
        meta: { ...c.meta, level },
        activeFormId: 'base',
        combat: {
          ...c.combat,
          maxHp,
          currentHp: maxHp,
          tempHp: 0,
          speed,
          rageDamageBonus: rageDamageForLevel(level),
          hitDiceTotal: level,
          hitDiceRemaining: level,
          deathSuccess: 0,
          deathFail: 0,
          transformActive: false,
          transformTurnsLeft: 0,
          transformsThisRest: 0,
          exhaustion: 0,
          abilityUses: {},
        },
        resources: c.resources.map((r) => ({ ...r, current: r.max })),
      }
    })
  }, [])

  // Active temporary effects (consumed buffs / DM boons) — the Active-Effects tracker.
  const addActiveEffect = useCallback((ae: ActiveEffect) => {
    setCharState((c) => ({ ...c, activeEffects: [...(c.activeEffects ?? []), ae] }))
  }, [])
  const removeActiveEffect = useCallback((id: string) => {
    setCharState((c) => ({ ...c, activeEffects: (c.activeEffects ?? []).filter((e) => e.id !== id) }))
  }, [])

  const adjustHp = useCallback((delta: number) => {
    setCharState((c) => {
      let cur = c.combat.currentHp
      let temp = c.combat.tempHp
      if (delta < 0) {
        const dmg = -delta
        const fromTemp = Math.min(temp, dmg)
        temp -= fromTemp
        cur = Math.max(0, cur - (dmg - fromTemp))
      } else {
        cur = Math.min(c.combat.maxHp, cur + delta)
      }
      return { ...c, combat: { ...c.combat, currentHp: cur, tempHp: temp } }
    })
  }, [])

  const setResource = useCallback((id: string, current: number) => {
    setCharState((c) => ({
      ...c,
      resources: c.resources.map((r) => (r.id === id ? { ...r, current: Math.max(0, Math.min(r.max, current)) } : r)),
    }))
  }, [])

  const shortRest = useCallback(() => {
    setCharState((c) => ({
      ...c,
      resources: c.resources.map((r) => (r.resetOn === 'short' ? { ...r, current: r.max } : r)),
    }))
  }, [])

  const longRest = useCallback(() => {
    setRecklessActive(false)
    setCharState((c) => ({
      ...c,
      combat: {
        ...c.combat,
        currentHp: c.combat.maxHp,
        tempHp: 0,
        hitDiceRemaining: c.combat.hitDiceTotal,
        deathSuccess: 0,
        deathFail: 0,
        transformActive: false,
        transformTurnsLeft: 0,
        transformsThisRest: 0, // your free Surge is back
        exhaustion: Math.max(0, c.combat.exhaustion - 1), // long rest removes 1 level
        abilityUses: {},
      },
      activeFormId: highestHeldId(c),
      resources: c.resources.map((r) => ({ ...r, current: r.max })),
    }))
  }, [])

  const rollDeathSave = useCallback(() => {
    const bonus = char.combat.deathSaveBonus
    const r = rollD20(bonus, 'flat')
    let result = ''
    if (r.natural === 20) result = 'NAT 20 — regain 1 HP!'
    else if (r.natural === 1) result = 'NAT 1 — two failures'
    else result = r.total >= 10 ? 'Success' : 'Failure'
    stage(
      { label: 'Death Save', kind: 'save', total: r.total, breakdown: r.breakdown, crit: r.natural === 20, fumble: r.natural === 1, tag: result },
      { landing: r.natural, min: 1, max: 20, isD20: true, crit: r.natural === 20, fumble: r.natural === 1 },
    )
    setCharState((c) => {
      let { deathSuccess, deathFail, currentHp } = c.combat
      if (r.natural === 20) return { ...c, combat: { ...c.combat, deathSuccess: 0, deathFail: 0, currentHp: Math.max(1, currentHp) } }
      if (r.natural === 1) deathFail = Math.min(3, deathFail + 2)
      else if (r.total >= 10) deathSuccess = Math.min(3, deathSuccess + 1)
      else deathFail = Math.min(3, deathFail + 1)
      return { ...c, combat: { ...c.combat, deathSuccess, deathFail } }
    })
  }, [char.combat.deathSaveBonus, stage])

  const spendHitDie = useCallback(() => {
    if (char.combat.hitDiceRemaining <= 0) return
    const conMod = Math.floor((char.abilities.con - 10) / 2)
    const heal = rollDie(char.combat.hitDiceSize)
    const total = Math.max(0, heal + conMod)
    stage(
      { label: 'Hit Die — heal', kind: 'heal', total, breakdown: `d${char.combat.hitDiceSize}[${heal}] +${conMod} CON` },
      { landing: total, min: 1, max: char.combat.hitDiceSize + conMod, isD20: false },
    )
    setCharState((c) => ({
      ...c,
      combat: {
        ...c.combat,
        hitDiceRemaining: Math.max(0, c.combat.hitDiceRemaining - 1),
        currentHp: Math.min(c.combat.maxHp, c.combat.currentHp + total),
      },
    }))
  }, [char.abilities.con, char.combat.hitDiceRemaining, char.combat.hitDiceSize, stage])

  const value: Ctx = {
    char,
    setChar,
    reset,
    importChar,
    reloadFromDb,
    offline,
    pb,
    isDM,
    canWrite: canWrite ?? isDM,
    characterId: characterId ?? null,
    campaignId: campaignId ?? null,
    media,
    setMedia,
    bio,
    saveDescriptions,
    advMode,
    setAdvMode,
    transformActive,
    topFormId,
    transform,
    endTransform,
    nextTurn,
    useFormAbility,
    setExhaustion,
    recklessActive,
    toggleReckless,
    editMode,
    setEditMode,
    setLevel,
    maxLevel: MAX_BUILT_LEVEL,
    tempMode,
    setTempMode,
    tempOverrides: char.tempOverrides ?? {},
    recordOverride,
    clearOverride,
    clearAllOverrides,
    log,
    clearLog,
    activeRoll,
    commitRoll,
    resetStage,
    rollCheck,
    rollDmg,
    rollWeaponDamage,
    rollExpr,
    castSpell,
    adjustHp,
    addActiveEffect,
    removeActiveEffect,
    setResource,
    shortRest,
    longRest,
    rollDeathSave,
    spendHitDie,
  }

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
}

export function useChar(): Ctx {
  const ctx = useContext(CharacterContext)
  if (!ctx) throw new Error('useChar must be used within CharacterProvider')
  return ctx
}
