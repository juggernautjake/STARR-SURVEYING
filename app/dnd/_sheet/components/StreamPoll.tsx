'use client'
// DM-directed "chat decides" poll overlay.
//
// Susie (owner) proposes a poll from her chat box (see StreamPollCreate) → it appears here as
// PENDING. Andrew (the DM / isController) sees a slider panel: he sets each option's percentage
// (auto-balanced to total 100), the total vote count is scaled from the live viewer count
// (≥25% turnout), and he submits. The poll then goes OPEN and votes trickle in over ~60s,
// interpolated from opened_at so every viewer sees the same fill. Highest % wins. When the
// minute is up the result is highlighted with each option's % + vote count, a chime alerts the
// streamer, and generated chat revolves around the poll for 5 minutes (until the DM changes the
// AI-focus topic). Sync is 3s HTTP polling + a local time ticker for the trickle.
import { useCallback, useEffect, useRef, useState } from 'react'
import { pollConclude } from '../lib/audio'

interface Poll {
  id: string
  question: string
  options: string[]
  votes: Record<string, number>
  status: 'pending' | 'open' | 'closed'
  result: string | null
  target_percentages: Record<string, number>
  total_votes: number
  opened_at: string | null
}

const TRICKLE_MIN_MS = 30_000
const TRICKLE_MAX_MS = 60_000
const STEER_MS = 5 * 60_000 // generated chat revolves around the poll for five minutes
const MIN_TURNOUT = 0.25 // at least a quarter of viewers vote on every poll

// How long this poll's votes take to fill in (30–60s). Derived from the poll id
// rather than Math.random() ON PURPOSE: every viewer runs this independently, so a
// random draw would give each client a different duration and the bars would drift
// apart. Hashing the id means everyone computes the same window from the same
// `opened_at`, and the fill stays in lockstep across the whole audience.
function trickleMsFor(pollId: string): number {
  let h = 0
  for (let i = 0; i < pollId.length; i++) h = (h * 31 + pollId.charCodeAt(i)) >>> 0
  return TRICKLE_MIN_MS + (h % (TRICKLE_MAX_MS - TRICKLE_MIN_MS + 1))
}

