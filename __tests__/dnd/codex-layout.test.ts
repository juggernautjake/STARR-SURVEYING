// Codex layout (CX-1 … CX-9) — the pane arithmetic, the per-system descriptor, and the seam.
//
// The arithmetic tests assert resulting HEIGHTS rather than "a function was called", because the
// opening rule is exactly the kind of thing that looks right and is off by one pane at the
// boundaries. The descriptor tests exist because the identity column is a brand-new place for
// edition bleed, and the whole point of routing it through a descriptor is that the rule can be
// asserted in one place instead of hoped for at every render site.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COLLAPSED_H,
  DEFAULT_PANE_H,
  MIN_PANE_H,
  capPaneToContent,
  closePane,
  neededPaneHeight,
  openPane,
  renderedHeight,
  resizePane,
  shrinkToFit,
  soloPane,
  stackHeight,
  toggleCollapse,
  type Pane,
} from '@/app/dnd/_sheet/codex/paneMath'
import { codexDescriptorFor, describedSystems } from '@/app/dnd/_sheet/codex/descriptor'
import { densityFor } from '@/app/dnd/_sheet/codex/PaneStack'
import { availableSystems } from '@/lib/dnd/systems'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const ORDER = ['skills', 'abilities', 'combat', 'attacks', 'spells', 'features', 'gear', 'story']

describe('paneMath — opening (accordion model, D-11)', () => {
  it('opens Skills alone at the default height', () => {
    const panes = openPane([], 'skills', ORDER)
    expect(panes).toEqual([{ id: 'skills', height: DEFAULT_PANE_H }])
  })

  it('is idempotent — opening an already-open pane changes nothing', () => {
    const first = openPane([], 'skills', ORDER)
    expect(openPane(first, 'skills', ORDER)).toBe(first)
  })

  it('inserts in CANONICAL order, not click order', () => {
    // Open gear, then combat. Combat comes earlier in ORDER, so it must land ABOVE gear even
    // though it was clicked second — a player reaching for a pane should find it in a fixed spot.
    let panes = openPane([], 'gear', ORDER)
    panes = openPane(panes, 'combat', ORDER)
    expect(panes.map((p) => p.id)).toEqual(['combat', 'gear'])
  })

  it('does NOT shrink the existing panes — each keeps its height, the column just grows (push-down)', () => {
    // The accordion pushes lower sections DOWN rather than squeezing every pane into a fixed viewport;
    // each section is later measured to its own content height (capPaneToContent).
    let panes = openPane([], 'skills', ORDER)
    panes = openPane(panes, 'combat', ORDER)
    panes = openPane(panes, 'gear', ORDER)
    for (const p of panes) expect(p.height).toBe(DEFAULT_PANE_H) // every pane at its default, none squeezed
    expect(panes.map((p) => p.id)).toEqual(['skills', 'combat', 'gear'])
  })
})

describe('paneMath — shrinkToFit', () => {
  it('leaves a fitting stack untouched, by identity', () => {
    const panes: Pane[] = [{ id: 'a', height: 200 }, { id: 'b', height: 200 }]
    expect(shrinkToFit(panes, 900)).toBe(panes)
  })

  it('takes the same FRACTION of slack from each pane, not the same pixels', () => {
    // Slack is height above MIN_PANE_H (120): a has 480, b has 180, total 660. Fitting 900 into
    // 700 must reclaim 200, i.e. 200/660 ≈ 30.3% of each pane's slack — a gives up ~145 (→455),
    // b gives up ~55 (→245). The point is the RATIO of the losses (480:180 ≈ 2.7:1) tracking the
    // ratio of the slack, not the sizes being any particular round number.
    const panes: Pane[] = [{ id: 'a', height: 600 }, { id: 'b', height: 300 }]
    const out = shrinkToFit(panes, 700)
    expect(out.map((p) => p.height)).toEqual([455, 245])
    expect(stackHeight(out)).toBe(700)
    // Equal-PIXEL shrinking would have taken 100 from each (500/200), pushing the smaller pane
    // most of the way to its minimum while the larger one barely moved. Assert that we did not.
    expect(out[1].height).toBeGreaterThan(200)
  })

  it('never returns a pane below the minimum', () => {
    const panes: Pane[] = [{ id: 'a', height: 600 }, { id: 'b', height: 600 }]
    for (const p of shrinkToFit(panes, 50)) expect(p.height).toBeGreaterThanOrEqual(MIN_PANE_H)
  })

  it('treats collapsed panes as fixed furniture that cannot give height up', () => {
    const panes: Pane[] = [
      { id: 'a', height: 600 },
      { id: 'b', height: 400, collapsed: true },
    ]
    const out = shrinkToFit(panes, 500)
    // b stays collapsed at its stored height; only a shrinks, down to 500 - COLLAPSED_H.
    expect(out[1]).toEqual(panes[1])
    expect(out[0].height).toBe(500 - COLLAPSED_H)
  })

  it('accounts for the inter-pane gap', () => {
    const panes: Pane[] = [{ id: 'a', height: 400 }, { id: 'b', height: 400 }]
    const out = shrinkToFit(panes, 600, 10)
    expect(stackHeight(out, 10)).toBeLessThanOrEqual(600)
  })
})

