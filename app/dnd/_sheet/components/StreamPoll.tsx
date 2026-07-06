'use client'
// "Chat decides" poll overlay (Phase J7) — shows the DM's active stream poll with the
// (simulated) chat vote filling in, then resolves with a result banner. The controller
// (DM/owner) client tallies the sim after a few seconds and closes the poll server-side
// so every viewer sees the same winner.
import { useEffect, useRef, useState } from 'react'

interface Poll { id: string; question: string; options: string[]; votes: Record<string, number>; status: string; result: string | null }

export default function StreamPoll({ characterId, isController, initialPoll }: { characterId: string; isController: boolean; initialPoll?: Poll | null }) {
  const [poll, setPoll] = useState<Poll | null>(initialPoll ?? null)
  const [sim, setSim] = useState<number[]>(initialPoll ? new Array(initialPoll.options.length).fill(0) : [])
  const simRef = useRef<number[]>([])
  const closingRef = useRef(false)
  simRef.current = sim

  useEffect(() => {
    if (initialPoll || !characterId) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream/polls`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop) setPoll(j?.poll ?? null) })
        .catch(() => {})
    load()
    const t = setInterval(load, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [characterId, initialPoll])

  // Reset the sim when a fresh open poll appears.
  useEffect(() => {
    if (poll?.status === 'open') { setSim(new Array(poll.options.length).fill(0)); closingRef.current = false }
  }, [poll?.id, poll?.status, poll?.options.length])

  // Simulate the chat voting while the poll is open; the controller closes it after ~8s.
  useEffect(() => {
    if (poll?.status !== 'open') return
    let ticks = 0
    const t = setInterval(() => {
      ticks++
      setSim((s) => {
        const n = s.length ? [...s] : new Array(poll.options.length).fill(0)
        const bumps = 3 + Math.floor(Math.random() * 8)
        for (let i = 0; i < bumps; i++) n[Math.floor(Math.random() * n.length)]++
        return n
      })
      if (ticks >= 16 && isController && !closingRef.current) {
        closingRef.current = true
        const counts = simRef.current
        const winIdx = counts.reduce((best, v, i) => (v > counts[best] ? i : best), 0)
        const votes = Object.fromEntries(poll.options.map((o, i) => [o, counts[i] ?? 0]))
        fetch(`/api/dnd/characters/${characterId}/stream/polls`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId: poll.id, votes, result: poll.options[winIdx], status: 'closed' }),
        }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.poll) setPoll(j.poll) }).catch(() => {})
      }
    }, 500)
    return () => clearInterval(t)
  }, [poll?.id, poll?.status, poll?.options, isController, characterId])

  if (!poll || (poll.status === 'closed' && !poll.result)) return null

  const closed = poll.status === 'closed'
  const counts = closed ? poll.options.map((o) => poll.votes?.[o] ?? 0) : sim
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0))

  return (
    <section className="card" style={{ marginTop: 12, borderColor: closed ? '#0ac8b9' : undefined }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#c8aa6e', marginBottom: 6 }}>📊 CHAT POLL{closed ? ' — CLOSED' : ''}</div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{poll.question}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {poll.options.map((opt, i) => {
          const pct = Math.round(((counts[i] ?? 0) / total) * 100)
          const win = closed && poll.result === opt
          return (
            <div key={opt} style={{ position: 'relative', border: '1px solid var(--line, rgba(255,255,255,0.15))', padding: '5px 8px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: win ? 'rgba(10,200,185,0.35)' : 'rgba(200,155,60,0.22)', transition: 'width 0.4s ease' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{win ? '👑 ' : ''}{opt}</span>
                <span style={{ color: 'var(--muted, #9aa)' }}>{pct}%</span>
              </div>
            </div>
          )
        })}
      </div>
      {closed && (
        <div style={{ marginTop: 8, textAlign: 'center', color: '#0ac8b9', fontWeight: 700 }}>
          Chat decided: {poll.result}!
        </div>
      )}
    </section>
  )
}
