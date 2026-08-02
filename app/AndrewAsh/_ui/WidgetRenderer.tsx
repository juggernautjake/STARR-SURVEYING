// app/AndrewAsh/_ui/WidgetRenderer.tsx — one function that turns stored blocks into a page.
//
// EVERY page on this site renders through here: the home page, the voice-over page, the coaching
// page, and any project page Andrew builds. That is deliberate and it is the answer to the owner's
// requirement that Andrew "review everything that is already built and have full editing control over
// it". A page that is hardcoded JSX is a page he can look at and not change; the only way to hand him
// the whole site is for the whole site to be data.
//
// The pages he starts with are therefore not special. `lib/voice/default-pages.ts` describes them as
// block arrays, exactly the shape the builder produces, and the first time he edits one it is copied
// into the database and becomes his. There is no "system page" he is locked out of.
//
// ── THE PREVIEW MUST NOT LIE ────────────────────────────────────────────────────────────────────
//
// This component is used unchanged by the public page and by the studio's live preview. Not a similar
// component — this one. The moment a builder has two renderers, they diverge, and the version Andrew
// designs against stops predicting the version his clients see.
//
// ── OWNER MODE ─────────────────────────────────────────────────────────────────────────────────
//
// When Andrew is signed in, each widget grows a small edit button that deep-links into the builder
// with that block already selected. Signed out, `ownerMode` is false and not one byte of it renders —
// no hidden buttons in the DOM, no CSS to hide them, nothing a visitor could reveal.

import Link from 'next/link';
import { ArrowRight, Check, Pencil, Quote as QuoteIcon } from 'lucide-react';

import Photo from './Photo';
import AudioPlayer from './AudioPlayer';
import FaqList from './FaqList';
import InquiryForm from './InquiryForm';
import { photoById } from '@/lib/voice/photos';
import {
  resolveMobileStyle,
  publicWidgets,
  type Widget,
  type WidgetStyle,
  type WidgetType,
} from '@/lib/voice/widgets';
import {
  aspectStyle,
  mediaSizeStyle,
  parseEmbedUrl,
  resolveColor,
  resolveWidgetStyle,
  widgetMobileCss,
  PAGE_CONTAINER,
} from '@/lib/voice/style';
import { formatCentsCompact } from '@/lib/voice/money';
import type { CoachingPackage, VoiceCredit, VoiceDemo, VoicePage, VoiceTestimonial } from '@/lib/voice/settings';
import { BASE_PATH } from '@/lib/voice/content';

/** Everything a BOUND widget might need. Fetched once by the page, passed down — so a page with three
 *  bound widgets makes three queries total, not three per widget. */
export interface PageContext {
  demos: VoiceDemo[];
  projects: VoicePage[];
  testimonials: VoiceTestimonial[];
  packages: CoachingPackage[];
  credits: VoiceCredit[];
  artistName: string;
  location: string;
}

export const EMPTY_CONTEXT: PageContext = {
  demos: [],
  projects: [],
  testimonials: [],
  packages: [],
  credits: [],
  artistName: 'Andrew Ash',
  location: 'Central Texas',
};

