'use client';
// app/admin/cad/components/InlineAIChat.tsx
//
// A compact, floating AI chat that opens from a right-click "Ask AI…"
// entry on a layer / line / point. The conversation is SCOPED to that
// element (the scope is prepended to each prompt) so the surveyor can ask
// focused questions — "is this wall square?", "complete the missing
// corner". Answers + suggestions reuse the shared copilot transcript and
// proposal queue, so any suggested points/lines appear as dashed ghosts
// and are approved on the existing proposal card (inline, on canvas).
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X, Loader2 } from 'lucide-react';
import { useAIStore } from '@/lib/cad/store';

export default function InlineAIChat() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('');
  const [pos, setPos] = useState({ x: 240, y: 120 });
  const [draft, setDraft] = useState('');

  const transcript = useAIStore((s) => s.copilotChat);
  const isProposing = useAIStore((s) => s.isProposing);
  const propose = useAIStore((s) => s.proposeFromPrompt);
  const queueLength = useAIStore((s) => s.proposalQueue.length);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent).detail as { scope?: string; x?: number; y?: number } | undefined;
      setScope(d?.scope ?? '');
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      setPos({
        x: Math.max(8, Math.min(d?.x ?? 240, vw - 360)),
        y: Math.max(8, Math.min(d?.y ?? 120, vh - 380)),
      });
      setOpen(true);
      // Make sure the AI is listening — MANUAL hides every AI surface.
      if (useAIStore.getState().mode === 'MANUAL') useAIStore.getState().setMode('COPILOT');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    window.addEventListener('cad:openInlineAI', onOpen);
    return () => window.removeEventListener('cad:openInlineAI', onOpen);
  }, []);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [transcript, open]);

  if (!open) return null;

  function send() {
    const text = draft.trim();
    if (!text || isProposing) return;
    setDraft('');
    propose(scope ? `Regarding ${scope}: ${text}` : text);
  }

  // Only show the tail of the shared transcript to keep the popup compact.
  const recent = transcript.slice(-8);

  return (
    <div
      className="fixed z-50 w-[340px] max-h-[60vh] flex flex-col bg-gray-900 border border-blue-700/50 rounded-lg shadow-2xl animate-[scaleIn_140ms_cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-800/40 bg-blue-900/30 rounded-t-lg">
        <Sparkles size={13} className="text-blue-300 shrink-0" />
        <span className="text-[11px] font-semibold text-blue-200 truncate">
          Ask AI{scope ? ` · ${scope}` : ''}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-gray-400 hover:text-white shrink-0"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Transcript */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 text-[12px]">
        {recent.length === 0 ? (
          <p className="text-gray-500 italic text-[11px] leading-snug">
            Ask about {scope || 'this element'} — e.g. “is this square?”, “complete the missing
            corner”, “check these distances”. Suggested points/lines appear as dashed ghosts to approve.
          </p>
        ) : (
          recent.map((m) => (
            <div
              key={m.id}
              className={`rounded px-2 py-1 border whitespace-pre-wrap select-text cursor-text ${
                m.role === 'USER'
                  ? 'bg-blue-900/30 border-blue-800/50 text-blue-100'
                  : m.role === 'SYSTEM'
                    ? 'bg-amber-900/20 border-amber-800/40 text-amber-100 text-[11px]'
                    : 'bg-gray-800/70 border-gray-700 text-gray-100'
              }`}
            >
              {m.content}
            </div>
          ))
        )}
        {isProposing && (
          <div className="flex items-center gap-2 text-[11px] text-blue-300 italic">
            <Loader2 size={12} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-2 space-y-1.5">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            if (e.key === 'Escape') setOpen(false);
            e.stopPropagation();
          }}
          rows={2}
          placeholder="Ask… (Ctrl+Enter)"
          className="w-full bg-gray-800 text-gray-100 text-[12px] rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {queueLength > 0 ? `${queueLength} suggestion${queueLength === 1 ? '' : 's'} to review →` : 'Ctrl+Enter sends'}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={draft.trim().length === 0 || isProposing}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <Send size={12} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
