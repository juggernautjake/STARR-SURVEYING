// lib/voice/widgets.ts — the widget system Andrew builds pages out of.
//
// The owner's requirement was "a widget system where he can format projects/pages to have video,
// text, audio, images, links and buttons… he will be able to size all of the media and control
// styling". That is a page builder, and page builders fail in one of two ways:
//
//   1. Too few knobs. Every page looks identical and the owner gives up and asks a developer.
//   2. Too many knobs. Every knob can produce an unreadable page — 8px grey text on a grey
//      background — and the owner ships one by accident.
//
// This file is the answer to (2) while still delivering (1). Every style value is CONSTRAINED to a
// scale rather than free: widths are four named sizes, not pixels; spacing is a 0–10 step scale, not
// arbitrary padding; colours default to `null`, meaning "inherit the site theme", so a widget that is
// never touched is automatically on-palette and automatically legible. Andrew can override any of it,
// but the floor is a page that looks designed rather than assembled.
//
// ── STYLE VALUES ARE NULLABLE ON PURPOSE ────────────────────────────────────────────────────────
//
// `background: null` and `background: 'transparent'` mean different things. `null` is "I have no
// opinion, use the theme", and it keeps following the theme when Andrew later recolours the site.
// `'transparent'` is a decision that survives a theme change. Collapsing the two — the usual mistake,
// defaulting everything to a concrete colour at creation time — is what makes a site's theme picker
// stop working after the first month of editing: every widget has a hardcoded colour by then.

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

// ── LITERAL vs BOUND WIDGETS ─────────────────────────────────────────────────────────────────────
//
// Two kinds live in this list and the distinction matters when reading the renderer.
//
// LITERAL widgets render exactly what is stored in their props: a heading holds its text, an image
// holds its URL. What you typed is what appears.
//
// BOUND widgets render live data from elsewhere in the platform — `demoReels` renders whatever is in
// `va_demos`, `projectGrid` renders published project pages, `packages` renders the coaching rates.
// Their props configure the QUERY and the presentation (how many, which category, what heading),
// never the content.
//
// The reason bound widgets exist at all: Andrew's demo reels appear on the home page and the
// voice-over page, and his coaching rates appear on the coaching page and in the footer of a project.
// If those were literal widgets, changing a price would mean remembering every page that quotes it —
// and the one he forgets is the one a client reads. Bound widgets make "edit it once" structural.
export const WIDGET_TYPES = [
  // Literal
  'heading',
  'text',
  'image',
  'gallery',
  'audio',
  'audioList',
  'video',
  'embed',
  'button',
  'buttonRow',
  'quote',
  'stats',
  'cards',
  'featureCards',
  'mediaText',
  'steps',
  'specList',
  'faq',
  'credits',
  'divider',
  'spacer',
  'cta',
  'hero',
  'contactForm',
  // Bound — render live platform data
  'demoReels',
  'projectGrid',
  'testimonials',
  'packages',
  'creditsList',
] as const;

/** Widgets whose content comes from the database rather than from their own props. */
export const BOUND_WIDGET_TYPES = [
  'demoReels',
  'projectGrid',
  'testimonials',
  'packages',
  'creditsList',
] as const;

export function isBoundWidget(type: WidgetType): boolean {
  return (BOUND_WIDGET_TYPES as readonly string[]).includes(type);
}

export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_WIDTHS = ['narrow', 'normal', 'wide', 'full'] as const;
export type WidgetWidth = (typeof WIDGET_WIDTHS)[number];

export const WIDGET_ALIGNS = ['left', 'center', 'right'] as const;
export type WidgetAlign = (typeof WIDGET_ALIGNS)[number];

export const WIDGET_SHADOWS = ['none', 'soft', 'lifted', 'glow'] as const;
export type WidgetShadow = (typeof WIDGET_SHADOWS)[number];

export const WIDGET_FONTS = ['display', 'body', 'mono'] as const;
export type WidgetFont = (typeof WIDGET_FONTS)[number];

export const WIDGET_ASPECTS = ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '2:3'] as const;
export type WidgetAspect = (typeof WIDGET_ASPECTS)[number];

export const WIDGET_ANIMATIONS = ['none', 'fade', 'rise'] as const;
export type WidgetAnimation = (typeof WIDGET_ANIMATIONS)[number];

