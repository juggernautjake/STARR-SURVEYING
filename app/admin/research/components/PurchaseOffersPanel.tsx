'use client';

// app/admin/research/components/PurchaseOffersPanel.tsx — what the run found behind a paywall,
// priced, with a button.
//
// Owner, 2026-09-21: "we will find all of the relevant items that can be purchased, and we will
// list them when the research run is done, and next to them we will have a purchase button. We
// should take a screenshot of the first page of the document if we can and use it as a thumbnail.
// Then if the researcher clicks the purchase button, the worker will go and purchase the document,
// download it, and add it to the list of viewable documents."
//
// ── THIS IS A FINDINGS LIST, NOT AN ERROR LIST ──────────────────────────────────────────────────
//
// Every visual decision here follows from that. No red, no warning triangle, no "failed to
// retrieve". The run found these documents, priced them, and stopped — which is what it is now
// supposed to do. Rendered beside genuine failures they read as four things that went wrong;
// rendered as a priced list they read as four things you can have.
//
// ── WHY A CONFIRM STEP ──────────────────────────────────────────────────────────────────────────
//
// The button spends money on a vendor account. One misplaced click in a list of eight rows is a
// charge nobody chose, and the whole reason this panel exists is that a run was buying documents
// nobody had asked for. A second click is a cheap price for that not happening again.

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Lock, ShoppingCart, Check } from 'lucide-react';

export interface Offer {
  id: string;
  label: string;
  documentType: string | null;
  vendor: string;
  priceUsd: number | null;
  previewPath: string | null;
  buyable: boolean;
  note: string | null;
  offeredAt: string | null;
}

interface OffersResponse {
  offers?: Offer[];
  totalUsd?: number | null;
  headline?: string | null;
}

/** "$4.00", or an honest shrug. The worker stores 0 for "priced per page, count unknown"; the API
 *  turns that into null, and a null must never render as $0.00 beside a button that charges. */
export function priceLabel(usd: number | null): string {
  return usd === null ? 'Price at checkout' : `$${usd.toFixed(2)}`;
}

function OfferRow({
  projectId, offer, onBought,
}: { projectId: string; offer: Offer; onBought: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/research/${projectId}/offers/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!r.ok) {
        setError(j.error ?? j.details ?? `The purchase did not go through (HTTP ${r.status}).`);
        return;
      }
      setDone(true);
      onBought(offer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="offers__row" data-testid="purchase-offer">
      <div className="offers__thumb" aria-hidden="true">
        {offer.previewPath
          ? <img src={`/api/admin/research/${projectId}/offers/preview?path=${encodeURIComponent(offer.previewPath)}`} alt="" loading="lazy" />
          : <FileText size={20} />}
      </div>

      <div className="offers__meta">
        <span className="offers__label">{offer.label}</span>
        <span className="offers__sub">
          {offer.documentType && <span className="offers__type">{offer.documentType}</span>}
          <span className="offers__vendor">{offer.vendor}</span>
        </span>
      </div>

      <span className="offers__price">{priceLabel(offer.priceUsd)}</span>

      <div className="offers__action">
        {done ? (
          <span className="offers__done"><Check size={14} aria-hidden="true" /> Bought — it is in the documents list</span>
        ) : !offer.buyable ? (
          // Honest rather than helpful-looking. Without the vendor's own id for this document,
          // "buy" means re-running the search and taking the first hit, which for a common surname
          // is a different deed with the same label.
          <span className="offers__manual" title="We do not have the vendor's own id for this document, so buying it automatically could fetch the wrong one.">
            <Lock size={13} aria-hidden="true" /> Buy on {offer.vendor}
          </span>
        ) : confirming ? (
          <span className="offers__confirm">
            <button type="button" className="research-back-btn offers__btn offers__btn--go" disabled={busy} onClick={() => void buy()}>
              {busy ? <><Loader2 size={13} className="offers__spin" aria-hidden="true" /> Buying…</> : `Yes, buy for ${priceLabel(offer.priceUsd)}`}
            </button>
            <button type="button" className="research-back-btn offers__btn" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="research-back-btn offers__btn"
            onClick={() => setConfirming(true)}
            data-testid="purchase-offer-btn"
          >
            <ShoppingCart size={14} aria-hidden="true" /> Purchase
          </button>
        )}
      </div>

      {error && <span role="alert" className="offers__error">{error}</span>}
    </li>
  );
}

export default function PurchaseOffersPanel(
  { projectId, onBought }: { projectId: string; onBought?: () => void },
) {
  const [data, setData] = useState<OffersResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/research/${projectId}/offers`);
      setData(r.ok ? ((await r.json()) as OffersResponse) : { offers: [] });
    } catch {
      setData({ offers: [] });
    } finally {
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const offers = data?.offers ?? [];
  // Nothing on offer is the ordinary case — a run that found everything free, or one that has not
  // reached the paid sources yet. An empty panel with a heading would be furniture.
  if (!loaded || offers.length === 0) return null;

  return (
    <section className="offers" data-testid="purchase-offers">
      <header className="offers__head">
        <h3 className="offers__title">Available to purchase</h3>
        {data?.headline && <p className="offers__headline">{data.headline}</p>}
      </header>
      <ul className="offers__list">
        {offers.map((o) => (
          <OfferRow
            key={o.id}
            projectId={projectId}
            offer={o}
            // The document list is the point of the purchase, so the page reloads it too — a bought
            // deed that does not appear until a refresh looks like a charge that did nothing.
            onBought={() => { void load(); onBought?.(); }}
          />
        ))}
      </ul>
    </section>
  );
}
