// app/components/TexasCountyDatalist.tsx
//
// The <datalist> behind every county field on the public site. Render it once next to
// an `<input list={TEXAS_COUNTY_DATALIST_ID}>` and the browser gives you both halves of
// what the owner asked for, for free and with no new dependency:
//
//   · type-to-filter — the browser narrows the list as the customer types; and
//   · a dropdown — the arrow/caret opens the whole list of 254.
//
// Native <datalist> also does the things a hand-rolled combobox usually gets wrong:
// it works with a keyboard, it works with a screen reader, it works on mobile, and it
// does not trap the value — anything the customer types is still accepted, which is
// the whole point after the Comal County lead we lost in September 2026. See
// lib/geo/texas-counties.ts.
//
// Rendering the same id more than once on a page is harmless (an input resolves the
// first match), but prefer one per form.

import { TEXAS_COUNTIES, TEXAS_COUNTY_DATALIST_ID } from '@/lib/geo/texas-counties';

interface TexasCountyDatalistProps {
  /** Override the element id — only needed if a page somehow renders two different lists. */
  id?: string;
}

export default function TexasCountyDatalist({
  id = TEXAS_COUNTY_DATALIST_ID,
}: TexasCountyDatalistProps): React.ReactElement {
  return (
    <datalist id={id}>
      {TEXAS_COUNTIES.map((county) => (
        <option key={county} value={county} />
      ))}
    </datalist>
  );
}
