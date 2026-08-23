// lib/design/export.ts — the three artifacts a design turns into.
//
// Owner: *"Once I fully build out the desktop version and mobile version of the page, I will save
// the screenshots and the html and I will come back to you and have you adjust the page to be
// exactly like what I want based on the file and the screenshot."*
//
// So the export is not a nicety at the end — it IS the handoff, and its quality decides whether the
// next conversation starts with building or with twenty questions. Four files:
//
//   design.html      standalone, opens from a file:// URL, one per view
//   design.css       the same markup with a linked stylesheet, for reading or tweaking by hand
//   design.json      the spec: every element, its REAL CLASS NAMES, geometry, content and notes
//   PROMPT.md        a brief that references the other three and states the intent in prose
//
// The JSON is the one that makes the build unambiguous. A screenshot cannot say "this is
// `.job-detail__action--ghost`, 40px, and on the phone it moves below the title" — and every
// ambiguity it leaves is a round trip.

import type { CatalogueEntry } from './catalogue/types';
import type { DesignDocument, DesignElement, DesignView, ViewId } from './document';
import { classesFor, positionStyle, renderElement, styleString, escapeHtml } from './render';

export interface ExportContext {
  /** Resolves a catalogue id. Passed in rather than imported so the exporter stays pure and
   *  testable with a stub catalogue. */
  getEntry: (id: string) => CatalogueEntry | undefined;
  /** Marks entries that are notes ABOUT the design rather than part of it. */
  isAnnotation: (id: string) => boolean;
  /** Stamped rather than read from a clock, so the same document always exports identically. */
  now: string;
}

const VIEW_LABEL: Record<ViewId, string> = { desktop: 'Desktop', mobile: 'Mobile' };

function contentHeightOf(view: DesignView): number {
  return Math.max(view.height, view.elements.reduce((max, el) => Math.max(max, el.y + el.h), 0) + 40);
}

/** One element, wrapped and positioned. Shared by both HTML forms. */
function renderPlaced(el: DesignElement, ctx: ExportContext): string {
  const entry = el.catalogId ? ctx.getEntry(el.catalogId) : undefined;
  const inner = renderElement(entry, el);
  const wrapper = styleString(positionStyle(el));
  const label = el.name ?? entry?.label ?? el.kind;
  return `    <div class="ds-el" data-element-id="${escapeHtml(el.id)}" data-catalog="${escapeHtml(el.catalogId ?? '')}" data-name="${escapeHtml(label)}" style="${wrapper}">${inner}</div>`;
}

/**
 * The minimum stylesheet a mockup needs to stand up on its own.
 *
 * Deliberately NOT the app's 50,000 lines: an export nobody can open without the repo is an export
 * that only works here. What it carries is the token values the entries reference, the shape
 * primitives, and the artboard frame. Everything else comes from the entry's own inline styles.
 */
