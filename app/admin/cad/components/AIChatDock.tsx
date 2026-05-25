'use client';
// app/admin/cad/components/AIChatDock.tsx
//
// CAD_UX_2026_05 §02 — the single consolidated AI chat surface. Renders one
// panel (never two) that is right-docked by default but can be undocked into a
// free-floating, movable/resizable window (via ModalFrame). Holds multiple
// conversation tabs: auto-named from the first request, renamable (double-click
// the tab), and closable. The composer always offers an attach-image/file
// button so the surveyor can hand the model an image to analyze.

import { useEffect, useRef, useState } from 'react';
import { Plus, X, PanelRight, Maximize2, Paperclip, Send } from 'lucide-react';

import { useAIConversationsStore, type ChatAttachment } from '@/lib/cad/store/ai-conversations-store';
import type { DrawingChatAction, DrawingChatMessage } from '@/lib/cad/ai-engine/drawing-chat';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

const MAX_ATTACH_BYTES = 5 * 1024 * 1024; // 5 MB per file

export default function AIChatDock() {
  const isOpen = useAIConversationsStore((s) => s.isOpen);
  const dock = useAIConversationsStore((s) => s.dock);

  if (!isOpen) return null;
  if (dock === 'float') {
    return (
      <ModalFrame
        open
        onClose={() => useAIConversationsStore.getState().close()}
        scrollBody={false}
        title="AI Assistant"
        storageKey="cad.aiChatDock"
        initialPlacement="top-right"
        initialWidth={420}
        initialHeight={620}
        minWidth={320}
        minHeight={360}
        backdrop={false}
        headerActions={
          <button
            onClick={() => useAIConversationsStore.getState().setDock('right')}
            title="Dock to the right"
            aria-label="Dock to the right"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <PanelRight size={14} />
          </button>
        }
      >
        <ChatInner />
      </ModalFrame>
    );
  }
  return <DockedShell />;
}

/** Right-docked shell with a left-edge width resizer. */
function DockedShell() {
  const dockedWidth = useAIConversationsStore((s) => s.dockedWidth);
  const setDockedWidth = useAIConversationsStore((s) => s.setDockedWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, startW: dockedWidth };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      // Dragging left (smaller clientX) widens the right-docked panel.
      setDockedWidth(dragRef.current.startW + (dragRef.current.startX - ev.clientX));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <aside
      className="fixed top-12 right-0 bottom-0 z-[935] flex bg-gray-900 border-l border-gray-700 shadow-2xl"
      style={{ width: dockedWidth }}
      role="dialog"
      aria-label="AI Assistant"
    >
      <div
        onPointerDown={onPointerDown}
        className="w-1.5 cursor-ew-resize hover:bg-blue-600/40 shrink-0"
        style={{ touchAction: 'none' }}
        title="Drag to resize"
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-2 h-9 border-b border-gray-700 shrink-0">
          <span className="text-xs font-semibold text-gray-200 pl-1">AI Assistant</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => useAIConversationsStore.getState().setDock('float')}
              title="Undock (float)"
              aria-label="Undock"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => useAIConversationsStore.getState().close()}
              title="Close"
              aria-label="Close"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <ChatInner />
      </div>
    </aside>
  );
}

/** Tab strip + transcript + composer — shared by docked + floating shells. */
function ChatInner() {
  const conversations = useAIConversationsStore((s) => s.conversations);
  const activeId = useAIConversationsStore((s) => s.activeId);
  const loading = useAIConversationsStore((s) => s.loading);
  const send = useAIConversationsStore((s) => s.send);
  const applyAction = useAIConversationsStore((s) => s.applyAction);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const messages = active?.messages ?? [];
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  function handleSend() {
    const text = draft.trim();
    if ((text.length === 0 && attachments.length === 0) || loading) return;
    void send(text || '(see attached)', attachments);
    setDraft('');
    setAttachments([]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACH_BYTES) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      }).catch(() => null);
      if (dataUrl) {
        next.push({ id: `att_${Math.random().toString(36).slice(2, 9)}`, name: file.name, mediaType: file.type, dataUrl });
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-900 text-gray-200">
      {/* Tab strip */}
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-gray-700 overflow-x-auto shrink-0">
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          return (
            <div
              key={c.id}
              onClick={() => useAIConversationsStore.getState().setActive(c.id)}
              onDoubleClick={() => { setRenamingId(c.id); setRenameText(c.title); }}
              className={`group flex items-center gap-1 pl-2 pr-1 h-6 rounded text-[11px] cursor-pointer whitespace-nowrap shrink-0 ${
                isActive ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
              title={c.title}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={() => { useAIConversationsStore.getState().renameConversation(c.id, renameText); setRenamingId(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { useAIConversationsStore.getState().renameConversation(c.id, renameText); setRenamingId(null); }
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="w-24 bg-gray-950 text-white text-[11px] px-1 rounded outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="max-w-[120px] truncate">{c.title}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); useAIConversationsStore.getState().closeConversation(c.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-white"
                title="Close tab"
                aria-label="Close tab"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => useAIConversationsStore.getState().newConversation()}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 shrink-0"
          title="New conversation"
          aria-label="New conversation"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Transcript */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500 italic leading-relaxed">
            Ask about the drawing, request a change, or attach an image for the AI to analyze.
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} onApplyAction={applyAction} applyDisabled={loading} />
          ))
        )}
        {loading ? <div className="text-[11px] text-gray-500 italic pl-1">AI is thinking…</div> : null}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-700 p-2 space-y-2 shrink-0">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-gray-300">
                {a.mediaType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.dataUrl} alt={a.name} className="w-5 h-5 object-cover rounded" />
                ) : null}
                <span className="max-w-[100px] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-gray-400 hover:text-white"
                  aria-label="Remove attachment"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 shrink-0"
            title="Attach image / file"
            aria-label="Attach image or file"
          >
            <Paperclip size={15} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            rows={2}
            placeholder="Message (Enter to send, Shift+Enter for newline)"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-blue-500 resize-none"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || (draft.trim().length === 0 && attachments.length === 0)}
            className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shrink-0"
            title="Send"
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  onApplyAction,
  applyDisabled,
}: {
  message: DrawingChatMessage & { attachments?: { name: string; mediaType: string; dataUrl: string }[] };
  onApplyAction: (action: DrawingChatAction) => void;
  applyDisabled: boolean;
}) {
  const isUser = message.role === 'USER';
  const action = message.action;
  const showApply = !!action && action.type !== 'NO_ACTION';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
        isUser ? 'bg-blue-700 text-white' : 'bg-gray-800 border border-gray-700 text-gray-100'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {message.attachments.map((a, i) =>
              a.mediaType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={a.dataUrl} alt={a.name} className="max-h-32 rounded border border-white/20" />
              ) : (
                <span key={i} className="text-[10px] underline">{a.name}</span>
              ),
            )}
          </div>
        )}
        {action ? (
          <div className="mt-1.5 pt-1.5 border-t border-dashed border-white/20 text-[10px] flex items-center gap-2 flex-wrap">
            <span><strong>Action:</strong> {action.type}{action.description ? ` — ${action.description}` : ''}</span>
            {showApply ? (
              <button
                onClick={() => onApplyAction(action)}
                disabled={applyDisabled}
                className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-2 py-0.5 text-[10px] font-semibold"
              >
                Apply
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
