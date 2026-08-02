// lib/voice/default-pages.ts — the site Andrew starts with, expressed as blocks.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
//
// The owner's requirement: "make sure that all of the pages that we generate can all be fully edited
// with the widget renderer + editor… so Andrew can review everything that is already built and have
// full editing control over it."
//
// A page written as JSX is a page he can look at and not change. So none of them are. Everything
// below is the same block-array shape the builder produces, rendered by the same `WidgetRenderer`
// that renders a project page he creates from scratch. There is no privileged "system page".
//
// ── HOW A DEFAULT BECOMES HIS ───────────────────────────────────────────────────────────────────
//
// A route asks `getPageBySlug(slug, 'page')` first. If the database has nothing, it falls back to
// the array here. The moment Andrew saves an edit, the blocks are written to `va_pages` and the
// database copy wins from then on — and "Restore the original" is simply deleting that row.
//
// So this file is a DEFAULT, never a lock. It is also why the site renders correctly against a
// database that has never been seeded, which is the state it will be in when Andrew first reviews it.
//
// ── IDS ARE STABLE AND HAND-WRITTEN ─────────────────────────────────────────────────────────────
//
// Every widget below has a literal id (`home-hero`, `vo-rates`) rather than a generated one. Two
// reasons, both of which bite otherwise:
//
//   1. `createWidget()` derives ids from `Date.now()`, which makes them differ between the server
//      render and the client render — a guaranteed React hydration mismatch on every page load.
//   2. The per-widget edit button deep-links to `#<id>`. A generated id changes on every deploy, so
//      every link Andrew bookmarked into the builder would rot.

import { defaultStyle, type Widget, type WidgetStyle, type WidgetType } from './widgets';
import {
  ARTIST,
  COACHING_FAQ,
  COACHING_FOCUSES,
  COACHING_INTRO,
  LONG_BIO,
  PROCESS_STEPS,
  SERVICES,
  SHORT_BIO,
  STUDIO_SPEC,
  VOICE_CATEGORIES,
} from './content';

/** Terse constructor for the literals below. Merges over the type's default style so each block
 *  only states what makes it different — which is what keeps this file readable at 600 lines. */
function w(
  id: string,
  type: WidgetType,
  props: Record<string, unknown> = {},
  style: Partial<WidgetStyle> = {},
  extra: Partial<Widget> = {},
): Widget {
  return {
    id,
    type,
    props,
    style: { ...defaultStyle(type), ...style },
    autoMobile: true,
    ...extra,
  };
}

