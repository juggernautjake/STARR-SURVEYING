// tagInfo — what each inventory tag actually MEANS.
//
// Reported: "at the moment I don't know what 'FLAVOR' means. I would like a tool tip to be able to
// explain it to me." Fair — the tags are terse and several of them are load-bearing (a `weapon` tag
// is what puts a thing in the Attacks table; `consumable` is what makes it usable-and-gone).
//
// One definition per tag, in one place, so the Gear list, the item editor and any future filter all
// explain a tag the same way. A second copy of these strings would drift.
export const ITEM_TAGS = {
  equipped: 'Worn or held right now. Only equipped gear applies its effects to your sheet.',
  weapon: 'Can be attacked with — it shows up in your Attacks table with its own to-hit and damage.',
  consumable: 'Used up when you use it. It leaves your inventory; any lasting effect it grants stays in Active Effects.',
  tech: 'Technological gear — devices, cyberware, tools with a power source.',
  flavor: 'Story and roleplay only. It has no mechanical effect on your character — it is here because it is part of who they are.',
} as const

export type ItemTag = keyof typeof ITEM_TAGS

/** The explanation for a tag, or null when it's something homebrew we have no definition for. */
export function tagInfo(tag: string): string | null {
  return (ITEM_TAGS as Record<string, string>)[tag] ?? null
}
