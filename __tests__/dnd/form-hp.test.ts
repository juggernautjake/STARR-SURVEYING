// __tests__/dnd/form-hp.test.ts — the `separateHp` carry-over rule (Slice 18).
//
// A separateHp form (5e Wild Shape) gives the FORM its own HP pool. Damage hits the pool first; when
// it empties, the form ends and the OVERFLOW returns to your real HP — which was frozen underneath the
// whole time. This pins the pure routing core plus the single store wiring point that uses it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { routeFormDamage, isFormHpLive, type FormHpState } from '@/lib/dnd/effects/form-hp'

const pool = (current: number, max = 34, formId = 'bear'): FormHpState => ({ formId, current, max })

describe('routeFormDamage — damage hits the form pool first', () => {
  it('a hit inside the pool leaves the base untouched', () => {
    const r = routeFormDamage(pool(34), 22, -10)
    expect(r.form.current).toBe(24)
    expect(r.baseCurrent).toBe(22) // your real HP never moved
    expect(r.ended).toBe(false)
  })

  it('emptying the pool exactly ends the form with no overflow', () => {
    const r = routeFormDamage(pool(10), 22, -10)
    expect(r.form.current).toBe(0)
    expect(r.baseCurrent).toBe(22)
    expect(r.ended).toBe(true)
  })

  it('overflow past 0 returns to your real HP and ends the form', () => {
    const r = routeFormDamage(pool(8), 22, -13) // 8 absorbed, 5 carries over
    expect(r.form.current).toBe(0)
    expect(r.baseCurrent).toBe(17) // 22 - 5 overflow
    expect(r.ended).toBe(true)
  })

  it('massive overflow cannot drive your real HP below 0', () => {
    const r = routeFormDamage(pool(5), 3, -100)
    expect(r.baseCurrent).toBe(0)
    expect(r.ended).toBe(true)
  })
})

describe('routeFormDamage — healing tops up the form pool, not the base', () => {
  it('heals the pool, clamped to its max', () => {
    const r = routeFormDamage(pool(20, 34), 22, +10)
    expect(r.form.current).toBe(30)
    expect(r.baseCurrent).toBe(22)
    expect(r.ended).toBe(false)
  })
  it('over-heal clamps at the pool max, base still untouched', () => {
    const r = routeFormDamage(pool(30, 34), 22, +50)
    expect(r.form.current).toBe(34)
    expect(r.baseCurrent).toBe(22)
  })
})

describe('isFormHpLive — a stale pool is ignored', () => {
  it('true only when the pool belongs to the active form', () => {
    expect(isFormHpLive(pool(10, 34, 'bear'), 'bear')).toBe(true)
    expect(isFormHpLive(pool(10, 34, 'bear'), 'wolf')).toBe(false) // switched forms — old pool is dead
    expect(isFormHpLive(undefined, 'bear')).toBe(false)
    expect(isFormHpLive(pool(10), undefined)).toBe(false)
  })
})

describe('the store routes damage through the form pool when a separateHp form is worn', () => {
  const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8')
  it('adjustHp uses routeFormDamage, guarded by the active form’s carryOver.separateHp', () => {
    expect(STORE).toContain('routeFormDamage')
    expect(STORE).toContain('activeForm?.carryOver?.separateHp')
    expect(STORE).toContain('isFormHpLive(c.formHp, activeId)')
  })
  it('the pool is cleared on the explicit form-exit paths', () => {
    expect(STORE).toContain('formHp: undefined')
  })
})
