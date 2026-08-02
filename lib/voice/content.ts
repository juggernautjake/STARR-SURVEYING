// lib/voice/content.ts — the words on the public pages, as data.
//
// Everything here is editable from the studio; this file is what the site says before Andrew has
// touched anything. It exists as a module rather than as seed rows because the public pages must
// render correctly on a database that has never been seeded — a portfolio whose first deploy shows
// empty sections is a portfolio nobody trusts.
//
// ── WHAT IS TRUE AND WHAT IS A PLACEHOLDER ──────────────────────────────────────────────────────
//
// The biographical copy below is written from what is actually known: a music degree from the
// University of Mary Hardin-Baylor, a first professional contract recording phone and on-hold audio,
// years of stage and choral performance, based in Central Texas. Where a fact is not known — specific
// production names, client names, quotes from real people — the entry carries `placeholder: true` and
// the studio marks it "EXAMPLE — replace before publishing" in a colour that is hard to ignore.
//
// This distinction is load-bearing. A portfolio that ships with invented credits is not a draft, it is
// a lie with Andrew's name on it, and the person who would be embarrassed is not the developer.

export interface Placeholder {
  /** True when this is example content that must be replaced with something real. */
  placeholder?: boolean;
}

// ── Identity ─────────────────────────────────────────────────────────────────────────────────────

export const ARTIST = {
  name: 'Andrew Ash',
  fullName: 'Andrew Donald Ash',
  tagline: 'Voice actor & vocal coach',
  /** The one line under the hero. Says what he does and who for, in that order. */
  heroLine: 'A trained voice for commercials, phone systems, characters and narration — and coaching for singers who want theirs to do more.',
  location: 'Central Texas',
  /** Used in meta descriptions and OG cards. Under 160 characters on purpose. */
  metaDescription:
    'Andrew Ash — voice actor and vocal coach in Central Texas. Commercial, telephony, character and narration voice work, plus one-to-one vocal coaching.',
} as const;

export const SHORT_BIO =
  'Andrew Ash is a voice actor and vocal coach based in Central Texas. He holds a music degree with a business emphasis from the University of Mary Hardin-Baylor, where he spent four years on stage — in musicals, in choral ensembles, and in solo recital — before taking that training into the booth.';

export const LONG_BIO = [
  'Andrew Ash has been performing for as long as he can remember, and studying it for rather less time than that. The studying is what changed things.',
  'He graduated from the University of Mary Hardin-Baylor with a music degree and a business emphasis — a combination that sounds odd until you meet a working performer. Four years in UMHB’s music programme meant recitals in white tie, musical theatre leads, choral ensemble work, and the daily unglamorous business of learning what a voice can actually do: where it sits, where it breaks, how to keep it for a three-hour call and still have it the next morning.',
  'His first professional voice contract was telephony — the greeting, the menu, the on-hold copy for a company’s phone lines. It is not the work that gets put on a showreel first, and it is exactly the work that teaches you the most: hundreds of short reads that have to be warm without being saccharine, clear without being cold, and identical in tone across a session that runs for hours. A menu prompt is unforgiving. There is nowhere to hide in eleven words.',
  'He works in commercial, corporate and e-learning narration, character and animation, and singing. He also coaches — one-to-one, online or in person — for singers who want more range, more stamina, or simply to stop being frightened of the top of their voice.',
] as const;

// ── What he does ─────────────────────────────────────────────────────────────────────────────────

export interface ServiceCard {
  id: string;
  title: string;
  blurb: string;
  bullets: string[];
  href: string;
  icon: string;
  /** A photo where ANDREW is the subject and is alone in it.
   *
   *  The first pass used `event-tuxedo` here, which is a nice photograph of Andrew standing next to
   *  a mentor — and on a service card, cropped to a landscape window, it reads as a stock photo of
   *  two strangers. A card selling Andrew's work has to show Andrew, unambiguously and by himself.
   *  Photos containing other people stay on the About page, where the caption explains who they are. */
  photoId?: string;
}

export const SERVICES: readonly ServiceCard[] = [
  {
    id: 'voiceover',
    title: 'Voice over',
    blurb:
      'Commercial, corporate, e-learning and telephony. Broadcast-ready audio, delivered fast, with the direction taken the first time.',
    bullets: [
      'Commercials and brand spots',
      'Phone systems, IVR menus and on-hold',
      'E-learning, explainer and corporate narration',
      'Audiobook and long-form narration',
    ],
    href: '/AndrewAsh/voice-over',
    icon: 'Mic',
    photoId: 'recital-white-tie',
  },
  {
    id: 'character',
    title: 'Character & singing',
    blurb:
      'Trained singer, stage-trained actor. Characters that hold up across a whole session, and a voice that can carry a melody when the part asks for one.',
    bullets: [
      'Games, animation and audio drama',
      'Character range across ages and registers',
      'Sung performance — musical theatre and classical',
      'Accents and dialects on request',
    ],
    href: '/AndrewAsh/work',
    icon: 'Drama',
    photoId: 'stage-duet',
  },
  {
    id: 'coaching',
    title: 'Vocal coaching',
    blurb:
      'One-to-one lessons for singers and speakers. Technique, stamina and confidence — built on conservatoire training, taught in plain language.',
    bullets: [
      'Beginners through working performers',
      'Breath, support, range and registration',
      'Audition and repertoire preparation',
      'Voice care for people who talk for a living',
    ],
    href: '/AndrewAsh/coaching',
    icon: 'GraduationCap',
    photoId: 'ensemble-choir',
  },
];

