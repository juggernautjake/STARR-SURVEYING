// app/AndrewAsh/voice-over/page.tsx — the page a client lands on when they need a voice.
//
// Structured around what actually gets someone to send a script, in the order they need it:
// hear it → know he does this kind of work → know he can deliver it technically → know roughly what
// it costs → ask. The rate guidance in particular is deliberate: the most common reason a small
// business does not enquire is that they have no idea whether this is a $200 or a $2,000 decision and
// are embarrassed to ask.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, Clock, Headphones, Radio } from 'lucide-react';

import Photo from '../_ui/Photo';
import AudioPlayer from '../_ui/AudioPlayer';
import { BASE_PATH, STUDIO_SPEC, VOICE_CATEGORIES } from '@/lib/voice/content';
import { getSiteSettings, listDemos, listTestimonials } from '@/lib/voice/settings';
import { USAGE_SCOPES } from '@/lib/voice/contracts';
import { DEFAULT_QUOTE_RATES, estimateQuote } from '@/lib/voice/inquiry';
import { formatCentsCompact } from '@/lib/voice/money';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Voice over',
  description:
    'Commercial, telephony, e-learning and character voice over. Broadcast-ready audio, one revision included, usually delivered within 24 hours.',
};

/** Three worked examples, priced from the same function the contact form uses.
 *
 *  Computed rather than hardcoded so the page and the form's live estimate can never disagree — a
 *  published rate that the quote tool contradicts is worse than publishing no rate at all. */
const EXAMPLES = [
  { label: 'A 30-second radio spot', words: 75, usage: 'regional', note: 'Regional broadcast, 3-month term' },
  { label: 'A phone system', words: 400, usage: 'telephony', note: 'Greeting, menu tree and on-hold' },
  { label: 'A 10-minute training module', words: 1400, usage: 'internal', note: 'Internal use, edited and levelled' },
];

