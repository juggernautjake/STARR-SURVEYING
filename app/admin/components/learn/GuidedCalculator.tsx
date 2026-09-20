'use client';

// app/admin/components/learn/GuidedCalculator.tsx — the calculator, with someone sitting next to you.
//
// Owner, 2026-09-20: "I want it to have a built in calculator for some problems where you actually
// have to use the calculator to enter the answer … it tells you what buttons to press for each step
// and explains exactly what each button is doing … I need to become very familiar and quick with
// the calculator."
//
// ── YOU PRESS THE KEYS. IT DOES NOT PRESS THEM FOR YOU ──────────────────────────────────────────
//
// The obvious build is an animation that plays the sequence while you watch. It would look better
// and teach nothing, because the thing being learned is a motor skill — where the key IS, under
// your thumb, without looking. Watching somebody else do that is not practice.
//
// So: the keypad points at exactly one key, you press it, and the display moves. Press the wrong
// one and nothing happens to the calculator — it says what you pressed, what that key would have
// done, and leaves you where you were.
//
// ── ONLY ONE KEY IS EVER HIGHLIGHTED ────────────────────────────────────────────────────────────
//
// Showing the whole remaining sequence turns this into copying a pattern off a screen, which can be
// done with the explanation text entirely unread. One key at a time means the only way forward is
// through the sentence that says what the key does.
//
// ── THE EXPLANATION ARRIVES WITH THE STEP, NOT BEFORE IT ────────────────────────────────────────
//
// Each step's text stages in (lib/learn/reveal.ts) in reading order: what to press, then what it
// does, then the trap if there is one. The trap is last on purpose — it is a warning about a
// mistake you are about to be able to make, and it means nothing until you know what the key is.
//
// The routines live in lib/calculators/models/ti-30xa/guided.ts and every keystroke in them is
// checked against this same engine by a test, so what this component promises is what the
// calculator actually does.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, RotateCcw, ChevronRight, AlertTriangle } from 'lucide-react';
import { Keypad } from '@/app/admin/components/calculator/Keypad';
import { Display } from '@/app/admin/components/calculator/Display';
import { TI_30XA_KEYPAD, TI_30XA_GRID } from '@/lib/calculators/models/ti-30xa/keypad-data';
import { TI_30XA_CATALOGUE } from '@/lib/calculators/models/ti-30xa/catalogue';
import { type GuidedRoutine } from '@/lib/calculators/models/ti-30xa/guided';
import {
  startRun, pressKey, nextKey as nextKeyOf, currentStep, progress,
} from '@/lib/calculators/models/ti-30xa/guided-run';
import { revealStyle, OUTCOME_MOTION } from '@/lib/learn/reveal';
import type { KeyDef } from '@/lib/calculators/shared';

export interface GuidedCalculatorProps {
  /** Which routine to walk. */
  routineId: string;
  /** Called once when the last step lands, so a lesson can record it. */
  onFinished?: (routine: GuidedRoutine) => void;
}

/**
 * What a mis-pressed key actually does, taken from the catalogue rather than invented here.
 *
 * A wrong keypress is the best teaching moment the component gets — somebody has just formed a
 * wrong idea about a key and is looking straight at it. Answering that with "wrong key" wastes it.
 *
 * The digits and the like are marked `plain` in the catalogue and their `does` is "Digit seven."
 * Saying that back is noise, so those get no explanation and the message just names what they
 * meant to press instead.
 */
function whatThatKeyDoes(id: string): string | null {
  const entry = TI_30XA_CATALOGUE.find((k) => k.id === id);
  if (!entry || entry.plain) return null;
  return entry.does;
}

