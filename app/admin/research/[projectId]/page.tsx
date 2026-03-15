// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import WorkflowStepper from '../components/WorkflowStepper';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import ResearchAnalysisPanel from '../components/ResearchAnalysisPanel';
import DocumentDeepAnalysisPanel from '../components/DocumentDeepAnalysisPanel';
import DataPointsPanel from '../components/DataPointsPanel';
import DiscrepancyPanel from '../components/DiscrepancyPanel';
import SourceDocumentViewer from '../components/SourceDocumentViewer';
import DrawingCanvas, { type UserAnnotation } from '../components/DrawingCanvas';
import AnalysisSummary from '../components/AnalysisSummary';
import BriefingPanel from '../components/BriefingPanel';
import AnnotationLayerPanel, { type AnnotationLayer, createDefaultLayer } from '../components/AnnotationLayerPanel';
import CoordinateEntryPanel, { type TraverseVertex } from '../components/CoordinateEntryPanel';
import VertexEditPanel, { type VertexData } from '../components/VertexEditPanel';
import ElementDetailPanel from '../components/ElementDetailPanel';
import DrawingViewToolbar from '../components/DrawingViewToolbar';
import DrawingPreferencesPanel, { DEFAULT_PREFERENCES, type DrawingPreferences } from '../components/DrawingPreferencesPanel';
import DrawingToolsSidebar, { DEFAULT_TOOL_SETTINGS, type DrawingTool, type ToolSettings } from '../components/DrawingToolsSidebar';
import DrawingSaveDialog from '../components/DrawingSaveDialog';
import VerificationPanel from '../components/VerificationPanel';
import ExportPanel from '../components/ExportPanel';
import SurveyPlanPanel from '../components/SurveyPlanPanel';
import type { ResearchProject, ResearchDocument, DrawingElement, RenderedDrawing, ViewMode, WorkflowStep, ComparisonResult, ExportFormat } from '@/types/research';
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

  // Review state
  const [reviewTab, setReviewTab] = useState<'sources' | 'data' | 'discrepancies' | 'ai_logs' | 'survey_plan'>('sources');
  const [showBriefing, setShowBriefing] = useState(true);
  const [viewerDoc, setViewerDoc] = useState<ResearchDocument | null>(null);
  const [viewerHighlight, setViewerHighlight] = useState<string | undefined>(undefined);
  /** Extra PDF URL from the worker pipeline result (populated after deep search) */
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);

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

  // Annotation layers
  const [annotationLayers, setAnnotationLayers] = useState<AnnotationLayer[]>([createDefaultLayer(0)]);
  const [activeLayerId, setActiveLayerId] = useState<string>(annotationLayers[0]?.id ?? '');

  // CAD editing state
  const [showCoordEntry, setShowCoordEntry] = useState(false);
  const [coordVertices, setCoordVertices] = useState<TraverseVertex[]>([]);
  const [selectedVertexData, setSelectedVertexData] = useState<VertexData | null>(null);
  const [zoomToFitSignal, setZoomToFitSignal] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  // Per-element original state map for individual revert
  const originalElementsMap = useRef<Map<string, DrawingElement>>(new Map());
  const [showSaveDialog, setShowSaveDialog] = useState<'save' | 'export' | null>(null);

  // UI tooltip toggle — user can turn descriptive tooltips on/off
  const [showUITooltips, setShowUITooltips] = useState(true);

  // Auto-save on change: instantly save after every annotation edit
  const [autoSaveOnChange, setAutoSaveOnChange] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(message: string, type: 'error' | 'success' | 'info' = 'error') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    // Longer display for errors (may contain actionable info) and info messages
    const duration = type === 'success' ? 4000 : message.length > 80 ? 10000 : 6000;
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }

  // Loading states for async operations
  const [savingDrawing, setSavingDrawing] = useState(false);

  // Verification state
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ format: string; filename: string } | null>(null);
  const [isOpeningInCAD, setIsOpeningInCAD] = useState(false);

  // Project editing state
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectData, setEditProjectData] = useState({ name: '', description: '', property_address: '', county: '', state: '' });
  const [savingProject, setSavingProject] = useState(false);

  const userRole = session?.user?.role || 'employee';

  // Admin-only guard — use useEffect so hooks are never called conditionally
  useEffect(() => {
    if (sessionStatus === 'authenticated' && userRole !== 'admin') {
      router.replace('/admin/dashboard');
    }
  }, [sessionStatus, userRole, router]);

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

  // ── Project Editing ──────────────────────────────────────────────────────
  function openEditProject() {
    if (!project) return;
    setEditProjectData({
      name: project.name,
      description: project.description || '',
      property_address: project.property_address || '',
      county: project.county || '',
      state: project.state || 'TX',
    });
    setShowEditProject(true);
  }

  async function handleSaveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editProjectData.name.trim() || savingProject) return;
    setSavingProject(true);
    try {
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, ...editProjectData }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setShowEditProject(false);
        showToast('Project details updated', 'success');
      } else {
        showToast('Failed to update project details', 'error');
      }
    } catch {
      showToast('Unable to save. Check your connection and try again.', 'error');
    }
    setSavingProject(false);
  }

  async function handleArchiveProject() {
    if (!window.confirm('Archive this project? It will be hidden from the project list but can be recovered later.')) return;
    try {
      const res = await fetch(`/api/admin/research?id=${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/research');
      } else {
        showToast('Failed to archive project', 'error');
      }
    } catch {
      showToast('Unable to archive. Check your connection and try again.', 'error');
    }
  }

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

  // ── Revert to a previous workflow step ────────────────────────────────────
  // Maps each revert-target step to a description of consequences so the
  // confirmation dialog can be specific and informative.
  async function handleRevertToStep(targetStep: WorkflowStep) {
    if (!project) return;

    // Guard: can't navigate while an analysis is running
    if (project.status === 'analyzing') {
      showToast('Please abort the running analysis before going back.', 'error');
      return;
    }

    const stepLabels: Record<WorkflowStep, string> = {
      upload: 'Information',
      configure: 'Research & Analysis',
      analyzing: 'Research & Analysis',
      review: 'Review',
      drawing: 'Draw',
      verifying: 'Verify',
      complete: 'Job Prep',
    };

    // Only clear analysis data when actually going to a pre-analysis step AND
    // there is existing analysis data worth clearing.
    const PRE_ANALYSIS_STEPS: WorkflowStep[] = ['upload', 'configure'];
    const hasAnalysisData = stats.data_point_count > 0;
    const clearAnalysisData = PRE_ANALYSIS_STEPS.includes(targetStep) && hasAnalysisData;

    // Build a step-specific, accurate confirmation message
    let message = `Go back to the ${stepLabels[targetStep]} step?`;
    if (PRE_ANALYSIS_STEPS.includes(targetStep)) {
      if (hasAnalysisData) {
        message += `\n\nThis will permanently delete ${stats.data_point_count} extracted data point${stats.data_point_count !== 1 ? 's' : ''}`;
        if (stats.discrepancy_count > 0) {
          message += ` and ${stats.discrepancy_count} discrepancy${stats.discrepancy_count !== 1 ? 'ies' : ''}`;
        }
        message += ' so the next analysis starts fresh. Your uploaded documents will be kept.';
      } else {
        // No analysis data exists — going back is non-destructive
        message += '\n\nNo analysis data exists yet, so nothing will be deleted.';
      }
    } else if (targetStep === 'review') {
      message += '\n\nAll extracted data points and drawings will remain intact.';
    } else if (targetStep === 'drawing') {
      message += '\n\nYour drawings and extracted data will remain intact.';
    } else if (targetStep === 'verifying') {
      message += '\n\nYour drawings and extracted data will remain intact.';
    }

    if (!window.confirm(message)) return;

    try {
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          status: targetStep,
          ...(clearAnalysisData ? { clear_analysis_data: true } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProject(data.project);

        // Reset local UI state that is no longer relevant for the target step
        if (clearAnalysisData) {
          // Clear all analysis-derived state
          setComparisonResult(null);
          setActiveDrawing(null);
          setDrawingElements([]);
          setDrawingSvg('');
          setSelectedElement(null);
          setAnnotations([]);
          setAnnotationHistory([]);
          setAnnotationFuture([]);
          setHasUnsavedChanges(false);
          // Immediately zero out the analysis-derived stats; server will confirm on reload
          setStats(prev => ({ ...prev, data_point_count: 0, discrepancy_count: 0, resolved_count: 0 }));
          // Refresh from server to pick up updated doc statuses
          loadDocuments();
          loadProject();
        } else if (targetStep === 'review') {
          // Going back from drawing/verifying/complete to review
          setActiveDrawing(null);
          setDrawingElements([]);
          setDrawingSvg('');
          setSelectedElement(null);
          setComparisonResult(null);
        } else if (targetStep === 'drawing') {
          // Going back from verifying/complete to drawing
          setComparisonResult(null);
          // Drawings are still loaded; user can continue from list
        }

        showToast(`Returned to ${stepLabels[targetStep]} step`, 'success');
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to update status' }));
        showToast(err.error || 'Failed to go back. Please try again.', 'error');
      }
    } catch {
      showToast('Unable to connect. Check your internet connection and try again.', 'error');
    }
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
        // Restore saved annotations from server, if any
        const savedAnnotations = data.drawing.user_annotations || [];
        setOriginalAnnotations(savedAnnotations);
        setAnnotations(savedAnnotations);
        setAnnotationHistory([]);
        setAnnotationFuture([]);
        // Restore saved preferences from server, if any
        if (data.drawing.user_preferences) {
          setDrawingPrefs({ ...DEFAULT_PREFERENCES, ...data.drawing.user_preferences });
        }
        setHasUnsavedChanges(false);
        setLastSavedAt(data.drawing.updated_at || null);
        // Generate SVG client-side via API
        const svgParams = new URLSearchParams({
          format: 'svg',
          viewMode,
          titleBlock: String(drawingPrefs.showTitleBlock),
          northArrow: String(drawingPrefs.showNorthArrow),
          scaleBar: String(drawingPrefs.showScaleBar),
          legend: String(drawingPrefs.showLegend),
          confidenceBar: String(drawingPrefs.showConfidenceBar),
        });
        const svgRes = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}?${svgParams}`);
        if (svgRes.ok) {
          const svgData = await svgRes.json();
          setDrawingSvg(svgData.svg || '');
        }
      }
    } catch {
      showToast('Failed to load drawing details. Please try again.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const err = await res.json().catch(() => ({ error: 'Failed to generate drawing' }));
        // Surface AI-specific errors with more user-friendly detail
        if (err.errorCategory) {
          showToast(`Drawing generation failed: ${err.error}`, 'error');
        } else {
          showToast(err.error || 'Failed to generate drawing. Please try again.', 'error');
        }
      }
    } catch {
      showToast('Unable to connect. Check your internet connection and try again.', 'error');
    }
    setGeneratingDrawing(false);
  }

  async function handleArchiveDrawing(drawingId: string, drawingName: string) {
    if (!window.confirm(`Archive "${drawingName}"? It will be hidden from the list but can be recovered.`)) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`"${drawingName}" archived`, 'success');
        await loadDrawings();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to archive drawing' }));
        showToast(err.error || 'Failed to archive drawing');
      }
    } catch {
      showToast('Unable to archive drawing. Check your connection.');
    }
  }

  async function handleDeleteDrawing(drawingId: string, drawingName: string) {
    if (!window.confirm(`Permanently delete "${drawingName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${drawingId}?permanent=true`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`"${drawingName}" deleted`, 'success');
        await loadDrawings();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to delete drawing' }));
        showToast(err.error || 'Failed to delete drawing');
      }
    } catch {
      showToast('Unable to delete drawing. Check your connection.');
    }
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

  // Annotation undo/redo (capped at 50 history entries to prevent memory growth)
  const MAX_UNDO_HISTORY = 50;
  function handleAnnotationsChange(newAnnotations: UserAnnotation[]) {
    setAnnotationHistory(prev => {
      const next = [...prev, annotations];
      return next.length > MAX_UNDO_HISTORY ? next.slice(-MAX_UNDO_HISTORY) : next;
    });
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

  /** Silent update: sets annotations without pushing undo history (used during drag/resize) */
  function handleAnnotationsSilentChange(newAnnotations: UserAnnotation[]) {
    setAnnotations(newAnnotations);
    setHasUnsavedChanges(true);
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

  // ── CAD Editing Handlers ─────────────────────────────────────────────────

  // When tool changes, open/close coord entry panel and show/hide vertex handles
  function handleToolChange(tool: DrawingTool) {
    setActiveTool(tool);
    if (tool === 'coordinate_entry') {
      setShowCoordEntry(true);
    }
    if (tool !== 'vertex_edit') {
      setSelectedVertexData(null);
    }
  }

  // Add a traverse leg from bearing/distance entry
  function handleAddLeg(leg: { azimuth: number; distance: number; bearing: string }) {
    const last = coordVertices.length > 0 ? coordVertices[coordVertices.length - 1] : { x: 0, y: 0 };
    const rad = (leg.azimuth * Math.PI) / 180;
    const newX = last.x + leg.distance * Math.sin(rad);
    const newY = last.y + leg.distance * Math.cos(rad);
    const vertex: TraverseVertex = {
      id: `tv-${Date.now()}-${coordVertices.length}`,
      x: newX,
      y: newY,
      bearing: leg.bearing,
      azimuth: leg.azimuth,
      distance: leg.distance,
      label: `P${coordVertices.length + 1}`,
    };
    setCoordVertices(prev => [...prev, vertex]);
    setHasUnsavedChanges(true);
  }

  // Add a point by coordinates
  function handleAddPoint(x: number, y: number) {
    const vertex: TraverseVertex = {
      id: `tv-${Date.now()}-${coordVertices.length}`,
      x,
      y,
      label: `P${coordVertices.length + 1}`,
    };
    setCoordVertices(prev => [...prev, vertex]);
    setHasUnsavedChanges(true);
  }

  // Close traverse: add a closing leg back to the first vertex
  function handleCloseTraverse() {
    if (coordVertices.length < 3) return;
    const first = coordVertices[0];
    const last = coordVertices[coordVertices.length - 1];
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return; // Already closed
    const azimuth = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    handleAddLeg({ azimuth, distance: dist, bearing: azimuthToBearingSimple(azimuth) });
  }

  // Delete a coord vertex by index
  function handleDeleteCoordVertex(index: number) {
    setCoordVertices(prev => prev.filter((_, i) => i !== index));
  }

  // Vertex click handler from canvas (for vertex editing)
  function handleVertexClick(elementId: string, vertexIndex: number, x: number, y: number) {
    const element = drawingElements.find(el => el.id === elementId);
    if (!element) return;
    const attrs = element.attributes as Record<string, unknown> | null;
    setSelectedVertexData({
      elementId,
      vertexIndex,
      x,
      y,
      element,
      bearing: attrs?.bearing as string | undefined,
      distance: attrs?.distance as number | undefined,
      azimuth: attrs?.azimuth as number | undefined,
    });
  }

  // Update vertex position/bearing and persist
  function handleUpdateVertex(elementId: string, vertexIndex: number, updates: {
    x?: number; y?: number; bearing?: string; azimuth?: number; distance?: number;
  }) {
    const element = drawingElements.find(el => el.id === elementId);
    if (!element) return;
    const geom = { ...(element.geometry as Record<string, unknown>) };

    if (updates.x !== undefined && updates.y !== undefined) {
      // Direct coordinate update
      if (geom.type === 'line') {
        if (vertexIndex === 0) {
          geom.start = { x: updates.x, y: updates.y };
        } else {
          geom.end = { x: updates.x, y: updates.y };
        }
      } else if (geom.type === 'point') {
        geom.position = { x: updates.x, y: updates.y };
      }
    } else if (updates.azimuth !== undefined && updates.distance !== undefined) {
      // Bearing/distance: compute new end point from start
      if (geom.type === 'line') {
        const start = geom.start as { x: number; y: number };
        const rad = (updates.azimuth * Math.PI) / 180;
        const newEnd = {
          x: start.x + updates.distance * Math.sin(rad),
          y: start.y + updates.distance * Math.cos(rad),
        };
        geom.end = newEnd;
      }
    }

    // Regenerate svg_path for lines
    let svgPath = element.svg_path;
    if (geom.type === 'line') {
      const s = geom.start as { x: number; y: number };
      const e = geom.end as { x: number; y: number };
      svgPath = `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
    }

    const newAttrs = {
      ...(element.attributes as Record<string, unknown> || {}),
      ...(updates.bearing ? { bearing: updates.bearing } : {}),
      ...(updates.azimuth !== undefined ? { azimuth: updates.azimuth } : {}),
      ...(updates.distance !== undefined ? { distance: updates.distance } : {}),
    };

    handleTrackedElementUpdate(elementId, { geometry: geom, svg_path: svgPath, attributes: newAttrs });

    // Update local vertex data
    if (selectedVertexData && selectedVertexData.elementId === elementId) {
      const updatedEl = { ...element, geometry: geom, svg_path: svgPath, attributes: newAttrs };
      setSelectedVertexData({
        ...selectedVertexData,
        x: updates.x ?? selectedVertexData.x,
        y: updates.y ?? selectedVertexData.y,
        bearing: updates.bearing ?? selectedVertexData.bearing,
        azimuth: updates.azimuth ?? selectedVertexData.azimuth,
        distance: updates.distance ?? selectedVertexData.distance,
        element: updatedEl as DrawingElement,
      });
    }
  }

  // Navigate between vertices (for VertexEditPanel prev/next)
  function handleNavigateVertex(direction: 'prev' | 'next') {
    if (!selectedVertexData) return;
    // Build list of all boundary line vertices
    const boundaryLines = drawingElements.filter(
      el => el.element_type === 'line' && (el.feature_class === 'property_boundary' || el.feature_class === 'lot_line')
    );
    const allVertices: { elementId: string; vertexIndex: number; x: number; y: number }[] = [];
    for (const el of boundaryLines) {
      const geom = el.geometry as { type: string; start?: { x: number; y: number }; end?: { x: number; y: number } };
      if (geom.start) allVertices.push({ elementId: el.id, vertexIndex: 0, x: geom.start.x, y: geom.start.y });
      if (geom.end) allVertices.push({ elementId: el.id, vertexIndex: 1, x: geom.end.x, y: geom.end.y });
    }
    const currentIdx = allVertices.findIndex(
      v => v.elementId === selectedVertexData.elementId && v.vertexIndex === selectedVertexData.vertexIndex
    );
    if (currentIdx === -1) return;
    const nextIdx = direction === 'next'
      ? (currentIdx + 1) % allVertices.length
      : (currentIdx - 1 + allVertices.length) % allVertices.length;
    const next = allVertices[nextIdx];
    handleVertexClick(next.elementId, next.vertexIndex, next.x, next.y);
  }

  // Zoom to fit handler
  function handleZoomToFit() {
    setZoomToFitSignal(prev => prev + 1);
  }

  // Simple azimuth to bearing string conversion
  function azimuthToBearingSimple(az: number): string {
    const a = ((az % 360) + 360) % 360;
    let ns: string, ew: string, angle: number;
    if (a <= 90) { ns = 'N'; ew = 'E'; angle = a; }
    else if (a <= 180) { ns = 'S'; ew = 'E'; angle = 180 - a; }
    else if (a <= 270) { ns = 'S'; ew = 'W'; angle = a - 180; }
    else { ns = 'N'; ew = 'W'; angle = 360 - a; }
    const deg = Math.floor(angle);
    const md = (angle - deg) * 60;
    const min = Math.floor(md);
    const sec = Math.round((md - min) * 60);
    return `${ns} ${deg}\u00B0 ${min}' ${sec}" ${ew}`;
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

  // ── Verification Handlers ─────────────────────────────────────────────────
  async function handleRunVerification() {
    if (!activeDrawing) {
      showToast('No active drawing to verify. Generate or select a drawing first.', 'error');
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Verification failed' }));
        // Show AI-specific error with more detail
        const errorMsg = err.errorCategory
          ? `Verification issue: ${err.error}`
          : (err.error || 'Verification failed');
        showToast(errorMsg, 'error');
        setIsVerifying(false);
        return;
      }
      const data = await res.json();
      setComparisonResult(data.comparison);
      // Check if the comparison includes AI unavailability notice
      const aiUnavailable = data.comparison?.persisting_issues?.some(
        (i: { title?: string }) => i.title?.includes('AI comparison unavailable')
      );
      showToast(
        aiUnavailable
          ? 'Verification complete (mathematical checks only — AI comparison was unavailable)'
          : 'Verification complete',
        aiUnavailable ? 'info' : 'success'
      );
      loadProject();
    } catch {
      showToast('Unable to connect for verification. Check your internet connection and try again.', 'error');
    } finally {
      setIsVerifying(false);
    }
  }

  function handleAdvanceToExport() {
    handleStatusUpdate('complete');
  }

  async function handleExportDrawing(format: ExportFormat, exportViewMode: ViewMode) {
    if (!activeDrawing) return;
    setIsExporting(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', format, viewMode: exportViewMode, showTitleBlock: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }
      const data = await res.json();
      if (data.export?.blob_data) {
        // Decode base64 and trigger download
        const binaryStr = atob(data.export.blob_data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const mimeTypes: Record<string, string> = {
          svg: 'image/svg+xml',
          json: 'application/json',
          png: 'image/png',
          pdf: 'application/pdf',
        };
        const blob = new Blob([bytes], { type: mimeTypes[format] || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.export.filename;
        a.click();
        URL.revokeObjectURL(url);
        setLastExport({ format, filename: data.export.filename });
        showToast(`Exported ${data.export.filename}`, 'success');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleMarkComplete() {
    if (!window.confirm('Mark this research project as complete?')) return;
    try {
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, status: 'complete' }),
      });
      if (res.ok) {
        showToast('Project marked as complete', 'success');
        loadProject();
      } else {
        showToast('Failed to update project status', 'error');
      }
    } catch {
      showToast('Failed to update project status', 'error');
    }
  }

  /**
   * Convert the current RECON drawing to a STARR CAD document and open it in
   * the CAD editor.  The converted DrawingDocument is stored in localStorage so
   * the CAD editor can pick it up on load without needing a shared API.
   */
  async function handleOpenInCAD() {
    setIsOpeningInCAD(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/export-to-cad`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to export drawing to CAD');
      }
      const data = await res.json() as { document: unknown };
      if (!data.document) throw new Error('No CAD document returned from server');
      localStorage.setItem('starr-cad-pending-recon', JSON.stringify(data.document));
      router.push('/admin/cad');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to open in CAD Editor', 'error');
      setIsOpeningInCAD(false);
    }
  }

  // Keyboard shortcuts for drawing tools + undo/redo + save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
      if (!activeDrawing) return;

      // Ctrl/Cmd shortcuts (work even in inputs)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); setShowSaveDialog('save'); return; }
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); return; }
        if (e.key === 'Z') { e.preventDefault(); handleRedo(); return; }
        return;
      }

      // Don't handle single-key shortcuts in text inputs
      if (isEditable) return;

      // Escape: deselect element and annotation, cancel current tool
      if (e.key === 'Escape') {
        setSelectedElement(null);
        setActiveTool('select');
        return;
      }

      // Tool shortcuts (single letter, no modifiers)
      if (e.altKey) return;
      const shortcutMap: Record<string, DrawingTool> = {
        v: 'select', h: 'pan', l: 'line', p: 'polyline', r: 'rectangle',
        c: 'circle', f: 'freehand', t: 'text_type', w: 'text_write',
        a: 'callout', d: 'dimension', s: 'symbol', i: 'image',
        m: 'measure', e: 'eraser', g: 'vertex_edit', k: 'coordinate_entry',
      };
      const tool = shortcutMap[e.key.toLowerCase()];
      if (tool) handleToolChange(tool);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDrawing, handleUndo, handleRedo]);

  // ── Beforeunload: warn user about unsaved changes ──────────────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges || project?.status === 'analyzing') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, project?.status]);

  // ── Auto-save: save drawing state every 60 seconds if unsaved changes ───
  // Use refs for ALL values read inside the interval to avoid stale closures.
  // Only use activeDrawing?.id as dep so the interval stays stable between edits.
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveFailCountRef = useRef(0);
  const annotationsRef = useRef(annotations);
  const drawingPrefsRef = useRef(drawingPrefs);
  const drawingElementsRef = useRef(drawingElements);
  const hasUnsavedRef = useRef(hasUnsavedChanges);
  const activeDrawingIdRef = useRef(activeDrawing?.id);
  annotationsRef.current = annotations;
  drawingPrefsRef.current = drawingPrefs;
  drawingElementsRef.current = drawingElements;
  hasUnsavedRef.current = hasUnsavedChanges;
  activeDrawingIdRef.current = activeDrawing?.id;

  useEffect(() => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    if (!activeDrawing?.id) return;

    autoSaveTimerRef.current = setInterval(async () => {
      if (!hasUnsavedRef.current || !activeDrawingIdRef.current) return;
      try {
        const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawingIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            save: true,
            annotations: annotationsRef.current,
            preferences: drawingPrefsRef.current,
          }),
        });
        if (res.ok) {
          autoSaveFailCountRef.current = 0;
          setLastSavedAt(new Date().toISOString());
          setHasUnsavedChanges(false);
          setOriginalElements([...drawingElementsRef.current]);
          setOriginalAnnotations([...annotationsRef.current]);
        } else {
          autoSaveFailCountRef.current++;
          if (autoSaveFailCountRef.current >= 3) {
            showToast('Auto-save is failing repeatedly. Save manually to avoid losing work.', 'error');
            autoSaveFailCountRef.current = 0;
          }
        }
      } catch {
        autoSaveFailCountRef.current++;
        if (autoSaveFailCountRef.current >= 3) {
          showToast('Auto-save is failing. Check your connection and save manually.', 'error');
          autoSaveFailCountRef.current = 0;
        }
      }
    }, 60000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDrawing?.id, projectId]);

  // ── Auto-save on change: debounced save 2s after every annotation change ──
  const autoSaveOnChangeRef = useRef(autoSaveOnChange);
  autoSaveOnChangeRef.current = autoSaveOnChange;
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoSaveOnChangeRef.current || !hasUnsavedRef.current || !activeDrawingIdRef.current) return;
    // Debounce to avoid saving on every intermediate keystroke/move
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(async () => {
      if (!autoSaveOnChangeRef.current || !hasUnsavedRef.current || !activeDrawingIdRef.current) return;
      try {
        const res = await fetch(`/api/admin/research/${projectId}/drawings/${activeDrawingIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            save: true,
            annotations: annotationsRef.current,
            preferences: drawingPrefsRef.current,
          }),
        });
        if (res.ok) {
          setLastSavedAt(new Date().toISOString());
          setHasUnsavedChanges(false);
        }
      } catch { /* silent — the 60s auto-save will catch up */ }
    }, 2000);
    return () => {
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, drawingPrefs, projectId]);

  // ── Re-fetch SVG when display preferences change (title block, north arrow, etc.) ──
  const displayPrefKey = `${drawingPrefs.showTitleBlock}-${drawingPrefs.showNorthArrow}-${drawingPrefs.showScaleBar}-${drawingPrefs.showLegend}-${drawingPrefs.showConfidenceBar}`;
  const prevDisplayPrefRef = useRef(displayPrefKey);
  useEffect(() => {
    if (prevDisplayPrefRef.current === displayPrefKey) return; // skip initial
    prevDisplayPrefRef.current = displayPrefKey;
    if (!activeDrawing?.id) return;
    // Re-fetch SVG with updated display toggles
    const svgParams = new URLSearchParams({
      format: 'svg',
      viewMode,
      titleBlock: String(drawingPrefs.showTitleBlock),
      northArrow: String(drawingPrefs.showNorthArrow),
      scaleBar: String(drawingPrefs.showScaleBar),
      legend: String(drawingPrefs.showLegend),
      confidenceBar: String(drawingPrefs.showConfidenceBar),
    });
    fetch(`/api/admin/research/${projectId}/drawings/${activeDrawing.id}?${svgParams}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.svg) setDrawingSvg(data.svg); })
      .catch(() => { /* non-critical */ });
    setHasUnsavedChanges(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPrefKey]);

  // Load drawings when entering drawing/verify/export steps; auto-select first drawing
  useEffect(() => {
    if (project?.status === 'drawing' || project?.status === 'verifying' || project?.status === 'complete') {
      loadDrawings().then(async () => {
        // For verify and export steps, auto-load the first drawing if none is active
        if ((project?.status === 'verifying' || project?.status === 'complete') && !activeDrawing) {
          try {
            const res = await fetch(`/api/admin/research/${projectId}/drawings`);
            if (res.ok) {
              const data = await res.json();
              const drawingList = data.drawings || [];
              if (drawingList.length > 0) {
                loadDrawingDetail(drawingList[0].id);
              }
            }
          } catch { /* non-critical */ }
        }
      });
    }
  }, [project?.status, loadDrawings, projectId]);

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

  if (sessionStatus === 'authenticated' && userRole !== 'admin') return null;

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
          {project.description && (
            <div style={{ color: '#9CA3AF', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {project.description}
            </div>
          )}
        </div>
        <div className="research-page__actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={openEditProject}
            style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}
            aria-label="Edit project details"
          >
            Edit Details
          </button>
          <button
            onClick={handleArchiveProject}
            style={{ background: 'none', border: '1px solid #FECACA', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: '#DC2626' }}
            aria-label="Archive project"
          >
            Archive
          </button>
        </div>
      </div>

      {/* Workflow stepper — clicking a completed step reverts the project to that step */}
      <WorkflowStepper
        currentStatus={project.status}
        onStepClick={project.status !== 'analyzing' ? handleRevertToStep : undefined}
      />

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
        <DocumentUploadPanel
          projectId={projectId}
          documents={documents}
          onDocumentsChanged={() => { loadDocuments(); loadProject(); }}
        />
      )}

      {(project.status === 'configure' || project.status === 'analyzing') && (
        <ResearchAnalysisPanel
          projectId={projectId}
          defaultAddress={project.property_address || ''}
          defaultCounty={project.county || ''}
          defaultParcelId={project.parcel_id || ''}
          onComplete={() => { loadDocuments(); loadProject(); }}
        />
      )}

      {project.status === 'review' && (
        <div className="research-review">
          {/* Back to Research & Analysis */}
          <button className="research-back-btn" onClick={() => handleRevertToStep('configure')}>
            &larr; Back to Research &amp; Analysis
          </button>

          {/* Survey Briefing panel (collapsible) */}
          {showBriefing ? (
            <BriefingPanel
              projectId={projectId}
              onClose={() => setShowBriefing(false)}
            />
          ) : (
            <button
              onClick={() => setShowBriefing(true)}
              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.375rem', padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem', color: '#1D4ED8', marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              📋 Show Survey Briefing
            </button>
          )}

          {/* Analysis Summary Card */}
          <AnalysisSummary projectId={projectId} stats={stats} />

          {/* Deep Document Analysis — AI review of legal descriptions and plats */}
          <DocumentDeepAnalysisPanel
            projectId={projectId}
            documents={documents}
          />

          {/* Review tabs — Research Sources · Extracted Data · Discrepancies · AI Logs · Survey Plan */}
          <div className="research-review__tabs">
            <button
              className={`research-review__tab ${reviewTab === 'sources' ? 'research-review__tab--active' : ''}`}
              onClick={() => setReviewTab('sources')}
            >
              📎 Research Sources
              {documents.length > 0 && (
                <span className="research-review__tab-badge">{documents.length}</span>
              )}
            </button>
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
            <button
              className={`research-review__tab ${reviewTab === 'ai_logs' ? 'research-review__tab--active' : ''}`}
              onClick={() => setReviewTab('ai_logs')}
            >
              🔍 AI Logs
            </button>
            <button
              className={`research-review__tab ${reviewTab === 'survey_plan' ? 'research-review__tab--active' : ''}`}
              onClick={() => setReviewTab('survey_plan')}
            >
              📋 Survey Plan
            </button>
          </div>

          {/* Tab content */}
          {reviewTab === 'sources' && (() => {
            const sourceTypeLabels: Record<string, { label: string; icon: string }> = {
              property_search:  { label: 'Research — Web Sources', icon: '🔍' },
              user_upload:      { label: 'User Uploaded', icon: '📤' },
              linked_reference: { label: 'Linked References', icon: '🔗' },
              manual_entry:     { label: 'Manual Entry', icon: '📝' },
            };
            const docTypeIcons: Record<string, string> = {
              deed: '📜', plat: '🗺️', survey: '📐', legal_description: '⚖️',
              title_commitment: '📋', easement: '🛤️', restrictive_covenant: '📄',
              field_notes: '📓', subdivision_plat: '🏘️', metes_and_bounds: '📏',
              county_record: '🏛️', appraisal_record: '💰', aerial_photo: '🛰️',
              topo_map: '🗻', utility_map: '🔌', other: '📎',
            };
            const grouped = documents.reduce<Record<string, typeof documents>>((acc, doc) => {
              const key = doc.source_type || 'other';
              if (!acc[key]) acc[key] = [];
              acc[key].push(doc);
              return acc;
            }, {});
            const sourceOrder = ['property_search', 'user_upload', 'linked_reference', 'manual_entry'];
            const sortedKeys = [
              ...sourceOrder.filter(k => grouped[k]),
              ...Object.keys(grouped).filter(k => !sourceOrder.includes(k)),
            ];
            if (documents.length === 0) {
              return (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9CA3AF' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>No research sources yet</div>
                  <div style={{ fontSize: '0.85rem' }}>
                    Go back to Step 1 and run the research to collect sources, links, and documents.
                  </div>
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '0.5rem' }}>
                {sortedKeys.map(sourceKey => {
                  const docs = grouped[sourceKey];
                  const { label, icon } = sourceTypeLabels[sourceKey] || { label: sourceKey, icon: '📎' };
                  return (
                    <div key={sourceKey}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '2px solid #E5E7EB' }}>
                        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1F2937' }}>{label}</h3>
                        <span style={{ fontSize: '0.78rem', color: '#6B7280', background: '#F3F4F6', borderRadius: 10, padding: '1px 8px' }}>{docs.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {docs.map(doc => {
                          const typeIcon = doc.document_type ? (docTypeIcons[doc.document_type] || '📎') : '📎';
                          const typeName = doc.document_type
                            ? doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                            : 'Document';
                          const title = doc.document_label || doc.original_filename || typeName;
                          const hasViewable = !!(doc.pages_pdf_url || doc.storage_url);
                          const excerpt = doc.extracted_text
                            ? doc.extracted_text.slice(0, 220) + (doc.extracted_text.length > 220 ? '…' : '')
                            : null;
                          return (
                            <div
                              key={doc.id}
                              style={{ background: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: '0.5rem', padding: '0.85rem 1rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}
                            >
                              <div style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>{typeIcon}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{title}</span>
                                  <span style={{ fontSize: '0.72rem', color: '#6B7280', background: '#F3F4F6', borderRadius: 8, padding: '1px 7px', flexShrink: 0 }}>{typeName}</span>
                                  {doc.processing_status === 'analyzed' && (
                                    <span style={{ fontSize: '0.72rem', color: '#059669', background: '#D1FAE5', borderRadius: 8, padding: '1px 7px', flexShrink: 0 }}>✓ Analyzed</span>
                                  )}
                                  {doc.processing_status === 'error' && (
                                    <span style={{ fontSize: '0.72rem', color: '#DC2626', background: '#FEE2E2', borderRadius: 8, padding: '1px 7px', flexShrink: 0 }}>⚠ Error</span>
                                  )}
                                </div>
                                {excerpt && (
                                  <div style={{ fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.55, marginBottom: '0.45rem', background: '#F8FAFC', borderLeft: '3px solid #BFDBFE', paddingLeft: '0.5rem', borderRadius: '0 4px 4px 0' }}>
                                    {excerpt}
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#6B7280' }}>
                                  {doc.recorded_date && <span>📅 {doc.recorded_date}</span>}
                                  {doc.recording_info && <span>📋 {doc.recording_info}</span>}
                                  {doc.page_count && <span>📄 {doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>}
                                  {doc.ocr_confidence && <span>🔬 OCR {Math.round(doc.ocr_confidence * 100)}%</span>}
                                  {doc.file_size_bytes && <span>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>}
                                  {doc.created_at && <span title={doc.created_at}>Added {new Date(doc.created_at).toLocaleDateString()}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
                                  {doc.source_url && (
                                    <a
                                      href={doc.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.3rem', padding: '0.25rem 0.65rem', textDecoration: 'none', fontWeight: 500 }}
                                    >
                                      🔗 Open Source ↗
                                    </a>
                                  )}
                                  {hasViewable && (
                                    <button
                                      onClick={() => {
                                        setViewerDoc(doc);
                                        setViewerPdfUrl(doc.pages_pdf_url ?? doc.storage_url ?? null);
                                        setViewerHighlight(undefined);
                                      }}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '0.3rem', padding: '0.25rem 0.65rem', cursor: 'pointer', fontWeight: 500 }}
                                    >
                                      🖼️ View Pages / PDF
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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
          {reviewTab === 'ai_logs' && (() => {
            const logs = (project.analysis_metadata as Record<string, unknown> | null)?.logs as
              Array<{ ts: string; level: string; message: string; detail?: string }> | undefined;
            return (
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.6, background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: '0.5rem', padding: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
                {!logs || logs.length === 0 ? (
                  <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
                    No analysis logs available. Run AI Analysis to generate logs.
                  </div>
                ) : (
                  logs.map((entry, i) => {
                    const levelColor = entry.level === 'error' ? '#EF4444' : entry.level === 'warn' ? '#F59E0B' : entry.level === 'success' ? '#059669' : '#374151';
                    const levelBg = entry.level === 'error' ? '#FEF2F2' : entry.level === 'warn' ? '#FFFBEB' : entry.level === 'success' ? '#F0FDF4' : 'transparent';
                    return (
                      <div key={i} style={{ padding: '0.2rem 0.4rem', borderRadius: '0.2rem', background: levelBg, marginBottom: '0.15rem' }}>
                        <span style={{ color: '#9CA3AF' }}>{new Date(entry.ts).toLocaleTimeString()}</span>
                        {' '}
                        <span style={{ color: levelColor, fontWeight: 600 }}>[{entry.level.toUpperCase()}]</span>
                        {' '}
                        <span style={{ color: '#374151' }}>{entry.message}</span>
                        {entry.detail && <span style={{ color: '#6B7280' }}> — {entry.detail}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}
          {reviewTab === 'survey_plan' && (
            <div style={{ padding: '0.5rem 0' }}>
              <SurveyPlanPanel projectId={projectId} />
            </div>
          )}
        </div>
      )}

      {project.status === 'drawing' && (
        <div className="research-drawing">
          {/* Drawing list (when no active drawing) */}
          {!activeDrawing && (
            <>
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
                {/* Back to Review */}
                <button className="research-back-btn" onClick={() => handleRevertToStep('review')} style={{ marginBottom: 0, alignSelf: 'center' }}>
                  &larr; Back to Review
                </button>
              </div>

              {/* Survey briefing in drawing step */}
              <BriefingPanel projectId={projectId} />
            </>
          )}

          {drawings.length > 0 && !activeDrawing && (
            <div className="research-drawing__list">
              {drawings.map(d => (
                <div key={d.id} className="research-drawing__list-row">
                  <button
                    className="research-drawing__list-item"
                    onClick={() => loadDrawingDetail(d.id)}
                  >
                    <span>{d.name}</span>
                    <span className="research-drawing__list-meta">
                      v{d.version} | {d.element_count} elements | {d.overall_confidence ? `${Math.round(d.overall_confidence)}% confidence` : '--'}
                    </span>
                  </button>
                  <div className="research-drawing__list-actions">
                    <button
                      className="research-drawing__action-btn research-drawing__action-btn--archive"
                      onClick={() => handleArchiveDrawing(d.id, d.name)}
                      title="Archive drawing"
                    >
                      Archive
                    </button>
                    <button
                      className="research-drawing__action-btn research-drawing__action-btn--delete"
                      onClick={() => handleDeleteDrawing(d.id, d.name)}
                      title="Permanently delete drawing"
                    >
                      Delete
                    </button>
                  </div>
                </div>
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
                onZoomToFit={handleZoomToFit}
                elementCount={drawingElements.length}
                visibleCount={drawingElements.filter(e => e.visible).length}
                modifiedCount={drawingElements.filter(e => e.user_modified).length}
                overallConfidence={activeDrawing.overall_confidence ?? null}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSavedAt={lastSavedAt}
                showUITooltips={showUITooltips}
                onToggleUITooltips={() => setShowUITooltips(prev => !prev)}
                autoSaveOnChange={autoSaveOnChange}
                onToggleAutoSaveOnChange={() => setAutoSaveOnChange(prev => !prev)}
              />

              {/* Main workspace: tools + canvas + side panels */}
              <div className="research-drawing__workspace">
                {/* Tools sidebar (left) */}
                <DrawingToolsSidebar
                  activeTool={activeTool}
                  onToolChange={handleToolChange}
                  settings={toolSettings}
                  onSettingsChange={setToolSettings}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={annotationHistory.length > 0}
                  canRedo={annotationFuture.length > 0}
                  showUITooltips={showUITooltips}
                />

                {/* Annotation layer panel (below tools) */}
                <AnnotationLayerPanel
                  layers={annotationLayers}
                  activeLayerId={activeLayerId}
                  onLayersChange={setAnnotationLayers}
                  onActiveLayerChange={setActiveLayerId}
                  annotationCountByLayer={
                    annotations.reduce<Record<string, number>>((acc, ann) => {
                      const lid = ann.layerId || annotationLayers[0]?.id || '';
                      acc[lid] = (acc[lid] || 0) + 1;
                      return acc;
                    }, {})
                  }
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

                {/* Coordinate Entry Panel (CAD input) */}
                {showCoordEntry && (
                  <CoordinateEntryPanel
                    isOpen={showCoordEntry}
                    onClose={() => { setShowCoordEntry(false); if (activeTool === 'coordinate_entry') setActiveTool('select'); }}
                    onAddLeg={handleAddLeg}
                    onAddPoint={handleAddPoint}
                    onCloseTraverse={handleCloseTraverse}
                    vertices={coordVertices}
                    onSelectVertex={(idx) => {
                      const v = coordVertices[idx];
                      if (v) setCursorPosition({ x: v.x, y: v.y });
                    }}
                    onDeleteVertex={handleDeleteCoordVertex}
                    cursorPosition={cursorPosition}
                  />
                )}

                {/* Vertex Edit Panel */}
                {selectedVertexData && activeTool === 'vertex_edit' && (
                  <VertexEditPanel
                    vertex={selectedVertexData}
                    onClose={() => setSelectedVertexData(null)}
                    onUpdateVertex={handleUpdateVertex}
                    onNavigateVertex={handleNavigateVertex}
                    canNavigatePrev={true}
                    canNavigateNext={true}
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
                      onToolChange={handleToolChange}
                      onElementClick={(el) => setSelectedElement(el)}
                      onElementModified={(id, changes) => handleTrackedElementUpdate(id, changes)}
                      onRevertElement={handleRevertElement}
                      annotations={annotations}
                      onAnnotationsChange={handleAnnotationsChangeTracked}
                      onAnnotationsSilentChange={handleAnnotationsSilentChange}
                      zoom={canvasZoom}
                      onZoomChange={setCanvasZoom}
                      showVertexHandles={activeTool === 'vertex_edit'}
                      onVertexClick={handleVertexClick}
                      zoomToFitSignal={zoomToFitSignal}
                      onCursorPositionChange={setCursorPosition}
                      snapMode={toolSettings.snapMode}
                      activeLayerId={activeLayerId}
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
                    onStyleChange={(id, style) => {
                      // rotation is stored in element.attributes, not element.style
                      if ('rotation' in style) {
                        const { rotation, ...styleWithoutRotation } = style as Record<string, unknown>;
                        const updates: Record<string, unknown> = {};
                        if (Object.keys(styleWithoutRotation).length > 0) {
                          updates.style = { ...selectedElement.style, ...styleWithoutRotation };
                        }
                        updates.attributes = { ...selectedElement.attributes, rotation };
                        handleTrackedElementUpdate(id, updates);
                      } else {
                        handleTrackedElementUpdate(id, { style: { ...selectedElement.style, ...style } });
                      }
                    }}
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

              {/* Open in CAD Editor — available throughout the drawing step */}
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  style={{
                    background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    opacity: isOpeningInCAD ? 0.7 : 1,
                  }}
                  onClick={handleOpenInCAD}
                  disabled={isOpeningInCAD}
                  title="Convert this drawing to a full STARR CAD document and open it for editing"
                >
                  {isOpeningInCAD ? '⏳ Opening…' : '✏️ Open in CAD Editor'}
                </button>
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

      {/* Step 6: Verify */}
      {project.status === 'verifying' && (
        <>
          {/* Back to Drawing */}
          <button className="research-back-btn" onClick={() => handleRevertToStep('drawing')}>
            &larr; Back to Drawing
          </button>
          {!activeDrawing && (
            <div className="research-verify__loading-drawings">
              <p style={{ color: '#6B7280', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 1rem' }}>
                Loading drawing for verification...
              </p>
            </div>
          )}
          {activeDrawing && (
            <VerificationPanel
              comparison={comparisonResult}
              isVerifying={isVerifying}
              onRunVerification={handleRunVerification}
              onReVerify={handleRunVerification}
              onAdvanceToExport={handleAdvanceToExport}
              drawingName={activeDrawing.name}
              showUITooltips={showUITooltips}
            />
          )}
        </>
      )}

      {/* Step 7: Export / Complete */}
      {project.status === 'complete' && (
        <>
          {/* Back to Verify */}
          <button className="research-back-btn" onClick={() => handleRevertToStep('verifying')}>
            &larr; Back to Verify
          </button>
          {!activeDrawing && (
            <div style={{ color: '#6B7280', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 1rem' }}>
              Loading drawing for export...
            </div>
          )}
          {activeDrawing && (
            <ExportPanel
              projectId={projectId}
              drawingId={activeDrawing.id}
              drawingName={activeDrawing.name}
              comparison={comparisonResult}
              onExport={handleExportDrawing}
              onOpenInCAD={handleOpenInCAD}
              onMarkComplete={handleMarkComplete}
              isExporting={isExporting}
              isOpeningInCAD={isOpeningInCAD}
              lastExport={lastExport}
              showUITooltips={showUITooltips}
            />
          )}

          {/* Survey Field Plan — always visible on the Complete step */}
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📋 Field Survey Plan
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 10 }}>AI Generated</span>
            </h2>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem' }}>
              <SurveyPlanPanel projectId={projectId} />
            </div>
          </div>
        </>
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
                {/* View Pages button — shown when PDF images are available */}
                {(doc.pages_pdf_url || doc.storage_url) && (
                  <button
                    className="research-upload__doc-pdf-btn"
                    onClick={() => {
                      setViewerDoc(doc);
                      setViewerPdfUrl(doc.pages_pdf_url ?? doc.storage_url ?? null);
                      setViewerHighlight(undefined);
                    }}
                    title="View document page images"
                  >
                    🖼️ View Pages
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Source document viewer modal */}
      {viewerDoc && (
        <SourceDocumentViewer
          document={viewerDoc}
          pagesPdfUrl={viewerPdfUrl}
          highlightText={viewerHighlight}
          onClose={() => { setViewerDoc(null); setViewerHighlight(undefined); setViewerPdfUrl(null); }}
        />
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <div
          className="research-modal-overlay"
          onClick={() => setShowEditProject(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowEditProject(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Edit Project Details"
        >
          <div className="research-modal" onClick={e => e.stopPropagation()}>
            <h2 className="research-modal__title">Edit Project Details</h2>
            <form onSubmit={handleSaveProject}>
              <div className="research-modal__field">
                <label className="research-modal__label" htmlFor="edit-project-name">Project Name *</label>
                <input
                  id="edit-project-name"
                  className="research-modal__input"
                  type="text"
                  value={editProjectData.name}
                  onChange={e => setEditProjectData(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                  required
                />
              </div>
              <div className="research-modal__field">
                <label className="research-modal__label" htmlFor="edit-project-address">Property Address</label>
                <input
                  id="edit-project-address"
                  className="research-modal__input"
                  type="text"
                  value={editProjectData.property_address}
                  onChange={e => setEditProjectData(p => ({ ...p, property_address: e.target.value }))}
                />
              </div>
              <div className="research-modal__row">
                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="edit-project-county">County</label>
                  <input
                    id="edit-project-county"
                    className="research-modal__input"
                    type="text"
                    value={editProjectData.county}
                    onChange={e => setEditProjectData(p => ({ ...p, county: e.target.value }))}
                  />
                </div>
                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="edit-project-state">State</label>
                  <input
                    id="edit-project-state"
                    className="research-modal__input"
                    type="text"
                    value={editProjectData.state}
                    onChange={e => setEditProjectData(p => ({ ...p, state: e.target.value }))}
                  />
                </div>
              </div>
              <div className="research-modal__field">
                <label className="research-modal__label" htmlFor="edit-project-desc">Description</label>
                <textarea
                  id="edit-project-desc"
                  className="research-modal__textarea"
                  value={editProjectData.description}
                  onChange={e => setEditProjectData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="research-modal__actions">
                <button type="button" className="research-modal__cancel" onClick={() => setShowEditProject(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="research-modal__submit"
                  disabled={!editProjectData.name.trim() || savingProject}
                >
                  {savingProject ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
