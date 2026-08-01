'use client';
// HoneypotFields — the invisible bot trap, rendered identically on every public intake form.
//
// A1-3 of docs/planning/in-progress/SURVEYING_BACKEND_ANALYSIS_2026-08-01.md.
//
// ONE COMPONENT FOR FOUR FORMS, on purpose. `/contact`, the home page, `ContactForm` and
// `SurveyCalculator` all post to the same endpoint, and the attribution work found that "the three intake
// forms" had already been an undercount once. A trap rendered by hand in four places is a trap that is
// missing from one of them, and the one it is missing from is where the spam arrives.
//
// Renders nothing a customer can see, reach with a keyboard, or hear in a screen reader. The rules it
// feeds are in `lib/leads/honeypot.ts` and are unit-tested there.
import { useEffect, useState } from 'react';
import { HONEYPOT_TIME_FIELD, honeypotInputProps } from '@/lib/leads/honeypot';

export default function HoneypotFields(): React.ReactElement {
  const [loadedAt, setLoadedAt] = useState<string>('');

  // Stamped in an effect, NOT during render, for two reasons. It keeps the server-rendered HTML free of a
  // timestamp (which would be the render time, not the time this customer opened the page — and would be
  // baked into any cached or statically-generated copy of the form, making every visitor look instant).
  // And it means the value reflects when the form actually became interactive for this person.
  useEffect(() => { setLoadedAt(String(Date.now())); }, []);

  return (
    <>
      <input {...honeypotInputProps()} defaultValue="" />
      {/* Absent until the effect runs. The server treats a MISSING timestamp as "not a bot" precisely so
          that a customer whose JavaScript never ran is never silently discarded. */}
      <input type="hidden" name={HONEYPOT_TIME_FIELD} value={loadedAt} readOnly />
    </>
  );
}
