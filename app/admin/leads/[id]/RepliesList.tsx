'use client';
// app/admin/leads/[id]/RepliesList.tsx
//
// LR1 of lead-reply-expansion-2026-06-18.md — renders the per-lead
// outbound reply history below the Notes card on /admin/leads/[id].
// Reads from `GET /api/admin/leads/[id]/reply` which already exists
// (shipped in edfdc2c).
//
// Renders:
//   - One entry per reply, newest-first.
//   - Sender + sent_at + subject (one-line summary).
//   - Click to expand: full HTML body + attachments list + send_error
//     when the send failed (so the surveyor sees what didn't go out).
//   - Auto-refreshes when the parent passes a new `refreshKey` (the
//     ReplyDialog's onSent bumps this so the new row appears
//     immediately without a manual reload).

import { useCallback, useEffect, useState } from 'react';

interface LeadReply {
  id: string;
  lead_id: string;
  sender_email: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  attachments: Array<{ name: string; size: number; storage_path?: string }>;
  resend_id: string | null;
  send_error: string | null;
  sent_at: string;
  // LR7 — inbound (customer) vs outbound (office) rows live in the
  // same table; render-time bubble styling forks on this.
  direction?: 'outbound' | 'inbound' | null;
  from_email?: string | null;
}

interface RepliesListProps {
  leadId: string;
  /** Bump to force a refetch (parent uses this when a fresh reply
   *  was just sent). */
  refreshKey?: number;
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function senderName(email: string): string {
  const local = (email.split('@')[0] ?? email);
  return local
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

export default function RepliesList({ leadId, refreshKey }: RepliesListProps) {
  const [replies, setReplies] = useState<LeadReply[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchReplies = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/reply`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(body.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      const data = (await res.json()) as { replies: LeadReply[] };
      setReplies(data.replies ?? []);
      setStatus('ok');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }, [leadId]);

  useEffect(() => { void fetchReplies(); }, [fetchReplies, refreshKey]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <section
      className="lead-detail__card lead-detail__card--wide"
      data-section="replies"
      data-testid="lead-replies"
    >
      <h3 className="lead-detail__card-title">
        <span aria-hidden>📨</span> Sent replies
        <span className="lead-detail__counter" data-testid="lead-replies-count">
          {replies?.length ?? 0}
        </span>
      </h3>

      {status === 'loading' && (
        <p className="lead-detail__empty" data-testid="lead-replies-loading">
          Loading reply history…
        </p>
      )}

      {status === 'error' && (
        <p className="lead-detail__empty" data-testid="lead-replies-error" style={{ color: '#B91C1C' }}>
          Couldn&apos;t load the reply history — {errorMsg}.{' '}
          <button
            type="button"
            onClick={() => void fetchReplies()}
            style={retryBtnStyle}
          >
            Retry
          </button>
        </p>
      )}

      {status === 'ok' && replies && replies.length === 0 && (
        <p className="lead-detail__empty">
          The office hasn&apos;t replied to this lead yet.
        </p>
      )}

      {status === 'ok' && replies && replies.length > 0 && (
        <ul className="lead-detail__replies" data-testid="lead-replies-list">
          {replies.map((r) => {
            const isOpen = expanded.has(r.id);
            const failed = r.send_error != null;
            // LR7 — direction is null on existing pre-LR7 rows; treat
            // null + 'outbound' identically so the legacy data still
            // renders correctly.
            const isInbound = r.direction === 'inbound';
            const senderEmail = isInbound
              ? (r.from_email ?? r.sender_email)
              : r.sender_email;
            return (
              <li
                key={r.id}
                className="lead-detail__reply"
                data-failed={failed ? 'true' : undefined}
                data-direction={isInbound ? 'inbound' : 'outbound'}
                data-testid="lead-replies-row"
              >
                <button
                  type="button"
                  className="lead-detail__reply-header"
                  onClick={() => toggle(r.id)}
                  aria-expanded={isOpen}
                  data-testid="lead-replies-toggle"
                >
                  <span
                    aria-hidden
                    data-testid="lead-replies-direction-glyph"
                    style={{
                      fontSize: '0.95rem',
                      color: isInbound ? '#047857' : '#1D3095',
                    }}
                    title={isInbound ? 'From customer' : 'From office'}
                  >
                    {isInbound ? '↘' : '↗'}
                  </span>
                  <span className="lead-detail__reply-sender">
                    {senderName(senderEmail)}
                  </span>
                  <span className="lead-detail__reply-subject" title={r.subject}>
                    {r.subject}
                  </span>
                  <span className="lead-detail__reply-time">
                    {fmtTimestamp(r.sent_at)}
                  </span>
                  <span className="lead-detail__reply-chevron" aria-hidden>
                    {isOpen ? '▾' : '▸'}
                  </span>
                </button>

                {isOpen && (
                  <div className="lead-detail__reply-body">
                    {failed && (
                      <p
                        data-testid="lead-replies-error-banner"
                        style={errorBannerStyle}
                      >
                        ⚠ Send failed: {r.send_error}
                      </p>
                    )}
                    <div className="lead-detail__reply-meta">
                      <span>
                        <strong>To:</strong>{' '}
                        <a href={`mailto:${r.to_email}`} className="lead-detail__link">
                          {r.to_email}
                        </a>
                      </span>
                      {r.resend_id && (
                        <span className="lead-detail__reply-meta-id" title="Resend message id">
                          ↗ {r.resend_id.slice(0, 12)}…
                        </span>
                      )}
                    </div>
                    {/* Outbound: the Reply composer wrote the body as
                        fully-styled HTML; render via
                        dangerouslySetInnerHTML (writers are
                        admin-gated so the trust boundary is safe).
                        Inbound: providers don't always carry HTML, so
                        fall back to the text body wrapped in a
                        pre-wrap div. */}
                    {r.body_html ? (
                      <div
                        className="lead-detail__reply-html"
                        dangerouslySetInnerHTML={{ __html: r.body_html }}
                      />
                    ) : r.body_text ? (
                      <div
                        className="lead-detail__reply-html"
                        style={{ whiteSpace: 'pre-wrap' }}
                        data-testid="lead-replies-text-fallback"
                      >
                        {r.body_text}
                      </div>
                    ) : null}
                    {r.attachments.length > 0 && (
                      <ul
                        className="lead-detail__reply-attachments"
                        data-testid="lead-replies-attachments"
                      >
                        {r.attachments.map((a, i) => {
                          const label = (
                            <>
                              <span aria-hidden style={{ fontSize: '1.1rem' }}>📎</span>
                              <span>{a.name}</span>
                              <span style={{ color: '#6B7280', fontSize: '0.72rem' }}>
                                {fmtBytes(a.size)}
                              </span>
                            </>
                          );
                          return (
                            <li key={`${a.name}-${i}`}>
                              {a.storage_path ? (
                                <a
                                  href={a.storage_path}
                                  className="lead-detail__reply-attachment"
                                  download={a.name}
                                >
                                  {label}
                                </a>
                              ) : (
                                <span
                                  className="lead-detail__reply-attachment lead-detail__reply-attachment--info"
                                  title="Bytes were sent in the email; not archived to the bucket."
                                >
                                  {label}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .lead-detail__replies {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .lead-detail__reply {
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          overflow: hidden;
          background: white;
        }
        .lead-detail__reply[data-failed="true"] {
          border-color: #FCA5A5;
          background: #FEF2F2;
        }
        /* LR7 — inbound rows get a soft green tint to distinguish
           customer-from-office in the thread without a wall of
           identical bubbles. */
        .lead-detail__reply[data-direction="inbound"] {
          border-color: color-mix(in srgb, #047857 28%, transparent);
          background: color-mix(in srgb, #047857 5%, white);
        }
        .lead-detail__reply-header {
          width: 100%;
          display: grid;
          /* LR7 — grid gains a leading direction-glyph column. The
             16px slot fits the ↗ / ↘ arrows without elbowing the
             sender / subject columns. */
          grid-template-columns: 16px minmax(110px, auto) 1fr auto auto;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 0.75rem;
          background: transparent;
          border: 0;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }
        .lead-detail__reply-header:hover {
          background: #F8FAFC;
        }
        .lead-detail__reply-sender {
          font-size: 0.85rem;
          font-weight: 600;
          color: #0F172A;
        }
        .lead-detail__reply-subject {
          font-size: 0.85rem;
          color: #1F2937;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lead-detail__reply-time {
          font-size: 0.75rem;
          color: #6B7280;
          white-space: nowrap;
        }
        .lead-detail__reply-chevron {
          color: #6B7280;
          font-size: 0.75rem;
          width: 12px;
          text-align: center;
        }
        .lead-detail__reply-body {
          padding: 0.6rem 0.85rem 0.9rem;
          border-top: 1px solid #F1F5F9;
          background: #F8FAFC;
        }
        .lead-detail__reply-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.78rem;
          color: #475569;
          margin-bottom: 0.5rem;
        }
        .lead-detail__reply-meta-id {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
        }
        .lead-detail__reply-html {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          padding: 0.75rem;
          font-size: 0.88rem;
          line-height: 1.55;
          color: #0F172A;
          overflow-wrap: anywhere;
        }
        .lead-detail__reply-html :global(p) { margin: 0 0 0.6rem; }
        .lead-detail__reply-html :global(p:last-child) { margin-bottom: 0; }
        .lead-detail__reply-html :global(a) { color: #1D3095; word-break: break-word; }
        .lead-detail__reply-html :global(blockquote) {
          border-left: 3px solid #E5E7EB;
          margin: 0.4rem 0;
          padding: 0 0 0 0.6rem;
          color: #475569;
        }
        .lead-detail__reply-html :global(ul),
        .lead-detail__reply-html :global(ol) {
          margin: 0.4rem 0 0.4rem 1.2rem;
          padding: 0;
        }
        .lead-detail__reply-attachments {
          list-style: none;
          padding: 0;
          margin: 0.6rem 0 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .lead-detail__reply-attachment {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: white;
          border: 1px solid #E5E7EB;
          font-size: 0.78rem;
          color: #1F2937;
          text-decoration: none;
        }
        a.lead-detail__reply-attachment:hover {
          border-color: #BFDBFE;
          color: #1D3095;
        }
        .lead-detail__reply-attachment--info {
          cursor: default;
        }
      `}</style>
    </section>
  );
}

const retryBtnStyle: React.CSSProperties = {
  marginLeft: 6,
  padding: '2px 8px',
  borderRadius: 6,
  border: '1px solid #FCA5A5',
  background: 'white',
  color: '#B91C1C',
  cursor: 'pointer',
  fontSize: '0.78rem',
};

const errorBannerStyle: React.CSSProperties = {
  background: '#FEF2F2',
  border: '1px solid #FCA5A5',
  borderRadius: 6,
  padding: '0.5rem 0.75rem',
  color: '#B91C1C',
  fontSize: '0.82rem',
  margin: '0 0 0.5rem 0',
};
