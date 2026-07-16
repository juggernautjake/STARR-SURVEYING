'use client'
// Exposes the character's registry config (its sheet_type's skin + modules) to the whole
// sheet tree. App already resolved it; before this, only App could gate on it, so shared
// components rendered character-specific mechanics (Lazzuh's Surge tray, his Reckless
// callout) on EVERY sheet. Components now ask `useSheetModule('reckless')` instead.
import { createContext, useContext, useMemo } from 'react'
import { getSheetConfig, type SheetModuleId, type SheetTypeConfig } from '../registry'

const SheetConfigContext = createContext<SheetTypeConfig | null>(null)

export function SheetConfigProvider({ sheetType, children }: { sheetType?: string; children: React.ReactNode }) {
  const config = useMemo(() => getSheetConfig(sheetType), [sheetType])
  return <SheetConfigContext.Provider value={config}>{children}</SheetConfigContext.Provider>
}

/** The active sheet_type's config. Falls back to the generic/default config when no
 *  provider is mounted (standalone previews, tests), so callers never crash. */
export function useSheetConfig(): SheetTypeConfig {
  return useContext(SheetConfigContext) ?? getSheetConfig(undefined)
}

/** True when this character's sheet_type registers `id`. Use to gate any character-only
 *  mechanic in shared components. */
export function useSheetModule(id: SheetModuleId): boolean {
  return useSheetConfig().modules.includes(id)
}
