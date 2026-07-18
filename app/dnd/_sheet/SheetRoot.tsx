'use client';
// SheetRoot — the Next client-component entry point for the vendored Lazzuh sheet
// (Phase C2). Replaces the standalone app's main.tsx: mounts CharacterProvider +
// App instead of ReactDOM.createRoot. Fed static data for now (the provider's
// loadInitial falls back to the bundled `lazzuh` character); the DB-backed store
// arrives in C3, and this becomes the canonical /dnd/Lazzuh_Gun render in C6.
import { CharacterProvider } from './state/store';
import App from './App';
import CustomSheet from './components/CustomSheet';
import InteractiveSheet from './components/InteractiveSheet';
import { hasCustomLayout, layoutHasInteractive } from '@/lib/dnd/custom-sheet';
import type { SheetTheme } from './theme';
import type { EffectivePreferences } from '@/lib/dnd/preferences';

// characterId → DB-backed load/save (C3). sheetType → registry-driven skin + modules
// (C7/C8). theme → explicit override (wins over the sheet_type's theme). Omit
// characterId for the static preview.
export default function SheetRoot({
  characterId,
  campaignId,
  sheetType,
  system,
  theme,
  isDM,
  canWrite,
  customLayout,
  customCss,
  preferences,
}: {
  characterId?: string;
  campaignId?: string;
  sheetType?: string;
  /** The character's game system. Scopes the glossary the sheet links its rules to — a term
   *  must resolve against THIS system's article or none at all. */
  system?: string;
  theme?: SheetTheme;
  /** DM mode (§6.8.1) — surfaces the DM override panel + full edit control. */
  isDM?: boolean;
  /** Viewer can edit this character (owner OR DM) — enables the art uploader. */
  canWrite?: boolean;
  /** AI-built custom sheet blocks (Slice 6) — when present (and `sheet_type` is
   *  `custom`) the sheet renders from these in a sandboxed iframe instead of the engine. */
  customLayout?: unknown;
  customCss?: string | null;
  /** Effective preferences (campaign DM ∩ player) for configurable mechanics (Area P2c). Forwarded to the
   *  store; omitted → the store's vanilla default, so a standalone/preview sheet is unchanged. */
  preferences?: EffectivePreferences;
}) {
  // A custom (AI-composed) sheet takes over rendering when it has valid blocks. If it
  // contains interactive widgets (Slice 11), render it via React inside the provider so
  // the inputs bind to the character data and persist; otherwise render the static,
  // sandboxed-iframe presentation (Slice 6).
  if (sheetType === 'custom' && hasCustomLayout(customLayout)) {
    if (layoutHasInteractive(customLayout)) {
      return (
        <CharacterProvider characterId={characterId} campaignId={campaignId} isDM={isDM} canWrite={canWrite} system={system} preferences={preferences}>
          <div className="dnd-sheet skin-hextech" style={{ padding: 16 }}>
            <InteractiveSheet layout={customLayout} />
          </div>
        </CharacterProvider>
      );
    }
    return <CustomSheet layout={customLayout} css={customCss} />;
  }
  return (
    <CharacterProvider characterId={characterId} campaignId={campaignId} isDM={isDM} canWrite={canWrite} system={system}>
      <App sheetType={sheetType} system={system} theme={theme} />
    </CharacterProvider>
  );
}
