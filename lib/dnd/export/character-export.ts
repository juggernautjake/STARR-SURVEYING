// lib/dnd/export/character-export.ts — full character-sheet EXPORT (owner 2026-07-18: "export character sheets
// with literally everything on them — PDF, JSON, and HTML"). Pure + framework-free so it's testable and runs
// the same on the server route and in any caller.
//
//   • characterToJson  — the complete character record, pretty-printed (the loss-less machine format).
//   • characterToHtml  — a SELF-CONTAINED, styled HTML document that deep-renders EVERY field of the character
//     data (nothing hand-picked, so nothing is missed), plus the name/system/bio/art. "Save as PDF" from the
//     browser's print dialog turns this same HTML into the PDF (print CSS included) — no server render, no deps.
//
// The deep renderer is the "literally everything" guarantee: it walks the whole data object generically
// (humanised headings, tables for arrays of objects, definition lists for objects), so a field the sheet UI
// doesn't surface still lands in the export.

export interface CharacterExport {
  name: string;
  system?: string | null;
  sheet_type?: string | null;
  /** Already-resolved image sources (data URIs when the route inlines them, else the original url). */
  artSrc?: string | null;
  tokenSrc?: string | null;
  bio?: Record<string, unknown> | null;
  data: unknown;
  updatedAt?: string | null;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Turn a snake/camel key into a human heading: "currentHp" → "Current Hp", "save_dc" → "Save Dc". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A value is "empty" (skipped so the export isn't littered with blanks): null/undefined/''/[], or an
 *  array/object whose every element/value is itself empty (recursively) — so a section of all-blank fields is
 *  dropped, not rendered as a header over a wall of dashes. */
function isEmpty(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.every(isEmpty);
  if (isPlainObject(v)) return Object.values(v).every(isEmpty);
  return false;
}

/** Render any value to HTML: primitives inline, arrays as tables/lists, objects as definition lists. Recursive
 *  (depth-guarded against pathological nesting) so the WHOLE data tree renders — nothing is dropped. */
export function renderValue(value: unknown, depth = 0): string {
  if (depth > 12) return esc(JSON.stringify(value)); // safety valve; real character data is shallow
  if (value == null || value === '') return '<span class="muted">—</span>';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || typeof value === 'string') return esc(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="muted">—</span>';
    // Array of objects → a table with the union of keys.
    if (value.every(isPlainObject)) {
      const cols = Array.from(new Set(value.flatMap((o) => Object.keys(o as object))));
      const head = cols.map((c) => `<th>${esc(humanizeKey(c))}</th>`).join('');
      const rows = (value as Record<string, unknown>[])
        .map((o) => `<tr>${cols.map((c) => `<td>${renderValue(o[c], depth + 1)}</td>`).join('')}</tr>`)
        .join('');
      return `<table class="rows"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    // Array of primitives → comma list; array of mixed/nested → bulleted.
    if (value.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      return value.map((v) => esc(v)).join(', ');
    }
    return `<ul>${value.map((v) => `<li>${renderValue(v, depth + 1)}</li>`).join('')}</ul>`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => !isEmpty(v));
    if (entries.length === 0) return '<span class="muted">—</span>';
    const rows = entries
      .map(([k, v]) => `<div class="kv"><dt>${esc(humanizeKey(k))}</dt><dd>${renderValue(v, depth + 1)}</dd></div>`)
      .join('');
    return `<dl>${rows}</dl>`;
  }
  return esc(String(value));
}

/** Each top-level key of `data` becomes a titled section (the sheet's major areas — abilities, combat, skills,
 *  spells, inventory, features…), so the document reads as sections, not one giant blob. */
function dataSections(data: unknown): string {
  if (!isPlainObject(data)) return `<section><div class="body">${renderValue(data)}</div></section>`;
  return Object.entries(data)
    .filter(([, v]) => !isEmpty(v))
    .map(([k, v]) => `<section><h2>${esc(humanizeKey(k))}</h2><div class="body">${renderValue(v, 1)}</div></section>`)
    .join('');
}

/** The complete character record as pretty JSON (loss-less). */
export function characterToJson(ch: CharacterExport): string {
  return JSON.stringify(
    { name: ch.name, system: ch.system ?? null, sheet_type: ch.sheet_type ?? null, updatedAt: ch.updatedAt ?? null, bio: ch.bio ?? null, data: ch.data },
    null,
    2,
  );
}

/** A safe, lower-kebab file base from the character name (for the download filename). */
export function exportFileBase(name: string): string {
  const slug = (name || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'character';
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5; }
.sheet { max-width: 900px; margin: 0 auto; }
header.top { display: flex; gap: 20px; align-items: center; border-bottom: 3px solid #b8912f; padding-bottom: 16px; margin-bottom: 20px; }
header.top img { width: 96px; height: 96px; object-fit: cover; border-radius: 10px; border: 2px solid #b8912f; }
header.top h1 { margin: 0 0 4px; font-size: 28px; }
header.top .sub { color: #6a6a6a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
section { margin: 0 0 18px; break-inside: avoid; }
section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: #8a6d1f; border-bottom: 1px solid #e3d9bd; padding-bottom: 4px; margin: 0 0 10px; }
dl { margin: 0; display: grid; grid-template-columns: 1fr; gap: 6px; }
.kv { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: start; }
.kv dt { font-weight: 600; color: #444; }
.kv dd { margin: 0; }
table.rows { width: 100%; border-collapse: collapse; font-size: 13px; }
table.rows th { text-align: left; background: #f4efdf; color: #6a551c; padding: 5px 8px; border: 1px solid #e3d9bd; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
table.rows td { padding: 5px 8px; border: 1px solid #eee; vertical-align: top; }
ul { margin: 4px 0; padding-left: 20px; }
.muted { color: #aaa; }
.bio p { margin: 0 0 8px; white-space: pre-wrap; }
footer { margin-top: 24px; border-top: 1px solid #eee; padding-top: 10px; color: #999; font-size: 11px; }
@media print { body { padding: 0; } .sheet { max-width: none; } a { color: inherit; text-decoration: none; } }
`;

/** A self-contained, styled HTML document rendering EVERYTHING on the character. The browser's "Save as PDF"
 *  from Print turns this same document into the PDF (the print CSS is included). */
export function characterToHtml(ch: CharacterExport): string {
  const sub = [ch.system, ch.sheet_type].filter(Boolean).map((s) => humanizeKey(String(s))).join(' · ');
  const art = ch.artSrc || ch.tokenSrc;
  const bio = isPlainObject(ch.bio)
    ? Object.entries(ch.bio).filter(([, v]) => !isEmpty(v))
      .map(([k, v]) => `<section><h2>${esc(humanizeKey(k))}</h2><div class="body bio"><p>${esc(v)}</p></div></section>`).join('')
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ch.name)} — character sheet</title><style>${STYLE}</style></head>
<body><div class="sheet">
<header class="top">${art ? `<img src="${esc(art)}" alt="${esc(ch.name)}">` : ''}<div><h1>${esc(ch.name)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></header>
${dataSections(ch.data)}
${bio}
<footer>Exported from Starr Tabletop${ch.updatedAt ? ` · last updated ${esc(ch.updatedAt)}` : ''}</footer>
</div></body></html>`;
}
