'use client';
// app/admin/cad/components/AICopilotSidebar.tsx
//
// Phase 6 §32 Slice 7 — COPILOT / COMMAND chat sidebar.
//
// Surveyor surface for the §32 framework: a thin sidebar that
// hosts the conversation transcript + a prompt input + a queue-
// depth chip. Proposals land in the AIStore.proposalQueue and
// are surfaced via the floating CopilotCard (Slice 5); the
// sidebar is the input side of that loop.
//
// Activation:
//   - Status-bar mode chip (Slice 1) auto-opens the sidebar
//     when the mode is COPILOT or COMMAND.
//   - Ctrl+Shift+C (ai.chat hotkey) focuses the input.
//   - Right-click "Ask AI about this…" seeds the input via
//     openCopilotWithPrompt(<composed prompt>).

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Trash2, X, FileWarning, Paperclip, Play, Pause } from 'lucide-react';
import { useAIStore, REFERENCE_DOC_DAMPENING } from '@/lib/cad/store';
import type { AIReferenceDoc } from '@/lib/cad/store';

export default function AICopilotSidebar() {
  const isOpen = useAIStore((s) => s.isCopilotSidebarOpen);
  const close = useAIStore((s) => s.closeCopilotSidebar);
  const mode = useAIStore((s) => s.mode);
  const transcript = useAIStore((s) => s.copilotChat);
  const queueLength = useAIStore((s) => s.proposalQueue.length);
  const isProposing = useAIStore((s) => s.isProposing);
  const pendingPrompt = useAIStore((s) => s.pendingPrompt);
  const propose = useAIStore((s) => s.proposeFromPrompt);
  const clearChat = useAIStore((s) => s.clearCopilotChat);
  const threshold = useAIStore((s) => s.autoApproveThreshold);
  const setThreshold = useAIStore((s) => s.setAutoApproveThreshold);
  const resolutionCount = useAIStore(
    (s) => Object.keys(s.codeResolutionMemory).length,
  );
  const clearResolutions = useAIStore((s) => s.clearCodeResolutionMemory);
  const referenceDocs = useAIStore((s) => s.referenceDocs);
  const addReferenceDoc = useAIStore((s) => s.addReferenceDoc);
  const removeReferenceDoc = useAIStore((s) => s.removeReferenceDoc);
  const startAutoRun = useAIStore((s) => s.startAutoRun);
  const setMode = useAIStore((s) => s.setMode);
  const appendCopilotMessage = useAIStore((s) => s.appendCopilotMessage);
  const [refsOpen, setRefsOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // External surfaces (right-click, palette) seed the input
  // via pendingPrompt. Consume it on next render + focus.
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.length > 0) {
      setDraft(pendingPrompt);
      useAIStore.setState({ pendingPrompt: null });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        // Place cursor at the end so the surveyor can keep typing.
        const len = pendingPrompt.length;
        inputRef.current?.setSelectionRange(len, len);
      });
    }
  }, [pendingPrompt]);

  // Focus on Ctrl+Shift+C (ai.chat).
  useEffect(() => {
    const handler = () => {
      if (!useAIStore.getState().isCopilotSidebarOpen) {
        useAIStore.getState().openCopilotSidebar();
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('cad:focusAICopilot', handler);
    return () => window.removeEventListener('cad:focusAICopilot', handler);
  }, []);

  // Auto-scroll transcript on new turn.
  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript.length, isProposing]);

  if (!isOpen) return null;

  function handleSubmit(e?: React.FormEvent | React.KeyboardEvent) {
    e?.preventDefault?.();
    const text = draft.trim();
    if (text.length === 0 || isProposing) return;
    setDraft('');
    propose(text);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter submits; plain Enter is left to insert
    // a newline so multi-line prompts stay easy.
    if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  }

  return (
    <aside
      className="fixed top-12 right-0 bottom-8 w-[340px] z-30 flex flex-col bg-gray-900 border-l border-gray-700 text-gray-200"
      aria-label="AI Copilot sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-850">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-blue-300" />
          <span className="text-[12px] font-semibold tracking-wide text-blue-200">AI Copilot</span>
          <span className="text-[10px] font-mono text-gray-400 uppercase">{mode}</span>
        </div>
        <div className="flex items-center gap-1">
          {queueLength > 0 && (
            <span
              className="text-[10px] text-amber-200 bg-amber-900/40 border border-amber-700 rounded px-1.5 py-[1px]"
              title={`${queueLength} proposal${queueLength === 1 ? '' : 's'} queued; review via the COPILOT card.`}
            >
              {queueLength} queued
            </span>
          )}
          <button
            type="button"
            onClick={clearChat}
            className="text-gray-500 hover:text-gray-200 p-0.5"
            title="Clear chat transcript (proposal queue is unaffected)."
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            onClick={close}
            className="text-gray-500 hover:text-gray-200 p-0.5"
            title="Close sidebar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* §32 Slice 8 / 9 — settings strip */}
      <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-850/50 space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400 shrink-0" title="Confidence threshold above which AUTO auto-approves a proposal; below it, the framework escalates to COPILOT for that single step.">
            Auto-approve ≥
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="flex-1 accent-blue-500"
            aria-label="Auto-approve confidence threshold"
          />
          <span className="font-mono text-gray-200 w-9 text-right">{Math.round(threshold * 100)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 text-[10px]" title="Code → layer answers the surveyor has previously given. The AI uses these so it doesn't keep re-asking.">
            Saved code resolutions: <span className="text-gray-300">{resolutionCount}</span>
          </span>
          {resolutionCount > 0 && (
            <button
              type="button"
              onClick={clearResolutions}
              className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
              title="Forget every saved code resolution — the AI will start asking again on next proposal."
            >
              Clear
            </button>
          )}
        </div>
        {/* §32.6 — reference-doc chip. Amber warning when
            empty (confidence is dampened); gray summary
            otherwise. Click toggles the inline manage panel. */}
        <button
          type="button"
          onClick={() => setRefsOpen((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded border transition-colors ${
            referenceDocs.length === 0
              ? 'bg-amber-900/30 border-amber-700 text-amber-200 hover:bg-amber-900/50'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
          }`}
          title={
            referenceDocs.length === 0
              ? `No reference docs — every AI proposal's confidence is dampened ×${REFERENCE_DOC_DAMPENING}. Click to add a deed / plat / sketch / prior drawing.`
              : `${referenceDocs.length} reference doc${referenceDocs.length === 1 ? '' : 's'} attached. Click to manage.`
          }
        >
          <span className="flex items-center gap-1 text-[11px]">
            {referenceDocs.length === 0 ? <FileWarning size={12} /> : <Paperclip size={12} />}
            {referenceDocs.length === 0
              ? `Running without references — confidence ×${REFERENCE_DOC_DAMPENING}`
              : `${referenceDocs.length} reference doc${referenceDocs.length === 1 ? '' : 's'} attached`}
          </span>
          <span className="text-[10px] opacity-70">{refsOpen ? 'Close' : 'Manage'}</span>
        </button>
        {refsOpen && (
          <ReferenceDocsManager
            docs={referenceDocs}
            onAdd={addReferenceDoc}
            onRemove={removeReferenceDoc}
          />
        )}
      </div>

      {/* §32 Slice 11 — AUTO run controls. Visible when mode is
          AUTO; gives the surveyor a one-click intake kickoff
          and a pause that flips back to COPILOT. */}
      {mode === 'AUTO' && (
        <div className="px-3 py-1.5 border-b border-gray-700 bg-purple-950/30 flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => startAutoRun()}
            disabled={isProposing}
            className="flex items-center gap-1 px-2 py-1 rounded border bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed border-purple-500 text-purple-50 transition-colors"
            title="Kick off an AUTO run with a project-intake prompt (§32.13 Slice 11)."
          >
            <Play size={11} /> Start AUTO run
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('COPILOT');
              appendCopilotMessage({
                id: `pause_${Date.now().toString(36)}`,
                role: 'SYSTEM',
                content:
                  'AUTO paused — switched to COPILOT. Cycle the mode (Ctrl+Shift+M) to resume.',
                ts: new Date().toISOString(),
              });
            }}
            className="flex items-center gap-1 px-2 py-1 rounded border bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200 transition-colors"
            title="Halt AUTO at the next boundary and drop into COPILOT (Ctrl+Shift+P)."
          >
            <Pause size={11} /> Pause
          </button>
          <span className="text-[10px] text-purple-200/70 ml-auto" title="Ctrl+Shift+P pauses AUTO from anywhere.">
            Ctrl+Shift+P
          </span>
        </div>
      )}

      {/* Transcript */}
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-[12px]"
      >
        {transcript.length === 0 ? (
          <p className="text-gray-500 italic text-[11px] leading-snug">
            {mode === 'MANUAL'
              ? 'AI is off (MANUAL mode). Press Ctrl+Shift+M to switch modes, then ask the AI anything.'
              : 'Ask the AI to add points, draw layers, find missing corners, or check closure. Right-click a feature → "Ask AI about this…" to scope a question.'}
          </p>
        ) : (
          transcript.map((m) => <MessageRow key={m.id} message={m} />)
        )}
        {isProposing && (
          <div className="flex items-center gap-2 text-[11px] text-blue-300 italic">
            <Loader2 size={12} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-700 bg-gray-850 px-3 py-2 space-y-1"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="Ask the AI… (Ctrl+Enter to send)"
          className="w-full bg-gray-800 text-gray-100 text-[12px] rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none resize-none font-sans"
          disabled={mode === 'MANUAL'}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Ctrl+Enter sends</span>
          <button
            type="submit"
            disabled={mode === 'MANUAL' || draft.trim().length === 0 || isProposing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <Send size={12} /> Send
          </button>
        </div>
      </form>
    </aside>
  );
}

function ReferenceDocsManager(props: {
  docs: AIReferenceDoc[];
  onAdd: (doc: { name: string; kind: AIReferenceDoc['kind'] }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AIReferenceDoc['kind']>('DEED');

  function handleAdd(e?: React.FormEvent) {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    props.onAdd({ name: trimmed, kind });
    setName('');
  }

  return (
    <div className="border border-gray-700 rounded bg-gray-900/60 p-1.5 space-y-1.5 text-[11px]">
      {props.docs.length === 0 ? (
        <p className="text-gray-500 italic text-[10px] leading-snug">
          No reference docs yet. Add a deed PDF, recorded plat, hand sketch, or prior drawing to tighten the AI&apos;s confidence.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {props.docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-1 px-1 py-0.5 rounded bg-gray-800 border border-gray-700"
            >
              <span className="flex-1 truncate" title={d.name}>
                <span className="text-[10px] text-gray-500 uppercase mr-1 font-mono">{d.kind}</span>
                <span className="text-gray-200">{d.name}</span>
              </span>
              <button
                type="button"
                onClick={() => props.onRemove(d.id)}
                className="text-gray-500 hover:text-red-400 p-0.5"
                title="Remove this reference doc"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex items-center gap-1">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AIReferenceDoc['kind'])}
          className="bg-gray-800 text-gray-200 text-[10px] border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
          aria-label="Reference doc kind"
        >
          <option value="DEED">Deed</option>
          <option value="PLAT">Plat</option>
          <option value="SKETCH">Sketch</option>
          <option value="PRIOR_DRAWING">Prior drawing</option>
          <option value="OTHER">Other</option>
        </select>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="File or note title…"
          className="flex-1 min-w-0 bg-gray-800 text-gray-200 text-[11px] border border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={name.trim().length === 0}
          className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          Add
        </button>
      </form>
    </div>
  );
}

function MessageRow(props: { message: import('@/lib/cad/store').AICopilotMessage }) {
  const m = props.message;
  const isUser = m.role === 'USER';
  const isSystem = m.role === 'SYSTEM';
  return (
    <div
      className={`rounded px-2 py-1.5 border whitespace-pre-wrap ${
        isUser
          ? 'bg-blue-900/30 border-blue-800/60 text-blue-100'
          : isSystem
            ? 'bg-amber-900/20 border-amber-800/40 text-amber-100 text-[11px]'
            : 'bg-gray-800/60 border-gray-700 text-gray-100'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
        {isUser ? 'You' : isSystem ? 'System' : 'AI'}
      </div>
      {m.content}
    </div>
  );
}