describe('paneMath — the other operations', () => {
  it('closing a pane leaves the others at the size the player set', () => {
    // Deliberate: growing a hand-sized pane because a different one closed would be the layout
    // overriding an explicit choice.
    const panes: Pane[] = [{ id: 'a', height: 500 }, { id: 'b', height: 200 }]
    expect(closePane(panes, 'a')).toEqual([{ id: 'b', height: 200 }])
  })

  it('resizing clamps to the minimum and only touches the pane you grabbed', () => {
    const panes: Pane[] = [{ id: 'a', height: 400 }, { id: 'b', height: 400 }]
    const out = resizePane(panes, 'a', 10)
    expect(out[0].height).toBe(MIN_PANE_H)
    expect(out[1].height).toBe(400)
  })

  it('resizing an expanded-from-collapsed pane clears the collapsed state', () => {
    // Otherwise dragging a collapsed pane appears to do nothing: the stored height changes while
    // the rendered height stays pinned at COLLAPSED_H.
    const out = resizePane([{ id: 'a', height: 300, collapsed: true }], 'a', 500)
    expect(out[0].collapsed).toBe(false)
    expect(renderedHeight(out[0])).toBe(500)
  })

  it('collapsing PRESERVES the stored height so expanding restores the player’s size', () => {
    const collapsed = toggleCollapse([{ id: 'a', height: 517 }], 'a')
    expect(renderedHeight(collapsed[0])).toBe(COLLAPSED_H)
    expect(collapsed[0].height).toBe(517) // not clobbered
    expect(renderedHeight(toggleCollapse(collapsed, 'a')[0])).toBe(517)
  })

  it('solo collapses the others WITHOUT closing them', () => {
    const panes: Pane[] = [{ id: 'a', height: 300 }, { id: 'b', height: 300 }, { id: 'c', height: 300 }]
    const out = soloPane(panes, 'b', 900)
    expect(out).toHaveLength(3) // nothing closed — the assembled set survives
    expect(out.filter((p) => p.collapsed).map((p) => p.id)).toEqual(['a', 'c'])
    expect(out.find((p) => p.id === 'b')!.height).toBe(900 - 2 * COLLAPSED_H)
  })
})

