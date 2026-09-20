'use client';

// app/admin/dev/receptionist/IntakeBench.tsx — rehearse the voicemail interview by typing.
//
// Owner, 2026-09-21: "I want to test all of this on the admin backend before we make it live."
//
// ── IT SHOWS THE DECISION, NOT JUST THE SENTENCE ────────────────────────────────────────────────
//
// A chat window would tell you what the agent said. What you actually need to know is why: which
// facts it believes it has, how sure it is of each, what it has decided not to ask, and how much of
// the seven minutes is gone. All of that is beside the transcript, because the failure this is
// meant to catch is not a clumsy sentence — it is the agent asking a caller about structures on a
// vacant lot they already described.
//
// ── THE CLOCK IS A SLIDER ───────────────────────────────────────────────────────────────────────
//
// Nobody is going to sit through six and a half minutes of typing to find out whether the wind-down
// reads well. The elapsed time is an input, so the seven-minute ending can be rehearsed in a second
// — which is the only way it will ever actually be rehearsed.
//
// Nothing here touches the live line: no Twilio, no phone_calls row, no lead, no notification.

import { useCallback, useEffect, useState } from 'react';
import { Phone, Send, RotateCcw, Clock, AlertTriangle, Check } from 'lucide-react';

type Confidence = 'known' | 'unsure' | 'missing' | 'implied' | 'refused';

interface FieldValue { value?: string; confidence: Confidence; source?: string }
interface IntakeStateWire {
  phase: string;
  facts: Record<string, FieldValue>;
  asked: string[];
  declined?: boolean;
}
interface TurnResponse {
  say: string;
  end: boolean;
  field: string | null;
  state: IntakeStateWire;
  debug: {
    elapsedMs: number;
    budgetMs: number;
    windDownMs: number;
    stillToAsk: string[];
    extractionError: string | null;
  };
}

interface Line { who: 'agent' | 'caller'; text: string }

/** The scenarios worth having one click away, because they are the ones that expose the logic. */
const SCENARIOS: Array<{ label: string; text: string; why: string }> = [
  {
    label: 'Open lot in Killeen',
    why: 'The owner’s own example. It should never ask about structures, and it should ask for the address.',
    text: 'Hi, this is John Smith, my number is 254 555 0100. I have an open lot over in Killeen and '
      + 'I need a boundary survey done so I can put up a fence. Give me a call back when you can, thanks.',
  },
  {
    label: 'Hard-to-spell surname',
    why: 'First name ordinary, last name not. It should ask about the LAST name only.',
    text: 'Yeah hi, my name is John Szczepanski, I need a survey on a property I just bought.',
  },
  {
    label: 'Says almost nothing',
    why: 'Nothing to work from, so it should start at the top and work down.',
    text: 'Hey, give me a call back about a survey. Thanks.',
  },
  {
    label: 'Title company, house on it',
    why: 'Not the owner, and a structure is mentioned — neither should be asked about again.',
    // A deliberately fictional firm. Demo data that names a real local company ends up in a
    // screenshot eventually, and it also reads to the county-assumption audit as a hard-coded
    // county — which it is not, but a scanner cannot tell demo text from a real assumption.
    text: 'This is Karen calling from Greenline Title, we need an ALTA survey for a closing on a '
      + 'house at 1420 Elm Street. Best number is 254 555 0142.',
  },
];

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  known: 'heard clearly',
  unsure: 'needs confirming',
  missing: 'not mentioned',
  implied: 'worked out from what they said',
  refused: 'they declined',
};