// ── Voice-over page ──────────────────────────────────────────────────────────────────────────────

export interface VoiceCategory {
  id: string;
  label: string;
  blurb: string;
  /** Traits a casting director scans for. */
  traits: string[];
}

export const VOICE_CATEGORIES: readonly VoiceCategory[] = [
  {
    id: 'commercial',
    label: 'Commercial',
    blurb: 'Warm, credible reads for brands that want to sound like a person rather than a press release.',
    traits: ['Warm', 'Conversational', 'Confident', 'Friendly authority'],
  },
  {
    id: 'telephony',
    label: 'Telephony & on-hold',
    blurb:
      'Greetings, menus, hold copy and voicemail. Consistent across hundreds of prompts, and recorded to the specifications your phone system actually needs.',
    traits: ['Clear', 'Even', 'Unhurried', 'Professional'],
  },
  {
    id: 'narration',
    label: 'Narration & e-learning',
    blurb: 'Long-form reads that stay listenable — training modules, explainers, documentary and corporate.',
    traits: ['Measured', 'Articulate', 'Engaged', 'Trustworthy'],
  },
  {
    id: 'character',
    label: 'Character & animation',
    blurb: 'Range across age, register and temperament, from stage-trained comic timing to genuine menace.',
    traits: ['Versatile', 'Comic', 'Theatrical', 'Sung performance'],
  },
];

/** The studio spec sheet. Clients — and especially agencies — look for exactly this list, and its
 *  absence reads as "not set up yet". Every value is editable from the studio settings. */
export const STUDIO_SPEC = [
  { label: 'Delivery format', value: 'WAV 48 kHz / 24-bit, MP3 320 kbps, or your spec' },
  { label: 'Typical turnaround', value: 'Within 24 hours for standard scripts' },
  { label: 'Editing', value: 'Cleaned, de-breathed and levelled as standard' },
  { label: 'Direction', value: 'Live sessions available — Zoom, Teams, Source-Connect Now' },
  { label: 'Revisions', value: 'One round included on every job' },
  { label: 'Region', value: 'Central Texas — working remotely worldwide' },
] as const;

// ── Coaching page ────────────────────────────────────────────────────────────────────────────────

export const COACHING_INTRO = [
  'Most people who want to sing better have been told to "support" and "open up" and "use your diaphragm" by someone who never explained what any of that means. Four years of formal training later, I can tell you: those phrases are shorthand for real, physical, teachable things — and almost none of them are taught well.',
  'Lessons are one-to-one, online or in person, and built around what you actually want. Some people arrive with an audition in three weeks. Some want to get through a set without losing the top of their range. Some just want to stop apologising before they sing.',
] as const;

export interface CoachingFocus {
  title: string;
  body: string;
  icon: string;
}

export const COACHING_FOCUSES: readonly CoachingFocus[] = [
  {
    title: 'Breath and support',
    body: 'What is actually happening when someone says "support", and how to build it so it holds up under pressure rather than only in a practice room.',
    icon: 'Wind',
  },
  {
    title: 'Range and registration',
    body: 'Finding the top and bottom of your voice without forcing either, and smoothing the joins between them so the change stops being audible.',
    icon: 'AudioWaveform',
  },
  {
    title: 'Stamina and voice care',
    body: 'How to sing or speak for hours and still have a voice the next day. Especially for teachers, presenters and anyone who talks for a living.',
    icon: 'HeartPulse',
  },
  {
    title: 'Repertoire and audition prep',
    body: 'Choosing material that shows what you do well, and rehearsing it until the audition is the easy part.',
    icon: 'ScrollText',
  },
  {
    title: 'Performance and nerves',
    body: 'Stage craft, and the practical business of being frightened and singing well anyway. Stage-trained, not theoretical.',
    icon: 'Sparkles',
  },
  {
    title: 'Voice for the booth',
    body: 'For anyone moving toward voice work: mic technique, read consistency, and taking direction without losing the performance.',
    icon: 'Mic',
  },
];

