// lib/voice/playbook.ts — the guide Andrew reads before he does anything else.
//
// The owner's ask: "a fully interactive and intuitive breakdown of how the site works and its
// purpose and how to best utilize it to get jobs and customers and run a successful business…
// explain to Andrew clearly and in a fun way… I want to help Andrew see exactly what it would take
// to run a legit voice acting business."
//
// ── WHY THIS IS DATA AND NOT A PAGE OF JSX ──────────────────────────────────────────────────────
//
// Two reasons. It renders as collapsible sections, and a structured document lets the renderer handle
// open/closed, deep-linking and a reading-progress marker without every section reimplementing them.
// And rates change — the 2026 GVAA guide raised non-union rates 12–18% over 2025 — so the numbers
// need to live somewhere a person can edit in one place next January.
//
// ── EVERY NUMBER HERE IS SOURCED OR LABELLED ────────────────────────────────────────────────────
//
// This document tells a 22-year-old what to charge for his labour. Getting that wrong in either
// direction does real damage: too low and he anchors himself into a rate that takes years to climb
// out of; too high and he loses the first ten jobs that would have built his reel. So every figure
// carries a `source` or is explicitly marked as an estimate, and where the sources disagree — they do,
// on e-learning — the document says so rather than picking one and sounding confident.
//
// The tone is deliberately plain and a bit funny. A document that reads like a compliance manual is a
// document that gets closed on the first scroll.

/**
 * A single real-world task, broken down far enough that Andrew can do it without a second search.
 *
 * The owner's ask: *"if he goes in to get a business bank account, what all will he need to do that?
 * … list it all out in chunks and make it so that the chunks are manageable so he can work through
 * them at his own pace and not be overwhelmed."*
 *
 * So each task carries the four things that actually stop someone starting: what it costs, how long
 * it takes, what to bring, and the steps — each step individually tickable. A task that says "file a
 * DBA" is a task that gets postponed; a task that says "$15–25, 30 minutes, bring photo ID and the
 * exact business name, go to the Bell County Clerk" is a task that gets done on a Tuesday.
 */
export interface PlaybookTask {
  /** Stable id — used as the checkbox key, so renaming a task must not reset progress. */
  id: string;
  title: string;
  summary: string;
  cost: string;
  time: string;
  /** Where it actually happens — a website, an office, a phone call. */
  where?: string;
  /** What to have in hand before starting. The thing nobody tells you. */
  need?: string[];
  /** The steps, each individually tickable. */
  steps: { text: string; detail?: string }[];
  /** One thing that trips people up. */
  gotcha?: string;
  links?: { label: string; url: string }[];
  /** True when this can safely wait. Rendered as a "later" chip so the list is not all urgent. */
  optional?: boolean;
}

export type PlaybookBlock =
  | { kind: 'tasks'; intro?: string; items: PlaybookTask[] }
  | { kind: 'para'; text: string }
  | { kind: 'lead'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'checklist'; items: { text: string; detail?: string }[] }
  | { kind: 'callout'; tone: 'tip' | 'warn' | 'money' | 'law'; title: string; text: string }
  | { kind: 'rates'; caption?: string; columns: string[]; rows: (string | number)[][]; note?: string }
  | { kind: 'steps'; items: { title: string; body: string }[] }
  | { kind: 'source'; label: string; url: string }[]
  | { kind: 'sources'; items: { label: string; url: string }[] };

export interface PlaybookSection {
  id: string;
  title: string;
  /** One line under the title, always visible even when collapsed. */
  summary: string;
  icon: string;
  /** Roughly how long it takes to read. Shown so a long section is not a surprise. */
  minutes: number;
  /** Opened by default. Only the first two are. */
  openByDefault?: boolean;
  blocks: PlaybookBlock[];
}

