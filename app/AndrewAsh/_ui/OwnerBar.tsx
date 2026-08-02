'use client';
// app/AndrewAsh/_ui/OwnerBar.tsx — the strip Andrew sees and clients never do.
//
// > "Whenever he is logged in, each page and widget should have a little edit button… Whenever he is
// >  not logged in, it will not have that button." — and: "he should also be able to just view the
// >  pages as they would render for a potential client, and switch back and forth."
//
// Two states:
//
//   EDITING  — a gold bar naming the page, with a link into the builder. Each widget also carries its
//              own edit button (rendered by WidgetRenderer), so he can jump to a specific block
//              rather than hunting for it in a list.
//   CLIENT   — the bar shrinks to a quiet chip and every per-widget button disappears, so what is on
//              screen is what a visitor gets. It does not vanish entirely, because a mode with no way
//              out is a trap.
//
// ── THE MODE LIVES IN THE URL, NOT IN STATE ─────────────────────────────────────────────────────
//
// `?view=client` rather than `useState`. Three things fall out of that which local state cannot give:
// the mode survives a navigation, so he can click through the whole site as a client; it survives a
// reload; and he can send someone the link and they see what he saw. It is also what lets the
// server-rendered `WidgetRenderer` know whether to emit the per-widget buttons at all — client state
// would mean rendering them and hiding them, which puts them in the DOM of a page he is trying to see
// exactly as a stranger would.
//
// Signed out, this component is never rendered by SystemPage. Nothing here is hidden by CSS.

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Eye, Pencil, LayoutDashboard, X } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

interface Props {
  pageTitle: string;
  editHref: string;
  /** False when this page is still the built-in default — the studio offers to "adopt" it. */
  isCustomised: boolean;
  slug: string;
}

export default function OwnerBar({ pageTitle, editHref, isCustomised }: Props): React.ReactElement {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const clientView = params.get('view') === 'client';

  function setView(mode: 'client' | 'owner'): void {
    const next = new URLSearchParams(params.toString());
    if (mode === 'client') next.set('view', 'client');
    else next.delete('view');
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (clientView) {
    return (
      <div className="vaOwnerBar vaOwnerBarPreview vaNoPrint">
        <span className="vaOwnerBarLabel">
          <Eye size={13} aria-hidden /> Client view
        </span>
        <span className="vaOwnerBarSpacer" />
        <button type="button" onClick={() => setView('owner')}>
          <X size={13} aria-hidden /> Back to editing
        </button>
      </div>
    );
  }

  return (
    <div className="vaOwnerBar vaNoPrint">
      <span className="vaOwnerBarLabel">
        <Pencil size={13} aria-hidden /> Editing: {pageTitle}
      </span>
      {!isCustomised && (
        <span className="vaMuted" style={{ fontSize: '0.75rem' }}>
          Still the original — your first edit makes it yours.
        </span>
      )}
      <span className="vaOwnerBarSpacer" />
      <button type="button" onClick={() => setView('client')}>
        <Eye size={13} aria-hidden /> View as a client
      </button>
      <Link href={editHref}>
        <Pencil size={13} aria-hidden /> Edit this page
      </Link>
      <Link href={`${BASE_PATH}/studio`}>
        <LayoutDashboard size={13} aria-hidden /> Studio
      </Link>
    </div>
  );
}
