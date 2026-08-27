'use client';
// BackgroundCard — public-web background on a lead, before you ring them back. §I3.1
//
// Whoever makes the call has a name, maybe a company, and an address. They do not know whether they
// are about to speak to a builder with a live permit or a homeowner in a fence dispute — and those
// two calls should not sound the same.
//
// ── IT DOES NOT LOAD ITSELF ─────────────────────────────────────────────────────────────────────
//
// Every other card on this page fetches on mount. This one waits for a click, because it spends a
// third-party search. Opening a lead to check a phone number should not bill a lookup, and most
// leads never need one. The button is the signal that the lookup is worth doing.
//
// ── AN EMPTY RESULT MEANS FOUR DIFFERENT THINGS ─────────────────────────────────────────────────
//
// So this branches on `status`, never on `signals.length`. "We searched and this is an ordinary
// enquiry" is a genuinely useful answer; "no search key is configured" is not an answer at all, and
// rendering them the same way is how a blank gets read as a clean record. Same failure as the
// address autocomplete, one floor up.
//
// Everything here is UNVERIFIED and INTERNAL. The sources are links because the point is to click
// them and judge — not to read a signal as something the system established.
import { useCallback, useState } from 'react';

type Status = 'searched' | 'not-configured' | 'insufficient-lead' | 'search-failed';

interface Signal {
  kind: string;
  note: string;
  confidence: 'weak' | 'moderate' | 'strong';
  sources: Array<{ url: string; title: string; authority: number }>;
}

interface Data {
  status: Status;
  signals: Signal[];
  briefing: string;
  subject: { ownerName?: string; address?: string; county?: string } | null;
}

/** What the office should do about each status, in the office's words rather than the API's. */
const STATUS_COPY: Record<Status, { tone: 'ok' | 'warn' | 'off'; text: string }> = {
  searched: { tone: 'ok', text: 'Searched the public web. Unverified — click through before relying on any of it.' },
  'not-configured': { tone: 'off', text: 'Not searched: no search key is configured. This is a blank, not a clean record.' },
  'insufficient-lead': { tone: 'off', text: 'Not searched: this enquiry carried no company, name or address to search.' },
  'search-failed': { tone: 'warn', text: 'The search provider did not answer. Try again — this is not "nothing found".' },
};

const KIND_LABEL: Record<string, string> = {
  'commercial-operator': 'Business',
  'active-permit': 'Live permit',
  'subdivision-activity': 'Subdivision',
  'dispute-context': 'Dispute',
  'encumbrance-context': 'Encumbrance',
};

interface Props { leadId: string }

export default function BackgroundCard({ leadId }: Props): React.ReactElement {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/enrichment`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the background check.');
    } finally { setLoading(false); }
  }, [leadId]);

  const status = data ? STATUS_COPY[data.status] : null;

  return (
    <div className="bg">
      <h2 className="bg__title">Background</h2>

      {!data && !loading && (
        <p className="bg__muted">
          Public-web background on this lead — permits, plats, disputes, and whether they trade as a
          business. Runs a search when you ask for one.
        </p>
      )}

      {!data && (
        <button type="button" className="bg__run" onClick={() => void run()} disabled={loading} data-testid="run-background">
          {loading ? 'Searching…' : 'Look them up'}
        </button>
      )}

      {status && (
        <p className={`bg__status bg__status--${status.tone}`} role="status">{status.text}</p>
      )}

      {data?.subject && (data.subject.ownerName || data.subject.address) && (
        <p className="bg__subject">
          {data.subject.ownerName && <><strong>Searched:</strong> {data.subject.ownerName}</>}
          {data.subject.ownerName && data.subject.address && ' · '}
          {data.subject.address && <>{data.subject.address}</>}
        </p>
      )}

      {data && data.signals.length === 0 && data.status === 'searched' && (
        // Not a failure, and worth saying out loud — most enquiries are ordinary ones, and knowing
        // that nothing turned up IS the answer when the search actually ran.
        <p className="bg__muted">Nothing notable turned up. Treat as an ordinary enquiry.</p>
      )}

      {data && data.signals.length > 0 && (
        <ul className="bg__list">
          {data.signals.map((s, i) => (
            <li key={`${s.kind}-${i}`} className="bg__item">
              <div className="bg__head">
                <span className="bg__kind">{KIND_LABEL[s.kind] ?? s.kind}</span>
                <span className={`bg__conf bg__conf--${s.confidence}`}>{s.confidence}</span>
              </div>
              <p className="bg__note">{s.note}</p>
              <ul className="bg__srcs">
                {s.sources.map((src, j) => (
                  <li key={j}>
                    {src.url
                      ? <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title || src.url}</a>
                      : <em>{src.title}</em>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {data && (
        <button type="button" className="bg__again" onClick={() => void run()} disabled={loading}>
          {loading ? 'Searching…' : 'Search again'}
        </button>
      )}

      {error && <p className="bg__error" role="alert">{error}</p>}

      <style jsx>{`
        .bg { padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
        .bg__title { font-size: 1rem; margin: 0 0 10px; font-weight: 600; }
        .bg__muted { color: #6b7280; font-size: 0.86rem; margin: 0 0 10px; }
        .bg__error { color: #991b1b; font-size: 0.86rem; margin: 10px 0 0; }
        .bg__run, .bg__again { padding: 8px 14px; border-radius: 8px; border: 1px solid #1d3095;
          background: #1d3095; color: #fff; font: inherit; cursor: pointer; min-height: 40px; }
        .bg__again { margin-top: 12px; background: #fff; color: #1d3095; }
        .bg__run:disabled, .bg__again:disabled { opacity: 0.45; cursor: not-allowed; }
        .bg__status { font-size: 0.82rem; margin: 0 0 10px; padding: 7px 10px; border-radius: 8px; }
        .bg__status--ok { background: #eff6ff; color: #1e3a8a; }
        .bg__status--warn { background: #fef3c7; color: #78350f; }
        .bg__status--off { background: #f3f4f6; color: #4b5563; }
        .bg__subject { font-size: 0.84rem; color: #4b5563; margin: 0 0 12px; }
        .bg__list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
        .bg__item { border-left: 3px solid #e5e7eb; padding-left: 11px; }
        .bg__head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
        .bg__kind { font-weight: 600; font-size: 0.87rem; }
        .bg__conf { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.03em;
          padding: 2px 7px; border-radius: 99px; }
        .bg__conf--strong { background: #dcfce7; color: #14532d; }
        .bg__conf--moderate { background: #fef3c7; color: #78350f; }
        .bg__conf--weak { background: #f3f4f6; color: #6b7280; }
        .bg__note { font-size: 0.85rem; color: #374151; margin: 0 0 5px; }
        .bg__srcs { list-style: none; padding: 0; margin: 0; display: grid; gap: 3px; font-size: 0.79rem; }
        .bg__srcs a { color: #1d3095; }
        .bg__srcs em { color: #6b7280; font-style: normal; }
      `}</style>
    </div>
  );
}
