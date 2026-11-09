'use client';
// app/admin/components/media/TranscriptPanel.tsx — a video's transcript beside it: every word timed,
// searchable, and a click away from that moment in the video.
//
// Owner, 2026-11-09: "I want to transcribe videos and have time stamps for the words … there needs
// to be a way to search the transcript for key words … fence types, where power poles sit and how
// they connect to each other and buildings, where utilities and features and improvements are, and
// other anomalies. We need to be able to search the transcript for each instance of a word/phrase."
//
//   Search  → every instance, listed with its time and the words around it; ↑ ↓ (or Enter /
//             Shift+Enter) step through them, and each one jumps the video there.
//   Read    → the whole transcript in lines, the word being spoken lit up; click any word to go to it.
//
// Data: GET/POST /api/admin/files/[id]/transcript. Search runs here, on the words
// (lib/transcripts/model.ts searchTranscript).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, ChevronUp, ChevronDown, FileAudio, RefreshCw, AlertTriangle, X } from 'lucide-react';
import {
  searchTranscript, activeWordIndex, hitContext, transcriptLines,
  type TranscriptWord, type TranscriptHit,
} from '@/lib/transcripts/model';
import { formatClock } from '@/lib/viewers/video-memory';
import './TranscriptPanel.css';

interface Row {
  status: 'processing' | 'done' | 'failed';
  words: TranscriptWord[];
  duration_seconds: number | null;
  error: string | null;
  completed_at: string | null;
}

export interface TranscriptPanelProps {
  fileId: string;
  /** Where the video is now, to light up the word being spoken. */
  currentTime: number;
  /** Jump the video to a time (seconds). */
  onSeek: (seconds: number) => void;
}

/** Start a little before a hit, so the sentence it is in is heard from its start. */
const LEAD_IN = 0.4;