interface RendererProps {
  widgets: Widget[];
  context: PageContext;
  /** True when Andrew is signed in: renders per-widget edit affordances. */
  ownerMode?: boolean;
  /** Where an edit button should link. Usually the builder for the page being rendered. */
  editHref?: string;
  /** Set by the studio preview so widgets hidden on one breakpoint still show, dimmed. */
  previewAll?: boolean;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (Number.isFinite(v as number) ? (v as number) : fallback);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default function WidgetRenderer({
  widgets,
  context,
  ownerMode = false,
  editHref,
  previewAll = false,
}: RendererProps): React.ReactElement {
  const list = previewAll ? widgets : publicWidgets(widgets);

  // All per-widget responsive rules are collected into ONE <style> element rather than one per
  // widget. A fifty-block page would otherwise emit fifty style tags, each triggering its own style
  // recalculation on insert.
  const css = list
    .map((w) => {
      const isTextual = ['text', 'heading', 'quote', 'faq', 'specList'].includes(w.type);
      const desktop = resolveWidgetStyle(w.style, { isTextual });
      const mobile = resolveWidgetStyle(resolveMobileStyle(w), { isTextual });
      return widgetMobileCss(w.id, desktop, mobile, {
        hiddenOnMobile: w.hiddenOnMobile && !previewAll,
        hiddenOnDesktop: w.hiddenOnDesktop && !previewAll,
      });
    })
    .filter(Boolean)
    .join('\n');

  return (
    // `container-type: inline-size` is what makes the mobile rules fire on the CANVAS width rather
    // than the viewport width — so the studio's phone preview is the real phone layout and not an
    // approximation of it. See the note in lib/voice/style.ts.
    <div
      className="vaPageCanvas"
      style={{ containerType: 'inline-size', containerName: PAGE_CONTAINER } as React.CSSProperties}
    >
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {list.map((widget) => (
        <WidgetBlock
          key={widget.id}
          widget={widget}
          context={context}
          ownerMode={ownerMode}
          editHref={editHref}
        />
      ))}
    </div>
  );
}

function WidgetBlock({
  widget,
  context,
  ownerMode,
  editHref,
}: {
  widget: Widget;
  context: PageContext;
  ownerMode: boolean;
  editHref?: string;
}): React.ReactElement {
  const isTextual = ['text', 'heading', 'quote', 'faq', 'specList'].includes(widget.type);
  const { outer, inner, classNames } = resolveWidgetStyle(widget.style, { isTextual });

  // Full-width widgets escape the page gutter; everything else keeps it, so a page of mixed widths
  // still has a consistent left edge.
  const gutter = widget.style?.width === 'full' ? {} : { paddingLeft: 'var(--va-gutter)', paddingRight: 'var(--va-gutter)' };

  return (
    <section
      data-vw={widget.id}
      data-widget-type={widget.type}
      className={`vaWidget ${classNames.join(' ')}`}
      style={{ ...outer, ...gutter }}
      data-reveal={widget.style?.animation !== 'none' ? '' : undefined}
    >
      <div className="vaWidgetInner" style={inner}>
        <WidgetBody widget={widget} context={context} />
      </div>

      {ownerMode && (
        <Link
          href={`${editHref ?? `${BASE_PATH}/studio/pages`}#${widget.id}`}
          className="vaWidgetEdit vaNoPrint"
          aria-label={`Edit this ${widget.type} block`}
          title={`Edit this ${widget.type} block`}
        >
          <Pencil size={13} aria-hidden />
          <span>Edit</span>
        </Link>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// BODIES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

function WidgetBody({ widget, context }: { widget: Widget; context: PageContext }): React.ReactElement | null {
  const p = widget.props ?? {};
  const s = widget.style ?? {};

  switch (widget.type as WidgetType) {
    // ── Words ──────────────────────────────────────────────────────────────────────────────────
    case 'heading': {
      const level = Math.min(6, Math.max(1, num(p.level, 2)));
      const Tag = `h${level}` as 'h1';
      return (
        <>
          {str(p.eyebrow) && <span className="vaEyebrow">{str(p.eyebrow)}</span>}
          <Tag className="vaWidgetHeading">{str(p.text, 'Heading')}</Tag>
        </>
      );
    }

    case 'text':
      // The HTML comes from Andrew's own rich-text editor and is sanitised on the way IN, at the API
      // boundary (lib/voice/sanitize.ts), not here. Sanitising on render would mean the stored value
      // and the displayed value could differ, so a stored payload that survives one release could
      // start rendering after a refactor. Clean it once, at the door.
      return <div className="vaProse" dangerouslySetInnerHTML={{ __html: str(p.html, '') }} />;

    case 'quote':
      return (
        <blockquote className="vaWidgetQuote">
          <QuoteIcon size={26} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 16 }} />
          <p style={{ margin: 0 }}>{str(p.text)}</p>
          {str(p.attribution) && (
            <cite>
              {str(p.attribution)}
              {str(p.role) ? ` — ${str(p.role)}` : ''}
            </cite>
          )}
        </blockquote>
      );

    case 'stats': {
      const items = arr<{ value: string; label: string }>(p.items);
      return (
        <div className="vaGrid vaGrid4">
          {items.map((item, i) => (
            <div key={i} className="vaStat">
              <span className="vaStatValue">{item.value}</span>
              <span className="vaStatLabel">{item.label}</span>
            </div>
          ))}
        </div>
      );
    }

    case 'specList': {
      const rows = arr<{ label: string; value: string }>(p.rows);
      return (
        <>
          {str(p.title) && <h3 className="vaCardTitle" style={{ marginBottom: 16 }}>{str(p.title)}</h3>}
          <ul className="vaSpecList">
            {rows.map((row, i) => (
              <li key={i}>
                <span className="vaSpecKey">{row.label}</span>
                <span className="vaSpecValue">{row.value}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }

    case 'faq':
      return (
        <FaqList
          items={arr<{ q: string; a: string }>(p.items)}
          collapsible={p.collapsible !== false}
          openFirst={p.openFirst !== false}
        />
      );

    case 'credits': {
      const rows = arr<{ production: string; role: string; company: string; year: string }>(p.rows);
      return (
        <>
          {str(p.title) && <h3 className="vaCardTitle" style={{ marginBottom: 18 }}>{str(p.title)}</h3>}
          <div className="vaTableWrap">
            <table className="vaTable">
              <thead>
                <tr>
                  <th>Production</th>
                  <th>Role</th>
                  <th>Company</th>
                  <th className="vaNum">Year</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--va-text)' }}>{row.production}</td>
                    <td className="vaMuted">{row.role}</td>
                    <td className="vaMuted">{row.company}</td>
                    <td className="vaNum vaMuted">{row.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    // ── Media ──────────────────────────────────────────────────────────────────────────────────
    case 'image': {
      const sizeStyle = mediaSizeStyle(s.mediaScale, s.align);
      const aspect = aspectStyle(s.aspect);
      const photoId = str(p.photoId);
      const url = str(p.url);
      if (!photoId && !url) {
        return <div className="vaEmbedFallback">No image chosen yet.</div>;
      }
      return (
        <figure className="vaFigure" style={sizeStyle}>
          {photoId ? (
            <Photo
              id={photoId}
              alt={str(p.alt)}
              style={{ width: '100%', borderRadius: 'inherit', ...aspect }}
              sizes="(max-width: 700px) 100vw, 900px"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={str(p.alt)} loading="lazy" style={{ width: '100%', borderRadius: 'inherit', ...aspect }} />
          )}
          {str(p.caption) && <figcaption className="vaFigcaption">{str(p.caption)}</figcaption>}
        </figure>
      );
    }

    case 'gallery': {
      const items = arr<{ photoId?: string; url?: string; alt?: string; caption?: string }>(p.items);
      const columns = Math.min(4, Math.max(1, num(p.columns, 3)));
      if (!items.length) return <div className="vaEmbedFallback">No photos in this gallery yet.</div>;
      return (
        <div
          className="vaGallery"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.round(1000 / columns)}px), 1fr))` }}
        >
          {items.map((item, i) => (
            <figure key={i} className="vaGalleryItem" style={aspectStyle(s.aspect)}>
              {item.photoId ? (
                <Photo id={item.photoId} size="card" alt={item.alt ?? ''} style={{ height: '100%' }} sizes="400px" />
              ) : item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.alt ?? ''} loading="lazy" />
              ) : null}
              {item.caption && <figcaption className="vaGalleryCaption">{item.caption}</figcaption>}
            </figure>
          ))}
        </div>
      );
    }

    case 'audio':
      return (
        <AudioPlayer
          title={str(p.title, 'Untitled')}
          subtitle={str(p.subtitle) || null}
          src={str(p.url) || null}
          downloadable={p.downloadable === true}
        />
      );

    case 'audioList': {
      const tracks = arr<{ title: string; subtitle?: string; url?: string }>(p.tracks);
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          {str(p.title) && <h3 className="vaCardTitle">{str(p.title)}</h3>}
          {tracks.length ? (
            tracks.map((t, i) => (
              <AudioPlayer key={i} title={t.title} subtitle={t.subtitle ?? null} src={t.url ?? null} />
            ))
          ) : (
            <div className="vaEmbedFallback">No tracks added yet.</div>
          )}
        </div>
      );
    }

    case 'video': {
      const url = str(p.url);
      if (!url) return <div className="vaEmbedFallback">No video chosen yet.</div>;
      return (
        <figure className="vaFigure" style={mediaSizeStyle(s.mediaScale, s.align)}>
          <video
            controls
            playsInline
            poster={str(p.poster) || undefined}
            // autoplay REQUIRES muted, in every browser — an autoplaying unmuted video is simply
            // blocked, so the pair is enforced here rather than left to whoever ticks the box.
            autoPlay={p.autoplay === true}
            muted={p.autoplay === true || p.muted === true}
            loop={p.loop === true}
            style={{ width: '100%', borderRadius: 'inherit', ...aspectStyle(s.aspect) }}
          >
            <source src={url} />
            Your browser cannot play this video.
          </video>
          {str(p.caption) && <figcaption className="vaFigcaption">{str(p.caption)}</figcaption>}
        </figure>
      );
    }

    case 'embed': {
      const info = parseEmbedUrl(str(p.url));
      if (!info.src) {
        return (
          <div className="vaEmbedFallback">
            {str(p.url) ? (
              <>
                That link cannot be embedded.{' '}
                <a href={str(p.url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--va-accent)' }}>
                  Open it in a new tab
                </a>
                . YouTube, Vimeo, SoundCloud, Spotify and Bandcamp links embed directly.
              </>
            ) : (
              'Paste a YouTube, Vimeo, SoundCloud, Spotify or Bandcamp link.'
            )}
          </div>
        );
      }
      return (
        <iframe
          className={`vaEmbed${info.isAudio ? ' vaEmbedAudio' : ''}`}
          src={info.src}
          title={str(p.title, 'Embedded media')}
          style={info.isAudio ? undefined : aspectStyle(s.aspect === 'auto' ? '16:9' : s.aspect)}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }

    // ── Actions ────────────────────────────────────────────────────────────────────────────────
    case 'button':
      return (
        <div className="vaBtnRow" style={{ justifyContent: justifyFor(s.align) }}>
          <ButtonLink label={str(p.label, 'Button')} href={str(p.href, '#')} variant={str(p.variant, 'solid')} newTab={p.newTab === true} />
        </div>
      );

    case 'buttonRow': {
      const buttons = arr<{ label: string; href: string; variant?: string; newTab?: boolean }>(p.buttons);
      return (
        <div className="vaBtnRow" style={{ justifyContent: justifyFor(s.align) }}>
          {buttons.map((b, i) => (
            <ButtonLink key={i} label={b.label} href={b.href} variant={b.variant ?? 'solid'} newTab={b.newTab === true} />
          ))}
        </div>
      );
    }

    case 'cta':
      return (
        <div className="vaCta" style={{ background: resolveColor(s.background) ?? undefined }}>
          <div className="vaOrnament" style={{ maxWidth: 190, margin: '0 auto 24px' }}>
            <span className="vaOrnamentMark" />
          </div>
          <h2 className="vaCtaTitle">{str(p.heading, 'Get in touch')}</h2>
          {str(p.body) && <p className="vaCtaBody">{str(p.body)}</p>}
          <div className="vaBtnRow" style={{ justifyContent: 'center' }}>
            <ButtonLink label={str(p.buttonLabel, 'Contact')} href={str(p.buttonHref, `${BASE_PATH}/contact`)} variant="solid" size="lg" />
            {str(p.secondaryLabel) && (
              <ButtonLink label={str(p.secondaryLabel)} href={str(p.secondaryHref, '#')} variant="outline" size="lg" />
            )}
          </div>
        </div>
      );

    case 'contactForm':
      return <InquiryForm defaultIntent={str(p.intent, 'voiceover')} heading={str(p.heading)} compact={p.compact === true} />;

    // ── Layout ─────────────────────────────────────────────────────────────────────────────────
    case 'divider':
      return str(p.variant) === 'ornament' ? (
        <div className="vaOrnament">
          <span className="vaOrnamentMark" />
        </div>
      ) : (
        <hr className="vaRule" />
      );

    case 'spacer':
      return <div style={{ height: `${num(p.height, 6) * 12}px` }} aria-hidden />;

    case 'cards': {
      const items = arr<{ title: string; body: string; href?: string; icon?: string }>(p.items);
      const columns = Math.min(4, Math.max(1, num(p.columns, 3)));
      return (
        <div className={`vaGrid ${columns >= 4 ? 'vaGrid4' : columns === 2 ? 'vaGrid2' : 'vaGrid3'}`}>
          {items.map((item, i) => {
            const body = (
              <>
                <h3 className="vaCardTitle">{item.title}</h3>
                <p className="vaCardBody">{item.body}</p>
                {item.href && (
                  <span className="vaProjectFoot" style={{ marginTop: 14 }}>
                    Learn more <ArrowRight size={14} aria-hidden />
                  </span>
                )}
              </>
            );
            return item.href ? (
              <Link key={i} href={item.href} className="vaCard">{body}</Link>
            ) : (
              <div key={i} className="vaCard">{body}</div>
            );
          })}
        </div>
      );
    }

    case 'featureCards': {
      const items = arr<{ title: string; body: string; photoId?: string; href?: string; bullets?: string[] }>(p.items);
      const columns = Math.min(4, Math.max(1, num(p.columns, 3)));
      return (
        <div className={`vaGrid ${columns === 2 ? 'vaGrid2' : columns >= 4 ? 'vaGrid4' : 'vaGrid3'}`}>
          {items.map((item, i) => {
            const inner = (
              <>
                {item.photoId && (
                  <div className="vaProjectMedia">
                    <Photo id={item.photoId} size="card" alt="" sizes="(max-width: 700px) 100vw, 380px" />
                  </div>
                )}
                <div className="vaProjectBody">
                  <h3 className="vaCardTitle">{item.title}</h3>
                  <p className="vaCardBody">{item.body}</p>
                  {item.bullets && item.bullets.length > 0 && (
                    <ul className="vaCheckList" style={{ marginTop: 6 }}>
                      {item.bullets.map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  )}
                  {item.href && (
                    <span className="vaProjectFoot">
                      Learn more <ArrowRight size={14} aria-hidden />
                    </span>
                  )}
                </div>
              </>
            );
            return item.href ? (
              <Link key={i} href={item.href} className="vaProject">{inner}</Link>
            ) : (
              <div key={i} className="vaProject">{inner}</div>
            );
          })}
        </div>
      );
    }

    case 'mediaText': {
      // ── WHY THIS WIDGET EXISTS ──────────────────────────────────────────────────────────────
      //
      // Reported by the owner with a screenshot of the home page's About section: a narrow column of
      // text, then a full-bleed photograph nearly three times its width, then a lone button floating
      // under the image. Each block was individually fine and the composition was wrong.
      //
      // The cause was structural. Converting the site to blocks turned a two-column layout into a
      // vertical stack, because a stack was the only thing the widget set could express. Fixing it by
      // hand-tuning that page's widths would have left the next two-column section to rediscover the
      // same problem — and left Andrew with no way to build one himself.
      //
      // So the fix is the missing primitive. Text and media share a row, the media side and split are
      // controls, and the call-to-action belongs to the block instead of drifting below it.
      const mediaSide = str(p.mediaSide, 'right') === 'left' ? 'left' : 'right';
      const mediaPct = Math.max(25, Math.min(65, num(p.mediaWidth, 48)));
      const photoId = str(p.photoId);
      const url = str(p.url);
      const hasMedia = Boolean(photoId || url);

      const media = hasMedia ? (
        <figure className="vaFigure vaMediaTextMedia">
          {photoId ? (
            <Photo
              id={photoId}
              alt={str(p.alt)}
              sizes="(max-width: 700px) 100vw, 560px"
              style={{ width: '100%', borderRadius: 4, border: '1px solid var(--va-line)' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={str(p.alt)}
              loading="lazy"
              style={{ width: '100%', borderRadius: 4, border: '1px solid var(--va-line)' }}
            />
          )}
          {str(p.caption) && <figcaption className="vaFigcaption">{str(p.caption)}</figcaption>}
        </figure>
      ) : null;

      const words = (
        <div className="vaMediaTextWords">
          {str(p.eyebrow) && <span className="vaEyebrow">{str(p.eyebrow)}</span>}
          {str(p.heading) && (
            <h2 className="vaDisplay vaH2" style={{ marginBottom: 18 }}>
              {str(p.heading)}
            </h2>
          )}
          <div className="vaProse vaMuted" dangerouslySetInnerHTML={{ __html: str(p.html, '') }} />
          {str(p.buttonLabel) && (
            // Inside the block, so it sits under the paragraph it belongs to instead of orphaned
            // beneath a full-width image — which is exactly what the screenshot showed.
            <div className="vaBtnRow" style={{ marginTop: 26 }}>
              <ButtonLink
                label={str(p.buttonLabel)}
                href={str(p.buttonHref, '#')}
                variant={str(p.buttonVariant, 'outline')}
              />
            </div>
          )}
        </div>
      );

      return (
        <div
          className="vaMediaText"
          style={
            {
              // The grid template names the columns in DOM order, so flipping the side is one value
              // rather than reordering the markup — which would put the image before the heading for
              // a screen reader on a left-media layout.
              '--va-media-pct': `${mediaPct}%`,
              gridTemplateColumns:
                mediaSide === 'left' ? `${mediaPct}% 1fr` : `1fr ${mediaPct}%`,
            } as React.CSSProperties
          }
          data-media-side={mediaSide}
        >
          {mediaSide === 'left' ? (
            <>
              {media}
              {words}
            </>
          ) : (
            <>
              {words}
              {media}
            </>
          )}
        </div>
      );
    }

    case 'steps': {
      const items = arr<{ step: string; title: string; body: string }>(p.items);
      return (
        <div className={`vaGrid ${items.length >= 4 ? 'vaGrid4' : 'vaGrid3'}`}>
          {items.map((item, i) => (
            <div key={i} className="vaCard">
              <span className="vaStepNumber">{item.step}</span>
              <h3 className="vaCardTitle" style={{ fontSize: '1.05rem' }}>{item.title}</h3>
              <p className="vaCardBody">{item.body}</p>
            </div>
          ))}
        </div>
      );
    }

    case 'hero':
      return <HeroBody props={p} style={s} />;

    // ── Bound ──────────────────────────────────────────────────────────────────────────────────
    case 'demoReels': {
      const category = str(p.category, 'all');
      let demos = category === 'all' ? context.demos : context.demos.filter((d) => d.category === category);
      if (p.showPlaceholders === false) demos = demos.filter((d) => !d.isPlaceholder);
      demos = demos.slice(0, num(p.limit, 4));
      if (!demos.length) return <div className="vaEmbedFallback">No demo reels yet.</div>;
      return (
        <div className={`vaGrid ${num(p.columns, 2) === 1 ? '' : 'vaGrid2'}`}>
          {demos.map((d) => (
            <AudioPlayer
              key={d.id}
              title={d.title}
              subtitle={d.description}
              src={d.audioUrl}
              durationHint={d.durationSeconds}
              traits={d.traits}
              downloadable={p.downloadable === true}
            />
          ))}
        </div>
      );
    }

    case 'projectGrid': {
      const filter = str(p.filter, 'all');
      let projects = context.projects;
      if (filter === 'featured') projects = projects.filter((x) => x.featured);
      else if (filter === 'in_progress') projects = projects.filter((x) => x.workState === 'in_progress');
      else if (filter === 'completed') projects = projects.filter((x) => x.workState === 'completed');
      projects = projects.slice(0, num(p.limit, 6));

      if (!projects.length) {
        if (p.showEmptyState === false) return null;
        return (
          <div className="vaEmpty">
            <h3 className="vaCardTitle">Project pages are on their way.</h3>
            <p className="vaCardBody" style={{ maxWidth: '48ch', margin: '0 auto 20px' }}>
              In the meantime the demo reels are the fastest way to hear the range.
            </p>
            <Link href={`${BASE_PATH}/voice-over#reels`} className="vaBtn vaBtnOutline vaBtnSm">Hear the reels</Link>
          </div>
        );
      }

      const columns = Math.min(4, Math.max(1, num(p.columns, 3)));
      return (
        <div className={`vaGrid ${columns === 2 ? 'vaGrid2' : columns >= 4 ? 'vaGrid4' : 'vaGrid3'}`}>
          {projects.map((project) => (
            <Link key={project.id} href={`${BASE_PATH}/work/${project.slug}`} className="vaProject">
              <div className="vaProjectMedia">
                {project.coverPhotoId ? (
                  <Photo id={project.coverPhotoId} size="card" alt="" sizes="(max-width: 700px) 100vw, 380px" />
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
      );
    }

    case 'testimonials': {
      const wanted = str(p.context, 'all');
      const items = context.testimonials
        .filter((t) => wanted === 'all' || t.context === wanted || t.context === 'both')
        .slice(0, num(p.limit, 4));
      // Renders NOTHING when there are no real testimonials. A quote block with example text is the
      // single most damaging placeholder a portfolio can ship — see lib/voice/content.ts.
      if (!items.length) return null;
      return (
        <div className={`vaGrid ${num(p.columns, 2) === 1 ? '' : 'vaGrid2'}`}>
          {items.map((t) => (
            <blockquote key={t.id} className="vaCard" style={{ margin: 0 }}>
              <QuoteIcon size={22} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
              <p style={{ fontFamily: 'var(--va-font-display)', fontSize: '1.125rem', lineHeight: 1.5, margin: '0 0 18px' }}>
                “{t.quote}”
              </p>
              <cite className="vaCite">
                {t.author}
                {t.role ? ` — ${t.role}` : ''}
                {t.company ? `, ${t.company}` : ''}
              </cite>
            </blockquote>
          ))}
        </div>
      );
    }

    case 'packages': {
      const items = context.packages;
      if (!items.length) return null;
      return (
        <div className="vaGrid vaGrid3">
          {items.map((pkg) => (
            <div key={pkg.id} className={`vaCard${pkg.highlighted ? ' vaCardHighlight' : ''}`}>
              {pkg.highlighted && <span className="vaTag vaTagAccent" style={{ marginBottom: 14 }}>Most popular</span>}
              <h3 className="vaCardTitle">{pkg.name}</h3>
              <p className="vaPackagePrice">{formatCentsCompact(pkg.priceCents)}</p>
              <p className="vaCardBody" style={{ marginBottom: 18 }}>
                {pkg.sessionCount} × {pkg.sessionMinutes} minutes
                {pkg.blurb ? ` · ${pkg.blurb}` : ''}
              </p>
              {p.showInclusions !== false && pkg.inclusions.length > 0 && (
                <ul className="vaCheckList">
                  {pkg.inclusions.map((inc, i) => (
                    <li key={i}>{inc}</li>
                  ))}
                </ul>
              )}
              <Link
                href={`${BASE_PATH}/contact?intent=coaching&package=${encodeURIComponent(pkg.name)}`}
                className="vaBtn vaBtnOutline vaBtnSm"
                style={{ marginTop: 20 }}
              >
                Book this
              </Link>
            </div>
          ))}
        </div>
      );
    }

    case 'creditsList': {
      const wanted = str(p.creditType, 'all');
      const items = context.credits
        .filter((c) => wanted === 'all' || c.type === wanted)
        .slice(0, num(p.limit, 40));
      if (!items.length) return null;
      return (
        <div className="vaTableWrap">
          <table className="vaTable">
            <thead>
              <tr>
                <th>Production</th>
                <th>Role</th>
                <th>Company</th>
                <th className="vaNum">Year</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--va-text)' }}>{c.production}</td>
                  <td className="vaMuted">{c.role ?? '—'}</td>
                  <td className="vaMuted">{c.company ?? '—'}</td>
                  <td className="vaNum vaMuted">{c.year ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────────

function justifyFor(align: string | undefined): string {
  return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}

function ButtonLink({
  label,
  href,
  variant,
  newTab,
  size,
}: {
  label: string;
  href: string;
  variant: string;
  newTab?: boolean;
  size?: 'sm' | 'lg';
}): React.ReactElement {
  const cls = `vaBtn ${variant === 'outline' ? 'vaBtnOutline' : variant === 'ghost' ? 'vaBtnGhost' : 'vaBtnSolid'}${
    size === 'lg' ? ' vaBtnLg' : size === 'sm' ? ' vaBtnSm' : ''
  }`;

  // An in-app path gets <Link> (client-side navigation); an external URL or a #anchor gets a plain
  // <a>. Routing an anchor through <Link> makes it push a history entry for a same-page jump.
  const isInternal = href.startsWith('/') && !newTab;
  if (isInternal) {
    return <Link href={href} className={cls}>{label}</Link>;
  }
  return (
    <a href={href} className={cls} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
    </a>
  );
}

function HeroBody({ props: p, style: s }: { props: Record<string, unknown>; style: WidgetStyle }): React.ReactElement {
  const photoId = str(p.photoId);
  const meta = photoId ? photoById(photoId) : undefined;
  const buttons = arr<{ label: string; href: string; variant?: string }>(p.buttons);
  const overlay = Math.max(0, Math.min(100, num(s.backgroundOverlay, 55))) / 100;

  return (
    <div className={`vaHero${str(p.height) === 'short' ? ' vaHeroShort' : ''}`}>
      {meta && (
        <div className="vaHeroMedia">
          <Photo id={photoId} priority alt="" sizes="100vw" />
        </div>
      )}
      <div
        className="vaHeroScrim"
        // The scrim strength is a widget style, so Andrew can lighten it on a dark photograph and
        // deepen it on a bright one — which is the difference between readable hero text and a
        // guessing game every time he swaps the image.
        style={{
          background: `linear-gradient(to top, var(--va-ink) 2%, color-mix(in srgb, var(--va-ink) ${Math.round(
            overlay * 100,
          )}%, transparent) 45%, color-mix(in srgb, var(--va-ink) ${Math.round(
            overlay * 45,
          )}%, transparent) 100%), linear-gradient(105deg, color-mix(in srgb, var(--va-ink) ${Math.round(
            overlay * 105,
          )}%, transparent) 0%, transparent 62%)`,
        }}
      />
      <div className="vaContainer vaHeroBody">
        <div className="vaHeroLayout">
          <div style={{ minWidth: 0 }}>
            {str(p.eyebrow) && <p className="vaHeroRole">{str(p.eyebrow)}</p>}
            <h1 className="vaHeroTitle">{str(p.title, 'Title')}</h1>
            {str(p.line) && <p className="vaHeroLine">{str(p.line)}</p>}
            {buttons.length > 0 && (
              <div className="vaBtnRow">
                {buttons.map((b, i) => (
                  <ButtonLink key={i} label={b.label} href={b.href} variant={b.variant ?? 'solid'} size="lg" />
                ))}
              </div>
            )}
          </div>

          {p.showPortrait !== false && str(p.portraitPhotoId) && (
            <div className="vaHeroPortrait">
              <Photo id={str(p.portraitPhotoId)} size="card" sizes="300px" alt="" />
              {str(p.portraitCaption) && <div className="vaHeroPortraitCaption">{str(p.portraitCaption)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
