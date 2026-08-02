// app/AndrewAsh/page.tsx — the home page.
//
// ── THE ORDER OF THIS PAGE IS THE RESEARCH ──────────────────────────────────────────────────────
//
// Every guide to voice-over portfolios says the same thing, and the casting side says it more
// bluntly: the decision to keep listening is made in the first five to ten seconds, and the demo has
// to be reachable without a scroll or a click into a submenu. So the reels sit directly beneath the
// hero — before the services, before the biography, before anything Andrew would like to say. A
// visitor who plays a reel and leaves has had the visit the site was built for.
//
// Everything after that is in descending order of what a hiring decision needs: what he does, proof
// he has done it, how working with him goes, who he is, and then the ask.

import Link from 'next/link';
import { ArrowRight, Mic, Drama, GraduationCap, Quote as QuoteIcon } from 'lucide-react';

import Photo from './_ui/Photo';
import AudioPlayer from './_ui/AudioPlayer';
import { BASE_PATH, PROCESS_STEPS, SERVICES } from '@/lib/voice/content';
import { getSiteSettings, listDemos, listLivePages, listTestimonials } from '@/lib/voice/settings';

// Revalidate rather than render per request. The public pages read settings, demos and projects —
// data that changes when Andrew presses publish, not on a timer — so a short cache absorbs a burst of
// traffic from a shared link without ever being more than a minute stale.
export const revalidate = 60;

const SERVICE_ICONS: Record<string, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  Mic,
  Drama,
  GraduationCap,
};

