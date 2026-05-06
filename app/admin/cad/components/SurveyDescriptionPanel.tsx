'use client';
// app/admin/cad/components/SurveyDescriptionPanel.tsx
//
// Phase 7 §5.5 — survey description panel. Slide-in right
// sidebar that generates and surfaces the metes-and-bounds
// legal description, standard notes, certification block, and
// auto-fill title-block fields.
//
// Entry point: `useDeliveryStore.description`. When null, the
// panel renders a one-button empty state ("Generate") that
// runs `generateSurveyDescription(doc)` and lands the result
// in the store. Once present, the panel renders five
// collapsible sections:
//   1. Legal Description     — copy + edit
//   2. Survey Notes          — copy + add/remove/edit lines
//   3. Certification         — copy + edit
//   4. Title-Block Auto-Fill — apply to active title block
//   5. Revision History      — read-only audit trail
//
// Apply Title-Block writes the auto-fill fields back into the
// drawing document via `useDrawingStore.updateSettings` and
// records a USER revision entry. Regenerate re-runs the
// generator (preserving any prior surveyor edits as USER
// revisions in the trail).

import { useState } from 'react';

import {
  useDeliveryStore,
  useDrawingStore,
} from '@/lib/cad/store';
import {
  generateSurveyDescription,
  type DescriptionRevision,
  type SurveyDescription,
  type SurveyNote,
} from '@/lib/cad/delivery';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SurveyDescriptionPanel({ open, onClose }: Props) {
  const document = useDrawingStore((s) => s.document);
  const updateSettings = useDrawingStore((s) => s.updateSettings);
  const description = useDeliveryStore((s) => s.description);
  const setDescription = useDeliveryStore((s) => s.setDescription);
  const patchDescription = useDeliveryStore((s) => s.patchDescription);

  const [editingLegal, setEditingLegal] = useState(false);
  const [editingCert, setEditingCert] = useState(false);
  const [busy, setBusy] = useState<'GENERATE' | 'REGENERATE' | 'APPLY' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!open) return null;

  function clearAcks() {
    setError(null);
    setNote(null);
  }

  function handleGenerate(kind: 'GENERATE' | 'REGENERATE') {
    clearAcks();
    setBusy(kind);
    try {
      const fresh = generateSurveyDescription(document);
      if (!fresh) {
        setError(
          'No closed boundary polygon found. Draw or AI-generate a boundary before generating the description.'
        );
        return;
      }
      // On regenerate, prepend the prior revision history so
      // surveyor edits aren't lost on a re-run.
      if (kind === 'REGENERATE' && description) {
        fresh.revisions = [
          ...description.revisions,
          {
            at: new Date().toISOString(),
            by: 'AI',
            summary:
              'Re-generated from the current drawing state. ' +
              'Prior auto-fill fields replaced.',
          },
        ];
      }
      setDescription(fresh);
      setNote(
        kind === 'REGENERATE'
          ? 'Description re-generated.'
          : 'Description generated.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Generation failed: ${err.message}`
          : 'Generation failed (unknown error).'
      );
    } finally {
      setBusy(null);
    }
  }

  function handleCopy(text: string, label: string) {
    clearAcks();
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setError('Clipboard not available in this browser.');
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => setNote(`${label} copied to clipboard.`))
      .catch((err) => {
        setError(
          `Copy failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  }

  function handleApplyTitleBlock() {
    if (!description) return;
    clearAcks();
    setBusy('APPLY');
    try {
      const tb = document.settings.titleBlock;
      const notesLines: string[] = [tb.notes ?? ''];
      const upserts: Array<[RegExp, string]> = [];
      if (description.county) {
        upserts.push([/County\s*[:\-][^\n.;]*/i, `County: ${description.county}`]);
      }
      if (description.abstract) {
        upserts.push([
          /Abstract\s*(?:No\.?)?\s*[:\-][^\n.;]*/i,
          `Abstract No. ${description.abstract}`,
        ]);
      }
      if (description.survey) {
        upserts.push([
          /Survey\s*[:\-][^\n.;]*/i,
          `Survey: ${description.survey}`,
        ]);
      }
      if (description.floodZone) {
        const panelClause = description.floodPanel
          ? ` per Panel ${description.floodPanel}`
          : '';
        upserts.push([
          /Flood\s+Zone[^\n.;]*/i,
          `Flood Zone ${description.floodZone}${panelClause}`,
        ]);
      }
      let mergedNotes = notesLines.filter(Boolean).join(' ');
      for (const [pattern, replacement] of upserts) {
        if (pattern.test(mergedNotes)) {
          mergedNotes = mergedNotes.replace(pattern, replacement);
        } else {
          mergedNotes = mergedNotes.length > 0
            ? `${mergedNotes} ${replacement}.`
            : `${replacement}.`;
        }
      }
      updateSettings({
        titleBlock: {
          ...tb,
          projectName: description.projectName || tb.projectName,
          projectNumber: description.projectNumber ?? tb.projectNumber,
          clientName: description.clientName ?? tb.clientName,
          surveyDate: description.surveyDate || tb.surveyDate,
          notes: mergedNotes,
        },
      });
      const revision: DescriptionRevision = {
        at: new Date().toISOString(),
        by: 'USER',
        summary:
          'Applied auto-fill fields to the active title block ' +
          '(county / abstract / survey / flood / dates).',
      };
      patchDescription({
        revisions: [...description.revisions, revision],
      });
      setNote('Title-block fields applied.');
    } finally {
      setBusy(null);
    }
  }

  function handleEditLegal(next: string) {
    if (!description) return;
    if (next === description.legalDescription) {
      setEditingLegal(false);
      return;
    }
    patchDescription({
      legalDescription: next,
      revisions: [
        ...description.revisions,
        {
          at: new Date().toISOString(),
          by: 'USER',
          summary: 'Surveyor edited the legal description text.',
        },
      ],
    });
    setEditingLegal(false);
  }

  function handleEditCert(next: string) {
    if (!description) return;
    if (next === description.certificationText) {
      setEditingCert(false);
      return;
    }
    patchDescription({
      certificationText: next,
      revisions: [
        ...description.revisions,
        {
          at: new Date().toISOString(),
          by: 'USER',
          summary: 'Surveyor edited the certification block.',
        },
      ],
    });
    setEditingCert(false);
  }

  function handleNoteEdit(noteId: string, nextText: string) {
    if (!description) return;
    const trimmed = nextText.trim();
    const updated = description.surveyNotes.map((n) =>
      n.id === noteId ? { ...n, text: trimmed } : n
    );
    patchDescription({
      surveyNotes: updated,
      revisions: [
        ...description.revisions,
        {
          at: new Date().toISOString(),
          by: 'USER',
          summary: 'Surveyor edited a survey note.',
        },
      ],
    });
  }

  return (
    <aside style={styles.panel} role="dialog" aria-label="Survey description">
      <header style={styles.header}>
        <h2 style={styles.title}>Survey Description</h2>
        <div style={styles.headerActions}>
          {description ? (
            <button
              type="button"
              onClick={() => handleGenerate('REGENERATE')}
              disabled={busy !== null}
              style={busy ? styles.btnGhostDisabled : styles.btnGhost}
            >
              {busy === 'REGENERATE' ? 'Regenerating…' : 'Regenerate'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            style={styles.close}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {error ? <div style={styles.error}>{error}</div> : null}
      {note ? <div style={styles.note}>{note}</div> : null}

      {!description ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            Generate the metes-and-bounds legal description, standard
            notes, and title-block roll-up from the current drawing.
            Requires a closed boundary polygon.
          </p>
          <button
            type="button"
            onClick={() => handleGenerate('GENERATE')}
            disabled={busy !== null}
            style={busy ? styles.btnPrimaryDisabled : styles.btnPrimary}
          >
            {busy === 'GENERATE' ? 'Generating…' : 'Generate Description'}
          </button>
        </div>
      ) : (
        <div style={styles.body}>
          <Section
            title={`Legal Description · ${description.acreage.toFixed(4)} ac`}
            actions={
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      description.legalDescription,
                      'Legal description'
                    )
                  }
                  style={styles.smallBtn}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setEditingLegal((v) => !v)}
                  style={styles.smallBtn}
                >
                  {editingLegal ? 'Done' : 'Edit'}
                </button>
              </>
            }
          >
            {editingLegal ? (
              <EditableTextarea
                value={description.legalDescription}
                onCommit={handleEditLegal}
              />
            ) : (
              <pre style={styles.pre}>{description.legalDescription}</pre>
            )}
          </Section>

          <Section
            title={`Survey Notes · ${description.surveyNotes.length}`}
            actions={
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    description.surveyNotes.map((n) => n.text).join('\n\n'),
                    'Notes'
                  )
                }
                style={styles.smallBtn}
              >
                Copy
              </button>
            }
          >
            <ul style={styles.notesList}>
              {description.surveyNotes.map((note, i) => (
                <NoteRow
                  key={note.id}
                  index={i + 1}
                  note={note}
                  onEdit={handleNoteEdit}
                />
              ))}
            </ul>
          </Section>

          <Section
            title="Certification"
            actions={
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(description.certificationText, 'Certification')
                  }
                  style={styles.smallBtn}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCert((v) => !v)}
                  style={styles.smallBtn}
                >
                  {editingCert ? 'Done' : 'Edit'}
                </button>
              </>
            }
          >
            {editingCert ? (
              <EditableTextarea
                value={description.certificationText}
                onCommit={handleEditCert}
              />
            ) : (
              <p style={styles.paragraph}>{description.certificationText}</p>
            )}
          </Section>

          <Section
            title="Title-Block Auto-Fill"
            actions={
              <button
                type="button"
                onClick={handleApplyTitleBlock}
                disabled={busy !== null}
                style={busy ? styles.btnPrimaryDisabled : styles.btnPrimary}
              >
                {busy === 'APPLY' ? 'Applying…' : 'Apply'}
              </button>
            }
          >
            <TitleBlockGrid description={description} />
          </Section>

          <Section title={`Revisions · ${description.revisions.length}`}>
            <ul style={styles.revList}>
              {description.revisions
                .slice()
                .reverse()
                .map((r, i) => (
                  <li key={i} style={styles.revRow}>
                    <span style={styles.revAt}>
                      {new Date(r.at).toLocaleString()}
                    </span>
                    <span
                      style={{
                        ...styles.revBy,
                        background: r.by === 'AI' ? '#EEF2FF' : '#FEF3C7',
                        color: r.by === 'AI' ? '#3730A3' : '#78350F',
                      }}
                    >
                      {r.by}
                    </span>
                    <span style={styles.revSummary}>{r.summary}</span>
                  </li>
                ))}
            </ul>
          </Section>
        </div>
      )}
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.section}>
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        {actions ? <div style={styles.sectionActions}>{actions}</div> : null}
      </header>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

function EditableTextarea({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div style={styles.editorWrap}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
        style={styles.textarea}
      />
      <div style={styles.editorActions}>
        <button
          type="button"
          onClick={() => onCommit(value)}
          style={styles.smallBtn}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onCommit(draft)}
          style={styles.smallPrimaryBtn}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function NoteRow({
  index,
  note,
  onEdit,
}: {
  index: number;
  note: SurveyNote;
  onEdit: (id: string, nextText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  return (
    <li style={styles.noteRow}>
      <span style={styles.noteIndex}>{index}.</span>
      <div style={styles.noteBody}>
        <span style={styles.noteCategory}>{note.category}</span>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={styles.textarea}
          />
        ) : (
          <p style={styles.noteText}>{note.text}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          if (editing) onEdit(note.id, draft);
          setEditing((v) => !v);
        }}
        style={styles.smallBtn}
      >
        {editing ? 'Save' : 'Edit'}
      </button>
    </li>
  );
}

function TitleBlockGrid({ description }: { description: SurveyDescription }) {
  const cells: Array<[string, string | null]> = [
    ['County', description.county],
    ['State', description.state],
    ['Abstract', description.abstract],
    ['Survey', description.survey],
    ['Township', description.township],
    ['Range', description.range],
    ['Section', description.section],
    ['Acreage', description.acreage.toFixed(4)],
    ['Flood Zone', description.floodZone],
    ['Flood Panel', description.floodPanel],
    ['Project', description.projectName],
    ['Project #', description.projectNumber],
    ['Client', description.clientName],
    ['Survey Date', description.surveyDate],
  ];
  return (
    <div style={styles.tbGrid}>
      {cells.map(([label, value]) => (
        <div key={label} style={styles.tbCell}>
          <span style={styles.tbLabel}>{label}</span>
          <span style={styles.tbValue}>
            {value && String(value).length > 0 ? String(value) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 60,
    right: 0,
    bottom: 0,
    width: 440,
    background: '#FFFFFF',
    borderLeft: '1px solid #E2E5EB',
    boxShadow: '-8px 0 20px rgba(15, 23, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 940,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0, color: '#111827' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 6 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 16,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  empty: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  emptyText: {
    margin: 0,
    fontSize: 12,
    color: '#374151',
    lineHeight: 1.5,
  },
  body: {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  section: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#F1F5F9',
    borderBottom: '1px solid #E2E8F0',
    gap: 6,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    color: '#1F2937',
  },
  sectionActions: { display: 'flex', gap: 6 },
  sectionBody: { padding: 10 },
  pre: {
    margin: 0,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    fontSize: 12,
    color: '#111827',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.55,
  },
  paragraph: {
    margin: 0,
    fontSize: 12,
    color: '#374151',
    lineHeight: 1.5,
  },
  notesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  noteRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 8,
  },
  noteIndex: {
    fontSize: 11,
    color: '#6B7280',
    minWidth: 16,
    fontWeight: 600,
  },
  noteBody: { flex: 1 },
  noteCategory: {
    fontSize: 10,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    display: 'block',
  },
  noteText: {
    margin: 0,
    fontSize: 12,
    color: '#1F2937',
    lineHeight: 1.5,
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  editorWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  editorActions: {
    display: 'flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  tbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
  },
  tbCell: {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
  },
  tbLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 600,
  },
  tbValue: { fontSize: 12, color: '#111827' },
  revList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  revRow: {
    display: 'grid',
    gridTemplateColumns: 'auto auto 1fr',
    gap: 6,
    alignItems: 'baseline',
    fontSize: 11,
    color: '#374151',
  },
  revAt: { color: '#6B7280' },
  revBy: {
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
  revSummary: { color: '#1F2937' },
  smallBtn: {
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#1F2937',
    cursor: 'pointer',
  },
  smallPrimaryBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnPrimary: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnPrimaryDisabled: {
    background: '#94A3B8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#1F2937',
    cursor: 'pointer',
  },
  btnGhostDisabled: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#9CA3AF',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  error: {
    margin: '8px 12px 0',
    padding: 8,
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    borderRadius: 6,
    fontSize: 11,
  },
  note: {
    margin: '8px 12px 0',
    padding: 8,
    background: '#EEF2FF',
    border: '1px solid #C7D2FE',
    color: '#3730A3',
    borderRadius: 6,
    fontSize: 11,
  },
};
