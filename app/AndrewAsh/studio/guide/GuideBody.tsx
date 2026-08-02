'use client';
// app/AndrewAsh/studio/guide/GuideBody.tsx — the whole guide, rendered on the client.
//
// ── WHY ONE CLIENT COMPONENT INSTEAD OF A SERVER PAGE WITH CLIENT LEAVES ────────────────────────
//
// The first version was a server component that rendered `<Checklist>` and `<TaskCard>` (both client
// components) from inside a `Block` switch. That is a legal, ordinary App Router pattern, and it
// failed to hydrate on this route:
//
//     TypeError: Cannot read properties of undefined (reading 'call')
//       at options.factory (webpack.js)
//       at Lazy → at div → at Block (Server) → at details → at GuidePage (Server)
//
// The client reference for the leaf resolved to an undefined module factory. Rather than keep
// bisecting a bundler problem on a page whose interactivity is two checkboxes, the boundary is simply
// removed: the page is now a thin server component that reads the saved progress, and everything
// below it — including the collapsible sections — is one client module with no nested references to
// resolve.
//
// The cost is real and small: the playbook's text ships to the browser. It is plain data, it is the
// same content the page would have streamed as RSC payload anyway, and it is the studio, not the
// public marketing site — Andrew loads it, nobody else does.

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Compass,
  ExternalLink,
  FileCheck,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  Loader2,
  MapPin,
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

import type { PlaybookBlock, PlaybookChapter, PlaybookTask } from '@/lib/voice/playbook';
import { BASE_PATH } from '@/lib/voice/content';

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

const CALLOUT_ICONS = { tip: Lightbulb, warn: AlertTriangle, money: BadgeCheck, law: Scale } as const;

