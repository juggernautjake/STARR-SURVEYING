'use client';
// app/AndrewAsh/_ui/InquiryForm.tsx — the form the whole public site exists to fill.
//
// Design decisions, each of which is a reason people abandon a freelance contact form:
//
//   · THE INTENT PICKER IS FIRST AND IS BUTTONS. Voice-over work and coaching need completely
//     different questions. A dropdown hides that the form changes; segmented buttons make it obvious
//     in one glance, in one tap.
//   · ONLY NAME AND EMAIL ARE REQUIRED. Everything else improves the quote. A form that refuses to
//     submit without a budget loses the client who does not know their budget — who is most of them.
//   · THE PRICE ESTIMATE UPDATES AS THEY TYPE. The single biggest reason a small business does not
//     enquire is not knowing whether this is a $200 or a $2,000 decision, and being too embarrassed
//     to ask. Answering before they ask is worth more than any amount of copy.
//   · IT DEGRADES. `action`/`method` are set so the form posts even if the JavaScript fails; the
//     handler intercepts when it can.
//
// The same validation module runs here and on the server, so the inline errors and the authoritative
// ones can never disagree.

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  DEFAULT_QUOTE_RATES,
  EXPERIENCE_LEVELS,
  PROJECT_TYPES,
  estimateQuote,
  validateInquiry,
  type InquiryInput,
} from '@/lib/voice/inquiry';
// Imported from `usage`, NOT from `contracts`. `contracts` reaches node:crypto through `tokens`,
// which cannot be bundled for a browser — see lib/voice/usage.ts.
import { USAGE_SCOPES } from '@/lib/voice/usage';
import { formatCentsCompact } from '@/lib/voice/money';

interface Props {
  defaultIntent?: string;
  heading?: string;
  compact?: boolean;
}

const INTENTS = [
  { id: 'voiceover', label: 'Voice over' },
  { id: 'coaching', label: 'Coaching' },
  { id: 'booking', label: 'Live booking' },
  { id: 'other', label: 'Something else' },
];

