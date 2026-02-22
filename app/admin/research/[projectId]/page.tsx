// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import WorkflowStepper from '../components/WorkflowStepper';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import PropertySearchPanel from '../components/PropertySearchPanel';
import DataPointsPanel from '../components/DataPointsPanel';
import DiscrepancyPanel from '../components/DiscrepancyPanel';
import SourceDocumentViewer from '../components/SourceDocumentViewer';
import DrawingCanvas from '../components/DrawingCanvas';
import ElementDetailPanel from '../components/ElementDetailPanel';
import DrawingViewToolbar from '../components/DrawingViewToolbar';
import DrawingPreferencesPanel, { DEFAULT_PREFERENCES, type DrawingPreferences } from '../components/DrawingPreferencesPanel';
import type { ResearchProject, ResearchDocument, DrawingElement, RenderedDrawing, ViewMode, WorkflowStep } from '@/types/research';
import { WORKFLOW_STEPS } from '@/types/research';

export default function ResearchProjectPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { reportPageError } = usePageError('ResearchProjectPage');

  const [project, setProject] = useState<ResearchProject | null>(null);
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ document_count: 0, data_point_count: 0, discrepancy_count: 0, resolved_count: 0 });

  // Analysis state
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<{
    documentsTotal: number;
    documentsAnalyzed: number;
    dataPointCount: number;
    discrepancyCount: number;
  } | null>(null);

  // Review state
  const [reviewTab, setReviewTab] = useState<'data' | 'discrepancies'>('data');
  const [viewerDoc, setViewerDoc] = useState<ResearchDocument | null>(null);
  const [viewerHighlight, setViewerHighlight] = useState<string | undefined>(undefined);

  // Drawing state
  const [drawings, setDrawings] = useState<(RenderedDrawing & { element_count: number })[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<RenderedDrawing | null>(null);
  const [drawingElements, setDrawingElements] = useState<DrawingElement[]>([]);
  const [drawingSvg, setDrawingSvg] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [selectedElement, setSelectedElement] = useState<DrawingElement | null>(null);
  const [generatingDrawing, setGeneratingDrawing] = useState(false);
  const [drawingPrefs, setDrawingPrefs] = useState<DrawingPreferences>(DEFAULT_PREFERENCES);
  const [showPrefsPanel, setShowPrefsPanel] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);

  const userRole = (session?.user as any)?.role || 'employee';

  if (sessionStatus === 'authenticated' && userRole !== 'admin') {
    router.replace('/admin/dashboard');
    return null;
  }

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setStats({
          document_count: data.project.document_count || 0,
          data_point_count: data.project.data_point_count || 0,
          discrepancy_count: data.project.discrepancy_count || 0,
          resolved_count: data.project.resolved_count || 0,
        });
      } else {
        router.replace('/admin/research');
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load project' });
    }
  }, [projectId]);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load documents' });
    }
  }, [projectId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadProject(), loadDocuments()]);
      setLoading(false);
    }
    if (projectId) init();
  }, [projectId, loadProject, loadDocuments]);

  // Poll for document processing status changes
  useEffect(() => {
    const hasPending = documents.some(d => d.processing_status === 'pending' || d.processing_status === 'extracting');
    if (!hasPending) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

  // Poll for analysis progress when analyzing
  useEffect(() => {
    if (project?.status !== 'analyzing') {
      setAnalysisStatus(null);
      return;
    }

    async function pollStatus() {
      try {
        const res = await fetch(`/api/admin/research/${projectId}/analyze`);
        if (res.ok) {
          const data = await res.json();
          setAnalysisStatus({
            documentsTotal: data.documentsTotal,
            documentsAnalyzed: data.documentsAnalyzed,
            dataPointCount: data.dataPointCount,
            discrepancyCount: data.discrepancyCount,
          });
          // If analysis completed, reload the project
          if (data.status !== 'analyzing') {
            loadProject();
            loadDocuments();
          }
        }
      } catch { /* ignore polling errors */ }
    }

    pollStatus();
    const interval = setInterval(pollStatus, 4000);
    return () => clearInterval(interval);
  }, [project?.status, projectId, loadProject, loadDocuments]);

  async function handleStatusUpdate(newStatus: WorkflowStep) {
    try {
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'update status' });
    }
  }

  async function handleStartAnalysis() {
    if (analysisStarting) return;
    setAnalysisStarting(true);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        // Reload project to get "analyzing" status
        await loadProject();
      } else {
        const err = await res.json();
        reportPageError(new Error(err.error || 'Failed to start analysis'), { element: 'start analysis' });
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'start analysis' });
    }

    setAnalysisStarting(false);
  }

  // Drawing functions
  const loadDrawings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings`);
      if (res.ok) {
        const data = await res.json();
        setDrawings(data.drawings || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const loadDrawingDetail = useCallback(async (drawingId: string) => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveDrawing(data.drawing);
        setDrawingElements(data.elements || []);
        // Generate SVG client-side via API
        const svgRes = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}/svg?viewMode=${viewMode}`);
        if (svgRes.ok) {
          const svgData = await svgRes.json();
          setDrawingSvg(svgData.svg || '');
        }
      }
    } catch { /* ignore */ }
  }, [projectId, viewMode]);

  async function handleGenerateDrawing() {
    if (generatingDrawing) return;
    setGeneratingDrawing(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        await loadDrawings();
        await loadDrawingDetail(data.drawing_id);
        loadProject();
      } else {
        const err = await res.json();
        reportPageError(new Error(err.error || 'Failed to generate drawing'), { element: 'generate drawing' });
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'generate drawing' });
    }
    setGeneratingDrawing(false);
  }

  async function handleElementUpdate(elementId: string, updates: Record<string, unknown>) {
    if (!activeDrawing) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ element_id: elementId, updates }),
      });
      if (res.ok) {
        // Refresh elements
        await loadDrawingDetail(activeDrawing.id);
      }
    } catch { /* ignore */ }
  }

  function handleExportSvg() {
    if (!drawingSvg) return;
    const blob = new Blob([drawingSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDrawing?.name || 'drawing'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load drawings when entering drawing step
  useEffect(() => {
    if (project?.status === 'drawing' || project?.status === 'verifying' || project?.status === 'complete') {
      loadDrawings();
    }
  }, [project?.status, loadDrawings]);

  function getNextStep(): { key: WorkflowStep; label: string } | null {
    if (!project) return null;
    const currentIndex = WORKFLOW_STEPS.findIndex(s => s.key === project.status);
    if (currentIndex < WORKFLOW_STEPS.length - 1) {
      return WORKFLOW_STEPS[currentIndex + 1];
    }
    return null;
  }

  function canAdvance(): boolean {
    if (!project) return false;
    switch (project.status) {
      case 'upload':
        return documents.length > 0 && documents.some(d => d.processing_status === 'extracted' || d.processing_status === 'analyzed');
      case 'configure':
        return false; // Must use "Run Analysis" button instead
      case 'review':
        return true;
      case 'drawing':
        return true;
      default:
        return false;
    }
  }

  if (!session?.user || loading) {
    return (
      <div className="research-page">
        <div className="research-card research-card--skeleton" style={{ maxWidth: 600, margin: '2rem auto' }}>
          <div className="research-card__skeleton-line research-card__skeleton-line--medium" />
          <div className="research-card__skeleton-line research-card__skeleton-line--long" />
          <div className="research-card__skeleton-line research-card__skeleton-line--short" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const nextStep = getNextStep();
  const extractedDocs = documents.filter(d => d.processing_status === 'extracted' || d.processing_status === 'analyzed');

  return (
    <div className="research-page">
      {/* Back link */}
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => router.push('/admin/research')}
          style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
        >
          &larr; All Research Projects
        </button>
      </div>

      {/* Header */}
      <div className="research-page__header">
        <div>
          <h1 className="research-page__title">{project.name}</h1>
          {project.property_address && (
            <div style={{ color: '#6B7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {project.property_address}
              {project.county && `, ${project.county} County`}
              {project.state && `, ${project.state}`}
            </div>
          )}
        </div>
      </div>

      {/* Workflow stepper */}
      <WorkflowStepper currentStatus={project.status} />

      {/* Quick stats */}
      <div className="research-hub__stats">
        <div className="research-hub__stat">
          <div className="research-hub__stat-value">{stats.document_count}</div>
          <div className="research-hub__stat-label">Documents</div>
        </div>
        <div className="research-hub__stat">
          <div className="research-hub__stat-value">{stats.data_point_count}</div>
          <div className="research-hub__stat-label">Data Points</div>
        </div>
        <div className="research-hub__stat">
          <div className="research-hub__stat-value">{stats.discrepancy_count}</div>
          <div className="research-hub__stat-label">Discrepancies</div>
        </div>
        <div className="research-hub__stat">
          <div className="research-hub__stat-value">
            {stats.discrepancy_count > 0
              ? `${stats.resolved_count}/${stats.discrepancy_count}`
              : '-'}
          </div>
          <div className="research-hub__stat-label">Resolved</div>
        </div>
      </div>

      {/* Advance button (for non-configure steps) */}
      {nextStep && project.status !== 'configure' && project.status !== 'analyzing' && (
        <div style={{ margin: '1.25rem 0' }}>
          <button
            className="research-page__new-btn"
            onClick={() => handleStatusUpdate(nextStep.key)}
            disabled={!canAdvance()}
            style={!canAdvance() ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            Continue to {nextStep.label} &rarr;
          </button>
          {project.status === 'upload' && !canAdvance() && documents.length === 0 && (
            <span style={{ color: '#9CA3AF', fontSize: '0.8rem', marginLeft: '0.75rem' }}>
              Upload at least one document to continue
            </span>
          )}
        </div>
      )}

      {/* Step content */}
      {project.status === 'upload' && (
        <>
          <DocumentUploadPanel
            projectId={projectId}
            documents={documents}
            onDocumentsChanged={() => { loadDocuments(); loadProject(); }}
          />
          <PropertySearchPanel
            projectId={projectId}
            defaultAddress={project.property_address || ''}
            defaultCounty={project.county || ''}
            onImported={() => { loadDocuments(); loadProject(); }}
          />
        </>
      )}

      {project.status === 'configure' && (
        <div className="research-configure">
          <div className="research-configure__header">
            <h2 className="research-configure__title">Configure &amp; Run Analysis</h2>
            <p className="research-configure__desc">
              The AI will analyze {extractedDocs.length} document{extractedDocs.length !== 1 ? 's' : ''} and extract
              surveying data including bearings, distances, monuments, curve data, legal descriptions, and more.
            </p>
          </div>

          <div className="research-configure__summary">
            <div className="research-configure__summary-item">
              <span className="research-configure__summary-label">Documents ready:</span>
              <span className="research-configure__summary-value">{extractedDocs.length}</span>
            </div>
            <div className="research-configure__summary-item">
              <span className="research-configure__summary-label">Document types:</span>
              <span className="research-configure__summary-value">
                {[...new Set(extractedDocs.map(d => d.document_type).filter(Boolean))].join(', ').replace(/_/g, ' ') || 'Various'}
              </span>
            </div>
          </div>

          <div className="research-configure__actions">
            <button
              className="research-page__new-btn"
              onClick={handleStartAnalysis}
              disabled={analysisStarting || extractedDocs.length === 0}
              style={(analysisStarting || extractedDocs.length === 0) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {analysisStarting ? 'Starting...' : 'Run AI Analysis'}
            </button>
            {extractedDocs.length === 0 && (
              <span style={{ color: '#EF4444', fontSize: '0.8rem', marginLeft: '0.75rem' }}>
                No extracted documents available. Go back to Upload to add documents.
              </span>
            )}
          </div>
        </div>
      )}

      {project.status === 'analyzing' && (
        <div className="research-analyzing">
          <div className="research-analyzing__spinner" />
          <div className="research-analyzing__title">AI Analysis in Progress</div>
          <div className="research-analyzing__text">
            The AI is processing your documents and extracting surveying data.
            This may take a few minutes depending on the number and size of documents.
          </div>
          {analysisStatus && (
            <div className="research-analyzing__progress">
              <div className="research-analyzing__progress-bar">
                <div
                  className="research-analyzing__progress-fill"
                  style={{
                    width: analysisStatus.documentsTotal > 0
                      ? `${(analysisStatus.documentsAnalyzed / analysisStatus.documentsTotal) * 100}%`
                      : '0%'
                  }}
                />
              </div>
              <div className="research-analyzing__progress-text">
                {analysisStatus.documentsAnalyzed} of {analysisStatus.documentsTotal} documents analyzed
                {analysisStatus.dataPointCount > 0 && ` — ${analysisStatus.dataPointCount} data points extracted`}
              </div>
            </div>
          )}
        </div>
      )}

      {project.status === 'review' && (
        <div className="research-review">
          {/* Review tabs */}
          <div className="research-review__tabs">
            <button
              className={`research-review__tab ${reviewTab === 'data' ? 'research-review__tab--active' : ''}`}
              onClick={() => setReviewTab('data')}
            >
              Extracted Data
            </button>
            <button
              className={`research-review__tab ${reviewTab === 'discrepancies' ? 'research-review__tab--active' : ''}`}
              onClick={() => setReviewTab('discrepancies')}
            >
              Discrepancies
              {stats.discrepancy_count > 0 && (
                <span className="research-review__tab-badge">{stats.discrepancy_count}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {reviewTab === 'data' && (
            <DataPointsPanel
              projectId={projectId}
              onViewSource={(docId, excerpt) => {
                const doc = documents.find(d => d.id === docId);
                if (doc) {
                  setViewerDoc(doc);
                  setViewerHighlight(excerpt);
                }
              }}
            />
          )}
          {reviewTab === 'discrepancies' && (
            <DiscrepancyPanel
              projectId={projectId}
              onCountChange={(total, resolved) => {
                setStats(prev => ({
                  ...prev,
                  discrepancy_count: total,
                  resolved_count: resolved,
                }));
              }}
            />
          )}
        </div>
      )}

      {project.status === 'drawing' && (
        <div className="research-drawing">
          {/* Drawing list (when no active drawing) */}
          {!activeDrawing && (
            <div className="research-drawing__controls">
              <div className="research-drawing__controls-left">
                <h2 className="research-drawing__title">Plat Drawing</h2>
                {drawings.length === 0 && (
                  <button
                    className="research-page__new-btn"
                    onClick={handleGenerateDrawing}
                    disabled={generatingDrawing}
                  >
                    {generatingDrawing ? 'Generating...' : 'Generate Drawing'}
                  </button>
                )}
              </div>
            </div>
          )}

          {drawings.length > 0 && !activeDrawing && (
            <div className="research-drawing__list">
              {drawings.map(d => (
                <button
                  key={d.id}
                  className="research-drawing__list-item"
                  onClick={() => loadDrawingDetail(d.id)}
                >
                  <span>{d.name}</span>
                  <span className="research-drawing__list-meta">
                    {d.element_count} elements | {d.overall_confidence ? `${Math.round(d.overall_confidence)}%` : '--'}
                  </span>
                </button>
              ))}
              <button
                className="research-drawing__list-item research-drawing__list-item--new"
                onClick={handleGenerateDrawing}
                disabled={generatingDrawing}
              >
                {generatingDrawing ? 'Generating...' : '+ New Drawing Version'}
              </button>
            </div>
          )}

          {/* Active drawing: toolbar + canvas + panels */}
          {activeDrawing && (
            <>
              {/* Back button */}
              <button
                className="research-drawing__back-btn"
                onClick={() => { setActiveDrawing(null); setDrawingElements([]); setDrawingSvg(''); setSelectedElement(null); setShowPrefsPanel(false); }}
                style={{ marginBottom: '0.5rem' }}
              >
                &larr; Back to Drawing List
              </button>

              {/* View toolbar */}
              <DrawingViewToolbar
                viewMode={viewMode}
                onViewModeChange={(mode) => {
                  setViewMode(mode);
                  if (activeDrawing) loadDrawingDetail(activeDrawing.id);
                }}
                preferences={drawingPrefs}
                onPreferencesChange={setDrawingPrefs}
                onOpenSettings={() => setShowPrefsPanel(!showPrefsPanel)}
                onExportSvg={handleExportSvg}
                zoom={canvasZoom}
                onZoomIn={() => setCanvasZoom(prev => Math.min(10, prev * 1.3))}
                onZoomOut={() => setCanvasZoom(prev => Math.max(0.1, prev / 1.3))}
                onZoomReset={() => setCanvasZoom(1)}
                elementCount={drawingElements.length}
                visibleCount={drawingElements.filter(e => e.visible).length}
                overallConfidence={activeDrawing.overall_confidence}
              />

              {/* Main workspace: canvas + side panels */}
              <div className="research-drawing__workspace">
                {/* Preferences panel (slides in from left) */}
                {showPrefsPanel && (
                  <DrawingPreferencesPanel
                    preferences={drawingPrefs}
                    onChange={setDrawingPrefs}
                    onClose={() => setShowPrefsPanel(false)}
                    onReset={() => setDrawingPrefs(DEFAULT_PREFERENCES)}
                  />
                )}

                {/* Canvas */}
                <div className={`research-drawing__canvas-wrap ${selectedElement ? 'research-drawing__canvas-wrap--with-panel' : ''}`}>
                  {drawingSvg ? (
                    <DrawingCanvas
                      drawing={activeDrawing}
                      elements={drawingElements}
                      viewMode={viewMode}
                      svgContent={drawingSvg}
                      preferences={drawingPrefs}
                      onElementClick={(el) => setSelectedElement(el)}
                      onElementModified={(id, changes) => handleElementUpdate(id, changes)}
                      zoom={canvasZoom}
                      onZoomChange={setCanvasZoom}
                    />
                  ) : (
                    <div className="research-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                      <div style={{ color: '#9CA3AF', fontSize: '0.88rem' }}>Loading drawing...</div>
                    </div>
                  )}
                </div>

                {/* Element detail panel (right side) */}
                {selectedElement && (
                  <ElementDetailPanel
                    element={selectedElement}
                    onClose={() => setSelectedElement(null)}
                    onToggleVisibility={(id, vis) => handleElementUpdate(id, { visible: vis })}
                    onToggleLock={(id, lock) => handleElementUpdate(id, { locked: lock })}
                    onUpdateNotes={(id, notes) => handleElementUpdate(id, { user_notes: notes })}
                    onStyleChange={(id, style) => handleElementUpdate(id, { style: { ...selectedElement.style, ...style } })}
                    onViewSource={(docId, excerpt) => {
                      const doc = documents.find(d => d.id === docId);
                      if (doc) {
                        setViewerDoc(doc);
                        setViewerHighlight(excerpt);
                      }
                    }}
                  />
                )}
              </div>

              {/* Drawing info footer */}
              <div className="research-drawing__info">
                <span>{activeDrawing.name} (v{activeDrawing.version})</span>
                {activeDrawing.comparison_notes && (
                  <span className="research-drawing__info-notes">{activeDrawing.comparison_notes}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {(project.status === 'verifying' || project.status === 'complete') && (
        <div className="research-page__empty">
          <div className="research-page__empty-icon">&#128679;</div>
          <div className="research-page__empty-title">Coming Soon</div>
          <div className="research-page__empty-text">
            The {project.status} step will be implemented in upcoming phases.
          </div>
        </div>
      )}

      {/* Document list (shown on all steps for reference) */}
      {project.status !== 'upload' && documents.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
            Project Documents ({documents.length})
          </h3>
          {documents.map(doc => (
            <div key={doc.id} className="research-upload__doc" style={{ cursor: 'default' }}>
              <div className="research-upload__doc-icon">
                {doc.source_type === 'manual_entry' ? '📝' : '📄'}
              </div>
              <div className="research-upload__doc-info">
                <div className="research-upload__doc-name">
                  {doc.document_label || doc.original_filename || 'Untitled'}
                </div>
                <div className="research-upload__doc-meta">
                  {doc.document_type && <span>{doc.document_type.replace(/_/g, ' ')}</span>}
                  {doc.extracted_text_method && <span>{doc.extracted_text_method}</span>}
                  <span style={{
                    color: doc.processing_status === 'analyzed' ? '#059669'
                      : doc.processing_status === 'analyzing' ? '#F59E0B'
                      : doc.processing_status === 'error' ? '#EF4444'
                      : '#9CA3AF',
                    fontWeight: 600,
                  }}>
                    {doc.processing_status === 'analyzed' ? 'Analyzed'
                      : doc.processing_status === 'analyzing' ? 'Analyzing...'
                      : doc.processing_status === 'extracted' ? 'Extracted'
                      : doc.processing_status === 'error' ? 'Error'
                      : doc.processing_status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Source document viewer modal */}
      {viewerDoc && (
        <SourceDocumentViewer
          document={viewerDoc}
          highlightText={viewerHighlight}
          onClose={() => { setViewerDoc(null); setViewerHighlight(undefined); }}
        />
      )}
    </div>
  );
}
