// __tests__/dnd/roller-templates.test.ts — the roller-template catalog (RO-2).
//
// The roller template is a FOURTH axis chosen independently of the sheet layout. These assert the two
// contracts the API and the sheet both depend on: `isRollerTemplate` validates a PATCH, and
// `resolveRollerTemplate` picks the effective roller (explicit choice → layout default → core) so a
// character that never picked one keeps exactly the roller its sheet template shipped with.
import { describe, it, expect } from 'vitest'
import {
  ROLLER_TEMPLATES,
  DEFAULT_ROLLER_FOR_LAYOUT,
  isRollerTemplate,
  rollerTemplate,
  resolveRollerTemplate,
} from '@/lib/dnd/roller-templates'

describe('roller-templates — the catalog', () => {
  it('has exactly the four templates with unique ids, glyphs and labels', () => {
    const ids = ROLLER_TEMPLATES.map((t) => t.id)
    expect(ids).toEqual(['core', 'sigil', 'board', 'impact'])
    expect(new Set(ROLLER_TEMPLATES.map((t) => t.glyph)).size).toBe(4)
    expect(ROLLER_TEMPLATES.every((t) => t.label && t.blurb)).toBe(true)
  })

  it('rollerTemplate(id) looks a template up, undefined for nonsense', () => {
    expect(rollerTemplate('sigil')?.label).toBe('Sigil Stack')
    expect(rollerTemplate('nope')).toBeUndefined()
  })
})

describe('isRollerTemplate — PATCH validation', () => {
  it('accepts the four ids and rejects everything else', () => {
    for (const id of ['core', 'sigil', 'board', 'impact']) expect(isRollerTemplate(id)).toBe(true)
    for (const junk of ['classic', 'CORE', '', null, undefined, 3, {}]) expect(isRollerTemplate(junk)).toBe(false)
  })
})

describe('resolveRollerTemplate — the effective roller', () => {
  it('honours an explicit valid choice regardless of layout', () => {
    expect(resolveRollerTemplate('impact', 'codex')).toBe('impact')
    expect(resolveRollerTemplate('core', 'play')).toBe('core')
  })

  it('falls back to the layout default when no valid choice is set', () => {
    expect(resolveRollerTemplate(undefined, 'classic')).toBe('core')
    expect(resolveRollerTemplate(undefined, 'codex')).toBe('sigil')
    expect(resolveRollerTemplate(undefined, 'dashboard')).toBe('board')
    expect(resolveRollerTemplate(undefined, 'play')).toBe('impact')
    // Each layout's default lines up with the catalog map.
    expect(DEFAULT_ROLLER_FOR_LAYOUT).toEqual({ classic: 'core', codex: 'sigil', dashboard: 'board', play: 'impact' })
  })

  it('ignores an invalid choice and an unknown layout, ending at core', () => {
    expect(resolveRollerTemplate('bogus', 'codex')).toBe('sigil') // bad choice → layout default
    expect(resolveRollerTemplate(undefined, 'weird')).toBe('core') // unknown layout → core
    expect(resolveRollerTemplate(undefined, undefined)).toBe('core')
  })
})
