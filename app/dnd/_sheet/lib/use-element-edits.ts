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
  summary: string
  who: string
  when: string
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const inflight = new Map<string, Promise<Map<string, ElementEdit>>>()

function load(characterId: string): Promise<Map<string, ElementEdit>> {
  const cached = inflight.get(characterId)
  if (cached) return cached
  const p = fetch(`/api/dnd/characters/${characterId}/edits?limit=40`)
    .then((r) => (r.ok ? r.json() : { edits: [] }))
    .then((j) => {
      const out = new Map<string, ElementEdit>()
      // Newest first from the route, so the FIRST row seen for an element is its latest change and later
      // ones are skipped. That is the one a hovering player wants — "what changed here", not a history.
      for (const row of (j.edits ?? []) as Row[]) {
        if ((row.field_path ?? '').startsWith('revert:')) continue // the revert's own bookkeeping row
        const name = editedElementName(row.field_path)
        if (!name) continue
        const key = norm(name)
        if (out.has(key)) continue
        out.set(key, {
          summary: describeEdit(row),
          who: row.editor_name ? `${row.editor_name} (${row.is_dm ? 'DM' : 'player'})` : (row.is_dm ? 'the DM' : 'a player'),
          when: new Date(row.created_at).toLocaleDateString(),
        })
      }
      return out
    })
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