/** `**bold**` → <strong>. Not a markdown library: the playbook is written by us, so the only markup
 *  it needs is emphasis, and a parser would put an HTML sanitiser on a page with no untrusted input. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

interface Props {
  playbook: readonly PlaybookChapter[];
  minutes: number;
  initialProgress: Record<string, boolean>;
}

export default function GuideBody({ playbook, minutes, initialProgress }: Props): React.ReactElement {
  // Progress is held ONCE, at the top, and passed down. Holding it per-card would mean two cards
  // could disagree about the same key after a failed save.
  const [progress, setProgress] = useState<Record<string, boolean>>(initialProgress);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string): Promise<void> {
    const next = !progress[key];
    setProgress((prev) => {
      const copy = { ...prev };
      if (next) copy[key] = true;
      else delete copy[key];
      return copy;
    });
    setPending(key);
    setError(null);

    try {
      const res = await fetch('/api/voice/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, done: next }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Roll back AND say so. A silent rollback looks like the checkbox refusing to work, which is
      // worse than never having been optimistic.
      setProgress((prev) => {
        const copy = { ...prev };
        if (next) delete copy[key];
        else copy[key] = true;
        return copy;
      });
      setError('That did not save — check your connection and tap it again.');
    } finally {
      setPending(null);
    }
  }

  const ctx = { progress, pending, toggle, error };

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

      {playbook.map((chapter) => (
        <section key={chapter.id} className="vaGuideChapter" id={chapter.id}>
          <div className="vaGuideChapterHead">
            <h2 className="vaGuideChapterTitle">{chapter.title}</h2>
            <p className="vaGuideChapterBlurb">{chapter.blurb}</p>
          </div>

          {chapter.sections.map((section) => {
            const Icon = SECTION_ICONS[section.icon] ?? BookOpen;
            return (
              <details key={section.id} className="vaGuideSection" id={section.id}>
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
                    <Block key={i} block={block} sectionId={section.id} ctx={ctx} />
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

interface Ctx {
  progress: Record<string, boolean>;
  pending: string | null;
  toggle: (key: string) => Promise<void>;
  error: string | null;
}

function Block({ block, sectionId, ctx }: { block: PlaybookBlock; sectionId: string; ctx: Ctx }): React.ReactElement | null {
  if (Array.isArray(block)) return null;

  switch (block.kind) {
    case 'lead':
      return <p className="vaGuideLead">{inline(block.text)}</p>;

    case 'para':
      return <p>{inline(block.text)}</p>;

    case 'list':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );

    case 'checklist':
      return <SimpleChecklist sectionId={sectionId} items={block.items} ctx={ctx} />;

    case 'tasks':
      return (
        <div className="vaTaskList">
          {block.intro && <p className="vaTaskIntro">{inline(block.intro)}</p>}
          {block.items.map((task) => (
            <TaskCard key={task.id} task={task} ctx={ctx} />
          ))}
        </div>
      );

    case 'callout': {
      const Icon = CALLOUT_ICONS[block.tone] ?? Lightbulb;
      const tone =
        block.tone === 'warn'
          ? ' vaGuideCalloutWarn'
          : block.tone === 'money'
            ? ' vaGuideCalloutMoney'
            : block.tone === 'law'
              ? ' vaGuideCalloutLaw'
              : '';
      return (
        <div className={`vaGuideCallout${tone}`}>
          <p className="vaGuideCalloutTitle">
            <Icon size={14} aria-hidden />
            {block.title}
          </p>
          <p>{inline(block.text)}</p>
        </div>
      );
    }

    case 'steps':
      return (
        <div className="vaGuideSteps">
          {block.items.map((item, i) => (
            <div key={i} className="vaGuideStep">
              <p className="vaGuideStepTitle">{inline(item.title)}</p>
              <p>{inline(item.body)}</p>
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
                      <td key={j} className={j > 0 ? 'vaNum' : undefined} style={j === 0 ? { color: 'var(--va-text)' } : undefined}>
                        {inline(String(cell))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note && <p className="vaGuideRatesNote">{inline(block.note)}</p>}
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

function SimpleChecklist({
  sectionId,
  items,
  ctx,
}: {
  sectionId: string;
  items: { text: string; detail?: string }[];
  ctx: Ctx;
}): React.ReactElement {
  const done = items.filter((_, i) => ctx.progress[`${sectionId}:${i}`]).length;

  return (
    <div className="vaChecklist">
      <div className="vaChecklistHead">
        <span className="vaChecklistCount">
          {done} of {items.length} done
        </span>
        <span className="vaChecklistBar" aria-hidden>
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </span>
      </div>

      {ctx.error && (
        <p className="vaError" role="alert" style={{ marginBottom: 10 }}>
          {ctx.error}
        </p>
      )}

      <ul className="vaChecklistItems">
        {items.map((item, index) => {
          const key = `${sectionId}:${index}`;
          const isDone = Boolean(ctx.progress[key]);
          return (
            <li key={key} className={isDone ? 'vaChecklistDone' : undefined}>
              <label>
                <input type="checkbox" checked={isDone} onChange={() => void ctx.toggle(key)} disabled={ctx.pending === key} />
                <span className="vaChecklistBox" aria-hidden>
                  {ctx.pending === key ? <Loader2 size={12} className="vaSpin" /> : isDone ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                <span className="vaChecklistText">
                  <span className="vaGuideCheckTitle">{inline(item.text)}</span>
                  {item.detail && <span className="vaGuideCheckDetail">{inline(item.detail)}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TaskCard({ task, ctx }: { task: PlaybookTask; ctx: Ctx }): React.ReactElement {
  const done = task.steps.filter((_, i) => ctx.progress[`${task.id}:${i}`]).length;
  const allDone = done === task.steps.length && task.steps.length > 0;

  return (
    <details className={`vaTask${allDone ? ' vaTaskDone' : ''}`}>
      <summary className="vaTaskSummary">
        {/* One element, three states — empty, a count, a tick — so the CLOSED row shows how far in
            Andrew is without him opening it. */}
        <span className={`vaTaskCheck${allDone ? ' vaTaskCheckDone' : ''}`} aria-hidden>
          {allDone ? <Check size={13} strokeWidth={3} /> : done > 0 ? done : null}
        </span>

        <span className="vaTaskSummaryText">
          <span className="vaTaskTitle">
            {task.title}
            {task.optional && <span className="vaTaskLater">Later</span>}
          </span>
          <span className="vaTaskBlurb">{task.summary}</span>
          <span className="vaTaskFacts">
            <span>
              <Wallet size={11} aria-hidden /> {task.cost}
            </span>
            <span>
              <Clock size={11} aria-hidden /> {task.time}
            </span>
            <span className="vaTaskCount">
              {done}/{task.steps.length} steps
            </span>
          </span>
        </span>

        <ChevronDown size={16} aria-hidden className="vaTaskChevron" />
      </summary>

      <div className="vaTaskBody">
        {task.where && (
          <p className="vaTaskWhere">
            <MapPin size={13} aria-hidden />
            <span>{task.where}</span>
          </p>
        )}

        {task.need && task.need.length > 0 && (
          <div className="vaTaskNeed">
            <p className="vaTaskNeedTitle">Before you start, have these ready</p>
            <ul>
              {task.need.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <ol className="vaTaskSteps">
          {task.steps.map((step, index) => {
            const key = `${task.id}:${index}`;
            const isDone = Boolean(ctx.progress[key]);
            return (
              <li key={key} className={isDone ? 'vaTaskStepDone' : undefined}>
                <label>
                  <input type="checkbox" checked={isDone} onChange={() => void ctx.toggle(key)} disabled={ctx.pending === key} />
                  <span className="vaTaskStepBox" aria-hidden>
                    {ctx.pending === key ? <Loader2 size={11} className="vaSpin" /> : isDone ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="vaTaskStepText">
                    <span className="vaTaskStepTitle">{step.text}</span>
                    {step.detail && <span className="vaTaskStepDetail">{step.detail}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>

        {task.gotcha && (
          <div className="vaTaskGotcha">
            <p>
              <AlertTriangle size={12} aria-hidden /> The bit that catches people out
            </p>
            <p>{task.gotcha}</p>
          </div>
        )}

        {task.links && task.links.length > 0 && (
          <div className="vaTaskLinks">
            {task.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label} <ExternalLink size={11} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