export const COACHING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Do I need to be able to read music?',
    a: 'No. It helps eventually, and we can build it in if you want it — but nothing in a first lesson depends on it.',
  },
  {
    q: 'Are lessons online or in person?',
    a: 'Either. Online works well for technique and repertoire; in person is better for anything involving the whole body and the room. Central Texas for in-person.',
  },
  {
    q: 'How often should I have lessons?',
    a: 'Weekly is the standard for real progress. Fortnightly works if you practise between. Less than that and each lesson is spent recovering the last one.',
  },
  {
    q: 'What if I have never had a lesson before?',
    a: 'Then you have no habits to unlearn, which is genuinely an advantage. Beginners are welcome and the first lesson is mostly listening and diagnosis.',
  },
  {
    q: 'Do you teach children?',
    a: 'Teenagers, yes. Younger than about thirteen is specialist work and I would rather refer you to someone who does it properly.',
  },
  {
    q: 'My voice hurts when I sing. Can you fix that?',
    a: 'Possibly — a lot of pain is technique. But pain, hoarseness lasting more than two weeks, or any loss of voice is a reason to see an ENT first. I will say so rather than guess.',
  },
];

// ── Process ──────────────────────────────────────────────────────────────────────────────────────

export const PROCESS_STEPS = [
  {
    step: '01',
    title: 'Send the script',
    body: 'Or just the idea. Word count, deadline and where it will be used are enough for a quote.',
  },
  {
    step: '02',
    title: 'Get a quote and a sample',
    body: 'A firm price within one business day, and a short sample read of your own copy at no charge.',
  },
  {
    step: '03',
    title: 'Approve and record',
    body: 'A simple agreement, a deposit, then recording — with you directing live if you want to be there.',
  },
  {
    step: '04',
    title: 'Delivery and revisions',
    body: 'Broadcast-ready audio, usually within 24 hours. One revision round is included on every job.',
  },
] as const;

// ── Placeholder content ──────────────────────────────────────────────────────────────────────────
//
// Everything below is EXAMPLE data. It exists so the site has shape on day one and so Andrew can see
// what a filled-in section looks like before he has filled one in. All of it is flagged, and the
// studio refuses to let a page go live with flagged testimonials still on it.

export interface ExampleTestimonial extends Placeholder {
  quote: string;
  author: string;
  role: string;
  context: 'voice' | 'coaching' | 'both';
}

export const EXAMPLE_TESTIMONIALS: readonly ExampleTestimonial[] = [
  {
    quote: 'This is where a real quote from a real client goes. Replace it before this page goes live.',
    author: 'Client name',
    role: 'Their role, their company',
    context: 'voice',
    placeholder: true,
  },
  {
    quote: 'And this is where a student says what changed. Ask for one after a package finishes — that is when people are most willing.',
    author: 'Student name',
    role: 'Voice student',
    context: 'coaching',
    placeholder: true,
  },
];

export interface ExampleCredit extends Placeholder {
  production: string;
  role: string;
  company: string;
  year: number | null;
  type: 'stage' | 'voice' | 'music' | 'education' | 'award';
}

/** The one credit here that is NOT a placeholder is the degree — that one is known. */
export const SEED_CREDITS: readonly ExampleCredit[] = [
  {
    production: 'Music degree, business emphasis',
    role: 'Bachelor’s degree',
    company: 'University of Mary Hardin-Baylor',
    year: 2026,
    type: 'education',
  },
  {
    production: 'Telephony & on-hold voice package',
    role: 'Voice talent',
    company: 'First professional contract',
    year: 2026,
    type: 'voice',
  },
  {
    production: 'Production name',
    role: 'Role played',
    company: 'Theatre or company',
    year: null,
    type: 'stage',
    placeholder: true,
  },
  {
    production: 'Recital or concert',
    role: 'Soloist',
    company: 'Venue',
    year: null,
    type: 'music',
    placeholder: true,
  },
];

/** Demo reels Andrew has not recorded yet. Each renders as a player with a "coming soon" state rather
 *  than as a broken audio element — an empty <audio> tag on a portfolio looks like a bug. */
export const PLACEHOLDER_DEMOS = [
  { id: 'commercial', title: 'Commercial reel', category: 'commercial', duration: 75, blurb: 'Warm, conversational brand reads.' },
  { id: 'telephony', title: 'Telephony & on-hold', category: 'telephony', duration: 60, blurb: 'Greetings, menus and hold copy.' },
  { id: 'narration', title: 'Narration & e-learning', category: 'narration', duration: 90, blurb: 'Long-form corporate and training.' },
  { id: 'character', title: 'Character reel', category: 'character', duration: 90, blurb: 'Range across age, register and temperament.' },
] as const;

// ── Navigation ───────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_NAV = [
  { label: 'Voice over', href: '/AndrewAsh/voice-over' },
  { label: 'Coaching', href: '/AndrewAsh/coaching' },
  { label: 'Work', href: '/AndrewAsh/work' },
  { label: 'About', href: '/AndrewAsh/about' },
  { label: 'Contact', href: '/AndrewAsh/contact' },
] as const;

export const BASE_PATH = '/AndrewAsh';
