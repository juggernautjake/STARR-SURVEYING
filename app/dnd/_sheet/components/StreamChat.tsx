'use client'
// Streamer chat overlay (Phase J3) — a fake Twitch-style chat that scrolls live on
// the sheet while the character is "live" (J2 state). It spawns ambient chatter from
// the procedural username crowd (J1) at the DM's chat speed. DM-sent lines (J4) and AI
// spam (J5) will feed in on top of this; polls/events (J7/J9) layer in later.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { makeUsernames, type ChatUser } from '@/lib/dnd/stream-names'
import { parseEmotes } from '@/lib/dnd/stream-emotes'
import { allowedInMode, modeIntervalFactor, formatModAction, type ChatMode, type ModActionType, CHAT_MODES } from '@/lib/dnd/stream-mod'
import { computeInfluence, resistDC } from '@/lib/dnd/stream-influence'
import InfluenceMeter from './InfluenceMeter'
import { useLiveEngagement } from './useLiveEngagement'
import { useChar } from '../state/store'
import { rollD20 } from '../lib/dice'
import { abilityMod } from '../rules/dnd'
import { postRoll } from '@/app/dnd/_ui/RollFeed'

interface StreamState { is_live: boolean; chat_speed: number; viewer_count: number; engagement?: number }
interface Line { id: number | string; user: ChatUser; body: string; system?: boolean }

function hasEmote(body: string): boolean {
  return parseEmotes(body).some((s) => s.type === 'emote')
}

// Big emoji pool — chat leans HARD on emojis (per design).
const EMOJIS = ['🔥', '💀', '😂', '😭', '🎉', '⚔️', '🐉', '🎲', '👑', '✨', '🤣', '😱', '💯', '🙌', '👀', '🗿', '🧠', '🫡', '😎', '🥶', '💥', '⭐', '🎯', '🛡️', '🤯', '🥵', '😹', '🫠', '👏', '🚀', '💜', '🤪', '👽', '🛸', '🧙', '⚡', '🍿', '📈', '📉', '🤠']

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Build one chat line's body: a phrase with a heavy sprinkle of emojis, and every so
// often a pure-spam burst (repeated emoji / hype word).
function makeBody(): string {
  if (Math.random() < 0.16) {
    const reps = 3 + Math.floor(Math.random() * 7)
    const token = Math.random() < 0.6 ? rand(EMOJIS) : rand(['LETS GOOO', 'SPAM', 'POG', 'W', 'HYPE', 'AAAAA'])
    return Array.from({ length: reps }, () => token).join(' ')
  }
  let body = rand(PHRASES)
  const n = Math.floor(Math.random() * 4) // 0–3 trailing emojis
  for (let i = 0; i < n; i++) body += ' ' + rand(EMOJIS)
  if (Math.random() < 0.3) body = rand(EMOJIS) + ' ' + body // sometimes lead with one too
  return body
}

