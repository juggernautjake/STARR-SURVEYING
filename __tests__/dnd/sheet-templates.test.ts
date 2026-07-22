// The template (format) registry + picker seam (T-1). The template axis made first-class:
// a per-system list of BUILT formats, honestly reported so the picker never offers a format a
// system cannot render.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHEET_TEMPLATES, templatesForSystem, isTemplateBuiltFor, sheetTemplate } from '@/lib/dnd/sheet-templates';
import { availableSystems } from '@/lib/dnd/systems';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('sheet-templates registry', () => {
  it('every available system offers at least Classic, in canonical order', () => {
    for (const s of availableSystems()) {
      const list = templatesForSystem(s.key);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].id).toBe('classic'); // classic is always the baseline + first
      // Canonical order preserved (not insertion/alpha).
      const ids = list.map((t) => t.id);
      const canonical = SHEET_TEMPLATES.map((t) => t.id).filter((id) => ids.includes(id));
      expect(ids).toEqual(canonical);
    }
  });

  it('5e offers all four formats; PF2 offers Classic + Codex; IG offers Classic (honest coverage)', () => {
    expect(templatesForSystem('dnd5e-2024').map((t) => t.id)).toEqual(['classic', 'codex', 'dashboard', 'play']);
    expect(templatesForSystem('dnd5e-2014').map((t) => t.id)).toEqual(['classic', 'codex', 'dashboard', 'play']);
    expect(templatesForSystem('pathfinder2e').map((t) => t.id)).toEqual(['classic', 'codex']);
    expect(templatesForSystem('intuitive-games').map((t) => t.id)).toEqual(['classic']);
  });

  it('isTemplateBuiltFor validates against the system, not the global list', () => {
    // Dashboard exists globally, but is NOT built for PF2 yet — the endpoint must refuse it there.
    expect(isTemplateBuiltFor('dnd5e-2024', 'dashboard')).toBe(true);
    expect(isTemplateBuiltFor('pathfinder2e', 'codex')).toBe(true); // T-5b wired it
    expect(isTemplateBuiltFor('pathfinder2e', 'dashboard')).toBe(false);
    expect(isTemplateBuiltFor('intuitive-games', 'codex')).toBe(false);
    expect(isTemplateBuiltFor('pathfinder2e', 'classic')).toBe(true);
    expect(isTemplateBuiltFor('dnd5e-2024', 'nonsense')).toBe(false);
  });

  it('every offered template id resolves to a real template with a wireframe preview', () => {
    for (const t of SHEET_TEMPLATES) {
      expect(sheetTemplate(t.id)).toBeTruthy();
      expect(t.wireframe.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('the layout endpoint validates against the system before writing', () => {
    // The write must be gated by isTemplateBuiltFor, not trust the request body.
    const route = read('app/api/dnd/characters/[id]/layout/route.ts');
    expect(route).toContain('isTemplateBuiltFor');
    expect(route).toContain('requireCharacterWrite');
  });

  it('SheetLayout type and the registry ids agree', () => {
    // The engine type and the picker registry are two encodings of one set; a drift would let the
    // picker offer a layout the engine cannot switch to.
    const types = read('app/dnd/_sheet/types.ts');
    for (const t of SHEET_TEMPLATES) expect(types).toContain(`'${t.id}'`);
  });
});

describe('Dashboard format (T-3)', () => {
  it('is offered for 5e and branches in the engine', () => {
    expect(templatesForSystem('dnd5e-2024').map((t) => t.id)).toContain('dashboard');
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain('isDashboard');
    expect(app).toContain('DashboardLayout');
  });

  it('shares the 5e panel set rather than duplicating it', () => {
    // Dashboard reads the same `useFivePanels()` source a format shell must consume — so it can
    // never drift from the other formats about which sections exist.
    const dash = read('app/dnd/_sheet/codex/DashboardLayout.tsx');
    expect(dash).toContain('useFivePanels');
  });

  it('is a pure system-agnostic shell fed by a 5e adapter (T-SHELL)', () => {
    // The format lives in DashboardShell, which must know nothing about any system: no store hooks,
    // no 5e components — only the {identity, panels, roller, above} it is handed. The 5e adapter
    // (DashboardLayout) computes those and passes them in, so PF2/IG can feed the same shell.
    const shell = read('app/dnd/_sheet/shells/DashboardShell.tsx')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(shell).not.toMatch(/useChar|useFivePanels|IdentityColumn|DiceTray/);
    expect(shell).toContain('panels: SheetPanel[]');
    const adapter = read('app/dnd/_sheet/codex/DashboardLayout.tsx');
    expect(adapter).toContain("from '../shells/DashboardShell'");
    expect(adapter).toContain('DashboardShell');
  });

  it('carries no skin-specific Dashboard rule — skins theme it for free', () => {
    const css = read('app/dnd/_sheet/styles/codex.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.skin-[a-z0-9-]+\s+\.dash/);
    expect(css).toContain('.dash-grid');
  });
});

describe('Play format (T-4)', () => {
  it('is offered for 5e and branches in the engine', () => {
    expect(templatesForSystem('dnd5e-2014').map((t) => t.id)).toContain('play');
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain('isPlay');
    expect(app).toContain('PlayLayout');
    expect(app).toContain("import './styles/play.css'");
  });

  it('leads with the reused vitals + attacks and drawers the rest of the shared set', () => {
    const play = read('app/dnd/_sheet/codex/PlayLayout.tsx');
    // Correctness by reuse, not re-implementation: the same CombatPanel/Attacks own the numbers, and
    // the drawer is the shared panel set with the hero panels removed.
    expect(play).toContain('useFivePanels');
    expect(play).toContain('CombatPanel');
    expect(play).toContain('Attacks');
    expect(play).toMatch(/HERO_PANELS[\s\S]*combat[\s\S]*attacks/);
  });

  it('carries no skin-specific Play rule — skins theme it for free', () => {
    const css = read('app/dnd/_sheet/styles/play.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.skin-[a-z0-9-]+\s+\.play/);
    expect(css).toContain('.play-ref-body');
  });

  it('is a pure system-agnostic shell fed by a 5e adapter (T-SHELL)', () => {
    // Play's hero is system-specific, so PlayShell takes a ready-made `hero` node + the `drawerPanels`
    // rather than a flat panel list. The shell must know nothing about any system: no store hooks, no
    // 5e components — only the slots it is handed. The 5e adapter (PlayLayout) builds those.
    const shell = read('app/dnd/_sheet/shells/PlayShell.tsx')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(shell).not.toMatch(/useChar|useFivePanels|CombatPanel|Attacks|DiceTray/);
    expect(shell).toContain('drawerPanels: SheetPanel[]');
    const adapter = read('app/dnd/_sheet/codex/PlayLayout.tsx');
    expect(adapter).toContain("from '../shells/PlayShell'");
    expect(adapter).toContain('CombatPanel'); // the 5e hero still lives in the adapter
  });
});