export function baseStylesheet(): string {
  return `:root {
  --color-brand-navy: #1D3095;
  --color-brand-navy-d: #152050;
  --color-brand-red: #BD1218;
  --color-text-primary: #0F1419;
  --color-text-secondary: #374151;
  --color-text-tertiary: #6B7280;
  --color-text-muted: #9CA3AF;
  --color-text-on-brand: #FFFFFF;
  --color-bg-card: #FFFFFF;
  --color-bg-app: #F3F4F6;
  --color-bg-subtle: #F3F4F6;
  --color-border: #E5E7EB;
  --color-border-strong: #D1D5DB;
  --color-success: #10B981;
  --color-error: #EF4444;
  --color-error-text: #B42318;
  --button-height: 40px;
  --button-height-sm: 32px;
  --border-light: 1px solid #E5E7EB;
  --theme-bg-surface: #FFFFFF;
  --theme-border: #E5E7EB;
  --theme-fg-secondary: #374151;
  --theme-fg-muted: #9CA3AF;
}
* { box-sizing: border-box; }
body { margin: 0; background: #EEF0F6; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--color-text-primary); }
.ds-artboard { position: relative; margin: 24px auto; background: var(--color-bg-app); box-shadow: 0 8px 32px rgba(15,20,25,.16); overflow: hidden; }
.ds-artboard__label { font: 600 12px/1 'Inter', sans-serif; color: #6B7280; text-align: center; padding-top: 20px; }
.ds-el { position: absolute; }

/* Buttons */
.admin-btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; padding:.55rem 1.15rem; font-family:'Inter',sans-serif; font-size:.85rem; font-weight:600; border-radius:6px; cursor:pointer; border:2px solid transparent; width:100%; height:100%; }
.admin-btn--primary { background:var(--color-brand-red); color:#FFF; border-color:var(--color-brand-red); }
.admin-btn--secondary { background:var(--color-brand-navy); color:#FFF; border-color:var(--color-brand-navy); }
.admin-btn--ghost { background:transparent; color:var(--color-text-tertiary); border-color:var(--color-border); }
.admin-btn--success { background:#10B981; color:#FFF; border-color:#10B981; }
.admin-btn--sm { padding:.35rem .75rem; font-size:.78rem; }
.admin-btn--lg { padding:.7rem 1.5rem; font-size:.95rem; }
.jobs-page__btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; padding:.5rem 1rem; font-size:.85rem; font-weight:600; border-radius:8px; border:1px solid var(--color-border); background:#fff; cursor:pointer; width:100%; height:100%; }
.jobs-page__btn--primary { background:var(--color-brand-navy); color:#fff; border-color:var(--color-brand-navy); }
.jobs-page__btn--secondary { background:#fff; color:var(--color-brand-navy); border-color:var(--color-brand-navy); }
.jobs-page__btn--danger { background:#fff; color:var(--color-error-text); border-color:#FCA5A5; }
.job-detail__action { display:inline-flex; align-items:center; justify-content:center; gap:.35rem; min-height:var(--button-height); padding:0 .9rem; border-radius:8px; font-size:13px; font-weight:600; border:1px solid transparent; background:transparent; cursor:pointer; width:100%; height:100%; }
.job-detail__action--primary { color:#fff; background:var(--color-brand-navy); border-color:var(--color-brand-navy); }
.job-detail__action--ghost { color:var(--color-brand-navy); border-color:var(--color-brand-navy); }
.job-detail__action--danger { color:var(--color-error-text); border-color:#FCA5A5; }
.job-detail__action--quiet { color:var(--color-text-secondary); border-color:var(--color-border); background:#fff; }
.learn__back { display:inline-flex; align-items:center; gap:.35rem; font-size:.82rem; font-weight:500; color:var(--color-brand-navy); text-decoration:none; }
.fx__icon-btn { display:inline-flex; align-items:center; justify-content:center; width:100%; height:100%; border:1px solid var(--color-border); border-radius:8px; background:#fff; cursor:pointer; }

/* Text */
.job-detail__name { margin:0; font-family:'Sora',sans-serif; font-size:1.35rem; font-weight:700; color:var(--color-text-primary); }
.pd__card-title { margin:0; font-family:'Sora',sans-serif; font-size:.9rem; font-weight:600; color:var(--color-brand-navy); }
.job-detail__meta { margin:0; font-size:.85rem; color:var(--color-text-tertiary); }

/* Forms */
.job-form__field { display:flex; flex-direction:column; min-width:0; }
.job-form__label { font-size:.8rem; font-weight:500; color:var(--theme-fg-secondary); margin-bottom:.25rem; }
.job-form__input, .job-form__textarea { padding:.5rem .65rem; border:var(--border-light); border-radius:6px; font-size:.85rem; font-family:inherit; min-width:0; max-width:100%; background:#fff; }
.job-form__textarea { resize:vertical; min-height:64px; }

/* Surfaces */
.admin-card { background:var(--theme-bg-surface); border-radius:10px; padding:1.25rem; border:1px solid var(--theme-border); width:100%; height:100%; }
.admin-empty { text-align:center; padding:3rem 2rem; background:var(--theme-bg-surface); border:1px dashed var(--color-border-strong); border-radius:10px; width:100%; height:100%; }
.admin-empty__icon { font-size:2.5rem; margin-bottom:.75rem; }
.admin-empty__title { font-family:'Sora',sans-serif; font-size:1.05rem; font-weight:600; color:var(--color-text-primary); margin-bottom:.35rem; }
.admin-empty__desc { font-size:.85rem; color:var(--theme-fg-muted); }
.admin-table-wrap { width:100%; height:100%; overflow:auto; background:#fff; border:1px solid var(--color-border); border-radius:10px; }
${dsPrimitiveStyles()}`;
}