/** Every knob the inspector exposes. All optional; all `null`/`undefined` means "inherit". */
export interface WidgetStyle {
  width?: WidgetWidth;
  align?: WidgetAlign;
  /** 0–10 on the spacing scale (see SPACING_SCALE). */
  spaceAbove?: number;
  spaceBelow?: number;
  /** Inner padding, same scale. */
  padding?: number;

  background?: string | null;
  backgroundImage?: string | null;
  /** 0–100. Darkens a background image so text on top stays readable. */
  backgroundOverlay?: number;
  textColor?: string | null;
  accentColor?: string | null;

  borderColor?: string | null;
  borderWidth?: number;
  /** 0–10 on the radius scale. */
  radius?: number;
  shadow?: WidgetShadow;

  font?: WidgetFont;
  /** 0–10 on the type scale; 4 is body size. */
  size?: number;
  weight?: number;
  /** Hundredths of an em: 10 → 0.10em. Kept integral so the slider has clean stops. */
  tracking?: number;
  /** Tenths: 15 → 1.5. */
  leading?: number;
  uppercase?: boolean;

  aspect?: WidgetAspect;
  /** Percentage of the container width the media occupies, 10–100. THE "size all of the media" knob. */
  mediaScale?: number;

  animation?: WidgetAnimation;
}

export interface Widget {
  id: string;
  type: WidgetType;
  props: Record<string, unknown>;
  /** The desktop style. Also the base every narrower breakpoint starts from. */
  style: WidgetStyle;

  /** ── MOBILE OVERRIDES ────────────────────────────────────────────────────────────────────────
   *
   *  Only the keys Andrew has explicitly changed on the phone view. A SPARSE patch, not a full copy
   *  of the style, and the distinction is the whole design:
   *
   *  If mobile held a complete style, then editing the desktop version of a widget would stop
   *  affecting the phone the moment the phone view had been opened once — the classic failure of
   *  page builders with a responsive mode, where a user changes a colour, sees it not apply on
   *  mobile, and concludes the tool is broken. Sparse means desktop stays the single source of truth
   *  for everything Andrew has not deliberately overridden, forever.
   *
   *  Undefined (rather than an empty object) means "never touched", which is what lets the editor
   *  distinguish "no mobile changes" from "mobile changes that happen to be empty". */
  mobileStyle?: Partial<WidgetStyle>;

  /** Whether the automatic mobile adaptation applies (see `autoMobileStyle`). Defaults to true.
   *  Turned off by a user who wants the desktop layout to survive onto a phone verbatim. */
  autoMobile?: boolean;

  /** Hidden widgets stay in the document but render nothing publicly — a soft delete Andrew can undo. */
  hidden?: boolean;

  /** Hides this widget on phones only. Useful for a decorative full-bleed image that costs a phone
   *  half a screen of scrolling and adds nothing. */
  hiddenOnMobile?: boolean;

  /** Hides this widget on desktop only — the counterpart, for a mobile-specific call to action. */
  hiddenOnDesktop?: boolean;
}

// ── Scales ───────────────────────────────────────────────────────────────────────────────────────
//
// Named scales instead of raw CSS values. A slider that produces "step 6" can be re-mapped later
// (tighter mobile spacing, a denser theme) in ONE place; a slider that produced "48px" is baked into
// every page Andrew has ever saved.

export const SPACING_SCALE = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const;
export const RADIUS_SCALE = [0, 2, 4, 6, 8, 12, 16, 24, 32, 48, 9999] as const;
/** rem. Index 4 is body copy. Index 9–10 are display sizes that only work with the display font. */
export const TYPE_SCALE = [0.75, 0.8125, 0.875, 0.9375, 1, 1.125, 1.375, 1.75, 2.25, 3, 4] as const;

function clampIndex(value: number | undefined, scale: readonly number[], fallback: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(scale.length - 1, Math.round(value)));
}

/** Reads a step off a scale, clamping out-of-range input rather than producing `undefined` CSS. */
export function scaleValue(scale: readonly number[], step: number | undefined, fallback: number): number {
  return scale[clampIndex(step, scale, fallback)];
}

// ── Defaults ─────────────────────────────────────────────────────────────────────────────────────
//
// The style a widget is BORN with. Chosen so that "add a widget, type words, publish" produces
// something that already looks intentional — the single biggest determinant of whether a non-designer
// keeps using a builder.

