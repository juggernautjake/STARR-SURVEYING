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
import AnalysisSummary from '../components/AnalysisSummary';
import CoordinateEntryPanel, { type TraverseVertex } from '../components/CoordinateEntryPanel';
import VertexEditPanel, { type VertexData } from '../components/VertexEditPanel';
import ElementDetailPanel from '../components/ElementDetailPanel';
import DrawingViewToolbar from '../components/DrawingViewToolbar';
import DrawingPreferencesPanel, { DEFAULT_PREFERENCES, type DrawingPreferences } from '../components/DrawingPreferencesPanel';
import DrawingToolsSidebar, { DEFAULT_TOOL_SETTINGS, type DrawingTool, type ToolSettings } from '../components/DrawingToolsSidebar';
import DrawingSaveDialog from '../components/DrawingSaveDialog';
import VerificationPanel from '../components/VerificationPanel';
import ExportPanel from '../components/ExportPanel';
import TemplateManager from '../components/TemplateManager';
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

  // Analysis state
  const [selectedAnalysisTemplate, setSelectedAnalysisTemplate] = useState<string | null>(null);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<{
    documentsTotal: number;
    documentsAnalyzed: number;
    dataPointCount: number;
    discrepancyCount: number;
    error?: string;
    errorCategory?: string;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<{ message: string; category: string } | null>(null);

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

  // Project editing state
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectData, setEditProjectData] = useState({ name: '', description: '', property_address: '', county: '', state: '' });
  const [savingProject, setSavingProject] = useState(false);

  const userRole = session?.user?.role || 'employee';

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
            error: data.error,
            errorCategory: data.errorCategory,
          });
          // If analysis failed (project went back to configure), capture the error
          if (data.status === 'configure' && data.error) {
            setAnalysisError({ message: data.error, category: data.errorCategory || 'unknown' });
            loadProject();
            loadDocuments();
          }
          // If analysis completed successfully
          else if (data.status !== 'analyzing') {
            setAnalysisError(null);
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

  async function handleStartAnalysis() {
    if (analysisStarting) return;
    setAnalysisStarting(true);
    setAnalysisError(null);

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
        const err = await res.json().catch(() => ({ error: 'Failed to start analysis' }));
        // Show the error in the analysis error banner
        setAnalysisError({
          message: err.error || 'Failed to start analysis. Please try again.',
          category: err.errorCategory || 'unknown',
        });
      }
    } catch {
      setAnalysisError({
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        category: 'connectivity',
      });
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

          {/* Analysis template selector */}
          <TemplateManager
            type="analysis"
            selectedId={selectedAnalysisTemplate}
            onSelect={setSelectedAnalysisTemplate}
            showUITooltips={showUITooltips}
            compact
          />

          {/* Analysis error display — shown when a previous analysis attempt failed */}
          {analysisError && (
            <div style={{
              background: analysisError.category === 'usage_exhausted' ? '#FFFBEB' : '#FEF2F2',
              border: `1px solid ${analysisError.category === 'usage_exhausted' ? '#FDE68A' : '#FECACA'}`,
              borderRadius: '0.5rem', padding: '1rem 1.25rem', marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>
                  {analysisError.category === 'usage_exhausted' ? '⚠' :
                   analysisError.category === 'authentication' ? '🔑' :
                   analysisError.category === 'connectivity' ? '🌐' :
                   analysisError.category === 'rate_limited' ? '⏳' :
                   analysisError.category === 'timeout' ? '⏱' : '⚠'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem',
                    color: analysisError.category === 'usage_exhausted' ? '#92400E' : '#991B1B',
                  }}>
                    {analysisError.category === 'usage_exhausted' ? 'AI Usage Limit Reached' :
                     analysisError.category === 'authentication' ? 'AI Authentication Failed' :
                     analysisError.category === 'connectivity' ? 'Connection Issue' :
                     analysisError.category === 'rate_limited' ? 'AI Service Temporarily Unavailable' :
                     analysisError.category === 'timeout' ? 'AI Request Timed Out' :
                     analysisError.category === 'overloaded' ? 'AI Service Overloaded' :
                     'Analysis Failed'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#4B5563', lineHeight: 1.5 }}>
                    {analysisError.message}
                  </div>
                </div>
                <button
                  onClick={() => setAnalysisError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '1.1rem', padding: 0, lineHeight: 1 }}
                  aria-label="Dismiss"
                >
                  &times;
                </button>
              </div>
            </div>
          )}

          <div className="research-configure__actions">
            <button
              className="research-page__new-btn"
              onClick={() => { setAnalysisError(null); handleStartAnalysis(); }}
              disabled={analysisStarting || extractedDocs.length === 0}
              style={(analysisStarting || extractedDocs.length === 0) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {analysisStarting ? 'Starting...' : analysisError ? 'Retry AI Analysis' : 'Run AI Analysis'}
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
          {/* Analysis Summary Card */}
          <AnalysisSummary projectId={projectId} stats={stats} />

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

      {/* Step 6: Verify */}
      {project.status === 'verifying' && (
        <>
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
              onMarkComplete={handleMarkComplete}
              isExporting={isExporting}
              lastExport={lastExport}
              showUITooltips={showUITooltips}
            />
          )}
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
