'use client';
// Every colour combination and every font pairing, in one place.
//
// Owner: *"I also just want a list of all of the color combinations and all of the fonts and what
// all works together."*
//
// ── DERIVED, NOT CURATED ────────────────────────────────────────────────────────────────────────
//
// 27 colours make 702 ordered pairs. A hand-picked "approved combinations" list would be shorter to
// read and wrong within one edit — somebody adds a colour and the list silently does not cover it.
// So the whole matrix is computed from the hex values, graded, and filtered here. The consequence
// worth stating: this page can show a pairing nobody has ever used, because the maths says it works.
// That is the right trade for a reference — the alternative is a designer assuming a combination is
// forbidden when it was only ever un-listed.
//
// ── FOUR GRADES, NOT PASS/FAIL ──────────────────────────────────────────────────────────────────
//
// The middle band is real and gets misused in both directions. 3:1–4.5:1 is legitimate for display
// sizes and wrong for body copy: collapsing it into "fail" throws away usable headline pairings,
// and collapsing it into "pass" ships unreadable small print.

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

import {
  BRAND_COLOURS, allPairings, gradeFor, GRADE_LABELS, colourByName,
  FONT_PAIRINGS, fontByName, STATUS_TONES, HIVIS_TONES,
  type PairGrade,
} from '@/lib/branding/palette';

const GRADE_ORDER: PairGrade[] = ['aaa', 'aa', 'large', 'fail'];

const GRADE_CLASS: Record<PairGrade, string> = {
  aaa: 'brand-ratio--ok',
  aa: 'brand-ratio--ok',
  large: 'brand-ratio--mid',
  fail: 'brand-ratio--fail',
};

