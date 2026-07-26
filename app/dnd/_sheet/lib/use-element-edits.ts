'use client'
// app/dnd/_sheet/lib/use-element-edits.ts — the recent audit rows, indexed by the element they touched.
//
// The plan doc's remaining ✎ ask is "surface the SPECIFIC per-element diff (8d6 → 10d6) on the marker".
// Two things stood in the way, and this closes the second of them:
//   · a Revert INSIDE the hover needs `Tip` rebuilt (it sets `pointerEvents: 'none'` and takes a string,
//     not a node) — still open, and deliberately not attempted here;
//   · there was no per-element edit data on the sheet at all. `EditReviewPanel` fetched the rows for its
//     own list and nothing else could see them.
//
// ONE fetch for the whole sheet, shared. A hook that fetched per marker would issue a request per edited
// element on a sheet that might have twenty — so the in-flight promise is cached per character and every
// caller awaits the same one. The cache is deliberately not invalidated on edit: the marker explains what
// ALREADY happened, and a stale-by-one-edit tooltip is a far smaller problem than refetching on keystroke.
import { useEffect, useState } from 'react'
import { describeEdit, editedElementName, type DescribableEdit } from '@/lib/dnd/edit-describe'

interface Row extends DescribableEdit {
  id: string
  created_at: string
  is_dm?: boolean | null
  editor_name?: string | null
}

/** What a marker shows: the newest change to that element, already worded. */
export interface ElementEdit {
  /** The audit row, so a marker can offer to revert exactly this change. */
  id: string
  summary: string
  who: string
  when: string
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const inflight = new Map<string, Promise<Map<string, ElementEdit>>>()

/**
 * Index audit rows by the element each one touched. Pure, and exported so the rename-following below is
 * testable directly rather than through a mocked fetch.
 */
export function indexEdits(edits: Row[]): Map<string, ElementEdit> {
  const rows = edits.filter((r) => !(r.field_path ?? '').startsWith('revert:'))
  const out = new Map<string, ElementEdit>()
  // Newest first from the route, so the FIRST row seen for an element is its latest change and later
  // ones are skipped. That is the one a hovering player wants — "what changed here", not a history.
  for (const row of rows) {
    const name = editedElementName(row.field_path)
    if (!name) continue
    const key = norm(name)
    if (out.has(key)) continue
    out.set(key, {
      id: row.id,
      summary: describeEdit(row),
      who: row.editor_name ? `${row.editor_name} (${row.is_dm ? 'DM' : 'player'})` : (row.is_dm ? 'the DM' : 'a player'),
      when: new Date(row.created_at).toLocaleDateString(),
    })
  }

  // FOLLOW RENAMES. Rows are keyed by the element's name AT THE TIME OF THE EDIT, so a renamed element
  // stops matching its own history — the marker would show the general text on exactly the elements
  // someone has been working on most. That looked like it needed an element id on the audit row (a
  // schema change), but it does not: **the rename is itself an audited row**. `FeatureEditor` and its
  // siblings log `spell.Fireball.name: Fireball → Firestorm`, so the old name is recoverable from the
  // data already here.
  //
  // Chains resolve (A → B → C), and the walk is depth-capped: these names come from user input, and a
  // player who renames X to Y and back again would otherwise spin here forever.
  const previous = new Map<string, string>()
  for (const row of rows) {
    if (!(row.field_path ?? '').endsWith('.name')) continue
    const from = typeof row.old_value === 'string' ? norm(row.old_value) : ''
    const to = typeof row.new_value === 'string' ? norm(row.new_value) : ''
    if (from && to && from !== to && !previous.has(to)) previous.set(to, from)
  }
  for (const current of previous.keys()) {
    if (out.has(current)) continue
    let at = current
    for (let hops = 0; hops < 8; hops++) {
      const older = previous.get(at)
      if (!older || older === at) break
      at = older
      const found = out.get(at)
      if (found) { out.set(current, found); break }
    }
  }
  return out
}

function load(characterId: string): Promise<Map<string, ElementEdit>> {
  const cached = inflight.get(characterId)
  if (cached) return cached
  const p = fetch(`/api/dnd/characters/${characterId}/edits?limit=40`)
    .then((r) => (r.ok ? r.json() : { edits: [] }))
    .then((j) => indexEdits((j.edits ?? []) as Row[]))
    .catch(() => new Map<string, ElementEdit>())
  inflight.set(characterId, p)
  return p
}

/**
 * The most recent audited change per element name, for this character.
 *
 * Returns an empty map until the fetch lands and for a sheet with no `characterId` (a standalone
 * localStorage sheet has no server log). Callers must render fine without it — the ✎ marker's own meaning
 * does not depend on the detail, which is an enrichment.
 */
export function useElementEdits(characterId: string | null | undefined): Map<string, ElementEdit> {
  const [map, setMap] = useState<Map<string, ElementEdit>>(new Map())
  useEffect(() => {
    if (!characterId) return
    let live = true
    load(characterId).then((m) => { if (live) setMap(m) })
    return () => { live = false }
  }, [characterId])
  return map
}

/** Look one up the way the audit paths spell it (case- and space-insensitively). */
export function editFor(map: Map<string, ElementEdit>, name: string | undefined): ElementEdit | undefined {
  return name ? map.get(norm(name)) : undefined
}
