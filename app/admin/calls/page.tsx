'use client';
// /admin/calls — every call to the business line, newest first.
//
// ── TWO LOGS, NOT ONE LOG WITH A FILTER (owner, 2026-09-21) ─────────────────────────────────────
//
// "I want you to keep test call recordings and live call recordings seperate on the website. That
// way we aren't seeing test calls mixed in with real calls."
//
// Test calls used to be a seventh chip in the same row as "Voicemail" and "Missed", which made them
// look like a kind of customer call. They are not: they are rehearsals, and mixing them into the
// log a person works from is how a fictional caller ends up being rung back.
//
// So the scope is a separate control above everything else, it is part of the QUERY rather than a
// client-side hide, and it is in the URL. The query part matters: fetching 200 rows and hiding half
// shows 100 live calls while claiming 200, and the oldest silently fall off the end.
//
// ── THE SEARCH NARROWS ON THE SERVER AND RANKS IN THE BROWSER ───────────────────────────────────
//
// "we need a search bar in the recorded calls page so that we can look up names and addresses and
// key words … This should be dynamic. It should primarily filter by location and name."
//
// Postgres finds the rows; `searchCalls` orders them so a name match sits above a passing mention
// in a transcript. Debounced at 250 ms, so a five-letter name is one request rather than five, and
// mirrored into `?search=` so a result can be linked to — which the caller registry has been
// waiting for.
import '../styles/AdminCalls.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import { searchCalls, matchedFields, type MatchField } from '@/lib/receptionist/call-search';
import type { PhoneCall } from '@/lib/receptionist/calls';
import { VERDICT_LABEL, isJunkCall, wasScreened } from '@/lib/receptionist/screening-labels';
import { placeOf } from '@/lib/receptionist/area-codes';

type Filter = 'real' | 'all' | 'customer' | 'ai' | 'owner' | 'voicemail' | 'none' | 'screened';
type Week = { total: number; real: number; screened: number; blocked: number; robocalls: number; silent: number; fromAds?: number; fromSite?: number };
type Scope = 'live' | 'test';

function when(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}
function fmtPhone(e164: string): string {
  const d = (e164 ?? '').replace(/\D/g, '');
  return d.length === 11 ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}
