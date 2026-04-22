// AIChatPanel.tsx — Collapsible AI chat assistant for the Testing Lab
'use client';

import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

interface AIChatPanelProps {
  context?: string;
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export default function AIChatPanel({ context, isOpen, onClose, initialMessage }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [initialSent, setInitialSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send initialMessage when panel opens
  useEffect(() => {
    if (isOpen && initialMessage && !initialSent) {
      setInitialSent(true);
      sendMessage(initialMessage);
    }
    if (!isOpen) {
      setInitialSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMessage]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // Placeholder for streaming assistant response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/admin/research/testing/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: { type: string; text?: string; error?: string };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }
          if (event.type === 'text' && event.text) {
            assistantText += event.text;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: assistantText };
              return updated;
            });
          } else if (event.type === 'error') {
            throw new Error(event.error ?? 'Stream error');
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Request failed';
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: msg, error: true };
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleClear = () => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setStreaming(false);
  };

  if (!isOpen) return null;

  return (
    <div className="testing-lab__ai-chat" role="dialog" aria-label="AI Chat Assistant">
      {/* Header */}
      <div className="testing-lab__ai-chat__header">
        <span className="testing-lab__ai-chat__title">🤖 AI Assistant</span>
        <div className="testing-lab__ai-chat__header-actions">
          <button
            className="testing-lab__ai-chat__icon-btn"
            onClick={() => setShowContext((v) => !v)}
            title="Toggle context"
          >
            {showContext ? '▴' : '▾'} Context
          </button>
          <button
            className="testing-lab__ai-chat__icon-btn"
            onClick={handleClear}
            title="Clear chat"
          >
            Clear
          </button>
          <button
            className="testing-lab__ai-chat__close-btn"
            onClick={onClose}
            aria-label="Close AI chat"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Context panel */}
      {showContext && context && (
        <div className="testing-lab__ai-chat__context">
          <pre className="testing-lab__ai-chat__context-text">{context}</pre>
        </div>
      )}

      {/* Messages */}
      <div className="testing-lab__ai-chat__messages">
        {messages.length === 0 && (
          <div className="testing-lab__ai-chat__empty">
            Ask anything about the STARR pipeline, code, or test results.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`testing-lab__ai-chat__msg testing-lab__ai-chat__msg--${msg.role}${msg.error ? ' testing-lab__ai-chat__msg--error' : ''}`}
          >
            <span className="testing-lab__ai-chat__msg-role">
              {msg.role === 'user' ? 'You' : 'AI'}
            </span>
            <div className="testing-lab__ai-chat__msg-content">
              {msg.content || (msg.role === 'assistant' && streaming && i === messages.length - 1 ? (
                <span className="testing-lab__ai-chat__typing">…</span>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="testing-lab__ai-chat__input-row">
        <textarea
          ref={inputRef}
          className="testing-lab__ai-chat__input"
          rows={2}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        <button
          className="testing-lab__ai-chat__send-btn"
          onClick={() => sendMessage(input)}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}