export default function IntakeBench() {
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<IntakeStateWire | null>(null);
  const [debug, setDebug] = useState<TurnResponse['debug'] | null>(null);
  const [said, setSaid] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turn = useCallback(async (text: string, declined = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/receptionist-test/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ said: text, state, elapsedSeconds: elapsed, declined }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = (await res.json()) as TurnResponse;
      setLines((prev) => [
        ...prev,
        ...(text ? [{ who: 'caller' as const, text }] : []),
        { who: 'agent' as const, text: data.say },
      ]);
      setState(data.state);
      setDebug(data.debug);
      setEnded(data.end);
      setSaid('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [state, elapsed]);

  const reset = useCallback(() => {
    setLines([]); setState(null); setDebug(null); setSaid(''); setEnded(false); setError(null); setElapsed(0);
  }, []);

  // The greeting on mount, so the bench opens on the first thing a caller would hear rather than on
  // an empty box that gives no sense of what this is.
  useEffect(() => {
    if (lines.length === 0 && !state && !busy) void turn('');
    // Deliberately once. `turn` changes identity every render and re-running it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = debug ? Math.min(100, (debug.elapsedMs / debug.budgetMs) * 100) : 0;
  const winding = debug ? debug.elapsedMs >= debug.windDownMs : false;

  return (
    <section className="rtest__card intake" id="rt-intake">
      <h3 className="rtest__card-title">
        <Phone size={16} aria-hidden /> Voicemail intake interview
      </h3>
      <p className="rtest__card-note">
        The agent that will take over when nobody answers: it greets, takes a message, reads what it
        can out of the message, and then asks only about what it is still missing. Nothing here
        touches the live line — the business number still reaches the plain answering machine.
      </p>

      <div className="intake__scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="intake__scenario"
            title={s.why}
            disabled={busy || ended}
            onClick={() => setSaid(s.text)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="intake__body">
        <div className="intake__talk">
          <div className="intake__transcript">
            {lines.map((l, i) => (
              <p key={i} className={`intake__line intake__line--${l.who}`}>
                <span className="intake__who">{l.who === 'agent' ? 'Agent' : 'Caller'}</span>
                {l.text}
              </p>
            ))}
            {busy && <p className="intake__thinking">thinking…</p>}
          </div>

          {error && (
            <p className="intake__error" role="status">
              <AlertTriangle size={14} aria-hidden /> {error}
            </p>
          )}

          {ended ? (
            <div className="intake__ended">
              <Check size={15} aria-hidden /> Call ended.
              <button type="button" className="intake__btn" onClick={reset}>
                <RotateCcw size={13} aria-hidden /> Start another
              </button>
            </div>
          ) : (
            <form
              className="intake__compose"
              onSubmit={(e) => { e.preventDefault(); if (said.trim()) void turn(said); }}
            >
              <textarea
                id="intake-said"
                className="intake__input"
                rows={3}
                value={said}
                placeholder="What the caller says next…"
                onChange={(e) => setSaid(e.target.value)}
                disabled={busy}
              />
              <div className="intake__compose-actions">
                <button type="submit" className="intake__btn intake__btn--primary" disabled={busy || !said.trim()}>
                  <Send size={13} aria-hidden /> Say it
                </button>
                <button type="button" className="intake__btn" onClick={() => void turn('No thanks', true)} disabled={busy}>
                  Decline the questions
                </button>
                <button type="button" className="intake__btn" onClick={reset} disabled={busy}>
                  <RotateCcw size={13} aria-hidden /> Reset
                </button>
              </div>
            </form>
          )}

          <label className="intake__clock" htmlFor="intake-elapsed">
            <Clock size={14} aria-hidden />
            <span>
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} into the call
            </span>
            <input
              id="intake-elapsed"
              type="range"
              min={0}
              max={430}
              step={5}
              value={elapsed}
              onChange={(e) => setElapsed(Number(e.target.value))}
              disabled={ended}
            />
            <span className="intake__clock-hint">
              drag past 5:30 to rehearse the wind-down
            </span>
          </label>
          <div className={`intake__budget${winding ? ' intake__budget--winding' : ''}`} aria-hidden="true">
            <div className="intake__budget-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <aside className="intake__facts">
          <h4 className="intake__facts-title">What it has</h4>
          {!state || Object.keys(state.facts).length === 0 ? (
            <p className="intake__facts-empty">Nothing yet.</p>
          ) : (
            <ul className="intake__facts-list">
              {Object.entries(state.facts).map(([id, f]) => (
                <li key={id} className={`intake__fact intake__fact--${f.confidence}`}>
                  <span className="intake__fact-id">{id}</span>
                  <span className="intake__fact-value">{f.value ?? '—'}</span>
                  <span className="intake__fact-conf">
                    {CONFIDENCE_LABEL[f.confidence]}
                    {f.source && f.confidence === 'implied' ? ` (“${f.source}”)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="intake__facts-title">Still to ask</h4>
          {debug?.stillToAsk.length ? (
            <p className="intake__still">{debug.stillToAsk.join(', ')}</p>
          ) : (
            <p className="intake__facts-empty">Nothing — it would move on to the documents line.</p>
          )}

          {debug?.extractionError && (
            <p className="intake__error">
              <AlertTriangle size={13} aria-hidden /> Extraction unavailable: {debug.extractionError}.
              The agent will simply ask everything.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
