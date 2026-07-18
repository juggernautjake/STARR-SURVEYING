'use client'
// Vendored from ../neon-odyssey-sheet. Persistence is DB-backed when the provider
// is given a `characterId` (C3: loads `dnd_characters.data` on mount + debounced
// autosave via /api/dnd/characters/:id); otherwise it falls back to localStorage
// for the C2 static preview / standalone mode. loadInitial is a lazy useState
// initializer wrapped in try/catch → SSR-safe (falls back to a BLANK character —
// never another character's bundled build).
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Character, InvItem, ActiveEffect, Spell, FeatureBlock } from '../types'
import { normalizeCharacter, blankCharacter } from '../data/blank'
import { profBonusForLevel, abilityMod, maxHpForLevel, speedForLevel, MAX_BUILT_LEVEL } from '../rules/dnd'
import { buildLedger, type EffectLedger } from '@/lib/dnd/effects/ledger'
import { routeFormDamage, isFormHpLive } from '@/lib/dnd/effects/form-hp'
import { rollD20, foldD20, rollDamage, parseDice, rollDie, rollTyped, weaponSegments, parseBonusDamageSegment, type Advantage } from '../lib/dice'
import { deriveAc, type AcResult } from '../lib/derive-ac'
import { applyDeathSave } from '../lib/death-save'
import { resolvePreferences, DEFAULT_CAMPAIGN_PREFERENCES, type EffectivePreferences } from '@/lib/dnd/preferences'
import { hitDiceAfterLongRest } from '@/lib/dnd/mechanics/long-rest'
import { exhaustionD20Effect, type Edition } from '@/lib/dnd/mechanics/exhaustion'

// The no-op exhaustion effect used when auto-mechanics is OFF (Area R2) — a stable module constant so it never
// destabilises the roll callbacks' dependency arrays.
const NO_EXH = { penalty: 0, disadvantage: false } as const

// Per-character localStorage slot. A single shared key meant every standalone sheet
// read and wrote the SAME cached character (originally Lazzuh's); keying by id keeps
// each character's local cache to itself.
const STORAGE_PREFIX = 'neon-odyssey:sheet:v8'
const storageKeyFor = (characterId?: string) => `${STORAGE_PREFIX}:${characterId || 'standalone'}`

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
  /** Named effects that REDUCED this roll — disadvantage-granting conditions/effects + any flat penalty
   *  (exhaustion). Shown in RED in the tray so the player sees exactly what hurt the roll and why. */
  penalties?: string[]
  /** Named effects that HELPED this roll — advantage-granting conditions/effects. Shown non-red. */
  boosts?: string[]
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
  /** Named sources granting advantage/disadvantage on this roll (from `rollEffectSources`) — the caller knows
   *  the ledger target(s); the tray shows disSources in red so "why is this at disadvantage?" is answered. */
  disSources?: string[]
  advSources?: string[]
}
interface RollDmgOpts {
  flat?: number
  formBoosted?: boolean
  crit?: boolean
  kind?: RollEntry['kind']
  tag?: string
}

interface Ctx {
  /** The effective preferences (campaign DM ∩ player) driving configurable mechanics + the dice style.
   *  Always present — the vanilla set when the sheet is standalone (Area P/M/D). */
  preferences: EffectivePreferences
  /** The character's rules edition ('2014' | '2024'), derived from the system key — drives edition-specific
   *  mechanics like the exhaustion model (Area M1). */
  edition: Edition
  /** The BASE character as stored. Effects are never written into it — read `abilities`/`ledger`
   *  for what the character currently IS. Write through `setChar` as always. */
  char: Character
  /** Effective ability scores: base + every active effect (items, potions, features, forms).
   *  Render these. `char.abilities` is the unmodified base and will not reflect a +2 belt. */
  abilities: Character['abilities']
  /** Why every number is what it is (Slice 10): sources, contributions, base → final.
   *  The Active Effects panel and the ★ tooltips are reads of this — never re-derivations, or
   *  two components will eventually disagree about the same number. */
  ledger: EffectLedger
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
  /** Lowest natural d20 that crits on attacks (20 normally; widened by `crit_range` effects). */
  critMin: number
  /** Derived Armor Class (equipped armor/shield + effective DEX + AC effects), the single source both
   *  the StatRail and the Combat panel read. `fromEquipment` is false when the manual AC stands. */
  acInfo: AcResult
  /** The generic STR-based Save DC (8 + PB + STR, or the manual override) — one source for every card. */
  saveDc: number
  spellSaveDc: number
  /** The EFFECTIVE active form id (Slice 18): the form a `transform` effect imposes, else the
   *  character's own `activeFormId`. Components render THIS so an imposed form shows as active;
   *  the form TOGGLE still writes `char.activeFormId` (the base), so the transform stays an overlay. */
  activeFormId: string
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
  /** Fold a manually-entered d20 face into a check (Area R3). */
  manualD20: (label: string, mod: number, face: number, opts?: RollD20Opts) => void
  /** Record an IRL roll straight to the log (Area R5). */
  recordRoll: (label: string, total: number, opts?: { kind?: RollEntry['kind']; note?: string }) => void
  rollDmg: (label: string, diceExpr: string, opts?: RollDmgOpts) => void
  rollWeaponDamage: (item: InvItem, opts?: { crit?: boolean }) => void
  rollExpr: (label: string, expr: string, kind?: RollEntry['kind']) => void
  castSpell: (spell: Spell) => void
  activateFeature: (f: FeatureBlock) => void