function dur(s: number | null): string {
  if (!s) return '';
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
const HOW: Record<string, string> = { owner: 'Hank answered', ai: 'Receptionist', voicemail: 'Voicemail', none: 'Missed', blocked: 'Blocked' };

/** Verdicts worth a pill on the card; a real person or an unclear call needs no label. */
const JUNK_PILL = new Set(['robocall', 'silent', 'spam']);

/** What to call a match, so the list can say why a call is in it. */
const WHERE: Record<MatchField, string> = {
  name: 'name',
  address: 'address',
  phone: 'number',
  email: 'email',
  service: 'service',
  summary: 'summary',
  voicemail: 'voicemail',
  transcript: 'transcript',
};

export default function CallsPage(): React.ReactElement {
  const [calls, setCalls] = useState<PhoneCall[] | null>(null);
  const [health, setHealth] = useState<{ warn: boolean; statement: string } | null>(null);
  // Real calls first (owner, 2026-10-06): robocalls, silent calls and screened calls with no message
  // are one tap away under "Screened & blocked", not in the way.
  const [filter, setFilter] = useState<Filter>('real');
  const [week, setWeek] = useState<Week | null>(null);
  const [scope, setScope] = useState<Scope>('live');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const { reportPageError } = usePageError('CallsPage');
  const firstLoad = useRef(true);

  // Read the opening state out of the URL, so a linked result opens on that result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('search') ?? '';
    if (q) { setSearch(q); setDebounced(q); }
    if (params.get('scope') === 'test') setScope('test');
  }, []);

  // 250 ms: long enough that a five-letter name is one request, short enough to feel immediate.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Mirror into the URL without adding a history entry per keystroke — `replaceState`, not `push`.
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    if (debounced) params.set('search', debounced); else params.delete('search');
    if (scope === 'test') params.set('scope', 'test'); else params.delete('scope');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [debounced, scope]);

  useEffect(() => {
    let alive = true;
    setCalls(null);
    const params = new URLSearchParams({ limit: '200', scope });
    if (debounced) params.set('search', debounced);
    fetch(`/api/admin/calls?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { calls?: PhoneCall[]; error?: string; health?: { warn: boolean; statement: string } | null; week?: Week | null }) => {
        if (!alive) return;
        if (j.error) reportPageError(j.error);
        setCalls(j.calls ?? []);
        setHealth(j.health ?? null);
        setWeek(j.week ?? null);
      })
      .catch((e: Error) => { if (alive) reportPageError(e); });
    return () => { alive = false; };
  }, [reportPageError, scope, debounced]);

  const shown = useMemo(() => {
    if (!calls) return [];
    // The answered-by chips narrow within whichever log is open. `is_test` is not consulted here at
    // all any more — the scope decided that, in the query.
    // A test call has no verdict, so "Real calls" shows the whole test log.
    const byFilter = filter === 'all' || (filter === 'real' && scope === 'test')
      ? calls
      : filter === 'real'
        ? calls.filter((c) => !isJunkCall(c))
        : filter === 'screened'
          ? calls.filter((c) => wasScreened(c) || isJunkCall(c))
          : filter === 'customer'
            ? calls.filter((c) => c.kind === 'customer' || c.analysis?.caller_type === 'customer' || c.analysis?.caller_type === 'existing_client')
            : calls.filter((c) => c.answered_by === filter && !isJunkCall(c));
    // Ranked in the browser: the server found the rows, this decides which one is most likely the
    // call somebody had in mind.
    return searchCalls(byFilter, debounced);
  }, [calls, filter, debounced, scope]);

  const clearSearch = useCallback(() => { setSearch(''); setDebounced(''); }, []);

  const junkCount = useMemo(() => (calls ?? []).filter((c) => wasScreened(c) || isJunkCall(c)).length, [calls]);
  const filters: Array<[Filter, string]> = [
    ['real', 'Real calls'], ['customer', 'Customers'], ['ai', 'Receptionist'],
    ['owner', 'Hank answered'], ['voicemail', 'Voicemail'], ['none', 'Missed'],
    ...(scope === 'live' ? [['screened', `Screened & blocked${junkCount ? ` (${junkCount})` : ''}`] as [Filter, string]] : []),
    ['all', 'Everything'],
  ];

  return (
    <div className="calls-page">
      <div className="calls-page__head">
        <div>
          <h1 className="calls-page__title">{scope === 'test' ? 'Test calls' : 'Calls'}</h1>
          <p className="calls-page__sub">
            {scope === 'test'
              ? 'Rehearsals from the receptionist test bench. Nobody here is a real customer.'
              : 'Every call to the business line. Click one to listen, read the transcript, and turn it into a lead or project.'}
          </p>
        </div>
        <Link href="/admin/calls/registry" className="calls-page__testbtn" data-testid="calls-registry-link">
          Numbers →
        </Link>
        <Link href="/admin/calls/blocked" className="calls-page__testbtn" data-testid="calls-blocked-link">
          Blocked numbers →
        </Link>
        <Link href="/admin/dev/receptionist" className="calls-page__testbtn" data-testid="calls-test-link">
          Test the receptionist →
        </Link>
      </div>

      {/* ── ARE CALLERS TALKING TO THE RECEPTIONIST? (2026-09-29) ──────────────────────────────────
          The owner found this by reading the log by hand: a week of "Receptionist" calls with nobody
          on them. The page says so itself now. See lib/receptionist/call-outcome.ts. */}
      {scope === 'live' && health?.warn ? (
        <p className="calls-page__health" role="alert" data-testid="calls-agent-health">
          <b>Callers are not staying on the line with the receptionist.</b> {health.statement}{' '}
          <Link href="/admin/dev/receptionist">Receptionist settings →</Link>
        </p>
      ) : null}

      {/* The week at a glance: is the screening keeping junk off the phone, and nothing else? */}
      {scope === 'live' && week && week.total > 0 ? (
        <p className="calls-page__week" data-testid="calls-week">
          <b>Last 7 days:</b> {week.total} {week.total === 1 ? 'call' : 'calls'} · {week.real} real
          {week.screened ? ` · ${week.screened} screened to voicemail` : ''}
          {week.blocked ? ` · ${week.blocked} blocked` : ''}
          {week.robocalls ? ` · ${week.robocalls} robocall${week.robocalls === 1 ? '' : 's'}` : ''}
          {week.silent ? ` · ${week.silent} silent` : ''}
          {week.fromAds ? ` · ${week.fromAds} from Google ads` : ''}
          {week.fromSite ? ` · ${week.fromSite} from the website` : ''}
        </p>
      ) : null}

      {/* The scope sits above everything and looks like a switch between two places, because that
          is what it is. A chip in the filter row read as "a kind of call". */}
      <div className="calls-page__scope" role="group" aria-label="Which call log">
        {([['live', 'Live calls'], ['test', 'Test calls']] as Array<[Scope, string]>).map(([s, label]) => (
          <button
            key={s}
            type="button"
            className="calls-page__scopebtn"
            aria-pressed={scope === s}
            data-testid={`calls-scope-${s}`}
            onClick={() => setScope(s)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="calls-page__searchrow">
        <div className="calls-page__searchbox">
          <Search size={15} aria-hidden />
          <input
            id="calls-search"
            type="search"
            className="calls-page__search"
            data-testid="calls-search"
            placeholder="Search a name, an address, a number, or any word said on the call"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search calls"
          />
          {search && (
            <button
              type="button"
              className="calls-page__searchclear"
              onClick={clearSearch}
              data-testid="calls-clear-search"
              aria-label="Clear the search"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <div className="calls-page__filters" role="group" aria-label="Filter calls">
          {filters.map(([f, label]) => (
            <button key={f} type="button" className="calls-page__filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      </div>

      {calls === null ? (
        <p className="call-panel__empty">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__title">
            {debounced ? `Nothing matches “${debounced}”` : scope === 'test' ? 'No test calls yet' : 'No calls yet'}
          </div>
          <div className="admin-empty__desc">
            {debounced
              ? 'The search looks at names, addresses, numbers, emails, summaries and the words spoken on the call. Try a shorter term, or clear it to see everything.'
              : scope === 'test'
                ? 'Calls you place from the receptionist test bench appear here, kept apart from real customers.'
                : 'Calls to the business line show up here as they happen, with the recording and transcript once the call ends.'}
          </div>
        </div>
      ) : (
        <div className="calls-list">
          {shown.map((c) => {
            const w = when(c.started_at);
            const attention = !isJunkCall(c) && ((c.analysis?.urgency === 'high') || (c.answered_by === 'none'));
            const hits = debounced ? matchedFields(c, debounced) : [];
            return (
              <Link key={c.id} href={`/admin/calls/${c.id}`} className={`call-card${attention ? ' call-card--attention' : ''}`}>
                <div className="call-card__when">{w.day}<br />{w.time}</div>
                <div>
                  <p className="call-card__title">
                    {c.caller_name || fmtPhone(c.from_number)}
                    {c.caller_name ? <span className="call-card__number"> · {fmtPhone(c.from_number)}</span> : null}
                    {/* Where the number is from — "Illinois", "Toll-free" — so a run of out-of-state
                        silent calls is visible in the list without opening each one. */}
                    {placeOf(c.from_number) !== 'Unknown' ? <span className="call-card__number"> · {placeOf(c.from_number)}</span> : null}
                  </p>
                  <p className="call-card__summary">{c.analysis?.summary || c.summary || (c.transcript?.length ? c.transcript[0]?.text : 'No transcript yet.')}</p>
                  <div className="call-card__meta">
                    {c.is_test ? <span className="pill pill--test">Test</span> : null}
                    {c.kind ? <span className={`pill pill--${c.kind}`}>{c.kind}</span> : null}
                    {c.answered_by ? <span className={`pill pill--${c.answered_by}`}>{HOW[c.answered_by] ?? c.answered_by}</span> : null}
                    {c.source === 'google_ads' ? <span className="pill pill--ad" title={c.source_detail ?? undefined}>Google ad</span>
                      : c.source === 'website' ? <span className="pill" title={c.source_detail ?? undefined}>From website</span> : null}
                    {c.screened_as === 'voicemail' ? <span className="pill pill--screened" title={c.screen_reason ?? undefined}>Screened</span> : null}
                    {c.caller_verdict && JUNK_PILL.has(c.caller_verdict) && c.answered_by !== 'blocked'
                      ? <span className={`pill pill--v-${c.caller_verdict}`} title={c.verdict_reason ?? undefined}>{VERDICT_LABEL[c.caller_verdict]}</span>
                      : null}
                    {c.analysis?.urgency === 'high' ? <span className="pill pill--high">urgent</span> : null}
                    {c.lead_id ? <span className="pill">lead</span> : null}
                    {c.recording_url ? <span className="pill">recording</span> : null}
                    {/* Why this call is in the results. Without it a transcript match looks like a
                        mistake, because nothing visible on the card contains the search term. */}
                    {hits.length > 0 && (
                      <span className="pill pill--match">matched {hits.map((h) => WHERE[h]).join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="call-card__side">
                  <span>{dur(c.duration_seconds)}</span>
                  {c.service ? <span>{c.service}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
