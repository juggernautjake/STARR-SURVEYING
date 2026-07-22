// __tests__/dnd/roller-anim.test.ts — the shared roller animation rule (RO-6).
//
// One helper decides instant-vs-animated for every roller, folding the player's toggle with
// prefers-reduced-motion (a HARD override). These pin that truth table; the per-roller wiring that
// routes `!animate` through each template's instant branch is browser-verified separately.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { shouldAnimateRoller } from '@/app/dnd/_sheet/components/rollers/rollerAnim'

// The helper reads window.matchMedia; drive it with a stub so both reduced-motion states are testable.
let savedWindow: unknown
function setReducedMotion(reduce: boolean) {
  ;(globalThis as Record<string, unknown>).window = {
    matchMedia: (q: string) => ({ matches: reduce && /reduce/.test(q) }),
  }
}
beforeEach(() => { savedWindow = (globalThis as Record<string, unknown>).window })
afterEach(() => { ;(globalThis as Record<string, unknown>).window = savedWindow })

describe('shouldAnimateRoller — toggle × reduced-motion', () => {
  it('animates by default (never chosen) and when explicitly on', () => {
    setReducedMotion(false)
    expect(shouldAnimateRoller(undefined)).toBe(true)
    expect(shouldAnimateRoller(true)).toBe(true)
  })

  it('is instant when the player turned animation off', () => {
    setReducedMotion(false)
    expect(shouldAnimateRoller(false)).toBe(false)
  })

  it('prefers-reduced-motion forces instant regardless of the toggle', () => {
    setReducedMotion(true)
    expect(shouldAnimateRoller(true)).toBe(false)
    expect(shouldAnimateRoller(undefined)).toBe(false)
    expect(shouldAnimateRoller(false)).toBe(false)
  })
})
