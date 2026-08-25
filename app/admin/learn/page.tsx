'use client';
// app/admin/learn/page.tsx — the Knowledge portal.
//
// C11a / P12 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Nineteen links in one workspace. Nine of them are the same activity — studying — split by
// implementation: the roadmap, the modules, the reference library, the two flashcard surfaces, the
// practice runner, the quiz log and the search page. They become tabs; the hub's card grid becomes
// the first of them.
//
// ── WHAT DELIBERATELY DID NOT COME ──────────────────────────────────────────────────────────────
//
// §8 is explicit about both, and both survive re-reading:
//
//   · `exam-prep` and its four children stay separate. An exam sitting is a session you do not want
//     a tab bar in — a mock exam is timed, and a tab strip above it is an invitation to leave
//     mid-question with no way to say what that did to the clock.
//   · `learn/manage` and its two children stay separate. Authoring is a different job from
//     studying, done by a different role — it is one of only two gated prefixes in this tree — and
//     `manage/lesson-builder/[id]` is 1,978 lines.
//
// `students` is not in §8's list either, and it belongs with `manage` for the same reason: it is a
// teacher looking at other people, not a learner looking at themselves.
//
// ── EVERY TAB HERE IS UNGATED, AND THAT IS INHERITED RATHER THAN CHOSEN ─────────────────────────
//
// §5's rule is that a portal must not be a wider door than the pages it absorbs. All nine rows were
// ungated, and middleware gates only `/admin/learn/manage` and `/admin/learn/students` — neither of
// which is here. So the portal opens exactly as wide as what it holds, and no role list moved.
//
// ── THE CARD GRID STAYS A CARD GRID ─────────────────────────────────────────────────────────────
//
// The hub tab still offers cards for things that are now tabs beside it. That looks like the
// duplicate-control problem C9 fixed, and it is not the same thing: a tab is a word and a card is a
// paragraph saying what the thing is for. Someone who has never opened Flashcards learns more from
// the card. What the grid must not do is outlive the tabs' truth, so re-reading it is on C14's list
// for once every portal exists.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  GraduationCap, Route, BookOpen, BookText, Library,
  Layers, Boxes, Play, History, Search,
} from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import HubTab from './_tabs/HubTab';
import RoadmapTab from './_tabs/RoadmapTab';
import ModulesTab from './_tabs/ModulesTab';
import KnowledgeBaseTab from './_tabs/KnowledgeBaseTab';
import ReferencesTab from './_tabs/ReferencesTab';
import FlashcardsTab from './_tabs/FlashcardsTab';
import FlashcardBankTab from './_tabs/FlashcardBankTab';
import PracticeTab from './_tabs/PracticeTab';
import QuizHistoryTab from './_tabs/QuizHistoryTab';
import SearchTab from './_tabs/SearchTab';
import './LearnPortal.css';

// Ordered the way studying goes rather than the way the files were written: where am I, what do I
// study, where do I look one thing up, how do I drill it, how do I test myself, what did I score —
// and last, because it is the escape hatch from all of the above, how do I find anything at all.
const PORTAL: PortalSpec = {
  route: '/admin/learn',
  tabs: [
    { id: 'hub', label: 'Hub', icon: GraduationCap, hint: 'Everything the learning platform holds, and where each part starts.' },
    { id: 'roadmap', label: 'Roadmap', icon: Route, hint: 'The full Texas curriculum, and how far through it you are.' },
    { id: 'modules', label: 'Modules', icon: BookOpen, hint: 'Courses, their lessons, and the test at the end of each.' },
    { id: 'knowledge-base', label: 'Knowledge base', icon: BookText, hint: 'Reference articles — the encyclopedia, for looking one thing up.' },
    { id: 'references', label: 'References', icon: Library, hint: 'Tables, formulas and constants.' },
    { id: 'flashcards', label: 'Flashcards', icon: Layers, hint: 'Your decks, and the cards you are due to review.' },
    { id: 'flashcard-bank', label: 'Card bank', icon: Boxes, hint: 'Every card in the system — to pull from, rather than to study.' },
    { id: 'practice', label: 'Practice', icon: Play, hint: 'A quick run of questions, with nothing riding on it.' },
    { id: 'quiz-history', label: 'Quiz history', icon: History, hint: 'What you have sat, and what you scored.' },
    { id: 'search', label: 'Search', icon: Search, hint: 'Across modules, lessons, topics, articles and cards at once.' },
  ],
  defaultTab: 'hub',
};

export default function LearnPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="lrn-portal">
      <nav className="lrn-portal__tabs" role="tablist" aria-label="Learning">
        {tabs.map((t) => {
          const Icon = t.icon as typeof GraduationCap;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`lrn-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`lrn-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`lrn-portal__tab${isActive ? ' lrn-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`lrn-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while every tab is ungated, and kept for the same reason as the other
          portals': "cannot happen" is a property of today's role lists, not of this component. */}
      {!active && (
        <p className="lrn-portal__none">
          Every part of Learning is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && <p className="lrn-portal__hint">{activeTab.hint}</p>}

      {/* One at a time rather than ten hidden with CSS: each of these fetches on mount, and mounting
          all ten would fire every learning query on every visit to answer one question. */}
      <div id={`lrn-panel-${active}`} role="tabpanel" aria-labelledby={`lrn-tab-${active}`}>
        {active === 'hub' && <HubTab />}
        {active === 'roadmap' && <RoadmapTab />}
        {active === 'modules' && <ModulesTab />}
        {active === 'knowledge-base' && <KnowledgeBaseTab />}
        {active === 'references' && <ReferencesTab />}
        {active === 'flashcards' && <FlashcardsTab />}
        {active === 'flashcard-bank' && <FlashcardBankTab />}
        {active === 'practice' && <PracticeTab />}
        {active === 'quiz-history' && <QuizHistoryTab />}
        {active === 'search' && <SearchTab />}
      </div>
    </div>
  );
}
