// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import WorkflowStepper from '../components/WorkflowStepper';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import PropertySearchPanel from '../components/PropertySearchPanel';
import DataPointsPanel from '../components/DataPointsPanel';
import DiscrepancyPanel from '../components/DiscrepancyPanel';
import SourceDocumentViewer from '../components/SourceDocumentViewer';
import DrawingCanvas, { type UserAnnotation } from '../components/DrawingCanvas';
import ElementDetailPanel from '../components/ElementDetailPanel';
import DrawingViewToolbar from '../components/DrawingViewToolbar';
import DrawingPreferencesPanel, { DEFAULT_PREFERENCES, type DrawingPreferences } from '../components/DrawingPreferencesPanel';
import DrawingToolsSidebar, { DEFAULT_TOOL_SETTINGS, type DrawingTool, type ToolSettings } from '../components/DrawingToolsSidebar';
import DrawingSaveDialog from '../components/DrawingSaveDialog';
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

  // Drawing tools state
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [annotationHistory, setAnnotationHistory] = useState<UserAnnotation[][]>([]);
  const [annotationFuture, setAnnotationFuture] = useState<UserAnnotation[][]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [originalElements, setOriginalElements] = useState<DrawingElement[]>([]);
  const [originalAnnotations, setOriginalAnnotations] = useState<UserAnnotation[]>([]);
  // Per-element original state map for individual revert
  const originalElementsMap = useRef<Map<string, DrawingElement>>(new Map());
  const [showSaveDialog, setShowSaveDialog] = useState<'save' | 'export' | null>(null);

  // UI tooltip toggle — user can turn descriptive tooltips on/off
  const [showUITooltips, setShowUITooltips] = useState(true);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(message: string, type: 'error' | 'success' | 'info' = 'error') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  // Loading states for async operations
  const [savingDrawing, setSavingDrawing] = useState(false);

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
      } catch { /* polling errors are non-critical */ }
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
    } catch {
      showToast('Failed to load drawings. Please try again.');
    }
  }, [projectId]);

  const loadDrawingDetail = useCallback(async (drawingId: string) => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveDrawing(data.drawing);
        const elements = data.elements || [];
        setDrawingElements(elements);
        // Store original state for reset (both array and per-element map)
        setOriginalElements(elements);
        const map = new Map<string, DrawingElement>();
        for (const el of elements) {
          map.set(el.id, JSON.parse(JSON.stringify(el)));
        }
        originalElementsMap.current = map;
        setOriginalAnnotations([]);
        setAnnotations([]);
        setAnnotationHistory([]);
        setAnnotationFuture([]);
        setHasUnsavedChanges(false);
        setLastSavedAt(data.drawing.updated_at || null);
        // Generate SVG client-side via API
        const svgRes = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}/svg?viewMode=${viewMode}`);
        if (svgRes.ok) {
          const svgData = await svgRes.json();
          setDrawingSvg(svgData.svg || '');
        }
      }
    } catch {
      showToast('Failed to load drawing details. Please try again.');
    }
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
    } catch {
      showToast('Failed to update element. Please try again.');
    }
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

  // Annotation undo/redo
  function handleAnnotationsChange(newAnnotations: UserAnnotation[]) {
    setAnnotationHistory(prev => [...prev, annotations]);
    setAnnotationFuture([]);
    setAnnotations(newAnnotations);
  }

  function handleUndo() {
    if (annotationHistory.length === 0) return;
    const prev = annotationHistory[annotationHistory.length - 1];
    setAnnotationFuture(f => [...f, annotations]);
    setAnnotations(prev);
    setAnnotationHistory(h => h.slice(0, -1));
  }

  function handleRedo() {
    if (annotationFuture.length === 0) return;
    const next = annotationFuture[annotationFuture.length - 1];
    setAnnotationHistory(h => [...h, annotations]);
    setAnnotations(next);
    setAnnotationFuture(f => f.slice(0, -1));
  }

  // Track unsaved changes whenever annotations or elements change
  function handleAnnotationsChangeTracked(newAnnotations: UserAnnotation[]) {
    handleAnnotationsChange(newAnnotations);
    setHasUnsavedChanges(true);
  }

  // Mark element modifications as user-modified and track unsaved state
  async function handleTrackedElementUpdate(elementId: string, updates: Record<string, unknown>) {
    // If position/geometry/style changes, mark as user_modified
    const structuralKeys = ['geometry', 'svg_path', 'style', 'attributes'];
    const isStructural = Object.keys(updates).some(k => structuralKeys.includes(k));
    const tracked = isStructural ? { ...updates, user_modified: true } : updates;
    await handleElementUpdate(elementId, tracked);
    setHasUnsavedChanges(true);
  }

  // Revert a single element to its original AI-generated state
  async function handleRevertElement(elementId: string) {
    const original = originalElementsMap.current.get(elementId);
    if (!original) return;
    // Restore the original geometry, style, attributes, and clear user_modified
    const revertUpdates: Record<string, unknown> = {
      geometry: original.geometry,
      svg_path: original.svg_path,
      style: original.style,
      attributes: original.attributes,
      user_modified: false,
    };
    await handleElementUpdate(elementId, revertUpdates);
    setHasUnsavedChanges(true);
    // Update selected element if it's the one being reverted
    if (selectedElement?.id === elementId) {
      setSelectedElement(prev => prev ? { ...prev, ...revertUpdates, user_modified: false } as DrawingElement : null);
    }
  }

  // Save to database
  async function handleSaveToDb(name?: string) {
    if (!activeDrawing) return;
    setSavingDrawing(true);
    try {
      const payload: Record<string, unknown> = {
        annotations,
        preferences: drawingPrefs,
      };
      if (name) payload.name = name;

      const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ save: true, ...payload }),
      });
      if (res.ok) {
        setLastSavedAt(new Date().toISOString());
        setHasUnsavedChanges(false);
        setOriginalElements([...drawingElements]);
        setOriginalAnnotations([...annotations]);
        showToast('Drawing saved successfully.', 'success');
        if (name) {
          setActiveDrawing({ ...activeDrawing, name });
          loadDrawings();
        }
      } else {
        showToast('Failed to save drawing. Please try again.');
      }
    } catch {
      showToast('Failed to save drawing. Check your connection and try again.');
    }
    setSavingDrawing(false);
    setShowSaveDialog(null);
  }

  // Export drawing as JSON file
  function handleExportJson(fileName?: string) {
    if (!activeDrawing) return;
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      drawing: {
        id: activeDrawing.id,
        name: activeDrawing.name,
        version: activeDrawing.version,
        canvas_config: activeDrawing.canvas_config,
        title_block: activeDrawing.title_block,
        overall_confidence: activeDrawing.overall_confidence,
      },
      elements: drawingElements.map(el => ({
        id: el.id,
        element_type: el.element_type,
        feature_class: el.feature_class,
        geometry: el.geometry,
        svg_path: el.svg_path,
        attributes: el.attributes,
        style: el.style,
        layer: el.layer,
        z_index: el.z_index,
        visible: el.visible,
        locked: el.locked,
        confidence_score: el.confidence_score,
        confidence_factors: el.confidence_factors,
        source_references: el.source_references,
        user_modified: el.user_modified,
        user_notes: el.user_notes,
      })),
      annotations,
      preferences: drawingPrefs,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName || activeDrawing.name || 'drawing'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveDialog(null);
  }

  // Reset to original (regenerated) version
  function handleResetOriginal() {
    if (!window.confirm('This will discard ALL changes and reset the drawing to its original generated version. Continue?')) return;
    if (originalElements.length > 0) {
      setDrawingElements(originalElements);
    }
    setAnnotations([]);
    setAnnotationHistory([]);
    setAnnotationFuture([]);
    setHasUnsavedChanges(true);
    setSelectedElement(null);
  }

  // Reset to last saved version
  function handleResetLastSaved() {
    if (!lastSavedAt) return;
    if (!window.confirm('Revert to the last saved version? Unsaved changes will be lost.')) return;
    if (activeDrawing) {
      loadDrawingDetail(activeDrawing.id);
    }
    setAnnotations(originalAnnotations);
    setAnnotationHistory([]);
    setAnnotationFuture([]);
    setHasUnsavedChanges(false);
    setSelectedElement(null);
  }

  // Keyboard shortcuts for drawing tools + undo/redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!activeDrawing) return;

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }

      // Tool shortcuts (single letter, no modifiers)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const shortcutMap: Record<string, DrawingTool> = {
        v: 'select', h: 'pan', l: 'line', p: 'polyline', r: 'rectangle',
        c: 'circle', f: 'freehand', t: 'text_type', w: 'text_write',
        a: 'callout', d: 'dimension', s: 'symbol', i: 'image',
        m: 'measure', e: 'eraser',
      };
      const tool = shortcutMap[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDrawing, handleUndo, handleRedo]);

  // ── Beforeunload: warn user about unsaved changes ──────────────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ── Auto-save: save drawing state every 60 seconds if unsaved changes ───
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    if (!activeDrawing || !hasUnsavedChanges) return;

    autoSaveTimerRef.current = setInterval(async () => {
      if (!activeDrawing || !hasUnsavedChanges) return;
      try {
        const payload: Record<string, unknown> = {
          annotations,
          preferences: drawingPrefs,
        };
        const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ save: true, ...payload }),
        });
        if (res.ok) {
          setLastSavedAt(new Date().toISOString());
          setHasUnsavedChanges(false);
          setOriginalElements([...drawingElements]);
          setOriginalAnnotations([...annotations]);
        }
      } catch {
        // Auto-save failure is non-critical; user still has the beforeunload guard
      }
    }, 60000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [activeDrawing, hasUnsavedChanges, annotations, drawingPrefs, projectId, drawingElements]);

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
                onClick={() => {
                  if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave without saving?')) return;
                  setActiveDrawing(null); setDrawingElements([]); setDrawingSvg(''); setSelectedElement(null); setShowPrefsPanel(false);
                  setCanvasZoom(1); setHasUnsavedChanges(false);
                }}
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
                onExportJson={() => setShowSaveDialog('export')}
                onSaveToDb={() => setShowSaveDialog('save')}
                isSaving={savingDrawing}
                onResetOriginal={handleResetOriginal}
                onResetLastSaved={handleResetLastSaved}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={annotationHistory.length > 0}
                canRedo={annotationFuture.length > 0}
                zoom={canvasZoom}
                onZoomIn={() => setCanvasZoom(prev => Math.min(10, prev * 1.3))}
                onZoomOut={() => setCanvasZoom(prev => Math.max(0.1, prev / 1.3))}
                onZoomReset={() => setCanvasZoom(1)}
                elementCount={drawingElements.length}
                visibleCount={drawingElements.filter(e => e.visible).length}
                modifiedCount={drawingElements.filter(e => e.user_modified).length}
                overallConfidence={activeDrawing.overall_confidence ?? null}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSavedAt={lastSavedAt}
                showUITooltips={showUITooltips}
                onToggleUITooltips={() => setShowUITooltips(prev => !prev)}
              />

              {/* Main workspace: tools + canvas + side panels */}
              <div className="research-drawing__workspace">
                {/* Tools sidebar (left) */}
                <DrawingToolsSidebar
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  settings={toolSettings}
                  onSettingsChange={setToolSettings}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={annotationHistory.length > 0}
                  canRedo={annotationFuture.length > 0}
                  showUITooltips={showUITooltips}
                />

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
                      activeTool={activeTool}
                      toolSettings={toolSettings}
                      onElementClick={(el) => setSelectedElement(el)}
                      onElementModified={(id, changes) => handleTrackedElementUpdate(id, changes)}
                      onRevertElement={handleRevertElement}
                      annotations={annotations}
                      onAnnotationsChange={handleAnnotationsChangeTracked}
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
                    onToggleVisibility={(id, vis) => handleTrackedElementUpdate(id, { visible: vis })}
                    onToggleLock={(id, lock) => handleTrackedElementUpdate(id, { locked: lock })}
                    onUpdateNotes={(id, notes) => handleTrackedElementUpdate(id, { user_notes: notes })}
                    onStyleChange={(id, style) => handleTrackedElementUpdate(id, { style: { ...selectedElement.style, ...style } })}
                    onViewSource={(docId, excerpt) => {
                      const doc = documents.find(d => d.id === docId);
                      if (doc) {
                        setViewerDoc(doc);
                        setViewerHighlight(excerpt);
                      }
                    }}
                    onRevertElement={handleRevertElement}
                    showUITooltips={showUITooltips}
                  />
                )}
              </div>

              {/* Drawing info footer */}
              <div className="research-drawing__info">
                <span>{activeDrawing.name} (v{activeDrawing.version})</span>
                {hasUnsavedChanges && (
                  <span className="research-drawing__info-unsaved">Unsaved changes</span>
                )}
                {lastSavedAt && !hasUnsavedChanges && (
                  <span className="research-drawing__info-saved">Saved {new Date(lastSavedAt).toLocaleTimeString()}</span>
                )}
                {activeDrawing.comparison_notes && (
                  <span className="research-drawing__info-notes">{activeDrawing.comparison_notes}</span>
                )}
              </div>

              {/* Save/Export dialog */}
              <DrawingSaveDialog
                isOpen={showSaveDialog !== null}
                mode={showSaveDialog || 'save'}
                currentName={activeDrawing.name}
                onSave={(name) => {
                  if (showSaveDialog === 'save') handleSaveToDb(name);
                  else handleExportJson(name);
                }}
                onCancel={() => setShowSaveDialog(null)}
              />
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

      {/* Toast notification */}
      {toast && (
        <div
          className={`research-toast research-toast--${toast.type}`}
          role="alert"
          onClick={() => setToast(null)}
        >
          <span className="research-toast__icon">
            {toast.type === 'error' ? '!' : toast.type === 'success' ? '\u2713' : 'i'}
          </span>
          <span className="research-toast__message">{toast.message}</span>
          <button className="research-toast__close" onClick={() => setToast(null)} aria-label="Dismiss">&times;</button>
        </div>
      )}
    </div>
  );
}