/**
 * The rules for classes the APP DOES NOT DEFINE — the shape primitives, the studio's own table and
 * toolbar, the free-text block, the missing-element marker.
 *
 * Split out because the canvas needs exactly these and nothing else. The canvas renders inside the
 * real app, so `.admin-btn` and `.job-form__input` are already styled by the real stylesheets — that
 * is the whole reason there is no iframe. But `.ds-shape--rect` exists nowhere except here, and
 * without this a red rectangle would render as an unstyled div. One definition, two consumers, so
 * the canvas and the exported file cannot disagree about what a rectangle looks like.
 */
export function dsPrimitiveStyles(): string {
  return `/* Shapes and studio primitives */
.ds-shape { width:100%; height:100%; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
.ds-shape--rect { background:#EF4444; border-radius:8px; }
.ds-shape--ellipse { background:#1D3095; border-radius:50%; }
.ds-shape--line { background:#1F2937; }
.ds-shape--text { justify-content:flex-start; font-size:16px; color:#0F1419; }
.ds-shape--sticky { background:#FEF3C7; border-radius:4px; padding:12px; font-size:13px; line-height:1.45; align-items:flex-start; justify-content:flex-start; text-align:left; box-shadow:0 2px 6px rgba(0,0,0,.12); }
.ds-shape--arrow { background:transparent; position:relative; }
.ds-shape__arrow-line { position:absolute; left:0; right:10px; top:50%; height:2px; background:currentColor; }
.ds-shape__arrow-head { position:absolute; right:0; top:50%; transform:translateY(-50%); width:0; height:0; border-top:6px solid transparent; border-bottom:6px solid transparent; border-left:10px solid currentColor; }
.ds-text-body { margin:0; font-size:.9rem; line-height:1.55; color:#374151; }
.ds-table { width:100%; border-collapse:collapse; font-size:.85rem; background:#fff; }
.ds-table th { text-align:left; padding:.6rem .75rem; background:#F7F8FC; font-size:.74rem; text-transform:uppercase; letter-spacing:.04em; color:#8A90A2; }
.ds-table td { padding:.6rem .75rem; border-top:1px solid #F1F2F7; }
.ds-toolbar { display:flex; align-items:center; gap:.75rem; padding:.65rem 1rem; background:#fff; border:1px solid #E5E7EB; border-radius:10px; width:100%; height:100%; }
.ds-missing { border:1px dashed #DC2626; color:#DC2626; display:flex; align-items:center; justify-content:center; width:100%; height:100%; font-size:20px; }

/* Composed shapes the app draws per page rather than from a shared class. Each one being a studio
 * primitive is itself a finding: four separate skeletons, a switch written twice, a banner written
 * per page. They are catalogued here so a mockup can ask for the ONE version. */
.ds-dialog { display:flex; flex-direction:column; gap:.6rem; width:100%; height:100%; box-shadow:0 12px 40px rgba(15,20,25,.18); }
.ds-dialog__actions { display:flex; gap:.5rem; justify-content:flex-end; margin-top:auto; }
.ds-dialog__actions .admin-btn { width:auto; height:auto; }
.ds-switch { display:inline-flex; align-items:center; gap:.6rem; width:100%; height:100%; font-size:.85rem; color:#374151; cursor:pointer; }
.ds-switch__track { position:relative; flex:none; width:40px; height:22px; border-radius:999px; background:#1D3095; }
.ds-switch__knob { position:absolute; top:2px; left:20px; width:18px; height:18px; border-radius:50%; background:#fff; }
.ds-avatar { display:inline-flex; align-items:center; justify-content:center; width:100%; height:100%; border-radius:50%; background:#1D3095; color:#fff; font-weight:700; font-size:.85rem; }
.ds-file-row { display:flex; align-items:center; gap:.6rem; width:100%; height:100%; padding:0 .75rem; background:#fff; border:1px solid #E5E7EB; border-radius:8px; font-size:.85rem; }
.ds-file-row__name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; color:#152050; }
.ds-file-row__meta { color:#9CA3AF; font-size:.78rem; white-space:nowrap; }
.ds-skeleton { display:flex; flex-direction:column; gap:.5rem; width:100%; height:100%; justify-content:center; }
.ds-skeleton span { display:block; height:12px; border-radius:6px; background:linear-gradient(90deg,#EEF0F6,#F7F8FC,#EEF0F6); }
.ds-skeleton span:nth-child(1) { width:70%; }
.ds-skeleton span:nth-child(2) { width:92%; }
.ds-skeleton span:nth-child(3) { width:55%; }
.ds-banner { display:flex; align-items:center; gap:.6rem; width:100%; height:100%; padding:.75rem 1rem; background:#F7F8FC; border-left:3px solid #1D3095; border-radius:8px; font-size:.88rem; color:#374151; }
.ds-banner__icon { font-size:1.1rem; flex:none; }
.notif-toast { display:flex; align-items:center; width:100%; height:100%; padding:.75rem 1rem; background:#152050; color:#fff; border-radius:10px; box-shadow:0 8px 24px rgba(15,20,25,.24); font-size:.85rem; }
.tl-tabs { display:flex; gap:.25rem; width:100%; height:100%; border-bottom:1px solid #E5E7EB; }
.tl-tabs__btn { height:var(--button-height); padding:0 1.1rem; border:none; background:transparent; font:inherit; font-size:.9rem; font-weight:600; color:#6B7280; cursor:pointer; border-bottom:2px solid transparent; }
.tl-tabs__btn.is-on { color:#1D3095; border-bottom-color:#1D3095; }
.admin-page-header__crumbs { display:flex; align-items:center; gap:.35rem; width:100%; font-size:.82rem; }
.admin-page-header__crumb { color:#1D3095; text-decoration:none; font-weight:500; }
.admin-page-header__crumb--active { color:#6B7280; font-weight:600; }
.admin-page-header__crumb-sep { color:#9AA1B4; }
.job-detail__stat { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; text-align:center; }
.job-detail__stat-value { font-size:1.15rem; font-weight:700; color:#1D3095; }
.job-detail__stat-label { font-size:.7rem; color:#9CA3AF; text-transform:uppercase; letter-spacing:.03em; }
.job-form__checkbox-label { display:flex; align-items:center; gap:.5rem; font-size:.85rem; color:#374151; }
.job-form__section-title { margin:0 0 .75rem; font-size:.95rem; font-weight:600; color:#374151; }`;
}