const BASE_DEFAULT: WidgetStyle = {
  width: 'normal',
  align: 'left',
  spaceAbove: 5,
  spaceBelow: 5,
  padding: 0,
  background: null,
  textColor: null,
  accentColor: null,
  borderWidth: 0,
  radius: 3,
  shadow: 'none',
  font: 'body',
  size: 4,
  weight: 400,
  tracking: 0,
  leading: 16,
  uppercase: false,
  aspect: 'auto',
  mediaScale: 100,
  animation: 'fade',
};

const TYPE_DEFAULTS: Partial<Record<WidgetType, Partial<WidgetStyle>>> = {
  heading: { font: 'display', size: 8, weight: 600, spaceAbove: 7, spaceBelow: 3, tracking: 2 },
  text: { leading: 18, spaceBelow: 4 },
  image: { spaceAbove: 6, spaceBelow: 6, radius: 4, shadow: 'lifted', aspect: 'auto' },
  gallery: { width: 'wide', spaceAbove: 6, spaceBelow: 6, radius: 3, aspect: '4:3' },
  audio: { spaceAbove: 4, spaceBelow: 4, radius: 4, padding: 5, background: 'surface' },
  audioList: { spaceAbove: 5, spaceBelow: 5, radius: 4 },
  video: { width: 'wide', spaceAbove: 6, spaceBelow: 6, radius: 4, shadow: 'lifted', aspect: '16:9' },
  embed: { width: 'wide', spaceAbove: 6, spaceBelow: 6, radius: 4, aspect: '16:9' },
  button: { spaceAbove: 4, spaceBelow: 4, radius: 10, weight: 600, size: 4, tracking: 4 },
  buttonRow: { spaceAbove: 5, spaceBelow: 5, radius: 10, weight: 600, tracking: 4 },
  quote: { font: 'display', size: 6, leading: 15, width: 'narrow', spaceAbove: 7, spaceBelow: 7, align: 'center' },
  stats: { width: 'wide', spaceAbove: 6, spaceBelow: 6, align: 'center' },
  cards: { width: 'wide', spaceAbove: 6, spaceBelow: 6, radius: 4 },
  credits: { spaceAbove: 5, spaceBelow: 5 },
  divider: { spaceAbove: 6, spaceBelow: 6 },
  spacer: { spaceAbove: 0, spaceBelow: 0 },
  cta: { width: 'wide', padding: 8, radius: 5, align: 'center', spaceAbove: 8, spaceBelow: 8, background: 'surface' },
  contactForm: { width: 'normal', spaceAbove: 6, spaceBelow: 6 },
  // The hero owns the top of a page: no vertical rhythm above it, full bleed, its own scrim.
  hero: { width: 'full', spaceAbove: 0, spaceBelow: 0, radius: 0, align: 'left', backgroundOverlay: 55 },
  featureCards: { width: 'wide', spaceAbove: 7, spaceBelow: 7, radius: 4 },
  mediaText: { width: 'wide', spaceAbove: 8, spaceBelow: 8, radius: 4, size: 4, leading: 17 },
  steps: { width: 'wide', spaceAbove: 7, spaceBelow: 7 },
  specList: { spaceAbove: 5, spaceBelow: 5 },
  faq: { spaceAbove: 6, spaceBelow: 6 },
  demoReels: { width: 'wide', spaceAbove: 7, spaceBelow: 7 },
  projectGrid: { width: 'wide', spaceAbove: 7, spaceBelow: 7 },
  testimonials: { width: 'wide', spaceAbove: 7, spaceBelow: 7 },
  packages: { width: 'wide', spaceAbove: 7, spaceBelow: 7 },
  creditsList: { spaceAbove: 6, spaceBelow: 6 },
};

/** The style a newly-inserted widget of `type` starts with. */
export function defaultStyle(type: WidgetType): WidgetStyle {
  return { ...BASE_DEFAULT, ...(TYPE_DEFAULTS[type] ?? {}) };
}

/** The props a newly-inserted widget of `type` starts with — real placeholder content, never blank.
 *  An empty widget looks broken; a widget with sample text looks like an invitation to edit it. */
