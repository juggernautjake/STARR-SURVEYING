// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import { usePageError } from '../../hooks/usePageError';
import PipelineStepper from '../components/PipelineStepper';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import PropertySearchPanel from '../components/PropertySearchPanel';
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
import { PipelineProgressPanel, PipelineProgressStyles, type PipelineLogEntry } from '../components/PipelineProgressPanel';
import ResearchRunPanel from '../components/ResearchRunPanel';
import ArtifactGallery from '../components/ArtifactGallery';
import type { ResearchProject, ResearchDocument, DrawingElement, RenderedDrawing, ViewMode, WorkflowStep, ComparisonResult, ExportFormat } from '@/types/research';
import { WORKFLOW_STEPS, workflowStepToStage } from '@/types/research';

// ── Page-level constants ─────────────────────────────────────────────────────

const RESEARCH_SOURCES = [
  'County Appraisal District',
  'County Clerk / Deed Records',
  'FEMA Flood Maps',
  'TxDOT ROW',
  'USGS National Map',
  'Texas GLO',
  'TX Railroad Commission',
  'TNRIS',
  'County GIS Portal',
  'City Records',
] as const;

const JOB_NOTES_PLACEHOLDER =
  'Add job preparation notes, field instructions, equipment needed, special considerations…\n\n' +
  'Examples:\n' +
  '• Equipment needed: total station, GPS rover, rebar/caps, lath\n' +
  '• Site access: gate code is ___, call owner before arrival\n' +
  '• Special instructions: check for creek encroachment on east boundary\n' +
  '• Adjacent owner contact: ___\n' +
  '• Estimated field time: 4–6 hours';

// ── ReviewDocCard — collapsible document card for Stage 3 ────────────────────

interface ReviewDocCardProps {
  typeIcon: string;
  title: string;
  typeName: string;
  doc: {
    id: string;
    processing_status?: string | null;
    extracted_text?: string | null;
    recorded_date?: string | null;
    recording_info?: string | null;
    page_count?: number | null;
    ocr_confidence?: number | null;
    file_size_bytes?: number | null;
    created_at?: string | null;
    source_url?: string | null;
  };
  excerpt: string | null;
  hasViewable: boolean;
  onView: () => void;
}

