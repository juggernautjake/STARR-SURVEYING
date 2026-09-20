'use client';

// app/admin/learn/exam-prep/sit/calculator/page.tsx — the calculator manual, and the practice.
//
// Owner, 2026-09-20: "We need to catalogue all of the commands and everything for whatever
// calculators we use so that we can fully learn what each button does and what each combination of
// buttons does … I need to become very familiar and quick with the calculator."
//
// ── THREE THINGS, IN THE ORDER SOMEBODY NEEDS THEM ──────────────────────────────────────────────
//
// 1. WHICH — the approved list, because turning up with the wrong machine ends the day at the door,
//    and because the three entry models are three different sets of muscle memory.
// 2. WHAT — every key on the TI-30Xa: what it does, what the yellow function above it does, what a
//    surveyor reaches for it for, and the mistake people actually make with it.
// 3. DOING — the guided routines, where you press the keys yourself.
//
// Reading the manual is the least valuable of the three and it is still first, because somebody who
// does not know what 2nd does cannot start at 3.
//
// ── THE SEARCH IS OVER EVERYTHING, NOT JUST LABELS ──────────────────────────────────────────────
//
// You look a key up because of what you want to DO — "standard deviation", "quadrant", "memory" —
// and almost never because you know its name. Searching only the key faces would answer only the
// question nobody has.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calculator, Search, ChevronRight, AlertTriangle, Hammer, ArrowLeft, BookOpen, Info,
} from 'lucide-react';
import { TI_30XA_CATALOGUE, type KeyDoc } from '@/lib/calculators/models/ti-30xa/catalogue';
import { TI_30XA_GUIDED } from '@/lib/calculators/models/ti-30xa/guided';
import {
  APPROVED_CALCULATORS, ENTRY_MODELS, NCEES_LIST_REVIEWED, type EntryModel,
} from '@/lib/calculators/approved';
import GuidedCalculator from '@/app/admin/components/learn/GuidedCalculator';
import { revealStyle } from '@/lib/learn/reveal';

const GROUP_LABELS: Record<KeyDoc['group'], string> = {
  control: 'Control and clearing',
  entry: 'Entering numbers',
  arithmetic: 'Arithmetic',
  trig: 'Trigonometry',
  powers: 'Powers and roots',
  memory: 'Memory',
  stats: 'Statistics',
  angle: 'Angle mode',
};

/** The order they are taught in, which is not the order they sit on the keypad. */
const GROUP_ORDER: KeyDoc['group'][] = [
  'control', 'entry', 'arithmetic', 'powers', 'trig', 'angle', 'memory', 'stats',
];

/** Everything about a key, as one searchable string. */
function haystack(k: KeyDoc): string {
  return [
    k.label, k.does, k.surveyUse, k.trap,
    k.second?.label, k.second?.does,
    k.example?.press, k.example?.shows,
  ].filter(Boolean).join(' ').toLowerCase();
}

type Tab = 'keys' | 'practice' | 'which';

