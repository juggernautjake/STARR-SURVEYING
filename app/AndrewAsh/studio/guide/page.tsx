// app/AndrewAsh/studio/guide/page.tsx — "Start here": how the site works and how the business works.
//
// Renders `lib/voice/playbook.ts` as collapsible sections, per the owner's request that it be
// "in sections that can be opened and closed so that he can view the information in sections".
//
// ── <details> RATHER THAN REACT STATE ───────────────────────────────────────────────────────────
//
// This page is ~45 minutes of reading containing the rate card Andrew will quote from. Three
// properties matter more than the animation would:
//
//   · Ctrl+F reaches text inside a COLLAPSED section and opens it. Andrew searching "IVR" mid-phone
//     call needs to land on the number, not on nothing. A div with `display: none` is invisible to
//     find-in-page — which would make the single most-used feature of this page silently fail.
//   · Print works. Collapsed <details> can be forced open in the print stylesheet, so "print the
//     paperwork checklist" produces a complete document.
//   · It works before hydration, and with no JavaScript at all.
//
// The whole page is a server component. There is no state to hold.

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  Clock,
  Compass,
  FileCheck,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  Receipt,
  Rocket,
  Scale,
  Send,
  Target,
  TrendingUp,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { PLAYBOOK, totalMinutes, type PlaybookBlock } from '@/lib/voice/playbook';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Start here' };

const SECTION_ICONS: Record<string, LucideIcon> = {
  Compass,
  Rocket,
  LayoutGrid,
  Workflow,
  KeyRound,
  Receipt,
  GraduationCap,
  TrendingUp,
  Target,
  Send,
  FileCheck,
  Wallet,
  CalendarCheck,
};

const CALLOUT_ICONS = {
  tip: Lightbulb,
  warn: AlertTriangle,
  money: BadgeCheck,
  law: Scale,
} as const;

/** Minimal inline markdown: **bold** only.
 *
 *  Deliberately not a markdown library. The playbook is written by us, not by a user, so the only
 *  markup it needs is emphasis — and pulling in a parser to render asterisks would put an HTML
 *  sanitiser on the critical path of a page that has no untrusted input. */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

function Block({ block }: { block: PlaybookBlock }): React.ReactElement | null {
  // The union includes an array member for historical reasons; guard rather than crash on it.
  if (Array.isArray(block)) return null;

  switch (block.kind) {
    case 'lead':
      return <p className="vaGuideLead">{renderInline(block.text)}</p>;

    case 'para':
      return <p>{renderInline(block.text)}</p>;

    case 'list':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );

    case 'checklist':
      return (
        <ul className="vaGuideCheck">
          {block.items.map((item, i) => (
            <li key={i}>
              <span className="vaGuideCheckTitle">{renderInline(item.text)}</span>
              {item.detail && <span className="vaGuideCheckDetail">{renderInline(item.detail)}</span>}
            </li>
          ))}
        </ul>
      );

    case 'callout': {
      const Icon = CALLOUT_ICONS[block.tone] ?? Lightbulb;
      const toneClass =
        block.tone === 'warn'
          ? ' vaGuideCalloutWarn'
          : block.tone === 'money'
            ? ' vaGuideCalloutMoney'
            : block.tone === 'law'
              ? ' vaGuideCalloutLaw'
              : '';
      return (
        <div className={`vaGuideCallout${toneClass}`}>
          <p className="vaGuideCalloutTitle">
            <Icon size={14} aria-hidden />
            {block.title}
          </p>
          <p>{renderInline(block.text)}</p>
        </div>
      );
    }

    case 'steps':
      return (
        <div className="vaGuideSteps">
          {block.items.map((item, i) => (
            <div key={i} className="vaGuideStep">
              <p className="vaGuideStepTitle">{renderInline(item.title)}</p>
              <p>{renderInline(item.body)}</p>
            </div>
          ))}
        </div>
      );

    case 'rates':
      return (
        <div className="vaGuideRates">
          {block.caption && <p className="vaGuideRatesCaption">{block.caption}</p>}
          <div className="vaTableWrap">
            <table className="vaTable">
              <thead>
                <tr>
                  {block.columns.map((c, i) => (
                    <th key={i} className={i > 0 ? 'vaNum' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={j > 0 ? 'vaNum' : undefined}
                        style={j === 0 ? { color: 'var(--va-text)' } : undefined}
                      >
                        {renderInline(String(cell))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note && <p className="vaGuideRatesNote">{renderInline(block.note)}</p>}
        </div>
      );

    case 'sources':
      return (
        <div className="vaGuideSources">
          <p>Where these numbers come from</p>
          {block.items.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label} ↗
            </a>
          ))}
        </div>
      );

    default:
      return null;
  }
}

export default function GuidePage(): React.ReactElement {
  const minutes = totalMinutes();

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Start here</h1>
          <p className="vaStudioSub">
            How this site works, what to charge, what the first three years realistically look like, and
            every piece of paperwork you need to run this as a real business. About {minutes} minutes end
            to end — but it is built to be dipped into, so open what you need and leave the rest shut.
          </p>
        </div>
        <Link href={`${BASE_PATH}/studio`} className="vaBtn vaBtnOutline vaBtnSm">
          Back to the studio
        </Link>
      </div>

      <div className="vaGuideCallout" style={{ marginBottom: 28, maxWidth: 'none' }}>
        <p className="vaGuideCalloutTitle">
          <BookOpen size={14} aria-hidden />
          If you read one thing
        </p>
        <p>
          Open <strong>Your first ten minutes</strong> and <strong>Your voice-over rate card</strong>. The
          first stops you showing anyone a site with placeholder testimonials on it. The second stops you
          underquoting your first ten jobs, which is the mistake that takes years to undo.
        </p>
      </div>

      {PLAYBOOK.map((chapter) => (
        <section key={chapter.id} className="vaGuideChapter" id={chapter.id}>
          <div className="vaGuideChapterHead">
            <h2 className="vaGuideChapterTitle">{chapter.title}</h2>
            <p className="vaGuideChapterBlurb">{chapter.blurb}</p>
          </div>

          {chapter.sections.map((section) => {
            const Icon = SECTION_ICONS[section.icon] ?? BookOpen;
            return (
              <details key={section.id} className="vaGuideSection" id={section.id} open={section.openByDefault}>
                <summary className="vaGuideSummary">
                  <span className="vaGuideIcon">
                    <Icon size={17} aria-hidden />
                  </span>
                  <span className="vaGuideSummaryText">
                    <span className="vaGuideSectionTitle">{section.title}</span>
                    <span className="vaGuideSectionSummary">{section.summary}</span>
                  </span>
                  <span className="vaGuideMeta">
                    <Clock size={12} aria-hidden />
                    {section.minutes}m
                    <ChevronDown size={16} aria-hidden className="vaGuideChevron" />
                  </span>
                </summary>
                <div className="vaGuideBody">
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </div>
              </details>
            );
          })}
        </section>
      ))}

      <div className="vaGuideCallout vaGuideCalloutLaw" style={{ maxWidth: 'none', marginTop: 30 }}>
        <p className="vaGuideCalloutTitle">
          <Scale size={14} aria-hidden />
          The necessary disclaimer
        </p>
        <p>
          Everything here is researched and sourced, and none of it is legal, tax or financial advice.
          The rates are market data and the paperwork list is accurate for a sole proprietor in Texas as
          of August 2026 — but before you file anything with an ongoing cost, spend an hour with a CPA.
          It will pay for itself in year one.
        </p>
      </div>
    </>
  );
}