export default function PairingsTab() {
  const [minGrade, setMinGrade] = useState<PairGrade>('aa');
  const [filter, setFilter] = useState('');
  const [ground, setGround] = useState<string>('all');

  const pairs = useMemo(() => {
    const rank: Record<PairGrade, number> = { fail: 0, large: 1, aa: 2, aaa: 3 };
    const q = filter.trim().toLowerCase();
    return allPairings()
      .filter((p) => rank[p.grade] >= rank[minGrade])
      .filter((p) => ground === 'all' || p.bg === ground)
      .filter((p) => !q || p.fg.toLowerCase().includes(q) || p.bg.toLowerCase().includes(q))
      .sort((a, b) => b.ratio - a.ratio);
  }, [minGrade, filter, ground]);

  const counts = useMemo(() => {
    const all = allPairings();
    return GRADE_ORDER.reduce<Record<PairGrade, number>>((acc, g) => {
      acc[g] = all.filter((p) => p.grade === g).length;
      return acc;
    }, { aaa: 0, aa: 0, large: 0, fail: 0 });
  }, []);

  const total = counts.aaa + counts.aa + counts.large + counts.fail;

  return (
    <div>
      <p className="brand-lede">
        All {total} ordered colour pairings, computed from the hex values rather than curated — so
        this list cannot go stale when a colour moves. {counts.aaa + counts.aa} of them are safe for
        body text.
      </p>

      {/* ── controls ─────────────────────────────────────────────────── */}
      <div className="brand-pairfilter">
        <div className="brand-pairfilter__grades" role="group" aria-label="Minimum grade">
          {GRADE_ORDER.map((g) => (
            <button type="button" key={g} onClick={() => setMinGrade(g)}
                    aria-pressed={minGrade === g}
                    className={`brand-pairfilter__grade${minGrade === g ? ' brand-pairfilter__grade--on' : ''}`}>
              {GRADE_LABELS[g]}
              <span className="brand-pairfilter__count">{counts[g]}</span>
            </button>
          ))}
        </div>

        <label className="brand-pairfilter__search">
          <Search size={14} aria-hidden />
          <input type="search" value={filter} placeholder="Filter by colour name…"
                 onChange={(e) => setFilter(e.target.value)}
                 aria-label="Filter pairings by colour name" />
        </label>

        <label className="brand-pairfilter__ground">
          On
          <select value={ground} onChange={(e) => setGround(e.target.value)}
                  aria-label="Filter by background colour">
            <option value="all">any background</option>
            {BRAND_COLOURS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <p className="brand-pairfilter__result">
        {pairs.length} pairing{pairs.length === 1 ? '' : 's'}
        {minGrade !== 'fail' && <> at <strong>{GRADE_LABELS[minGrade]}</strong> or better</>}
      </p>

      {pairs.length === 0 ? (
        <div className="brand-note brand-note--info">
          Nothing matches that. Widen the grade, clear the filter, or pick another background.
        </div>
      ) : (
        <div className="brand-grid brand-grid--4">
          {pairs.slice(0, 240).map((p) => {
            const fg = colourByName(p.fg);
            const bg = colourByName(p.bg);
            if (!fg || !bg) return null;
            return (
              <div className="brand-combo" key={`${p.fg}|${p.bg}`}>
                <div className="brand-combo__demo"
                     data-demo={p.grade === 'fail' ? 'fail' : undefined}
                     style={{ background: bg.hex, color: fg.hex }}>
                  <span className="brand-combo__big">Starr Surveying</span>
                  <span className="brand-combo__small">{GRADE_LABELS[p.grade]}</span>
                </div>
                <div className="brand-combo__cap">
                  <span>{p.fg} on {p.bg}</span>
                  <span className={`brand-ratio ${GRADE_CLASS[p.grade]}`}>{p.ratio.toFixed(2)}:1</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pairs.length > 240 && (
        <p className="brand-pairfilter__result">
          Showing the 240 strongest. Narrow it with the background picker or the filter to see the
          rest — the full list is {pairs.length}.
        </p>
      )}

      {/* ── status tones ─────────────────────────────────────────────── */}
      <div className="brand-section" style={{ marginTop: '2.5rem' }}>
        <h3 className="brand-section__title">Status tones</h3>
        <p className="brand-lede">
          The four states any interface or document has to express, plus the two hi-vis cases.
          Separate from the brand accent on purpose — a warning that is also the brand colour cannot
          signal anything.
        </p>
        <div className="brand-grid brand-grid--4">
          {[...STATUS_TONES, ...HIVIS_TONES].map((t, i) => (
            <div className="brand-combo" key={`${t.id}-${i}`}>
              <div className="brand-combo__demo" style={{ background: t.bg, color: t.fg }}>
                <span className="brand-combo__big">{t.label}</span>
                <span className="brand-combo__small">{t.bg} on {t.fg}</span>
              </div>
              <div className="brand-combo__cap">
                <span>{t.use}</span>
                <span className="brand-ratio brand-ratio--ok">{t.ratio.toFixed(2)}:1</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── font pairings ────────────────────────────────────────────── */}
      <div className="brand-section">
        <h3 className="brand-section__title">Font pairings — what works together</h3>
        <p className="brand-lede">
          Two faces per piece is the working limit; three only when one of them is the monospace
          carrying data. Each is shown in the colourway it is normally set in.
        </p>
        <div className="brand-grid brand-grid--2">
          {FONT_PAIRINGS.map((fp) => {
            const ground = colourByName(fp.ground);
            const ink = colourByName(fp.ink);
            const accent = fp.accent ? colourByName(fp.accent) : null;
            const faces = fp.fonts.map((n) => fontByName(n)).filter(Boolean);
            if (!ground || !ink) return null;
            return (
              <div className="brand-card" key={fp.id}>
                <div style={{ background: ground.hex, color: ink.hex, padding: '1.5rem 1.4rem' }}>
                  {faces[0] && (
                    <div style={{ fontFamily: faces[0]!.stack, fontSize: '1.5rem', fontWeight: 700,
                                  lineHeight: 1.1, letterSpacing: faces[0]!.capsOnly ? '.08em' : undefined }}>
                      {faces[0]!.sample}
                    </div>
                  )}
                  {faces[1] && (
                    <div style={{ fontFamily: faces[1]!.stack, fontSize: '.86rem', marginTop: '.65rem',
                                  lineHeight: 1.55, color: accent ? accent.hex : ink.hex }}>
                      {faces[1]!.sample}
                    </div>
                  )}
                  {faces[2] && (
                    <div style={{ fontFamily: faces[2]!.stack, fontSize: '.8rem', marginTop: '.55rem',
                                  fontWeight: 700, color: accent ? accent.hex : ink.hex }}>
                      {faces[2]!.sample}
                    </div>
                  )}
                </div>
                <div className="brand-card__body">
                  <p className="brand-card__name">{fp.label}</p>
                  <p className="brand-card__note">{fp.purpose}</p>
                  <div className="brand-profile__chips" style={{ marginTop: '.6rem' }}>
                    {[fp.ground, fp.ink, ...(fp.accent ? [fp.accent] : [])].map((cn) => {
                      const c = colourByName(cn);
                      if (!c) return null;
                      return (
                        <span className="brand-profile__chip" key={cn}>
                          <span className="brand-profile__chip-dot" style={{ background: c.hex }} />
                          {c.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