export function defaultProps(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'heading':
      return { text: 'Section heading', level: 2, eyebrow: '' };
    case 'text':
      return {
        html: '<p>Write about this project — what it was, who it was for, and what you brought to it.</p>',
      };
    case 'image':
      return { mediaId: null, photoId: null, url: '', alt: '', caption: '' };
    case 'gallery':
      return { items: [], columns: 3, gap: 4 };
    case 'audio':
      return { mediaId: null, url: '', title: 'Untitled take', subtitle: '', downloadable: false };
    case 'audioList':
      return { title: 'Selected takes', tracks: [] };
    case 'video':
      return { url: '', mediaId: null, poster: '', caption: '', autoplay: false, loop: false, muted: false };
    case 'embed':
      return { url: '', title: 'Embedded media' };
    case 'button':
      return { label: 'Get in touch', href: '/AndrewAsh/contact', variant: 'solid', newTab: false, icon: '' };
    case 'buttonRow':
      return {
        buttons: [
          { label: 'Hear the reel', href: '#reel', variant: 'solid' },
          { label: 'Request a quote', href: '/AndrewAsh/contact', variant: 'outline' },
        ],
      };
    case 'quote':
      return { text: 'A line worth pulling out of the page.', attribution: '', role: '' };
    case 'stats':
      return {
        items: [
          { value: '4', label: 'Years on stage' },
          { value: '2', label: 'Languages' },
          { value: '24h', label: 'Typical turnaround' },
        ],
      };
    case 'cards':
      return {
        columns: 3,
        items: [
          { title: 'Card one', body: 'A short supporting sentence.', icon: '', href: '' },
          { title: 'Card two', body: 'A short supporting sentence.', icon: '', href: '' },
          { title: 'Card three', body: 'A short supporting sentence.', icon: '', href: '' },
        ],
      };
    case 'credits':
      return {
        title: 'Credits',
        rows: [{ production: 'Production', role: 'Role', company: 'Company', year: '' }],
      };
    case 'divider':
      return { variant: 'ornament' };
    case 'spacer':
      return { height: 6 };
    case 'cta':
      return {
        heading: 'Need a voice for your project?',
        body: 'Send the script — or just the idea — and get a quote back within one business day.',
        buttonLabel: 'Request a quote',
        buttonHref: '/AndrewAsh/contact',
      };
    case 'contactForm':
      return { intent: 'voiceover', heading: 'Tell me about the project', compact: false };

    // ── Composite literal widgets ──
    case 'hero':
      return {
        eyebrow: 'Voice actor & vocal coach',
        title: 'Andrew Ash',
        line: 'A trained voice for commercials, phone systems, characters and narration.',
        photoId: 'recital-expressive',
        portraitPhotoId: 'portrait-formal',
        portraitCaption: 'Central Texas',
        showPortrait: true,
        // Two buttons, because a hero with one gives a visitor who is not ready for it nowhere to go.
        buttons: [
          { label: 'Hear the reels', href: '#reels', variant: 'solid' },
          { label: 'Request a quote', href: '/AndrewAsh/contact', variant: 'outline' },
        ],
        height: 'tall',
      };
    case 'featureCards':
      return {
        columns: 3,
        items: [
          { title: 'First', body: 'A sentence about it.', photoId: '', icon: '', href: '', bullets: [] },
          { title: 'Second', body: 'A sentence about it.', photoId: '', icon: '', href: '', bullets: [] },
          { title: 'Third', body: 'A sentence about it.', photoId: '', icon: '', href: '', bullets: [] },
        ],
      };
    case 'mediaText':
      return {
        eyebrow: '',
        heading: 'A heading beside a photo',
        html: '<p>Two or three sentences that sit next to the image rather than under it.</p>',
        photoId: '',
        url: '',
        alt: '',
        caption: '',
        // The image goes RIGHT by default. In a left-to-right reading order the eye lands on the
        // heading first and the photograph second, which is the order that reads as designed rather
        // than as an image with a caption stuck beside it.
        mediaSide: 'right',
        // Percentage of the row the media takes. 48 is a near-even split — deliberately not 50, so
        // the text column is a touch wider and its line length stays comfortable.
        mediaWidth: 48,
        buttonLabel: '',
        buttonHref: '',
      };

    case 'steps':
      return {
        items: [
          { step: '01', title: 'First step', body: 'What happens.' },
          { step: '02', title: 'Second step', body: 'What happens next.' },
          { step: '03', title: 'Third step', body: 'And then this.' },
        ],
      };
    case 'specList':
      return {
        title: '',
        rows: [
          { label: 'Delivery format', value: 'WAV 48 kHz / 24-bit' },
          { label: 'Turnaround', value: 'Within 24 hours' },
        ],
      };
    case 'faq':
      return {
        items: [
          { q: 'A question people actually ask', a: 'The answer, in plain language.' },
        ],
        // Open by default: a portfolio FAQ is short, and a visitor who has to click six times to read
        // six answers reads none of them. Collapsing is for long support documentation.
        collapsible: true,
        openFirst: true,
      };

    // ── Bound widgets: props configure the query, never the content ──
    case 'demoReels':
      return { category: 'all', limit: 4, columns: 2, downloadable: false, showPlaceholders: true };
    case 'projectGrid':
      return { filter: 'all', limit: 6, columns: 3, showEmptyState: true };
    case 'testimonials':
      return { context: 'all', limit: 4, columns: 2 };
    case 'packages':
      return { columns: 3, showInclusions: true };
    case 'creditsList':
      return { creditType: 'all', groupByType: true, limit: 40 };

    default:
      return {};
  }
}