export default async function VoiceOverPage(): Promise<React.ReactElement> {
  const [settings, demos, testimonials] = await Promise.all([
    getSiteSettings(),
    listDemos(),
    listTestimonials('voice'),
  ]);

  return (
    <>
      {/* ── HEADER ───────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection" style={{ paddingBottom: 0 }}>
        <div className="vaContainer">
          <span className="vaEyebrow">Voice over</span>
          <h1 className="vaDisplay vaH1" style={{ maxWidth: '16ch' }}>
            A voice that takes direction.
          </h1>
          <p className="vaLead vaMuted" style={{ marginTop: 24 }}>
            Four years of formal vocal training, a stage background, and a first professional contract
            recording several hundred telephony prompts — which is the fastest way there is to learn
            consistency. Broadcast-ready audio, one revision included, usually back inside a day.
          </p>
          <div className="vaBtnRow" style={{ marginTop: 34 }}>
            <a href="#reels" className="vaBtn vaBtnSolid">Hear the reels</a>
            <Link href={`${BASE_PATH}/contact`} className="vaBtn vaBtnOutline">Request a quote</Link>
          </div>
        </div>
      </section>

      {/* ── REELS ────────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection" id="reels">
        <div className="vaContainer">
          <div className="vaOrnament vaOrnamentLeft" style={{ marginBottom: 40 }}>
            <span className="vaOrnamentMark" />
          </div>

          <div className="vaGrid vaGrid2">
            {demos.map((demo) => (
              <AudioPlayer
                key={demo.id}
                title={demo.title}
                subtitle={demo.description}
                src={demo.audioUrl}
                durationHint={demo.durationSeconds}
                traits={demo.traits}
                downloadable
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ───────────────────────────────────────────────────────────────────── */}
      <section className="vaSection vaSectionAlt">
        <div className="vaContainer">
          <div className="vaSectionHead">
            <span className="vaEyebrow">What I record</span>
            <h2 className="vaDisplay vaH2">Four kinds of work.</h2>
          </div>

          <div className="vaGrid vaGrid2">
            {VOICE_CATEGORIES.map((cat) => (
              <div key={cat.id} className="vaCard" data-reveal>
                <h3 className="vaCardTitle">{cat.label}</h3>
                <p className="vaCardBody" style={{ marginBottom: 18 }}>{cat.blurb}</p>
                <div className="vaTagRow">
                  {cat.traits.map((t) => (
                    <span key={t} className="vaTag">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STUDIO SPEC ──────────────────────────────────────────────────────────────────── */}
      <section className="vaSection">
        <div className="vaContainer vaSplit">
          <div data-reveal>
            <span className="vaEyebrow">The technical part</span>
            <h2 className="vaDisplay vaH2" style={{ marginBottom: 18 }}>
              Delivered the way your editor wants it.
            </h2>
            <p className="vaCardBody" style={{ marginBottom: 28, fontSize: '1rem' }}>
              If you have a spec sheet, send it and it will be matched. If you do not, this is what
              arrives by default — and it drops straight into a timeline without anyone having to
              clean it up first.
            </p>
            <ul className="vaSpecList">
              {STUDIO_SPEC.map((spec) => (
                <li key={spec.label}>
                  <span className="vaSpecKey">{spec.label}</span>
                  <span className="vaSpecValue">{spec.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal>
            <div className="vaGrid vaGrid2" style={{ gap: 16 }}>
              {[
                { icon: Clock, title: '24-hour turnaround', body: 'Standard scripts, most of the time. Rush is available and priced up front.' },
                { icon: Headphones, title: 'Live direction', body: 'Join the session over Zoom, Teams or Source-Connect Now and direct in real time.' },
                { icon: Radio, title: 'Clean by default', body: 'De-breathed, de-clicked and levelled — not a raw take with your name on it.' },
                { icon: Check, title: 'One revision included', body: 'Performance notes are covered. Script rewrites are quoted as new work.' },
              ].map((item) => (
                <div key={item.title} className="vaCard">
                  <div className="vaCardIcon">
                    <item.icon size={19} aria-hidden />
                  </div>
                  <h3 className="vaCardTitle" style={{ fontSize: '1.05rem' }}>{item.title}</h3>
                  <p className="vaCardBody">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection vaSectionAlt" id="rates">
        <div className="vaContainer">
          <div className="vaSectionHead">
            <span className="vaEyebrow">Rates</span>
            <h2 className="vaDisplay vaH2">Roughly what things cost.</h2>
            <p className="vaLead vaMuted" style={{ marginTop: 16 }}>
              Voice-over is priced on two things: how much there is to read, and where it will be used.
              A script that runs nationally is worth more than the same script on one company&rsquo;s
              website, and the difference is the licence, not the recording.
            </p>
          </div>

          <div className="vaGrid vaGrid3" style={{ marginBottom: 44 }}>
            {EXAMPLES.map((example) => {
              const quote = estimateQuote(
                { scriptWords: example.words, usage: example.usage },
                DEFAULT_QUOTE_RATES,
              );
              return (
                <div key={example.label} className="vaCard" data-reveal>
                  <span className="vaStatLabel" style={{ display: 'block', marginBottom: 14 }}>
                    {example.label}
                  </span>
                  <p
                    className="vaDisplay"
                    style={{ fontSize: '1.9rem', color: 'var(--va-accent)', marginBottom: 10, lineHeight: 1.1 }}
                  >
                    {quote ? `${formatCentsCompact(quote.lowCents)}–${formatCentsCompact(quote.highCents)}` : '—'}
                  </p>
                  <p className="vaCardBody">
                    {example.words.toLocaleString()} words · {example.note}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="vaCard" data-reveal>
            <h3 className="vaCardTitle">What a usage licence actually means</h3>
            <p className="vaCardBody" style={{ marginBottom: 20 }}>
              Every quote names one of these. It is written into the agreement, so there is never a
              question later about what was bought.
            </p>
            <ul className="vaSpecList">
              {USAGE_SCOPES.map((scope) => (
                <li key={scope.id}>
                  <span className="vaSpecKey">{scope.label}</span>
                  <span className="vaSpecValue">{scope.detail}</span>
                </li>
              ))}
            </ul>
            <p className="vaHint" style={{ marginTop: 22 }}>
              These are guide ranges for planning, not a quote. Send the actual script and you will get
              a firm number — and a free sample read of your own copy, so you can hear it first.
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="vaSection">
          <div className="vaContainer">
            <div className="vaGrid vaGrid2">
              {testimonials.map((t) => (
                <blockquote key={t.id} className="vaCard" style={{ margin: 0 }} data-reveal>
                  <p style={{ fontFamily: 'var(--va-font-display)', fontSize: '1.125rem', lineHeight: 1.5, marginBottom: 16 }}>
                    “{t.quote}”
                  </p>
                  <cite style={{ fontStyle: 'normal', fontSize: '0.8125rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--va-accent)' }}>
                    {t.author}{t.role ? ` — ${t.role}` : ''}
                  </cite>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ──────────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection">
        <div className="vaContainer">
          <div className="vaCta" data-reveal>
            <h2 className="vaCtaTitle">Send the script.</h2>
            <p className="vaCtaBody">
              A firm quote within one business day, and a free sample read of your own copy. If it is
              not right, you have lost nothing.
            </p>
            <div className="vaBtnRow" style={{ justifyContent: 'center' }}>
              <Link href={`${BASE_PATH}/contact?intent=voiceover`} className="vaBtn vaBtnSolid vaBtnLg">
                Request a quote <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* A single photograph at the foot, to end on a person rather than on a form. */}
      <section className="vaSectionTight" aria-hidden="true">
        <div className="vaContainer">
          <Photo
            id="recital-white-tie"
            alt=""
            size="card"
            sizes="(max-width: 900px) 100vw, 300px"
            style={{ width: 260, borderRadius: 4, border: '1px solid var(--va-line)', margin: '0 auto', opacity: 0.75 }}
          />
        </div>
      </section>
    </>
  );
}
