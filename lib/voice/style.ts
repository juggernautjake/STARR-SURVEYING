// lib/voice/style.ts — turns a WidgetStyle into real CSS.
//
// This is the one place a saved widget becomes pixels, which is why it is pure and separate from the
// components: the renderer on the public page and the live preview in the studio MUST agree exactly,
// or Andrew designs against a preview that lies. Two components calling one function is the only
// version of that guarantee that holds up.
//
// ── SEMANTIC COLOURS BEAT HEX ───────────────────────────────────────────────────────────────────
//
// A colour on a widget may be either a literal (`#D9B65B`, `rgba(0,0,0,.4)`) or one of the theme's
// token names (`surface`, `accent`, `text`). Token names resolve to `var(--va-*)`, so a widget styled
// with `background: 'surface'` FOLLOWS the site theme when Andrew switches from Ink & Gold to
// Parchment, while `background: '#141A26'` stays dark and becomes a black hole in the middle of a
// light page. The inspector therefore offers the tokens first and the colour picker second.

import type { WidgetStyle } from './widgets';
import { RADIUS_SCALE, SPACING_SCALE, TYPE_SCALE, scaleValue } from './widgets';

/** Theme token names that may be used anywhere a colour is accepted. */
export const COLOR_TOKENS = [
  'ink',
  'surface',
  'surfaceRaised',
  'line',
  'text',
  'textMuted',
  'accent',
  'accentBright',
  'accentContrast',
  'glow',
  'transparent',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

const TOKEN_TO_VAR: Record<string, string> = {
  ink: 'var(--va-ink)',
  surface: 'var(--va-surface)',
  surfaceRaised: 'var(--va-surface-raised)',
  line: 'var(--va-line)',
  text: 'var(--va-text)',
  textMuted: 'var(--va-text-muted)',
  accent: 'var(--va-accent)',
  accentBright: 'var(--va-accent-bright)',
  accentContrast: 'var(--va-accent-contrast)',
  glow: 'var(--va-glow)',
  transparent: 'transparent',
};

/** Resolves a stored colour to a CSS value, or undefined for "inherit / don't emit the property". */
export function resolveColor(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const v = String(value).trim();
  if (!v) return undefined;
  if (TOKEN_TO_VAR[v]) return TOKEN_TO_VAR[v];
  return v;
}

export function isColorToken(value: string): value is ColorToken {
  return (COLOR_TOKENS as readonly string[]).includes(value);
}

// ── Widths ───────────────────────────────────────────────────────────────────────────────────────
//
// Four measures, not a pixel slider. `normal` is capped near 68 characters of body copy because that
// is where reading speed peaks; `narrow` is for pull quotes; `wide` is for media that wants room;
// `full` breaks the container entirely for full-bleed images. Andrew picking "wide" for a paragraph
// still produces a readable line length, because the text widget re-caps itself — see below.

export const WIDTH_PX: Record<string, number | null> = {
  narrow: 620,
  normal: 780,
  wide: 1080,
  full: null,
};

export interface ResolvedWidgetStyle {
  /** Applied to the full-bleed outer element — background, vertical rhythm. */
  outer: React.CSSProperties;
  /** Applied to the measure-constrained inner element — width, padding, typography. */
  inner: React.CSSProperties;
  /** Extra class names the renderer should add (animation, shadow). */
  classNames: string[];
}

const SHADOWS: Record<string, string> = {
  none: 'none',
  soft: '0 2px 12px rgba(0,0,0,0.28)',
  lifted: '0 12px 32px -8px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)',
  glow: '0 0 0 1px var(--va-accent), 0 0 28px -6px var(--va-accent)',
};

const FONT_STACK: Record<string, string> = {
  display: 'var(--va-font-display)',
  body: 'var(--va-font-body)',
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
};

/**
 * The whole style pipeline, as one pure call.
 *
 * @param style   the widget's saved style bag
 * @param options `isTextual` re-caps very wide text back to a readable measure; `bleed` allows the
 *                outer element to escape the page container (full-width images).
 */
export function resolveWidgetStyle(
  style: WidgetStyle | undefined,
  options: { isTextual?: boolean } = {},
): ResolvedWidgetStyle {
  const s = style ?? {};
  const outer: React.CSSProperties = {};
  const inner: React.CSSProperties = {};
  const classNames: string[] = [];

  // ── Vertical rhythm ──
  outer.paddingTop = `${scaleValue(SPACING_SCALE, s.spaceAbove, 5)}px`;
  outer.paddingBottom = `${scaleValue(SPACING_SCALE, s.spaceBelow, 5)}px`;

  // ── Surface ──
  const bg = resolveColor(s.background);
  if (bg) outer.background = bg;
  if (s.backgroundImage) {
    // The overlay rides in the same `background` shorthand as a gradient layered over the image, so
    // one property carries both and there is no separate pseudo-element to position. Without a scrim,
    // white text on an arbitrary photo is a coin flip.
    const overlay = Math.max(0, Math.min(100, s.backgroundOverlay ?? 45)) / 100;
    outer.background = `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url(${JSON.stringify(
      s.backgroundImage,
    )}) center/cover no-repeat`;
  }

  const text = resolveColor(s.textColor);
  if (text) outer.color = text;
  // The accent is exposed as a scoped custom property rather than a concrete colour, so nested
  // elements (a link inside a text widget, the fill on a button) pick it up without the renderer
  // having to thread it through every child.
  const accent = resolveColor(s.accentColor);
  if (accent) (outer as Record<string, unknown>)['--va-accent'] = accent;

  // ── Measure ──
  const widthKey = s.width ?? 'normal';
  // A 1080px-wide paragraph is 140 characters per line and effectively unreadable. Rather than
  // forbid `wide` on text — Andrew may want a wide BACKGROUND behind centred copy — the outer
  // element takes the wide measure and the text itself is re-capped.
  const effective = options.isTextual && widthKey === 'full' ? 'wide' : widthKey;
  const px = WIDTH_PX[effective] ?? null;
  if (px !== null) {
    inner.maxWidth = `${px}px`;
    inner.marginLeft = 'auto';
    inner.marginRight = 'auto';
  } else {
    inner.width = '100%';
  }

  const pad = scaleValue(SPACING_SCALE, s.padding, 0);
  if (pad > 0) {
    inner.padding = `${pad}px`;
  }

  // ── Frame ──
  const border = resolveColor(s.borderColor);
  if (s.borderWidth && s.borderWidth > 0) {
    inner.border = `${s.borderWidth}px solid ${border ?? 'var(--va-line)'}`;
  }
  const radius = scaleValue(RADIUS_SCALE, s.radius, 3);
  if (radius > 0) inner.borderRadius = `${radius}px`;
  if (s.shadow && s.shadow !== 'none') {
    inner.boxShadow = SHADOWS[s.shadow] ?? SHADOWS.soft;
  }

  // ── Type ──
  if (s.font) inner.fontFamily = FONT_STACK[s.font] ?? FONT_STACK.body;
  inner.fontSize = `${scaleValue(TYPE_SCALE, s.size, 4)}rem`;
  if (s.weight) inner.fontWeight = s.weight;
  if (s.tracking) inner.letterSpacing = `${s.tracking / 100}em`;
  if (s.leading) inner.lineHeight = s.leading / 10;
  if (s.uppercase) {
    inner.textTransform = 'uppercase';
    // Uppercase display type collapses without extra tracking — this is the difference between
    // "engraved" and "shouted".
    if (!s.tracking) inner.letterSpacing = '0.08em';
  }
  inner.textAlign = s.align ?? 'left';

  // ── Motion ──
  if (s.animation && s.animation !== 'none') {
    classNames.push(s.animation === 'rise' ? 'vaAnimRise' : 'vaAnimFade');
  }

  return { outer, inner, classNames };
}

// ── Responsive emission ──────────────────────────────────────────────────────────────────────────
//
// ── WHY CONTAINER QUERIES AND NOT MEDIA QUERIES ─────────────────────────────────────────────────
//
// Andrew needs to SEE the phone layout while editing, in a preview pane on a desktop monitor. With a
// media query that is impossible without an iframe: `@media (max-width: 700px)` asks the viewport,
// and the viewport is 1440px wide no matter how narrow the preview pane is. Every builder that takes
// that route ends up shipping an iframe, and then fights it forever — the iframe needs its own copy
// of the stylesheet, its own theme variables, its own event plumbing back to the inspector.
//
// `@container` asks the nearest named ancestor instead. Set `container-type: inline-size` on the page
// canvas and the SAME rule fires when the canvas is 390px wide, whether that is because the pane was
// dragged narrow or because the whole phone is 390px. One set of rules, one code path, and a preview
// that is not an approximation of the phone but literally the phone's layout.

/** Converts a CSSProperties object to a CSS declaration string.
 *
 *  Custom properties (`--va-accent`) pass through as-is; everything else is camelCase→kebab-case.
 *  Numbers get `px` except for the unitless properties, which is the one place a naive converter
 *  produces `line-height: 1.6px` and silently ruins every paragraph. */
export function declarationsFrom(style: React.CSSProperties): string {
  const UNITLESS = new Set([
    'lineHeight',
    'fontWeight',
    'opacity',
    'zIndex',
    'flex',
    'flexGrow',
    'flexShrink',
    'order',
    'aspectRatio',
  ]);
  const out: string[] = [];
  for (const [key, raw] of Object.entries(style)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const prop = key.startsWith('--') ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const value = typeof raw === 'number' && !UNITLESS.has(key) ? `${raw}px` : String(raw);
    out.push(`${prop}:${value}`);
  }
  return out.join(';');
}

/** The container-query name every page canvas declares, and every widget rule targets. */
export const PAGE_CONTAINER = 'vaPage';
/** The width at which a canvas is treated as a phone. Chosen above 390–430 (phones) and below 768
 *  (tablets in portrait), so a tablet keeps the desktop composition — which at 768px it can carry. */
export const MOBILE_BREAKPOINT_PX = 700;

/**
 * The `<style>` body for one widget's phone overrides.
 *
 * Emits only the DIFFERENCES between the desktop and mobile resolutions. A widget whose mobile style
 * is identical to its desktop style produces an empty string and therefore no rule at all — which is
 * what keeps a fifty-widget page from shipping fifty redundant blocks of CSS.
 */
export function widgetMobileCss(
  widgetId: string,
  desktop: ResolvedWidgetStyle,
  mobile: ResolvedWidgetStyle,
  options: { hiddenOnMobile?: boolean; hiddenOnDesktop?: boolean } = {},
): string {
  const rules: string[] = [];
  // Attribute selectors on the widget id: no class-name generation, no collisions, and the selector
  // is stable across a re-render because the id is stored with the widget.
  const sel = `[data-vw="${cssEscapeAttr(widgetId)}"]`;

  if (options.hiddenOnMobile) {
    rules.push(`${sel}{display:none!important}`);
  } else {
    const outer = diffDeclarations(desktop.outer, mobile.outer);
    if (outer) rules.push(`${sel}{${outer}}`);
    const inner = diffDeclarations(desktop.inner, mobile.inner);
    if (inner) rules.push(`${sel} > .vaWidgetInner{${inner}}`);
  }

  const body = rules.join('');
  const mobileBlock = body ? `@container ${PAGE_CONTAINER} (max-width:${MOBILE_BREAKPOINT_PX}px){${body}}` : '';

  const desktopBlock = options.hiddenOnDesktop
    ? `@container ${PAGE_CONTAINER} (min-width:${MOBILE_BREAKPOINT_PX + 1}px){${sel}{display:none!important}}`
    : '';

  return mobileBlock + desktopBlock;
}

/** Declarations present in `mobile` that differ from `desktop`.
 *
 *  Properties that exist on desktop but NOT on mobile are re-emitted as `initial` — otherwise a
 *  desktop-only `box-shadow` would leak onto the phone, since a container query that omits a property
 *  does not remove it, it just fails to override it. */
function diffDeclarations(desktop: React.CSSProperties, mobile: React.CSSProperties): string {
  const changed: React.CSSProperties = {};
  const d = desktop as Record<string, unknown>;
  const m = mobile as Record<string, unknown>;

  for (const key of Object.keys(m)) {
    if (String(d[key]) !== String(m[key])) {
      (changed as Record<string, unknown>)[key] = m[key];
    }
  }
  for (const key of Object.keys(d)) {
    if (!(key in m)) {
      (changed as Record<string, unknown>)[key] = 'initial';
    }
  }
  return declarationsFrom(changed);
}

/** Escapes a widget id for safe use inside an attribute selector.
 *
 *  Ids are generated by `createWidget` and are `[A-Za-z0-9_]` — but they can also arrive from the
 *  database, where anything could have been written by hand. This string is interpolated into a
 *  <style> tag, so an unescaped `"` would close the attribute and let stored content inject CSS. */
function cssEscapeAttr(value: string): string {
  return String(value).replace(/["\\]/g, '\\$&');
}

/** Aspect-ratio CSS for media widgets. `auto` emits nothing so the image keeps its natural shape. */
export function aspectStyle(aspect: string | undefined): React.CSSProperties {
  if (!aspect || aspect === 'auto') return {};
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return {};
  return { aspectRatio: `${w} / ${h}`, objectFit: 'cover' };
}

/** The "size all of the media" control: a percentage of the available width, honouring alignment.
 *
 *  `margin: auto` on one side only is what makes a 60%-wide image actually sit left or right rather
 *  than always centring — the usual bug in hand-rolled versions of this control. */
export function mediaSizeStyle(scale: number | undefined, align: string | undefined): React.CSSProperties {
  const pct = Math.max(10, Math.min(100, scale ?? 100));
  const out: React.CSSProperties = { width: `${pct}%` };
  if (pct >= 100) return out;
  if (align === 'center') {
    out.marginLeft = 'auto';
    out.marginRight = 'auto';
  } else if (align === 'right') {
    out.marginLeft = 'auto';
    out.marginRight = '0';
  } else {
    out.marginLeft = '0';
    out.marginRight = 'auto';
  }
  return out;
}

// ── Embeds ───────────────────────────────────────────────────────────────────────────────────────
//
// Andrew will paste the URL from his browser's address bar, not an embed URL. Converting a watch link
// into an iframe-able one is the difference between "paste the link" and "read a help article".
//
// The allowlist is also a security boundary: an `embed` widget renders an <iframe src>, and an
// unrestricted one would let anything stored in the blocks column frame arbitrary content on the
// site's origin. Only these five hosts produce an iframe; anything else renders as a plain link.

export interface EmbedInfo {
  provider: 'youtube' | 'vimeo' | 'soundcloud' | 'spotify' | 'bandcamp' | null;
  src: string | null;
  /** Audio embeds want a short fixed height, not a 16:9 box. */
  isAudio: boolean;
}

export function parseEmbedUrl(raw: string | null | undefined): EmbedInfo {
  const empty: EmbedInfo = { provider: null, src: null, isAudio: false };
  if (!raw || typeof raw !== 'string') return empty;
  const url = raw.trim();
  if (!url) return empty;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return empty;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return empty;

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube: watch?v=, youtu.be/, /shorts/, and already-embed URLs.
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = parsed.searchParams.get('v');
    if (v) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`, isAudio: false };
    const shorts = /^\/shorts\/([\w-]+)/.exec(parsed.pathname);
    if (shorts) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${shorts[1]}`, isAudio: false };
    const embed = /^\/embed\/([\w-]+)/.exec(parsed.pathname);
    if (embed) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${embed[1]}`, isAudio: false };
    return empty;
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.replace(/^\//, '').split('/')[0];
    if (id) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, isAudio: false };
    return empty;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /(\d{6,})/.exec(parsed.pathname)?.[1];
    if (id) return { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}`, isAudio: false };
    return empty;
  }

  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    return {
      provider: 'soundcloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23D9B65B&auto_play=false&show_teaser=false`,
      isAudio: true,
    };
  }

  if (host === 'open.spotify.com') {
    // /track/ID, /episode/ID, /album/ID → /embed/<kind>/<id>
    const m = /^\/(track|episode|album|playlist|show)\/([A-Za-z0-9]+)/.exec(parsed.pathname);
    if (m) return { provider: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, isAudio: true };
    return empty;
  }

  if (host.endsWith('bandcamp.com')) {
    return { provider: 'bandcamp', src: url, isAudio: true };
  }

  return empty;
}