// ── Automatic mobile adaptation ──────────────────────────────────────────────────────────────────
//
// The owner's ask: "it would be good to have some programmatic formatting that will try to
// automatically take his elements and widgets and format them nicely on mobile, but we need it so
// that he can manually edit and save it how he likes it."
//
// So the phone style is a three-layer stack, resolved in this order:
//
//     desktop style  →  automatic adaptation  →  Andrew's explicit mobile overrides
//
// The middle layer is what makes a page Andrew never opened the phone view for still look designed on
// a phone. The third layer always wins, so the automation can never fight him.
//
// ── THE FOUR THINGS THAT ACTUALLY BREAK ON A PHONE ──────────────────────────────────────────────
//
// This is not a general "make it smaller" pass. Shrinking everything uniformly is what produces the
// sites that read like a shrunken desktop. Four specific failures account for nearly all of it:
//
//   1. DISPLAY TYPE OVERFLOWS. A 4rem Cinzel heading is ~9 characters per line at 390px. Large sizes
//      are compressed hard; body sizes are left completely alone, because 16px is 16px on every
//      device and "responsive type" that shrinks body copy makes phones worse, not better.
//   2. VERTICAL RHYTHM EATS THE SCREEN. 96px of padding is a tenth of a phone screen spent on
//      nothing. Large spacing steps collapse toward the middle of the scale; small ones are kept,
//      because removing all the air is the other way to make a page unreadable.
//   3. MULTI-COLUMN LAYOUTS. Two columns at 390px is two 170px columns. Everything becomes one.
//   4. SCALED-DOWN AND RIGHT-ALIGNED MEDIA. A 50%-wide floated image is 195px. Media goes full width,
//      and right-alignment — which reads as deliberate on a wide canvas and as a mistake on a narrow
//      one — returns to the natural flow.

/** Compresses a type-scale step for phones. Steps at or below body size are untouched. */
function mobileTypeStep(step: number | undefined): number | undefined {
  if (step === undefined) return undefined;
  if (step <= 5) return step; // 1rem and below: leave alone
  if (step >= 10) return 8; // 4rem → 2.25rem
  if (step >= 9) return 7; // 3rem → 1.75rem
  if (step >= 8) return 7; // 2.25rem → 1.75rem
  if (step >= 7) return 6; // 1.75rem → 1.375rem
  return step - 1;
}

/** Pulls large spacing steps toward the middle of the scale. */
function mobileSpaceStep(step: number | undefined): number | undefined {
  if (step === undefined) return undefined;
  if (step <= 4) return step; // 16px and under survives intact
  if (step >= 9) return 6; // 96/128px → 32px
  if (step >= 7) return 5; // 48/64px → 24px
  return step - 1;
}

/**
 * The automatic phone adaptation for one widget's style.
 *
 * Returns only the keys it actually changes, so it composes with a sparse manual override without
 * either layer having to know about the other.
 */
export function autoMobileStyle(style: WidgetStyle, type: WidgetType): Partial<WidgetStyle> {
  const out: Partial<WidgetStyle> = {};

  const size = mobileTypeStep(style.size);
  if (size !== undefined && size !== style.size) out.size = size;

  const above = mobileSpaceStep(style.spaceAbove);
  if (above !== undefined && above !== style.spaceAbove) out.spaceAbove = above;
  const below = mobileSpaceStep(style.spaceBelow);
  if (below !== undefined && below !== style.spaceBelow) out.spaceBelow = below;
  const pad = mobileSpaceStep(style.padding);
  if (pad !== undefined && pad !== style.padding) out.padding = pad;

  // Narrow measures are meaningless at 390px — every width is effectively full — but `full` must be
  // preserved, because it also means "escape the page gutters" for a full-bleed image.
  if (style.width && style.width !== 'full') out.width = 'normal';

  // Media at less than full width is too small to see.
  if (style.mediaScale !== undefined && style.mediaScale < 100) out.mediaScale = 100;

  // Right-aligned anything reads as a bug on a narrow column. Centre is kept — a centred heading is
  // still a deliberate look on a phone.
  if (style.align === 'right') out.align = 'left';

  // Tight tracking on a compressed heading closes the letters up. Uppercase display type needs its
  // air back at a smaller size.
  if (style.uppercase && (style.tracking ?? 0) > 6) out.tracking = 6;

  // A pull quote set at display size in a narrow column needs its leading opened slightly or the
  // lines collide.
  if (type === 'quote' && (style.leading ?? 16) < 14) out.leading = 14;

  return out;
}

