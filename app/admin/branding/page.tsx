'use client';
// /admin/branding — the brand system, on the inside of the product that uses it.
//
// ── WHY THIS IS A PAGE AND NOT A PDF ────────────────────────────────────────────────────────────
//
// Owner: *"a branding page that can be viewed on the backend of the starr surveying website … it
// should hold all of the colors, fonts, logos, images, building blocks, and everything."*
//
// A brand guide as a file is a brand guide that is out of date the first time a colour moves, and
// nobody can tell which copy on which laptop is the current one. Here it reads `lib/branding/
// palette.ts` — the same module the standalone printer's guide is generated from — so the page and
// the file cannot disagree, and adding a colour is one edit rather than three.
//
// ── THE SWATCHES ARE NOT THEMED, AND THAT IS DELIBERATE ─────────────────────────────────────────
//
// Every other admin surface follows the eleven palettes. This one themes its CHROME and pins its
// CONTENT: a brand colour rendered through a theme is not that colour any more, and the page exists
// to show what #BD1218 actually looks like. See the header of Branding.css.
//
// ── THE ROLE LIST ───────────────────────────────────────────────────────────────────────────────
//
// `middleware.ts` gates the route to the roles that PRODUCE things carrying the logo — admin,
// developer, tech_support, teacher, employee. Not a security boundary in any meaningful sense;
// there is nothing here but the firm's own marks and hex codes. It is scoped because the owner
// asked for it to be, and because a nav entry offered to a student who will never order a shirt is
// clutter rather than access.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Palette, Type, Shapes, Component, Download, BookOpen, Blend, UploadCloud } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import { googleFontsHref } from '@/lib/branding/palette';

import OverviewTab from './_tabs/OverviewTab';
import LogosTab from './_tabs/LogosTab';
import ColoursTab from './_tabs/ColoursTab';
import TypeTab from './_tabs/TypeTab';
import PairingsTab from './_tabs/PairingsTab';
import BlocksTab from './_tabs/BlocksTab';
import DownloadsTab from './_tabs/DownloadsTab';
import UploadTab from './_tabs/UploadTab';
import './Branding.css';

const PORTAL: PortalSpec = {
  route: '/admin/branding',
  tabs: [
    { id: 'overview', label: 'Overview', icon: BookOpen, hint: 'What the brand is and the three rules worth memorising.' },
    { id: 'logos', label: 'Logos', icon: Shapes, hint: 'Every approved mark, what each is for, and minimum sizes.' },
    { id: 'colours', label: 'Colours', icon: Palette, hint: 'The 27 approved colours, with the ink rule and every measured pairing.' },
    { id: 'type', label: 'Typography', icon: Type, hint: 'Ten typefaces, each with a job, set in the real font.' },
    { id: 'pairings', label: 'Combinations', icon: Blend, hint: 'Every colour pairing graded, plus the font pairings that work together.' },
    { id: 'blocks', label: 'Building blocks', icon: Component, hint: 'Buttons, pills, cards and callouts built from the palette.' },
    { id: 'downloads', label: 'Downloads', icon: Download, hint: 'The asset files and the standalone guide for printers.' },
    { id: 'upload', label: 'Add a design', icon: UploadCloud, hint: 'Upload a new design, describe it, and generate its resolutions.' },
  ],
  defaultTab: 'overview',
};

export default function BrandingPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select, tabKeyDown } = usePortalTabs(PORTAL, viewer);

  return (
    <div className="brand-portal">
      {/*
        The ten specimen faces, loaded only on this route rather than in the root layout — a brand
        page is the one screen in the product that has a reason to pull ten families, and every
        other page would pay for it. `preconnect` is already in the root layout.

        If the stylesheet does not load (offline, blocked), every specimen falls back to the second
        name in its stack rather than to nothing: see `stack` in lib/branding/palette.ts.
      */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={googleFontsHref()} />

      <nav className="brand-portal__tabs" role="tablist" aria-label="Brand system">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Palette;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              id={`brand-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`brand-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              title={t.hint}
              className={`brand-portal__tab${isActive ? ' brand-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              // The hook's own handler, not a local one built on the same helper.
              //
              // This page did call `tabMoveTarget` — the pure half — and then focused
              // `#brand-tab-${next}` by an id convention, which is precisely the approach
              // `tab-keyboard.ts` warns against in its own header: an id lookup that drifts focuses
              // NOTHING, and focusing nothing looks exactly like arrow keys never having been
              // wired. The guard added for E1b caught this page as the sixteenth portal doing its
              // own version of a solved problem.
              onKeyDown={tabKeyDown}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while every tab is ungated and the route is role-gated above it — kept for
          the same reason every other portal keeps it: "cannot happen" is a property of today's
          tab list, not of this component. */}
      {!active && (
        <p className="brand-portal__none">
          Every part of the brand system is switched off for this company. An admin can turn them
          back on in Settings.
        </p>
      )}

      {active && (
        <div id={`brand-panel-${active}`} role="tabpanel" aria-labelledby={`brand-tab-${active}`}>
          {active === 'overview' && <OverviewTab onNavigate={select} />}
          {active === 'logos' && <LogosTab />}
          {active === 'colours' && <ColoursTab />}
          {active === 'type' && <TypeTab />}
          {active === 'pairings' && <PairingsTab />}
          {active === 'blocks' && <BlocksTab />}
          {active === 'downloads' && <DownloadsTab />}
          {active === 'upload' && <UploadTab />}
        </div>
      )}
    </div>
  );
}
