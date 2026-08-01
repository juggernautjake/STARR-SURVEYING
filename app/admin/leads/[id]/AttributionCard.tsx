'use client';
// AttributionCard — where did this lead actually come from? A13.
//
// Finding 6: `leads.source` defaults to 'Phone' at this business, and a phone lead carries no click. The
// coverage meter on /admin/marketing will never read 100%, and the useful response is not to pretend
// otherwise — it is to collect the weak signals that exist and label them honestly as weak.
//
// ── THREE KINDS OF EVIDENCE, SHOWN AS THREE KINDS ──────────────────────────────────────────────────
//
//   • **A click id** — hard evidence. Google matched this lead to an ad it served.
//   • **"How did you hear about us?"** — what the CUSTOMER picked from a dropdown. Self-reported.
//   • **"Which ad did they mention?"** — what STAFF remember from a phone call.
//
// Flattening these into one "source" line is how a half-remembered phone conversation ends up carrying
// the same weight as a gclid. Only the third is editable here: letting staff overwrite the customer's own
// answer would turn a self-report into a staff opinion while keeping the name of a self-report.
import { useCallback, useEffect, useState } from 'react';

interface Data {
  howHeard: string | null;
  mentionedAd: string | null;
  mentionedAdBy: string | null;
  mentionedAdAt: string | null;
  utmCampaign: string | null;
  source: string | null;
  hasClickId: boolean;
}

interface Props { leadId: string }

export default function AttributionCard({ leadId }: Props): React.ReactElement {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/attribution`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const json = await res.json() as Data;
      setData(json); setDraft(json.mentionedAd ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load attribution.');
    } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/attribution`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentionedAd: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally { setSaving(false); }
  }, [leadId, draft, load]);

  const dirty = (data?.mentionedAd ?? '') !== draft;

  return (
    <div className="ac">
      <h3 className="ac__title">Where they came from</h3>

      {loading ? <p className="ac__muted">Loading…</p> : data ? (
        <>
          <ul className="ac__list">
            <li>
              <span className={`ac__tag ${data.hasClickId ? 'ac__tag--hard' : 'ac__tag--none'}`}>
                {data.hasClickId ? 'ad click' : 'no click'}
              </span>
              {data.hasClickId
                ? <>Matched to a Google Ads click{data.utmCampaign ? <> · <strong>{data.utmCampaign}</strong></> : null}.</>
                : <>No click id. This lead cannot be matched to an ad by Google, whatever else we know.</>}
            </li>
            <li>
              <span className="ac__tag ac__tag--soft">they said</span>
              {data.howHeard
                ? <><strong>{data.howHeard}</strong> <em className="ac__note">— their own answer on the form</em></>
                : <em className="ac__note">They did not answer &ldquo;How did you hear about us?&rdquo;</em>}
            </li>
            <li>
              <span className="ac__tag ac__tag--soft">we noted</span>
              {data.mentionedAd
                ? <>
                    <strong>{data.mentionedAd}</strong>
                    {data.mentionedAdBy && (
                      <em className="ac__note"> — {data.mentionedAdBy}
                        {data.mentionedAdAt ? `, ${new Date(data.mentionedAdAt).toLocaleDateString()}` : ''}</em>
                    )}
                  </>
                : <em className="ac__note">Nothing recorded from a call.</em>}
            </li>
          </ul>

          <label htmlFor={`ac-${leadId}`} className="ac__label">
            Which ad did they mention?
          </label>
          <div className="ac__row">
            <input
              id={`ac-${leadId}`}
              type="text"
              value={draft}
              maxLength={300}
              onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
              placeholder={data.hasClickId ? 'Not needed — we have the click' : 'e.g. "saw the Facebook post about boundary surveys"'}
              data-testid="mentioned-ad-input"
            />
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} data-testid="mentioned-ad-save">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && !dirty && <span className="ac__ok">Saved.</span>}
          </div>
          <p className="ac__hint">
            Internal only — never sent to Google. A recollection of a conversation is a useful dimension
            for our own reading of the funnel, and it is not a conversion signal.
            {data.hasClickId && ' This lead already has a click id, which is stronger evidence than anything typed here.'}
          </p>
        </>
      ) : <p className="ac__muted">No attribution data.</p>}

      {error && <p className="ac__error" role="alert">{error}</p>}

      <style jsx>{`
        .ac { padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
        .ac__title { font-size: 1rem; margin: 0 0 10px; font-weight: 600; }
        .ac__muted { color: #6b7280; font-size: 0.86rem; margin: 0; }
        .ac__error { color: #991b1b; font-size: 0.86rem; }
        .ac__list { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 7px; font-size: 0.87rem; }
        .ac__list li { display: flex; gap: 9px; align-items: baseline; flex-wrap: wrap; }
        .ac__tag { flex: 0 0 auto; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em;
          padding: 2px 7px; border-radius: 99px; background: #f3f4f6; color: #4b5563; }
        .ac__tag--hard { background: #dcfce7; color: #14532d; }
        .ac__tag--soft { background: #fef3c7; color: #78350f; }
        .ac__tag--none { background: #f3f4f6; color: #6b7280; }
        .ac__note { color: #6b7280; font-style: normal; }
        .ac__label { display: block; font-weight: 600; font-size: 0.82rem; margin-bottom: 5px; }
        .ac__row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .ac__row input { flex: 1 1 260px; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px;
          font: inherit; min-height: 40px; }
        .ac__row button { padding: 8px 14px; border-radius: 8px; border: 1px solid #1d3095; background: #1d3095;
          color: #fff; font: inherit; cursor: pointer; min-height: 40px; }
        .ac__row button:disabled { opacity: 0.45; cursor: not-allowed; }
        .ac__ok { color: #065f46; font-size: 0.84rem; }
        .ac__hint { color: #6b7280; font-size: 0.79rem; margin: 8px 0 0; }
      `}</style>
    </div>
  );
}