export default function InquiryForm({ defaultIntent = 'voiceover', heading, compact = false }: Props): React.ReactElement {
  const [intent, setIntent] = useState(defaultIntent);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  // Captured at first render and posted back, so the server can see how long the form took to fill.
  // A submission that arrives in under a couple of seconds was not typed by a person.
  const renderedAt = useRef<number>(Date.now());

  const set = (key: string, value: string): void => {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear the error for a field as soon as it is touched. Leaving it until the next submit means
    // the user fixes the problem and is still being told they have it.
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const estimate = useMemo(() => {
    if (intent !== 'voiceover') return null;
    const words = parseInt((values.scriptWords ?? '').replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(words) || words <= 0) return null;
    return estimateQuote({ scriptWords: words, usage: values.usageTerms || 'web', rush: values.rush === 'yes' }, DEFAULT_QUOTE_RATES);
  }, [intent, values.scriptWords, values.usageTerms, values.rush]);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setServerError(null);

    const payload: InquiryInput = {
      ...values,
      intent,
      renderedAt: renderedAt.current,
      scriptWords: values.scriptWords,
    };

    const check = validateInquiry(payload);
    if (!check.ok) {
      setErrors(check.errors);
      // Move focus to the first thing that is wrong. Without this, a long form scrolled past its
      // errors just appears not to submit.
      const firstKey = Object.keys(check.errors)[0];
      document.getElementById(`va-field-${firstKey}`)?.focus();
      return;
    }

    setState('sending');
    try {
      const res = await fetch('/api/voice/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong sending that.');
      }
      setState('sent');
    } catch (err) {
      setState('error');
      setServerError(err instanceof Error ? err.message : 'Something went wrong sending that.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="vaCard" style={{ textAlign: 'center', padding: '48px 28px' }}>
        <CheckCircle2 size={38} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 18 }} />
        <h3 className="vaCardTitle" style={{ fontSize: '1.4rem' }}>Thank you — that came through.</h3>
        <p className="vaCardBody" style={{ maxWidth: '46ch', margin: '10px auto 0' }}>
          You will get a reply within one business day. If it is urgent, say so in a follow-up email
          and it will jump the queue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate method="post" action="/api/voice/inquiries">
      {heading && <h2 className="vaDisplay vaH3" style={{ marginBottom: 22 }}>{heading}</h2>}

      {state === 'error' && serverError && (
        <div className="vaNotice vaNoticeBad" role="alert">{serverError}</div>
      )}

      <fieldset>
        <legend className="vaLabel" style={{ marginBottom: 12 }}>What is this about?</legend>
        <div className="vaSegmented">
          {INTENTS.map((option) => (
            <label key={option.id} className="vaSegment">
              <input
                type="radio"
                name="intent"
                value={option.id}
                checked={intent === option.id}
                onChange={() => setIntent(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="vaFieldRow vaFieldRow2">
        <Field id="name" label="Your name" required error={errors.name}>
          <input
            id="va-field-name"
            name="name"
            className={`vaInput${errors.name ? ' vaInputError' : ''}`}
            autoComplete="name"
            value={values.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field id="email" label="Email" required error={errors.email}>
          <input
            id="va-field-email"
            name="email"
            type="email"
            inputMode="email"
            className={`vaInput${errors.email ? ' vaInputError' : ''}`}
            autoComplete="email"
            value={values.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
      </div>

      {!compact && (
        <div className="vaFieldRow vaFieldRow2">
          <Field id="company" label="Company (optional)">
            <input
              id="va-field-company"
              name="company"
              className="vaInput"
              autoComplete="organization"
              value={values.company ?? ''}
              onChange={(e) => set('company', e.target.value)}
            />
          </Field>
          <Field id="phone" label="Phone (optional)">
            <input
              id="va-field-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="vaInput"
              autoComplete="tel"
              value={values.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* ── Voice-over branch ── */}
      {intent === 'voiceover' && (
        <>
          <div className="vaFieldRow vaFieldRow2">
            <Field id="projectType" label="What kind of project?">
              <select
                id="va-field-projectType"
                name="projectType"
                className="vaSelect"
                value={values.projectType ?? ''}
                onChange={(e) => set('projectType', e.target.value)}
              >
                <option value="">Choose one…</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field id="usageTerms" label="Where will it be used?">
              <select
                id="va-field-usageTerms"
                name="usageTerms"
                className="vaSelect"
                value={values.usageTerms ?? ''}
                onChange={(e) => set('usageTerms', e.target.value)}
              >
                <option value="">Not sure yet</option>
                {USAGE_SCOPES.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="vaFieldRow vaFieldRow2">
            <Field id="scriptWords" label="Roughly how many words?" hint="A rough count is fine — it drives the estimate below.">
              <input
                id="va-field-scriptWords"
                name="scriptWords"
                inputMode="numeric"
                className="vaInput"
                placeholder="e.g. 350"
                value={values.scriptWords ?? ''}
                onChange={(e) => set('scriptWords', e.target.value)}
              />
            </Field>
            <Field id="deadline" label="Deadline (optional)" error={errors.deadline}>
              <input
                id="va-field-deadline"
                name="deadline"
                type="date"
                className={`vaInput${errors.deadline ? ' vaInputError' : ''}`}
                value={values.deadline ?? ''}
                onChange={(e) => set('deadline', e.target.value)}
              />
            </Field>
          </div>

          {estimate && (
            <div className="vaNotice vaNoticeGood" aria-live="polite">
              <strong style={{ color: 'var(--va-accent)' }}>
                Roughly {formatCentsCompact(estimate.lowCents)}–{formatCentsCompact(estimate.highCents)}
              </strong>{' '}
              for {estimate.basis}. This is a planning guide, not a quote — send the script and you
              will get a firm number, plus a free sample read.
            </div>
          )}
        </>
      )}

      {/* ── Coaching branch ── */}
      {intent === 'coaching' && (
        <>
          <Field id="experienceLevel" label="Where are you starting from?">
            <select
              id="va-field-experienceLevel"
              name="experienceLevel"
              className="vaSelect"
              value={values.experienceLevel ?? ''}
              onChange={(e) => set('experienceLevel', e.target.value)}
            >
              <option value="">Choose one…</option>
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </Field>
          <Field id="coachingGoals" label="What would you like to work on?" hint="An audition, a range problem, stamina, confidence — anything.">
            <textarea
              id="va-field-coachingGoals"
              name="coachingGoals"
              className="vaTextarea"
              rows={4}
              value={values.coachingGoals ?? ''}
              onChange={(e) => set('coachingGoals', e.target.value)}
            />
          </Field>
        </>
      )}

      <Field
        id="message"
        label={intent === 'other' ? 'What can I help with?' : 'Anything else?'}
        required={intent === 'other'}
        error={errors.message}
      >
        <textarea
          id="va-field-message"
          name="message"
          className={`vaTextarea${errors.message ? ' vaInputError' : ''}`}
          rows={5}
          placeholder={intent === 'voiceover' ? 'Paste the script here if you have it.' : ''}
          value={values.message ?? ''}
          onChange={(e) => set('message', e.target.value)}
        />
      </Field>

      {/* The honeypot. Positioned off-screen rather than display:none — some bots skip hidden inputs
          but almost none skip positioned ones — and kept away from real users and screen readers by
          tabIndex + aria-hidden + autoComplete=off. */}
      <div className="vaHoneypot" aria-hidden="true">
        <label htmlFor="va-field-website">Leave this blank</label>
        <input
          id="va-field-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website ?? ''}
          onChange={(e) => set('website', e.target.value)}
        />
      </div>

      <button type="submit" className="vaBtn vaBtnSolid vaBtnLg" disabled={state === 'sending'} style={{ marginTop: 10 }}>
        {state === 'sending' ? (
          <>
            <Loader2 size={16} aria-hidden className="vaSpin" /> Sending…
          </>
        ) : (
          <>
            <Send size={16} aria-hidden /> Send it
          </>
        )}
      </button>

      <p className="vaHint" style={{ marginTop: 16 }}>
        Your details are used to reply to you and for nothing else. No list, no forwarding.
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  children,
  hint,
  error,
  required,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}): React.ReactElement {
  return (
    <div className="vaField">
      <label className="vaLabel" htmlFor={`va-field-${id}`}>
        {label}
        {required && <span style={{ color: 'var(--va-accent)' }}> *</span>}
      </label>
      {children}
      {hint && !error && <p className="vaHint">{hint}</p>}
      {error && (
        <p className="vaError" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
