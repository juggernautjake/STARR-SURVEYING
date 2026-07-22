// T-DICE-DASHBOARD / T-DICE-PLAY — the Dashboard's Roll Board and the Play format's Impact Roller
// are that format's OWN bespoke roller, replacing the shared Dice Core in their shell only.
//
// These are source-contract tests (the render + tumble/deal animations are browser-verified
// separately): each file exists, imports its stylesheet, consumes the SHARED roll data and never
// recomputes the total (it prints `entry.total`), the Dashboard/Play adapters mount it INSTEAD of
// the shared Dice Core, and neither stylesheet carries a skin-specific selector (so every skin —
// and every shell root — restyles it for free).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const BOARD_TSX = 'app/dnd/_sheet/components/rollers/RollBoard.tsx'
const BOARD_CSS = 'app/dnd/_sheet/components/rollers/rollBoard.css'
const IMPACT_TSX = 'app/dnd/_sheet/components/rollers/ImpactRoller.tsx'
const IMPACT_CSS = 'app/dnd/_sheet/components/rollers/impactRoller.css'
const DASH = 'app/dnd/_sheet/codex/DashboardLayout.tsx'
const PLAY = 'app/dnd/_sheet/codex/PlayLayout.tsx'

describe.each([
  { name: 'Roll Board (Dashboard)', tsx: BOARD_TSX, css: BOARD_CSS, styleImport: "import './rollBoard.css'" },
  { name: 'Impact Roller (Play)', tsx: IMPACT_TSX, css: IMPACT_CSS, styleImport: "import './impactRoller.css'" },
])('$name — the file exists and is self-contained', ({ tsx, css, styleImport }) => {
  it('ships the component and its stylesheet', () => {
    expect(existsSync(join(ROOT, tsx))).toBe(true)
    expect(existsSync(join(ROOT, css))).toBe(true)
    // The component imports its own styles, so it needs no edit to a parent to be styled.
    expect(read(tsx)).toContain(styleImport)
  })

  it('consumes the SHARED roll data and never recomputes the total', () => {
    const src = read(tsx)
    expect(src).toContain('useChar')
    expect(src).toContain('activeRoll')
    // The total is the store's one answer — displayed, never recomputed.
    expect(src).toContain('entry.total')
  })

  it('honours prefers-reduced-motion in both the CSS and the JS timeline', () => {
    expect(read(css)).toContain('@media (prefers-reduced-motion: reduce)')
    // The JS timeline gates on the SHARED `shouldAnimateRoller()` (RO-6), which folds prefers-reduced-
    // motion in one place (`rollerAnim.ts`) rather than each roller inlining the matchMedia check.
    expect(read(tsx)).toContain('shouldAnimateRoller')
    expect(read('app/dnd/_sheet/components/rollers/rollerAnim.ts')).toContain('prefers-reduced-motion: reduce')
  })

  it('carries NO skin-specific selector — skins theme it, they do not special-case it', () => {
    const clean = stripComments(read(css))
    expect(clean).not.toMatch(/\.skin-[a-z0-9-]+/)
  })
})

describe('Roll Board — wired into the Dashboard adapter ONLY', () => {
  it('the Dashboard mounts the Roll Board and no longer mounts Dice Core', () => {
    const dash = read(DASH)
    expect(dash).toContain('<RollBoard />')
    const code = stripComments(dash)
    expect(code).not.toContain('DiceTray')
  })
})

describe('Impact Roller — wired into the Play adapter ONLY', () => {
  it('the Play adapter mounts the Impact Roller and no longer mounts Dice Core', () => {
    const play = read(PLAY)
    expect(play).toContain('<ImpactRoller />')
    const code = stripComments(play)
    expect(code).not.toContain('DiceTray')
  })
})

describe('the classic Dice Core stays the classic sheet roller', () => {
  it('is the DEFAULT roller via rollerFor, and App renders the chosen roller node (RO-2)', () => {
    // RO-2 made the roller its own axis: App no longer hardcodes <DiceTray/>, it renders the chosen
    // roller from `rollerFor`, whose default ('core') IS the classic Dice Core. So the classic roller is
    // unchanged in behaviour, just routed through the registry.
    expect(read('app/dnd/_sheet/App.tsx')).toContain('rollerFor')
    expect(read('app/dnd/_sheet/components/rollers/rollerFor.tsx')).toContain('<DiceTray />')
  })
})