export default function CalculatorReferencePage() {
  const [tab, setTab] = useState<Tab>('keys');
  const [query, setQuery] = useState('');
  const [openRoutine, setOpenRoutine] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const matching = q ? TI_30XA_CATALOGUE.filter((k) => haystack(k).includes(q)) : TI_30XA_CATALOGUE;
    return GROUP_ORDER
      .map((group) => ({ group, keys: matching.filter((k) => k.group === group) }))
      .filter((g) => g.keys.length > 0);
  }, [q]);

  const matchCount = groups.reduce((n, g) => n + g.keys.length, 0);

  return (
    <div className="admin-page calcref">
      <header className="calcref__head">
        <Link href="/admin/learn/exam-prep/sit" className="admin-module-detail__back">
          <ArrowLeft size={14} aria-hidden /> Back to SIT Exam Prep
        </Link>
        <h1 className="calcref__title">
          <Calculator size={22} aria-hidden /> Calculator
        </h1>
        <p className="calcref__lede">
          Every key on the TI-30Xa, what it is for on a survey, and the routines worth doing until
          your hands know them.
        </p>
      </header>

      <nav className="calcref__tabs" role="tablist" aria-label="Calculator reference sections">
        {([
          ['keys', 'Every key', BookOpen],
          ['practice', 'Guided practice', Hammer],
          ['which', 'Which calculator', Info],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`calcref__tab${tab === id ? ' calcref__tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </nav>

      {/* ── EVERY KEY ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'keys' && (
        <section className="calcref__panel">
          <div className="calcref__search">
            <Search size={15} aria-hidden />
            <input
              id="calcref-search"
              type="search"
              className="calcref__search-input"
              placeholder="Search — try “standard deviation”, “quadrant”, “memory”"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the calculator keys"
            />
            {q && (
              <span className="calcref__search-count" aria-live="polite">
                {matchCount} {matchCount === 1 ? 'key' : 'keys'}
              </span>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="calcref__empty">
              Nothing matches “{query}”. The search covers what each key does, what it is for on a
              survey, and the traps — so a miss here usually means the TI-30Xa does not have it.
            </p>
          ) : (
            groups.map(({ group, keys }) => (
              <div className="calcref__group" key={group}>
                <h2 className="calcref__group-title">{GROUP_LABELS[group]}</h2>
                <div className="calcref__keys">
                  {keys.map((k, i) => (
                    <article
                      className={`calcref__key${k.plain ? ' calcref__key--plain' : ''} reveal-item`}
                      key={k.id}
                      style={revealStyle(i, { total: keys.length })}
                    >
                      <div className="calcref__key-face">
                        <kbd className="calcref__kbd">{k.label}</kbd>
                        {k.second && <kbd className="calcref__kbd calcref__kbd--2nd">{k.second.label}</kbd>}
                      </div>
                      <div className="calcref__key-body">
                        <p className="calcref__does">{k.does}</p>
                        {k.second && (
                          <p className="calcref__second">
                            <strong>2nd {k.second.label}</strong> — {k.second.does}
                          </p>
                        )}
                        {k.example && (
                          <p className="calcref__example">
                            <code>{k.example.press}</code>
                            <ChevronRight size={12} aria-hidden />
                            <span>{k.example.shows}</span>
                          </p>
                        )}
                        {k.surveyUse && (
                          <p className="calcref__use"><strong>On a survey:</strong> {k.surveyUse}</p>
                        )}
                        {k.trap && (
                          <p className="calcref__trap">
                            <AlertTriangle size={13} aria-hidden /> {k.trap}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* ── GUIDED PRACTICE ────────────────────────────────────────────────────────────────── */}
      {tab === 'practice' && (
        <section className="calcref__panel">
          <p className="calcref__panel-lede">
            Each routine points at one key at a time and says what it does. Press the wrong one and
            nothing happens to the calculator — it tells you what that key would have done and leaves
            you where you were.
          </p>
          <div className="calcref__routines">
            {TI_30XA_GUIDED.map((r, i) => (
              <div className="calcref__routine reveal-item" key={r.id} style={revealStyle(i, { total: TI_30XA_GUIDED.length })}>
                <button
                  type="button"
                  className="calcref__routine-head"
                  onClick={() => setOpenRoutine(openRoutine === r.id ? null : r.id)}
                  aria-expanded={openRoutine === r.id}
                >
                  <span className="calcref__routine-title">{r.title}</span>
                  <span className="calcref__routine-steps">{r.steps.length} steps</span>
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className={`calcref__chev${openRoutine === r.id ? ' calcref__chev--open' : ''}`}
                  />
                </button>
                <p className="calcref__routine-why">{r.why}</p>
                {openRoutine === r.id && (
                  <div className="calcref__routine-body">
                    <GuidedCalculator routineId={r.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── WHICH CALCULATOR ───────────────────────────────────────────────────────────────── */}
      {tab === 'which' && (
        <section className="calcref__panel">
          <p className="calcref__panel-lede">
            NCEES permits these and only these, and it is enforced at the test centre. Checked
            against their published policy on {NCEES_LIST_REVIEWED} — confirm it yourself before the
            exam, because the list is reviewed annually.
          </p>

          <div className="calcref__entry-models">
            {(Object.keys(ENTRY_MODELS) as EntryModel[]).map((key, i) => (
              <div className="calcref__entry reveal-item" key={key} style={revealStyle(i, { total: 3 })}>
                <h3 className="calcref__entry-title">{ENTRY_MODELS[key].label}</h3>
                <p className="calcref__entry-how">{ENTRY_MODELS[key].how}</p>
                <p className="calcref__entry-watch">
                  <AlertTriangle size={13} aria-hidden /> {ENTRY_MODELS[key].watchFor}
                </p>
              </div>
            ))}
          </div>

          <div className="calcref__approved">
            {APPROVED_CALCULATORS.map((c, i) => (
              <article className="calcref__model reveal-item" key={c.key} style={revealStyle(i, { total: APPROVED_CALCULATORS.length })}>
                <header className="calcref__model-head">
                  <h3 className="calcref__model-title">{c.label}</h3>
                  <span className={`calcref__badge calcref__badge--${c.entry}`}>
                    {ENTRY_MODELS[c.entry].label}
                  </span>
                  {c.audited && <span className="calcref__badge calcref__badge--audited">Catalogued here</span>}
                </header>
                <p className="calcref__model-notes">{c.notes}</p>
                <p className="calcref__model-rule">{c.rule}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