/**
 * The final phone style: desktop, then automation (unless disabled), then Andrew's overrides.
 *
 * This is the function the renderer and the builder preview both call. One implementation is the
 * only version of "the preview tells the truth" that survives contact with a second developer.
 */
export function resolveMobileStyle(widget: Widget): WidgetStyle {
  const base = widget.style ?? {};
  const auto = widget.autoMobile === false ? {} : autoMobileStyle(base, widget.type);
  return { ...base, ...auto, ...(widget.mobileStyle ?? {}) };
}

/** The style keys Andrew has explicitly overridden on mobile — drives the "modified" dots in the
 *  inspector, so he can see at a glance what is diverging from desktop and reset it. */
export function mobileOverrideKeys(widget: Widget): (keyof WidgetStyle)[] {
  return Object.keys(widget.mobileStyle ?? {}) as (keyof WidgetStyle)[];
}

/** Removes one mobile override, returning the widget to "follow desktop (and the automation)". */
export function clearMobileOverride(widget: Widget, key: keyof WidgetStyle): Widget {
  if (!widget.mobileStyle || !(key in widget.mobileStyle)) return widget;
  const next = { ...widget.mobileStyle };
  delete next[key];
  // Collapse an emptied patch back to undefined so "never touched" and "touched then reset" are the
  // same state — otherwise the editor shows a mobile badge on a widget with no mobile changes.
  return { ...widget, mobileStyle: Object.keys(next).length ? next : undefined };
}

let widgetCounter = 0;

/** Creates a widget with a collision-resistant id.
 *
 *  The id must be unique within a page and stable across a save, because it is the React key for the
 *  block list AND the drag handle identity. `Date.now()` alone is not enough: inserting three widgets
 *  from a "add section" preset happens inside one millisecond, and duplicate keys make React reorder
 *  the wrong rows on the next drag. The monotonic counter is what actually guarantees uniqueness;
 *  the timestamp just makes ids sortable by creation for debugging. */
export function createWidget(type: WidgetType, overrides: Partial<Widget> = {}): Widget {
  widgetCounter += 1;
  return {
    id: `w_${Date.now().toString(36)}_${widgetCounter.toString(36)}`,
    type,
    props: { ...defaultProps(type), ...(overrides.props ?? {}) },
    style: { ...defaultStyle(type), ...(overrides.style ?? {}) },
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
  };
}

// ── Block-list operations ────────────────────────────────────────────────────────────────────────
//
// Pure array transforms, kept out of the editor component so they are unit-testable and so an "undo"
// stack can be built out of the inputs rather than out of React state.