describe('content-height cap (D-11 — a section opens at content height, only shrinks)', () => {
  it('first measure OPENS the pane at its content height — short content shrinks the default', () => {
    const [p] = capPaneToContent([{ id: 'skills', height: DEFAULT_PANE_H }], 'skills', 210)
    expect(p.max).toBe(210)
    expect(p.height).toBe(210) // opened at content (down from the 380 default)
  })

  it('first measure OPENS at content height even when content is TALLER than the default', () => {
    const [p] = capPaneToContent([{ id: 'spells', height: DEFAULT_PANE_H }], 'spells', 900)
    expect(p.max).toBe(900)
    expect(p.height).toBe(900) // opens tall enough to reveal all content, not stuck at 380
  })

  it('never caps below the minimum (a tiny section stays grabbable)', () => {
    const [p] = capPaneToContent([{ id: 's', height: 300 }], 's', 40)
    expect(p.max).toBe(MIN_PANE_H)
    expect(p.height).toBe(MIN_PANE_H)
  })

  it('a LATER measure keeps the player-chosen size, only re-capping it', () => {
    // Pane already measured once (max set) and shrunk by the player to 150; content grows to 500.
    const [p] = capPaneToContent([{ id: 's', height: 150, max: 380 }], 's', 500)
    expect(p.max).toBe(500)
    expect(p.height).toBe(150) // the player's size is preserved, not re-opened to content
  })

  it('resizePane never grows a pane past its content-height cap, only shrinks', () => {
    const capped: Pane[] = [{ id: 's', height: 200, max: 260 }]
    expect(resizePane(capped, 's', 999)[0].height).toBe(260) // clamped up-drag to the cap
    expect(resizePane(capped, 's', 140)[0].height).toBe(140) // shrinking is allowed
    expect(resizePane(capped, 's', 10)[0].height).toBe(MIN_PANE_H) // still floored at the minimum
  })
})

describe('neededPaneHeight (Part A — content + chrome, so the open pane never clips)', () => {
  it('adds the chrome outside the body AND the body padding to the content', () => {
    // 300px of content + (header+grab+borders = 46) + (10+10 body padding = 20) → 366 + 2 breathing = 368.
    expect(neededPaneHeight(300, 46, 20)).toBe(368)
  })

  it('is why the old measurement clipped: content ALONE is ~66px short of the needed pane height', () => {
    const content = 500
    const needed = neededPaneHeight(content, 46, 20)
    expect(needed).toBeGreaterThan(content) // the pane must be TALLER than the content it holds
    expect(needed - content).toBe(68) // 46 chrome + 20 padding + 2 breathing — the clipped stretch
  })

  it('clamps negative/zero inputs so a transient 0 measurement never yields a negative height', () => {
    expect(neededPaneHeight(0, 0, 0)).toBe(2)
    expect(neededPaneHeight(-50, -10, -10)).toBe(2)
  })

  it('rounds up so a fractional content height never leaves a sub-pixel scroll', () => {
    expect(neededPaneHeight(300.4, 45.6, 20)).toBe(368) // ceil(300.4+45.6+20)=366, +2
  })
})

describe('density tiers', () => {
  it('maps heights to the four tiers at the documented boundaries', () => {
    expect(densityFor(300, true)).toBe('collapsed')
    expect(densityFor(200)).toBe('short')
    expect(densityFor(201)).toBe('medium')
    expect(densityFor(420)).toBe('medium')
    expect(densityFor(421)).toBe('tall')
  })

  it('agrees with the @container breakpoints in codex.css', () => {
    // The JS tiers and the CSS breakpoints are two encodings of one decision. If they drift, a
    // pane gets `data-density="short"` while the stylesheet still gives it the medium treatment,
    // and the mismatch is invisible until someone screenshots it.
    const css = read('app/dnd/_sheet/styles/codex.css')
    expect(css).toContain('@container codexpane (max-height: 200px)')
    expect(css).toContain('@container codexpane (min-height: 201px) and (max-height: 420px)')
  })
})