export default function TranscriptPanel({ fileId, currentTime, onSeek }: TranscriptPanelProps) {
  const [row, setRow] = useState<Row | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/files/${encodeURIComponent(fileId)}/transcript`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRow(json.transcript ?? null);
      setConfigured(json.configured !== false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { setLoading(true); setRow(null); void load(); }, [load]);

  // Started somewhere else (another tab, another person): look again until it lands.
  useEffect(() => {
    if (row?.status !== 'processing' || busy) return;
    const t = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(t);
  }, [row?.status, busy, load]);

  const transcribe = async () => {
    setBusy(true);
    setError(null);
    setRow((r) => (r ? { ...r, status: 'processing' } : { status: 'processing', words: [], duration_seconds: null, error: null, completed_at: null }));
    try {
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRow(json.transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      void load();
    } finally {
      setBusy(false);
    }
  };

  // ── search ──
  const words = useMemo(() => row?.words ?? [], [row]);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchTranscript(words, query), [words, query]);
  const [at, setAt] = useState(0);
  // Enter goes to the first match, then the next each time; a new search starts over.
  const jumped = useRef(false);
  useEffect(() => { setAt(0); jumped.current = false; }, [query]);
  const hitWords = useMemo(() => {
    const s = new Set<number>();
    for (const h of hits) for (let i = h.index; i < h.index + h.count; i++) s.add(i);
    return s;
  }, [hits]);
  const goHit = useCallback((i: number) => {
    if (hits.length === 0) return;
    const k = ((i % hits.length) + hits.length) % hits.length;
    jumped.current = true;
    setAt(k);
    onSeek(Math.max(0, hits[k].start - LEAD_IN));
    document.getElementById(`tp-hit-${k}`)?.scrollIntoView({ block: 'nearest' });
  }, [hits, onSeek]);

  // ── reading ──
  const lines = useMemo(() => transcriptLines(words), [words]);
  const active = useMemo(() => activeWordIndex(words, currentTime), [words, currentTime]);
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!follow || active < 0) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-w="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, follow]);

  if (loading) return <aside className="tp" aria-label="Transcript"><p className="tp__status"><Loader2 size={15} className="fv-spin motion-essential" aria-hidden="true" /> Loading transcript…</p></aside>;

  return (
    <aside className="tp" aria-label="Transcript">
      <div className="tp__head">
        <h3 className="tp__title"><FileAudio size={14} aria-hidden="true" /> Transcript</h3>
        {row?.status === 'done' ? (
          <button type="button" className="tp__link" onClick={() => void transcribe()} disabled={busy} title="Transcribe this video again">
            <RefreshCw size={12} aria-hidden="true" /> Redo
          </button>
        ) : null}
      </div>

      {error ? <p className="tp__error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {error}</p> : null}

      {!row || (row.status === 'failed' && !busy) ? (
        <div className="tp__empty">
          {row?.status === 'failed' && row.error ? <p className="tp__error"><AlertTriangle size={14} aria-hidden="true" /> Last attempt failed: {row.error}</p> : null}
          <p>Turn what was said in this video into text, with the time of every word, so you can search it.</p>
          <button type="button" className="tp__btn" onClick={() => void transcribe()} disabled={!configured || busy} data-testid="tp-transcribe">
            {row?.status === 'failed' ? 'Try again' : 'Transcribe this video'}
          </button>
          {!configured ? <p className="tp__hint">Transcription isn&apos;t set up on the server yet (DEEPGRAM_API_KEY).</p> : null}
        </div>
      ) : null}

      {row?.status === 'processing' ? (
        <p className="tp__status" role="status"><Loader2 size={15} className="fv-spin motion-essential" aria-hidden="true" /> Transcribing… most videos take under a minute. You can keep watching.</p>
      ) : null}

      {row?.status === 'done' ? (
        <>
          <div className="tp__search">
            <Search size={14} aria-hidden="true" className="tp__search-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); goHit(e.shiftKey ? at - 1 : (jumped.current ? at + 1 : at)); }
                if (e.key === 'ArrowDown') { e.preventDefault(); goHit(at + 1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); goHit(at - 1); }
                if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
              }}
              placeholder="Search: chain link, power pole, meter…"
              aria-label="Search the transcript"
              data-testid="tp-search"
            />
            {query ? <button type="button" className="tp__clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} aria-hidden="true" /></button> : null}
          </div>
          {query ? (
            <div className="tp__nav">
              <span aria-live="polite" data-testid="tp-count">{hits.length === 0 ? 'No matches' : `${at + 1} of ${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`}</span>
              <button type="button" className="tp__icon" onClick={() => goHit(at - 1)} disabled={hits.length === 0} aria-label="Previous match" title="Previous (↑ or Shift+Enter)"><ChevronUp size={15} aria-hidden="true" /></button>
              <button type="button" className="tp__icon" onClick={() => goHit(at + 1)} disabled={hits.length === 0} aria-label="Next match" title="Next (↓ or Enter)"><ChevronDown size={15} aria-hidden="true" /></button>
            </div>
          ) : null}
          {query && hits.length > 0 ? (
            <ol className="tp__hits">
              {hits.map((h: TranscriptHit, i) => {
                const c = hitContext(words, h);
                return (
                  <li key={h.index}>
                    <button type="button" id={`tp-hit-${i}`} className={`tp__hit${i === at ? ' tp__hit--on' : ''}`} onClick={() => goHit(i)}>
                      <span className="tp__time">{formatClock(h.start)}</span>
                      <span className="tp__ctx">{c.lead} <mark>{c.match}</mark> {c.tail}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}

          <div className="tp__body-head">
            <span>{words.length ? `${words.length.toLocaleString()} words${row.duration_seconds ? ` · ${formatClock(row.duration_seconds)}` : ''}` : 'No speech was found in this video.'}</span>
            <label className="tp__follow"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow video</label>
          </div>
          <div className="tp__body" ref={bodyRef}>
            {lines.map((ln) => (
              <p key={ln.from} className="tp__line">
                <button type="button" className="tp__stamp" onClick={() => onSeek(ln.start)}>{formatClock(ln.start)}</button>
                {words.slice(ln.from, ln.to).map((w, k) => {
                  const i = ln.from + k;
                  return (
                    <React.Fragment key={i}>
                      <span
                        data-w={i}
                        className={`tp__w${i === active ? ' tp__w--now' : ''}${hitWords.has(i) ? ' tp__w--hit' : ''}`}
                        onClick={() => onSeek(w.s)}
                        title={formatClock(w.s)}
                      >{w.w}</span>{' '}
                    </React.Fragment>
                  );
                })}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </aside>
  );
}
