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
import { viewerDC, resolveDC, chatRatePerSec, fluctuateViewers } from '@/lib/dnd/stream-influence'
import { buildMoodPool } from '@/lib/dnd/stream-moods'
import { formatNuggets } from '@/lib/dnd/stream-currency'
import InfluenceMeter from './InfluenceMeter'
import { useLiveEngagement } from './useLiveEngagement'
import { useChar } from '../state/store'
import { rollD20 } from '../lib/dice'
import { abilityMod } from '../rules/dnd'
import { postRoll } from '@/app/dnd/_ui/RollFeed'

interface StreamState { is_live: boolean; chat_speed: number; viewer_count: number; engagement?: number; moods?: string[]; ai_mood_lines?: Record<string, string[]>; dc_mode?: 'auto' | 'manual'; dc_manual?: number | null; kibbles_earned?: number }
interface Line { id: number | string; user: ChatUser; body: string; system?: boolean; kind?: string; amount?: number | null; senderId?: string | null }

function hasEmote(body: string): boolean {
  return parseEmotes(body).some((s) => s.type === 'emote')
}

// Big emoji pool — chat leans HARD on emojis (per design).
const EMOJIS = ['🔥', '💀', '😂', '😭', '🎉', '⚔️', '🐉', '👑', '✨', '🤣', '😱', '💯', '🙌', '👀', '🗿', '🧠', '🫡', '😎', '🥶', '💥', '⭐', '🛡️', '🤯', '🥵', '😹', '🫠', '👏', '🚀', '💜', '🤪', '👽', '🛸', '⚡', '🍿', '📈', '📉', '🤠']

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Build one chat line's body from the active phrase pool (default, or mood-biased): a
// phrase with a heavy sprinkle of emojis, and every so often a pure-spam burst (repeated
// emoji / hype word). The pool is chosen by the DM's selected moods (see buildMoodPool).
function makeBody(pool: readonly string[]): string {
  if (Math.random() < 0.16) {
    const reps = 3 + Math.floor(Math.random() * 7)
    const token = Math.random() < 0.6 ? rand(EMOJIS) : rand(['LETS GOOO', 'SPAM', 'POG', 'W', 'HYPE', 'AAAAA'])
    return Array.from({ length: reps }, () => token).join(' ')
  }
  let body = rand(pool as string[])
  const n = Math.floor(Math.random() * 4) // 0–3 trailing emojis
  for (let i = 0; i < n; i++) body += ' ' + rand(EMOJIS)
  if (Math.random() < 0.3) body = rand(EMOJIS) + ' ' + body // sometimes lead with one too
  return body
}