// Ambient chatter — kept clean (SFW). A mix of current slang, classic/old-school memes,
// D&D table reactions, and some "alien language" gibberish that pops in now and then.
const PHRASES = [
  // current slang / newer memes
  'LMAO', 'lets gooo', 'W', 'L', 'no cap', 'based', 'sheeeesh', 'bussin', 'it', 'W dm',
  'certified W', 'ratio', 'L + ratio', 'touch grass', 'he cooked', 'let him cook', 'cooked',
  'goated', 'mid tbh', 'peak fiction', 'actual cinema', 'we are so back', 'its so over',
  'caught in 4k', 'canon event', 'npc behavior', 'main character energy', 'understood the assignment',
  'vibe check passed', 'aura +1000', 'that is crazy aura', 'he is HIM', 'she is HER', 'unc status',
  'new response just dropped', 'chat we won', 'chat we lost', 'holy hell', 'fr fr', 'on god',
  'deadass', 'no shot', 'down bad', 'slay', 'the rizz is immaculate', 'skibidi roll', 'sigma move',
  // classic / old-school memes (clean)
  'POGGERS', 'Pog', 'PogChamp', 'KEKW', 'OMEGALUL', 'monkaS', 'PepeLaugh', 'FeelsGoodMan',
  'FeelsBadMan', '5Head', 'big brain play', 'EZ Clap', 'GIGACHAD', 'copium', 'hopium', 'malding',
  'this is fine', 'such roll. many crit. wow', 'over 9000!!', 'leeroy jenkinsss', 'one does not simply',
  'shut up and take my money', 'y u no crit', 'not bad', 'first', 'clip it', 'clip it and ship it',
  'mods asleep post frogs', 'do a barrel roll', 'the cake is a lie', 'all your base', 'press F',
  // D&D table reactions
  'F', 'o7', 'nat 20 lets goooo', 'NAT ONE LMAO', 'roll for it', 'roll initiative!!', '+2 to that',
  'rip the bard', 'not the goblins again', 'they DIED??', 'GG', 'GG ez', 'run it back', 'hold up',
  'no wayyy', 'chat is this real?', 'this DM is cracked', 'dm went crazy with that one', 'loot it',
  'inspiration dice babyyy', 'that is a crit fail', 'crit that goblin', 'save vs charm challenge',
  'the wizard is cooking', 'rogue sneak attack lets go', 'cleric save us', 'tavern brawl incoming',
  // "alien language" gibberish (clean)
  'zorp gl!bnak', 'xhel toth vroom', 'blrgh na kai', 'quztl keverne', 'vrr naktal', 'sk thara zzz',
  'bloop znak morp', 'grxnthal!!', 'yeet vix qua', 'n gai n gai thakl', 'oomox thrapl', 'vex ka droon',
  'zizzl pop wubwub', 'kra thok mal vess', 'flooble crank', 'meep morp zeep', 'nyoom blblbl',
  'thplt hkkk vao', 'za za glorp', 'wubba wub nak', 'skree onk onk', 'glorptax has spoken',
  // more current slang / reactions
  'yapping', 'lock in', 'he is locked in', 'crash out', 'she crashed out', 'cooked him', 'ate that up',
  'no because', 'not the', 'the way she', 'be so fr', 'lowkey fire', 'highkey cooked', 'delulu',
  'it is giving', 'not giving', 'ate and left no crumbs', 'devious', 'nefarious', 'goofy ahh',
  'chat is this loss', 'chat explain', 'chat do something', 'save her chat', 'we cooking today',
  'first time?', 'oh he mad', 'she is unwell', 'get him', 'let her cook', 'respectfully insane',
  'this is peak', 'holy skibidi', 'gyatt', 'rizzler', 'the ohio experience', 'so demure', 'mindful',
  'buffering irl', 'clip that NOW', 'that was clean', 'insane gameplay', 'W streamer', 'L take chat',
  // more D&D table energy
  'ROLL FOR IT', 'nat 20 pog', 'crit fail LMAO', 'the dice hate her', 'blessed dice', 'cursed dice',
  'cast fireball', 'just cast fireball', 'why no fireball', 'attack the darkness', 'i attack the merchant',
  'loot the body', 'search for traps', 'i cast detect chat', 'roll perception', 'roll a save',
  'the bard is flirting again', 'not the tavern', 'kill the goblin', 'pet the goblin', 'romance arc?',
  'DM is cooking', 'DM said no', 'rules lawyer incoming', 'that is not RAW', 'homebrew moment',
  'she needs a long rest', 'short rest chat', 'out of spell slots oh no', 'hex him', 'eldritch blast him',
  // hype / spam-ish
  'PANIC', 'AAAAAA', 'SHEEEESH', 'GOOOO', 'LFG', 'LFGGG', 'nooo', 'YESSS', 'omg omg', 'HYPERS',
  'raid raid raid', 'sub hype', 'donate to save her', 'mods do something', 'where mods', 'copium refill',
  // more alien gibberish
  'blorbo fren shik', 'nak nak vroom', 'zzt zzt kaplow', 'oomf skree tak', 'vwoop vwoop na',
  'grbl mrbl florb', 'ket ket zoon', 'plip plop zharn', 'yeeb norb quazz', 'shloop da woop',
]

