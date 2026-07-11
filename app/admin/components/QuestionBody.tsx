// app/admin/components/QuestionBody.tsx
'use client';

// Shared single-question renderer used by BOTH the QuizRunner (lesson quizzes /
// module tests / exam-prep practice) and the FS Exam Simulator, so every
// question type renders identically wherever it is served: multiple choice,
// true/false, multi-select, ordering, drag-label, hotspot, numeric, short
// answer, essay, fill-in-the-blank — each with its matching generated figure.
//
// The component owns only transient UI state (which term is "picked" for
// drag_label, and the one-time shuffle seed for ordering). The answer itself is
// lifted: it reads `answer` (a string, JSON-encoded for array types) and calls
// `onAnswer(next)` — so the host owns the answer map and submit payload.

import { useEffect, useState } from 'react';
import FillBlankQuestion from './FillBlankQuestion';

export interface DragLabelOptions { terms: string[]; targets: string[] }
export interface HotspotRegion { id: string; label: string }
export interface HotspotOptions { regions: HotspotRegion[] }

export interface DeliveredQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | DragLabelOptions | HotspotOptions;
  difficulty?: string;
  _diagram?: string;
  _original_type?: string;
}

/* ---- option-shape readers (tolerate string[] or object) ---- */
function asStringArray(o: unknown): string[] {
  return Array.isArray(o) ? (o as string[]) : [];
}
export function getDragLabelOpts(q: DeliveredQuestion): DragLabelOptions {
  const o = q.options as DragLabelOptions | string[];
  if (o && !Array.isArray(o) && Array.isArray((o as DragLabelOptions).terms)) {
    return { terms: (o as DragLabelOptions).terms || [], targets: (o as DragLabelOptions).targets || [] };
  }
  return { terms: Array.isArray(o) ? (o as string[]) : [], targets: [] };
}
export function getHotspotRegions(q: DeliveredQuestion): HotspotRegion[] {
  const o = q.options as HotspotOptions | string[];
  if (o && !Array.isArray(o) && Array.isArray((o as HotspotOptions).regions)) {
    return (o as HotspotOptions).regions || [];
  }
  return [];
}

/** Is this question answered given its (string-encoded) answer? */
export function isAnswered(q: DeliveredQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  switch (q.question_type) {
    case 'fill_blank': {
      try { const arr = JSON.parse(answer) as string[]; return arr.length > 0 && arr.every(a => a !== ''); } catch { return false; }
    }
    case 'multi_select': {
      try { return (JSON.parse(answer) as string[]).length > 0; } catch { return false; }
    }
    case 'ordering': {
      try { const arr = JSON.parse(answer) as string[]; return arr.length === asStringArray(q.options).length && arr.length > 0; } catch { return false; }
    }
    case 'drag_label': {
      try {
        const arr = JSON.parse(answer) as string[];
        const n = getDragLabelOpts(q).targets.length;
        return n > 0 && arr.length === n && arr.every(x => x !== '');
      } catch { return false; }
    }
    default:
      return answer.trim() !== '';
  }
}

interface Props {
  question: DeliveredQuestion;
  answer: string | undefined;
  onAnswer: (next: string) => void;
  /** Render the question text (default true). Set false if the host prints it. */
  showText?: boolean;
}