describe('per-system descriptor — the anti-bleed contract', () => {
  it('every AVAILABLE system has a real descriptor, not the fallback', () => {
    // The fallback is a safety net for unknown systems, not a resting place for the four systems
    // the platform actually ships. A new available system with no entry is caught here.
    const described = describedSystems()
    for (const s of availableSystems()) expect(described).toContain(s.key)
  })

  it('names the species field the way each system’s own book does', () => {
    expect(codexDescriptorFor('dnd5e-2014').speciesLabel).toBe('Race')
    expect(codexDescriptorFor('dnd5e-2024').speciesLabel).toBe('Species')
    expect(codexDescriptorFor('pathfinder2e').speciesLabel).toBe('Ancestry')
  })

  it('gives 5e-only mechanics to 5e ONLY', () => {
    // The bleed this file exists to prevent: Inspiration, death saves, hit dice and Passive
    // Perception are 5e's, and rendering any of them on a PF2 or IG sheet would be the identity
    // column inventing mechanics those systems do not have.
    for (const ed of ['dnd5e-2014', 'dnd5e-2024']) {
      const d = codexDescriptorFor(ed)
      expect(d.inspiration).toBe(true)
      expect(d.deathSaves).toBe(true)
      expect(d.hitDice).toBe(true)
      expect(d.passivePerception).toBe(true)
      expect(d.rests).not.toBeNull()
    }
    for (const other of ['pathfinder2e', 'intuitive-games']) {
      const d = codexDescriptorFor(other)
      expect(d.inspiration).toBe(false)
      expect(d.deathSaves).toBe(false)
      expect(d.hitDice).toBe(false)
      expect(d.passivePerception).toBe(false)
      expect(d.rests).toBeNull()
    }
  })

  it('tells the player where a suppressed system’s own numbers live', () => {
    // An absent block with no explanation reads as the sheet having forgotten, which is why
    // suppression is paired with a pointer rather than silence.
    for (const other of ['pathfinder2e', 'intuitive-games']) {
      expect(codexDescriptorFor(other).bespokeSheetNote).toBeTruthy()
    }
    expect(codexDescriptorFor('dnd5e-2024').bespokeSheetNote).toBeNull()
  })

  it('falls back CONSERVATIVELY for an unknown or ambiguous system', () => {
    // Showing a control a system may not have is worse than omitting one it does, so the
    // fallback turns 5e's extras off rather than on.
    for (const unknown of [undefined, 'ambiguous', 'coc7e', 'blades']) {
      const d = codexDescriptorFor(unknown)
      expect(d.inspiration).toBe(false)
      expect(d.deathSaves).toBe(false)
      expect(d.rests).toBeNull()
    }
  })

  it('does NOT model Hero Points or stances — the honest omission is deliberate', () => {
    // Recorded as a test so the next reader who notices the gap finds the reasoning instead of
    // "fixing" it with a control backed by no field on the 5e-shaped Character.
    const src = read('app/dnd/_sheet/codex/descriptor.ts')
    expect(src).toMatch(/heroPoints.*deliberately NOT fields|deliberately NOT fields here/s)
    const iface = src.slice(src.indexOf('export interface CodexDescriptor'), src.indexOf('/** 5e'))
    expect(iface).not.toMatch(/\bheroPoints\b\s*:/)
    expect(iface).not.toMatch(/\bstances\b\s*:/)
  })
})

