'use client';

// app/admin/research/[projectId]/_sections/FinalDocumentTab.tsx — Phase B1a.

// Sixth extraction from `page.tsx`: the Final Job Package tab — the deliverable a surveyor hands
// over.
//
// ── WHY A TAB, AND NOT THE WHOLE STAGE ──────────────────────────────────────────────────────────
//
// The four earlier extractions each took a whole stage. That does not work for `jobprep`, which
// references **79 identifiers** from the page: the CAD canvas, the annotation history, the undo
// stack, tool settings, layer state. A component with a 79-prop interface moves the complexity
// without reducing any of it and adds a prop-drilling layer on top — measured before attempting it,
// which is why it was not attempted.
//
// So the stage comes apart from the inside, largest coherent piece first. This tab is display and
// three actions; it holds no state of its own.
//
// The Drawing tab is where the other seventy-odd live. Its state wants extracting into a hook
// BEFORE its markup moves — a different technique from the mechanical moves so far, and its own
// slice rather than something smuggled into this one.

import React from 'react';
import {
  Check, ClipboardList, DraftingCompass, FileText, Link2, Loader2, MapPin,
  Paperclip, Pencil, Printer, Upload,
} from 'lucide-react';
import SurveyPlanPanel from '../../components/SurveyPlanPanel';
import ExportPanel from '../../components/ExportPanel';
import type { ResearchProject, ResearchDocument } from '@/types/research';
import type { ComparisonResult, ExportFormat, RenderedDrawing, ViewMode } from '@/types/research';

/** The three tabs of the job-prep stage. Mirrors the page's own state union. */
export type JobPrepTab = 'drawing' | 'fieldplan' | 'finaldoc';

export interface FinalDocumentTabProps {
  project: ResearchProject;
  projectId: string;
  documents: ResearchDocument[];
  stats: {
    document_count: number;
    data_point_count: number;
    discrepancy_count: number;
    resolved_count: number;
  };
  /** The drawing the package is built around. The page's own type — approximating it here is
   *  what produced three rounds of tsc corrections on this extraction. */
  activeDrawing: RenderedDrawing | null;
  comparisonResult: ComparisonResult | null;
  sanitizedDrawingSvg: string | null;
  jobNotes: string;
  savingJobNotes: boolean;
  isExporting: boolean;
  isOpeningInCAD: boolean;
  lastExport: { format: string; filename: string } | null;
  showUITooltips: boolean;
  onJobNotesChange: (value: string) => void;
  /** Signatures taken from ExportPanel, not approximated — see the note above the interface. */
  onExport: (format: ExportFormat, viewMode: ViewMode) => Promise<void>;
  onOpenInCAD: () => Promise<void>;
  onMarkComplete: () => void;
  onChangeTab: (tab: JobPrepTab) => void;
}

/** Placeholder for the job-notes box. Moved with the tab that shows it. */
const JOB_NOTES_PLACEHOLDER =
  'Notes for the crew: access, gates, dogs, where to park, who to call on site.';