export default function GuidedCalculator({ routineId, onFinished }: GuidedCalculatorProps) {
  // All the rules live in guided-run.ts, as a pure function of (run, key). They are the part that
  // must not break — above all "a wrong key changes nothing" — and this repo has no way to test a
  // component by clicking it, so they are tested there instead of here. What is left in this file
  // is rendering.
  const [run, setRun] = useState(() => startRun(routineId));

  const restart = useCallback(() => setRun(startRun(routineId)), [routineId]);

  const onKey = useCallback((key: KeyDef) => {
    setRun((prev) => (prev ? pressKey(prev, key.id) : prev));
  }, []);

  // `onFinished` fires from an effect, not from inside the state updater.
  //
  // React may call an updater twice — StrictMode does it deliberately in development — so a side
  // effect in there runs twice. That would double-count a completed routine in whatever a lesson
  // uses this for, and it is invisible in production, which is the worst combination available.
  //
  // The ref makes it once per completion rather than once per render.
  const announced = useRef(false);
  useEffect(() => {
    if (!run?.done) { announced.current = false; return; }
    if (announced.current) return;
    announced.current = true;
    onFinished?.(run.routine);
  }, [run?.done, run?.routine, onFinished]);

  if (!run) {
    // A lesson directive with a `routine=` nobody wrote. Said out loud, because an empty box in
    // the middle of a lesson looks like a broken page rather than a typo.
    return <p className="gcalc__missing">That routine is not available.</p>;
  }

  const { routine, calc, wrong, awaiting, done, stepIndex } = run;
  const step = currentStep(run);
  const next = nextKeyOf(run);
  const total = routine.steps.length;
  const wrongDoes = wrong ? whatThatKeyDoes(wrong.id) : null;
  const wrongLabel = wrong ? (TI_30XA_KEYPAD.find((k) => k.id === wrong.id)?.label ?? wrong.id) : null;
  const wantLabel = step?.label ?? '';

  const statusBadges: string[] = [calc.mode];
  if (calc.shift) statusBadges.push('2nd');
  if (awaiting) statusBadges.push(awaiting.toUpperCase());
  if (calc.data.length > 0) statusBadges.push(`n=${calc.data.length}`);

  return (
    <div className="gcalc" data-testid="guided-calculator">
      <header className="gcalc__head">
        <h3 className="gcalc__title">{routine.title}</h3>
        <p className="gcalc__why">{routine.why}</p>
        <p className="gcalc__problem">{routine.problem}</p>
      </header>

      <div className="gcalc__body">
        <div className="gcalc__machine">
          <Display entry="" result={calc.display} statusBadges={statusBadges} />
          <Keypad
            keys={TI_30XA_KEYPAD}
            rows={TI_30XA_GRID.rows}
            cols={TI_30XA_GRID.cols}
            onKey={onKey}
            shiftActive={calc.shift}
            nextKey={next}
            wrongKey={wrong?.id ?? null}
          />
        </div>

        <div className="gcalc__guide">
          <div className="gcalc__rail" aria-hidden="true">
            <div
              className="gcalc__rail-fill"
              style={{ width: `${progress(run) * 100}%` }}
            />
          </div>
          <p className="gcalc__count" aria-live="polite">
            {done ? `Finished — ${total} of ${total}` : `Step ${stepIndex + 1} of ${total}`}
          </p>

          {!done && step && (
            // Keyed on the step so the staged reveal replays each time. Without it the text would
            // swap in place and a student mid-sequence would not notice the instruction changed.
            <div className="gcalc__step" key={`${routine.id}-${stepIndex}`}>
              <p className="gcalc__press reveal-item" style={revealStyle(0, { total: 3 })}>
                <span className="gcalc__press-label">Press</span>
                <kbd className="gcalc__keys">{step.label}</kbd>
                {step.keys.length > 1 && (
                  <span className="gcalc__progress">{run.keyIndex} / {step.keys.length}</span>
                )}
              </p>
              <p className="gcalc__does reveal-item" style={revealStyle(1, { total: 3 })}>
                {step.does}
              </p>
              {step.trap && (
                <p className="gcalc__trap reveal-item" style={revealStyle(2, { total: 3 })}>
                  <AlertTriangle size={14} aria-hidden /> {step.trap}
                </p>
              )}
            </div>
          )}

          {wrong && !done && (
            // Keyed on the timestamp so pressing the same wrong key twice animates twice. A
            // silent second failure reads as the app having stopped responding.
            <div
              className={`gcalc__wrong ${OUTCOME_MOTION.wrong.className}`}
              key={wrong.at}
              role="status"
            >
              <X size={15} aria-hidden />
              <span>
                That is <strong>{wrongLabel}</strong>
                {wrongDoes ? ` — ${wrongDoes}` : ''}. You want <strong>{wantLabel}</strong>.
              </span>
            </div>
          )}

          {done && (
            <div className={`gcalc__done ${OUTCOME_MOTION.right.className}`} role="status">
              <Check size={16} aria-hidden />
              <div>
                <strong>{routine.answer}</strong>
                {routine.afterwards && <p className="gcalc__afterwards">{routine.afterwards}</p>}
              </div>
            </div>
          )}

          <div className="gcalc__actions">
            <button type="button" className="gcalc__btn" onClick={restart} data-testid="gcalc-restart">
              <RotateCcw size={13} aria-hidden /> {done ? 'Run it again' : 'Start over'}
            </button>
            {!done && (
              <span className="gcalc__nudge">
                <ChevronRight size={13} aria-hidden /> the highlighted key
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
