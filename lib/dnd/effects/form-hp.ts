// lib/dnd/effects/form-hp.ts — the `separateHp` carry-over rule (Slice 18, Ground Rule 1).
//
// 5e Wild Shape (and many homebrew transforms) give the FORM its own hit-point pool. Damage hits the
// form's HP first; when it drops to 0, the form ends and any overflow returns to YOU — your real HP.
// Your base current/max HP is NEVER overwritten while transformed (the anti-"permanent bear" guarantee
// for HP too): it sits frozen, and the form pool is a separate scratch field. This is the ONE
// carry-over flag that needs stateful instance HP rather than a re-derivable overlay, so it lives here
// as a pure, tested core the store wires into its single damage path.

/** The form's separate HP pool while a `separateHp` form is worn. `formId` pins which form it belongs
 *  to, so a stale pool from a previous form is never mistaken for the current one. */
export interface FormHpState {
  formId: string
  current: number
  max: number
}

export interface FormHpResult {
  /** The form pool after the change (current clamped to [0, max]). */
  form: FormHpState
  /** The character's base current HP — only ever REDUCED by overflow past 0; never otherwise touched. */
  baseCurrent: number
  /** True when this hit emptied the pool: the form should END and revert to the base character. */
  ended: boolean
}

/**
 * Route an HP delta while a `separateHp` form is active.
 *
 *   - Damage (`delta < 0`) hits the form pool first. If it stays above 0, the base is untouched. If it
 *     drops to 0 or below, the form ENDS and the overflow (damage beyond the pool) is dealt to the base
 *     current HP — exactly the 5e rule ("any excess carries over to your normal form").
 *   - Healing (`delta > 0`) tops up the FORM pool (clamped to its max) while you wear it; your base HP
 *     waits underneath, unchanged. (A caster who wants to heal the real you does it after the form
 *     ends — mirrors the tabletop.)
 *
 * Base current HP is only ever reduced by overflow, never overwritten — so ending the form leaves the
 * real character exactly where it was, minus only damage that truly got through.
 */
export function routeFormDamage(form: FormHpState, baseCurrent: number, delta: number): FormHpResult {
  if (delta >= 0) {
    return { form: { ...form, current: Math.min(form.max, form.current + delta) }, baseCurrent, ended: false }
  }
  const dmg = -delta
  const afterForm = form.current - dmg
  if (afterForm > 0) {
    return { form: { ...form, current: afterForm }, baseCurrent, ended: false }
  }
  const overflow = -afterForm // damage left over once the pool hits 0
  return { form: { ...form, current: 0 }, baseCurrent: Math.max(0, baseCurrent - overflow), ended: true }
}

/** Whether a form's pool is the one currently active — a guard so stale `formHp` (left from a form you
 *  already dropped) is ignored rather than silently absorbing damage for the wrong shape. */
export function isFormHpLive(form: FormHpState | undefined, activeFormId: string | undefined): form is FormHpState {
  return !!form && !!activeFormId && form.formId === activeFormId
}
