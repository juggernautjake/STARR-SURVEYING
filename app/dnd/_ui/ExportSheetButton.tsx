'use client';
// app/dnd/_ui/ExportSheetButton.tsx — export a character sheet with everything on it (owner 2026-07-18): as
// JSON, as a self-contained HTML file, or as a PDF via the browser's Print (Save as PDF) on the HTML export.
// All three hit GET /api/dnd/characters/[id]/export?format=… — the server builds the file; the button just
// triggers the download or opens the print view.
import { useState } from 'react';

export default function ExportSheetButton({ characterId }: { characterId: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  // Download a format as a file (json / html).
  async function download(format: 'json' | 'html') {
    setBusy(format);
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}/export?format=${format}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disp = res.headers.get('Content-Disposition') ?? '';
      const nameMatch = disp.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = nameMatch?.[1] ?? `character.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  // PDF = the HTML export opened in a new window, then its print dialog (Save as PDF). The document carries
  // print CSS so it lays out cleanly.
  async function printPdf() {
    setBusy('pdf');
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}/export?format=html`);
      if (!res.ok) return;
      const html = await res.text();
      const w = window.open('', '_blank');
      if (!w) return; // popup blocked — the user can still use HTML export + print
      w.document.open();
      w.document.write(html);
      w.document.close();
      // Give the browser a tick to lay out (and load the inlined images) before printing.
      w.onload = () => setTimeout(() => w.print(), 300);
    } finally {
      setBusy(null);
    }
  }

  const btn: React.CSSProperties = { padding: '5px 12px', fontSize: 12, cursor: 'pointer', border: '1px solid var(--hx-line, #2a3b47)', borderRadius: 5, background: 'none', color: 'var(--hx-muted, #8aa0ab)' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted, #8aa0ab)' }}>Export</span>
      <button type="button" style={btn} disabled={!!busy} onClick={() => printPdf()} title="Open a print view — choose “Save as PDF”.">{busy === 'pdf' ? '…' : '🖨 PDF'}</button>
      <button type="button" style={btn} disabled={!!busy} onClick={() => download('html')} title="Download a self-contained HTML file of the whole sheet.">{busy === 'html' ? '…' : '🌐 HTML'}</button>
      <button type="button" style={btn} disabled={!!busy} onClick={() => download('json')} title="Download the full character data as JSON.">{busy === 'json' ? '…' : '{ } JSON'}</button>
    </div>
  );
}