function ReviewDocCard({ typeIcon, title, typeName, doc, excerpt, hasViewable, onView }: ReviewDocCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`review-doc-card${open ? ' review-doc-card--open' : ''}`}>
      <div className="review-doc-card__header" onClick={() => setOpen(o => !o)}>
        <span className="review-doc-card__icon">{typeIcon}</span>
        <span className="review-doc-card__title">{title}</span>
        <span className="review-doc-card__type">{typeName}</span>
        {doc.processing_status === 'analyzed' && (
          <span className="review-doc-card__badge review-doc-card__badge--ok">✓ Analyzed</span>
        )}
        {doc.processing_status === 'error' && (
          <span className="review-doc-card__badge review-doc-card__badge--err">⚠ Error</span>
        )}
        {hasViewable && (
          <span className="review-doc-card__badge review-doc-card__badge--img">📸 Images Available</span>
        )}
        <span className="review-doc-card__chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="review-doc-card__body">
          {excerpt && (
            <div className="review-doc-card__excerpt">{excerpt}</div>
          )}
          <div className="review-doc-card__meta">
            {doc.recorded_date && <span>📅 {doc.recorded_date}</span>}
            {doc.recording_info && <span>📋 {doc.recording_info}</span>}
            {doc.page_count != null && <span>📄 {doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>}
            {doc.ocr_confidence != null && <span>🔬 OCR {Math.round(doc.ocr_confidence * 100)}%</span>}
            {doc.file_size_bytes != null && <span>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>}
            {doc.created_at && <span title={doc.created_at}>Added {new Date(doc.created_at).toLocaleDateString()}</span>}
          </div>
          <div className="review-doc-card__actions">
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="review-doc-card__action review-doc-card__action--link"
              >
                🔗 Open Source ↗
              </a>
            )}
            {hasViewable && (
              <button
                onClick={onView}
                className="review-doc-card__action review-doc-card__action--view"
              >
                🖼️ View Pages / PDF
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

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

  // Review pipeline logs are loaded on-demand by PipelineProgressPanel via onLoadLogs
  // when the AI Logs tab is first viewed (no external state needed here).

  // ── Stage 1 → Stage 2 navigation state ───────────────────────────────────
  // When the user clicks "Initiate Research & Analysis" in Stage 1, we store
  // the form values and set shouldAutoStartPipeline so Stage 2's
  // PropertySearchPanel auto-fires research the moment it mounts.
  const [shouldAutoStartPipeline, setShouldAutoStartPipeline] = useState(false);
  const [pendingSearchParams, setPendingSearchParams] = useState<{
    address: string; county: string; parcelId: string; ownerName: string;
  } | null>(null);
  // Set to true the moment any pipeline run begins (deep or lite).
  // Used to hide the intro title/description once research is underway.
  const [pipelineHasStarted, setPipelineHasStarted] = useState(false);

  // Review state
  const [reviewTab, setReviewTab] = useState<'summary' | 'property' | 'survey' | 'easements' | 'discrepancies' | 'artifacts'>('summary');
  const [showBriefing, setShowBriefing] = useState(true);
  const [viewerDoc, setViewerDoc] = useState<ResearchDocument | null>(null);
  const [viewerHighlight, setViewerHighlight] = useState<string | undefined>(undefined);
  /** Extra PDF URL from the worker pipeline result (populated after deep search) */
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);

  // Job Prep tab state (Stage 4)
  const [jobPrepTab, setJobPrepTab] = useState<'drawing' | 'fieldplan' | 'finaldoc'>('drawing');
  // Editable job notes for the Final Document (persisted in analysis_metadata.job_notes)
  const [jobNotes, setJobNotes] = useState('');
  const [savingJobNotes, setSavingJobNotes] = useState(false);
  const jobNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // Restore user-authored job notes from analysis_metadata
        const meta = (data.project.analysis_metadata as Record<string, unknown>) ?? {};
        if (typeof meta.job_notes === 'string') {
          setJobNotes(meta.job_notes);
        }
      } else {
        router.replace('/admin/research');
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load project' });
    }
  }, [projectId, reportPageError, router]);

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
  }, [projectId, reportPageError]);

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

  /** Auto-saves job notes to the server (debounced). */
  function handleJobNotesChange(value: string) {
    setJobNotes(value);
    if (jobNotesTimerRef.current) clearTimeout(jobNotesTimerRef.current);
    jobNotesTimerRef.current = setTimeout(async () => {
      setSavingJobNotes(true);
      try {
        await fetch('/api/admin/research', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: projectId, job_notes: value }),
        });
      } catch { /* silently ignore — next save will retry */ }
      setSavingJobNotes(false);
    }, 1200);
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

    const stepLabels: Record<WorkflowStep, string> = {
      upload: 'Property Information',
      configure: 'Research & Analysis',
      analyzing: 'Research & Analysis',
      review: 'Review',
      drawing: 'Job Prep',
      verifying: 'Job Prep',
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

  const handleUndo = useCallback(() => {
    if (annotationHistory.length === 0) return;
    const prev = annotationHistory[annotationHistory.length - 1];
    setAnnotationFuture(f => [...f, annotations]);
    setAnnotations(prev);
    setAnnotationHistory(h => h.slice(0, -1));
  }, [annotationHistory, annotations]);

  const handleRedo = useCallback(() => {
    if (annotationFuture.length === 0) return;
    const next = annotationFuture[annotationFuture.length - 1];
    setAnnotationHistory(h => [...h, annotations]);
    setAnnotations(next);
    setAnnotationFuture(f => f.slice(0, -1));
  }, [annotationFuture, annotations]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status, loadDrawings, projectId]);

  // Sanitized SVG for Final Document preview (uses DOMPurify same as DrawingCanvas)
  // Must be declared before any early returns to satisfy React hooks rules-of-hooks.
  const sanitizedDrawingSvg = useMemo(() => {
    if (!drawingSvg) return '';
    return DOMPurify.sanitize(drawingSvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
  }, [drawingSvg]);

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

  // Derive the current pipeline stage from the underlying DB status
  const currentStage = workflowStepToStage(project.status);
  // Count only manually uploaded documents (excludes internet-sourced pipeline imports)
  const uploadedDocumentCount = documents.filter(d => d.source_type === 'user_upload').length;

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

      {/* Project Navigation Bar */}
      <div className="research-project-nav">
        <Link href={`/admin/research/${projectId}/boundary`} className="research-project-nav__link">
          📐 Boundary Viewer
        </Link>
        <Link href={`/admin/research/${projectId}/documents`} className="research-project-nav__link">
          📁 Documents
        </Link>
        <Link href="/admin/research/library" className="research-project-nav__link">
          📚 Library
        </Link>
        <Link href="/admin/research/billing" className="research-project-nav__link">
          💳 Billing
        </Link>
      </div>

      {/* Header */}
      <div className="research-page__header">
        <div>
          <h1 className="research-page__title">{project.name}</h1>
          {project.property_address && (
            <div style={{ color: '#374151', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              📍 {project.property_address}
              {project.county && (
                <span className="research-county-badge">
                  {project.county} County{project.state ? `, ${project.state}` : ''}
                </span>
              )}
              {!project.county && project.state && `, ${project.state}`}
            </div>
          )}
          {project.description && (
            <div style={{ color: '#4B5563', fontSize: '0.85rem', marginTop: '0.25rem' }}>
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
            ✏️ Edit Details
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

      {/* 4-Stage Pipeline Stepper — clicking a completed stage reverts to it */}
      <PipelineStepper
        currentStatus={project.status}
        onStageClick={project.status !== 'analyzing' ? handleRevertToStep : undefined}
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

      {/* ════════════════════════════════════════════════════════════════
          STAGE 1: UPLOAD & PROVISION
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'upload' && (
        <>
          <div className="research-step-header">
            <span className="research-step-header__icon">📤</span>
            <div className="research-step-header__body">
              <h2 className="research-step-header__title">Property Information</h2>
              <p className="research-step-header__desc">
                Upload deeds, plats, field notes, and other surveying documents, and provide the property details below.
                When ready, click <strong>Initiate Research &amp; Analysis</strong> to proceed to Stage 2 — STARR RECON will search all public records,
                capture screenshots of county CAD and deed websites, extract all data with AI, and log any discrepancies.
              </p>
            </div>
          </div>
          <DocumentUploadPanel
            projectId={projectId}
            documents={documents}
            onDocumentsChanged={() => { loadDocuments(); loadProject(); }}
          />
          {/* Property info form only — search results and pipeline progress are shown in Stage 2 */}
          <PropertySearchPanel
            projectId={projectId}
            defaultAddress={project.property_address || ''}
            defaultCounty={project.county || ''}
            defaultParcelId={project.parcel_id || ''}
            hideResultsAndProgress
            onNavigateAway={(params) => {
              setPendingSearchParams(params);
              setShouldAutoStartPipeline(true);
              handleStatusUpdate('configure');
            }}
            onImported={() => { loadDocuments(); loadProject(); }}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STAGE 2: RESEARCH & ANALYSIS
          Shows only: (1) progress indicator and (2) raw log viewer.
          No address form, no document pills, no result card.
          "Continue to Review" button appears on completion.
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'research' && (
        <div className="research-stage2">
          <div className="research-stage2__launch">
            <div className="research-step-header" style={{ marginBottom: '1rem' }}>
              <span className="research-step-header__icon">🔬</span>
              <div className="research-step-header__body">
                <h2 className="research-step-header__title">Research &amp; Analysis</h2>
              </div>
            </div>
            <ResearchRunPanel
              projectId={projectId}
              address={pendingSearchParams?.address ?? project.property_address ?? ''}
              county={pendingSearchParams?.county ?? project.county ?? ''}
              parcelId={pendingSearchParams?.parcelId ?? project.parcel_id ?? ''}
              ownerName={pendingSearchParams?.ownerName ?? (project as unknown as { owner_name?: string }).owner_name ?? ''}
              autoStart={shouldAutoStartPipeline}
              onPipelineStart={() => {
                setPipelineHasStarted(true);
              }}
              onPipelineComplete={(status) => {
                setShouldAutoStartPipeline(false);
                loadDocuments();
                loadProject();
              }}
              onBack={() => {
                setPipelineHasStarted(false);
                handleRevertToStep('upload');
              }}
              onContinueToReview={() => {
                loadDocuments();
                loadProject();
                handleStatusUpdate('review');
              }}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STAGE 3: REVIEW
          Layout (top to bottom):
            1. Summary panel with 5 tabs (Summary, Property Info, Survey Data, Easements, Discrepancies)
            2. Raw Log Viewer (standalone, always visible)
            3. Document/Source List (flat expandable cards)
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'review' && (
        <div className="research-review">
          {/* ── Header ── */}
          <div className="research-step-header">
            <span className="research-step-header__icon">📋</span>
            <div className="research-step-header__body">
              <h2 className="research-step-header__title">Review Results</h2>
              <p className="research-step-header__desc">
                Review the complete research summary, extracted data, discrepancies, source documents, and logs.
              </p>
            </div>
          </div>

          {/* ── Navigation ── */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button className="research-back-btn" style={{ margin: 0 }} onClick={() => handleRevertToStep('configure')}>
              ← Back to Research &amp; Analysis
            </button>
            <button
              className="research-page__new-btn"
              onClick={() => handleStatusUpdate('drawing')}
            >
              Continue to Job Prep →
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION 1 — Summary Panel with Tabs
              ══════════════════════════════════════════════════════ */}
          <div className="review-summary-panel">
            {/* Tab bar */}
            <div className="review-summary-panel__tabs">
              {(['summary', 'property', 'survey', 'easements', 'discrepancies', 'artifacts'] as const).map(tab => (
                <button
                  key={tab}
                  className={`review-summary-panel__tab${reviewTab === tab ? ' review-summary-panel__tab--active' : ''}`}
                  onClick={() => setReviewTab(tab as typeof reviewTab)}
                >
                  {tab === 'summary'       && '📊 Summary'}
                  {tab === 'property'      && '🏠 Property Info'}
                  {tab === 'survey'        && '📐 Survey Data'}
                  {tab === 'easements'     && '🛤️ Easements'}
                  {tab === 'discrepancies' && (
                    <>Discrepancies{stats.discrepancy_count > 0 && <span className="review-summary-panel__tab-badge">{stats.discrepancy_count}</span>}</>
                  )}
                  {tab === 'artifacts'     && '📸 Artifacts'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="review-summary-panel__body">

              {/* ── Tab: Summary ── */}
              {reviewTab === 'summary' && (() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const result = meta?.result as Record<string, unknown> | null;
                const finalSummary = (result?.finalSummary ?? meta?.finalSummary ?? '') as string;
                const ownerName = (result?.ownerName ?? (meta as Record<string, unknown> | null)?.ownerName ?? '') as string;
                const propertyId = (result?.propertyId ?? project.parcel_id ?? '') as string;
                const situsAddress = (result?.situsAddress ?? '') as string;
                const acreage = (result?.acreage ?? '') as string | number;
                const legalDesc = (result?.legalDescription ?? project.legal_description_summary ?? '') as string;
                const docCount = stats.document_count || (result?.documentCount as number ?? 0);
                const dpCount = stats.data_point_count;
                const discCount = stats.discrepancy_count || (result?.discrepancyCount as number ?? 0);
                const durationMs = (result?.duration_ms ?? 0) as number;
                const boundary = result?.boundary as { type?: string; callCount?: number; confidence?: number; verified?: boolean; bearingsAndDistances?: string[]; monuments?: string[] } | null;
                const callCount = boundary?.callCount ?? boundary?.bearingsAndDistances?.length ?? 0;
                const monumentCount = boundary?.monuments?.length ?? 0;
                const confidenceTier = (result?.confidenceTier ?? '') as string;
                const confidenceScore = (result?.confidenceScore ?? 0) as number;
                const fema = result?.fema as { floodZone?: string; inSFHA?: boolean } | null;
                const txdot = result?.txdot as { highwayName?: string; rowWidth?: number | null } | null;
                const screenshotCount = (result?.screenshotCount ?? 0) as number;
                const errorCount = ((result?.errors ?? []) as Array<{recovered: boolean}>).length;
                const fatalErrors = ((result?.errors ?? []) as Array<{recovered: boolean}>).filter(e => !e.recovered).length;
                return (
                  <div className="review-tab-content">
                    {/* Stats row */}
                    <div className="review-stats-row">
                      {ownerName && <div className="review-stat"><span className="review-stat__label">Owner</span><span className="review-stat__value">{ownerName}</span></div>}
                      {propertyId && <div className="review-stat"><span className="review-stat__label">Property ID</span><span className="review-stat__value">{propertyId}</span></div>}
                      {situsAddress && <div className="review-stat"><span className="review-stat__label">Address</span><span className="review-stat__value">{situsAddress}</span></div>}
                      {acreage && <div className="review-stat"><span className="review-stat__label">Acreage</span><span className="review-stat__value">{acreage} ac</span></div>}
                      {callCount > 0 && <div className="review-stat"><span className="review-stat__label">Boundary Calls</span><span className="review-stat__value">{callCount}</span></div>}
                      {monumentCount > 0 && <div className="review-stat"><span className="review-stat__label">Monuments</span><span className="review-stat__value">{monumentCount}</span></div>}
                      {confidenceTier && <div className="review-stat"><span className="review-stat__label">Confidence</span><span className="review-stat__value">{confidenceTier} ({confidenceScore}/100)</span></div>}
                      {docCount > 0 && <div className="review-stat"><span className="review-stat__label">Documents</span><span className="review-stat__value">{docCount}</span></div>}
                      {dpCount > 0 && <div className="review-stat"><span className="review-stat__label">Data Points</span><span className="review-stat__value">{dpCount}</span></div>}
                      {discCount > 0 && <div className="review-stat review-stat--warn"><span className="review-stat__label">Discrepancies</span><span className="review-stat__value">{discCount}</span></div>}
                      {fema && <div className="review-stat"><span className="review-stat__label">Flood Zone</span><span className="review-stat__value" style={{ color: fema.inSFHA ? '#f87171' : '#4ade80' }}>{fema.floodZone}{fema.inSFHA ? ' (SFHA)' : ''}</span></div>}
                      {txdot && <div className="review-stat"><span className="review-stat__label">TxDOT ROW</span><span className="review-stat__value">{txdot.highwayName ?? 'Highway'}{txdot.rowWidth ? ` (${txdot.rowWidth}ft)` : ''}</span></div>}
                      {screenshotCount > 0 && <div className="review-stat"><span className="review-stat__label">Screenshots</span><span className="review-stat__value">{screenshotCount}</span></div>}
                      {durationMs > 0 && <div className="review-stat"><span className="review-stat__label">Duration</span><span className="review-stat__value">{durationMs >= 60000 ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s` : `${(durationMs / 1000).toFixed(1)}s`}</span></div>}
                      {errorCount > 0 && <div className={`review-stat${fatalErrors > 0 ? ' review-stat--warn' : ''}`}><span className="review-stat__label">Errors</span><span className="review-stat__value">{errorCount} ({fatalErrors} fatal)</span></div>}
                    </div>
                    {/* Legal description */}
                    {legalDesc && (
                      <div className="review-legal-desc">
                        <div className="review-legal-desc__label">Legal Description</div>
                        <div className="review-legal-desc__text">{legalDesc}</div>
                      </div>
                    )}
                    {/* Narrative summary */}
                    {finalSummary ? (
                      <div className="review-narrative">
                        <div className="review-narrative__label">Research Summary</div>
                        <div className="review-narrative__text">{finalSummary}</div>
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
                        No summary available. Run the full research pipeline to generate a summary.
                      </div>
                    )}

                    {/* ── Coherence Review ── */}
                    {(() => {
                      const cr = meta?.coherence_review as Record<string, unknown> | null;
                      if (!cr) return null;

                      const verdict = (cr.overall_verdict ?? 'unknown') as string;
                      const score = (cr.overall_score ?? 0) as number;
                      const statement = (cr.confidence_statement ?? '') as string;
                      const summary = (cr.summary ?? '') as string;
                      const dq = cr.data_quality as Record<string, { score: number; assessment: string }> | null;
                      const coherenceIssues = (cr.coherence_issues ?? []) as Array<{ severity: string; area: string; title: string; description: string; recommendation: string }>;
                      const pipelineIssues = (cr.pipeline_issues ?? []) as Array<{ severity: string; category: string; title: string; description: string; suggested_fix: string }>;
                      const fieldNotes = (cr.field_survey_notes ?? []) as string[];
                      const missing = (cr.missing_information ?? []) as string[];

                      const verdictColors: Record<string, string> = {
                        ready_for_fieldwork: '#059669',
                        needs_attention: '#D97706',
                        significant_issues: '#DC2626',
                        unreliable: '#991B1B',
                      };
                      const verdictLabels: Record<string, string> = {
                        ready_for_fieldwork: 'Ready for Fieldwork',
                        needs_attention: 'Needs Attention',
                        significant_issues: 'Significant Issues',
                        unreliable: 'Unreliable',
                      };

                      return (
                        <div className="coherence-review">
                          <div className="coherence-review__header">
                            <span className="coherence-review__title">Quality & Coherence Review</span>
                            <span
                              className="coherence-review__verdict"
                              style={{ color: verdictColors[verdict] || '#6B7280' }}
                            >
                              {verdictLabels[verdict] || verdict} — {score}/100
                            </span>
                          </div>

                          {statement && (
                            <div className="coherence-review__statement">{statement}</div>
                          )}

                          {summary && (
                            <div className="coherence-review__summary">{summary}</div>
                          )}

                          {/* Data quality scores */}
                          {dq && (
                            <div className="coherence-review__scores">
                              <div className="coherence-review__scores-title">Data Quality Scores</div>
                              <div className="coherence-review__scores-grid">
                                {Object.entries(dq).map(([key, val]) => (
                                  <div key={key} className="coherence-review__score-item">
                                    <div className="coherence-review__score-bar">
                                      <div
                                        className="coherence-review__score-fill"
                                        style={{
                                          width: `${Math.min(val.score, 100)}%`,
                                          background: val.score >= 70 ? '#059669' : val.score >= 40 ? '#D97706' : '#DC2626',
                                        }}
                                      />
                                    </div>
                                    <span className="coherence-review__score-label">
                                      {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className="coherence-review__score-value">{val.score}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Coherence issues */}
                          {coherenceIssues.length > 0 && (
                            <div className="coherence-review__section">
                              <div className="coherence-review__section-title">
                                Coherence Issues ({coherenceIssues.length})
                              </div>
                              {coherenceIssues.map((issue, i) => (
                                <div key={i} className={`coherence-review__issue coherence-review__issue--${issue.severity}`}>
                                  <div className="coherence-review__issue-header">
                                    <span className="coherence-review__issue-severity">
                                      {issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                                    </span>
                                    <span className="coherence-review__issue-title">{issue.title}</span>
                                    <span className="coherence-review__issue-area">{issue.area}</span>
                                  </div>
                                  <div className="coherence-review__issue-desc">{issue.description}</div>
                                  {issue.recommendation && (
                                    <div className="coherence-review__issue-rec">
                                      → {issue.recommendation}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Pipeline issues (dev/debug) */}
                          {pipelineIssues.length > 0 && (
                            <div className="coherence-review__section">
                              <div className="coherence-review__section-title">
                                Pipeline Diagnostics ({pipelineIssues.length})
                              </div>
                              {pipelineIssues.map((issue, i) => (
                                <div key={i} className={`coherence-review__issue coherence-review__issue--${issue.severity}`}>
                                  <div className="coherence-review__issue-header">
                                    <span className="coherence-review__issue-severity">
                                      {issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                                    </span>
                                    <span className="coherence-review__issue-title">{issue.title}</span>
                                    <span className="coherence-review__issue-area">{issue.category}</span>
                                  </div>
                                  <div className="coherence-review__issue-desc">{issue.description}</div>
                                  {issue.suggested_fix && (
                                    <div className="coherence-review__issue-rec">
                                      Fix: {issue.suggested_fix}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Field survey notes */}
                          {fieldNotes.length > 0 && (
                            <div className="coherence-review__section">
                              <div className="coherence-review__section-title">Field Survey Notes</div>
                              <ul className="coherence-review__list">
                                {fieldNotes.map((note, i) => (
                                  <li key={i}>{note}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Missing information */}
                          {missing.length > 0 && (
                            <div className="coherence-review__section">
                              <div className="coherence-review__section-title">Missing Information</div>
                              <ul className="coherence-review__list coherence-review__list--missing">
                                {missing.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── Tab: Property Info ── */}
              {reviewTab === 'property' && (() => {
                const proj = project as unknown as {
                  property_address?: string | null;
                  county?: string | null;
                  state?: string | null;
                  owner_name?: string | null;
                  parcel_id?: string | null;
                  legal_description?: string | null;
                  acreage?: number | null;
                };
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const result = meta?.result as Record<string, unknown> | null;
                const ownerFromResult = (result?.ownerName ?? '') as string;
                const legalFromResult = (result?.legalDescription ?? '') as string;
                const propertyIdFromResult = (result?.propertyId ?? '') as string;
                const lotNumber = (result?.lotNumber ?? '') as string;
                const blockNumber = (result?.blockNumber ?? '') as string;
                const subdivisionName = (result?.subdivisionName ?? '') as string;
                const fields = [
                  { label: 'Property Address', value: proj.property_address || (result?.situsAddress as string) },
                  { label: 'County', value: proj.county },
                  { label: 'State', value: proj.state },
                  { label: 'Owner Name', value: proj.owner_name || ownerFromResult },
                  { label: 'Parcel / Property ID', value: proj.parcel_id || propertyIdFromResult },
                  { label: 'Lot', value: lotNumber || null },
                  { label: 'Block', value: blockNumber || null },
                  { label: 'Subdivision', value: subdivisionName || null },
                  { label: 'Legal Description', value: proj.legal_description || legalFromResult || project.legal_description_summary, wide: true },
                  { label: 'Acreage', value: proj.acreage ? `${proj.acreage} ac` : (result?.acreage ? `${result.acreage} ac` : null) },
                ].filter(r => r.value);
                return (
                  <div className="review-tab-content">
                    {fields.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                        No property information on file. Go back to Property Information to add details.
                      </div>
                    ) : (
                      <div className="review-property-grid">
                        {fields.map(r => (
                          <div key={r.label} className={`review-property-field${r.wide ? ' review-property-field--wide' : ''}`}>
                            <div className="review-property-field__label">{r.label}</div>
                            <div className="review-property-field__value">{r.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Tab: Survey Data ── */}
              {reviewTab === 'survey' && (() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const result = meta?.result as Record<string, unknown> | null;
                const boundary = result?.boundary as {
                  bearingsAndDistances?: string[];
                  lotDimensions?: string[];
                  monuments?: string[];
                  curves?: string[];
                  rowWidths?: string[];
                  platEasements?: string[];
                  callCount?: number;
                  confidence?: number;
                } | null;
                const chainOfTitle = (result?.chainOfTitle ?? []) as Array<{
                  order: number; instrumentNumber: string | null; date: string | null;
                  from: string; to: string; type: string;
                }>;
                const platAnalyses = (result?.platAnalyses ?? []) as Array<{
                  name: string; instrumentNumber: string | null; date: string | null;
                  narrative: string; bearingsAndDistances: string[]; lotDimensions: string[];
                  monuments: string[]; easements: string[]; curves: string[];
                  rowWidths: string[]; adjacentReferences: string[]; changesFromPrevious: string[];
                }>;
                const crossValidation = (result?.crossValidation ?? []) as string[];
                const deedSummary = (result?.deedSummary ?? '') as string;
                const platSummary = (result?.platSummary ?? '') as string;

                const hasBoundary = boundary && (boundary.bearingsAndDistances?.length ?? 0) > 0;
                const hasChain = chainOfTitle.length > 0;
                const hasPlats = platAnalyses.length > 0;

                return (
                  <div className="review-tab-content">
                    {/* Deed Summary */}
                    {deedSummary && (
                      <div className="review-narrative" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Deed Analysis Summary</div>
                        <div className="review-narrative__text">{deedSummary}</div>
                      </div>
                    )}

                    {/* Plat Summary */}
                    {platSummary && (
                      <div className="review-narrative" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Plat Analysis Summary</div>
                        <div className="review-narrative__text">{platSummary}</div>
                      </div>
                    )}

                    {/* Boundary Bearings & Distances */}
                    {hasBoundary ? (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Boundary Bearings &amp; Distances ({boundary.bearingsAndDistances?.length ?? 0} calls)</div>
                        <table className="review-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginTop: '0.5rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #1e40af' }}>
                              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#1e3a8a', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase' as const }}>#</th>
                              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#1e3a8a', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase' as const }}>Bearing / Distance Call</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(boundary.bearingsAndDistances ?? []).map((call, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #dbeafe', background: i % 2 === 0 ? '#f0f7ff' : '#ffffff' }}>
                                <td style={{ padding: '0.4rem 0.6rem', color: '#1e40af', fontWeight: 700, width: '2.5rem' }}>{i + 1}</td>
                                <td style={{ padding: '0.4rem 0.6rem', color: '#111827', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.02em' }}>{call}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ color: '#6b7280', fontStyle: 'italic', padding: '0.5rem 0' }}>
                        No boundary bearing/distance data extracted. This requires plat images to be analyzed by AI (ensure <code>sharp</code> is installed on the worker).
                      </div>
                    )}

                    {/* Lot Dimensions */}
                    {(boundary?.lotDimensions?.length ?? 0) > 0 && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Lot Dimensions</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {boundary!.lotDimensions!.map((d, i) => (
                            <li key={i} style={{ color: '#0f766e', fontSize: '0.88rem', marginBottom: '0.3rem', fontFamily: 'monospace', fontWeight: 700 }}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Monuments */}
                    {(boundary?.monuments?.length ?? 0) > 0 && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Monuments ({boundary!.monuments!.length})</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {boundary!.monuments!.map((m, i) => (
                            <li key={i} style={{ color: '#166534', fontSize: '0.88rem', marginBottom: '0.3rem', fontWeight: 600 }}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Curves */}
                    {(boundary?.curves?.length ?? 0) > 0 && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Curves / Arc Data</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {boundary!.curves!.map((c, i) => (
                            <li key={i} style={{ color: '#6b21a8', fontSize: '0.88rem', marginBottom: '0.3rem', fontFamily: 'monospace', fontWeight: 700 }}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Cross-Validation Notes */}
                    {crossValidation.length > 0 && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Cross-Validation (Plat vs Deed)</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {crossValidation.map((note, i) => (
                            <li key={i} style={{
                              color: note.startsWith('MATCH') ? '#166534' : note.startsWith('MISMATCH') ? '#b91c1c' : '#4b5563',
                              fontSize: '0.85rem', marginBottom: '0.2rem', fontWeight: 600,
                            }}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Chain of Title */}
                    {hasChain && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Chain of Title ({chainOfTitle.length} links)</div>
                        <table className="review-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #334155' }}>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>#</th>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>Date</th>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>From</th>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>To</th>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>Instrument</th>
                              <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#94a3b8' }}>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chainOfTitle.map((link, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#64748b' }}>{link.order}</td>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#e2e8f0' }}>{link.date || '—'}</td>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#e2e8f0' }}>{link.from}</td>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#e2e8f0' }}>{link.to}</td>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{link.instrumentNumber || '—'}</td>
                                <td style={{ padding: '0.3rem 0.6rem', color: '#94a3b8' }}>{link.type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Per-Plat AI Analysis Details */}
                    {hasPlats && (
                      <div className="review-data-section" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Plat Analysis Details</div>
                        {platAnalyses.map((plat, pi) => (
                          <div key={pi} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.5rem' }}>
                            <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.3rem' }}>
                              {plat.name}{plat.instrumentNumber ? ` (Inst# ${plat.instrumentNumber})` : ''}{plat.date ? ` — ${plat.date}` : ''}
                            </div>
                            {plat.narrative && <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{plat.narrative}</div>}
                            {plat.adjacentReferences.length > 0 && (
                              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.3rem' }}>
                                Adjacent: {plat.adjacentReferences.join('; ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback: DataPointsPanel for any extracted data points */}
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
                      <div className="review-narrative__label" style={{ marginBottom: '0.5rem' }}>Extracted Data Points</div>
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
                    </div>
                  </div>
                );
              })()}

              {/* ── Tab: Easements ── */}
              {reviewTab === 'easements' && (() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const result = meta?.result as Record<string, unknown> | null;
                const easementSummary = (result?.easementSummary ?? '') as string;
                const fema = result?.fema as {
                  floodZone?: string; zoneSubtype?: string | null; inSFHA?: boolean;
                  firmPanel?: string | null; effectiveDate?: string | null; sourceUrl?: string;
                } | null;
                const txdot = result?.txdot as {
                  rowWidth?: number | null; csjNumber?: string | null; highwayName?: string | null;
                  highwayClass?: string | null; district?: string | null; acquisitionDate?: string | null;
                  sourceUrl?: string;
                } | null;
                const easements = (result?.easements ?? []) as Array<{
                  type: string; description: string; instrumentNumber: string | null;
                  width?: string | null; location?: string | null; sourceUrl: string | null; source: string;
                }>;
                const covenants = (result?.restrictiveCovenants ?? []) as string[];
                const rowWidths = ((result?.boundary as Record<string, unknown> | null)?.rowWidths ?? []) as string[];
                const platEasements = ((result?.boundary as Record<string, unknown> | null)?.platEasements ?? []) as string[];

                const hasData = fema || txdot || easements.length > 0 || covenants.length > 0;

                return (
                  <div className="review-tab-content">
                    {/* Easement Summary */}
                    {easementSummary && (
                      <div className="review-narrative" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Easements &amp; Encumbrances Summary</div>
                        <div className="review-narrative__text">{easementSummary}</div>
                      </div>
                    )}

                    {/* FEMA Flood Zone */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>FEMA Flood Zone</div>
                      {fema ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                          <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Zone</span><br/><span style={{ color: fema.inSFHA ? '#f87171' : '#4ade80', fontWeight: 600 }}>{fema.floodZone}</span></div>
                          {fema.zoneSubtype && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Subtype</span><br/><span style={{ color: '#e2e8f0' }}>{fema.zoneSubtype}</span></div>}
                          <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>In SFHA?</span><br/><span style={{ color: fema.inSFHA ? '#f87171' : '#4ade80', fontWeight: 600 }}>{fema.inSFHA ? 'YES — flood insurance required' : 'No'}</span></div>
                          {fema.firmPanel && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>FIRM Panel</span><br/><span style={{ color: '#e2e8f0' }}>{fema.firmPanel}</span></div>}
                          {fema.effectiveDate && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Effective Date</span><br/><span style={{ color: '#e2e8f0' }}>{fema.effectiveDate}</span></div>}
                          {fema.sourceUrl && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Source</span><br/><a href={fema.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.85rem' }}>FEMA MSC</a></div>}
                        </div>
                      ) : (
                        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No FEMA flood zone data available. Requires valid coordinates from geocoding.</div>
                      )}
                    </div>

                    {/* TxDOT Right-of-Way */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>TxDOT Right-of-Way</div>
                      {txdot ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                          {txdot.highwayName && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Highway</span><br/><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{txdot.highwayName}</span></div>}
                          <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>ROW Width</span><br/><span style={{ color: txdot.rowWidth ? '#e2e8f0' : '#94a3b8', fontWeight: 600 }}>{txdot.rowWidth ? `${txdot.rowWidth} ft` : 'Unknown'}</span></div>
                          {txdot.highwayClass && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Classification</span><br/><span style={{ color: '#e2e8f0' }}>{txdot.highwayClass}</span></div>}
                          {txdot.csjNumber && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>CSJ Number</span><br/><span style={{ color: '#e2e8f0' }}>{txdot.csjNumber}</span></div>}
                          {txdot.district && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>District</span><br/><span style={{ color: '#e2e8f0' }}>{txdot.district}</span></div>}
                          {txdot.acquisitionDate && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Acquisition Date</span><br/><span style={{ color: '#e2e8f0' }}>{txdot.acquisitionDate}</span></div>}
                          {txdot.sourceUrl && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Source</span><br/><a href={txdot.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.85rem' }}>TxDOT GIS</a></div>}
                        </div>
                      ) : (
                        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No TxDOT ROW data available. Requires valid coordinates from geocoding.</div>
                      )}
                    </div>

                    {/* ROW Widths from Plats */}
                    {rowWidths.length > 0 && (
                      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>Right-of-Way Widths (from Plats)</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {rowWidths.map((w, i) => (
                            <li key={i} style={{ color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '0.2rem' }}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Easements from Plats */}
                    {platEasements.length > 0 && (
                      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>Easements Shown on Plats ({platEasements.length})</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {platEasements.map((e, i) => (
                            <li key={i} style={{ color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '0.2rem' }}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recorded Easements from Clerk */}
                    {easements.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Recorded Easements ({easements.length})</div>
                        {easements.map((e, i) => (
                          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.5rem' }}>
                            <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{e.type}{e.instrumentNumber ? ` — Inst# ${e.instrumentNumber}` : ''}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.25rem' }}>{e.description}</div>
                            {e.width && <div style={{ color: '#60a5fa', fontSize: '0.85rem', marginTop: '0.15rem' }}>Width: {e.width}</div>}
                            {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.8rem' }}>View Source</a>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Restrictive Covenants */}
                    {covenants.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Restrictive Covenants ({covenants.length})</div>
                        <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
                          {covenants.map((c, i) => (
                            <li key={i} style={{ color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '0.2rem' }}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!hasData && (
                      <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
                        No easement or encumbrance data found. Run the full research pipeline to populate this section.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Tab: Discrepancies ── */}
              {reviewTab === 'discrepancies' && (
                <DiscrepancyPanel
                  projectId={projectId}
                  onCountChange={(total, resolved) => {
                    setStats(prev => ({ ...prev, discrepancy_count: total, resolved_count: resolved }));
                  }}
                />
              )}

              {/* ── Tab: Artifacts — Screenshots, page images, plat images ── */}
              {reviewTab === 'artifacts' && (
                <ArtifactGallery projectId={projectId} />
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION 2 — Raw Log Viewer (always visible)
              ══════════════════════════════════════════════════════ */}
          <div className="review-log-section">
            <div className="review-log-section__header">
              <span className="review-log-section__title">🔍 Research Logs</span>
              <PipelineProgressStyles />
            </div>
            <PipelineProgressPanel
              status="success"
              result={(() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const r = meta?.result as Record<string, unknown> | null;
                if (!r) return undefined;
                return {
                  propertyId: (r.propertyId as string | undefined) ?? undefined,
                  ownerName: (r.ownerName as string | undefined) ?? undefined,
                  legalDescription: (r.legalDescription as string | undefined) ?? undefined,
                  acreage: (r.acreage as string | number | undefined) ?? undefined,
                  documentCount: (r.documentCount as number | undefined) ?? undefined,
                  duration_ms: (r.duration_ms as number | undefined) ?? undefined,
                  boundary: (r.boundary as { type?: string; callCount?: number; confidence?: number; verified?: boolean } | null) ?? null,
                };
              })()}
              masterReportText={(() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const r = meta?.result as Record<string, unknown> | null;
                return (r?.masterReportText as string | undefined) ?? undefined;
              })()}
              onLoadLogs={async () => {
                try {
                  const res = await fetch(`/api/admin/research/${projectId}/logs`);
                  if (!res.ok) return null;
                  const data = await res.json() as { log?: PipelineLogEntry[] };
                  return data.log ?? null;
                } catch { return null; }
              }}
            />
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION 3 — Document/Source List (flat expandable cards)
              ══════════════════════════════════════════════════════ */}
          {(() => {
            const docTypeIcons: Record<string, string> = {
              deed: '📜', plat: '🗺️', survey: '📐', legal_description: '⚖️',
              title_commitment: '📋', easement: '🛤️', restrictive_covenant: '📄',
              field_notes: '📓', subdivision_plat: '🏘️', metes_and_bounds: '📏',
              county_record: '🏛️', appraisal_record: '💰', aerial_photo: '🛰️',
              topo_map: '🗻', utility_map: '🔌', other: '📎',
            };
            const sourceTypeLabels: Record<string, { label: string; icon: string }> = {
              property_search:  { label: 'Research — Web Sources', icon: '🔍' },
              user_upload:      { label: 'User Uploaded', icon: '📤' },
              linked_reference: { label: 'Linked References', icon: '🔗' },
              manual_entry:     { label: 'Manual Entry', icon: '📝' },
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
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#4B5563', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, marginTop: '1rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No documents captured</div>
                  <div style={{ fontSize: '0.85rem' }}>Go back to Research &amp; Analysis to run the pipeline.</div>
                </div>
              );
            }
            return (
              <div className="review-doc-list">
                <div className="review-doc-list__header">
                  <span className="review-doc-list__title">📂 Documents &amp; Sources</span>
                  <span className="review-doc-list__count">{documents.length}</span>
                </div>
                {sortedKeys.map(sourceKey => {
                  const docs = grouped[sourceKey];
                  const { label, icon } = sourceTypeLabels[sourceKey] || { label: sourceKey, icon: '📎' };
                  return (
                    <div key={sourceKey} className="review-doc-group">
                      <div className="review-doc-group__header">
                        <span>{icon}</span>
                        <span className="review-doc-group__label">{label}</span>
                        <span className="review-doc-group__count">{docs.length}</span>
                      </div>
                      {docs.map(doc => {
                        const typeIcon = doc.document_type ? (docTypeIcons[doc.document_type] || '📎') : '📎';
                        const typeName = doc.document_type
                          ? doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                          : 'Document';
                        const title = doc.document_label || doc.original_filename || typeName;
                        const hasViewable = !!(doc.pages_pdf_url || doc.storage_url);
                        const excerpt = doc.extracted_text
                          ? doc.extracted_text.slice(0, 280) + (doc.extracted_text.length > 280 ? '…' : '')
                          : null;
                        return (
                          <ReviewDocCard
                            key={doc.id}
                            typeIcon={typeIcon}
                            title={title}
                            typeName={typeName}
                            doc={doc}
                            excerpt={excerpt}
                            hasViewable={hasViewable}
                            onView={() => {
                              setViewerDoc(doc);
                              setViewerPdfUrl(doc.pages_pdf_url ?? doc.storage_url ?? null);
                              setViewerHighlight(undefined);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STAGE 4: JOB PREP
          Combines drawing, field plan, verification, and final export
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'jobprep' && (
        <div className="research-jobprep">
          <div className="research-step-header">
            <span className="research-step-header__icon">🏗️</span>
            <div className="research-step-header__body">
              <h2 className="research-step-header__title">Job Prep</h2>
              <p className="research-step-header__desc">
                Generate the AI-assisted boundary drawing, review the field plan recommendation, then compile everything into a final printable job package.
              </p>
            </div>
          </div>

          <button className="research-back-btn" onClick={() => handleRevertToStep('review')}>
            &larr; Back to Review
          </button>

          {/* Job Prep Tab Bar */}
          <div className="research-jobprep__tabs">
            <button
              className={`research-jobprep__tab${jobPrepTab === 'drawing' ? ' research-jobprep__tab--active' : ''}`}
              onClick={() => setJobPrepTab('drawing')}
            >
              ✏️ Drawing
            </button>
            <button
              className={`research-jobprep__tab${jobPrepTab === 'fieldplan' ? ' research-jobprep__tab--active' : ''}`}
              onClick={() => setJobPrepTab('fieldplan')}
            >
              📋 Field Plan
            </button>
            <button
              className={`research-jobprep__tab${jobPrepTab === 'finaldoc' ? ' research-jobprep__tab--active' : ''}`}
              onClick={() => setJobPrepTab('finaldoc')}
            >
              🖨️ Final Document
            </button>
          </div>

          {/* ── TAB 1: Drawing ── */}
          {jobPrepTab === 'drawing' && (
            <div className="research-drawing">
              {/* Drawing list (when no active drawing) */}
              {!activeDrawing && (
                <>
                  <div className="research-drawing__controls">
                    <div className="research-drawing__controls-left">
                      <h2 className="research-drawing__title">Boundary Drawing</h2>
                      {drawings.length === 0 && (
                        <button
                          className="research-page__new-btn"
                          onClick={handleGenerateDrawing}
                          disabled={generatingDrawing}
                        >
                          {generatingDrawing ? '⏳ Generating...' : '✨ Generate AI Drawing'}
                        </button>
                      )}
                    </div>
                  </div>
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

                  <div className="research-drawing__workspace">
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

                    {showPrefsPanel && (
                      <DrawingPreferencesPanel
                        preferences={drawingPrefs}
                        onChange={setDrawingPrefs}
                        onClose={() => setShowPrefsPanel(false)}
                        onReset={() => setDrawingPrefs(DEFAULT_PREFERENCES)}
                      />
                    )}

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
                          <div style={{ color: '#6B7280', fontSize: '0.88rem' }}>Loading drawing...</div>
                        </div>
                      )}
                    </div>

                    {selectedElement && (
                      <ElementDetailPanel
                        element={selectedElement}
                        onClose={() => setSelectedElement(null)}
                        onToggleVisibility={(id, vis) => handleTrackedElementUpdate(id, { visible: vis })}
                        onToggleLock={(id, lock) => handleTrackedElementUpdate(id, { locked: lock })}
                        onUpdateNotes={(id, notes) => handleTrackedElementUpdate(id, { user_notes: notes })}
                        onStyleChange={(id, style) => {
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

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', opacity: isOpeningInCAD ? 0.7 : 1 }}
                      onClick={handleOpenInCAD}
                      disabled={isOpeningInCAD}
                      title="Convert this drawing to a full STARR CAD document and open it for editing"
                    >
                      {isOpeningInCAD ? '⏳ Opening…' : '✏️ Open in CAD Editor'}
                    </button>
                    {/* Verify drawing */}
                    <button
                      style={{ background: isVerifying ? '#6B7280' : '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: isVerifying ? 'not-allowed' : 'pointer' }}
                      onClick={handleRunVerification}
                      disabled={isVerifying}
                    >
                      {isVerifying ? '⏳ Verifying…' : '✅ Run Verification'}
                    </button>
                  </div>

                  {/* Verification result (inline in drawing tab) */}
                  {comparisonResult && (
                    <VerificationPanel
                      comparison={comparisonResult}
                      isVerifying={isVerifying}
                      onRunVerification={handleRunVerification}
                      onReVerify={handleRunVerification}
                      onAdvanceToExport={() => { handleAdvanceToExport(); setJobPrepTab('finaldoc'); }}
                      drawingName={activeDrawing.name}
                      showUITooltips={showUITooltips}
                    />
                  )}

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

          {/* ── TAB 2: Field Plan ── */}
          {jobPrepTab === 'fieldplan' && (
            <div>
              <div className="research-step-header" style={{ marginBottom: '1.25rem' }}>
                <span className="research-step-header__icon">📋</span>
                <div className="research-step-header__body">
                  <h2 className="research-step-header__title">AI Field Plan</h2>
                  <p className="research-step-header__desc">
                    Step-by-step field survey plan generated by AI based on all analyzed documents.
                    Use this as your job preparation guide in the field.
                  </p>
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem' }}>
                <SurveyPlanPanel projectId={projectId} />
              </div>
            </div>
          )}

          {/* ── TAB 3: Final Document ── */}
          {jobPrepTab === 'finaldoc' && (
            <div>
              <div className="research-final-doc">
                {/* Header bar */}
                <div className="research-final-doc__header">
                  <div>
                    <h2 className="research-final-doc__title">
                      🖨️ Final Job Package — {project.name}
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
                      🖨️ Print
                    </button>
                    {activeDrawing && (
                      <button
                        className="research-final-doc__btn research-final-doc__btn--secondary"
                        onClick={handleOpenInCAD}
                        disabled={isOpeningInCAD}
                      >
                        {isOpeningInCAD ? '⏳ Opening…' : '✏️ Open in CAD Editor'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="research-final-doc__body">
                  {/* Property Summary */}
                  <div className="research-final-doc__section">
                    <h3 className="research-final-doc__section-title">📍 Property Summary</h3>
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
                      <h3 className="research-final-doc__section-title">✏️ Boundary Drawing</h3>
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', maxHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}
                        dangerouslySetInnerHTML={{ __html: sanitizedDrawingSvg }}
                      />
                      <div style={{ fontSize: '0.78rem', color: '#4B5563', marginTop: '0.5rem', textAlign: 'center' }}>
                        {activeDrawing.name} — v{activeDrawing.version}
                        {activeDrawing.overall_confidence ? ` — ${Math.round(activeDrawing.overall_confidence)}% confidence` : ''}
                      </div>
                    </div>
                  )}
                  {!activeDrawing && (
                    <div className="research-final-doc__section">
                      <h3 className="research-final-doc__section-title">✏️ Boundary Drawing</h3>
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#4B5563', background: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📐</div>
                        <div style={{ fontSize: '0.88rem' }}>
                          No drawing generated yet. Go to the <button onClick={() => setJobPrepTab('drawing')} style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}>Drawing tab</button> to generate an AI boundary drawing.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Field Plan */}
                  <div className="research-final-doc__section">
                    <h3 className="research-final-doc__section-title">📋 AI Field Plan</h3>
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
                            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', textTransform: 'capitalize', marginBottom: '0.5rem' }}>
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
                                        <div style={{ textAlign: 'center', color: '#374151' }}>
                                          <div style={{ fontSize: '2rem' }}>PDF</div>
                                          <div style={{ fontSize: '0.7rem' }}>Click to view</div>
                                        </div>
                                      </div>
                                    )}
                                    <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.75rem', color: '#4B5563', borderTop: '1px solid #E5E7EB' }}>
                                      <div style={{ fontWeight: 500, color: '#374151' }}>
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
                      📝 Job Notes &amp; Field Instructions
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 400, color: '#6B7280', textTransform: 'none', letterSpacing: 0 }}>
                        {savingJobNotes ? '⏳ Saving…' : '(editable — auto-saved)'}
                      </span>
                    </h3>
                    <textarea
                      className="research-final-doc__notes-textarea"
                      value={jobNotes}
                      onChange={e => handleJobNotesChange(e.target.value)}
                      placeholder={JOB_NOTES_PLACEHOLDER}
                      rows={10}
                    />
                  </div>

                  {/* Export Options */}
                  {activeDrawing && (
                    <div className="research-final-doc__section">
                      <h3 className="research-final-doc__section-title">📤 Export Drawing Files</h3>
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
                    </div>
                  )}

                  {/* Source documents index */}
                  {documents.length > 0 && (
                    <div className="research-final-doc__section">
                      <h3 className="research-final-doc__section-title">📎 Source Documents ({documents.length})</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {documents.map((doc, i) => (
                          <div key={doc.id} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', padding: '0.4rem 0', borderBottom: i < documents.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                            <span style={{ color: '#6B7280', width: 20, flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ fontWeight: 600, color: '#1F2937', flex: 1 }}>
                              {doc.document_label || doc.original_filename || doc.document_type?.replace(/_/g, ' ') || 'Document'}
                            </span>
                            {doc.source_url && (
                              <a href={doc.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', flexShrink: 0 }}>
                                🔗 Source
                              </a>
                            )}
                            <span style={{ color: doc.processing_status === 'analyzed' ? '#059669' : '#6B7280', flexShrink: 0 }}>
                              {doc.processing_status === 'analyzed' ? '✓ Analyzed' : doc.processing_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