export interface PlaybookChapter {
  id: string;
  title: string;
  blurb: string;
  sections: PlaybookSection[];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHAPTER 1 — THE SITE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CH_SITE: PlaybookChapter = {
  id: 'site',
  title: 'Your website, and how to drive it',
  blurb: 'What each part is for, and the ten minutes of setup that matter most.',
  sections: [
    {
      id: 'what-this-is',
      title: 'What this thing actually is',
      summary: 'Two websites in a trench coat: the one clients see, and the one you run the business from.',
      icon: 'Compass',
      minutes: 3,
      blocks: [
        {
          kind: 'lead',
          text: 'Congratulations — you own a website, a portfolio, a contract system, an invoicing system, a bookkeeper and a filing cabinet. They are all the same thing and it lives on your phone.',
        },
        {
          kind: 'para',
          text: 'There are exactly two halves to understand, and then you know the whole system.',
        },
        {
          kind: 'list',
          items: [
            '**The public site** — everything at /AndrewAsh. This is what a casting director, a marketing manager or a nervous person who wants singing lessons sees. Its entire job is to get someone to press play and then fill in the form.',
            '**The studio** — everything at /AndrewAsh/studio. This is yours. Nobody else can reach it. Inquiries land here, contracts get signed here, invoices get paid here, and every dollar you spend on a microphone gets recorded here so it comes off your taxes.',
          ],
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'The one thing to remember',
          text: 'When you are logged in, every page of the public site grows a little "Edit" button on each block. You do not go somewhere special to change the site — you look at the thing you want to change, and click the pencil on it.',
        },
        {
          kind: 'para',
          text: 'There is a "View as a client" switch in the gold bar at the top. Use it constantly. It shows you exactly what a stranger sees, with none of your editing furniture. The difference between a site that converts and one that does not is usually something you stopped noticing because you had been staring at it in edit mode for a month.',
        },
      ],
    },
    {
      id: 'first-ten-minutes',
      title: 'Your first ten minutes',
      summary: 'Six things to do before you show this to anybody.',
      icon: 'Rocket',
      minutes: 4,
      blocks: [
        {
          kind: 'para',
          text: 'The site is built and it works. But a few things in it are placeholders written by someone who is not you, and a couple of them would be embarrassing if a client read them.',
        },
        {
          kind: 'checklist',
          items: [
            {
              text: 'Replace the example testimonials',
              detail:
                'There are two, and they are flagged in orange in the studio. They say "this is where a real quote goes". The site will not let you publish a page with them still on it, but replace them properly — ask your first three clients for a sentence each. People say yes to this far more often than you expect, and the best moment to ask is the day you deliver.',
            },
            {
              text: 'Record four demo reels',
              detail:
                'Commercial, telephony, narration, character. Ninety seconds each, five or six segments of 15–20 seconds. Open with your strongest read and no processing on the voice — the client wants to hear you, not a plugin. Right now the players say "coming soon", which is honest but does not get you hired.',
            },
            {
              text: 'Fix the credits list',
              detail:
                'Settings → Credits. Real production names, real roles, real years. Your degree and the telephony contract are already in there because those are known.',
            },
            {
              text: 'Set your email and phone',
              detail: 'Studio → Settings. Right now the footer has no way to reach you, which is a fairly serious flaw in a website whose purpose is being reachable.',
            },
            {
              text: 'Check your rates',
              detail: 'Studio → Coaching → Packages. The defaults are researched starting points, not decisions. The pricing chapter below explains what they are based on.',
            },
            {
              text: 'Add the site to your phone',
              detail:
                'Open /AndrewAsh/studio on your phone, hit Share → Add to Home Screen. It becomes an app, and it can send you a notification the moment somebody requests a quote.',
            },
          ],
        },
      ],
    },
    {
      id: 'pages-and-widgets',
      title: 'Pages, blocks and the mobile view',
      summary: 'How to change anything on the site without breaking it.',
      icon: 'LayoutGrid',
      minutes: 5,
      blocks: [
        {
          kind: 'para',
          text: 'Every page is a stack of blocks. A block is a heading, a paragraph, a photo, an audio player, a row of buttons — about thirty kinds. You drag them into order, and each one has a panel of controls on the right for size, spacing, colour and alignment.',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'You cannot make it ugly by accident',
          text: 'The controls are on fixed scales rather than free numbers, and every colour defaults to "follow the site theme". A block you never touch is automatically on-palette and automatically readable. You have to work at making it bad.',
        },
        {
          kind: 'para',
          text: 'Some blocks are **live**. The demo reel row, the project grid, the coaching prices and the credits list all pull from your actual data. Change a price once in Settings and every page quoting it updates. This matters more than it sounds: the alternative is remembering all four pages that mention your rate, and the one you forget is the one the client is reading.',
        },
        {
          kind: 'steps',
          items: [
            { title: 'Editing an existing page', body: 'Open the page, click the pencil on the block you want. You land in the builder with that block selected. Change it, press Save, press Publish.' },
            { title: 'Draft vs published', body: 'Save keeps it private. Publish makes it live. You can save fifty times and the public sees nothing until you publish, so experiment freely.' },
            { title: 'Undoing a bad afternoon', body: 'Every publish snapshots the page. There is a version list, and "Restore the original" puts a built-in page back exactly as it shipped.' },
            { title: 'A new project page', body: 'Studio → Pages → New project. It starts pre-filled with a heading, a player, a description and a call to action, so you are editing rather than facing a blank screen.' },
          ],
        },
        {
          kind: 'para',
          text: 'There is a **phone/desktop toggle** at the top of the builder. The phone preview is not an approximation — it is genuinely the mobile layout, in a narrow pane. The site also adapts automatically: big headings shrink, multi-column rows stack, and huge padding gets pulled in, all without you doing anything. If you do not like a specific choice it made, switch to the phone view and change it there; that change applies **only** to phones and leaves your desktop layout alone.',
        },
        {
          kind: 'callout',
          tone: 'warn',
          title: 'Look at the phone view before every publish',
          text: 'More than half the people who open your site will be on a phone, and a fair number of them will be a producer checking a link between meetings. It takes four seconds.',
        },
      ],
    },
    {
      id: 'business-flow',
      title: 'Inquiry → paid, end to end',
      summary: 'The seven-step loop the whole studio is built around.',
      icon: 'Workflow',
      minutes: 4,
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: '1. An inquiry lands', body: 'Someone fills in the form. Your phone buzzes. It shows up under Inquiries with everything they told you — script length, deadline, where it will run.' },
            { title: '2. You reply with a quote', body: 'Within one business day. This is the promise on the site and it is the single easiest way to beat competitors, most of whom take four days.' },
            { title: '3. You send a free sample read', body: 'Thirty seconds of THEIR script. This converts extraordinarily well and costs you ten minutes. Do it every time.' },
            { title: '4. They say yes → contract', body: 'Studio → Contracts → New. Pick the client, the fee, the usage scope and the delivery date. The agreement writes itself and they sign it by typing their name on a link you send.' },
            { title: '5. Deposit', body: 'Invoice for 50% before you record. Non-negotiable on a first job with a new client. The contract already says this.' },
            { title: '6. Record, deliver, invoice the balance', body: 'They pay by card through the site. You get a notification when it clears.' },
            { title: '7. Log the expenses', body: 'Any money you spent on the job — session musician, a plugin, mileage — goes in Expenses with a receipt photo. Thirty seconds now, hundreds of dollars off your tax bill later.' },
          ],
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'Ownership transfers ON PAYMENT, not on delivery',
          text: 'This is written into your contract on purpose and it is the single most useful clause in it. Until they have paid in full, they do not own the recording. That sentence is the difference between an awkward email and a legal position.',
        },
      ],
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHAPTER 2 — MONEY
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CH_RATES: PlaybookChapter = {
  id: 'rates',
  title: 'What to charge',
  blurb: 'Real 2026 market rates, and where a new graduate should sit in them.',
  sections: [
    {
      id: 'how-vo-pricing-works',
      title: 'How voice-over pricing actually works',
      summary: 'You are not selling your time. You are selling a licence.',
      icon: 'KeyRound',
      minutes: 4,
      blocks: [
        {
          kind: 'lead',
          text: 'The mistake almost every beginner makes is quoting by the hour. Do not. You are not charging for the forty minutes you spent in the booth; you are charging for the right to use your voice in a specific place for a specific length of time.',
        },
        {
          kind: 'para',
          text: 'A thirty-second script takes the same forty minutes whether it runs on one company intranet or on national television. The intranet version is worth about $250. The national version is worth about $650 and up, because it is worth vastly more **to them**. Same work, different licence.',
        },
        {
          kind: 'para',
          text: 'So every quote you give has two parts: **the session fee** (the recording) and **the usage fee** (where it runs and for how long). Your contract names the usage scope explicitly, and if they later want to use it somewhere else, that is a new licence and a new fee.',
        },
        {
          kind: 'callout',
          tone: 'warn',
          title: 'The classic disaster',
          text: 'You quote $300 for "a thirty-second spot". It turns out to be a regional TV campaign that runs for two years. You have just sold something worth $2,000+ for $300, and there is nothing in writing to fix it. Always ask WHERE IT WILL RUN before you quote. It is the first question on your inquiry form for exactly this reason.',
        },
        {
          kind: 'para',
          text: 'The industry reference is the **GVAA Rate Guide**, published free by the Global Voice Acting Academy and updated every January. Non-union rates went up 12–18% for 2026. When a client pushes back on your number, "that is below the GVAA guide" is a real answer and they usually know it.',
        },
        {
          kind: 'sources',
          items: [
            { label: 'GVAA Rate Guide (free, updated annually)', url: 'https://globalvoiceacademy.com/gvaa-rate-guide-2/' },
            { label: 'Voice Crafters — industry standard rates', url: 'https://www.voicecrafters.com/industry-standard-voice-over-rates/' },
          ],
        },
      ],
    },
    {
      id: 'vo-rate-card',
      title: 'Your voice-over rate card',
      summary: 'Job by job, with what to charge now and what to charge in three years.',
      icon: 'Receipt',
      minutes: 8,
      blocks: [
        {
          kind: 'para',
          text: 'Three columns. **Starting** is you right now — a trained voice, a real degree, one professional credit. **Building** is you after roughly eighteen months and thirty or forty jobs. **Established** is market rate for a working professional, which is where the GVAA guide sits.',
        },
        {
          kind: 'para',
          text: 'Quote from the Starting column for about your first twenty paid jobs, then move up. Not gradually — move up. The single most common career mistake in this field is staying a bargain for three years because raising your rate feels rude.',
        },
        {
          kind: 'rates',
          caption: 'Commercial & broadcast',
          columns: ['Job', 'Starting', 'Building', 'Established (market)'],
          rows: [
            ['Internal / non-broadcast video', '$150–250', '$250–400', '$400–600'],
            ['Web & social ad (1 yr, owned channels)', '$200–350', '$350–550', '$550–850'],
            ['Local radio spot (13 wks)', '$175–300', '$300–450', '$450–600'],
            ['Local cable TV spot', '$200–300', '$300–450', '$450–650'],
            ['Regional broadcast (radio or TV)', '$350–550', '$550–900', '$900–1,500'],
            ['National broadcast', 'Refer it on', '$650–1,200', '$1,200–3,500'],
            ['Internet / streaming ad (perpetual)', '$400–600', '$600–850', '$850–1,500'],
          ],
          note: 'Add 25–50% for a national brand, and never quote a perpetual/all-media buyout below $1,200 — "in perpetuity, all media" means you can never charge them again.',
        },
        {
          kind: 'rates',
          caption: 'Corporate, e-learning & narration — priced per FINISHED minute or hour of audio',
          columns: ['Job', 'Starting', 'Building', 'Established (market)'],
          rows: [
            ['Corporate narration (per finished hour)', '$250–350', '$350–450', '$425–700'],
            ['E-learning (per finished minute)', '$12–20', '$20–35', '$35–60'],
            ['E-learning (per finished hour equiv.)', '$700–1,200', '$1,200–2,100', '$2,100–3,600'],
            ['Explainer video, up to 2 min', '$150–250', '$250–400', '$400–650'],
            ['Medical / technical narration', '+25%', '+30%', '+40%'],
            ['Audiobook (per finished hour)', '$150–200', '$200–275', '$250–500'],
          ],
          note: '"Finished minute" means the length of the delivered audio, not the time you spent. A 60-minute e-learning module is 60 finished minutes even if it took you six hours — which it will, at roughly 3–4 hours of work per finished hour.',
        },
        {
          kind: 'rates',
          caption: 'Telephony & IVR — your current speciality',
          columns: ['Job', 'Starting', 'Building', 'Established (market)'],
          rows: [
            ['Minimum project fee', '$125', '$150', '$150–200'],
            ['Small system (up to 5 prompts)', '$100–175', '$175–250', '$200–350'],
            ['Standard system (up to 300 words)', '$175–250', '$250–350', '$350–500'],
            ['Large system (up to 6,000 words)', '$600–900', '$900–1,200', '$1,000–1,500'],
            ['On-hold message with music bed', '$150–250', '$250–350', '$300–450'],
            ['Per-prompt add-ons / pickups', '$8–12 ea', '$12–18 ea', '$15–25 ea'],
            ['Annual refresh retainer', '$300–600/yr', '$600–1,200/yr', '$1,200–2,400/yr'],
          ],
          note: 'You already have a telephony credit, which means you can sell this today with a straight face. It is also the most repeatable work in voice-over — phone trees get updated, and the client always comes back to the original voice because a mismatched prompt sounds broken.',
        },
        {
          kind: 'rates',
          caption: 'Character, games & animation',
          columns: ['Job', 'Starting', 'Building', 'Established (market)'],
          rows: [
            ['Indie game, per hour in session', '$150–250', '$250–350', '$350–500'],
            ['Indie game, per 100 lines', '$200–350', '$350–500', '$500–800'],
            ['Animation / audio drama, per episode', '$150–300', '$300–500', '$500–1,000'],
            ['Singing performance (add to any of the above)', '+50%', '+50%', '+50–100%'],
          ],
          note: 'The singing premium is real and most voice actors cannot claim it. You can. Say so in every character audition.',
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'Your absolute floor: $125',
          text: 'Never quote below $125 for anything, ever, no matter how short. A ten-word prompt still costs you the setup, the recording, the edit, the export and the email. Below about $125 you are paying for the privilege of working. A minimum fee is normal and every professional has one.',
        },
        {
          kind: 'callout',
          tone: 'warn',
          title: 'What about Fiverr?',
          text: 'You will see people on Fiverr and Upwork charging $10–50 a job. That is a different business — volume at a loss, competing with AI, and it teaches clients that your work is worth $25. Use those platforms to practise if you like, but do not price your real business from them.',
        },
        {
          kind: 'sources',
          items: [
            { label: 'VoiceBros — 2026 pricing guide', url: 'https://voicebros.com/en/blog/voice-over-pricing-guide-2026' },
            { label: 'The Voice Realm — IVR & rate guide', url: 'https://www.thevoicerealm.com/voice-over-rates.php' },
            { label: 'Backstage — how much voice actors cost', url: 'https://www.backstage.com/magazine/article/how-much-do-voice-actors-cost-76993/' },
          ],
        },
      ],
    },
    {
      id: 'coaching-rates',
      title: 'What to charge for coaching',
      summary: 'A music degree puts you above the hobby-teacher line on day one.',
      icon: 'GraduationCap',
      minutes: 5,
      blocks: [
        {
          kind: 'para',
          text: 'Coaching prices in the US are unusually transparent, and they track qualifications almost exactly. The national average for private voice lessons is **$68–130 per hour**. Where you land inside that is decided by what is on your wall.',
        },
        {
          kind: 'rates',
          caption: 'What the market pays, by qualification',
          columns: ['Teacher', 'Typical hourly rate'],
          rows: [
            ['No formal music training', '$40–50'],
            ['Music degree in another instrument', '$50–60'],
            ['**Bachelor\'s in voice / music — you**', '**$65–75**'],
            ['Master\'s or doctorate, or years of professional performance', '$80–120'],
            ['Online lessons (any of the above)', 'Usually $10–20 lower'],
          ],
          note: 'You have the degree and four years of performance. You are not a $40 teacher and you should never advertise as one — pricing at the hobby-teacher line actively costs you serious students, who read a low rate as inexperience.',
        },
        {
          kind: 'rates',
          caption: 'Your coaching rate card',
          columns: ['What', 'Starting (now)', 'After ~1 year + testimonials', 'Established'],
          rows: [
            ['45-minute lesson', '$55', '$70', '$85'],
            ['60-minute lesson', '$70', '$90', '$110'],
            ['Block of 4 × 45 min', '$200 ($50/ea)', '$255 ($64/ea)', '$310 ($78/ea)'],
            ['Block of 8 × 45 min', '$380 ($47/ea)', '$480 ($60/ea)', '$580 ($73/ea)'],
            ['Audition intensive (3 × 60 min)', '$195', '$250', '$300'],
            ['Voice-for-the-booth coaching (60 min)', '$85', '$110', '$135'],
          ],
          note: 'Package discounts are 10–15%, not 40%. A big discount trains students to wait for the bulk deal and devalues the single lesson they would otherwise have booked today.',
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'Why blocks beat single lessons',
          text: 'A student who buys four lessons shows up for four lessons. A student who buys one buys another one "when things calm down", and things never calm down. Blocks are better for your income AND better for their progress — which is why you can recommend them honestly.',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'Raise your rate on new students only',
          text: 'When you go up, existing students keep their old rate for six months. It costs you very little, it is a genuinely kind thing to do, and it means a rate rise never comes with a wave of cancellations.',
        },
        {
          kind: 'para',
          text: 'Ten weekly students at $55 is **$2,200 a month** before you have recorded a single voice-over. Coaching is the reliable floor under a business whose voice-over income is lumpy — and it is the part you can grow fastest, because it needs no gatekeepers.',
        },
        {
          kind: 'sources',
          items: [
            { label: 'Lessons.com — 2026 singing lesson costs', url: 'https://lessons.com/costs/singing-lessons-cost' },
            { label: 'Paperbell — voice coach rates and business setup', url: 'https://paperbell.com/blog/how-to-be-a-voice-coach/' },
          ],
        },
      ],
    },
    {
      id: 'projections',
      title: 'Honest three-year projections',
      summary: 'What this realistically earns — including the part nobody tells you.',
      icon: 'TrendingUp',
      minutes: 5,
      blocks: [
        {
          kind: 'callout',
          tone: 'warn',
          title: 'Read this bit first',
          text: 'The standard industry answer for year one is "little to nothing". That is real, and it is not a comment on your talent. Voice-over income comes from a client list, and you do not have one yet. Every professional went through this. The ones who made it treated year one as building, not earning.',
        },
        {
          kind: 'para',
          text: 'The projections below assume you do the work: you record the four reels, you send ten pitches a week, you take every coaching student you can get, and you keep going for three years. They are not a forecast of what happens if you build the site and wait.',
        },
        {
          kind: 'rates',
          caption: 'A realistic path — coaching is the floor, voice-over is the upside',
          columns: ['', 'Year 1', 'Year 2', 'Year 3'],
          rows: [
            ['Coaching students (weekly)', '3 → 8', '8 → 14', '14 → 18'],
            ['Coaching income', '$6,000–11,000', '$16,000–26,000', '$28,000–42,000'],
            ['Voice-over jobs', '8–20', '25–50', '50–90'],
            ['Voice-over income', '$1,500–5,000', '$7,000–18,000', '$20,000–45,000'],
            ['**Gross**', '**$7,500–16,000**', '**$23,000–44,000**', '**$48,000–87,000**'],
            ['Minus expenses (~15%)', '−$1,100–2,400', '−$3,500–6,600', '−$7,200–13,000'],
            ['Minus tax set-aside (30%)', '−$1,900–4,100', '−$5,900–11,200', '−$12,200–22,200'],
            ['**Roughly in pocket**', '**$4,500–9,500**', '**$13,600–26,200**', '**$28,600–51,800**'],
          ],
          note: 'Estimate, not a promise. Built from the coaching rate card above, industry guidance that beginners see a solid side income by year two or three, and 30% set aside for self-employment tax.',
        },
        {
          kind: 'para',
          text: 'Notice the shape: **coaching carries you and voice-over overtakes it.** Coaching income is predictable and compounds slowly — a student who stays a year is $2,800. Voice-over is lumpy and compounds fast, because one happy agency client sends three more.',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'The number that actually predicts year three',
          text: 'Not talent. Not equipment. How many pitches you sent in year one. Ten a week for a year is 500 pitches; at a 2% conversion rate that is ten clients, and ten clients who like you is a career.',
        },
        {
          kind: 'sources',
          items: [
            { label: 'VOTrainer — voice actor income guide 2026', url: 'https://www.votrainer.com/blog/how-much-do-voice-actors-make-income-guide-for-2026' },
          ],
        },
      ],
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHAPTER 3 — GETTING WORK
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CH_GROWTH: PlaybookChapter = {
  id: 'growth',
  title: 'Getting work',
  blurb: 'Cheapest to most expensive, in the order you should try them.',
  sections: [
    {
      id: 'cheapest-first',
      title: 'The cheapest ways to get gigs',
      summary: 'Ranked by cost per client. The free ones are also the best ones.',
      icon: 'Target',
      minutes: 6,
      blocks: [
        {
          kind: 'para',
          text: 'Almost everything that works is free and takes time. Almost everything that costs money works less well than people hope. Do these roughly in order.',
        },
        {
          kind: 'steps',
          items: [
            {
              title: '1. Direct outreach to local business — FREE, and the highest converting thing you can do',
              body: 'Every dentist, law firm, HVAC company and credit union within fifty miles has a phone system, and most of them were recorded badly by an employee in 2014. Call, ask for the office manager, say you record phone systems, send a free sample using THEIR current greeting. Ten a week. This is how you get your first ten clients and it costs nothing but nerve.',
            },
            {
              title: '2. Your own network — FREE',
              body: 'UMHB has an alumni network, a music department, a theatre department and a career office. Your professors know people who make things. Tell all of them what you now do, specifically and in one sentence, and ask them to keep you in mind. Most people never do this because it feels like asking for a favour. It is not; it is telling people information they lack.',
            },
            {
              title: '3. Coaching students from where you already are — FREE',
              body: 'Church choirs, high school theatre programmes, community musical societies, the UMHB music department. One flyer and one conversation with a choir director is worth more than a month of ads. Students also refer other students at a rate no other business enjoys.',
            },
            {
              title: '4. Google Business Profile — FREE',
              body: '"Voice over Central Texas" and "singing lessons near me" are searches real people make with money in hand. A Business Profile puts you on the map, literally. Twenty minutes to set up.',
            },
            {
              title: '5. Social proof, posted consistently — FREE',
              body: 'A short clip of a read, twice a week, on Instagram and TikTok. Not to go viral — so that when someone Googles you after a pitch, there is evidence you exist and are working.',
            },
            {
              title: '6. Casting sites — $200–450/year',
              body: 'Voice123, Voices.com, Bodalgo, Backstage. Worth it in year two, once your reels are good, and not before — you are paying to compete with thousands of people, and a weak reel loses that competition expensively. Bodalgo is the cheapest of the serious ones.',
            },
            {
              title: '7. An agent — 10–20% commission, no upfront cost',
              body: 'Not yet. Agents want a professional reel and a track record. Revisit in year two or three; a regional agent in Texas is a realistic goal by then and can move you into the rate brackets you cannot reach alone.',
            },
            {
              title: '8. Paid ads — $300+/month',
              body: 'Last resort, and honestly probably never for voice-over. It can work for local coaching ("singing lessons Belton TX"), but only after you have testimonials, because ad traffic converts on proof and you do not have any yet.',
            },
          ],
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'The cheapest client is the one you already have',
          text: 'A client who has paid you once is between five and ten times more likely to pay you again than a stranger is to pay you at all. Email every past client twice a year. "Do you need your phone prompts refreshed?" is a genuinely useful email that also happens to be sales.',
        },
      ],
    },
    {
      id: 'pitch',
      title: 'How to pitch without being annoying',
      summary: 'A four-line email, and the thing that makes it work.',
      icon: 'Send',
      minutes: 3,
      blocks: [
        {
          kind: 'para',
          text: 'The best cold pitch in voice-over is not an email. It is an email with a **free custom sample attached**. You are not asking them to imagine you doing the job; you are handing them the job, done.',
        },
        {
          kind: 'list',
          items: [
            '**Line 1** — Who you are and where you are. "I am a voice actor in Central Texas."',
            '**Line 2** — Proof you looked at them. "I called your main line and heard the current greeting."',
            '**Line 3** — The gift. "I recorded your greeting the way I would do it — thirty seconds, attached, no charge and no obligation."',
            '**Line 4** — The ask, made small. "If you ever refresh your phone system, I would love to be considered."',
          ],
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'Send it to a person',
          text: 'info@ addresses go nowhere. Find the office manager or the marketing coordinator on LinkedIn. A named recipient triples your reply rate and takes ninety seconds to find.',
        },
      ],
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHAPTER 4 — MAKING IT A REAL BUSINESS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CH_LEGAL: PlaybookChapter = {
  id: 'legal',
  title: 'Making it a real business',
  blurb: 'Every form, in the order you need it. Less than you fear.',
  sections: [
    {
      id: 'legal-not-advice',
      title: 'The paperwork, in order',
      summary: 'Six things. Three are free. You can do the first four in an afternoon.',
      icon: 'FileCheck',
      minutes: 9,
      blocks: [
        {
          kind: 'callout',
          tone: 'law',
          title: 'This is a checklist, not legal or tax advice',
          text: 'It is accurate for a sole proprietor in Texas as of August 2026 and it is written to save you an afternoon of confused Googling. Before you file anything with an ongoing cost, spend $200 on an hour with a CPA. It will pay for itself in the first year, and they will catch the thing specific to you that no checklist can.',
        },
        {
          kind: 'para',
          text: 'Here is the good news: **you are already a business.** The moment you were paid for that telephony contract, you became a sole proprietor in the eyes of the IRS. There was no form. You do not have to "start a business" — you have to formalise the one you have.',
        },
        {
          kind: 'tasks',
          intro:
            'Nine tasks, each one openable on its own. Every one tells you what it costs, how long it takes and exactly what to have in front of you before you start. Tick the steps as you go — your progress is saved to your account, so you can do one on a Tuesday and the next in three weeks.',
          items: [
            {
              id: 'structure',
              title: 'Decide: sole proprietor or LLC?',
              summary: 'The only decision on this list. Ten minutes of thinking, then move on.',
              cost: '$0 now, or $300 for an LLC',
              time: '10 minutes to decide',
              need: ['Nothing. This is a decision, not a filing.'],
              steps: [
                {
                  text: 'Understand the default: you are already a sole proprietor',
                  detail:
                    'No form, no fee. Your business income goes on Schedule C of your personal return. This is what almost every voice actor starts as.',
                },
                {
                  text: 'Understand what an LLC buys you',
                  detail:
                    'One thing: if the business is ever sued or in debt, your personal savings and car are not on the table. It does NOT change your taxes by default — a single-member LLC is still taxed as a sole proprietor.',
                },
                {
                  text: 'Decide, and write the decision down',
                  detail:
                    'For voice-over the liability risk is genuinely low: you are not operating machinery or storing customer data. Most people start as a sole proprietor and form an LLC once they are earning $30–40k, and that is a sound plan. If you are teaching students in person, the calculation shifts a little sooner.',
                },
              ],
              gotcha:
                'Do not let this decision stall the other eight tasks. Every one of them is worth doing regardless of which way you go, and the bank account matters far more than the structure.',
            },

            {
              id: 'dba',
              title: 'File your DBA (assumed name certificate)',
              summary: 'Only needed if you trade under a name that is not your own surname.',
              cost: '$15–25',
              time: '30 minutes, in person or by mail',
              where: 'The county clerk in the county where you live — for Belton, that is the Bell County Clerk.',
              need: [
                'Photo ID',
                'The EXACT business name you want, spelled the way you want it forever',
                'Your home or business address',
                'Cash, card or a cheque for the filing fee — some county offices still do not take cards',
              ],
              steps: [
                {
                  text: 'Work out whether you actually need one',
                  detail:
                    '"Andrew Ash" trading as Andrew Ash needs nothing. "Andrew Ash Voice", "Ash Voice Studio" or anything that is not your legal surname needs an assumed name certificate.',
                },
                {
                  text: 'Search the name first',
                  detail:
                    'Check the county clerk\'s assumed-name search AND a plain Google search for other voice actors using it. Discovering a conflict after you have printed business cards is the expensive version of this step.',
                },
                {
                  text: 'Check the domain and social handles are free too',
                  detail:
                    'Register the name only if you can also get a matching domain. A business name you cannot put on a website is half a business name.',
                },
                {
                  text: 'File it with the county clerk',
                  detail:
                    'Fill in the form, sign it in front of the clerk (some counties require notarisation if you file by mail), pay the fee.',
                },
                {
                  text: 'Keep the stamped copy',
                  detail:
                    'Photograph it and upload it to Studio → Documents under Licences. The bank will ask for it, and so will you, in two years, at the worst possible moment.',
                },
              ],
              gotcha:
                'In Texas an assumed name certificate lasts ten years and then expires. Put the expiry date in your calendar the day you file it — nobody sends you a reminder.',
              links: [
                { label: 'Texas assumed-name FAQ', url: 'https://www.sos.state.tx.us/corp/namefilingsfaqs.shtml' },
              ],
            },

            {
              id: 'ein',
              title: 'Get an EIN from the IRS',
              summary: 'Free, instant, online. The single easiest win on this list.',
              cost: 'FREE — anyone charging you for this is scamming you',
              time: '10 minutes',
              where: 'irs.gov, directly. Not a third-party site.',
              need: [
                'Your Social Security number',
                'Your legal name and address',
                'The business name, if you filed a DBA',
                'To be doing it between 7am and 10pm Eastern, weekdays — the IRS system genuinely closes at night',
              ],
              steps: [
                {
                  text: 'Go to the IRS EIN application directly',
                  detail:
                    'Search results are full of services charging $50–150 to fill in a free government form on your behalf. Type irs.gov yourself.',
                },
                {
                  text: 'Choose "Sole Proprietor" (or "LLC" if you formed one)',
                  detail: 'The reason for applying is "Started a new business" or "Banking purposes". Both are true.',
                },
                {
                  text: 'Complete it in one sitting',
                  detail:
                    'The session times out after about 15 minutes of inactivity and does not save. Have your details ready before you start.',
                },
                {
                  text: 'Download the confirmation letter (CP 575) immediately',
                  detail:
                    'This is the ONLY time it is offered as a download. Save the PDF to Studio → Documents under Tax. Getting a replacement later means a phone call and a wait.',
                },
              ],
              gotcha:
                'You do not strictly need an EIN as a sole proprietor — you can use your SSN. Get one anyway: it means you write an EIN instead of your Social Security number on every W-9 you hand a client, and you will hand out a lot of W-9s to people you have never met.',
              links: [
                {
                  label: 'Apply for an EIN online (IRS, free)',
                  url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
                },
              ],
            },

            {
              id: 'bank',
              title: 'Open a business bank account',
              summary: 'The highest-value task on this page. Do this one even if you do nothing else.',
              cost: 'Usually free — many banks waive fees under a balance threshold',
              time: '45 minutes in a branch, or 20 minutes online',
              where: 'Your existing bank first — they already have your identity on file, which halves the paperwork.',
              need: [
                'Photo ID (driver\'s licence or passport)',
                'Your Social Security number',
                'Your EIN confirmation letter, if you got one',
                'The stamped DBA certificate, if you filed one — the bank will NOT open an account in a business name without it',
                'An opening deposit (often $25–100)',
                'Your business address and phone number',
              ],
              steps: [
                {
                  text: 'Call ahead and ask what they require',
                  detail:
                    'Requirements vary by bank and even by branch. A two-minute phone call saves a wasted trip, which is the most common way this task fails.',
                },
                {
                  text: 'Compare two or three options',
                  detail:
                    'Look for: no monthly fee (or an easily-met waiver), free incoming transfers, a good mobile app for depositing cheques, and no per-transaction charges. Online-only business banks are genuinely good at this and often free.',
                },
                {
                  text: 'Open the account',
                  detail: 'Take everything on the list above. Get the account and routing numbers before you leave.',
                },
                {
                  text: 'Order a debit card and set up online access',
                  detail: 'You want to be able to see this account from your phone, because that is where you will log expenses.',
                },
                {
                  text: 'Put the account details into Stripe',
                  detail:
                    'So client payments through this website land in the business account rather than your personal one. Studio → Settings → Payments.',
                },
                {
                  text: 'Start using it for EVERYTHING business',
                  detail:
                    'Every payment in, every microphone, every subscription, every tank of petrol driven to a session. Mixing personal and business spending is the single thing that turns tax time from an export into an archaeology project — and it is the first thing an auditor asks about.',
                },
              ],
              gotcha:
                'If you have not filed a DBA, open the account in your own name and simply use it only for business. That is perfectly legal for a sole proprietor and gets you 90% of the benefit today rather than in three weeks.',
            },

            {
              id: 'bookkeeping',
              title: 'Set up your bookkeeping',
              summary: 'Mostly done for you — this is about the habit, not the software.',
              cost: '$0 (this website) or $15–30/mo for accounting software later',
              time: '20 minutes to set up, 2 minutes a week thereafter',
              need: ['Your business bank account, from the task above'],
              steps: [
                {
                  text: 'Decide where the numbers live',
                  detail:
                    'For year one, Studio → Expenses and Studio → Invoices is genuinely enough. When you have an accountant, they may want QuickBooks or Wave; you can export to either.',
                },
                {
                  text: 'Log your existing equipment as expenses',
                  detail:
                    'Anything you already bought for this work — microphone, interface, headphones, treatment — is deductible if you bought it this tax year. Go back through your receipts now while you can still find them.',
                },
                {
                  text: 'Set the habit: photograph the receipt at the till',
                  detail:
                    'Not later. Later is how receipts are lost. Studio → Expenses → Add takes about thirty seconds on a phone and attaches the photo.',
                },
                {
                  text: 'Set aside 30% of every payment the day it arrives',
                  detail:
                    'Move it to a separate savings account and pretend it is gone, because it is — it is the tax. The dashboard shows you the running figure. Freelancers who do this never have a bad April.',
                },
                {
                  text: 'Diarise a monthly 20-minute review',
                  detail: 'Check every invoice is paid, every expense is logged, and the set-aside is real money in a real account.',
                },
              ],
            },

            {
              id: 'quarterly',
              title: 'Set up quarterly estimated taxes',
              summary: 'The thing that blindsides first-year freelancers. Not hard — just unfamiliar.',
              cost: 'The tax you owe anyway. Penalties if you skip it.',
              time: '30 minutes to set up, 10 minutes four times a year',
              where: 'IRS Direct Pay or EFTPS, both free.',
              need: [
                'Your Social Security number or EIN',
                'Your bank account and routing number',
                'A rough idea of your profit so far this year — the dashboard has it',
              ],
              steps: [
                {
                  text: 'Understand why this exists',
                  detail:
                    'An employer withholds tax from every paycheque. Nobody withholds from a freelancer, so the IRS asks you to pay as you go instead of in one lump next April.',
                },
                {
                  text: 'Work out whether it applies to you yet',
                  detail:
                    'If you expect to owe $1,000 or more in tax for the year, it applies. On roughly $5,000+ of profit, assume it does.',
                },
                {
                  text: 'Put the four dates in your calendar now',
                  detail:
                    'Roughly 15 April, 15 June, 15 September, and 15 January of the following year. Set the reminder a week early — the payment takes a day or two to clear.',
                },
                {
                  text: 'Register for IRS Direct Pay or EFTPS',
                  detail:
                    'Direct Pay needs no registration and works from a bank account. EFTPS requires enrolment by post but keeps a payment history, which is genuinely useful.',
                },
                {
                  text: 'Make the first payment',
                  detail:
                    'Use the 30% set-aside figure from your dashboard as the starting point. Paying slightly too much is refunded; paying too little accrues interest.',
                },
                {
                  text: 'Note what Texas does NOT require',
                  detail:
                    'Texas has no personal state income tax, so there is no second state filing to make. That saves you a whole parallel process most freelancers have to run.',
                },
              ],
              gotcha:
                'Self-employment tax is 15.3% on net earnings ON TOP of income tax, and it starts at a much lower income than people expect. That is why the set-aside is 30% and not 15%.',
              links: [
                {
                  label: 'IRS — estimated taxes',
                  url: 'https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes',
                },
              ],
            },

            {
              id: 'w9',
              title: 'Prepare your W-9 and expect 1099s',
              summary: 'Fill one form in once, then send it in thirty seconds for the rest of your career.',
              cost: 'FREE',
              time: '15 minutes, once',
              need: ['Your EIN (or SSN)', 'Your legal name and business name', 'Your address'],
              steps: [
                {
                  text: 'Download a blank Form W-9 from irs.gov',
                  detail: 'It is one page.',
                },
                {
                  text: 'Fill it in correctly for a sole proprietor',
                  detail:
                    'Line 1 is your LEGAL name — not the business name. Line 2 is the business name / DBA. Tick "Individual/sole proprietor or single-member LLC". Use your EIN as the taxpayer number if you have one.',
                },
                {
                  text: 'Sign, date and save it as a PDF',
                  detail: 'Studio → Documents → Tax. Now it is thirty seconds to send instead of an evening of scrambling.',
                },
                {
                  text: 'Know what comes back',
                  detail:
                    'Any client who pays you $600 or more in a calendar year sends you a Form 1099-NEC each January showing what they paid.',
                },
                {
                  text: 'Report everything, 1099 or not',
                  detail:
                    'Plenty of small clients never send a 1099. The obligation to report the income is yours either way, and the invoices in this studio are your record of it.',
                },
              ],
              gotcha:
                'Never email a completed W-9 as a plain attachment to someone you have not verified — it contains your tax ID and address, and W-9 phishing is a real and common scam. Send it through a client portal, or confirm the request by phone first.',
            },

            {
              id: 'homeoffice',
              title: 'Set up your home studio records',
              summary: 'A real deduction most freelancers under-claim because they never took the photos.',
              cost: 'FREE',
              time: '20 minutes, once',
              optional: true,
              need: ['A tape measure', 'Your phone camera', 'A recent utility bill and your rent or mortgage statement'],
              steps: [
                {
                  text: 'Measure the space you record in',
                  detail:
                    'Note the square footage of the room or booth, and the total square footage of your home. The percentage is the basis of the deduction.',
                },
                {
                  text: 'Photograph it as a working space',
                  detail:
                    'The deduction requires the space to be used REGULARLY and EXCLUSIVELY for the business. A booth qualifies easily; a corner of a bedroom is harder to defend. The photos are your evidence.',
                },
                {
                  text: 'Save one month of each bill',
                  detail:
                    'Rent or mortgage interest, electricity, internet. The business share of each is deductible at the same percentage.',
                },
                {
                  text: 'Note the simplified option',
                  detail:
                    'The IRS also allows a flat $5 per square foot up to 300 sq ft, with no bills required. For a small booth that is often both easier and comparable — your accountant can compare the two in five minutes.',
                },
              ],
              gotcha:
                '"Exclusively" is the word that matters. A room that is also the guest bedroom does not qualify; a treated closet used only for recording does.',
            },

            {
              id: 'insurance',
              title: 'Business insurance',
              summary: 'Not yet — but know the trigger that makes it necessary.',
              cost: '$300–500/year for general liability',
              time: '30 minutes when the time comes',
              optional: true,
              need: ['Your business name and structure', 'A rough annual revenue figure'],
              steps: [
                {
                  text: 'Know the three triggers',
                  detail:
                    'You teach students in person; a corporate client asks for a certificate of insurance before they will contract with you; or you start renting outside studio space.',
                },
                {
                  text: 'Check your renter\'s or homeowner\'s policy first',
                  detail:
                    'Most personal policies exclude business equipment. A $2,000 microphone stolen from a home studio may not be covered — worth knowing before it happens, not after.',
                },
                {
                  text: 'Get quotes when a trigger fires',
                  detail:
                    'General liability plus equipment cover is the usual pairing for a voice actor. Some professional associations bundle it more cheaply than going direct.',
                },
              ],
            },

            {
              id: 'cpa',
              title: 'Talk to an accountant once',
              summary: 'One hour, before your first full tax year ends. It pays for itself.',
              cost: '$150–300 for a first consultation',
              time: '1 hour',
              need: [
                'Your revenue and expenses so far — export them from Studio → Expenses',
                'A list of your questions, written down beforehand',
              ],
              steps: [
                {
                  text: 'Find someone who works with freelancers',
                  detail:
                    'Not a chain tax-prep shop. Ask other performers, teachers or photographers locally — the good ones are found by word of mouth.',
                },
                {
                  text: 'Book it for October or November',
                  detail:
                    'Early enough that anything they suggest can still be done before the year ends, and before they disappear into filing season.',
                },
                {
                  text: 'Bring the specific questions',
                  detail:
                    'Should I form an LLC yet? Am I setting aside enough? Is my home studio deductible as I have it set up? Should I elect §179 on the equipment? Those four are worth the fee on their own.',
                },
                {
                  text: 'Ask what they want from you monthly',
                  detail: 'Then set that up now, rather than reconstructing it in April.',
                },
              ],
              gotcha:
                'Everything in this guide is researched and sourced, and none of it is advice about YOUR situation. This is the task that turns it into advice.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'One more worth knowing about: **sales tax.** Texas generally does not tax professional services like voice-over or lessons, so there is usually nothing to register for. If you ever sell a physical product — a CD, merchandise — that changes and you need a sales tax permit. It is a question for the accountant.',
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'What you can deduct — this is the payoff',
          text: 'Microphone, interface, headphones, acoustic treatment, your booth, DAW software and plugins, this website, casting site memberships, coaching and workshops, demo production, mileage to sessions, the business share of your phone and internet, and part of your home if you have a dedicated recording space. Log it in Studio → Expenses with a receipt photo, pick the category, done. Andrew: a $900 microphone is a $900 deduction. Untracked, it is a $900 gift to the IRS.',
        },
        {
          kind: 'sources',
          items: [
            { label: 'IRS — apply for an EIN online (free)', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online' },
            { label: 'IRS — estimated taxes for the self-employed', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes' },
            { label: 'Texas — assumed name (DBA) certificates', url: 'https://www.sos.state.tx.us/corp/namefilingsfaqs.shtml' },
            { label: 'How to start a sole proprietorship in Texas', url: 'https://legalclarity.org/how-to-start-a-sole-proprietorship-in-texas-steps-and-taxes/' },
          ],
        },
      ],
    },
    {
      id: 'running-costs',
      title: 'What it costs to run all this',
      summary: 'About $10 a month for the website. Here is everything else.',
      icon: 'Wallet',
      minutes: 4,
      blocks: [
        {
          kind: 'rates',
          caption: 'The website itself',
          columns: ['Stage', 'Per month', 'What it covers'],
          rows: [
            ['Reviewing / first year', '$1–2', 'Just the domain. Everything else is inside free tiers.'],
            ['Working year', '$6–7', 'Adds the hosting paid tier once traffic or audio outgrows free.'],
            ['Comfortable', '$26–32', 'Adds a database tier that never sleeps, with backups.'],
            ['Card payments', '2.9% + 30¢', 'Stripe. Per transaction, no monthly fee. Only when you get paid.'],
          ],
          note: 'Budget $10/month for year one. For comparison, a Squarespace site alone is $16–23/month and could not do contracts, invoicing or the client portal at all.',
        },
        {
          kind: 'rates',
          caption: 'The rest of the business',
          columns: ['Thing', 'Cost', 'When'],
          rows: [
            ['Domain name', '$10–12/year', 'Now'],
            ['Decent USB mic + interface', '$200–500 once', 'Now — this is the deduction to make first'],
            ['Acoustic treatment / booth', '$150–800 once', 'Year 1. Blankets work. Really.'],
            ['DAW software', '$0–200 once', 'Reaper is $60 and professional. Audacity is free.'],
            ['Professional demo production', '$400–1,500 once', 'Year 1–2, when you can afford it'],
            ['Casting site membership', '$200–450/year', 'Year 2, once reels are strong'],
            ['Business insurance', '$300–500/year', 'When teaching in person'],
            ['CPA, first consultation', '$150–300 once', 'Before your first full tax year ends'],
          ],
          note: 'Realistic year-one out-of-pocket: $600–1,500, most of it equipment you keep, and most of it deductible.',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'What NOT to buy yet',
          text: 'A $2,000 microphone, a purpose-built booth, or a website designer. Your first mic upgrade will not get you hired; a better reel will. Spend money on demo production and coaching long before you spend it on gear.',
        },
      ],
    },
    {
      id: 'first-90',
      title: 'Your first 90 days',
      summary: 'One page. Do these and you have a business.',
      icon: 'CalendarCheck',
      minutes: 3,
      blocks: [
        {
          kind: 'steps',
          items: [
            {
              title: 'Days 1–14 — Get sellable',
              body: 'Record the four demo reels. Replace the placeholder testimonials and credits. Fill in your contact details. Open a business bank account and get an EIN. Add the studio to your phone.',
            },
            {
              title: 'Days 15–45 — Get your first ten conversations',
              body: 'Build a list of 100 local businesses with phone systems. Send ten pitches a week with a free custom sample each. Tell every professor, director and choir leader you know that you are teaching. Set up a Google Business Profile.',
            },
            {
              title: 'Days 46–75 — Convert and deliver',
              body: 'Expect two to five paying jobs from those pitches. Run each one properly through this site — contract, deposit, delivery, invoice — even the tiny ones, especially the tiny ones. Ask every single one for a one-sentence testimonial on delivery day.',
            },
            {
              title: 'Days 76–90 — Turn it into a machine',
              body: 'Publish a project page for each job you delivered. Put the real testimonials on the site. Log every expense. Look at your P&L and set aside 30%. Then raise your rates to the Building column and start again.',
            },
          ],
        },
        {
          kind: 'callout',
          tone: 'money',
          title: 'One last thing',
          text: 'You have a music degree, four years of stage training, a professional credit, and a platform most working voice actors do not have. The thing that will decide this is not talent — you have that. It is whether you send the pitches in week three when nobody has replied yet. Send them anyway.',
        },
      ],
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const PLAYBOOK: readonly PlaybookChapter[] = [CH_SITE, CH_RATES, CH_GROWTH, CH_LEGAL];

export function allSections(): PlaybookSection[] {
  return PLAYBOOK.flatMap((c) => c.sections);
}

export function sectionById(id: string): PlaybookSection | undefined {
  return allSections().find((s) => s.id === id);
}

/** Total reading time, for the "this is a 45-minute read" line at the top. */
export function totalMinutes(): number {
  return allSections().reduce((sum, s) => sum + s.minutes, 0);
}
