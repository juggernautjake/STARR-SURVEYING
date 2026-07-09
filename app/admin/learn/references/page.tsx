'use client';
// /admin/learn/references — the FS tutor's reference library manager (admin).
// Upload trusted documents (PDFs, Word, notes, scans); each is extracted, chunked, and
// embedded so the AI tutor retrieves from them before answering. List / delete here.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Upload, Trash2, FileText, BookOpen, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface RefDoc {
  id: string;
  title: string;
  source: string | null;
  kind: string;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  char_count: number;
  chunk_count: number;
  notes: string | null;
  original_filename: string | null;
  created_at: string;
}

const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.csv,.rtf,image/png,image/jpeg,image/webp';

export default function ReferenceLibraryPage() {
  const [docs, setDocs] = useState<RefDoc[] | null>(null);
  const [embeddingsOn, setEmbeddingsOn] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await fetch('/api/admin/learn/references');
      if (r.status === 403) { setForbidden(true); setDocs([]); return; }
      const j = await r.json();
      setDocs((j.documents ?? []) as RefDoc[]);
      setEmbeddingsOn(j.embeddingsConfigured !== false);
    } catch {
      setDocs([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim() || file.name);
      if (source.trim()) fd.append('source', source.trim());
      if (notes.trim()) fd.append('notes', notes.trim());
      const r = await fetch('/api/admin/learn/references', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg(j.warning ? { kind: 'warn', text: j.warning } : { kind: 'ok', text: `Added “${title.trim() || file.name}” — ${j.chunks} passage(s) indexed.` });
        setFile(null); setTitle(''); setSource(''); setNotes('');
        if (fileRef.current) fileRef.current.value = '';
        load();
      } else {
        setMsg({ kind: 'err', text: j.error || 'Upload failed.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: RefDoc) {
    if (!window.confirm(`Delete “${d.title}” from the reference library? The tutor will no longer draw from it. This can't be undone.`)) return;
    setDocs((list) => (list ? list.filter((x) => x.id !== d.id) : list));
    await fetch(`/api/admin/learn/references/${d.id}`, { method: 'DELETE' }).catch(() => {});
  }

  const card: React.CSSProperties = { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 18 };
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--border, #cbd5e1)', borderRadius: 8, fontSize: 14 };

  if (forbidden) {
    return <div style={{ maxWidth: 720, margin: '40px auto', padding: 20 }}><p>You don&apos;t have access to the reference library. (Content-manager/admin only.)</p></div>;
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>
      <Link href="/admin/learn/exam-prep/sit" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted, #64748b)', textDecoration: 'none', fontSize: 13, marginBottom: 12 }}>
        <ArrowLeft size={15} /> Back to FS prep
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, margin: '0 0 4px' }}>
        <BookOpen size={24} /> Tutor Reference Library
      </h1>
      <p style={{ color: 'var(--muted, #64748b)', margin: '0 0 20px', fontSize: 14, lineHeight: 1.55 }}>
        Upload the trusted materials the AI tutor should answer from — textbooks, the FS reference handbook, your notes, scans.
        Each is read, split into passages, and embedded so the tutor retrieves the right passage and answers <strong>from your sources first</strong>,
        only going to the web when the library doesn&apos;t cover a question.
      </p>

      {!embeddingsOn && (
        <div style={{ ...card, borderColor: '#f59e0b', background: '#fffbeb', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
          <AlertTriangle size={18} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, color: '#92400e' }}>
            <strong>Semantic search is off.</strong> Set <code>VOYAGE_API_KEY</code> on the server to embed documents. You can still upload now —
            documents are stored and will become searchable once a key is set and they&apos;re re-uploaded.
          </div>
        </div>
      )}

      {/* Upload */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><Upload size={17} /> Add a document</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span style={{ ...input, width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f1f5f9', cursor: 'pointer' }}>
              <FileText size={15} /> Choose file
            </span>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} />
            <span style={{ fontSize: 13, color: file ? 'var(--text,#0f172a)' : 'var(--muted,#94a3b8)' }}>{file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : 'PDF, Word, text, or an image/scan'}</span>
          </label>
          <input style={input} placeholder="Title (e.g. NCEES FS Reference Handbook)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input style={input} placeholder="Source / citation (optional — shown with retrieved passages)" value={source} onChange={(e) => setSource(e.target.value)} />
          <textarea style={{ ...input, resize: 'vertical' }} rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div>
            <button
              onClick={upload}
              disabled={!file || busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, border: 'none', cursor: !file || busy ? 'default' : 'pointer', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, opacity: !file || busy ? 0.55 : 1 }}
            >
              {busy ? <><Loader2 size={16} className="spin" /> Processing…</> : <>Upload &amp; index</>}
            </button>
          </div>
          {msg && (
            <div style={{ fontSize: 13.5, color: msg.kind === 'err' ? '#dc2626' : msg.kind === 'warn' ? '#b45309' : '#059669', display: 'flex', gap: 6, alignItems: 'center' }}>
              {msg.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {msg.text}
            </div>
          )}
        </div>
      </div>

      {/* Library */}
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Library {docs && <span style={{ color: 'var(--muted,#94a3b8)', fontWeight: 400 }}>({docs.length})</span>}</h2>
      {!docs ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted,#64748b)' }}><Loader2 size={16} className="spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <p style={{ color: 'var(--muted,#64748b)' }}>No documents yet. Upload your first reference above.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ ...card, padding: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{d.title}</span>
                  <StatusBadge status={d.status} />
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted,#94a3b8)' }}>{d.kind}</span>
                </div>
                {d.source && <div style={{ fontSize: 13, color: 'var(--muted,#64748b)', marginTop: 2 }}>{d.source}</div>}
                <div style={{ fontSize: 12, color: 'var(--muted,#94a3b8)', marginTop: 4 }}>
                  {d.status === 'ready' ? `${d.chunk_count} passage(s) · ${d.char_count.toLocaleString()} chars` : d.original_filename}
                </div>
                {d.error && <div style={{ fontSize: 12, color: d.status === 'failed' ? '#dc2626' : '#b45309', marginTop: 4 }}>{d.error}</div>}
              </div>
              <button onClick={() => remove(d)} title="Delete from the library" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12.5 }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    ready: { bg: '#dcfce7', fg: '#166534', label: 'Ready' },
    processing: { bg: '#e0e7ff', fg: '#3730a3', label: 'Processing' },
    failed: { bg: '#fee2e2', fg: '#991b1b', label: 'Failed' },
  };
  const s = map[status] ?? map.processing;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.fg }}>{s.label}</span>;
}
