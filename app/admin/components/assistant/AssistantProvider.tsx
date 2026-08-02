'use client';
// app/admin/components/assistant/AssistantProvider.tsx — the conversation, held above the dock.
//
// Audit §5 item 14 asks for *"one assistant dock with tool use, everywhere"*. The API for it shipped
// with the `lib/ai` foundation (audit item 13) and nothing called it — this is the half that makes it
// a feature rather than an endpoint.
//
// ── WHY THE STATE LIVES IN A PROVIDER AND NOT IN THE PANEL ──────────────────────────────────────
//
// The dock is mounted in the admin layout, but the useful entry points are elsewhere: a page can say
// "ask the assistant about this" and a help drawer falls through to it when there is nothing curated
// (item 15). If the transcript lived inside the panel component, every one of those entry points
// would either open an empty assistant or need its own copy of the fetch loop. `openAssistant(seed)`
// exists so a caller can hand over a question without knowing anything about how it is answered.
//
// ── THE TRANSCRIPT IS NOT PERSISTED, AND THAT IS DELIBERATE ─────────────────────────────────────
//
// The assistant reads live context — who you are, what you are clocked into, the page you are on.
// Restoring yesterday's transcript would re-render answers grounded in facts that have since changed,
// with no marker saying so. A stale answer that looks current is worse here than a lost one: "you are
// clocked in on job 24-118" is either true now or actively misleading. Sessions end with the tab.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Tools the server actually ran to produce this turn — shown so an answer can be traced. */
  toolCalls?: Array<{ name: string; input: unknown }>;
  /** Set when the reply is an error rather than an answer, so it renders as one. */
  error?: boolean;
}

/** A write the model wants to make. It has NOT run: the server stopped and asked. */
export interface PendingTool {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AssistantState {
  open: boolean;
  busy: boolean;
  turns: AssistantTurn[];
  pending: PendingTool | null;
  openAssistant: (seed?: string) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  send: (text: string) => Promise<void>;
  approvePending: () => Promise<void>;
  rejectPending: () => void;
  reset: () => void;
}

const Ctx = createContext<AssistantState | null>(null);

export function useAssistant(): AssistantState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>.');
  return ctx;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [pending, setPending] = useState<PendingTool | null>(null);

  // The transcript is read inside async callbacks that were created before the latest state landed.
  // A ref keeps "what has actually been said" correct without re-creating `send` on every keystroke,
  // which would restart the effect that scrolls the panel.
  const turnsRef = useRef<AssistantTurn[]>([]);
  const setTranscript = useCallback((next: AssistantTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  // One place that talks to the route, so the confirm round-trip and an ordinary message cannot
  // drift apart. `confirmedTool` is what turns an approval into an execution — the server runs it and
  // then continues the conversation as if the model had called it, which on the previous request it did.
  const ask = useCallback(
    async (history: AssistantTurn[], confirmedTool?: PendingTool) => {
      setBusy(true);
      setPending(null);
      try {
        const res = await fetch('/api/admin/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map((t) => ({ role: t.role, content: t.content })),
            page: { path: pathname },
            confirmedTool,
          }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          // The route distinguishes "not set up" (503) from "the call failed" (502) and says so in
          // `error`. Forwarding its sentence beats a generic failure: one of those is somebody's
          // configuration task and the other is worth retrying.
          setTranscript([
            ...history,
            { role: 'assistant', content: json.error || 'The assistant could not answer just now.', error: true },
          ]);
          return;
        }

        const next: AssistantTurn[] = [...history];
        if (json.reply) {
          next.push({ role: 'assistant', content: json.reply, toolCalls: json.toolCalls });
        } else if (!json.pendingConfirmation) {
          next.push({ role: 'assistant', content: 'No answer came back.', error: true });
        }
        setTranscript(next);
        if (json.pendingConfirmation) setPending(json.pendingConfirmation as PendingTool);
      } catch {
        setTranscript([
          ...history,
          { role: 'assistant', content: 'Could not reach the assistant. Check your connection and try again.', error: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [pathname, setTranscript],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const history: AssistantTurn[] = [...turnsRef.current, { role: 'user', content: trimmed }];
      setTranscript(history);
      await ask(history);
    },
    [ask, busy, setTranscript],
  );

  const approvePending = useCallback(async () => {
    if (!pending) return;
    await ask(turnsRef.current, pending);
  }, [ask, pending]);

  // Declining is recorded in the transcript rather than silently dropped. The model asked for
  // something; the next thing it sees should say what happened, or it asks again.
  const rejectPending = useCallback(() => {
    if (!pending) return;
    setPending(null);
    setTranscript([...turnsRef.current, { role: 'assistant', content: 'Cancelled — nothing was changed.' }]);
  }, [pending, setTranscript]);

  const reset = useCallback(() => {
    setPending(null);
    setTranscript([]);
  }, [setTranscript]);

  const openAssistant = useCallback(
    (seed?: string) => {
      setOpen(true);
      if (seed) void send(seed);
    },
    [send],
  );

  const value = useMemo<AssistantState>(
    () => ({
      open,
      busy,
      turns,
      pending,
      openAssistant,
      closeAssistant: () => setOpen(false),
      toggleAssistant: () => setOpen((o) => !o),
      send,
      approvePending,
      rejectPending,
      reset,
    }),
    [open, busy, turns, pending, openAssistant, send, approvePending, rejectPending, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
