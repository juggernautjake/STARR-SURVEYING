'use client';
// SheetRoot — the Next client-component entry point for the vendored Lazzuh sheet
// (Phase C2). Replaces the standalone app's main.tsx: mounts CharacterProvider +
// App instead of ReactDOM.createRoot. Fed static data for now (the provider's
// loadInitial falls back to the bundled `lazzuh` character); the DB-backed store
// arrives in C3, and this becomes the canonical /dnd/Lazzuh_Gun render in C6.
import { CharacterProvider } from './state/store';
import App from './App';
import CustomSheet from './components/CustomSheet';
import { hasCustomLayout } from '@/lib/dnd/custom-sheet';
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
  canWrite,
  customLayout,
  customCss,
}: {
  characterId?: string;
  campaignId?: string;
  sheetType?: string;
  theme?: SheetTheme;
  /** DM mode (§6.8.1) — surfaces the DM override panel + full edit control. */
  isDM?: boolean;
  /** Viewer can edit this character (owner OR DM) — enables the art uploader. */
  canWrite?: boolean;
  /** AI-built custom sheet blocks (Slice 6) — when present (and `sheet_type` is
   *  `custom`) the sheet renders from these in a sandboxed iframe instead of the engine. */
  customLayout?: unknown;
  customCss?: string | null;
}) {
  // A custom (AI-composed) sheet takes over rendering when it has valid blocks. It's a
  // pure presentation layer today (Slice 6); binding blocks to the live store for
  // editable inputs is a later slice, so it doesn't need the provider yet.
  if (sheetType === 'custom' && hasCustomLayout(customLayout)) {
    return <CustomSheet layout={customLayout} css={customCss} />;
  }
  return (
    <CharacterProvider characterId={characterId} campaignId={campaignId} isDM={isDM} canWrite={canWrite}>
      <App sheetType={sheetType} theme={theme} />
    </CharacterProvider>
  );
}