describe('the layout seam (CX-1)', () => {
  it('defaults to classic, so no existing character is changed', () => {
    const types = read('app/dnd/_sheet/types.ts')
    // SheetLayout now carries the fuller template set (classic/codex/dashboard/play, T-1); the point
    // this test protects is that 'classic' and 'codex' are still both in it and classic is the default.
    expect(types).toMatch(/export type SheetLayout = 'classic' \| 'codex'/)
    expect(types).toContain('sheetLayout?: SheetLayout')
    const app = read('app/dnd/_sheet/App.tsx')
    // The layout is derived once (`const layout = char.sheetLayout ?? 'classic'`) and each format is
    // a boolean off it; the classic default is still the `?? 'classic'` fallback, so an existing
    // character with no stored layout renders classic exactly as before.
    expect(app).toMatch(/char\.sheetLayout \?\? 'classic'/)
    expect(app).toMatch(/layout === 'codex'/)
  })

  it('branches INSIDE the themed root, so every skin applies to the Codex', () => {
    // This is the load-bearing structural claim: the skin class and the theme CSS variables live
    // on the `.dnd-sheet` wrapper, so the Codex must render inside it. Branching above that
    // wrapper would silently drop skins on the Codex — visible only by eye, on one layout.
    const app = read('app/dnd/_sheet/App.tsx')
    const rootAt = app.indexOf('className={rootClass}')
    const branchAt = app.indexOf('isCodex ? (')
    expect(rootAt).toBeGreaterThan(-1)
    expect(branchAt).toBeGreaterThan(rootAt)
  })

  it('carries no skin-specific rules — skins theme the Codex, they do not special-case it', () => {
    // Comments are stripped first — the file's own header explains WHY there are no skin
    // overrides, and scanning raw text would match that prose and fail on the documentation of
    // the very rule being checked.
    const css = read('app/dnd/_sheet/styles/codex.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/\.skin-[a-z0-9-]+\s+\.codex/)
    // Scoped under `.sheet-shell` (T-SHELL-SCOPE) so it cannot leak onto the wider Starr site AND can
    // be reused by the bespoke PF2/IG sheets without theme.css's element rules bleeding in.
    for (const line of css.split('\n')) {
      if (/^\.[a-z]/.test(line.trim())) expect(line.trim().startsWith('.sheet-shell')).toBe(true)
    }
  })

  it('reflows by CONTAINER, never by viewport, inside the pane', () => {
    // The single most important technical decision in the layout: a pane's height is set by
    // dragging, and a media query describes the window, so only a container query can answer
    // "how tall is THIS pane".
    const css = read('app/dnd/_sheet/styles/codex.css')
    expect(css).toContain('container-type: size')
    expect(css).toContain('@container codexpane')
    expect(css).toContain('@supports not (container-type: size)') // the documented fallback
  })

  it('the pane stack is keyboard-operable', () => {
    // Drag is mouse-only. On a primary surface, a resize a keyboard user cannot perform makes
    // the whole layout unusable for them.
    const src = read('app/dnd/_sheet/codex/PaneStack.tsx')
    expect(src).toContain('role="separator"')
    expect(src).toContain('aria-valuenow')
    expect(src).toContain('tabIndex={0}')
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) expect(src).toContain(key)
  })

  it('persists the view preference to localStorage and NOT to the character', () => {
    // A DM peeking at a player's sheet must not rearrange it for them, and a drag must not fire
    // the sheet's autosave or land in edit history.
    const src = read('app/dnd/_sheet/codex/usePaneStack.ts')
    expect(src).toContain('localStorage')
    expect(src).not.toContain('setChar')
  })

  it('renders the real pane components rather than Codex-specific copies', () => {
    // A Codex-specific SpellsPanel would be a second implementation to keep in sync with the
    // first, and the two would diverge on the first bug fixed in only one. Since T-2b the Codex
    // reads the shared `useFivePanels()` set instead of importing the components itself — so the
    // real components must live in that ONE panel source, and the Codex must consume it.
    const src = read('app/dnd/_sheet/codex/CodexLayout.tsx')
    expect(src).toContain("useFivePanels")
    expect(src).not.toMatch(/from '\.\.\/components\/SpellsPanel'/) // no duplicated panel list here
    const panels = read('app/dnd/_sheet/panels/fivePanels.tsx')
    for (const c of ['SpellsPanel', 'SavesSkills', 'CombatPanel', 'Inventory', 'Features']) {
      expect(panels).toContain(`from '../components/${c}'`)
    }
  })

  it('ships the stylesheet it imports', () => {
    expect(existsSync(join(ROOT, 'app/dnd/_sheet/styles/codex.css'))).toBe(true)
    expect(read('app/dnd/_sheet/App.tsx')).toContain("import './styles/codex.css'")
  })

  it('is a pure system-agnostic shell fed by a 5e adapter (T-SHELL)', () => {
    // The format (identity column + pane rail/stack + docked roller) lives in CodexShell, which must
    // know nothing about any system: no store hooks, no 5e components — only the {identity, panels,
    // roller, above, storageKey} it is handed. The pane-stack machinery is format logic and stays in
    // the shell; the adapter (CodexLayout) computes the 5e parts and passes them in.
    const shell = read('app/dnd/_sheet/shells/CodexShell.tsx')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(shell).not.toMatch(/useChar|useFivePanels|IdentityColumn|SigilStack|DiceTray/)
    expect(shell).toContain('usePaneStack') // the pane machinery is format logic, kept in the shell
    const adapter = read('app/dnd/_sheet/codex/CodexLayout.tsx')
    expect(adapter).toContain("from '../shells/CodexShell'")
    expect(adapter).toContain('SigilStack')
  })
})
