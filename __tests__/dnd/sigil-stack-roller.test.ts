// T-DICE-CODEX — the Sigil Stack is the Codex format's OWN roller.
//
// These are source-contract tests (the render + animation are browser-verified separately):
// the file exists, the Codex mounts it INSTEAD of the shared Dice Core, the roller carries no
// skin-specific selector (so every skin restyles it for free), and it honours reduced motion.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const TSX = 'app/dnd/_sheet/components/rollers/SigilStack.tsx'
const CSS = 'app/dnd/_sheet/components/rollers/sigilStack.css'
const CODEX = 'app/dnd/_sheet/codex/CodexLayout.tsx'

describe('Sigil Stack — the file exists and is self-contained', () => {
  it('ships the component and its stylesheet', () => {
    expect(existsSync(join(ROOT, TSX))).toBe(true)
    expect(existsSync(join(ROOT, CSS))).toBe(true)
    // The component imports its own styles, so it needs no edit to App.tsx to be styled.
    expect(read(TSX)).toContain("import './sigilStack.css'")
  })

  it('consumes the SHARED roll data, never a new source', () => {
    const src = read(TSX)
    expect(src).toContain('useChar')
    expect(src).toContain('activeRoll')
    // The total is the store's one answer — displayed, never recomputed.
    expect(src).toContain('entry.total')
  })
})

describe('Sigil Stack — wired into the Codex shell ONLY', () => {
  it('the Codex docks the Sigil Stack and no longer docks Dice Core', () => {
    const codex = read(CODEX)
    expect(codex).toContain('<SigilStack />')
    // The shared Dice Core must no longer be imported or mounted here — that is the whole
    // point of the slice. (Comments are stripped first so the prose explaining the swap,
    // which names DiceTray, does not trip the check.)
    const code = codex.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('DiceTray')
  })

  it('leaves the classic Dice Core as the DEFAULT roller (via rollerFor, RO-2)', () => {
    // App renders the chosen roller from `rollerFor`, whose default ('core') is the classic Dice Core —
    // so the classic roller is unchanged, just routed through the registry rather than hardcoded.
    expect(read('app/dnd/_sheet/components/rollers/rollerFor.tsx')).toContain('<DiceTray />')
  })
})

describe('Sigil Stack — skinning + motion discipline', () => {
  it('carries NO skin-specific selector — skins theme it, they do not special-case it', () => {
    const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/\.skin-[a-z0-9-]+\s+\.sigil/)
    // Every top-level rule is scoped under .dnd-sheet, so it cannot leak onto the wider site.
    for (const line of css.split('\n')) {
      const t = line.trim()
      if (/^\.[a-z]/.test(t)) expect(t.startsWith('.dnd-sheet')).toBe(true)
    }
  })

  it('honours prefers-reduced-motion in both the CSS and the JS timeline', () => {
    expect(read(CSS)).toContain('@media (prefers-reduced-motion: reduce)')
    // The JS timeline gates on the SHARED `shouldAnimateRoller()` (RO-6), which folds prefers-reduced-
    // motion in one place (`rollerAnim.ts`) instead of each roller inlining the matchMedia check.
    expect(read(TSX)).toContain('shouldAnimateRoller')
    expect(read('app/dnd/_sheet/components/rollers/rollerAnim.ts')).toContain('prefers-reduced-motion: reduce')
  })
})
