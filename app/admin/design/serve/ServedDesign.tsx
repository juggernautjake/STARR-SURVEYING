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

import { useEffect, useState } from 'react';
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
  const [showBanner, setShowBanner] = useState(true);
  const view = doc.views[viewId];

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
        {[...view.elements]
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
        {view.elements.length === 0 && (
          <p className="dsx-served__empty">
            This design has nothing on its {viewId} view yet.
          </p>
        )}
      </div>
    </div>
  );
}