  adjustHp: (delta: number) => void
  addActiveEffect: (ae: ActiveEffect) => void
  removeActiveEffect: (id: string) => void
  setResource: (id: string, current: number) => void
  setSpellSlot: (level: number, current: number) => void
  restoreSpellSlots: () => void
  shortRest: () => void
  longRest: () => void
  rollDeathSave: () => void
  rollConcentrationSave: () => void
  spendHitDie: () => void
}

const CharacterContext = createContext<Ctx | null>(null)

/** Hydrate a standalone/preview sheet from this character's own cache slot. `seed` is the
 *  bundled build for that character (passed by the caller); with no cache and no seed we
 *  return a blank sheet — never some other character's data. */
function loadInitial(characterId?: string, seed?: Character): Character {
  try {
    const raw = localStorage.getItem(storageKeyFor(characterId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.meta && parsed.abilities) return normalizeCharacter(parsed)
    }
  } catch {
    /* ignore */
  }
  return structuredClone(seed ?? blankCharacter(''))
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
/** The character's EFFECTIVE max HP (Slice 15): base + any `hp_max` effect (a Belt of Hill Giant
 *  Vitality, Aid). Heal clamps to THIS, and the sheet shows it — so a +HP item lets you heal to the
 *  higher max. It's an overlay: stored `maxHp` stays the base, so dropping the item re-derives you. */
const effMaxHp = (c: Character) => buildLedger(c).value('hp_max', c.combat.maxHp);

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
  system,
  preferences,
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
  /** The character's game system — passed to the ledger so system-scoped sources (species) apply
   *  only on the matching system (Ground Rule 1). Omitted → the ledger adds no species source. */
  system?: string
  /** The effective preferences (campaign DM ∩ player) that drive configurable mechanics — Area P/M/E/R/D.
   *  The single seam every swappable rule reads. Omitted → the full VANILLA set (resolvePreferences of the
   *  defaults), so a sheet opened outside a campaign behaves exactly as it always has. */
  preferences?: EffectivePreferences
}) {
  // Effective preferences, defaulting to the vanilla set when none were supplied (standalone sheet).
  const prefs: EffectivePreferences = preferences ?? resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES)
  // The exhaustion model + the character's edition decide how exhaustion bites a d20 test (Area M1). Edition
  // comes from the system key ('dnd5e-2014' → 2014); anything else (incl. 2024) uses the 2024 rules.
  const exhaustionModel = prefs.exhaustionModel.value
  const edition: Edition = system?.includes('2014') ? '2014' : '2024'
  // Auto-mechanics (Area R2): when ON (default), swappable mechanics like exhaustion fold into every d20 roll
  // automatically; when OFF, the sheet still SHOWS them but the player applies them by hand, so a roll uses no
  // auto-penalty (a tag reminds them). `noExh` is the no-op the fold sites use when auto is off.
  const autoMechanics = prefs.autoMechanics.value
  const dbMode = !!characterId
  // The character as first hydrated — the baseline `reset()` restores. Captured on the
  // initial load (DB or local) and never overwritten by later realtime/remote updates.
  // Declared before the state initializer below, which writes to it.
  const baselineRef = useRef<Character | null>(null)
  // In DB mode the real sheet arrives from the API on mount; until then show a neutral
  // BLANK character so no other character's content ever flashes. Preview/standalone mode
  // hydrates from this character's own cache slot, also falling back to blank.
  const [char, setCharState] = useState<Character>(() => {
    const initial = dbMode ? blankCharacter('') : loadInitial(characterId)
    // Standalone mode has no later hydrate, so its baseline is what we start with.
    if (!dbMode) baselineRef.current = structuredClone(initial)
    return initial
  })
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
      localStorage.setItem(storageKeyFor(characterId), JSON.stringify(char))
    } catch {
      /* ignore */
    }
  }, [char, dbMode, characterId])

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
        const loaded = normalizeCharacter(d)
        setCharState(loaded)
        // First successful load = the build "Reset to original" returns to.
        if (!baselineRef.current) baselineRef.current = structuredClone(loaded)
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
              setCharState(normalizeCharacter(d))
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

  // Live-reload signal (I3 / Slice 8): the bottom-right AI edit chat lives in a separate
  // React tree (page level), so after it applies an edit server-side it dispatches a
  // window event; the mounted sheet refetches the fresh data so the change shows live.
  useEffect(() => {
    if (!characterId) return
    const onReload = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail
      if (!detail || detail.id === characterId) void reloadFromDb()
    }
    window.addEventListener('dnd:reload-character', onReload)
    return () => window.removeEventListener('dnd:reload-character', onReload)
  }, [characterId, reloadFromDb])

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
              setCharState(normalizeCharacter(d))
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

  // "Reset to original build" restores THIS character's first-loaded state (the build the
  // sheet was hydrated with), not some other character's bundled data. Previously this
  // cloned Lazzuh over whatever sheet you were on — and in DB mode the autosave then
  // wrote him into that character's row.
  const reset = useCallback(() => {
    const baseline = baselineRef.current
    setCharState(structuredClone(baseline ?? blankCharacter(char.meta.name)))
    setRecklessActive(false)
  }, [char.meta.name])

  const importChar = useCallback((c: Character) => setCharState(structuredClone(c)), [])

  // ── The effect ledger (Slice 10) ────────────────────────────────────────────
  // Every number the sheet SHOWS comes from here, not straight off `char`. The engine could
  // already resolve item/feature effects, but nothing rendered called it — so an item's effects
  // were stored and then ignored. This is the join.
  //
  // Effects are OVERLAYS: `char` stays the base character forever. Unequipping is just dropping a
  // source and re-deriving, which is why reverting is free and can't corrupt the sheet.
  // `foldConditions` = the auto-mechanics toggle: ON folds active 5e conditions (Poisoned → disadvantage on
  // attacks/skills) into the ledger so they reach every roll + explain themselves; OFF is the vanilla roller.
  const ledger = useMemo(() => buildLedger(char, { system, exhaustionModel, foldConditions: autoMechanics }), [char, system, exhaustionModel, autoMechanics])

  // Effective ability scores: base + every active effect. Components read THESE, so a +2 belt
  // moves the score, its modifier, every skill using it, and its carrying capacity at once.
  const abilities = useMemo(() => {
    const out = { ...char.abilities }
    for (const k of Object.keys(out) as (keyof typeof out)[]) {
      out[k] = ledger.value(`ability_${k}`, char.abilities[k])
    }
    return out
  }, [char.abilities, ledger])

  const pb = useMemo(
    () => char.profBonusOverride ?? ledger.value('proficiency_bonus', profBonusForLevel(char.meta.level)),
    [char.profBonusOverride, char.meta.level, ledger],
  )

  // Effective active form (Slice 18): a transform effect's imposed form overlays the base one.
  const activeFormId = useMemo(() => ledger.transform()?.value ?? char.activeFormId, [ledger, char.activeFormId])

  // The lowest natural d20 that crits on attacks — 20 normally, widened by `crit_range` effects (Improved
  // Critical → 19, Superior → 18). The WIDEST source wins, so we take the min across contributions
  // (explain + min, sidestepping the ledger's set/add aggregation which would take the highest). Attack
  // rolls consult this; the Attacks table shows it so an expanded range isn't invisible.
  const critMin = useMemo(() => {
    // Take the min over ALL contributions, NOT the ledger's set-race survivor: `set` semantics keep the
    // HIGHEST value (marking the lower one suppressed), but for crit range the LOWEST wins (widest range).
    // Condition-gated effects that don't apply are already excluded upstream, so everything here is live.
    const vals = ledger
      .explain('crit_range')
      .filter((c) => typeof c.effect.value === 'number')
      .map((c) => Number(c.effect.value))
    return vals.length ? Math.max(2, Math.min(20, ...vals)) : 20
  }, [ledger])

  // Derived Armor Class — ONE source so the StatRail and the Combat panel can never disagree (Slice 13's
  // "one answer" rule). Equipped armor/shield + effective DEX + item/effect AC bonuses; falls back to the
  // manual `combat.ac` when nothing is equipped. Uses the effective DEX so a DEX item raises AC.
  const acInfo = useMemo(
    () => deriveAc(char.inventory, abilityMod(abilities.dex), char.combat.ac, char.activeEffects),
    [char.inventory, abilities.dex, char.combat.ac, char.activeEffects],
  )

  // The generic STR-based Save DC (8 + PB + STR, or the manual override) — derived once so the StatRail
  // and the Saves & Skills card can't disagree (they did: the rail honored the override, the card didn't).
  const saveDc = useMemo(
    () => char.combat.saveDCOverride ?? 8 + pb + abilityMod(abilities.str),
    [char.combat.saveDCOverride, pb, abilities.str],
  )
  // Single source for the SPELL save DC too — the SpellsPanel header and castSpell used to compute it
  // with the override + spell_save_dc effect folded in a DIFFERENT order, so the two disagreed when a
  // character had both. Both now read this. Effect folds on top of (override ?? 8 + PB + casting mod).
  const spellSaveDc = useMemo(() => {
    const sc = char.spellcasting
    const scMod = sc ? abilityMod(abilities[sc.ability]) : 0
    return ledger.value('spell_save_dc', char.combat.saveDCOverride ?? 8 + pb + scMod)
  }, [char.spellcasting, abilities, pb, ledger, char.combat.saveDCOverride])

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
      // Exhaustion (Area M1): the effective model + the character's edition decide how exhaustion bites a
      // d20 test. 2024 / the flat option = −2 per level on every test; 2014 vanilla = the tiered table's
      // DISADVANTAGE (ability checks at L1, attacks & saves at L3). The pure helper owns the rule; here we
      // fold its result into the roll's modifier and the advantage mode.
      const exh = char.combat.exhaustion || 0
      const exhKind = opts.kind === 'attack' ? 'attack' : opts.kind === 'save' ? 'save' : 'check'
      const exhEff = autoMechanics ? exhaustionD20Effect(exhKind, exh, edition, exhaustionModel) : NO_EXH
      const hasAdv = advMode === 'adv' || (recklessActive && !!opts.strMelee) || !!opts.advantage
      const hasDis = advMode === 'dis' || !!opts.disadvantage || exhEff.disadvantage
      const mode: Advantage = hasAdv && hasDis ? 'flat' : hasAdv ? 'adv' : hasDis ? 'dis' : 'flat'
      // Only attack rolls consult the crit range; a check or save always crits on a 20 only.
      const rollCritMin = opts.kind === 'attack' ? critMin : 20
      const r = rollD20(mod + exhEff.penalty, mode, rollCritMin)
      const tags: string[] = []
      if (recklessActive && opts.strMelee) tags.push('RECKLESS')
      if (opts.advantage) tags.push('ADV')
      if (exh > 0) {
        if (!autoMechanics) tags.push('EXH (apply manually)') // R2: auto-mechanics off → not folded, just flagged
        else if (exhEff.penalty) tags.push(`EXH ${exhEff.penalty}`)
        else if (exhEff.disadvantage) tags.push('EXH (dis)')
      }
      if (rollCritMin < 20) tags.push(`CRIT ${rollCritMin}–20`)
      if (opts.tag) tags.push(opts.tag)
      // What HELPED vs HURT this roll, by name — so the tray shows "disadvantage · Poisoned" (red). Exhaustion's
      // flat penalty / disadvantage joins the penalties; auto-mechanics-off shows nothing folded (vanilla roller).
      const penalties = [...(opts.disSources ?? [])]
      if (autoMechanics && exh > 0 && exhEff.penalty) penalties.push(`Exhaustion ${exhEff.penalty}`)
      else if (autoMechanics && exh > 0 && exhEff.disadvantage) penalties.push('Exhaustion (disadvantage)')
      const boosts = [...(opts.advSources ?? [])]
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
          penalties: penalties.length ? penalties : undefined,
          boosts: boosts.length ? boosts : undefined,
        },
        { landing: r.natural, min: 1, max: 20, isD20: true, crit: r.crit, fumble: r.fumble },
      )
    },
    [advMode, recklessActive, char.combat.exhaustion, critMin, stage, edition, exhaustionModel, autoMechanics],
  )

  // Manually-entered d20 (Area R3) — the player rolled a physical die and types the FACE; the sheet folds the
  // character's modifier + exhaustion and decides crit/fumble via foldD20, then stages it (landing on their
  // face) so the reveal + log read like any other check. No randomness; advantage doesn't apply (they chose).
  const manualD20 = useCallback(
    (label: string, mod: number, face: number, opts: RollD20Opts = {}) => {
      const exh = char.combat.exhaustion || 0
      const exhKind = opts.kind === 'attack' ? 'attack' : opts.kind === 'save' ? 'save' : 'check'
      const exhEff = autoMechanics ? exhaustionD20Effect(exhKind, exh, edition, exhaustionModel) : NO_EXH
      const rollCritMin = opts.kind === 'attack' ? critMin : 20
      const r = foldD20(face, mod + exhEff.penalty, rollCritMin)
      const tags: string[] = ['MANUAL']
      if (exh > 0) tags.push(autoMechanics && exhEff.penalty ? `EXH ${exhEff.penalty}` : autoMechanics ? '' : 'EXH (apply manually)')
      if (rollCritMin < 20) tags.push(`CRIT ${rollCritMin}–20`)
      if (opts.tag) tags.push(opts.tag)
      stage(
        { label, kind: opts.kind ?? 'check', total: r.total, breakdown: r.breakdown, crit: r.crit, fumble: r.fumble, mode: 'flat', tag: tags.filter(Boolean).join(' · ') || undefined },
        { landing: r.natural, min: 1, max: 20, isD20: true, crit: r.crit, fumble: r.fumble },
      )
    },
    [char.combat.exhaustion, critMin, stage, edition, exhaustionModel, autoMechanics],
  )

  // Record an IRL roll (Area R5) — the player rolled physical dice and just wants it in the log (result + what
  // it was for). No folding, no animation: it goes straight to the shared roll log like any committed roll.
  const recordRoll = useCallback(
    (label: string, total: number, opts: { kind?: RollEntry['kind']; note?: string } = {}) => {
      commitRoll({ label: label.trim() || 'IRL roll', kind: opts.kind ?? 'raw', total: Math.round(total || 0), breakdown: opts.note?.trim() || 'recorded (rolled in person)', tag: 'IRL' })
    },
    [commitRoll],
  )

  const rollDmg = useCallback(
    (label: string, diceExpr: string, opts: RollDmgOpts = {}) => {
      const dmg = rollDamage(diceExpr, opts.crit)
      const flat = opts.flat ?? 0
      const formBonus = opts.formBoosted && char.combat.transformActive ? char.combat.formDamageBonus : 0
      const total = dmg.total + flat + formBonus
      const parts = [dmg.breakdown]
      if (flat) parts.push(flat >= 0 ? `+${flat}` : `−${Math.abs(flat)}`)
      if (formBonus) parts.push(`+${formBonus} form`)
      const tags: string[] = []
      if (opts.crit) tags.push('CRIT ×2 DICE')
      if (formBonus) tags.push('TRANSFORMED')
      if (opts.tag) tags.push(opts.tag)
      // spin range roughly covers plausible totals
      const parsed = parseDice(diceExpr)
      const maxDie = parsed.groups.reduce((s, g) => s + Math.abs(g.count) * g.sides * (opts.crit ? 2 : 1), 0)
      stage(
        { label, kind: opts.kind ?? 'damage', total, breakdown: parts.join(' '), tag: tags.join(' · ') || undefined },
        { landing: total, min: Math.max(1, flat + formBonus + 1), max: Math.max(2, maxDie + flat + formBonus), isD20: false },
      )
    },
    [char.combat.transformActive, char.combat.formDamageBonus, stage],
  )

  // Roll a homebrew weapon's damage: primary (typed, + ability mod) plus any typed bonus dice
  // (e.g. +1d6 poison). Reports a per-type breakdown so the log shows how much of the hit was
  // each damage type. Adds the form damage bonus to the primary type while transformed.
  const rollWeaponDamage = useCallback(
    (item: InvItem, opts: { crit?: boolean } = {}) => {
      const w = item.weapon
      if (!w) return
      const abilityKey = w.ability ?? 'str'
      const mod = abilityMod(abilities[abilityKey]) // effective (Slice 10) — a STR/DEX item raises weapon damage
      const formBonus = item.tags?.includes('weapon') && char.combat.transformActive ? char.combat.formDamageBonus : 0
      // Fold the ledger's GLOBAL flat damage targets (damage_roll, and the magic-weapon attack_and_damage
      // +N) on top of ability + form. No-op without them; the weapon's own +N is w.bonus (per-weapon).
      const flat = mod + formBonus + ledger.value('damage_roll', 0) + ledger.value('attack_and_damage', 0)
      // Ledger-granted bonus damage DICE (Enlarge's +1d4, a flametongue's +1d6 fire) ride on top of the
      // weapon's own dice — a real rules mechanic that `damage_roll` (a flat number) can't express. Each
      // non-suppressed `weapon_bonus_dice` contribution parses to a typed segment and joins the roll.
      const bonusDice = ledger
        .explain('weapon_bonus_dice')
        .filter((c) => !c.suppressed && typeof c.effect.value === 'string')
        .map((c) => parseBonusDamageSegment(String(c.effect.value)))
        .filter((s): s is NonNullable<typeof s> => s != null)
      const segments = [...weaponSegments(w.damage, w.bonus, flat), ...bonusDice]
      const typed = rollTyped(segments, opts.crit)
      const tags: string[] = []
      if (opts.crit) tags.push('CRIT ×2 DICE')
      if (formBonus) tags.push('TRANSFORMED')
      if (bonusDice.length) tags.push('BONUS DICE')
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
    [abilities, char.combat.transformActive, char.combat.formDamageBonus, ledger, stage],
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
      // Effective spellcasting ability (Slice 10): a Headband of Intellect (Wizard) or a CHA item
      // (Sorcerer) must raise the spell save DC and spell attack, not just the ability pill. `pb` is the
      // ledger-effective proficiency, and the DC/attack fold their own `spell_save_dc`/`spell_attack`
      // effects on top.
      const mod = sc ? abilityMod(abilities[sc.ability]) : 0
      const saveDC = spellSaveDc // single source — matches the SpellsPanel header exactly
      const label = spell.alias ? `${spell.name} (“${spell.alias}”)` : spell.name
      if (spell.level > 0) {
        setCharState((c) => {
          const slot = c.spellcasting?.slots?.[spell.level as 1]
          if (!slot || slot.current <= 0) return c
          return { ...c, spellcasting: { ...c.spellcasting!, slots: { ...c.spellcasting!.slots, [spell.level]: { ...slot, current: slot.current - 1 } } } }
        })
      }
      // A spell with lasting effects (Bless, Mage Armor) SNAPSHOTS them into an ActiveEffect at cast
      // time (Slice 15/25) — so the ledger resolves them like any other source, and editing the spell
      // later never changes a buff already running. Re-casting replaces the same spell's effect
      // rather than stacking a second copy.
      if (spell.effects && spell.effects.length) {
        const ae: ActiveEffect = {
          id: `spell-${spell.id}`,
          label: spell.name,
          effects: spell.effects.map((e) => ({ ...e })),
          source: 'spell',
          ...(spell.effectDuration ? { duration: spell.effectDuration } : {}),
        }
        setCharState((c) => ({ ...c, activeEffects: [...(c.activeEffects ?? []).filter((x) => x.id !== ae.id), ae] }))
      }
      if (spell.attack) rollCheck(`${label} — spell attack`, ledger.value('spell_attack', pb + mod), { kind: 'attack' })
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
    [char.spellcasting, abilities, pb, ledger, spellSaveDc, rollCheck, rollExpr, stage, commitRoll],
  )

  // Use a class feature: spend its resource (if any) and roll/apply its effect (heal/temp HP
  // are applied; damage/raw just roll to the log). Makes Channel Divinity, Sponsorship, etc. usable.
  const activateFeature = useCallback(
    (f: FeatureBlock) => {
      const u = f.use
      if (!u) return
      if (u.resourceId) {
        setCharState((c) => ({ ...c, resources: c.resources.map((r) => (r.id === u.resourceId ? { ...r, current: Math.max(0, r.current - 1) } : r)) }))
      }
      const title = `${f.name} — ${u.label}`
      if (u.roll && (u.rollKind === 'heal' || u.rollKind === 'temp')) {
        const total = rollDamage(u.roll).total
        if (u.rollKind === 'heal') setCharState((c) => ({ ...c, combat: { ...c.combat, currentHp: Math.min(effMaxHp(c), c.combat.currentHp + total) } }))
        else setCharState((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(c.combat.tempHp, total) } }))
        commitRoll({ label: title, kind: u.rollKind, total, breakdown: `${u.roll} → ${u.rollKind === 'heal' ? `+${total} HP` : `${total} temp HP`}` })
      } else if (u.roll) {
        rollExpr(title, u.roll, u.rollKind === 'damage' ? 'damage' : 'raw')
      } else {
        commitRoll({ label: title, kind: 'raw', total: 0, breakdown: u.note ?? 'used' })
      }
    },
    [rollExpr, commitRoll],
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
      formHp: undefined, // a separateHp pool ends with the form (Slice 18)
      combat: { ...c.combat, transformActive: false, transformTurnsLeft: 0, abilityUses: {} },
    }))
  }, [])

  const nextTurn = useCallback(() => {
    setCharState((c) => {
      if (!c.combat.transformActive) return c
      const left = c.combat.transformTurnsLeft - 1
      if (left <= 0) {
        return { ...c, activeFormId: highestHeldId(c), formHp: undefined, combat: { ...c.combat, transformActive: false, transformTurnsLeft: 0, abilityUses: {} } }
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
  // proficiency (via pb), resource maxima, speed, hit dice, and max HP.
  const setLevel = useCallback((n: number) => {
    const level = Math.max(1, Math.min(MAX_BUILT_LEVEL, Math.round(n)))
    setRecklessActive(false)
    setCharState((c) => {
      const conMod = abilityMod(c.abilities.con)
      const lr = c.levelRules
      // Every derived stat comes from THIS character's own rules — its hit die, its speed
      // ladder, its form-damage ladder. A character that defines none keeps its values.
      const autoHp = lr?.autoHp !== false
      const maxHp = autoHp
        ? maxHpForLevel(level, conMod, lr?.hitDie ?? c.combat.hitDiceSize, lr?.bonusHpPerLevel ?? 0)
        : c.combat.maxHp
      const speed = speedForLevel(level, lr?.speedByLevel, c.combat.speed)
      const formDamageBonus = lr?.formDamageByLevel?.length
        ? lr.formDamageByLevel.reduce((acc, e) => (level >= e.level ? e.bonus : acc), 0)
        : c.combat.formDamageBonus
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
          formDamageBonus,
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
      // `separateHp` forms (Slice 18): while worn, the FORM has its own HP pool and takes the hit;
      // your base current/max HP stays frozen underneath. The pool is initialised LAZILY to the form's
      // effective max HP (its `hp_max` effect, resolved by the ledger) on first touch, so no form-entry
      // path has to seed it. When the pool empties the form ends and the overflow returns to you.
      const activeId = buildLedger(c).transform()?.value ?? c.activeFormId
      const activeForm = c.forms.find((f) => f.id === activeId)
      if (activeForm?.carryOver?.separateHp) {
        const poolMax = effMaxHp(c)
        const live = isFormHpLive(c.formHp, activeId) ? c.formHp : { formId: activeId, current: poolMax, max: poolMax }
        const res = routeFormDamage(live, c.combat.currentHp, delta)
        if (res.ended) {
          return { ...c, formHp: undefined, activeFormId: highestHeldId(c), combat: { ...c.combat, currentHp: res.baseCurrent, transformActive: false, transformTurnsLeft: 0, abilityUses: {} } }
        }
        return { ...c, formHp: res.form }
      }

      let cur = c.combat.currentHp
      let temp = c.combat.tempHp
      if (delta < 0) {
        const dmg = -delta
        const fromTemp = Math.min(temp, dmg)
        temp -= fromTemp
        cur = Math.max(0, cur - (dmg - fromTemp))
      } else {
        cur = Math.min(effMaxHp(c), cur + delta)
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

  // Spell-slot management: set one level's remaining slots, or restore all to max.
  const setSpellSlot = useCallback((level: number, current: number) => {
    setCharState((c) => {
      const slot = c.spellcasting?.slots?.[level as 1]
      if (!slot) return c
      return { ...c, spellcasting: { ...c.spellcasting!, slots: { ...c.spellcasting!.slots, [level]: { ...slot, current: Math.max(0, Math.min(slot.max, current)) } } } }
    })
  }, [])
  const restoreSpellSlots = useCallback(() => {
    setCharState((c) => (c.spellcasting?.slots
      ? { ...c, spellcasting: { ...c.spellcasting, slots: Object.fromEntries(Object.entries(c.spellcasting.slots).map(([lvl, s]) => [lvl, { ...s!, current: s!.max }])) } }
      : c))
  }, [])

  const shortRest = useCallback(() => {
    setCharState((c) => ({
      ...c,
      resources: c.resources.map((r) => (r.resetOn === 'short' ? { ...r, current: r.max } : r)),
    }))
  }, [])

  const longRestModel = prefs.longRestModel.value
  const longRest = useCallback(() => {
    setRecklessActive(false)
    setCharState((c) => ({
      ...c,
      combat: {
        ...c.combat,
        currentHp: c.combat.maxHp,
        tempHp: 0,
        // Hit dice restored per the campaign's long-rest model (Area M2). Vanilla (default) = full restore,
        // so a sheet with no preferences behaves exactly as before; 'half-hit-dice' is the 2014-RAW option.
        hitDiceRemaining: hitDiceAfterLongRest(c.combat.hitDiceTotal, c.combat.hitDiceRemaining, longRestModel),
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
      // Long rest restores every spell slot.
      spellcasting: c.spellcasting?.slots
        ? { ...c.spellcasting, slots: Object.fromEntries(Object.entries(c.spellcasting.slots).map(([lvl, s]) => [lvl, { ...s!, current: s!.max }])) }
        : c.spellcasting,
    }))
  }, [longRestModel])

  const rollDeathSave = useCallback(() => {
    // A death saving throw is a D20 Test (a save), so exhaustion applies here exactly as rollCheck applies it
    // to every other d20 — via the same model+edition helper (Area M1). Nat 20 / nat 1 still read the NATURAL
    // die, unaffected by any penalty.
    const exh = char.combat.exhaustion || 0
    const exhEff = autoMechanics ? exhaustionD20Effect('save', exh, edition, exhaustionModel) : NO_EXH
    // Fold the ledger's `death_save` target so an effect that grants a death-save bonus (a feat/item)
    // actually applies — like initiative folds `initiative`. No-op when nothing grants it.
    const bonus = ledger.value('death_save', char.combat.deathSaveBonus) + exhEff.penalty
    const r = rollD20(bonus, exhEff.disadvantage ? 'dis' : 'flat')
    // One source of truth for the outcome: the log label AND the tracked success/failure counts both come
    // from applyDeathSave, so they can't drift (nat 20 regain+reset, nat 1 two failures, ≥10 success, cap 3).
    const outcome = applyDeathSave(char.combat, r.natural, r.total)
    const tag = exh > 0
      ? `${outcome.label} · ${autoMechanics ? `EXH ${exhEff.penalty ? exhEff.penalty : '(dis)'}` : 'EXH (apply manually)'}`
      : outcome.label
    stage(
      { label: 'Death Save', kind: 'save', total: r.total, breakdown: r.breakdown, crit: r.natural === 20, fumble: r.natural === 1, tag },
      { landing: r.natural, min: 1, max: 20, isD20: true, crit: r.natural === 20, fumble: r.natural === 1 },
    )
    setCharState((c) => {
      const next = applyDeathSave(c.combat, r.natural, r.total)
      return { ...c, combat: { ...c.combat, deathSuccess: next.deathSuccess, deathFail: next.deathFail, currentHp: next.currentHp } }
    })
  }, [char.combat, ledger, stage, edition, exhaustionModel, autoMechanics])

  // A concentration save is a Constitution saving throw when you take damage while concentrating — DC 10,
  // or half the damage taken if that's higher (the DM sets the DC from the hit, so the roll shows the total
  // and the player compares). Folds the CON-save bonus PLUS the concentration-specific `concentration_save`
  // target (War Caster grants advantage on concentration saves SPECIFICALLY, not all CON saves), and reuses
  // rollCheck so exhaustion and the adv/dis cancellation apply exactly like every other save.
  const rollConcentrationSave = useCallback(() => {
    const s = char.saves?.con ?? { proficient: false, misc: 0 }
    const mod = abilityMod(abilities.con) + (s.proficient ? pb : 0) + (s.misc ?? 0)
      + ledger.value('con_saves', 0) + ledger.value('all_saves', 0) + ledger.value('concentration_save', 0)
    const targets = ['concentration_save', 'con_saves', 'all_saves']
    const advantage = targets.some((t) => ledger.rollFlags(t).advantage)
    const disadvantage = targets.some((t) => ledger.rollFlags(t).disadvantage)
    rollCheck('Concentration Save', mod, { kind: 'save', advantage, disadvantage, tag: 'DC 10 or ½ damage' })
  }, [char.saves, abilities.con, pb, ledger, rollCheck])

  const spendHitDie = useCallback(() => {
    if (char.combat.hitDiceRemaining <= 0) return
    // Effective CON (Slice 10): a CON-boosting item raises hit-die healing, like it raises max HP.
    const conMod = Math.floor((abilities.con - 10) / 2)
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
        currentHp: Math.min(effMaxHp(c), c.combat.currentHp + total),
      },
    }))
  }, [abilities.con, char.combat.hitDiceRemaining, char.combat.hitDiceSize, stage])

  const value: Ctx = {
    preferences: prefs,
    edition,
    char,
    abilities,
    ledger,
    setChar,
    reset,
    importChar,
    reloadFromDb,
    offline,
    pb,
    critMin,
    acInfo,
    saveDc,
    spellSaveDc,
    activeFormId,
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
    manualD20,
    recordRoll,
    rollDmg,
    rollWeaponDamage,
    rollExpr,
    castSpell,
    activateFeature,
    adjustHp,
    addActiveEffect,
    removeActiveEffect,
    setResource,
    setSpellSlot,
    restoreSpellSlots,
    shortRest,
    longRest,
    rollDeathSave,
    rollConcentrationSave,
    spendHitDie,
  }

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
}

export function useChar(): Ctx {
  const ctx = useContext(CharacterContext)
  if (!ctx) throw new Error('useChar must be used within CharacterProvider')
  return ctx
}
