'use client';
// app/admin/design/serve/ServedDesign.tsx — the design, as a page, at real size.
//
// Phase R1 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"if we make a page the active page, then it will become the actual served page."*
//
// ── WHAT THIS IS, AND THE SENTENCE THAT HAS TO BE ON THE SCREEN ─────────────────────────────────
//
// §1 of the plan says why a design cannot literally replace `/admin/jobs`: that route authenticates,
// fetches, filters and writes, and serving a picture of it would take a working page away. What
// CAN be honest is this — the design rendered at 1:1, full bleed, with the editor's chrome gone, so
// the question "does this hold up as a page?" is answered by looking at a page rather than at a
// canvas at 62%.
//
// The banner is not decoration. Somebody arriving on this URL from a link has to know within a
// second that they are looking at a specification and not at the product, or this becomes the most
// convincing way in the whole system to be wrong about what the app does. It can be dismissed for
// the session, because a person who already knows should be able to see the design unobstructed.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Monitor, Smartphone, PenTool, X, ExternalLink } from 'lucide-react';
import type { DesignDocument, ViewId } from '@/lib/design/document';
import { contentHeight } from '@/lib/design/document';
import { getEntry } from '@/lib/design/catalogue';
import { renderElement, positionStyle } from '@/lib/design/render';
import { dsPrimitiveStyles } from '@/lib/design/export';
import { themeStyle } from '@/lib/design/theme';
import type { Theme } from '@/lib/design/theme';
import type { ActiveKind } from '@/lib/design/active';
// W3. A composition is not drawn — it is RENDERED, by the same grid the hub uses, from the same
// registry. That is the whole distinction §2 draws between the two kinds of design: a trace holds
// rectangles and a composition holds working components.
import '@/lib/hub/widgets/register-all';
import WidgetGrid from '@/lib/hub/components/WidgetGrid';
import { allWidgets } from '@/lib/hub/widget-registry';
import { viewToGrid, visibleWidgets } from '@/lib/design/widget-palette';
import { HUB_GRID_COLS } from '@/lib/hub/grid-model';
import '../DesignStudio.css';

interface Props {
  doc: DesignDocument;
  kind: ActiveKind;
  explanation: string;
  /** The real page this is a design of, when it has one — so "compare with the real thing" is one
   *  click and not a retyped URL. */
  route: string | null;
}