/** One view as a body fragment. */
function renderViewBody(doc: DesignDocument, viewId: ViewId, ctx: ExportContext, includeAnnotations: boolean): string {
  const view = doc.views[viewId];
  const elements = [...view.elements]
    .filter((el) => includeAnnotations || !(el.annotation || (el.catalogId && ctx.isAnnotation(el.catalogId))))
    .sort((a, b) => a.z - b.z);
  const height = contentHeightOf(view);
  return [
    `  <div class="ds-artboard__label">${VIEW_LABEL[viewId]} — ${view.width}×${height}</div>`,
    `  <div class="ds-artboard" style="width:${view.width}px; height:${height}px;">`,
    ...elements.map((el) => renderPlaced(el, ctx)),
    '  </div>',
  ].join('\n');
}

export interface HtmlExport {
  /** One standalone file per view, plus a combined one. */
  files: { name: string; content: string }[];
}

/**
 * HTML, in both the forms the owner asked for: standalone (styles inlined, opens from anywhere) and
 * a markup + stylesheet pair (for reading or tweaking by hand).
 */
export function exportHtml(doc: DesignDocument, ctx: ExportContext, options: { annotations?: boolean } = {}): HtmlExport {
  const includeAnnotations = options.annotations ?? true;
  const css = baseStylesheet();
  const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';

  const page = (title: string, body: string, styleTag: string) =>
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700&display=swap" rel="stylesheet" />
${styleTag}
</head>
<body>
${body}
</body>
</html>
`;

  const files: { name: string; content: string }[] = [];

  for (const viewId of ['desktop', 'mobile'] as ViewId[]) {
    files.push({
      name: `${slug}-${viewId}.html`,
      content: page(`${doc.name} — ${VIEW_LABEL[viewId]}`, renderViewBody(doc, viewId, ctx, includeAnnotations), `<style>\n${css}\n</style>`),
    });
  }

  files.push({
    name: `${slug}-both.html`,
    content: page(
      doc.name,
      `<div style="display:flex; gap:32px; align-items:flex-start; justify-content:center; flex-wrap:wrap;">
  <div>${renderViewBody(doc, 'desktop', ctx, includeAnnotations)}</div>
  <div>${renderViewBody(doc, 'mobile', ctx, includeAnnotations)}</div>
</div>`,
      `<style>\n${css}\n</style>`,
    ),
  });

  // The pair: same markup, linked stylesheet.
  files.push({ name: `${slug}.css`, content: css });
  files.push({
    name: `${slug}-linked.html`,
    content: page(doc.name, renderViewBody(doc, 'desktop', ctx, includeAnnotations), `<link rel="stylesheet" href="./${slug}.css" />`),
  });

  return { files };
}

export interface SpecElement {
  id: string;
  name: string;
  catalogId: string | null;
  /** THE REASON THIS EXPORT EXISTS: the real class names to use when building it. */
  classes: string[];
  variant: string | null;
  geometry: { x: number; y: number; w: number; h: number; z: number };
  content: Record<string, string>;
  styleOverrides: Record<string, string>;
  note?: string;
  /** Set when an element was styled outside the token set or has no class mapping — so the builder
   *  reads it at the top rather than discovering it halfway through. */
  offSystem?: string[];
}

export interface DesignSpec {
  name: string;
  route: string | null;
  exportedAt: string;
  views: Record<ViewId, {
    size: { width: number; height: number };
    grid: { size: number; snap: boolean };
    elements: SpecElement[];
    /** Notes ABOUT the design — never things to build. */
    annotations: { id: string; text: string; at: { x: number; y: number } }[];
  }>;
  warnings: string[];
}

const TOKEN_PATTERN = /var\(--/;

/** Style values that are not tokens, so the export can name them rather than let them pass. */
function offSystemProps(style: Record<string, string>): string[] {
  return Object.entries(style)
    .filter(([prop, value]) => /color|background|border/i.test(prop) && !TOKEN_PATTERN.test(value))
    .map(([prop, value]) => `${prop}: ${value}`);
}

export function exportSpec(doc: DesignDocument, ctx: ExportContext): DesignSpec {
  const warnings: string[] = [];
  const views = {} as DesignSpec['views'];

  for (const viewId of ['desktop', 'mobile'] as ViewId[]) {
    const view = doc.views[viewId];
    const elements: SpecElement[] = [];
    const annotations: DesignSpec['views'][ViewId]['annotations'] = [];

    for (const el of [...view.elements].sort((a, b) => a.z - b.z)) {
      const entry = el.catalogId ? ctx.getEntry(el.catalogId) : undefined;
      const isNote = el.annotation || (el.catalogId ? ctx.isAnnotation(el.catalogId) : false);

      // Hanging an element off the edge is allowed on purpose — parking something half-off the
      // canvas while you think is a real habit, and the drag keeps 24px grabbable so it can always
      // come back. What is NOT acceptable is doing it silently: the PNG crops it, so the handoff
      // would carry a table sliced down the middle with nothing to say why. Naming it costs a line.
      if (el.x < 0 || el.x + el.w > view.width) {
        const off = el.x < 0 ? { side: 'left', by: -el.x } : { side: 'right', by: el.x + el.w - view.width };
        warnings.push(
          `${viewId}: ${el.name ?? entry?.label ?? el.kind} (${el.id}) hangs ${off.by}px off the ${off.side}`
          + ' edge, so it is cut off in the image — move it in, or say it is deliberate.',
        );
      }

      if (isNote) {
        annotations.push({
          id: el.id,
          text: el.slots.text ?? el.note ?? '',
          at: { x: el.x, y: el.y },
        });
        continue;
      }

      const offSystem = offSystemProps(el.style);
      if (!entry && el.catalogId) warnings.push(`${viewId}: element ${el.id} references unknown catalogue entry "${el.catalogId}".`);
      if (!el.catalogId && el.kind === 'catalogue') warnings.push(`${viewId}: element ${el.id} has no catalogue id.`);
      if (offSystem.length) warnings.push(`${viewId}: element ${el.id} (${entry?.label ?? el.kind}) uses colours outside the token set — ${offSystem.join(', ')}.`);

      elements.push({
        id: el.id,
        name: el.name ?? entry?.label ?? el.kind,
        catalogId: el.catalogId ?? null,
        classes: entry ? classesFor(entry, el) : [],
        variant: el.variant ?? null,
        geometry: { x: el.x, y: el.y, w: el.w, h: el.h, z: el.z },
        content: el.slots,
        styleOverrides: el.style,
        note: el.note,
        offSystem: offSystem.length ? offSystem : undefined,
      });
    }

    views[viewId] = {
      size: { width: view.width, height: contentHeightOf(view) },
      grid: { size: view.settings.size, snap: view.settings.snap },
      elements,
      annotations,
    };
  }

  return { name: doc.name, route: doc.route, exportedAt: ctx.now, views, warnings };
}

/** The brief. The difference between a good and a bad first attempt is almost entirely here. */
export function exportPrompt(doc: DesignDocument, spec: DesignSpec): string {
  const lines: string[] = [];
  lines.push(`# ${doc.name}`, '');
  lines.push(doc.route ? `Target page: \`${doc.route}\`` : 'Target page: not yet decided.', '');
  lines.push('## What this is', '');
  lines.push('A mockup of how this page should look, made in the Page Designer. It ships as four');
  lines.push('things, and they say different parts of the same thing:', '');
  lines.push('| File | What to take from it |');
  lines.push('|---|---|');
  lines.push('| `*-desktop.html` / `*-mobile.html` | the layout, openable in a browser |');
  lines.push('| `*.png` | what it should look like |');
  lines.push('| `design.json` | **the exact element list, with the real CSS class names to use** |');
  lines.push('| this file | the intent, and what to watch out for |');
  lines.push('');
  lines.push('## The two views are independent', '');
  lines.push(`Desktop holds ${spec.views.desktop.elements.length} elements; mobile holds ${spec.views.mobile.elements.length}.`);
  lines.push('They are deliberately separate designs, not one derived from the other. Build the phone');
  lines.push('layout from the mobile view, not by making the desktop one narrower.', '');

  const notes = [
    ...spec.views.desktop.annotations.map((a) => `desktop: ${a.text}`),
    ...spec.views.mobile.annotations.map((a) => `mobile: ${a.text}`),
    ...spec.views.desktop.elements.filter((e) => e.note).map((e) => `desktop — ${e.name}: ${e.note}`),
    ...spec.views.mobile.elements.filter((e) => e.note).map((e) => `mobile — ${e.name}: ${e.note}`),
  ].filter((n) => n.trim());

  if (notes.length) {
    lines.push('## Notes on the design', '');
    for (const note of notes) lines.push(`- ${note}`);
    lines.push('');
  }

  if (spec.warnings.length) {
    lines.push('## What this export could NOT express', '');
    lines.push('Read these first — each is somewhere the mockup stepped outside the design system, or');
    lines.push('where it is asking for something that does not exist yet.', '');
    for (const warning of spec.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  lines.push('## How to build it', '');
  lines.push('1. Use the class names in `design.json` — they are the app\'s real ones, and using them');
  lines.push('   is what keeps this page consistent with every other page.');
  lines.push('2. Positions in the spec are the INTENT, not pixel gospel: match the order, the grouping');
  lines.push('   and the spacing rhythm rather than absolute coordinates, and use the app\'s own layout');
  lines.push('   primitives (flex, grid, the token spacing scale).');
  lines.push('3. Anything in "could not express" is a decision, not an oversight — ask about it.');
  lines.push('');
  return lines.join('\n');
}