export default async function VoiceHomePage(): Promise<React.ReactElement> {
  const [settings, demos, projects, testimonials] = await Promise.all([
    getSiteSettings(),
    listDemos(),
    listLivePages('project'),
    listTestimonials('all'),
  ]);

  const featured = projects.filter((p) => p.featured).slice(0, 3);
  const shown = featured.length ? featured : projects.slice(0, 3);
  const reels = demos.slice(0, 4);

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────────────────────── */}
      <section className="vaHero">
        <div className="vaHeroMedia">
          <Photo
            id={settings.heroPhotoId}
            priority
            alt=""
            objectPosition="center 30%"
            sizes="100vw"
          />
        </div>
        <div className="vaHeroScrim" />

        <div className="vaContainer vaHeroBody">
          <div className="vaHeroLayout">
            <div style={{ minWidth: 0 }}>
              <p className="vaHeroRole">{settings.tagline}</p>
              <h1 className="vaHeroTitle">{settings.artistName}</h1>
              <p className="vaHeroLine">
                A trained voice for commercials, phone systems, characters and narration — and coaching
                for singers who want theirs to do more.
              </p>
              <div className="vaBtnRow">
                <a href="#reels" className="vaBtn vaBtnSolid vaBtnLg">
                  Hear the reels
                </a>
                <Link href={`${BASE_PATH}/contact`} className="vaBtn vaBtnOutline vaBtnLg">
                  Request a quote
                </Link>
              </div>
            </div>

            <div className="vaHeroPortrait">
              <Photo id={settings.portraitPhotoId} size="card" sizes="300px" alt={`${settings.artistName}, portrait`} />
              <div className="vaHeroPortraitCaption">{settings.location}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── REELS — the reason the page exists ───────────────────────────────────────────── */}
      <section className="vaSection vaSectionAlt" id="reels">
        <div className="vaContainer">
          <div className="vaSectionHead" data-reveal>
            <span className="vaEyebrow">Demo reels</span>
            <h2 className="vaDisplay vaH2">Press play.</h2>
            <p className="vaLead vaMuted" style={{ marginTop: 14 }}>
              Four categories, each about ninety seconds. Every one opens on the strongest read, with no
              processing on the voice — what you hear is what arrives in your inbox.
            </p>
          </div>

          <div className="vaGrid vaGrid2" data-reveal>
            {reels.map((demo) => (
              <AudioPlayer
                key={demo.id}
                title={demo.title}
                subtitle={demo.description}
                src={demo.audioUrl}
                durationHint={demo.durationSeconds}
                traits={demo.traits}
              />
            ))}
          </div>

          <p className="vaHint" style={{ marginTop: 20 }}>
            Want to hear your own script instead? <Link href={`${BASE_PATH}/contact`} style={{ color: 'var(--va-accent)' }}>Ask for a free sample read</Link> — a
            short section of your copy, recorded and sent back, at no charge and with no obligation.
          </p>
        </div>
      </section>

      {/* ── SERVICES ─────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection">
        <div className="vaContainer">
          <div className="vaSectionHead" data-reveal>
            <span className="vaEyebrow">What I do</span>
            <h2 className="vaDisplay vaH2">Three ways to work together.</h2>
          </div>

          <div className="vaGrid vaGrid3">
            {SERVICES.map((service) => {
              const Icon = SERVICE_ICONS[service.icon] ?? Mic;
              return (
                <Link key={service.id} href={service.href} className="vaProject" data-reveal>
                  {service.photoId && (
                    <div className="vaProjectMedia">
                      <Photo id={service.photoId} size="card" alt="" sizes="(max-width: 900px) 100vw, 380px" />
                    </div>
                  )}
                  <div className="vaProjectBody">
                    <div className="vaCardIcon" style={{ marginBottom: 4 }}>
                      <Icon size={19} aria-hidden />
                    </div>
                    <h3 className="vaCardTitle">{service.title}</h3>
                    <p className="vaCardBody">{service.blurb}</p>
                    <ul className="vaCheckList" style={{ marginTop: 6 }}>
                      {service.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <span className="vaProjectFoot">
                      Learn more <ArrowRight size={14} aria-hidden />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SELECTED WORK ────────────────────────────────────────────────────────────────── */}
      <section className="vaSection vaSectionAlt">
        <div className="vaContainer">
          <div
            className="vaSectionHead"
            data-reveal
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, maxWidth: 'none', flexWrap: 'wrap' }}
          >
            <div>
              <span className="vaEyebrow">Selected work</span>
              <h2 className="vaDisplay vaH2">Recent projects.</h2>
            </div>
            <Link href={`${BASE_PATH}/work`} className="vaBtn vaBtnOutline vaBtnSm">
              See everything
            </Link>
          </div>

          {shown.length > 0 ? (
            <div className="vaGrid vaGrid3">
              {shown.map((project) => (
                <Link key={project.id} href={`${BASE_PATH}/work/${project.slug}`} className="vaProject" data-reveal>
                  <div className="vaProjectMedia">
                    {project.coverPhotoId ? (
                      <Photo id={project.coverPhotoId} size="card" alt="" sizes="(max-width: 900px) 100vw, 380px" />
                    ) : project.coverMediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.coverMediaUrl} alt="" loading="lazy" />
                    ) : null}
                    {project.workState === 'in_progress' && (
                      <span className="vaTag vaTagAccent vaProjectBadge">In progress</span>
                    )}
                  </div>
                  <div className="vaProjectBody">
                    <div className="vaProjectMetaRow">
                      {project.roleLabel && <span>{project.roleLabel}</span>}
                      {project.year && <span>· {project.year}</span>}
                    </div>
                    <h3 className="vaCardTitle">{project.title}</h3>
                    {project.summary && <p className="vaCardBody">{project.summary}</p>}
                    <span className="vaProjectFoot">
                      View project <ArrowRight size={14} aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            // Not a blank grid. An empty portfolio section on a brand-new site should read as
            // "nothing published yet" to Andrew and as a route to the reels for a visitor.
            <div className="vaEmpty" data-reveal>
              <span className="vaEmptyIcon">
                <Mic size={30} aria-hidden />
              </span>
              <h3 className="vaCardTitle">Project pages are on their way.</h3>
              <p className="vaCardBody" style={{ maxWidth: '48ch', margin: '0 auto 22px' }}>
                In the meantime the demo reels above are the fastest way to hear the range, and the
                credits list has the full history.
              </p>
              <div className="vaBtnRow" style={{ justifyContent: 'center' }}>
                <a href="#reels" className="vaBtn vaBtnSolid vaBtnSm">Hear the reels</a>
                <Link href={`${BASE_PATH}/about#credits`} className="vaBtn vaBtnOutline vaBtnSm">See credits</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── PROCESS ──────────────────────────────────────────────────────────────────────── */}
      <section className="vaSection">
        <div className="vaContainer">
          <div className="vaSectionHead" data-reveal>
            <span className="vaEyebrow">How it works</span>
            <h2 className="vaDisplay vaH2">From script to delivery, usually inside a day.</h2>
          </div>

          <div className="vaGrid vaGrid4">
            {PROCESS_STEPS.map((step) => (
              <div key={step.step} className="vaCard" data-reveal>
                <span
                  className="vaDisplay"
                  style={{ fontSize: '2rem', color: 'var(--va-accent)', display: 'block', marginBottom: 12, opacity: 0.85 }}
                >
                  {step.step}
                </span>
                <h3 className="vaCardTitle" style={{ fontSize: '1.05rem' }}>{step.title}</h3>
                <p className="vaCardBody">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT TEASER ─────────────────────────────────────────────────────────────────── */}
      <section className="vaSection vaSectionAlt">
        <div className="vaContainer vaSplit">
          <div data-reveal>
            <span className="vaEyebrow">About</span>
            <h2 className="vaDisplay vaH2" style={{ marginBottom: 20 }}>
              Four years of training, and a stage before that.
            </h2>
            <div className="vaProse vaMuted">
              <p>{settings.shortBio}</p>
              <p>
                His first professional contract was telephony — greetings, menus and on-hold copy. It is
                not the glamorous end of the business and it is the end that teaches you the most:
                hundreds of short reads that have to be warm without being saccharine and identical in
                tone across hours. There is nowhere to hide in eleven words.
              </p>
            </div>
            <div className="vaBtnRow" style={{ marginTop: 28 }}>
              <Link href={`${BASE_PATH}/about`} className="vaBtn vaBtnOutline">
                Read the full story
              </Link>
            </div>
          </div>

          <div data-reveal>
            <figure className="vaFigure">
              <Photo
                id="graduation-presser-hall"
                alt="Andrew Ash in cap and gown outside Presser Hall, the music building at the University of Mary Hardin-Baylor"
                sizes="(max-width: 900px) 100vw, 520px"
                style={{ borderRadius: 4, border: '1px solid var(--va-line)' }}
              />
              <figcaption className="vaFigcaption">
                Outside Presser Hall — the music building at the University of Mary Hardin-Baylor.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS — rendered only when real ones exist ────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="vaSection">
          <div className="vaContainer">
            <div className="vaSectionHead" data-reveal>
              <span className="vaEyebrow">In their words</span>
              <h2 className="vaDisplay vaH2">What clients and students say.</h2>
            </div>
            <div className="vaGrid vaGrid2">
              {testimonials.slice(0, 4).map((t) => (
                <blockquote key={t.id} className="vaCard" data-reveal style={{ margin: 0 }}>
                  <QuoteIcon size={22} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
                  <p style={{ fontFamily: 'var(--va-font-display)', fontSize: '1.125rem', lineHeight: 1.5, margin: '0 0 18px' }}>
                    “{t.quote}”
                  </p>
                  <cite style={{ fontStyle: 'normal', fontSize: '0.8125rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--va-accent)' }}>
                    {t.author}
                    {t.role ? ` — ${t.role}` : ''}
                    {t.company ? `, ${t.company}` : ''}
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
            <div className="vaOrnament" style={{ maxWidth: 200, margin: '0 auto 26px' }}>
              <span className="vaOrnamentMark" />
            </div>
            <h2 className="vaCtaTitle">Need a voice for your project?</h2>
            <p className="vaCtaBody">
              Send the script, or just the idea. You will get a firm quote within one business day and a
              free sample read of your own copy — so you can hear it before you commit to anything.
            </p>
            <div className="vaBtnRow" style={{ justifyContent: 'center' }}>
              <Link href={`${BASE_PATH}/contact`} className="vaBtn vaBtnSolid vaBtnLg">
                Request a quote
              </Link>
              <Link href={`${BASE_PATH}/coaching`} className="vaBtn vaBtnOutline vaBtnLg">
                Looking for lessons?
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