export interface DefaultPage {
  slug: string;
  title: string;
  /** Shown in the studio's page list so Andrew knows what he is opening. */
  description: string;
  seoTitle: string;
  seoDescription: string;
  blocks: Widget[];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The order is the research, not a preference. Every guide to voice-over portfolios says the same
// thing and the casting side says it more bluntly: the decision to keep listening is made in five to
// ten seconds, and the reel has to be reachable without a scroll or a click into a submenu. So the
// reels sit directly beneath the hero — before the services, before the biography, before anything
// Andrew would like to say. A visitor who plays a reel and leaves has had the visit this page exists
// to produce.

const HOME: DefaultPage = {
  slug: 'home',
  title: 'Home',
  description: 'The front page: hero, demo reels, what he does, recent work, process, about, contact.',
  seoTitle: `${ARTIST.name} — ${ARTIST.tagline}`,
  seoDescription: ARTIST.metaDescription,
  blocks: [
    w('home-hero', 'hero', {
      eyebrow: ARTIST.tagline,
      title: ARTIST.name,
      line: ARTIST.heroLine,
      photoId: 'recital-expressive',
      portraitPhotoId: 'portrait-formal',
      portraitCaption: ARTIST.location,
      showPortrait: true,
      height: 'tall',
      buttons: [
        { label: 'Hear the reels', href: '#reels', variant: 'solid' },
        { label: 'Request a quote', href: '/AndrewAsh/contact', variant: 'outline' },
      ],
    }),

    w('home-reels-head', 'heading', {
      eyebrow: 'Demo reels',
      text: 'Press play.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 2, background: 'surface' }),

    w('home-reels-intro', 'text', {
      html: '<p>Four categories, each about ninety seconds. Every one opens on the strongest read, with no processing on the voice — what you hear is what arrives in your inbox.</p>',
    }, { spaceAbove: 0, spaceBelow: 5, background: 'surface', size: 5, textColor: 'textMuted' }),

    w('home-reels', 'demoReels', { limit: 4, columns: 2 }, {
      spaceAbove: 0,
      spaceBelow: 5,
      background: 'surface',
    }),

    w('home-reels-note', 'text', {
      html: '<p>Want to hear your own script instead? <a href="/AndrewAsh/contact">Ask for a free sample read</a> — a short section of your copy, recorded and sent back, at no charge and with no obligation.</p>',
    }, { spaceAbove: 0, spaceBelow: 8, background: 'surface', size: 3, textColor: 'textMuted' }),

    w('home-services-head', 'heading', {
      eyebrow: 'What I do',
      text: 'Three ways to work together.',
      level: 2,
    }, { spaceAbove: 8 }),

    w('home-services', 'featureCards', {
      columns: 3,
      items: SERVICES.map((s) => ({
        title: s.title,
        body: s.blurb,
        photoId: s.photoId ?? '',
        href: s.href,
        bullets: [...s.bullets],
      })),
    }, { spaceAbove: 2 }),

    w('home-work-head', 'heading', {
      eyebrow: 'Selected work',
      text: 'Recent projects.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('home-work', 'projectGrid', { filter: 'all', limit: 3, columns: 3 }, {
      spaceAbove: 0,
      spaceBelow: 8,
      background: 'surface',
    }),

    w('home-process-head', 'heading', {
      eyebrow: 'How it works',
      text: 'From script to delivery, usually inside a day.',
      level: 2,
    }, { spaceAbove: 8 }),

    w('home-process', 'steps', { items: PROCESS_STEPS.map((s) => ({ ...s })) }, { spaceAbove: 2 }),

    w('home-about-head', 'heading', {
      eyebrow: 'About',
      text: 'Four years of training, and a stage before that.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('home-about-text', 'text', {
      html: `<p>${SHORT_BIO}</p><p>His first professional contract was telephony — greetings, menus and on-hold copy. It is not the glamorous end of the business and it is the end that teaches you the most: hundreds of short reads that have to be warm without being saccharine and identical in tone across hours. There is nowhere to hide in eleven words.</p>`,
    }, { spaceAbove: 0, spaceBelow: 4, background: 'surface', textColor: 'textMuted' }),

    w('home-about-photo', 'image', {
      photoId: 'graduation-presser-hall',
      alt: 'Andrew Ash in cap and gown outside Presser Hall, the music building at the University of Mary Hardin-Baylor',
      caption: 'Outside Presser Hall — the music building at the University of Mary Hardin-Baylor.',
    }, { width: 'wide', spaceAbove: 0, spaceBelow: 4, background: 'surface', mediaScale: 100 }),

    w('home-about-btn', 'button', {
      label: 'Read the full story',
      href: '/AndrewAsh/about',
      variant: 'outline',
    }, { spaceAbove: 0, spaceBelow: 8, background: 'surface' }),

    w('home-testimonials', 'testimonials', { context: 'all', limit: 4, columns: 2 }, { spaceAbove: 8 }),

    w('home-cta', 'cta', {
      heading: 'Need a voice for your project?',
      body: 'Send the script, or just the idea. You will get a firm quote within one business day and a free sample read of your own copy — so you can hear it before you commit to anything.',
      buttonLabel: 'Request a quote',
      buttonHref: '/AndrewAsh/contact',
      secondaryLabel: 'Looking for lessons?',
      secondaryHref: '/AndrewAsh/coaching',
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VOICE OVER
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const VOICE_OVER: DefaultPage = {
  slug: 'voice-over',
  title: 'Voice over',
  description: 'The page a client lands on when they need a voice: reels, categories, studio spec, rates.',
  seoTitle: 'Voice over',
  seoDescription:
    'Commercial, telephony, e-learning and character voice over. Broadcast-ready audio, one revision included, usually delivered within 24 hours.',
  blocks: [
    w('vo-head', 'heading', {
      eyebrow: 'Voice over',
      text: 'A voice that takes direction.',
      level: 1,
    }, { size: 9, spaceAbove: 8, spaceBelow: 3 }),

    w('vo-intro', 'text', {
      html: '<p>Four years of formal vocal training, a stage background, and a first professional contract recording several hundred telephony prompts — which is the fastest way there is to learn consistency. Broadcast-ready audio, one revision included, usually back inside a day.</p>',
    }, { size: 5, spaceBelow: 4 }),

    w('vo-buttons', 'buttonRow', {
      buttons: [
        { label: 'Hear the reels', href: '#reels', variant: 'solid' },
        { label: 'Request a quote', href: '/AndrewAsh/contact', variant: 'outline' },
      ],
    }, { spaceBelow: 7 }),

    w('vo-divider', 'divider', { variant: 'ornament' }, { spaceAbove: 0, spaceBelow: 6 }),

    w('vo-reels', 'demoReels', { limit: 6, columns: 2, downloadable: true }, { spaceAbove: 0, spaceBelow: 8 }),

    w('vo-cats-head', 'heading', {
      eyebrow: 'What I record',
      text: 'Four kinds of work.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('vo-cats', 'cards', {
      columns: 2,
      items: VOICE_CATEGORIES.map((c) => ({
        title: c.label,
        body: `${c.blurb}  ${c.traits.join(' · ')}`,
      })),
    }, { spaceAbove: 0, spaceBelow: 8, background: 'surface' }),

    w('vo-spec-head', 'heading', {
      eyebrow: 'The technical part',
      text: 'Delivered the way your editor wants it.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3 }),

    w('vo-spec-intro', 'text', {
      html: '<p>If you have a spec sheet, send it and it will be matched. If you do not, this is what arrives by default — and it drops straight into a timeline without anyone having to clean it up first.</p>',
    }, { spaceBelow: 3, textColor: 'textMuted' }),

    w('vo-spec', 'specList', {
      rows: STUDIO_SPEC.map((s) => ({ label: s.label, value: s.value })),
    }, { spaceAbove: 0, spaceBelow: 8 }),

    w('vo-rates-head', 'heading', {
      eyebrow: 'Rates',
      text: 'Roughly what things cost.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('vo-rates-intro', 'text', {
      html: '<p>Voice-over is priced on two things: how much there is to read, and where it will be used. A script that runs nationally is worth more than the same script on one company’s website, and the difference is the licence, not the recording.</p><p>Send the actual script and you will get a firm number — and a free sample read of your own copy, so you can hear it first.</p>',
    }, { spaceAbove: 0, spaceBelow: 5, background: 'surface', textColor: 'textMuted' }),

    // Usage scopes as a spec list rather than a bound widget: these are contract terms, and a client
    // reading them on the marketing page should see exactly the words that will be in their
    // agreement. Kept literal so Andrew edits both together, deliberately.
    w('vo-usage', 'specList', {
      title: 'What a usage licence actually means',
      rows: [
        { label: 'Internal use only', value: 'Used inside your organisation — training, internal comms. Not public-facing.' },
        { label: 'Phone system / on-hold', value: 'IVR menus, on-hold messaging and voicemail for your own lines.' },
        { label: 'Web & social', value: 'Your website and owned social channels. No paid placement.' },
        { label: 'Regional broadcast', value: 'Paid placement within a defined region — radio, local TV, regional streaming.' },
        { label: 'National broadcast', value: 'Paid placement nationally across broadcast and streaming.' },
        { label: 'Full buyout', value: 'Unlimited use, all media, in perpetuity. Priced accordingly.' },
      ],
    }, { spaceAbove: 0, spaceBelow: 8, background: 'surface' }),

    w('vo-testimonials', 'testimonials', { context: 'voice', limit: 4, columns: 2 }, { spaceAbove: 8 }),

    w('vo-cta', 'cta', {
      heading: 'Send the script.',
      body: 'A firm quote within one business day, and a free sample read of your own copy. If it is not right, you have lost nothing.',
      buttonLabel: 'Request a quote',
      buttonHref: '/AndrewAsh/contact?intent=voiceover',
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// COACHING
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const COACHING: DefaultPage = {
  slug: 'coaching',
  title: 'Coaching',
  description: 'Vocal coaching: approach, what lessons cover, packages and prices, questions.',
  seoTitle: 'Vocal coaching',
  seoDescription:
    'One-to-one vocal coaching for singers and speakers — technique, range, stamina and confidence. Online or in person in Central Texas.',
  blocks: [
    w('co-hero', 'hero', {
      eyebrow: 'Vocal coaching',
      title: 'Your voice can do more than it is doing.',
      line: 'One-to-one lessons for singers and speakers, built on four years of formal training and taught in plain language.',
      photoId: 'ensemble-choir',
      showPortrait: false,
      height: 'short',
      buttons: [
        { label: 'See rates', href: '#packages', variant: 'solid' },
        { label: 'Book a first lesson', href: '/AndrewAsh/contact?intent=coaching', variant: 'outline' },
      ],
    }),

    w('co-intro', 'text', {
      html: COACHING_INTRO.map((p) => `<p>${p}</p>`).join(''),
    }, { spaceAbove: 8, spaceBelow: 8, size: 5 }),

    w('co-focus-head', 'heading', {
      eyebrow: 'What we work on',
      text: 'Whatever you actually came for.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('co-focus', 'cards', {
      columns: 3,
      items: COACHING_FOCUSES.map((f) => ({ title: f.title, body: f.body })),
    }, { spaceAbove: 0, spaceBelow: 8, background: 'surface' }),

    w('co-packages-head', 'heading', {
      eyebrow: 'Rates',
      text: 'Lessons and packages.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3 }),

    w('co-packages', 'packages', { columns: 3, showInclusions: true }, { spaceAbove: 0, spaceBelow: 4 }),

    w('co-packages-note', 'text', {
      html: '<p>Lessons are online or in person in Central Texas. Sessions in a package expire six months after purchase — that is to keep progress continuous, not to withhold what you paid for, and it gets extended on request when life intervenes.</p>',
    }, { spaceAbove: 0, spaceBelow: 8, size: 3, textColor: 'textMuted' }),

    w('co-testimonials', 'testimonials', { context: 'coaching', limit: 4, columns: 2 }, { spaceAbove: 6, background: 'surface' }),

    w('co-faq-head', 'heading', {
      eyebrow: 'Questions',
      text: 'The ones people actually ask.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3 }),

    w('co-faq', 'faq', {
      items: COACHING_FAQ.map((f) => ({ q: f.q, a: f.a })),
      collapsible: true,
      openFirst: true,
    }, { spaceAbove: 0, spaceBelow: 8 }),

    w('co-cta', 'cta', {
      heading: 'Start with one lesson.',
      body: 'A single session is a good way to find out whether we work well together, before committing to anything longer.',
      buttonLabel: 'Book a first lesson',
      buttonHref: '/AndrewAsh/contact?intent=coaching',
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WORK
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const WORK: DefaultPage = {
  slug: 'work',
  title: 'Work',
  description: 'The project index. The grid fills itself from published project pages.',
  seoTitle: 'Work',
  seoDescription: 'Voice-over projects, stage credits and current work by Andrew Ash.',
  blocks: [
    w('wk-head', 'heading', {
      eyebrow: 'Work',
      text: 'Projects, past and current.',
      level: 1,
    }, { size: 9, spaceAbove: 8, spaceBelow: 3 }),

    w('wk-intro', 'text', {
      html: '<p>Each project has its own page with the audio, the brief and what the work involved. Anything marked <em>in progress</em> is live now.</p>',
    }, { size: 5, spaceBelow: 6, textColor: 'textMuted' }),

    w('wk-grid', 'projectGrid', { filter: 'all', limit: 24, columns: 3 }, { spaceAbove: 0, spaceBelow: 8 }),

    w('wk-credits-head', 'heading', {
      eyebrow: 'Credits',
      text: 'The full list.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('wk-credits', 'creditsList', { creditType: 'all', limit: 40 }, {
      spaceAbove: 0,
      spaceBelow: 8,
      background: 'surface',
    }),

    w('wk-cta', 'cta', {
      heading: 'Something you want made?',
      body: 'Send the script or the brief and get a quote back within one business day.',
      buttonLabel: 'Request a quote',
      buttonHref: '/AndrewAsh/contact',
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ABOUT
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const ABOUT: DefaultPage = {
  slug: 'about',
  title: 'About',
  description: 'The story, the training, the credits and a gallery.',
  seoTitle: 'About Andrew Ash',
  seoDescription:
    'Andrew Ash — voice actor and vocal coach in Central Texas, with a music degree from the University of Mary Hardin-Baylor.',
  blocks: [
    w('ab-hero', 'hero', {
      eyebrow: 'About',
      title: 'Andrew Ash',
      line: 'Trained singer, stage actor, and — since this summer — a working voice.',
      photoId: 'recital-white-tie',
      showPortrait: false,
      height: 'short',
      buttons: [],
    }, { backgroundOverlay: 60 }),

    w('ab-story', 'text', {
      html: LONG_BIO.map((p) => `<p>${p}</p>`).join(''),
    }, { spaceAbove: 8, spaceBelow: 8, size: 5 }),

    w('ab-stats', 'stats', {
      items: [
        { value: '2026', label: 'UMHB graduate' },
        { value: '4', label: 'Years of formal training' },
        { value: '24h', label: 'Typical turnaround' },
        { value: 'TX', label: 'Central Texas based' },
      ],
    }, { spaceAbove: 6, spaceBelow: 6, background: 'surface' }),

    w('ab-training-head', 'heading', {
      eyebrow: 'Training',
      text: 'Where it came from.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3 }),

    w('ab-training', 'text', {
      html: '<p>Four years in the music programme at the University of Mary Hardin-Baylor: recitals in white tie, musical-theatre leads, choral ensemble, and the daily unglamorous business of learning what a voice can actually do — where it sits, where it breaks, and how to keep it for a three-hour call and still have it the next morning.</p><p>The business emphasis is not decoration. A working performer runs a business, and most of them learn that part the expensive way.</p>',
    }, { spaceBelow: 5, textColor: 'textMuted' }),

    w('ab-gallery', 'gallery', {
      columns: 3,
      items: [
        { photoId: 'stage-duet', alt: 'Andrew Ash performing a duet in a stage musical', caption: 'Musical theatre' },
        { photoId: 'recital-expressive', alt: 'Andrew Ash mid-performance at a recital', caption: 'Recital' },
        { photoId: 'ensemble-choir', alt: 'Andrew Ash singing in a vocal ensemble', caption: 'Ensemble' },
        { photoId: 'stage-period-scene', alt: 'Andrew Ash in period costume performing a comic scene', caption: 'Comic character work' },
        // This photograph includes his parents, and the caption says so. No crop of it means "Andrew
        // in costume" rather than "Andrew with his parents" — so it lives here, captioned, where that
        // is the right thing for it to mean.
        { photoId: 'stage-costume', alt: 'Andrew Ash in full period costume after a performance, with his parents', caption: 'After a show, with his parents' },
        { photoId: 'graduation-umhb', alt: 'Andrew Ash in cap and gown beside the UMHB letters', caption: 'Graduation, 2026' },
      ],
    }, { width: 'wide', spaceAbove: 4, spaceBelow: 8, aspect: '4:3' }),

    w('ab-credits-head', 'heading', {
      eyebrow: 'Credits',
      text: 'Selected credits.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3, background: 'surface' }),

    w('ab-credits', 'creditsList', { creditType: 'all', limit: 40 }, {
      spaceAbove: 0,
      spaceBelow: 8,
      background: 'surface',
    }),

    w('ab-early-head', 'heading', {
      eyebrow: 'Before all that',
      text: 'It started early.',
      level: 2,
    }, { spaceAbove: 8, spaceBelow: 3 }),

    w('ab-early', 'text', {
      html: '<p>Long before any of the training, there was a kid who would not stop doing voices. That part has not really changed — the difference is that now it is on purpose.</p>',
    }, { spaceBelow: 3, textColor: 'textMuted' }),

    w('ab-early-photo', 'image', {
      photoId: 'archive-young',
      alt: 'Andrew Ash as a child',
      caption: 'The original performer.',
    }, { spaceAbove: 0, spaceBelow: 8, mediaScale: 45, align: 'left' }),

    w('ab-cta', 'cta', {
      heading: 'Work together?',
      body: 'Voice-over quotes come back within one business day. Coaching starts with a single lesson.',
      buttonLabel: 'Get in touch',
      buttonHref: '/AndrewAsh/contact',
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CONTACT
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CONTACT: DefaultPage = {
  slug: 'contact',
  title: 'Contact',
  description: 'The quote and sample request form — the page every other page points at.',
  seoTitle: 'Request a quote',
  seoDescription:
    'Request a voice-over quote or book a vocal coaching lesson with Andrew Ash. Quotes within one business day and a free sample read.',
  blocks: [
    w('ct-head', 'heading', {
      eyebrow: 'Get in touch',
      text: 'Tell me about the project.',
      level: 1,
    }, { size: 9, spaceAbove: 8, spaceBelow: 3 }),

    w('ct-intro', 'text', {
      html: '<p>A firm quote within one business day, and a free sample read of your own copy so you can hear it before committing to anything. If you are here about lessons, choose <em>Coaching</em> below and the questions change.</p>',
    }, { size: 5, spaceBelow: 5, textColor: 'textMuted' }),

    w('ct-form', 'contactForm', { intent: 'voiceover', heading: '', compact: false }, {
      spaceAbove: 0,
      spaceBelow: 8,
    }),

    w('ct-what-next', 'specList', {
      title: 'What happens next',
      rows: [
        { label: 'Within 1 business day', value: 'A reply with a firm quote, or the two questions needed to give you one.' },
        { label: 'Free of charge', value: 'A short sample read of your own script, so you can hear it before deciding.' },
        { label: 'Before recording', value: 'A simple written agreement naming the fee, the usage and the delivery date.' },
        { label: 'On delivery', value: 'Broadcast-ready audio, plus one included revision round.' },
      ],
    }, { spaceAbove: 6, spaceBelow: 8, background: 'surface' }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const DEFAULT_PAGES: readonly DefaultPage[] = [HOME, VOICE_OVER, COACHING, WORK, ABOUT, CONTACT];

export function defaultPageBySlug(slug: string): DefaultPage | undefined {
  return DEFAULT_PAGES.find((p) => p.slug === slug);
}

/** Slugs that have a built-in default. The studio uses this to offer "Restore the original". */
export const DEFAULT_PAGE_SLUGS = DEFAULT_PAGES.map((p) => p.slug);

/**
 * A brand-new project page, pre-filled with a usable structure.
 *
 * Not an empty page. Facing a blank canvas is where a non-designer stops, and the difference between
 * "add your first block" and a page that already has a heading, a player, a description and a call to
 * action is the difference between Andrew publishing his first project and not.
 */
export function newProjectBlocks(title: string): Widget[] {
  const stamp = Date.now().toString(36);
  return [
    w(`p_${stamp}_1`, 'heading', { eyebrow: 'Project', text: title, level: 1 }, { size: 9, spaceAbove: 7 }),
    w(`p_${stamp}_2`, 'text', {
      html: '<p>What was it, who was it for, and what did you bring to it? Two or three sentences is plenty.</p>',
    }, { size: 5, textColor: 'textMuted' }),
    w(`p_${stamp}_3`, 'audio', { title: 'The finished spot', subtitle: '', url: '' }),
    w(`p_${stamp}_4`, 'image', { photoId: '', url: '', alt: '', caption: '' }),
    w(`p_${stamp}_5`, 'specList', {
      title: 'The brief',
      rows: [
        { label: 'Client', value: '' },
        { label: 'Role', value: '' },
        { label: 'Delivered', value: '' },
      ],
    }),
    w(`p_${stamp}_6`, 'cta', {
      heading: 'Need something like this?',
      body: 'Send the script and get a quote back within one business day.',
      buttonLabel: 'Request a quote',
      buttonHref: '/AndrewAsh/contact',
    }),
  ];
}
