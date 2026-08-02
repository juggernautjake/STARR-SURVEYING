'use client';
// app/AndrewAsh/_ui/FaqList.tsx — the questions widget.
//
// Built on <details>/<summary> rather than on React state and a div. Three things come free that a
// hand-rolled accordion has to be given deliberately, and usually is not:
//
//   · Keyboard operation (Enter/Space toggles) and the correct screen-reader announcement.
//   · Browser find-in-page reaches text inside a CLOSED <details> in every current browser and opens
//     it. A div with `display: none` is invisible to Ctrl+F, so a visitor searching for "cancel"
//     concludes the answer is not on the page.
//   · It works before hydration. On a portfolio the FAQ is often the last thing on a long page, and
//     the visitor may well reach it before the JavaScript does.
//
// `openFirst` opens the top item on load, so the pattern is legible at a glance — an accordion where
// everything is shut reads as a list of links until you happen to click one.

import { ChevronDown } from 'lucide-react';

interface Props {
  items: { q: string; a: string }[];
  collapsible?: boolean;
  openFirst?: boolean;
}

export default function FaqList({ items, collapsible = true, openFirst = true }: Props): React.ReactElement | null {
  if (!items.length) return null;

  // Not collapsible: render as plain headed paragraphs. Wrapping always-open content in <details>
  // would leave a disclosure triangle that does nothing.
  if (!collapsible) {
    return (
      <div className="vaFaq">
        {items.map((item, i) => (
          <div key={i} className="vaFaqStatic">
            <h3 className="vaFaqQ">{item.q}</h3>
            <p className="vaFaqA">{item.a}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="vaFaq">
      {items.map((item, i) => (
        <details key={i} className="vaFaqItem" open={openFirst && i === 0}>
          <summary className="vaFaqQ">
            <span>{item.q}</span>
            <ChevronDown size={17} aria-hidden className="vaFaqChevron" />
          </summary>
          <p className="vaFaqA">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
