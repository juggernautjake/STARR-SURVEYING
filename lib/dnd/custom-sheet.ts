// lib/dnd/custom-sheet.ts — the AI-built custom character sheet (Phase V, Slice 6).
//
// A character sheet the AI composes from reusable **building blocks** instead of a
// hand-authored skin. The blocks + an optional CSS string are stored per character
// (`dnd_characters.custom_layout` / `custom_css`); this module turns them into a
// single sanitized HTML document that the sheet engine renders inside a locked-down
// sandboxed <iframe srcdoc> (no scripts, no same-origin) — the same untrusted-HTML
// pattern the map tools use (labels.js `htmlFrameSrcdoc`). So an AI-authored sheet
// can never execute code or reach the app around it, and malformed blocks degrade to
// nothing rather than crashing the page.
//
// Slice 6 is presentational (the AI resolves content into the blocks). Binding blocks
// to the live character `data` for editable inputs that save is a later slice (11);
// the block model here is deliberately forward-compatible with that.

/** The building blocks the AI may compose a sheet from. Every text field is escaped
 *  on compose; `html` is the escape hatch (sanitized: scripts/handlers stripped). */
export type CustomBlock =
  | { type: 'heading'; text: string; sub?: string }
  | { type: 'text'; text: string }
  | { type: 'divider' }
  | { type: 'note'; text: string; tone?: 'info' | 'warn' | 'good' }
  | { type: 'stats'; title?: string; items: { label: string; value: string | number }[] }
  | { type: 'list'; title?: string; items: string[]; ordered?: boolean }
  | { type: 'table'; title?: string; columns: string[]; rows: (string | number)[][] }
  | { type: 'html'; html: string; title?: string };

export interface CustomSheetLayout {
  /** Optional page title shown at the top of the sheet. */
  title?: string;
  blocks: CustomBlock[];
}

/** HTML-escape a text value for safe interpolation into element content/attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip scripts, event handlers, and javascript: URLs from an AI/user-authored HTML
 *  block. This is defense-in-depth — the iframe is already `sandbox`ed with no scripts
 *  — but it keeps obviously-active markup out of the composed document entirely. */
