'use client'
// rollerChoice — a per-character CLIENT cache of the chosen roller template, so switching templates is
// instant and STICKS (owner). The bug it fixes: the picker's chosen template was driven either by a full
// page reload (5e) or by local state that a re-render/remount reset back to the default — so the roller kept
// snapping back to Dice Core. This tiny module-level cache is the client source of truth for the current
// session: `effectiveRollerChoice` reads it first (falling back to the saved value / layout default), and the
// picker writes it on every pick. It outlives component re-renders and remounts, so the choice can't be lost;
// the background `/roller` POST persists it across full reloads.
import { resolveRollerTemplate, type RollerTemplateId } from './roller-templates'

const cache = new Map<string, RollerTemplateId>()

/** Record the player's pick for this character (client-session). */
export function rememberRollerChoice(characterId: string | null | undefined, id: RollerTemplateId) {
  if (characterId) cache.set(characterId, id)
}

/** The roller template to SHOW: the session pick if the player has made one, else their saved choice, else
 *  the layout default. One place so every mount (5e / PF2 / IG) resolves it identically. */
export function effectiveRollerChoice(characterId: string | null | undefined, saved: unknown, layout: unknown): RollerTemplateId {
  if (characterId) {
    const c = cache.get(characterId)
    if (c) return c
  }
  return resolveRollerTemplate(saved, layout)
}