// Compact vanity-scale formatting: 1.2K / 3.4M / 5.6B / 7.8T / 9.0Q.
function fmt(n: number): string {
  const abs = Math.abs(n)
  const units: [number, string][] = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [v, s] of units) if (abs >= v) return `${(n / v).toFixed(n / v >= 100 ? 0 : 1).replace(/\.0$/, '')}${s}`
  return String(Math.round(n))
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export default function StreamPoll({
  characterId, isController, isOwner, campaignId, initialPoll,
}: {
  characterId: string
  isController: boolean
  isOwner?: boolean
  campaignId?: string
  initialPoll?: Poll | null
}) {
  const [poll, setPoll] = useState<Poll | null>(initialPoll ?? null)
  const [now, setNow] = useState(() => Date.now())
  // Controller collapsed the floating direction panel; a fresh poll re-opens it.
  const [dismissed, setDismissed] = useState(false)
  const closingRef = useRef(false)
  const chimedRef = useRef<string | null>(null)
  const steerTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const steerFor = useRef<string | null>(null)

  // ── Poll fetch: 3s cadence + instant refetch on the shared stream-poll event ──
  useEffect(() => {
    if (!characterId) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream/polls`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop) setPoll(j?.poll ?? null) })
        .catch(() => {})
    if (!initialPoll) load()
    const t = setInterval(load, 3000)
    const onEvt = () => load()
    window.addEventListener('dnd-stream-poll', onEvt)
    return () => { stop = true; clearInterval(t); window.removeEventListener('dnd-stream-poll', onEvt) }
  }, [characterId, initialPoll])

  // ── Local time ticker: drives the vote trickle + conclusion while a poll is open ──
  useEffect(() => {
    if (poll?.status !== 'open') return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [poll?.status, poll?.id])

  // ── Steer the AI chat director to talk about the poll for 5 minutes (controller only) ──
  const stopSteer = useCallback(() => {
    if (steerTimer.current) { clearInterval(steerTimer.current); steerTimer.current = null }
    steerFor.current = null
  }, [])

  const startSteering = useCallback((directive: string, pollId: string) => {
    if (!isController) return
    stopSteer()
    steerFor.current = pollId
    const until = Date.now() + STEER_MS
    // Point the persisted AI focus at the poll (this also suppresses ambient chatter and gives
    // us the "until Andrew changes the topic" behaviour for free — a new focus overwrites it).
    fetch(`/api/dnd/characters/${characterId}/stream`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusTopic: directive, focusUntil: new Date(until).toISOString(), focusIntensity: 3 }),
    }).catch(() => {})
    const fire = (count: number) =>
      fetch(`/api/dnd/characters/${characterId}/stream/direct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive, count }),
      }).then(() => window.dispatchEvent(new Event('dnd-stream-poll'))).catch(() => {})
    fire(5) // kick it off immediately
    steerTimer.current = setInterval(async () => {
      if (Date.now() >= until) { stopSteer(); return }
      // Stop early if the DM has taken the focus somewhere else.
      try {
        const s = await fetch(`/api/dnd/characters/${characterId}/stream`).then((r) => (r.ok ? r.json() : null))
        if (s?.stream?.focus_topic !== directive) { stopSteer(); return }
      } catch { /* keep going */ }
      fire(4)
    }, 22_000)
  }, [characterId, isController, stopSteer])

  useEffect(() => () => stopSteer(), [stopSteer]) // clear on unmount

  // Reset per-poll refs when a fresh poll id appears.
  useEffect(() => {
    closingRef.current = false
    setDismissed(false) // a new poll always re-opens the panel
    if (poll && steerFor.current && steerFor.current !== poll.id) stopSteer()
  }, [poll?.id, stopSteer])

  const submitDirection = useCallback(async (percentages: Record<string, number>, totalVotes: number, directive: string) => {
    if (!poll) return
    const res = await fetch(`/api/dnd/characters/${characterId}/stream/polls`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId: poll.id, percentages, totalVotes }),
    }).then((r) => r.json()).catch(() => null)
    if (res?.poll) {
      setPoll(res.poll); setNow(Date.now())
      window.dispatchEvent(new Event('dnd-stream-poll'))
      startSteering(directive, res.poll.id)
    }
    return res
  }, [poll, characterId, startSteering])

  // ── Derived trickle / conclusion state (poll-null-safe so hooks below stay unconditional) ──
  const openedMs = poll?.opened_at ? new Date(poll.opened_at).getTime() : 0
  const elapsed = openedMs ? now - openedMs : 0
  const trickleMs = poll ? trickleMsFor(poll.id) : TRICKLE_MAX_MS
  const frac = poll?.status === 'open' && openedMs ? Math.min(1, Math.max(0, elapsed / trickleMs)) : (poll?.status === 'closed' ? 1 : 0)
  const concluded = poll?.status === 'closed' || (poll?.status === 'open' && frac >= 1)

  // Controller closes the poll server-side once the minute elapses (so late joiners see it done).
  useEffect(() => {
    if (poll && isController && poll.status === 'open' && frac >= 1 && !closingRef.current) {
      closingRef.current = true
      fetch(`/api/dnd/characters/${characterId}/stream/polls`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId: poll.id, action: 'close' }),
      }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.poll) setPoll(j.poll) }).catch(() => {})
    }
  }, [isController, poll?.status, poll?.id, frac, characterId])

  // Chime the streamer once, the moment the poll concludes.
  useEffect(() => {
    if (poll && concluded && isOwner && chimedRef.current !== poll.id) {
      chimedRef.current = poll.id
      pollConclude()
    }
  }, [concluded, isOwner, poll?.id])

  if (!poll) return null

  // ── PENDING: DM sees the slider panel; everyone else sees a "waiting" card ──
  if (poll.status === 'pending') {
    // The controller's panel FLOATS. It used to render inline at the very bottom of the
    // sheet, below every tab and the dice tray, with nothing to announce it — so a poll
    // could sit pending forever because the DM never scrolled down to find it (owner
    // report 2026-07-19). Pinned bottom-left (the chat dock owns bottom-right) and
    // collapsible, so it's unmissable without being in the way.
    if (isController) {
      return (
        <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 60, width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
          {dismissed ? (
            <button
              type="button" onClick={() => setDismissed(false)}
              style={{ padding: '10px 14px', background: '#c8aa6e', color: '#1a1206', border: 'none', borderRadius: 4, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}
            >
              🎛️ Poll waiting on you
            </button>
          ) : (
            <div style={{ boxShadow: '0 6px 22px rgba(0,0,0,0.5)', borderRadius: 4 }}>
              <DirectionPanel poll={poll} characterId={characterId} onSubmit={submitDirection} onHide={() => setDismissed(true)} />
            </div>
          )}
        </div>
      )
    }
    return (
      <section className="card" style={{ marginTop: 12, borderColor: '#c8aa6e' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#c8aa6e', marginBottom: 6 }}>📊 POLL PROPOSED</div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{poll.question}</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {poll.options.map((o) => (
            <div key={o} style={{ border: '1px solid var(--line, rgba(255,255,255,0.15))', padding: '5px 8px', fontSize: 13 }}>{o}</div>
          ))}
        </div>
        <div style={{ marginTop: 8, textAlign: 'center', color: 'var(--muted, #9aa)', fontSize: 12 }}>Waiting for the call…</div>
      </section>
    )
  }

  // ── OPEN (trickling) / CLOSED (concluded): the vote bars ──
  const finalVotes = poll.options.map((o) => poll.votes?.[o] ?? 0)
  const shown = finalVotes.map((v) => Math.round(v * (concluded ? 1 : easeOut(frac))))
  const shownTotal = Math.max(1, shown.reduce((a, b) => a + b, 0))
  const winner = poll.result

  return (
    <section className="card" style={{ marginTop: 12, borderColor: concluded ? '#0ac8b9' : '#c8aa6e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: concluded ? '#0ac8b9' : '#c8aa6e' }}>
          📊 CHAT POLL{concluded ? ' — RESULTS' : ' — LIVE'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted, #9aa)' }}>
          {concluded ? `${fmt(poll.total_votes)} votes` : `${fmt(shownTotal)} voting…`}
        </span>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{poll.question}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {poll.options.map((opt, i) => {
          const pct = concluded ? (poll.target_percentages?.[opt] ?? Math.round((shown[i] / shownTotal) * 100)) : Math.round((shown[i] / shownTotal) * 100)
          const win = concluded && winner === opt
          return (
            <div key={opt} style={{ position: 'relative', border: `1px solid ${win ? '#0ac8b9' : 'var(--line, rgba(255,255,255,0.15))'}`, padding: '6px 9px', overflow: 'hidden', borderRadius: 3 }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: win ? 'rgba(10,200,185,0.35)' : 'rgba(200,155,60,0.22)', transition: 'width 0.4s ease' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: win ? 700 : 400 }}>{win ? '👑 ' : ''}{opt}</span>
                <span style={{ color: 'var(--muted, #9aa)', whiteSpace: 'nowrap' }}>
                  <b style={{ color: win ? '#0ac8b9' : 'inherit' }}>{pct}%</b>
                  <span style={{ opacity: 0.75 }}> · {fmt(shown[i])}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {concluded && winner && (
        <div style={{ marginTop: 10, textAlign: 'center', color: '#0ac8b9', fontWeight: 700, fontSize: 15 }}>
          👑 Chat decided: {winner}!
        </div>
      )}
      {!concluded && (
        <div style={{ marginTop: 8, textAlign: 'center', color: 'var(--muted, #9aa)', fontSize: 12 }}>
          Votes trickling in… {Math.max(0, Math.ceil((trickleMs - elapsed) / 1000))}s
        </div>
      )}
    </section>
  )
}

// ── The DM's outcome console: sliders (auto-balanced to 100%) + a viewer-scaled total ──
function DirectionPanel({
  poll, characterId, onSubmit, onHide,
}: {
  poll: Poll
  characterId: string
  onSubmit: (percentages: Record<string, number>, totalVotes: number, directive: string) => Promise<unknown>
  onHide?: () => void
}) {
  const opts = poll.options
  // Start from an even split that sums to exactly 100.
  const [pcts, setPcts] = useState<number[]>(() => {
    const base = Math.floor(100 / opts.length)
    const arr = new Array(opts.length).fill(base)
    arr[0] += 100 - base * opts.length
    return arr
  })
  const [viewers, setViewers] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Turnout is fixed once per poll so the preview and the submitted total agree.
  const turnoutRef = useRef(MIN_TURNOUT + Math.random() * 0.2) // 25%–45% of viewers vote

  useEffect(() => {
    fetch(`/api/dnd/characters/${characterId}/stream`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setViewers(Math.max(0, Number(j?.stream?.viewer_count) || 0)))
      .catch(() => {})
  }, [characterId])

  // Move slider i to value v and rebalance the others so the set still totals 100.
  function setSlider(i: number, vRaw: number) {
    setPcts((prev) => {
      const v = Math.max(0, Math.min(100, Math.round(vRaw)))
      const others = prev.map((p, idx) => (idx === i ? 0 : p))
      const otherSum = others.reduce((a, b) => a + b, 0)
      const remain = 100 - v
      const next = prev.map((p, idx) => {
        if (idx === i) return v
        if (otherSum <= 0) return Math.round(remain / (prev.length - 1)) // spread evenly if others were 0
        return Math.round((p / otherSum) * remain)
      })
      // Fix rounding drift on a non-active slider so the total is exactly 100.
      const drift = 100 - next.reduce((a, b) => a + b, 0)
      if (drift !== 0) {
        const j = next.findIndex((_, idx) => idx !== i)
        if (j >= 0) next[j] = Math.max(0, next[j] + drift)
      }
      return next
    })
  }

  const total = Math.floor(viewers * turnoutRef.current)
  const sum = pcts.reduce((a, b) => a + b, 0)
  const leadIdx = pcts.reduce((best, v, i) => (v > pcts[best] ? i : best), 0)

  async function submit() {
    setErr(null); setSubmitting(true)
    const percentages = Object.fromEntries(opts.map((o, i) => [o, pcts[i]]))
    const directive =
      `Susie's stream chat is running a LIVE POLL. Question: "${poll.question}". ` +
      `Options: ${opts.join(' | ')}. The winning answer is "${opts[leadIdx]}". Write short, punchy ` +
      `Twitch-style chat lines where viewers react to this poll — hype or argue for their favorite ` +
      `option by name, spam their pick, and react to it being close or one-sided. Stay in-world.`
    const res = (await onSubmit(percentages, total, directive)) as { error?: string } | null
    if (res?.error) { setErr(res.error); setSubmitting(false) }
    // On success the poll flips to 'open' and this panel unmounts.
  }

  return (
    <section className="card" style={{ marginTop: 12, borderColor: '#c8aa6e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: '#c8aa6e' }}>🎛️ DIRECT THE POLL (DM)</span>
        {onHide && (
          <button type="button" onClick={onHide} title="Collapse — the poll stays pending" aria-label="Collapse"
            style={{ background: 'none', border: 'none', color: 'var(--muted, #9aa)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>▾</button>
        )}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{poll.question}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {opts.map((opt, i) => (
          <div key={opt}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
              <span style={{ fontWeight: i === leadIdx ? 700 : 400 }}>{i === leadIdx ? '👑 ' : ''}{opt}</span>
              <span style={{ color: '#c8aa6e', fontWeight: 700 }}>{pcts[i]}% · {fmt(Math.round((total * pcts[i]) / 100))}</span>
            </div>
            <input
              type="range" min={0} max={100} value={pcts[i]}
              onChange={(e) => setSlider(i, Number(e.target.value))}
              style={{ width: '100%', accentColor: '#c8aa6e' }}
              aria-label={`${opt} percentage`}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted, #9aa)' }}>
        <span>Total: <b style={{ color: sum === 100 ? '#0ac8b9' : '#e06' }}>{sum}%</b></span>
        <span>{fmt(total)} votes · {Math.round(turnoutRef.current * 100)}% of {fmt(viewers)} viewers</span>
      </div>
      {viewers === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#e0a020' }}>Set a viewer count in the stream controls so votes can scale.</div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 12, color: '#e06' }}>{err}</div>}
      <button
        type="button" disabled={submitting || sum !== 100}
        onClick={submit}
        style={{ marginTop: 10, width: '100%', padding: '8px 0', background: '#c8aa6e', color: '#1a1206', border: 'none', borderRadius: 4, fontWeight: 800, cursor: submitting || sum !== 100 ? 'default' : 'pointer', opacity: submitting || sum !== 100 ? 0.6 : 1 }}
      >
        {submitting ? 'Releasing…' : 'Submit & release poll'}
      </button>
    </section>
  )
}