export function moveWidget(widgets: Widget[], from: number, to: number): Widget[] {
  if (from === to) return widgets;
  if (from < 0 || from >= widgets.length) return widgets;
  const target = Math.max(0, Math.min(widgets.length - 1, to));
  const next = widgets.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export function insertWidget(widgets: Widget[], widget: Widget, at?: number): Widget[] {
  const next = widgets.slice();
  const index = at === undefined ? next.length : Math.max(0, Math.min(next.length, at));
  next.splice(index, 0, widget);
  return next;
}

export function removeWidget(widgets: Widget[], id: string): Widget[] {
  return widgets.filter((w) => w.id !== id);
}

export function updateWidget(widgets: Widget[], id: string, patch: Partial<Widget>): Widget[] {
  return widgets.map((w) =>
    w.id === id
      ? {
          ...w,
          ...patch,
          // Props and style MERGE rather than replace. The inspector sends one changed key at a time
          // ({size: 7}); a spread at the top level alone would drop every other style on the widget.
          props: patch.props ? { ...w.props, ...patch.props } : w.props,
          style: patch.style ? { ...w.style, ...patch.style } : w.style,
        }
      : w,
  );
}

/** Duplicates a widget in place, directly beneath the original, with a fresh id. */
export function duplicateWidget(widgets: Widget[], id: string): Widget[] {
  const index = widgets.findIndex((w) => w.id === id);
  if (index === -1) return widgets;
  const source = widgets[index];
  const copy = createWidget(source.type, {
    props: { ...source.props },
    style: { ...source.style },
    hidden: source.hidden,
  });
  return insertWidget(widgets, copy, index + 1);
}

// ── Validation / normalisation ───────────────────────────────────────────────────────────────────

/** Coerces whatever came out of the database into a valid Widget[].
 *
 *  `blocks` is a JSONB column, which means the type system's guarantees stop at the wire. A page
 *  saved by an older build, hand-edited in the Supabase console, or half-written by a failed request
 *  must render as "the widgets that are still valid" rather than crash the public page — a portfolio
 *  that 500s is worse than a portfolio missing one block. */
export function normalizeWidgets(raw: unknown): Widget[] {
  if (!Array.isArray(raw)) return [];
  const out: Widget[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Partial<Widget>;
    if (typeof w.type !== 'string' || !(WIDGET_TYPES as readonly string[]).includes(w.type)) continue;
    const type = w.type as WidgetType;

    // A duplicate id would break React reconciliation on the public page just as badly as in the
    // editor, so re-key rather than drop — the content is fine, only the label is wrong.
    let id = typeof w.id === 'string' && w.id ? w.id : '';
    if (!id || seen.has(id)) {
      widgetCounter += 1;
      id = `w_recovered_${widgetCounter.toString(36)}`;
    }
    seen.add(id);

    out.push({
      id,
      type,
      props: { ...defaultProps(type), ...(w.props && typeof w.props === 'object' ? w.props : {}) },
      style: { ...defaultStyle(type), ...(w.style && typeof w.style === 'object' ? w.style : {}) },
      // NOT merged with defaults. The mobile patch is sparse by contract — spreading a default style
      // into it would turn every widget into one with a full mobile override, permanently detaching
      // the phone view from desktop edits. See the note on `Widget.mobileStyle`.
      ...(w.mobileStyle && typeof w.mobileStyle === 'object' && !Array.isArray(w.mobileStyle)
        ? { mobileStyle: w.mobileStyle as Partial<WidgetStyle> }
        : {}),
      autoMobile: w.autoMobile !== false,
      hidden: w.hidden === true,
      hiddenOnMobile: w.hiddenOnMobile === true,
      hiddenOnDesktop: w.hiddenOnDesktop === true,
    });
  }
  return out;
}

/** Widgets that should actually render to a visitor. */
export function publicWidgets(widgets: Widget[]): Widget[] {
  return widgets.filter((w) => !w.hidden);
}

// ── Editor metadata ──────────────────────────────────────────────────────────────────────────────
//
// Drives the "add a block" palette. Grouped because a flat list of eighteen types is a wall, and the
// grouping is by what Andrew is trying to DO ("show something", "say something", "ask for the job")
// rather than by implementation.

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  hint: string;
  group: 'Words' | 'Media' | 'Layout' | 'Business' | 'Live';
  icon: string;
}