export default function ServedDesign({ doc, kind, explanation, route }: Props) {
  const [viewId, setViewId] = useState<ViewId>('desktop');
  const { data: session } = useSession();
  const [showBanner, setShowBanner] = useState(true);
  const view = doc.views[viewId];

  // ── WHICH OF THE TWO KINDS THIS IS ────────────────────────────────────────────────────────────
  //
  // Read off the document, not guessed from its contents. A composition somebody has not put any
  // widgets on yet is still a composition, and inferring the kind from "does it contain widgets"
  // would render it as an empty TRACE — a blank page rather than an empty grid saying so.
  const isComposition = doc.kind === 'composition';

  // The size envelope is the registry's. A widget resized on the canvas past what its component
  // supports renders broken on the real page, and this preview exists to catch exactly that.
  const envelopes = useMemo(
    () => new Map(allWidgets().map((w) => [w.id, { minSize: w.minSize, maxSize: w.maxSize }])),
    [],
  );
  // ── W5: FILTERED THE SAME WAY THE REAL PAGE FILTERS ──────────────────────────────────────────
  //
  // A preview that showed MORE than the page does would be worse than no preview: it would tell a
  // designer their layout is fine when a third of it is invisible to the people it was built for.
  // So the same function, against the same roles, in both places — the whole reason `visibleWidgets`
  // is a shared export rather than four lines inlined into each.
  //
  // Note this is the DESIGNER's roles, which is the honest thing a preview can say: "here is what
  // YOU would see". Previewing as somebody else is a different feature, and pretending to do it by
  // guessing would be worse than not offering it.
  const roles = (session?.user?.roles ?? []) as string[];
  const roleDefs = useMemo(
    () => new Map(allWidgets().map((w) => [w.id, { allowedRoles: w.allowedRoles }])),
    [],
  );
  const instances = useMemo(
    () => (isComposition
      ? visibleWidgets(viewToGrid(view.elements, view.width, HUB_GRID_COLS, envelopes), roles, roleDefs)
      : []),
    [isComposition, view.elements, view.width, envelopes, roles, roleDefs],
  );

  // ── Real size means real size ───────────────────────────────────────────────────────────────
  //
  // A desktop design is 1440 wide. On a 1280 window it must not be scaled to fit, because then this
  // page answers a different question from the one it exists for — it would show that the design
  // looks fine SHRUNK. It scrolls sideways instead, which is the honest failure.
  const height = contentHeight(view);

  useEffect(() => {
    // The design is the whole page here, so the shell's page padding would offset every element by
    // an amount the design never accounted for.
    document.body.classList.add('dsx-served-body');
    return () => document.body.classList.remove('dsx-served-body');
  }, []);

  return (
    <div className="dsx-served">
      <style dangerouslySetInnerHTML={{ __html: dsPrimitiveStyles() }} />

      {showBanner && (
        <div className={`dsx-served__banner dsx-served__banner--${kind}`} role="status">
          <PenTool size={15} aria-hidden />
          <span>
            <strong>This is a design, not the page.</strong> {explanation}
          </span>
          {route && (
            <a className="dsx-served__link" href={route} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden /> Open the real page
            </a>
          )}
          <Link className="dsx-served__link" href={`/admin/design/${doc.id}`}>Edit</Link>
          <button onClick={() => setShowBanner(false)} aria-label="Hide this notice"><X size={14} aria-hidden /></button>
        </div>
      )}

      <div className="dsx-served__views" role="tablist" aria-label="View">
        <button role="tab" aria-selected={viewId === 'desktop'} className={viewId === 'desktop' ? 'is-on' : ''} onClick={() => setViewId('desktop')}>
          <Monitor size={14} aria-hidden /> Desktop · {doc.views.desktop.width}px
        </button>
        <button role="tab" aria-selected={viewId === 'mobile'} className={viewId === 'mobile' ? 'is-on' : ''} onClick={() => setViewId('mobile')}>
          <Smartphone size={14} aria-hidden /> Mobile · {doc.views.mobile.width}px
        </button>
      </div>

      <div
        className="dsx-served__page"
        style={{ ...themeStyle((doc.theme as Theme | null) ?? null), width: view.width, height }}
      >
        {isComposition ? (
          // ── THE REAL THING, NOT A PICTURE OF IT ────────────────────────────────────────────────
          //
          // Every widget here fetches its own data against the SIGNED-IN viewer. That is why a
          // composition can be served and a trace cannot, and why this preview is worth having:
          // what you are looking at is what the page does, not a drawing of what somebody hopes it
          // will do.
          //
          // ── CORRECTED, W5 ──────────────────────────────────────────────────────────────────────
          //
          // This comment used to add "…and hides itself if they may not see it". That was false, and
          // it was the same false belief the plan's W5 was written on. A widget declares
          // `allowedRoles` and NOTHING reads it at render — the hub consults it only in the Add
          // Widget modal. `instances` above is filtered by `visibleWidgets` for exactly that reason.
          //
          // Which means the preview is honest about the thing people get wrong — a role-gated widget
          // simply is not here when you are not that role. Seeing the gap in the preview is the
          // point; `placementWarning` says it in words at the moment of placing, and this shows it.
          <WidgetGrid widgets={instances} />
        ) : [...view.elements]
          .filter((el) => !el.hidden)
          // Annotations are notes ABOUT the design — an arrow pointing at a button, a sticky asking
          // a question. On a canvas they are the conversation; on a page pretending to be the page
          // they are furniture that does not exist.
          .filter((el) => !el.annotation)
          .sort((a, b) => a.z - b.z)
          .map((el) => {
            const entry = el.catalogId ? getEntry(el.catalogId) : undefined;
            return (
              <div
                key={el.id}
                className={`dsx__el${entry?.size.contentHeight ? '' : ' dsx__el--fill'}`}
                style={positionStyle(el, entry)}
              >
                <div className="dsx__el-inner" dangerouslySetInnerHTML={{ __html: renderElement(entry, el) }} />
              </div>
            );
          })}
        {isComposition && instances.length === 0 && (
          <p className="dsx-served__empty">
            This composition has no widgets on its {viewId} view yet.
          </p>
        )}
        {!isComposition && view.elements.length === 0 && (
          <p className="dsx-served__empty">
            This design has nothing on its {viewId} view yet.
          </p>
        )}
      </div>
    </div>
  );
}
