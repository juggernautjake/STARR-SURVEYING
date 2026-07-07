'use client';
// SheetRoot — the Next client-component entry point for the vendored Lazzuh sheet
// (Phase C2). Replaces the standalone app's main.tsx: mounts CharacterProvider +
// App instead of ReactDOM.createRoot. Fed static data for now (the provider's
// loadInitial falls back to the bundled `lazzuh` character); the DB-backed store
// arrives in C3, and this becomes the canonical /dnd/Lazzuh_Gun render in C6.
import { CharacterProvider } from './state/store';
import App from './App';
import type { SheetTheme } from './theme';

// characterId → DB-backed load/save (C3). sheetType → registry-driven skin + modules
// (C7/C8). theme → explicit override (wins over the sheet_type's theme). Omit
// characterId for the static preview.
export default function SheetRoot({
  characterId,
  campaignId,
  sheetType,
  theme,
  isDM,
}: {
  characterId?: string;
  campaignId?: string;
  sheetType?: string;
  theme?: SheetTheme;
  /** DM mode (§6.8.1) — surfaces the DM override panel + full edit control. */
  isDM?: boolean;
}) {
  return (
    <CharacterProvider characterId={characterId} campaignId={campaignId} isDM={isDM}>
      <App sheetType={sheetType} theme={theme} />
    </CharacterProvider>
  );
}
