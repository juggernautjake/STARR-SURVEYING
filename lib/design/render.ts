// lib/design/render.ts — turning a placed element into HTML.
//
// One renderer serves three consumers, which is the point: the canvas, the HTML export and the
// standalone file all produce the SAME markup. A canvas that draws one thing and an export that
// writes another is a tool whose output nobody can trust.

import type { CatalogueEntry } from './catalogue/types';
import type { DesignElement } from './document';
import { isWidgetElement, widgetIdOf } from './widget-palette';

/** Escape for text that lands inside markup. Slot values are typed by a person, and a person will
 *  eventually type `<`. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** camelCase → kebab-case, for style objects written the React way. */
export function cssProp(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** A style object → a `style="…"` declaration string. Empty values are dropped rather than emitted
 *  as `prop:;`, which some browsers keep and some discard. */
export function styleString(style: Record<string, string | number | undefined>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${cssProp(k)}: ${typeof v === 'number' ? `${v}px` : v}`)
    .join('; ');
}

/**
 * Fill an entry's slots with an element's values.
 *
 * A slot with no value falls back to its default rather than rendering `{{label}}` — a mockup with
 * template syntax visible in it is a mockup somebody has to apologise for in the meeting.
 */
export function fillSlots(entry: CatalogueEntry, element: DesignElement): string {
  return entry.html.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const slot = entry.slots.find((s) => s.name === name);
    const raw = element.slots[name] ?? slot?.default ?? '';
    return escapeHtml(raw);
  });
}

/** The classes an element wears: the entry's base, or the chosen variant's. */
export function classesFor(entry: CatalogueEntry, element: DesignElement): string[] {
  if (element.variant) {
    const variant = entry.variants.find((v) => v.id === element.variant);
    if (variant) return variant.classes;
  }
  return entry.classes;
}

/**
 * The markup for one placed element, WITHOUT its positioning wrapper.
 *
 * Positioning is the canvas's business and the export's business separately: on the canvas an
 * element is absolutely placed inside a scaled artboard, and in the exported HTML it is absolutely
 * placed inside a plain div. Keeping the two apart means the element's own markup — the part that
 * says "this is a `.admin-btn--primary`" — is identical in both.
 */
export function renderElement(entry: CatalogueEntry | undefined, element: DesignElement): string {
  // ── A PLACED WIDGET IS A NAMED BOX, DELIBERATELY — W2 ────────────────────────────────────────
  //
  // A widget has no catalogue entry and never will: it is a live React component that fetches its
  // own data. Rendering the real one here would give the editor a second way of drawing a widget
  // beside the page's, and two renderers of one thing drifting apart is the defect this entire plan
  // exists to close.
  //
  // A named box is also the honest picture of what was recorded. Placing a widget stores a CHOICE —
  // "this widget, this size, here" — and that is exactly what the box shows. What it must NOT do is
  // fall through to the `ds-missing` "?" below: a deliberate placement and an unknown element would
  // then look identical on the canvas, and the widget would read as a mistake.
  if (isWidgetElement(element.catalogId)) {
    const id = widgetIdOf(element.catalogId)!;
    const label = element.name?.trim() || id;
    return `<div class="ds-widget" title="${escapeHtml(label)} — a live widget. The page renders the real one."`
      + `><span class="ds-widget__label">${escapeHtml(label)}</span>`
      + `<span class="ds-widget__id">${escapeHtml(id)}</span></div>`;
  }
  if (!entry) {
    return `<div class="ds-missing" title="Unknown element: ${escapeHtml(element.catalogId ?? '')}">?</div>`;
  }
  let html = fillSlots(entry, element);

  const classes = classesFor(entry, element);
  const base = entry.classes[0];
  if (base && classes.join(' ') !== entry.classes.join(' ')) {
    // Swap the base class list for the variant's, on the outermost tag only.
    html = html.replace(`class="${entry.classes.join(' ')}"`, `class="${classes.join(' ')}"`);
  }

  const style = styleString(element.style);
  if (style) {
    // Merge into an existing style attribute if the template already has one, rather than emitting
    // two — the second is ignored and the bug looks like "my colour did not apply".
    html = /(<[a-zA-Z][^>]*?)\sstyle="([^"]*)"/.test(html)
      ? html.replace(/(<[a-zA-Z][^>]*?)\sstyle="([^"]*)"/, (_m, head: string, existing: string) => `${head} style="${existing}; ${style}"`)
      : html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9]*)/, `$1 style="${style}"`);
  }
  return html;
}

/** The wrapper that positions an element on an artboard. Shared by canvas and export so a design
 *  cannot look different in the file than it did on screen. */
export function positionStyle(element: DesignElement, entry?: CatalogueEntry): Record<string, string> {
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.w}px`,
    zIndex: String(element.z),
  };
  // ── Content-height elements are as tall as their words ──────────────────────────────────────
  //
  // A paragraph, a title, a breadcrumb: in production these are exactly as tall as their text, and
  // pinning them to a frame height strands the text at the top of dead space. The catalogue has
  // recorded `size.contentHeight` since the first curation pass and NOTHING HAS EVER READ IT —
  // which is why the measurement found 27 entries whose editor height had no relationship to the
  // height the same markup takes in the app.
  //
  // `minHeight` rather than nothing, so a resized element still holds the space it was given while
  // being free to grow past it.
  const contentHeight = entry?.size.contentHeight === true;
  if (element.h > 0) style[contentHeight ? 'minHeight' : 'height'] = `${element.h}px`;
  if (element.rotation) style.transform = `rotate(${element.rotation}deg)`;
  if (element.hidden) style.display = 'none';
  return style;
}
