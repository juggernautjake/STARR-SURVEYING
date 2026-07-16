// tagInfo — what each inventory tag actually MEANS (Slices 27 + 32).
//
// Reported: "at the moment I don't know what 'FLAVOR' means. I would like a tool tip to be able to
// explain it to me." Fair — the tags are terse and several of them are load-bearing.
//
// One definition per tag, in one place, so the Gear list, the item editor and any future filter all
// explain a tag the same way. A second copy of these strings would drift.
import type { CustomTag } from '../../types'

export const ITEM_TAGS = {
  equipped: 'Worn or held right now. Only equipped gear applies its effects to your sheet.',
  weapon: 'Can be attacked with — it shows up in your Attacks table with its own to-hit and damage.',
  consumable: 'Used up when you use it. It leaves your inventory; any lasting effect it grants stays in Active Effects.',
  tech: 'Technological gear — devices, cyberware, tools with a power source.',
  flavor: 'Story and roleplay only. It has no mechanical effect on your character — it is here because it is part of who they are.',
} as const

export type ItemTag = keyof typeof ITEM_TAGS

/**
 * Tags that are WIRING, not labels — a custom tag may never shadow one of these.
 *
 * `weapon` is what puts an item in the Attacks table; `consumable` is what makes it
 * usable-and-gone; `equipped` is what applies its effects through the ledger. A homebrew tag that
 * reused one of these names would silently change mechanics — the item would start behaving like a
 * weapon because someone wanted a word for "looks dangerous". Refuse the name and say why.
 *
 * `tech` and `flavor` are purely descriptive, so they are NOT reserved: redefining "flavor" for
 * your table changes a tooltip and nothing else.
 */
export const RESERVED_TAGS: readonly string[] = ['weapon', 'consumable', 'equipped']

const norm = (s: string) => s.trim().toLowerCase()

/**
 * The explanation for a tag: the built-in definition, else this character's own, else null when
 * it's something we genuinely have no definition for. Never invents one.
 */
export function tagInfo(tag: string, custom?: CustomTag[]): string | null {
  const builtin = (ITEM_TAGS as Record<string, string>)[tag]
  if (builtin) return builtin
  const own = (custom ?? []).find((t) => norm(t.name) === norm(tag))
  return own?.description?.trim() || null
}

/** Every tag offerable on this character: the built-ins plus its table's own. */
export function availableTags(custom?: CustomTag[]): string[] {
  const own = (custom ?? []).map((t) => t.name).filter(Boolean)
  return [...new Set([...Object.keys(ITEM_TAGS), ...own])]
}

export interface TagError {
  reason: string
}

/**
 * Validate a proposed custom tag. Refuses rather than coerces — same rule as the effect validator:
 * a tag that silently didn't save is worse than one that visibly wouldn't.
 */
export function validateCustomTag(name: string, description: string, existing?: CustomTag[]): TagError | null {
  const n = name.trim()
  if (!n) return { reason: 'A tag needs a name.' }
  if (!/^[\w -]+$/.test(n)) return { reason: 'A tag name can only contain letters, numbers, spaces, dashes and underscores.' }
  if (RESERVED_TAGS.includes(norm(n))) {
    return { reason: `"${n}" is a built-in tag that changes how an item behaves — pick another name.` }
  }
  if ((ITEM_TAGS as Record<string, string>)[norm(n)]) {
    return { reason: `"${n}" is already a built-in tag.` }
  }
  if ((existing ?? []).some((t) => norm(t.name) === norm(n))) {
    return { reason: `"${n}" already exists on this character.` }
  }
  // The whole point of the slice: an undefined tag recreates the problem tooltips just solved.
  if (!description.trim()) return { reason: 'Describe what this tag means — that description is its tooltip.' }
  return null
}