export const WIDGET_CATALOG: readonly WidgetMeta[] = [
  { type: 'hero', label: 'Hero banner', hint: 'Full-bleed photo, big title, buttons. Usually the first block on a page.', group: 'Layout', icon: 'Sparkles' },
  { type: 'heading', label: 'Heading', hint: 'A section title, with an optional eyebrow above it.', group: 'Words', icon: 'Heading' },
  { type: 'text', label: 'Text', hint: 'Rich paragraphs — bold, italics, links, lists.', group: 'Words', icon: 'Type' },
  { type: 'quote', label: 'Pull quote', hint: 'A line worth setting large. Great for testimonials.', group: 'Words', icon: 'Quote' },
  { type: 'credits', label: 'Credits table', hint: 'Production / role / company / year rows.', group: 'Words', icon: 'ListOrdered' },
  { type: 'stats', label: 'Stat row', hint: 'Three or four numbers with labels.', group: 'Words', icon: 'BarChart3' },

  { type: 'audio', label: 'Audio player', hint: 'One track, with a waveform-style scrubber.', group: 'Media', icon: 'AudioLines' },
  { type: 'audioList', label: 'Track list', hint: 'Several takes in one player — the demo-reel widget.', group: 'Media', icon: 'ListMusic' },
  { type: 'video', label: 'Video', hint: 'An uploaded file or a direct video URL.', group: 'Media', icon: 'Video' },
  { type: 'embed', label: 'Embed', hint: 'YouTube, Vimeo, SoundCloud or Spotify by URL.', group: 'Media', icon: 'Frame' },
  { type: 'image', label: 'Image', hint: 'A single photo with an optional caption.', group: 'Media', icon: 'Image' },
  { type: 'gallery', label: 'Gallery', hint: 'A grid of photos.', group: 'Media', icon: 'Images' },

  { type: 'cards', label: 'Card grid', hint: 'Two to four linked cards side by side.', group: 'Layout', icon: 'LayoutGrid' },
  { type: 'featureCards', label: 'Feature cards', hint: 'Cards with a photo, an icon and a bullet list — the "what I do" row.', group: 'Layout', icon: 'Columns3' },
  { type: 'mediaText', label: 'Text beside a photo', hint: 'Two columns: writing on one side, an image on the other. Stacks on a phone.', group: 'Layout', icon: 'PanelsTopLeft' },
  { type: 'steps', label: 'Numbered steps', hint: 'A process, 01 → 04.', group: 'Layout', icon: 'ListOrdered' },
  { type: 'specList', label: 'Spec list', hint: 'Label-and-value rows. Studio specs, delivery details, terms.', group: 'Words', icon: 'Table2' },
  { type: 'faq', label: 'Questions', hint: 'Question-and-answer pairs.', group: 'Words', icon: 'MessagesSquare' },
  { type: 'divider', label: 'Divider', hint: 'A rule or a small ornament between sections.', group: 'Layout', icon: 'Minus' },
  { type: 'spacer', label: 'Spacer', hint: 'Blank vertical room.', group: 'Layout', icon: 'MoveVertical' },

  { type: 'button', label: 'Button', hint: 'One call to action.', group: 'Business', icon: 'MousePointerClick' },
  { type: 'buttonRow', label: 'Button row', hint: 'Two or three actions together.', group: 'Business', icon: 'Rows3' },
  { type: 'cta', label: 'Call-to-action panel', hint: 'A framed block that asks for the job.', group: 'Business', icon: 'Megaphone' },
  { type: 'contactForm', label: 'Inquiry form', hint: 'Drops the quote-request form into this page.', group: 'Business', icon: 'Mail' },

  // Live — these stay in step with the rest of the platform on their own.
  { type: 'demoReels', label: 'Demo reels', hint: 'Your reels, live. Update a reel once and every page showing it follows.', group: 'Live', icon: 'AudioLines' },
  { type: 'projectGrid', label: 'Project grid', hint: 'Your published project pages, newest first.', group: 'Live', icon: 'LayoutGrid' },
  { type: 'testimonials', label: 'Testimonials', hint: 'Quotes from the testimonials list.', group: 'Live', icon: 'Quote' },
  { type: 'packages', label: 'Coaching rates', hint: 'Your coaching packages and prices, live.', group: 'Live', icon: 'BadgeDollarSign' },
  { type: 'creditsList', label: 'Credits', hint: 'Your credits list, grouped by kind.', group: 'Live', icon: 'ScrollText' },
];

export const WIDGET_GROUPS = ['Words', 'Media', 'Layout', 'Business', 'Live'] as const;

export function widgetMeta(type: WidgetType): WidgetMeta {
  return (
    WIDGET_CATALOG.find((m) => m.type === type) ?? {
      type,
      label: type,
      hint: '',
      group: 'Layout',
      icon: 'Square',
    }
  );
}

/** Which inspector controls make sense for a given widget.
 *
 *  Showing every control for every widget is the "too many knobs" failure: a divider with a font-size
 *  slider teaches Andrew that the sliders are noise, and then he stops reading the ones that matter. */
export function relevantControls(type: WidgetType): {
  typography: boolean;
  media: boolean;
  surface: boolean;
  columns: boolean;
} {
  return {
    typography: [
      'heading', 'text', 'quote', 'button', 'buttonRow', 'stats', 'cards', 'featureCards',
      'credits', 'cta', 'hero', 'steps', 'specList', 'faq', 'creditsList', 'mediaText',
    ].includes(type),
    media: ['image', 'gallery', 'video', 'embed', 'audio', 'audioList', 'hero', 'mediaText'].includes(type),
    surface: !['spacer', 'divider'].includes(type),
    columns: ['gallery', 'cards', 'featureCards', 'stats', 'demoReels', 'projectGrid', 'testimonials', 'packages'].includes(type),
  };
}