export default function QuestionBody({ question: q, answer, onAnswer, showText = true }: Props) {
  const [picked, setPicked] = useState('');

  // Seed a shuffled starting order for `ordering` questions once; the seeded
  // order IS the answer until the student rearranges it.
  useEffect(() => {
    if (q.question_type === 'ordering' && !answer) {
      const shuffled = [...asStringArray(q.options)];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (shuffled.length > 0) onAnswer(JSON.stringify(shuffled));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  /* ---- multi-select ---- */
  function toggleMultiSelect(opt: string) {
    let current: string[];
    try { current = JSON.parse(answer || '[]'); } catch { current = []; }
    const idx = current.indexOf(opt);
    if (idx >= 0) current.splice(idx, 1); else current.push(opt);
    onAnswer(JSON.stringify(current));
  }
  function isMultiSelected(opt: string): boolean {
    try { return (JSON.parse(answer || '[]') as string[]).includes(opt); } catch { return false; }
  }

  /* ---- ordering ---- */
  function getOrdering(options: string[]): string[] {
    try { const arr = JSON.parse(answer || '[]') as string[]; return arr.length === options.length ? arr : [...options]; } catch { return [...options]; }
  }
  function moveOrderingItem(options: string[], index: number, dir: -1 | 1) {
    const arr = getOrdering(options);
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    onAnswer(JSON.stringify(arr));
  }

  /* ---- drag-label ---- */
  function getDragAssign(nTargets: number): string[] {
    try { const arr = JSON.parse(answer || '[]') as string[]; if (arr.length === nTargets) return arr; } catch { /* fall through */ }
    return Array(nTargets).fill('');
  }
  function placeDragLabel(targetIdx: number) {
    const { targets } = getDragLabelOpts(q);
    const assign = getDragAssign(targets.length);
    if (picked) {
      for (let i = 0; i < assign.length; i++) if (assign[i] === picked) assign[i] = '';
      assign[targetIdx] = picked;
      onAnswer(JSON.stringify(assign));
      setPicked('');
    } else if (assign[targetIdx]) {
      assign[targetIdx] = '';
      onAnswer(JSON.stringify(assign));
    }
  }

  /* ---- fill blank ---- */
  function getFillBlanks(): string[] {
    try { return JSON.parse(answer || '[]'); } catch { return []; }
  }

  const opts = asStringArray(q.options);

  return (
    <>
      {/* Generated figure that matches this problem's numbers (rendered once). */}
      {q._diagram && (
        <div className="quiz__diagram" style={{ margin: '0.75rem 0', maxWidth: 540 }} dangerouslySetInnerHTML={{ __html: q._diagram }} />
      )}

      {showText && q.question_type !== 'fill_blank' && (
        <p className="quiz__question-text">{q.question_text}</p>
      )}

      {/* Multiple Choice / True-False */}
      {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
        <div className="quiz__options">
          {opts.map((opt, oi) => (
            <div
              key={oi}
              className={`quiz__option ${answer === opt ? 'quiz__option--selected' : ''}`}
              onClick={() => onAnswer(opt)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAnswer(opt); } }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}

      {/* Multi Select */}
      {q.question_type === 'multi_select' && (
        <div className="quiz__options">
          {opts.map((opt, oi) => (
            <div
              key={oi}
              className={`quiz__option quiz__option--multi ${isMultiSelected(opt) ? 'quiz__option--selected' : ''}`}
              onClick={() => toggleMultiSelect(opt)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMultiSelect(opt); } }}
            >
              <span className="quiz__option-check">{isMultiSelected(opt) ? '✓' : ''}</span>
              {opt}
            </div>
          ))}
        </div>
      )}

      {/* Ordering — arrange items top (first) to bottom (last) */}
      {q.question_type === 'ordering' && (
        <div className="quiz__ordering" role="list">
          {getOrdering(opts).map((opt, oi, arr) => (
            <div key={opt} className="quiz__ordering-item" role="listitem">
              <span className="quiz__ordering-rank">{oi + 1}</span>
              <span className="quiz__ordering-label">{opt}</span>
              <span className="quiz__ordering-controls">
                <button type="button" className="quiz__ordering-btn" aria-label={`Move "${opt}" up`} disabled={oi === 0} onClick={() => moveOrderingItem(opts, oi, -1)}>{'▲'}</button>
                <button type="button" className="quiz__ordering-btn" aria-label={`Move "${opt}" down`} disabled={oi === arr.length - 1} onClick={() => moveOrderingItem(opts, oi, 1)}>{'▼'}</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Drag-label — pick a term, then tap the target it belongs to */}
      {q.question_type === 'drag_label' && (() => {
        const { terms, targets } = getDragLabelOpts(q);
        const assign = getDragAssign(targets.length);
        const placed = new Set(assign.filter(Boolean));
        return (
          <>
            <p className="quiz__drag-hint">Tap a term to pick it up, then tap the box it belongs to. Tap a filled box to return its term.</p>
            <div className="quiz__drag-pool">
              {terms.filter(t => !placed.has(t)).map(t => (
                <button
                  type="button"
                  key={t}
                  className={`quiz__drag-term ${picked === t ? 'quiz__drag-term--picked' : ''}`}
                  aria-pressed={picked === t}
                  onClick={() => setPicked(prev => prev === t ? '' : t)}
                >{t}</button>
              ))}
            </div>
            <div className="quiz__drag-targets">
              {targets.map((prompt, ti) => (
                <button
                  type="button"
                  key={ti}
                  className={`quiz__drag-target ${assign[ti] ? 'quiz__drag-target--filled' : ''} ${picked ? 'quiz__drag-target--active' : ''}`}
                  aria-label={`${prompt}${assign[ti] ? `, currently: ${assign[ti]}` : ', empty'}`}
                  onClick={() => placeDragLabel(ti)}
                >
                  <span className="quiz__drag-target-prompt">{prompt}</span>
                  <span className="quiz__drag-target-slot">{assign[ti] || '—'}</span>
                </button>
              ))}
            </div>
          </>
        );
      })()}

      {/* Hotspot — click the region on the figure that answers the prompt */}
      {q.question_type === 'hotspot' && (() => {
        const regions = getHotspotRegions(q);
        const chosen = answer || '';
        return (
          <div className="quiz__hotspot-regions" role="radiogroup" aria-label="Select the correct element">
            {regions.map(r => (
              <button
                type="button"
                key={r.id}
                role="radio"
                aria-checked={chosen === r.id}
                className={`quiz__hotspot-region ${chosen === r.id ? 'quiz__hotspot-region--selected' : ''}`}
                onClick={() => onAnswer(r.id)}
              >
                <span className="quiz__hotspot-id">{r.id}</span>
                <span className="quiz__hotspot-label">{r.label}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Short Answer */}
      {q.question_type === 'short_answer' && (
        <input
          type="text"
          className="quiz__text-input"
          placeholder="Type your answer..."
          value={answer || ''}
          onChange={e => onAnswer(e.target.value)}
        />
      )}

      {/* Numeric Input */}
      {(q.question_type === 'numeric_input' || q.question_type === 'math_template') && (
        <div className="quiz__numeric-wrap">
          <input
            type="number"
            step="any"
            className="quiz__text-input quiz__text-input--numeric"
            placeholder="Enter your numeric answer..."
            value={answer || ''}
            onChange={e => onAnswer(e.target.value)}
          />
        </div>
      )}

      {/* Essay / Paragraph */}
      {q.question_type === 'essay' && (
        <>
          <textarea
            className="quiz__essay-input"
            placeholder="Write your response here... Be thorough and explain your reasoning."
            rows={6}
            value={answer || ''}
            onChange={e => onAnswer(e.target.value)}
          />
          <span className="quiz__essay-hint">
            {(answer || '').length} characters &mdash; Aim for a detailed, well-structured response
          </span>
        </>
      )}

      {/* Fill in the Blank */}
      {q.question_type === 'fill_blank' && (
        <FillBlankQuestion
          questionText={q.question_text}
          options={opts}
          blanks={getFillBlanks()}
          onChange={b => onAnswer(JSON.stringify(b))}
        />
      )}
    </>
  );
}
