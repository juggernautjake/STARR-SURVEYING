'use client'
// app/dnd/_sheet/components/RuleTip.tsx — click any rule on the sheet, read what it does.
//
// Everything here is SYSTEM-SCOPED. A term is looked up in the character's own glossary and
// nowhere else: "Frightened" is numeric in Pathfinder 2e and binary in 5e, so resolving a 5e
// character's condition against a PF2 article would be worse than showing nothing.
//
// Two deliberate consequences of that:
//  · A character with no system (`ambiguous`) gets NO auto-links — we don't know which rulebook
//    its words belong to, and guessing is the one thing this platform exists not to do.
//  · A term with no article (homebrew, e.g. Jack's Pugilist features) still gets a popover, but
//    one that says so and offers to ask the librarian instead of inventing an answer.
import { useCallback, useEffect, useRef, useState } from 'react'
import { findTerm, termsMentionedIn, type GlossaryEntry } from '@/lib/dnd/glossary'
import { useSheetSystem } from '../state/sheetConfig'
import { md } from '../lib/inline'

/** Where the librarian lives, pre-filled and focused on this system. */
function askUrl(system: string, term: string): string {
  const q = `What does “${term}” do, and when would I use it?`
  return `/dnd/library/${encodeURIComponent(system)}?ask=${encodeURIComponent(q)}#chat`
}

function Popover({
  entry,
  term,
  system,
  onClose,
  onNavigate,
}: {
  entry: GlossaryEntry | null
  term: string
  system: string
  onClose: () => void
  onNavigate: (t: string) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click / Escape — a rules popover must never trap you.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // NOTE: every element here is a <span> (block-displayed via CSS), never a <div>/<p>.
  // A rule tip is rendered INSIDE a feature's <p>, and HTML forbids <div>/<p> inside <p> — the
  // browser silently force-closes the paragraph at that point, which tears the surrounding text
  // out of its own element and triggers a hydration error. Inline-safe markup avoids both.
  return (
    <span ref={ref} className="ruletip-pop" role="dialog" aria-label={`${term} — rule`}>
      <span className="ruletip-head">
        <strong className="ruletip-term">{entry?.term ?? term}</strong>
        {entry && <span className="ruletip-kind">{entry.kind}</span>}
        <button className="ruletip-close" onClick={onClose} aria-label="Close">✕</button>
      </span>

      {entry ? (
        <>
          <span className="ruletip-short">{entry.short}</span>
          <span className="ruletip-body">
            {entry.body.split('\n').map((line, i) => (
              <span className="ruletip-para" key={i}>{md(line)}</span>
            ))}
          </span>
          {entry.seeAlso?.length ? (
            <span className="ruletip-see">
              See also:{' '}
              {entry.seeAlso.map((ref2, i) => (
                <span key={ref2}>
                  {i > 0 && ' · '}
                  <button className="ruletip-link" onClick={() => onNavigate(ref2)}>{ref2}</button>
                </span>
              ))}
            </span>
          ) : null}
        </>
      ) : (
        // No article — say so plainly rather than inventing one.
        <span className="ruletip-body">
          <span className="ruletip-para">
            This sheet’s reference doesn’t define <strong>{term}</strong>
            {system && system !== 'ambiguous' ? ' for this system' : ''} — it’s probably homebrew.
          </span>
        </span>
      )}

      {system && system !== 'ambiguous' && (
        <a className="ruletip-ask" href={askUrl(system, entry?.term ?? term)} target="_blank" rel="noreferrer">
          Ask the librarian →
        </a>
      )}
    </span>
  )
}

/**
 * Wraps a term so it opens its rule. Renders plain text (no affordance) when the term has no
 * article AND no system — there's nothing useful to show, so don't pretend it's a link.
 */
export function RuleTip({ term, children }: { term: string; children?: React.ReactNode }) {
  const system = useSheetSystem()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(term)
  const entry = findTerm(system, shown)
  const hasAnything = !!findTerm(system, term) || system !== 'ambiguous'

  const close = useCallback(() => { setOpen(false); setShown(term) }, [term])

  if (!hasAnything) return <>{children ?? term}</>

  return (
    <span className="ruletip">
      <button className="ruletip-trigger" onClick={() => setOpen((o) => !o)} title={`What does ${term} do?`}>
        {children ?? term}
      </button>
      {open && <Popover entry={entry} term={shown} system={system} onClose={close} onNavigate={setShown} />}
    </span>
  )
}

/** Linkify every glossary term inside ONE plain-text run (no markdown in it). */
function linkify(text: string, needles: string[], keyBase: string): React.ReactNode[] {
  if (!needles.length || !text) return [text]
  const re = new RegExp(`(^|[^a-z0-9])(${needles.join('|')})(?![a-z0-9])`, 'gi')
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length
    if (start > last) out.push(text.slice(last, start))
    out.push(<RuleTip key={`${keyBase}-${i++}`} term={m[2]} />)
    last = start + m[2].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * Renders markdown-lite text with every glossary term turned into a RuleTip.
 *
 * Markdown is tokenized FIRST, and terms are linked only INSIDE each token. The first version
 * split the raw string on term boundaries and ran md() over the slices, which tore `**bold**`
 * spans in half whenever a term sat inside one — "**not wearing armor**" rendered with its
 * asterisks showing. Bold text still gets its terms linked; it just stays bold.
 *
 * Falls back to plain md() when the character has no system — there is no glossary to link to,
 * and linking to another system's would be worse than not linking at all.
 */
export function RichRules({ text }: { text: string }) {
  const system = useSheetSystem()
  const terms = termsMentionedIn(system, text)

  if (!terms.length) return <>{md(text)}</>

  // Longest first so "Sanity check" wins over "Sanity" and "Armor Class" over "Armor".
  const needles = terms
    .flatMap((t) => [t.term, ...(t.aliases ?? [])])
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  // Tokenize the markdown-lite this codebase uses: **bold** and *em*.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{linkify(part.slice(2, -2), needles, `b${i}`)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i}>{linkify(part.slice(1, -1), needles, `e${i}`)}</em>
        }
        return <span key={i}>{linkify(part, needles, `p${i}`)}</span>
      })}
    </>
  )
}

export default RuleTip