export default function StreamChat({ characterId, campaignId, initialStream }: { characterId: string; campaignId?: string | null; initialStream?: StreamState }) {
  const { char, pb, commitRoll, isDM } = useChar()
  const { boost, bumpChat } = useLiveEngagement(characterId, campaignId ?? null)
  const [stream, setStream] = useState<StreamState | null>(initialStream ?? null)
  const [lines, setLines] = useState<Line[]>([])
  const [resist, setResist] = useState<{ text: string; ok: boolean } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  // Whether the feed is scrolled (near) to the bottom — only then do we auto-follow new
  // lines, so reading back-scroll isn't yanked away and the PAGE never scrolls.
  const stickRef = useRef(true)
  const crowdRef = useRef<ChatUser[]>([])
  const idRef = useRef(0)
  const seenRef = useRef<Set<string>>(new Set())
  // ── Floating dock (draggable + resizable, like the dice tray) ──────────────────
  const dockRef = useRef<HTMLDivElement>(null)
  const dragOff = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 360, h: 420 })
  // J10 moderation: active chat mode + banned handles (both DM-controlled, live).
  const [chatMode, setChatMode] = useState<ChatMode>('off')
  const [banned, setBanned] = useState<Set<string>>(new Set())
  // Viewer-facing speed control — any viewer (player or DM) can speed up / slow down
  // the chat in their own view. Multiplies the DM's base chat_speed; 0.25×…4×.
  const [localSpeed, setLocalSpeed] = useState(1)

  // Poll the stream state (live toggle + speed) unless a fixed state was injected.
  useEffect(() => {
    if (initialStream || !characterId) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop && j?.stream) setStream(j.stream) })
        .catch(() => {})
    load()
    const t = setInterval(load, 8000)
    return () => { stop = true; clearInterval(t) }
  }, [characterId, initialStream])

  // Ambient chatter while live. Deliberately self-paced + bursty for realism: instead
  // of a fixed interval, each tick emits a random-sized cluster (often 1–3, sometimes a
  // 10–14 flood) and schedules the next tick after a randomized gap — so you get "ten
  // fast, a pause, three, one, a pause, six, fourteen at once", etc.
  //
  // IMPORTANT: the viewer_count is a VANITY number only — it does NOT change throughput.
  // A quadrillion viewers looks huge but the real chat rate stays capped (≤ ~200/min),
  // scaled only by the DM's chat_speed × the viewer's own localSpeed (and slow-mode).
  useEffect(() => {
    if (!stream?.is_live) return
    if (crowdRef.current.length === 0) crowdRef.current = makeUsernames(200)
    let stop = false
    let timer: ReturnType<typeof setTimeout>

    const MAX_PER_MIN = 200
    const speedFactor = ((stream.chat_speed ?? 3) / 3) * localSpeed // ~1 at defaults
    const targetPerMin = Math.min(MAX_PER_MIN, 45 * speedFactor) / modeIntervalFactor(chatMode)
    const perSec = Math.max(0.25, targetPerMin / 60) // avg messages/sec (drives the gaps)

    const tick = () => {
      if (stop) return
      // Cluster size: usually small, occasionally a big flood.
      const r = Math.random()
      const burst =
        r < 0.55 ? 1 + Math.floor(Math.random() * 3) : // 1–3 (common)
        r < 0.85 ? 3 + Math.floor(Math.random() * 5) : // 3–7
        r < 0.97 ? 6 + Math.floor(Math.random() * 6) : // 6–11
        10 + Math.floor(Math.random() * 5)             // 10–14 (rare flood)

      const crowd = crowdRef.current
      const batch = Array.from({ length: burst }, () => ({ id: idRef.current++, user: crowd[Math.floor(Math.random() * crowd.length)], body: makeBody() }))
        .filter((l) => !banned.has(l.user.name) && allowedInMode({ badges: l.user.badges, hasEmote: hasEmote(l.body) }, chatMode))
      if (batch.length) { setLines((m) => [...m, ...batch].slice(-80)); bumpChat(batch.length) }

      // Gap so that (this burst) / gap ≈ perSec on average, then randomized hard so the
      // pacing feels human: sometimes a rapid cluster, sometimes a noticeable pause.
      let gap = (burst / perSec) * 1000 * (0.4 + Math.random() * 1.4)
      if (Math.random() < 0.25) gap *= 0.3 // rapid-fire cluster
      if (Math.random() < 0.12) gap += 800 + Math.random() * 1800 // a lull
      timer = setTimeout(tick, Math.max(120, gap))
    }
    timer = setTimeout(tick, 300)
    return () => { stop = true; clearTimeout(timer) }
  }, [stream?.is_live, stream?.chat_speed, chatMode, banned, localSpeed, bumpChat])

  // Clear (J6): the DM's "Clear chat" wipes the visible feed on this client too.
  useEffect(() => {
    const onClear = (e: Event) => {
      if ((e as CustomEvent).detail === characterId) {
        // Keep seenRef so already-seen persisted rows can't be re-appended by a poll that
        // races the DELETE; just wipe what's on screen. New messages get fresh ids.
        setLines([])
      }
    }
    window.addEventListener('dnd-stream-clear', onClear)
    return () => window.removeEventListener('dnd-stream-clear', onClear)
  }, [characterId])

  // Moderation (J10): the DM's chat-mode + timeout/ban actions arrive on a broadcast
  // channel (other viewers) and a window event (the DM's own client). A mod action
  // pushes a system line into the feed and bans/unbans the handle.
  useEffect(() => {
    if (!characterId) return
    const pushSystem = (body: string) =>
      setLines((m) => [...m, { id: `sys-${idRef.current++}`, user: { name: 'Moderator', color: '#e0a83a', badges: ['mod'] }, body, system: true }].slice(-60))
    const applyAction = (type: ModActionType, username: string) => {
      setBanned((prev) => {
        const next = new Set(prev)
        if (type === 'unban') next.delete(username)
        else next.add(username)
        return next
      })
      pushSystem(formatModAction(type, username))
    }
    const ch = supabase
      .channel(`dnd:stream:${characterId}:mod`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'mode' }, (m) => setChatMode((m.payload as { mode?: ChatMode })?.mode ?? 'off'))
      .on('broadcast', { event: 'action' }, (m) => {
        const p = m.payload as { type?: ModActionType; username?: string }
        if (p?.type && p.username) applyAction(p.type, p.username)
      })
      .subscribe()
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; kind?: string; mode?: ChatMode; type?: ModActionType; username?: string }
      if (d?.characterId !== characterId) return
      if (d.kind === 'mode' && d.mode) setChatMode(d.mode)
      else if (d.kind === 'action' && d.type && d.username) applyAction(d.type, d.username)
    }
    window.addEventListener('dnd-stream-mod', onLocal)
    return () => { window.removeEventListener('dnd-stream-mod', onLocal); void supabase.removeChannel(ch) }
  }, [characterId])

  // Poll persisted lines (DM-sent J4 + AI spam J5) and weave them into the feed.
  useEffect(() => {
    if (!stream?.is_live || !characterId) return
    let stop = false
    const poll = () =>
      fetch(`/api/dnd/characters/${characterId}/stream/messages?limit=50`)
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .then((j) => {
          if (stop) return
          const fresh = (j.messages ?? []).filter((m: { id: string }) => !seenRef.current.has(m.id))
          if (fresh.length === 0) return
          fresh.forEach((m: { id: string }) => seenRef.current.add(m.id))
          bumpChat(fresh.length)
          setLines((prev) => [
            ...prev,
            ...fresh.map((m: { id: string; username: string; body: string; color: string | null; badges: string[] | null }) => ({
              id: `p-${m.id}`,
              user: { name: m.username, color: m.color ?? '#fff', badges: m.badges ?? [] },
              body: m.body,
            })),
          ].slice(-60))
        })
        .catch(() => {})
    poll()
    const t = setInterval(poll, 2500)
    return () => { stop = true; clearInterval(t) }
  }, [stream?.is_live, characterId, bumpChat])

  // Authoritative visibility pass (J10): system lines always show; everything else is
  // gated by the ban list + the active mode, so changing a mode/ban re-filters the feed.
  const visibleLines = useMemo(
    () => lines.filter((l) => l.system || (!banned.has(l.user.name) && allowedInMode({ badges: l.user.badges, hasEmote: hasEmote(l.body) }, chatMode))),
    [lines, banned, chatMode],
  )

  // Auto-follow new lines by scrolling the FEED CONTAINER only (never the page) — and
  // only when the reader is already near the bottom, so scrolling up to read holds.
  useEffect(() => {
    const el = feedRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [visibleLines])
  const onFeedScroll = () => {
    const el = feedRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  // Restore saved dock position/size/minimized state (per character).
  const dockKey = characterId ? `dnd-stream-dock:${characterId}` : null
  useEffect(() => {
    if (!dockKey) return
    try {
      const raw = localStorage.getItem(dockKey)
      if (!raw) return
      const saved = JSON.parse(raw) as { pos?: { x: number; y: number } | null; size?: { w: number; h: number }; open?: boolean }
      if (saved.size) setSize(saved.size)
      if (saved.pos) setPos(saved.pos)
      if (typeof saved.open === 'boolean') setOpen(saved.open)
    } catch { /* ignore bad saved state */ }
  }, [dockKey])
  useEffect(() => {
    if (!dockKey) return
    try { localStorage.setItem(dockKey, JSON.stringify({ pos, size, open })) } catch { /* quota */ }
  }, [dockKey, pos, size, open])

  // Keep the dock on-screen when the window shrinks.
  useEffect(() => {
    const onResize = () =>
      setPos((p) => (p ? { x: Math.min(p.x, window.innerWidth - 80), y: Math.min(p.y, window.innerHeight - 44) } : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Drag from the header. Converts a corner-anchored dock to explicit left/top first
  // (same trick as the dice tray) so it moves 1:1 with the pointer.
  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return
    const el = dockRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    dragOff.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    setPos({ x: r.left, y: r.top })
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }
  const onDragMove = (e: PointerEvent) => {
    if (!dragOff.current) return
    const el = dockRef.current
    const w = el?.offsetWidth ?? size.w
    const x = Math.min(window.innerWidth - w - 6, Math.max(6, e.clientX - dragOff.current.dx))
    const y = Math.min(window.innerHeight - 44, Math.max(6, e.clientY - dragOff.current.dy))
    setPos({ x, y })
  }
  const onDragEnd = () => {
    dragOff.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }

  // Resize from the bottom-right handle. Anchors the dock to explicit left/top first so
  // the top-left corner stays put while the bottom-right grows.
  const MIN_W = 260, MIN_H = 240
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = dockRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!pos) setPos({ x: r.left, y: r.top })
    resizeRef.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeEnd)
  }
  const onResizeMove = (e: PointerEvent) => {
    const s = resizeRef.current
    if (!s) return
    const w = Math.max(MIN_W, Math.min(window.innerWidth - 12, s.w + (e.clientX - s.x)))
    const h = Math.max(MIN_H, Math.min(window.innerHeight - 12, s.h + (e.clientY - s.y)))
    setSize({ w, h })
  }
  const onResizeEnd = () => {
    resizeRef.current = null
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', onResizeEnd)
  }

  if (!stream?.is_live) return null
  const modeMeta = CHAT_MODES.find((m) => m.id === chatMode)

  // Live engagement = DM floor + decaying activity boost (J13). Drives both the meter
  // and the resist DC so donations/raids/reactions momentarily make her harder to resist.
  const viewers = stream.viewer_count ?? 0
  const effEngagement = Math.min(100, (stream.engagement ?? 50) + boost)
  const resistDc = resistDC(computeInfluence(viewers, effEngagement))

  // "Resist the chat" — a proficient Wisdom (willpower) save vs the patron's current DC.
  // Posts to the sheet log + the shared roll feed, and flashes a result banner.
  const rollResist = () => {
    const mod = abilityMod(char.abilities.wis) + pb
    const r = rollD20(mod, 'flat')
    const ok = r.total >= resistDc
    const label = `Resist the Chat (DC ${resistDc})`
    const tag = ok ? 'RESISTED' : 'GAVE IN'
    commitRoll({ label, kind: 'save', total: r.total, breakdown: r.breakdown, crit: r.crit, fumble: r.fumble, tag })
    setResist({ ok, text: ok ? `✊ RESISTED! ${r.total} vs DC ${resistDc}` : `😵 GAVE IN… ${r.total} vs DC ${resistDc}` })
    setTimeout(() => setResist(null), 5000)
    if (campaignId) {
      void postRoll({ campaignId, characterId, actorName: char.meta.name, label, result: r.total, breakdown: r.breakdown, crit: r.crit, fumble: r.fumble })
    }
  }

  // Minimized → a pulsing FAB (mirrors the dice tray) that reopens the chat.
  if (!open) {
    return (
      <button className="stream-fab" onClick={() => setOpen(true)} title="Open stream chat">
        💬
        <span className="stream-fab-dot" />
      </button>
    )
  }

  const dockStyle: React.CSSProperties = {
    position: 'fixed',
    width: size.w,
    height: size.h,
    ...(pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : { right: 20, bottom: 20 }),
  }

  return (
    <div className="stream-dock" ref={dockRef} style={dockStyle}>
      <div className="stream-dock-head" onPointerDown={onDragStart} title="Drag to move">
        <span className="sd-live">● LIVE</span>
        <span className="sd-count">{viewers.toLocaleString()} watching</span>
        {chatMode !== 'off' && modeMeta && (
          <span className="sd-mode">{modeMeta.icon} {modeMeta.label}</span>
        )}
        <button className="sd-min" onClick={() => setOpen(false)} title="Minimize chat">▾</button>
      </div>

      <div className="stream-dock-tools">
        <label className="sd-speed" title="Chat speed (your view only)">
          🐢
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={localSpeed}
            onChange={(e) => setLocalSpeed(Number(e.target.value))}
          />
          🐇 {localSpeed}×
        </label>
        {isDM && (
          <button
            className="sd-resist"
            onClick={rollResist}
            title="Roll a Wisdom save to resist what chat is demanding"
          >
            🎲 Resist · DC {resistDc}
          </button>
        )}
      </div>

      {resist && (
        <div className={`sd-resist-banner ${resist.ok ? 'ok' : 'bad'}`} role="status">
          {resist.text}
        </div>
      )}

      <div className="stream-dock-body">
        <div className="stream-feed" data-stream-feed="" ref={feedRef} onScroll={onFeedScroll}>
          {visibleLines.length === 0 ? (
            <p style={{ color: 'var(--muted, #9aa)', fontSize: 12 }}>Chat is warming up…</p>
          ) : (
            visibleLines.map((l) => l.system ? (
              <div key={l.id} style={{ wordBreak: 'break-word', color: '#f0c46a', fontStyle: 'italic', fontSize: 12, padding: '2px 0' }}>
                {l.body}
              </div>
            ) : (
              <div key={l.id} style={{ wordBreak: 'break-word' }}>
                {l.user.badges.map((b) => (
                  <span key={b} title={b} style={{ display: 'inline-block', fontSize: 9, padding: '0 3px', marginRight: 3, borderRadius: 3, background: b === 'mod' ? '#00ad03' : b === 'vip' ? '#e005b9' : b === 'prime' ? '#4d6bff' : '#8205b4', color: '#fff', verticalAlign: 'middle' }}>{b[0].toUpperCase()}</span>
                ))}
                <span style={{ color: l.user.color, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{l.user.name}</span>
                <span style={{ color: 'var(--muted, #9aa)' }}>: </span>
                <span style={{ color: '#f2effa' }}>
                  {parseEmotes(l.body).map((seg, i) =>
                    seg.type === 'emote' ? (
                      <span key={i} title={seg.name} style={{ display: 'inline-block', padding: '0 2px', margin: '0 1px', borderRadius: 3, background: 'rgba(200,155,60,0.18)' }}>{seg.glyph}</span>
                    ) : (
                      <span key={i}>{seg.value}</span>
                    ),
                  )}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        <InfluenceMeter viewers={viewers} engagement={effEngagement} />
      </div>

      <div className="stream-resize" onPointerDown={onResizeStart} title="Drag to resize">⤡</div>
    </div>
  )
}