export function sanitizeBlockHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*script\b[^>]*>/gi, '')
    .replace(/<\s*(iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

/** Keep only the recognized block shapes with the fields they require — the AI (or a
 *  corrupt row) can't smuggle an unknown block type or a malformed one into the DOM. */
export function normalizeLayout(raw: unknown): CustomSheetLayout {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const blocksIn = Array.isArray(obj.blocks) ? obj.blocks : Array.isArray(raw) ? (raw as unknown[]) : [];
  const blocks: CustomBlock[] = [];
  for (const b of blocksIn) {
    if (!b || typeof b !== 'object') continue;
    const t = (b as { type?: unknown }).type;
    const rec = b as Record<string, unknown>;
    switch (t) {
      case 'heading':
        blocks.push({ type: 'heading', text: String(rec.text ?? ''), sub: rec.sub != null ? String(rec.sub) : undefined });
        break;
      case 'text':
        blocks.push({ type: 'text', text: String(rec.text ?? '') });
        break;
      case 'divider':
        blocks.push({ type: 'divider' });
        break;
      case 'note': {
        const tone = rec.tone === 'warn' || rec.tone === 'good' ? rec.tone : 'info';
        blocks.push({ type: 'note', text: String(rec.text ?? ''), tone });
        break;
      }
      case 'stats': {
        const items = (Array.isArray(rec.items) ? rec.items : [])
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => ({ label: String(x.label ?? ''), value: (x.value as string | number) ?? '' }));
        blocks.push({ type: 'stats', title: rec.title != null ? String(rec.title) : undefined, items });
        break;
      }
      case 'list': {
        const items = (Array.isArray(rec.items) ? rec.items : []).map((x) => String(x ?? ''));
        blocks.push({ type: 'list', title: rec.title != null ? String(rec.title) : undefined, items, ordered: !!rec.ordered });
        break;
      }
      case 'table': {
        const columns = (Array.isArray(rec.columns) ? rec.columns : []).map((x) => String(x ?? ''));
        const rows = (Array.isArray(rec.rows) ? rec.rows : [])
          .filter((r): r is unknown[] => Array.isArray(r))
          .map((r) => r.map((c) => (c as string | number) ?? ''));
        blocks.push({ type: 'table', title: rec.title != null ? String(rec.title) : undefined, columns, rows });
        break;
      }
      case 'html':
        blocks.push({ type: 'html', html: String(rec.html ?? ''), title: rec.title != null ? String(rec.title) : undefined });
        break;
      default:
        // Unknown block type — drop it rather than render arbitrary structure.
        break;
    }
  }
  return { title: obj.title != null ? String(obj.title) : undefined, blocks };
}

function blockToHtml(b: CustomBlock): string {
  switch (b.type) {
    case 'heading':
      return `<header class="cs-heading"><h1>${escapeHtml(b.text)}</h1>${b.sub ? `<p class="cs-sub">${escapeHtml(b.sub)}</p>` : ''}</header>`;
    case 'text':
      return `<p class="cs-text">${escapeHtml(b.text)}</p>`;
    case 'divider':
      return `<hr class="cs-divider">`;
    case 'note':
      return `<div class="cs-note cs-note-${b.tone ?? 'info'}">${escapeHtml(b.text)}</div>`;
    case 'stats':
      return (
        `<section class="cs-card">` +
        (b.title ? `<h2>${escapeHtml(b.title)}</h2>` : '') +
        `<dl class="cs-stats">` +
        b.items.map((it) => `<div class="cs-stat"><dt>${escapeHtml(it.label)}</dt><dd>${escapeHtml(it.value)}</dd></div>`).join('') +
        `</dl></section>`
      );
    case 'list':
      return (
        `<section class="cs-card">` +
        (b.title ? `<h2>${escapeHtml(b.title)}</h2>` : '') +
        `<${b.ordered ? 'ol' : 'ul'} class="cs-list">` +
        b.items.map((it) => `<li>${escapeHtml(it)}</li>`).join('') +
        `</${b.ordered ? 'ol' : 'ul'}></section>`
      );
    case 'table':
      return (
        `<section class="cs-card">` +
        (b.title ? `<h2>${escapeHtml(b.title)}</h2>` : '') +
        `<table class="cs-table"><thead><tr>` +
        b.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
        `</tr></thead><tbody>` +
        b.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('') +
        `</tbody></table></section>`
      );
    case 'html':
      return `<section class="cs-card">${b.title ? `<h2>${escapeHtml(b.title)}</h2>` : ''}<div class="cs-html">${sanitizeBlockHtml(b.html)}</div></section>`;
  }
}

// The Hextech-flavored base styles for a composed sheet, scoped inside the iframe
// document (the iframe is its own document, so these can't leak to the app). The AI's
// `custom_css` is appended after and can override any of it.
const BASE_CSS = `
:root{--hx-bg:#0a1428;--hx-panel:#0b1a2c;--hx-line:#1e3a52;--hx-gold:#c8aa6e;--hx-gold-2:#f0e6d2;--hx-teal:#0ac8b9;--hx-text:#cdd9e5;--hx-muted:#7a8ba0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--hx-text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5}
.cs-root{padding:16px;display:grid;gap:14px}
.cs-heading h1{margin:0;font-size:26px;letter-spacing:.02em;color:var(--hx-gold-2);text-shadow:0 0 12px rgba(10,200,185,.25)}
.cs-sub{margin:4px 0 0;color:var(--hx-gold);font-size:13px}
.cs-text{margin:0;color:var(--hx-text)}
.cs-divider{border:0;border-top:1px solid var(--hx-line);margin:2px 0}
.cs-note{padding:10px 12px;border-left:3px solid var(--hx-teal);background:rgba(10,200,185,.06);border-radius:4px;font-size:13px}
.cs-note-warn{border-left-color:#e0a83a;background:rgba(224,168,58,.08)}
.cs-note-good{border-left-color:#5bd67a;background:rgba(91,214,122,.08)}
.cs-card{background:linear-gradient(180deg,rgba(11,26,44,.9),rgba(8,20,36,.9));border:1px solid var(--hx-line);border-radius:8px;padding:14px 16px}
.cs-card h2{margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--hx-gold)}
.cs-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:0}
.cs-stat{background:rgba(1,10,19,.5);border:1px solid var(--hx-line);border-radius:6px;padding:8px 10px}
.cs-stat dt{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--hx-muted)}
.cs-stat dd{margin:2px 0 0;font-size:18px;font-weight:600;color:var(--hx-gold-2)}
.cs-list{margin:0;padding-left:18px;display:grid;gap:4px}
.cs-table{width:100%;border-collapse:collapse;font-size:13px}
.cs-table th,.cs-table td{border:1px solid var(--hx-line);padding:6px 9px;text-align:left}
.cs-table th{background:rgba(200,170,110,.1);color:var(--hx-gold);text-transform:uppercase;font-size:11px;letter-spacing:.06em}
.cs-html img{max-width:100%;height:auto}
`;

/** Compose a stored layout + CSS into one sanitized HTML document for an <iframe srcdoc>.
 *  Every text value is escaped; `html` blocks are sanitized; the CSS is placed in the
 *  iframe's own <style> so it can't touch the surrounding app. */
export function composeCustomSheet(rawLayout: unknown, customCss?: string | null): string {
  const layout = normalizeLayout(rawLayout);
  const body =
    (layout.title ? `<header class="cs-heading"><h1>${escapeHtml(layout.title)}</h1></header>` : '') +
    layout.blocks.map(blockToHtml).join('');
  // The AI's CSS is untrusted text: strip anything that could break out of a <style>
  // element — a closing tag or an injected script/tag — so it can only ever be
  // interpreted as style rules.
  const safeCss = String(customCss ?? '')
    .replace(/<\s*\/\s*style/gi, '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, '');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${BASE_CSS}${safeCss}</style></head>` +
    `<body><div class="cs-root">${body}</div></body></html>`
  );
}

/** True when a character has a usable custom layout (at least one valid block). */
export function hasCustomLayout(rawLayout: unknown): boolean {
  return normalizeLayout(rawLayout).blocks.length > 0;
}
