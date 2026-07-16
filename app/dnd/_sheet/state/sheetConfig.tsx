'use client'
// Exposes the character's registry config (its sheet_type's skin + modules) to the whole
// sheet tree. App already resolved it; before this, only App could gate on it, so shared
// components rendered character-specific mechanics (Lazzuh's Surge tray, his Reckless
// callout) on EVERY sheet. Components now ask `useSheetModule('reckless')` instead.
import { createContext, useContext, useMemo } from 'react'
import { getSheetConfig, type SheetModuleId, type SheetTypeConfig } from '../registry'
import { SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'

interface SheetContextValue {
  config: SheetTypeConfig
  /** The character's game system. Scopes the glossary its rules link to — a term must never
   *  resolve against another system's article, so this is required, not inferred. */
  system: string
}

const SheetConfigContext = createContext<SheetContextValue | null>(null)

export function SheetConfigProvider({
  sheetType,
  system,
  children,
}: {
  sheetType?: string
  system?: string
  children: React.ReactNode
}) {
  const value = useMemo(
    () => ({ config: getSheetConfig(sheetType), system: system || SYSTEM_AMBIGUOUS }),
    [sheetType, system],
  )
  return <SheetConfigContext.Provider value={value}>{children}</SheetConfigContext.Provider>
}

/** The active sheet_type's config. Falls back to the generic/default config when no
 *  provider is mounted (standalone previews, tests), so callers never crash. */
export function useSheetConfig(): SheetTypeConfig {
  return useContext(SheetConfigContext)?.config ?? getSheetConfig(undefined)
}

/** The character's system, or 'ambiguous' when it has none. Never guesses: an ambiguous
 *  character gets no rule links, because linking to some other system's glossary would be
 *  worse than linking to nothing. */
export function useSheetSystem(): string {
  return useContext(SheetConfigContext)?.system ?? SYSTEM_AMBIGUOUS
}

/** True when this character's sheet_type registers `id`. Use to gate any character-only
 *  mechanic in shared components. */
export function useSheetModule(id: SheetModuleId): boolean {
  return useSheetConfig().modules.includes(id)
}