// Ambient chatter — kept clean (SFW). This is the streamer girl's LIVE CHAT reacting to
// what's happening in HER world/adventure (danger, NPCs, scenery, loot, her) plus generic
// stream-culture slang/hype and some "alien language" gibberish. Deliberately NOT meta:
// nothing here references D&D, dice/rolls/initiative, the DM, spells, or party classes —
// the viewers are watching her stream, not a tabletop game.
const PHRASES = [
  // stream-culture slang / hype (fits any live stream)
  'LMAO', 'lets gooo', 'W', 'L', 'no cap', 'based', 'sheeeesh', 'bussin', 'W streamer', 'certified W',
  'ratio', 'L + ratio', 'touch grass', 'he cooked', 'let him cook', 'cooked', 'goated', 'mid tbh',
  'peak fiction', 'actual cinema', 'we are so back', 'its so over', 'caught in 4k', 'main character energy',
  'understood the assignment', 'vibe check passed', 'aura +1000', 'that is crazy aura', 'she is HER',
  'new response just dropped', 'chat we won', 'chat we lost', 'no wayyy', 'fr fr', 'for real', 'deadass',
  'no shot', 'down bad', 'slay', 'the rizz is immaculate', 'sigma', 'yapping', 'lock in', 'she is locked in',
  'crash out', 'she crashed out', 'ate that up', 'no because', 'the way she', 'be so fr', 'lowkey fire',
  'delulu', 'it is giving', 'ate and left no crumbs', 'respectfully insane', 'this is peak', 'so demure',
  'clip that NOW', 'that was clean', 'W moment', 'L take chat', 'first', 'clip it', 'o7', 'F', 'GG', 'GG ez',
  'no wayyy', 'hold up', 'run it back', 'POGGERS', 'Pog', 'KEKW', 'OMEGALUL', 'monkaS', 'PepeLaugh',
  'FeelsGoodMan', 'FeelsBadMan', '5Head', 'big brain play', 'EZ Clap', 'GIGACHAD', 'copium', 'hopium',
  'malding', 'this is fine', 'over 9000!!', 'not bad', 'clip it and ship it', 'press F', 'do a barrel roll',
  'yooo', 'YESSS', 'nooo', 'LFG', 'LFGGG', 'HYPERS', 'PANIC', 'AAAAAA', 'GOOOO',
  // in-world reactions — chat watching HER adventure (danger / NPCs / scenery / loot / her)
  'BEHIND YOU', 'look out!!', 'RUN GIRL RUN', 'nooo dont go in there', 'its a trap', 'ITS A TRAP',
  'trust no one', 'that guy is SO shady', 'he is lying to you', 'dont trust him', 'she is lying',
  'who is that guy', 'who IS she', 'get out of there', 'GET OUT', 'she is so brave', 'protect her',
  'not the scary door', 'open it open it', 'dont open it', 'pick it up!!', 'grab the loot', 'TAKE IT',
  'leave it its cursed', 'that thing is cursed', 'is that a dragon??', 'ITS A DRAGON', 'the castle is gorgeous',
  'this place is creepy', 'bad vibes here', 'somethings wrong', 'i feel danger', 'she should NOT be here',
  'turn around', 'look up!!', 'check the corner', 'that guy is sus', 'sus guy alert', 'he did NOT just say that',
  'the audacity of this man', 'she pulled up SO clean', 'her outfit is fire', 'the drip is immaculate',
  'pretty!!', 'she is so pretty', 'queen behavior', 'not her doing that', 'talk to the merchant',
  'buy it buy it', 'dont pay that much', 'haggle him down', 'ask about the map', 'the music slaps',
  'the lore is crazy', 'plot twist incoming', 'i called it', 'knew it', 'she is cracked at this',
  'how is she so good', 'carry us queen', 'we believe in you', 'you got this!!', 'clutch it', 'save the puppy',
  'pet the animal', 'feed the cat', 'befriend it', 'romance who??', 'ship it ship it', 'the villain kinda right',
  'free him', 'lock him up', 'justice for her', 'dont cry ill cry too', 'she ate that', 'behind the pillar!!',
  'dont look back', 'someone is following her', 'call for help', 'where is everyone', 'this is a setup',
  // funnier situational bits — chat clowning on what she's doing right now
  'she named the horse and now im emotionally invested', 'not him monologuing AGAIN',
  'bro said that with his whole chest', 'the king is SO dramatic', 'this guard has zero thoughts',
  'she pet the monster im crying', 'the potion guy is SCAMMING her', 'run he has a knife 😭',
  'the vibes in this cave are terrible', 'she walked right past the lever', 'THE DOOR WAS OPEN THE WHOLE TIME',
  'bro fell in the water LMAOO', 'she tripped on flat ground', 'the merchant is lowkey fine tho',
  'she has NO sense of direction', 'why did she eat that', 'DONT EAT THE MUSHROOM', 'not the mushroom 💀',
  'shes gonna pet the dragon isnt she', 'this castle has terrible security', 'the guards are so bad at their job',
  'she stole that in broad daylight', 'girl that is CLEARLY a trap', 'he is evil i can smell it',
  'not the villain being kinda hot', 'she needs a snack fr', 'the sword is bigger than her',
  'why is EVERYTHING trying to kill her', 'this forest is so haunted', 'she made a friend!! 🥹',
  'the goblin was just misunderstood', 'kiss him. no wait he is evil', 'she is so unserious rn',
  'mans pulled the lever without reading the sign', 'the treasure was NOT worth it', 'she really said no thoughts head empty',
  'that torch is her only personality', 'she keeps talking to the statue', 'the statue MOVED did yall see that',
  'nobody move theres a monster', 'why is the soup glowing', 'do NOT drink the glowing soup',
  // pop-culture quotes chat loves to spam — Nacho Libre
  'get that corn outta my face', 'its the best!', 'these are my recreational pants',
  'i wanna win some of that Ludacris speed', 'beneath the man we find his nucleus',
  'when you are a man sometimes you wear stretchy pants', 'i ate some bad shrimp',
  'was it not obvious?? i let heem win', 'take it easy baby, now', 'ORPHAN!', 'PRECISELY',
  // League of Legends
  'DEMACIA!', 'the cycle of life and death continues', 'death is like the wind, always by my side',
  'follow the wind, but watch your back', 'its trollin time', 'welcome to the League of Draven',
  'rules are made to be broken. like buildings', 'get jinxed!', 'never one, without the other',
  'a swords poor company for a long road', 'the ground is unstable', 'fear the assassin',
  // Star Wars
  'i have a bad feeling about this', 'this is the way', 'these arent the droids youre looking for',
  'do or do not, there is no try', 'hello there', 'the force is strong with this one',
  'help me obi-wan youre my only hope', 'you were the chosen one!', 'i am your father', 'it is treason then',
  // Lord of the Rings
  'YOU SHALL NOT PASS', 'one does not simply walk in there', 'and my axe!', 'you have my sword',
  'they are taking the hobbits to isengard', 'not all those who wander are lost', 'my precious',
  'PO-TA-TOES', 'boil em mash em stick em in a stew', 'fly you fools', 'a wizard is never late',
  'even the smallest person can change the course of the future',
  // Doctor Who
  'ALLONS-Y!', 'geronimo!', 'wibbly wobbly timey wimey', 'EXTERMINATE', 'are you my mummy?',
  'bow ties are cool', 'fantastic!', 'DONT BLINK', 'hello sweetie', 'the angels have the phone box',
  'would you like a jelly baby?', 'spoilers', 'reverse the polarity', 'im the doctor, run',
  // "alien language" gibberish (clean flavor)
  'zorp gl!bnak', 'xhel toth vroom', 'blrgh na kai', 'quztl keverne', 'vrr naktal', 'sk thara zzz',
  'bloop znak morp', 'grxnthal!!', 'yeet vix qua', 'n gai n gai thakl', 'oomox thrapl', 'vex ka droon',
  'zizzl pop wubwub', 'kra thok mal vess', 'flooble crank', 'meep morp zeep', 'nyoom blblbl',
  'thplt hkkk vao', 'za za glorp', 'wubba wub nak', 'skree onk onk', 'glorptax has spoken',
  'blorbo fren shik', 'nak nak vroom', 'zzt zzt kaplow', 'oomf skree tak', 'vwoop vwoop na',
  'grbl mrbl florb', 'ket ket zoon', 'plip plop zharn', 'yeeb norb quazz', 'shloop da woop',
]