export default function FinalDocumentTab({
  project, projectId, documents, stats, activeDrawing, comparisonResult, sanitizedDrawingSvg,
  jobNotes, savingJobNotes, isExporting, isOpeningInCAD, lastExport, showUITooltips,
  onJobNotesChange, onExport, onOpenInCAD, onMarkComplete, onChangeTab,
}: FinalDocumentTabProps) {
  return (
    <div>
      <div className="research-final-doc">
        {/* Header bar */}
        <div className="research-final-doc__header">
          <div>
            <h2 className="research-final-doc__title">
              <Printer size={15} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Final Job Package — {project.name}
            </h2>
            <p className="research-final-doc__subtitle">
              {project.property_address}{project.county ? ` · ${project.county} County` : ''}{project.state ? `, ${project.state}` : ''}
            </p>
          </div>
          <div className="research-final-doc__actions">
            <button
              className="research-final-doc__btn research-final-doc__btn--primary"
              onClick={() => window.print()}
            >
              <Printer size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Print
            </button>
            {activeDrawing && (
              <button
                className="research-final-doc__btn research-final-doc__btn--secondary"
                onClick={onOpenInCAD}
                disabled={isOpeningInCAD}
              >
                {isOpeningInCAD ? <><Loader2 size={14} className="animate-spin" style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Opening…</> : <><Pencil size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Open in CAD Editor</>}
              </button>
            )}
          </div>
        </div>

        <div className="research-final-doc__body">
          {/* Property Summary */}
          <div className="research-final-doc__section">
            <h3 className="research-final-doc__section-title"><MapPin size={16} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Property Summary</h3>
            <div className="research-final-doc__property-grid">
              {project.property_address && (
                <div className="research-final-doc__prop-item">
                  <div className="research-final-doc__prop-label">Address</div>
                  <div className="research-final-doc__prop-value">{project.property_address}</div>
                </div>
              )}
              {project.county && (
                <div className="research-final-doc__prop-item">
                  <div className="research-final-doc__prop-label">County</div>
                  <div className="research-final-doc__prop-value">{project.county} County, {project.state}</div>
                </div>
              )}
              {project.parcel_id && (
                <div className="research-final-doc__prop-item">
                  <div className="research-final-doc__prop-label">Parcel ID</div>
                  <div className="research-final-doc__prop-value">{project.parcel_id}</div>
                </div>
              )}
              {project.legal_description_summary && (
                <div className="research-final-doc__prop-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="research-final-doc__prop-label">Legal Description</div>
                  <div className="research-final-doc__prop-value" style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem', fontWeight: 400 }}>{project.legal_description_summary}</div>
                </div>
              )}
              <div className="research-final-doc__prop-item">
                <div className="research-final-doc__prop-label">Documents Analyzed</div>
                <div className="research-final-doc__prop-value">{stats.document_count}</div>
              </div>
              <div className="research-final-doc__prop-item">
                <div className="research-final-doc__prop-label">Data Points</div>
                <div className="research-final-doc__prop-value">{stats.data_point_count}</div>
              </div>
              <div className="research-final-doc__prop-item">
                <div className="research-final-doc__prop-label">Discrepancies</div>
                <div className="research-final-doc__prop-value" style={{ color: stats.discrepancy_count > 0 ? '#B45309' : '#047857' }}>
                  {stats.discrepancy_count > 0
                    ? `${stats.resolved_count}/${stats.discrepancy_count} resolved`
                    : 'None'}
                </div>
              </div>
              <div className="research-final-doc__prop-item">
                <div className="research-final-doc__prop-label">Prepared</div>
                <div className="research-final-doc__prop-value">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
            </div>
          </div>

          {/* Drawing */}
          {activeDrawing && sanitizedDrawingSvg && (
            <div className="research-final-doc__section">
              <h3 className="research-final-doc__section-title"><Pencil size={16} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Boundary Drawing</h3>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', maxHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}
                dangerouslySetInnerHTML={{ __html: sanitizedDrawingSvg }}
              />
              <div style={{ fontSize: '0.78rem', color: 'var(--theme-fg-secondary, #4B5563)', marginTop: '0.5rem', textAlign: 'center' }}>
                {activeDrawing.name} — v{activeDrawing.version}
                {activeDrawing.overall_confidence ? ` — ${Math.round(activeDrawing.overall_confidence)}% confidence` : ''}
              </div>
            </div>
          )}
          {!activeDrawing && (
            <div className="research-final-doc__section">
              <h3 className="research-final-doc__section-title"><Pencil size={16} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Boundary Drawing</h3>
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--theme-fg-secondary, #4B5563)', background: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 8 }}>
                <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "center", color: "var(--text-tertiary, #4B5563)" }}><DraftingCompass size={24} strokeWidth={1.5} /></div>
                <div style={{ fontSize: '0.88rem' }}>
                  No drawing generated yet. Go to the <button onClick={() => onChangeTab('drawing')} style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}>Drawing tab</button> to generate an AI boundary drawing.
                </div>
              </div>
            </div>
          )}

          {/* Field Plan */}
          <div className="research-final-doc__section">
            <h3 className="research-final-doc__section-title"><ClipboardList size={16} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />AI Field Plan</h3>
            <SurveyPlanPanel projectId={projectId} />
          </div>

          {/* Screenshots / Documents / Deed & Plat images from research */}
          {(() => {
            // Include all document types that have viewable images: deeds, plats,
            // aerial photos, appraisal records, easements, surveys, and any file
            // with an image extension or MIME type
            const viewableTypes = new Set([
              'aerial_photo', 'deed', 'plat', 'survey', 'easement',
              'appraisal_record', 'restriction', 'screenshot', 'other',
            ]);
            const imageDocs = documents.filter(d =>
              (d.document_type && viewableTypes.has(d.document_type)) ||
              (d.file_type && (
                d.file_type.startsWith('image/') ||
                d.file_type === 'image' ||
                /^(png|jpg|jpeg|webp|gif|tiff|bmp)$/i.test(d.file_type)
              )) ||
              (d.storage_url && /\.(png|jpg|jpeg|webp|gif|tiff|bmp)$/i.test(d.storage_url)) ||
              (d.pages_pdf_url)
            );
            if (imageDocs.length === 0) return null;

            // Group by document type for organized display
            const grouped = new Map<string, typeof imageDocs>();
            for (const doc of imageDocs) {
              const key = doc.document_type?.replace(/_/g, ' ') ?? 'other';
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(doc);
            }

            return (
              <div className="research-final-doc__section">
                <h3 className="research-final-doc__section-title">Research Documents &amp; Screenshots ({imageDocs.length})</h3>
                {[...grouped.entries()].map(([groupName, groupDocs]) => (
                  <div key={groupName} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--theme-fg-secondary, #374151)', textTransform: 'capitalize', marginBottom: '0.5rem' }}>
                      {groupName} ({groupDocs.length})
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                      {groupDocs.map(doc => {
                        const isPdf = doc.file_type === 'pdf' || doc.pages_pdf_url?.endsWith('.pdf');
                        const imgSrc = doc.storage_url ?? doc.pages_pdf_url ?? '';
                        return (
                          <div key={doc.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#F8FAFC' }}>
                            {imgSrc && !isPdf && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imgSrc}
                                alt={doc.document_label || doc.original_filename || 'Research image'}
                                style={{ width: '100%', height: 200, objectFit: 'contain', display: 'block', background: '#fff', cursor: 'pointer' }}
                                loading="lazy"
                                onClick={() => window.open(imgSrc, '_blank')}
                              />
                            )}
                            {imgSrc && isPdf && (
                              <div
                                style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', cursor: 'pointer' }}
                                onClick={() => window.open(imgSrc, '_blank')}
                              >
                                <div style={{ textAlign: 'center', color: 'var(--theme-fg-secondary, #374151)' }}>
                                  <div style={{ fontSize: '2rem' }}>PDF</div>
                                  <div style={{ fontSize: '0.7rem' }}>Click to view</div>
                                </div>
                              </div>
                            )}
                            <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.75rem', color: 'var(--theme-fg-secondary, #4B5563)', borderTop: '1px solid #E5E7EB' }}>
                              <div style={{ fontWeight: 500, color: 'var(--theme-fg-secondary, #374151)' }}>
                                {doc.document_label || doc.original_filename || doc.document_type?.replace(/_/g, ' ') || 'Document'}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                {imgSrc && (
                                  <a href={imgSrc} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', fontSize: '0.78rem' }}>
                                    Open full size
                                  </a>
                                )}
                                {doc.source_url && (
                                  <a href={doc.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', fontSize: '0.78rem' }}>
                                    Source
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Editable Job Notes ── */}
          <div className="research-final-doc__section research-final-doc__section--editable">
            <h3 className="research-final-doc__section-title">
              <FileText size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Job Notes &amp; Field Instructions
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 400, color: 'var(--theme-fg-secondary, #6B7280)', textTransform: 'none', letterSpacing: 0 }}>
                {savingJobNotes ? '⏳ Saving…' : '(editable — auto-saved)'}
              </span>
            </h3>
            <textarea
              className="research-final-doc__notes-textarea"
              value={jobNotes}
              onChange={e => onJobNotesChange(e.target.value)}
              placeholder={JOB_NOTES_PLACEHOLDER}
              rows={10}
            />
          </div>

          {/* Export Options */}
          {activeDrawing && (
            <div className="research-final-doc__section">
              <h3 className="research-final-doc__section-title"><Upload size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Export Drawing Files</h3>
              <ExportPanel
                projectId={projectId}
                drawingId={activeDrawing.id}
                drawingName={activeDrawing.name}
                comparison={comparisonResult}
                onExport={onExport}
                onOpenInCAD={onOpenInCAD}
                onMarkComplete={onMarkComplete}
                isExporting={isExporting}
                isOpeningInCAD={isOpeningInCAD}
                lastExport={lastExport}
                showUITooltips={showUITooltips}
              />
            </div>
          )}

          {/* Source documents index */}
          {documents.length > 0 && (
            <div className="research-final-doc__section">
              <h3 className="research-final-doc__section-title"><Paperclip size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Source Documents ({documents.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {documents.map((doc, i) => (
                  <div key={doc.id} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', padding: '0.4rem 0', borderBottom: i < documents.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <span style={{ color: 'var(--theme-fg-secondary, #6B7280)', width: 20, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 600, color: 'var(--theme-fg-primary, #1F2937)', flex: 1 }}>
                      {doc.document_label || doc.original_filename || doc.document_type?.replace(/_/g, ' ') || 'Document'}
                    </span>
                    {doc.source_url && (
                      <a href={doc.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', flexShrink: 0 }}>
                        <Link2 size={13} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Source
                      </a>
                    )}
                    <span style={{ color: doc.processing_status === 'analyzed' ? '#059669' : '#6B7280', flexShrink: 0 }}>
                      {doc.processing_status === 'analyzed' ? <><Check size={12} style={{ verticalAlign: "-1px", marginRight: "0.2rem" }} />Analyzed</> : doc.processing_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