export default function StreamChat({ characterId, campaignId, initialStream, viewerCanChat }: { characterId: string; campaignId?: string | null; initialStream?: StreamState; viewerCanChat?: boolean }) {
  const { char, pb, commitRoll, isDM, canWrite } = useChar()
  // A fellow player watching the stream (not the streamer/DM) can chat as a viewer.
  const [viewerMsg, setViewerMsg] = useState('')
  const [viewerSending, setViewerSending] = useState(false)
  // Click a username → their message history this session.
  const [historyOf, setHistoryOf] = useState<string | null>(null)
  const [history, setHistory] = useState<{ body: string; created_at: string; kind?: string; amount?: number | null }[] | null>(null)
  // The streamer (owner) gets a built-in filter that narrows the live feed by handle or
  // keyword, with inline timeout/ban on the matches. The DM keeps his full search panel
  // (in the control panel), so this is only for a non-DM owner (e.g. Susie).
  const isOwnerMod = canWrite && !isDM
  const [filter, setFilter] = useState('')
  const modSendRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
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
  // Local pause — freezes THIS viewer's feed (ambient + incoming) so they can read.
  const [pausedLocal, setPausedLocal] = useState(false)
  // Big procedural crowd (only used past 15 viewers, where handles vary widely).
  const bigCrowdRef = useRef<ChatUser[]>([])
  // Active ambient phrase pool — default (broad PHRASES) or biased by the DM's selected
  // moods (+ any AI-refreshed lines). Held in a ref so mood changes take effect on the
  // next line WITHOUT restarting the ambient loop/timers.
  const poolRef = useRef<string[]>(PHRASES)
  // When DM/AI messages land, ambient chatter is suppressed for a moment so the curated
  // lines dominate the feed (the AI/DM has "full sway" over what chat is saying).
  const dampenUntilRef = useRef(0)
  // AI FOCUS takeover: when the DM aims the AI at a topic, premade chatter is almost fully
  // suppressed until `focusSuppressUntil`, then ramps back to normal by `focusRampUntil`.
  const focusSuppressUntilRef = useRef(0)
  const focusRampUntilRef = useRef(0)
  // The "revealed" viewer count the audience sees — organically fluctuates around the DM's
  // set value (viewers coming/going), clamped to the tier so the DC/pace never flicker.
  const [displayViewers, setDisplayViewers] = useState(0)

  // Poll the stream state (live toggle + viewers + pause) unless a fixed state was injected.
  useEffect(() => {
    if (initialStream || !characterId) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop && j?.stream) setStream(j.stream) })
        .catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { stop = true; clearInterval(t) }
  }, [characterId, initialStream])

  // Immediate cross-component sync: when the DM changes viewers/pause in StreamControl it
  // dispatches this, so this overlay reflects it instantly instead of waiting for a poll.
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; stream?: StreamState }
      if (d?.characterId === characterId && d.stream) setStream((prev) => ({ ...prev, ...d.stream } as StreamState))
    }
    window.addEventListener('dnd-stream-state', onState)
    return () => window.removeEventListener('dnd-stream-state', onState)
  }, [characterId])

  // AI FOCUS window: the DM aiming the AI at a topic broadcasts when premade chatter should
  // stay suppressed until, and when it should be fully faded back in.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; suppressUntil?: number; rampUntil?: number }
      if (d?.characterId !== characterId) return
      focusSuppressUntilRef.current = d.suppressUntil ?? 0
      focusRampUntilRef.current = d.rampUntil ?? 0
    }
    window.addEventListener('dnd-stream-focus', onFocus)
    return () => window.removeEventListener('dnd-stream-focus', onFocus)
  }, [characterId])

  // Organic "N watching" fluctuation. Re-centres immediately whenever the DM's set count
  // changes (0 stays 0, 1–15 stay exact; 16+ drifts within its tier).
  // Keep the ambient pool in sync with the DM's selected moods + AI-refreshed lines.
  useEffect(() => {
    poolRef.current = buildMoodPool(PHRASES, stream?.moods, stream?.ai_mood_lines)
  }, [stream?.moods, stream?.ai_mood_lines])

  // The "N watching" count hovers around the DM's set value and never settles — it keeps
  // ticking a bit above/below as long as anyone is watching, and re-centres instantly when
  // the DM changes the count. (0 → static 0.)
  useEffect(() => {
    const base = Math.max(0, Math.floor(stream?.viewer_count ?? 0))
    setDisplayViewers(fluctuateViewers(base, Math.random()))
    if (base <= 0) return
    const t = setInterval(() => setDisplayViewers(fluctuateViewers(base, Math.random())), 1800)
    return () => clearInterval(t)
  }, [stream?.viewer_count])

  // Ambient chatter while live. The PACE is set entirely by the audience: the resist DC
  // (a function of the viewer count) maps to an average messages/second (DC 15 ≈ 1/sec,
  // DC 20 ≈ 2/sec), and the crowd of usernames scales with viewers too:
  //   • 0 viewers      → no chat at all
  //   • 1–15 viewers   → exactly that many FIXED handles, reused for every line, and the
  //                      rate is a slow trickle (a lone viewer only chats every ~30s)
  //   • 16+ viewers    → too many to track, so handles are drawn from a large varied pool
  // On top of that the pace is deliberately bursty + jittered so it never feels metronomic,
  // it pauses on the local ⏸ or the DM's global pause (chat_speed 0), respects slow-mode,
  // and is suppressed for a moment after DM/AI messages so curated lines dominate.
  useEffect(() => {
    if (!stream?.is_live || pausedLocal) return
    const viewers = Math.max(0, Math.floor(stream.viewer_count ?? 0))
    if (viewers <= 0) return // nobody watching → dead chat
    if ((stream.chat_speed ?? 3) <= 0) return // DM global pause

    const dc = viewerDC(viewers)
    const trackCount = Math.min(viewers, 15)
    const big = viewers > 15
    if (big && bigCrowdRef.current.length === 0) bigCrowdRef.current = makeUsernames(200)
    // ≤15 viewers: a fixed set of exactly `trackCount` handles (deterministic, reused).
    const crowd = big ? bigCrowdRef.current : makeUsernames(trackCount)

    const basePerSec = chatRatePerSec(dc) / modeIntervalFactor(chatMode) // slow-mode thins it
    const maxBurst = big ? 12 : Math.max(1, trackCount)
    let stop = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      if (stop) return
      // Suppression: a fresh curated burst briefly quiets ambient (perBurst); an active AI
      // FOCUS almost fully silences premade chatter, then ramps it back over the fade window.
      const now = Date.now()
      const perBurst = dampenUntilRef.current > now ? 0.06 : 1
      let focusMul = 1
      if (now < focusSuppressUntilRef.current) focusMul = 0.02
      else if (now < focusRampUntilRef.current) {
        const span = Math.max(1, focusRampUntilRef.current - focusSuppressUntilRef.current)
        focusMul = 0.02 + 0.98 * ((now - focusSuppressUntilRef.current) / span)
      }
      const perSec = Math.max(0.01, basePerSec * Math.min(perBurst, focusMul))

      // Cluster size: mostly singles, occasional small clusters, rare flood at big crowds.
      const r = Math.random()
      let burst =
        perSec < 0.5 ? 1 : // a quiet chat speaks one at a time
        r < 0.62 ? 1 :
        r < 0.9 ? 2 + Math.floor(Math.random() * 3) : // 2–4
        4 + Math.floor(Math.random() * 5)             // 4–8
      burst = Math.min(burst, maxBurst)

      const batch = Array.from({ length: burst }, () => ({ id: idRef.current++, user: crowd[Math.floor(Math.random() * crowd.length)], body: makeBody(poolRef.current) }))
        .filter((l) => l.user && !banned.has(l.user.name) && allowedInMode({ badges: l.user.badges, hasEmote: hasEmote(l.body) }, chatMode))
      if (batch.length) { setLines((m) => [...m, ...batch].slice(-80)); bumpChat(batch.length) }

      // Gap so (burst / gap) ≈ perSec on average, jittered hard so it feels human:
      // sometimes a rapid cluster, sometimes a noticeable lull.
      let gap = (burst / perSec) * 1000 * (0.5 + Math.random())
      if (Math.random() < 0.2) gap *= 0.4 // rapid-fire cluster
      if (Math.random() < 0.12) gap += 1000 + Math.random() * 2500 // a lull
      timer = setTimeout(tick, Math.max(120, gap))
    }
    timer = setTimeout(tick, 400)
    return () => { stop = true; clearTimeout(timer) }
  }, [stream?.is_live, stream?.viewer_count, stream?.chat_speed, chatMode, banned, pausedLocal, bumpChat])

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
    modSendRef.current = ch // reused by the owner's inline timeout/ban
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; kind?: string; mode?: ChatMode; type?: ModActionType; username?: string }
      if (d?.characterId !== characterId) return
      if (d.kind === 'mode' && d.mode) setChatMode(d.mode)
      else if (d.kind === 'action' && d.type && d.username) applyAction(d.type, d.username)
    }
    window.addEventListener('dnd-stream-mod', onLocal)
    return () => { window.removeEventListener('dnd-stream-mod', onLocal); modSendRef.current = null; void supabase.removeChannel(ch) }
  }, [characterId])

  // Poll persisted lines (DM-sent J4 + AI spam/trend J5/J12) and weave them into the feed.
  // Fresh curated lines open a suppression window so ambient chatter backs off and the
  // DM/AI content dominates — this is what gives the AI "full sway" over the chat. The
  // poll is fast (1.2s), and a `dnd-stream-poll` event (fired the instant the DM's AI/Send
  // request returns) triggers an immediate fetch so generated lines show up right away.
  useEffect(() => {
    if (!stream?.is_live || !characterId || pausedLocal) return
    let stop = false
    let inFlight = false
    const poll = () => {
      if (inFlight) return
      inFlight = true
      return fetch(`/api/dnd/characters/${characterId}/stream/messages?limit=50`)
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .then((j) => {
          if (stop) return
          const fresh = (j.messages ?? []).filter((m: { id: string }) => !seenRef.current.has(m.id))
          if (fresh.length === 0) return
          fresh.forEach((m: { id: string }) => seenRef.current.add(m.id))
          // Suppress ambient for a few seconds so the curated burst stands out (longer for
          // a bigger burst — a full AI trend drop briefly takes over the whole chat).
          dampenUntilRef.current = Date.now() + Math.min(14000, 3000 + fresh.length * 700)
          bumpChat(fresh.length)
          setLines((prev) => [
            ...prev,
            ...fresh.map((m: { id: string; username: string; body: string; color: string | null; badges: string[] | null; kind?: string; amount?: number | null; sender_user_id?: string | null }) => ({
              id: `p-${m.id}`,
              user: { name: m.username, color: m.color ?? '#fff', badges: m.badges ?? [] },
              body: m.body,
              kind: m.kind,
              amount: m.amount,
              senderId: m.sender_user_id,
            })),
          ].slice(-60))
        })
        .catch(() => {})
        .finally(() => { inFlight = false })
    }
    poll()
    const t = setInterval(poll, 1200)
    // Instant fetch when the DM injects AI/Send content on this client.
    const onPollNow = (e: Event) => { if ((e as CustomEvent).detail === characterId) poll() }
    window.addEventListener('dnd-stream-poll', onPollNow)
    return () => { stop = true; clearInterval(t); window.removeEventListener('dnd-stream-poll', onPollNow) }
  }, [stream?.is_live, characterId, pausedLocal, bumpChat])

  // Authoritative visibility pass (J10): system lines always show; everything else is
  // gated by the ban list + the active mode, so changing a mode/ban re-filters the feed.
  const visibleLines = useMemo(
    () => lines.filter((l) => l.system || (!banned.has(l.user.name) && allowedInMode({ badges: l.user.badges, hasEmote: hasEmote(l.body) }, chatMode))),
    [lines, banned, chatMode],
  )

  // The owner's built-in filter: narrow the feed to lines whose handle or text matches.
  const feedLines = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return visibleLines
    return visibleLines.filter((l) => !l.system && (l.user.name.toLowerCase().includes(q) || l.body.toLowerCase().includes(q)))
  }, [visibleLines, filter])

  // Owner timeout/ban (broadcast to everyone + applied locally), reusing the mod channel.
  const ownerMod = (type: ModActionType, username: string) => {
    modSendRef.current?.send({ type: 'broadcast', event: 'action', payload: { type, username } })
    window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'action', type, username } }))
  }

  // Tap-a-name actions are available to the streamer (owner) AND the DM.
  const canModThis = isDM || isOwnerMod
  // Message a viewer: filed to the DM's reply inbox (NOT posted to chat) so the DM can
  // choose to answer AS that viewer or ignore it. `pm` is the popover message draft.
  const [pm, setPm] = useState('')
  const [pmNote, setPmNote] = useState<string | null>(null)
  const [pmBusy, setPmBusy] = useState(false)
  const messageUser = async (username: string) => {
    const body = pm.trim()
    if (!body || pmBusy) return
    setPmBusy(true)
    try {
      const lastLine = (history ?? []).slice(-1)[0]?.body
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/replies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatterUsername: username, chatterMessage: lastLine, replyBody: body, postToChat: false }),
      })
      if (r.ok) { setPm(''); setPmNote(`Sent to the DM — they’ll decide how ${username} replies.`) }
      else { const j = await r.json().catch(() => ({})); setPmNote(j.error || 'Could not send.') }
    } finally { setPmBusy(false) }
  }

  // A watching player chats as themselves (server tags it PARTY so it stands out).
  const postAsViewer = async () => {
    const body = viewerMsg.trim()
    if (!body || viewerSending) return
    setViewerSending(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      })
      setViewerMsg('')
      window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId }))
    } finally { setViewerSending(false) }
  }

  // Click a username → pull their whole history in this session (+ reset the PM draft).
  const openHistory = async (username: string) => {
    setHistoryOf(username); setHistory(null); setPm(''); setPmNote(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/messages?user=${encodeURIComponent(username)}&limit=200`)
      const j = await r.json().catch(() => ({}))
      setHistory(r.ok ? (j.messages ?? []) : [])
    } catch { setHistory([]) }
  }

  // Auto-follow new lines by scrolling the FEED CONTAINER only (never the page) — and
  // only when the reader is already near the bottom, so scrolling up to read holds.
  useEffect(() => {
    const el = feedRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [feedLines])
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

  // Ambient PACE is still set by the live audience (the tier table). The RESIST DC now
  // honors the DM's choice: auto (viewers + engagement) or a pinned manual value (K). The
  // decaying activity boost (J13) still nudges the auto DC + the meter's visual energy.
  const viewers = stream.viewer_count ?? 0
  const effEngagement = Math.min(100, (stream.engagement ?? 50) + boost)
  const paceDc = viewerDC(viewers)
  const resistDc = resolveDC({ mode: stream.dc_mode, manual: stream.dc_manual, viewers, engagement: effEngagement })

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
    // Persist until dismissed (the ✕ on the banner) — no auto-timeout, so it never
    // vanishes out from under you, especially while the meter is maxed + shaking.
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
        <span className="sd-count" title="Live viewers (fluctuates as people come and go)">{displayViewers.toLocaleString()} watching</span>
        {(isOwnerMod || isDM) && (
          <span className="sd-count" title="Your NeoNuggets from super chats — exchange them for notes on your sheet (10,000 = 1 note)" style={{ color: '#ffd23f', fontWeight: 700 }}>
            {formatNuggets(stream.kibbles_earned ?? 0)}
          </span>
        )}
        {pausedLocal && <span className="sd-mode" style={{ background: '#ff5252', color: '#fff', borderColor: '#ff5252' }}>⏸ paused</span>}
        {chatMode !== 'off' && modeMeta && (
          <span className="sd-mode">{modeMeta.icon} {modeMeta.label}</span>
        )}
        <button className="sd-min" onClick={() => setOpen(false)} title="Minimize the chat to a floating button">▾</button>
      </div>

      <div className="stream-dock-tools">
        <button
          className={`sd-pause ${pausedLocal ? 'on' : ''}`}
          onClick={() => setPausedLocal((p) => !p)}
          title={pausedLocal ? 'Resume the chat feed in your view' : 'Pause the chat feed in your view so you can read it (does not stop the stream for others)'}
        >
          {pausedLocal ? '▶ Resume' : '⏸ Pause'}
        </button>
        <span className="sd-rate" title={`Chat pace is set by the audience size — more viewers = faster chat. Right now ~${chatRatePerSec(paceDc)} messages/sec.`}>
          {viewers <= 0 ? 'silent' : `~${chatRatePerSec(paceDc) < 1 ? chatRatePerSec(paceDc).toFixed(2) : chatRatePerSec(paceDc)}/s`}
        </span>
        {(isDM || isOwnerMod) && (
          <button
            className="sd-resist"
            onClick={rollResist}
            title={`Roll ${isDM ? 'her' : 'your'} Wisdom save to resist what chat is demanding (must beat DC ${resistDc})`}
          >
            🎲 Resist · DC {resistDc}
          </button>
        )}
      </div>

      {/* Owner's built-in chat filter — narrows the live feed by handle or keyword. */}
      {isOwnerMod && (
        <div style={{ display: 'flex', gap: 6, padding: '2px 8px 6px', alignItems: 'center' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 filter chat by name or keyword…"
            style={{ flex: 1, padding: '5px 8px', fontSize: 12, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.18))', color: 'inherit', borderRadius: 4 }}
          />
          {filter && <button className="sd-pause" onClick={() => setFilter('')} title="Clear filter">✕</button>}
        </div>
      )}

      {resist && (
        <div className={`sd-resist-banner ${resist.ok ? 'ok' : 'bad'}`} role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' }}>
          <span>{resist.text}</span>
          <button
            onClick={() => setResist(null)}
            title="Dismiss"
            aria-label="Dismiss result"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, fontWeight: 800, lineHeight: 1, opacity: 0.85 }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="stream-dock-body">
        <div className="stream-feed" data-stream-feed="" ref={feedRef} onScroll={onFeedScroll}>
          {feedLines.length === 0 ? (
            <p style={{ color: 'var(--muted, #9aa)', fontSize: 12 }}>{filter.trim() ? 'No chat lines match your filter.' : 'Chat is warming up…'}</p>
          ) : (
            feedLines.map((l) => {
              if (l.system) return (
                <div key={l.id} style={{ wordBreak: 'break-word', color: '#f0c46a', fontStyle: 'italic', fontSize: 12, padding: '2px 0' }}>{l.body}</div>
              )
              const isDonation = l.kind === 'donation' || l.kind === 'superchat'
              const isParty = l.user.badges.includes('party')
              // Only real identities are clickable for history: the DM's own lines/aliases
              // and other players (both carry senderId), plus donors (money events). The
              // random AI/ambient crowd isn't trackable.
              // The streamer/DM can tap ANY handle to open its actions (message/mod);
              // regular viewers can only click "trackable" identities to see history.
              const trackable = !!l.senderId || isDonation || canModThis
              const nameEl = trackable ? (
                <span onClick={() => openHistory(l.user.name)} title={canModThis ? `Options for ${l.user.name}` : `See ${l.user.name}'s messages this session`}
                  style={{ color: l.user.color, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)', cursor: 'pointer' }}>{l.user.name}</span>
              ) : (
                <span style={{ color: l.user.color, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{l.user.name}</span>
              )
              // Superchat / donation → a pinned, tier-coloured card.
              if (isDonation) return (
                <div key={l.id} style={{ margin: '4px 0', borderRadius: 7, overflow: 'hidden', border: `1px solid ${l.user.color}`, boxShadow: `0 0 10px ${l.user.color}66` }}>
                  <div style={{ background: l.user.color, color: '#0a0510', fontWeight: 800, fontSize: 12, padding: '3px 8px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span onClick={() => openHistory(l.user.name)} style={{ cursor: 'pointer' }}>{l.user.name}</span>
                    <span>{formatNuggets(l.amount ?? 0)}</span>
                  </div>
                  <div style={{ padding: '4px 8px', fontSize: 13, background: `${l.user.color}1f`, color: '#fff' }}>{l.body}</div>
                </div>
              )
              return (
                <div key={l.id} style={{ wordBreak: 'break-word', ...(isParty ? { background: 'rgba(255,210,63,0.14)', borderLeft: '3px solid #ffd23f', padding: '2px 6px', borderRadius: 3, margin: '2px 0' } : {}) }}>
                  {l.user.badges.map((b) => (
                    <span key={b} title={b} style={{ display: 'inline-block', fontSize: 9, padding: '0 3px', marginRight: 3, borderRadius: 3, background: b === 'party' ? '#ffd23f' : b === 'mod' ? '#00ad03' : b === 'vip' ? '#e005b9' : b === 'prime' ? '#4d6bff' : '#8205b4', color: b === 'party' ? '#0a0510' : '#fff', fontWeight: b === 'party' ? 800 : 400, verticalAlign: 'middle' }}>{b === 'party' ? 'PLAYER' : b[0].toUpperCase()}</span>
                  ))}
                  {nameEl}
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
                  {isOwnerMod && filter.trim() && (
                    <span style={{ marginLeft: 6, whiteSpace: 'nowrap' }}>
                      <button onClick={() => ownerMod('timeout', l.user.name)} title={`Time out ${l.user.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>⛔</button>
                      <button onClick={() => ownerMod('ban', l.user.name)} title={`Ban ${l.user.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px', color: '#ff6b6b' }}>🔨</button>
                    </span>
                  )}
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>
        <InfluenceMeter viewers={viewers} engagement={effEngagement} dcMode={stream.dc_mode} dcManual={stream.dc_manual} />
      </div>

      {/* A watching player's chat box — posts stand out as PLAYER lines for the streamer. */}
      {viewerCanChat && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <input
            value={viewerMsg}
            onChange={(e) => setViewerMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && postAsViewer()}
            placeholder="Say something in chat…"
            maxLength={240}
            style={{ flex: 1, padding: '6px 8px', fontSize: 13, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', borderRadius: 4 }}
          />
          <button className="sd-pause" onClick={postAsViewer} disabled={viewerSending || !viewerMsg.trim()}>{viewerSending ? '…' : 'Chat'}</button>
        </div>
      )}

      {/* Click-a-name history popover. */}
      {historyOf && (
        <div style={{ position: 'absolute', inset: 8, top: 40, background: 'rgba(10,6,18,0.97)', border: '1px solid var(--gold, #c89b3c)', borderRadius: 8, zIndex: 5, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <strong style={{ fontSize: 13, color: 'var(--gold, #c89b3c)' }}>🗒 {historyOf}</strong>
            <button className="sd-pause" onClick={() => { setHistoryOf(null); setHistory(null) }}>✕</button>
          </div>

          {/* Streamer/DM actions on this handle: message them (→ DM inbox) or moderate. */}
          {canModThis && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={pm}
                  onChange={(e) => setPm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && messageUser(historyOf)}
                  placeholder={`Message ${historyOf}…`}
                  style={{ flex: 1, padding: '5px 7px', fontSize: 12.5, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', borderRadius: 4 }}
                />
                <button className="sd-pause" onClick={() => messageUser(historyOf)} disabled={pmBusy || !pm.trim()} title="Send to the DM — they decide how this viewer replies">✉ Message</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="sd-pause" onClick={() => ownerMod('timeout', historyOf)} title={`Time out ${historyOf}`}>⛔ Timeout</button>
                {banned.has(historyOf)
                  ? <button className="sd-pause" onClick={() => ownerMod('unban', historyOf)} title={`Unban ${historyOf}`}>♻️ Unban</button>
                  : <button className="sd-pause" onClick={() => ownerMod('ban', historyOf)} style={{ color: '#ff6b6b' }} title={`Ban ${historyOf}`}>🔨 Ban</button>}
              </div>
              {pmNote && <div style={{ fontSize: 11, color: '#0ac8b9' }}>{pmNote}</div>}
            </div>
          )}

          <div style={{ overflow: 'auto', padding: '6px 10px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {history === null ? <span style={{ color: 'var(--muted,#9aa)' }}>Loading…</span>
              : history.length === 0 ? <span style={{ color: 'var(--muted,#9aa)' }}>No saved messages from this handle. (Ambient chatter isn’t recorded — only DM, AI, players, and donations are.)</span>
              : history.map((h, i) => (
                <div key={i}>
                  {(h.kind === 'donation' || h.kind === 'superchat') && <span style={{ color: '#ffd23f', fontWeight: 700 }}>{formatNuggets(h.amount ?? 0)} </span>}
                  <span style={{ color: '#f2effa' }}>{h.body}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="stream-resize" onPointerDown={onResizeStart} title="Drag to resize">⤡</div>
    </div>
  )
}
