// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload, Microscope, ClipboardList, HardHat, Search, FolderOpen, MapPin,
  Pencil, FileText, Paperclip, BarChart3, Home, DraftingCompass, Route, Camera, PackageCheck,
  ScrollText, Map as MapIcon, Scale, Notebook, Ruler, Landmark, DollarSign, Satellite,
  Mountain, Plug, Waves, Link2, Printer, Loader2, Sparkles, CheckCircle2,
  Check, AlertTriangle, X, Inbox, type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import { usePageError } from '../../hooks/usePageError';
import PipelineStepper from '../components/PipelineStepper';
import { confirm as confirmDialog } from '../components/ConfirmDialog';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
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
import GisQualityCard from './_sections/GisQualityCard';
import { gisQualityOf } from './_sections/gis-quality-data';
import DrawingSaveDialog from '../components/DrawingSaveDialog';
import VerificationPanel from '../components/VerificationPanel';
import ExportPanel from '../components/ExportPanel';
import SurveyPlanPanel from '../components/SurveyPlanPanel';
import { PipelineProgressPanel, PipelineProgressStyles, type PipelineLogEntry } from '../components/PipelineProgressPanel';
import { propertyReviewFields, type ProjectLike } from './_sections/property-review-fields';
import { surveyReviewData } from './_sections/survey-review-data';
import { summaryReviewData } from './_sections/summary-review-data';
import { easementsReviewData } from './_sections/easements-review-data';
// The same verdict the API refuses on, so the button and the server can never disagree (S3).
import { checkScope } from '@/lib/research/scope';
import { assessRunReadiness, describeRunReadiness } from '@/lib/research/run-readiness';
import ScopeNotice, { scopeDescribedBy } from '../components/ScopeNotice';
import {
  coherenceReviewData, scoreFillColor, deltaColor, deedCompleteColor,
  DEED_BREAKS_COLOR, MISSING_INSTRUMENTS_COLOR,
} from './_sections/coherence-review-data';
// What the run has spent and how much of its budget is left (research plan R22).
import EditProjectModal, { type EditProjectValue } from './_sections/EditProjectModal';
import { type JobSummary } from '../components/JobLinkPicker';
import ResearchStagePanel from './_sections/ResearchStagePanel';
import UploadStagePanel from './_sections/UploadStagePanel';
import FinalDocumentTab from './_sections/FinalDocumentTab';
import {
  commit as commitAnnotations,
  redo as redoAnnotations,
  silentChange as silentAnnotationChange,
  undo as undoAnnotations,
  type AnnotationHistoryState,
} from './_sections/annotation-history';
import { needsClosing } from './_sections/traverse-geometry';
import { resolveViewStage, stageLabel } from './_sections/stage-view';
import ProjectNotes from '../components/ProjectNotes';
// The coordinate geometry is the CAD library's, not this page's — see the header of
// _sections/traverse-geometry.ts for why a local copy was written and then removed.
import { forwardPoint, formatBearing, inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import ProjectHeader from './_sections/ProjectHeader';
import ProjectStats from './_sections/ProjectStats';
import RerunDialog from '../components/RerunDialog';
import type { StartRunInput } from '../components/useRunState';
// Choosing what goes to the crew (research plan R25).
import PacketBuilderPanel from '../components/PacketBuilderPanel';
// The neighbours, and the opt-in path to researching one properly (research plan R31-R33).
import AdjoinersPanel from '../components/AdjoinersPanel';
// What encumbers this property, including anything recorded against a neighbour (plan R34).
import EncumbrancePanel from '../components/EncumbrancePanel';
import ArtifactGallery from '../components/ArtifactGallery';
import type { ResearchProject, ResearchDocument, DrawingElement, RenderedDrawing, ViewMode, WorkflowStep, ComparisonResult, ExportFormat } from '@/types/research';
import { WORKFLOW_STEPS, workflowStepToStage } from '@/types/research';
import type { PipelineStage } from '@/types/research';
import { JOB_NOTES_PLACEHOLDER, RESEARCH_SOURCES, ReviewDocCard } from './ReviewDocCard';

// ── Page-level constants ─────────────────────────────────────────────────────


/**
 * The owner name a person typed when creating this project.
 *
 * ── IT WAS BEING READ FROM THE WRONG PLACE ──────────────────────────────────────────────────────
 *
 * This was `(project as unknown as { owner_name?: string }).owner_name` — a cast that silences the
 * compiler about a field the type does not declare, because `research_projects` HAS NO `owner_name`
 * COLUMN. The create route stores it inside `analysis_metadata` instead, with the comment "Store
 * owner_name and notes in analysis_metadata for AI context".
 *
 * So the expression was always `undefined`, and the owner name fell through to `''`.
 *
 * That is not cosmetic. `ResearchRunPanel` sends `ownerName` with the run, and the worker's clerk
 * scraper branches on `if (input.ownerName)` to run its owner-based searches — one of the main ways
 * documents are found for a property. **Every project created through the form ran with that path
 * switched off**, and nothing said so: the field accepted the name, saved it, and showed it back.
 *
 * Typed rather than cast. A cast is what hid this for as long as it existed.
 */
function projectOwnerName(project: ResearchProject | null): string | undefined {
  const meta = project?.analysis_metadata;
  if (!meta || typeof meta !== 'object') return undefined;
  const owner = (meta as Record<string, unknown>).owner_name;
  return typeof owner === 'string' && owner.trim() ? owner.trim() : undefined;
}

export default function ResearchProjectPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { reportPageError } = usePageError('ResearchProjectPage');

  const [project, setProject] = useState<ResearchProject | null>(null);
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic browser-tab title so multi-tab users can tell projects
  // apart. Restores the generic title on unmount.
  useEffect(() => {
    const name = project?.name?.trim();
    document.title = name && name.length > 0
      ? `${name} — Research`
      : 'Research — Starr Surveying';
    return () => {
      document.title = 'Research — Starr Surveying';
    };
  }, [project?.name]);

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
  // When the pipeline completes, the worker sets status='review' in the DB.
  // But we want the user to stay on the research stage and click the green
  // "Continue to Review" button before navigating. This flag holds the user
  // on the research stage until they explicitly click through.
  const [holdOnResearchStage, setHoldOnResearchStage] = useState(false);
  // The stage the reader has opened, or null to follow the project (N1). Writes nothing.
  const [viewStage, setViewStage] = useState<PipelineStage | null>(null);

  // Re-run research confirmation dialog
  const [showRerunConfirm, setShowRerunConfirm] = useState(false);
  /**
   * What the re-run dialog was told, held until the run panel mounts and fires it.
   *
   * The settings have to survive the reset-and-remount in between. Without somewhere to keep
   * them they would be collected, displayed, confirmed — and then dropped on the way to the
   * POST, which is the exact defect shape this whole plan is about.
   */
  const [pendingRunInput, setPendingRunInput] = useState<StartRunInput | null>(null);

  // Review state
  const [reviewTab, setReviewTab] = useState<'summary' | 'property' | 'survey' | 'easements' | 'neighbours' | 'discrepancies' | 'artifacts' | 'packet'>('summary');
  // Scroll target for the Quick-stats actionable tiles (Slice C4).
  // Tapping Data Points / Discrepancies / Resolved jumps to the
  // review summary panel and switches to the relevant tab so the
  // user lands in front of the actual rows, not just a number.
  const reviewPanelRef = useRef<HTMLDivElement | null>(null);
  const scrollToReview = useCallback(
    (tab: typeof reviewTab) => {
      setReviewTab(tab);
      // Defer a frame so the tab switch renders before we scroll —
      // otherwise the layout shift races the scroll and the user
      // lands mid-transition.
      requestAnimationFrame(() => {
        reviewPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    },
    []
  );
  const [showBriefing, setShowBriefing] = useState(true);
  const [viewerDoc, setViewerDoc] = useState<ResearchDocument | null>(null);
  const [viewerHighlight, setViewerHighlight] = useState<string | undefined>(undefined);
  /** Extra PDF URL from the worker pipeline result (populated after deep search) */
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);

  // Job Prep tab state (Stage 4)
  const [jobPrepTab, setJobPrepTab] = useState<'drawing' | 'fieldplan' | 'finaldoc'>('drawing');
  // Editable job notes for the Final Document (persisted in analysis_metadata.job_notes)
  const [jobNotes, setJobNotes] = useState('');

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
  const [editProjectData, setEditProjectData] = useState<EditProjectValue>({ name: '', description: '', property_address: '', county: '', state: '', job_id: null });
  // The job the project is linked to, fetched once so the picker can NAME it rather than render
  // "Linked" and make somebody open another tab to find out to what (J1).
  const [linkedJob, setLinkedJob] = useState<JobSummary | null>(null);
  const [savingProject, setSavingProject] = useState(false);

  const userRoles = session?.user?.roles || ['employee'];
  const canAccessResearch = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('researcher') || userRoles.includes('drawer') || userRoles.includes('field_crew') || userRoles.includes('tech_support');

  // Role guard — use useEffect so hooks are never called conditionally
  useEffect(() => {
    if (sessionStatus === 'authenticated' && !canAccessResearch) {
      router.replace('/admin/me');
    }
  }, [sessionStatus, canAccessResearch, router]);

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

  // ── THE LINKED JOB, NAMED (Phase J1) ────────────────────────────────────────────────────────
  //
  // Fetched separately and only when there is one to fetch. A picker that renders "Linked" and
  // nothing else makes somebody open another tab to find out to WHAT, and the research API returns
  // the id rather than the job.
  //
  // A failure here is silent on purpose: the link is still shown by id, and a job lookup that 404s
  // must not stop the project page loading around it.
  useEffect(() => {
    const jobId = (project as { job_id?: string | null } | null)?.job_id;
    if (!jobId) { setLinkedJob(null); return; }
    if (linkedJob?.id === jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/jobs?id=${jobId}`);
        if (!res.ok) return;
        const body = await res.json() as { job?: JobSummary };
        if (!cancelled && body.job) setLinkedJob(body.job);
      } catch { /* the link still renders by id */ }
    })();
    return () => { cancelled = true; };
  }, [project, linkedJob?.id]);

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
      job_id: (project as { job_id?: string | null }).job_id ?? null,
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
    const ok = await confirmDialog({
      title: 'Archive this project?',
      body: 'It will be hidden from the project list but can be recovered later.',
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
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

  // The debounce, the PATCH and the save state all live in <ProjectNotes> now. The copy that
  // used to be here swallowed its own failures — see the note in that component — and two
  // savers racing on one field is worse than one that reports what happened.


  async function handleStatusUpdate(newStatus: WorkflowStep) {
    // Any deliberate move of the PROJECT drops the reader back to following it. Otherwise starting
    // a run while looking at Stage 1 leaves you on Stage 1 watching nothing happen (N1).
    setViewStage(null);
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

    const ok = await confirmDialog({
      title: 'Revert workflow step?',
      body: message,
      confirmLabel: 'Revert',
      tone: 'danger',
    });
    if (!ok) return;

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
        // A revert moves the project, so the reader follows it. Leaving a stale `viewStage` here
        // would show the banner saying "this project has reached X" about the stage you just
        // reverted away from (N1).
        setViewStage(null);

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

  // ── Re-run research ─────────────────────────────────────────────────────
  //
  // Plan C4. This took a two-value `mode` and could express exactly two things: repeat the run,
  // or go back to the Property Information stage and edit the PROJECT. There was no way to
  // change a setting for one attempt, which is what the owner asked for by name.
  //
  // It now takes everything the dialog collected. The property fields are written back to the
  // project because a corrected address is a fact about the property; the ceilings and the
  // paid-documents switch are NOT, and they travel with the run alone — that separation is what
  // lets a re-run turn TexasFile off for one attempt without changing what the project means.
  async function handleRerunResearch(input: StartRunInput) {
    if (!project) return;
    setShowRerunConfirm(false);
    setPendingRunInput(input);

    try {
      const targetStep: WorkflowStep = 'configure';
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          status: targetStep,
          clear_analysis_data: true,
          clear_pipeline_documents: true,
          // Corrections to the property itself are saved. The run-only settings are not sent
          // here — they go with the run.
          ...(input.address ? { property_address: input.address } : {}),
          ...(input.county ? { county: input.county } : {}),
          ...(input.parcelId ? { parcel_id: input.parcelId } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProject(data.project);

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
        setStats(prev => ({ ...prev, data_point_count: 0, discrepancy_count: 0, resolved_count: 0 }));
        loadDocuments();
        loadProject();

        // Straight to the run stage, seeded with what the dialog was told rather than with what
        // the project happened to hold — the two differ precisely when the operator has just
        // corrected something, which is the case that matters.
        setPendingSearchParams({
          address: input.address || project.property_address || '',
          county: input.county || project.county || '',
          parcelId: input.parcelId || project.parcel_id || '',
          ownerName: input.ownerName || projectOwnerName(project) || '',
        });
        setShouldAutoStartPipeline(true);
        setHoldOnResearchStage(true);
        setPipelineHasStarted(false);

        showToast(
          input.trigger === 'rerun_edited'
            ? 'Starting an edited re-run — previous documents kept.'
            : 'Starting a fresh run with the same settings — previous documents kept.',
          'success',
        );
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to reset' }));
        showToast(err.error || 'Failed to reset project. Please try again.', 'error');
      }
    } catch {
      showToast('Unable to connect. Check your internet connection and try again.', 'error');
    }
  }

  // ── R1: Start AI analysis from the always-visible action bar ──────────────
  // Mirrors Stage 1's "Initiate Research & Analysis": seed the search params
  // from the saved project, flag auto-start, and move to the research stage so
  // ResearchRunPanel fires the pipeline on mount. The user never has to hunt
  // for the run control by workflow stage.
  function handleStartAnalysis() {
    if (!project) return;
    setPendingSearchParams({
      address: project.property_address || '',
      county: project.county || '',
      parcelId: project.parcel_id || '',
      ownerName: projectOwnerName(project) || '',
    });
    setShouldAutoStartPipeline(true);
    setHoldOnResearchStage(true);
    setPipelineHasStarted(false);
    setViewStage(null);
    handleStatusUpdate('configure');
  }

  // ── R4: One-click results export from the Review stage ───────────────────
  // Downloads the extracted data points (the core analysis output) as JSON or a
  // flat CSV, so the user can export data without hopping to a subpage. Drawing
  // / PDF export stays in Job Prep; this consolidates the *data* export here.
  const [exportingData, setExportingData] = useState(false);
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function handleExportResultsData(format: 'json' | 'csv') {
    if (!project || exportingData) return;
    setExportingData(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/data-points`);
      if (!res.ok) { showToast('Failed to load data for export', 'error'); setExportingData(false); return; }
      const data = await res.json();
      const points: Array<Record<string, unknown>> = data.data_points || [];
      const slug = (project.name || 'research').replace(/[^\w.-]+/g, '_').slice(0, 60);
      if (format === 'json') {
        const payload = {
          project: { id: projectId, name: project.name, property_address: project.property_address, county: project.county, state: project.state },
          exported_at: new Date().toISOString(),
          data_point_count: points.length,
          data_points: points,
        };
        downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${slug}-data.json`);
      } else {
        const cols = ['data_category', 'display_value', 'raw_value', 'unit', 'source_page', 'extraction_confidence', 'source_text_excerpt'];
        const esc = (v: unknown) => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const rows = [cols.join(',')];
        for (const p of points) rows.push(cols.map(c => esc(p[c])).join(','));
        downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv' }), `${slug}-data.csv`);
      }
      showToast(`Exported ${points.length} data point${points.length === 1 ? '' : 's'} as ${format.toUpperCase()}`, 'success');
    } catch {
      showToast('Export failed. Please try again.', 'error');
    }
    setExportingData(false);
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
    const ok = await confirmDialog({
      title: `Archive "${drawingName}"?`,
      body: 'It will be hidden from the list but can be recovered.',
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
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
    const ok = await confirmDialog({
      title: `Permanently delete "${drawingName}"?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
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

  // ── Annotation undo/redo ────────────────────────────────────────────────────────────────────
  //
  // The RULES live in `_sections/annotation-history.ts` and are tested there. They shipped untested
  // for as long as they were four closures in this file — and they are the kind that look obvious
  // and are not: a new edit must discard the redo stack, the cap must trim the OLDEST entries, and
  // a drag must not commit.
  //
  // The state stays here. Moving it into a hook meant rewriting 83 references in this file with no
  // way to run the result, and the hook would have been dead code until every one of them moved.
  function applyHistory(next: AnnotationHistoryState) {
    setAnnotations(next.annotations);
    setAnnotationHistory(next.past);
    setAnnotationFuture(next.future);
    setHasUnsavedChanges(next.hasUnsavedChanges);
  }

  const historyState = (): AnnotationHistoryState => ({
    annotations, past: annotationHistory, future: annotationFuture, hasUnsavedChanges,
  });

  function handleAnnotationsChange(newAnnotations: UserAnnotation[]) {
    applyHistory(commitAnnotations(historyState(), newAnnotations));
  }

  const handleUndo = useCallback(() => {
    applyHistory(undoAnnotations({
      annotations, past: annotationHistory, future: annotationFuture, hasUnsavedChanges,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationHistory, annotationFuture, annotations, hasUnsavedChanges]);

  const handleRedo = useCallback(() => {
    applyHistory(redoAnnotations({
      annotations, past: annotationHistory, future: annotationFuture, hasUnsavedChanges,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationHistory, annotationFuture, annotations, hasUnsavedChanges]);

  /** Silent update: sets annotations without pushing undo history (used during drag/resize) */
  function handleAnnotationsSilentChange(newAnnotations: UserAnnotation[]) {
    applyHistory(silentAnnotationChange(historyState(), newAnnotations));
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
    // Azimuth is from NORTH, so easting takes sin and northing takes cos — see
    // `_sections/traverse-geometry.ts`, where that convention is stated and tested. It was inline
    // here and untested for as long as it existed.
    const { x: newX, y: newY } = forwardPoint(last, leg.azimuth, leg.distance);
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
    // `needsClosing` holds both guards: at least three vertices — two points are a line, and
    // closing them just retraces the same leg — and no zero-length leg onto an already-closed
    // figure, which would show in the report as a leg of 0.00 feet.
    if (!needsClosing(coordVertices)) return;
    const leg = inverseBearingDistance(coordVertices[0], coordVertices[coordVertices.length - 1]);
    // `formatBearing` is what the CAD side shows. The page used to render its own
    // `N 30° 0' 0" E`; the canonical form is the zero-padded `N 30°00'00" E`, and one product
    // showing a bearing two ways is a defect of its own.
    handleAddLeg({ ...leg, bearing: formatBearing(leg.azimuth) });
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
        // Third copy of the azimuth-to-coordinate maths in this file when it was found. Editing a
        // vertex by bearing and distance now goes through the same tested function as adding a leg.
        const start = geom.start as { x: number; y: number };
        geom.end = forwardPoint(start, updates.azimuth, updates.distance);
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
  async function handleResetOriginal() {
    const ok = await confirmDialog({
      title: 'Discard all changes?',
      body: 'This resets the drawing to its original AI-generated version. All edits and annotations will be lost.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
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
  async function handleResetLastSaved() {
    if (!lastSavedAt) return;
    const ok = await confirmDialog({
      title: 'Revert to last saved version?',
      body: 'Unsaved changes will be lost.',
      confirmLabel: 'Revert',
      tone: 'danger',
    });
    if (!ok) return;
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
          dxf: 'image/vnd.dxf',
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
    const ok = await confirmDialog({
      title: 'Mark this research project as complete?',
      body: 'Once marked complete, the project moves out of the active list.',
      confirmLabel: 'Mark complete',
    });
    if (!ok) return;
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

  // Show skeleton only on the very first load. Once we have a project loaded,
  // never unmount the page — this prevents ResearchRunPanel from losing its
  // timer, logs, and polling state when useSession re-validates on window focus.
  if ((sessionStatus === 'loading' || loading) && !project) {
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

  // ── WHICH STAGE IS ON THE SCREEN (Phase N1) ─────────────────────────────────────────────────
  //
  // `status` is what the pipeline DID. `viewStage` is what you are reading. They were the same
  // value, so the only way to look at an earlier screen was to change the project's status through
  // a destructive revert — and there was no way forward again at all.
  //
  // `holdOnResearchStage` was the one hard-coded special case of exactly this: a boolean that
  // exists to keep somebody on Stage 2 after the DB has moved to `review`. It stays, because it
  // encodes a real transition (the run finished but you have not clicked Continue yet) rather than
  // a navigation choice — and folding it into `viewStage` would make 'finished but not acknowledged'
  // indistinguishable from 'went back for a look'.
  const dbStage = workflowStepToStage(project.status);
  const reached = (holdOnResearchStage && dbStage === 'review') ? 'research' : dbStage;
  const currentStage = resolveViewStage(viewStage, project.status) === reached
    ? reached
    : resolveViewStage(viewStage, project.status);
  const viewingBehind = currentStage !== reached;
  // Count only manually uploaded documents (excludes internet-sourced pipeline imports)
  const uploadedDocumentCount = documents.filter(d => d.source_type === 'user_upload').length;

  return (
    <div className="research-page">
      {/* Back link */}
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => router.push('/admin/research')}
          style={{ background: 'none', border: 'none', color: 'var(--theme-accent, #2563EB)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
        >
          &larr; All Research Projects
        </button>
      </div>

      {/* Project nav lives in [projectId]/layout.tsx so every
          sub-route inherits it. The hub no longer renders the
          duplicate markup. */}

      {/* Header */}
      <ProjectHeader
        project={project}
        linkedJob={linkedJob}
        onEdit={openEditProject}
        onArchive={handleArchiveProject}
      />

      {/* 4-Stage Pipeline Stepper. Clicking a stage OPENS it — that writes nothing. Reverting is
          the separate "Restart from here" link underneath, because it can delete data (N1). */}
      <PipelineStepper
        currentStatus={project.status}
        viewStage={currentStage}
        onViewStage={setViewStage}
        onStageClick={project.status !== 'analyzing' ? handleRevertToStep : undefined}
      />

      {/* ── LOOKING BACK IS A STATE WORTH SAYING (N1) ────────────────────────────────────────────
          Without this, a project that has finished analysing looks — to somebody who opened Stage 1
          an hour ago — exactly like a project that never ran. The way back is one click and it is
          on the screen, not in the stepper somebody has already scrolled past. */}
      {viewingBehind && (
        <div className="research-stage-banner" role="status">
          <span>
            You are looking at <strong>{stageLabel(currentStage)}</strong>. This project has reached{' '}
            <strong>{stageLabel(reached)}</strong>.
          </span>
          <button
            type="button"
            className="research-stage-banner__btn"
            onClick={() => setViewStage(null)}
          >
            Back to {stageLabel(reached)}
          </button>
        </div>
      )}

      {/* ── NOTES, FROM EVERY STAGE (Phase N2) ──────────────────────────────────────────────────
          `analysis_metadata.job_notes` already existed and rendered in exactly one place: Stage 4
          → Job Prep → the Final Document sub-tab. So the notes you take WHILE READING THE RESULTS
          — which is when a surveyor takes them — had nowhere to go until the last stage.

          Collapsed by default so it does not compete with the run control, and it says how many
          words it is holding when closed: a collapsed panel that gives no sign it contains
          anything is a panel nobody opens twice. */}
      <ProjectNotes
        projectId={projectId}
        value={jobNotes}
        onChange={setJobNotes}
        heading="Notes for this project"
        startCollapsed
        rows={7}
      />

      {/* R1 — Always-visible primary action: start or re-run the AI pipeline.
          Label + behavior derive from project.status so the run control is never
          buried by workflow stage. */}
      {(() => {
        const isAnalyzing = project.status === 'analyzing' || currentStage === 'research';
        const postAnalysis = ['review', 'drawing', 'verifying', 'complete'].includes(project.status);
        // ── IS THERE ENOUGH HERE TO FIND ONE PARCEL? ──────────────────────────────────────────
        //
        // This was `Boolean(project.property_address || project.parcel_id) || documents.length > 0`,
        // so ANY non-empty address string enabled the button. "CEDAR CREEK" enabled it. A road name
        // with no number runs for miles past dozens of parcels, and a run started on one either
        // finds nothing after twenty-five minutes and real money, or — the outcome that actually
        // matters — finds a confident answer about the wrong property.
        //
        // The API calls the SAME function, so the button can never offer a run the server refuses.
        const readiness = assessRunReadiness({
          county: project.county,
          state: project.state,
          parcelId: project.parcel_id,
          instrumentNumber: (project as { instrument_number?: string | null }).instrument_number,
          streetNumber: (project as { street_number?: string | null }).street_number,
          streetName: (project as { street_name?: string | null }).street_name || project.property_address,
          city: (project as { city?: string | null }).city,
          zip: (project as { zip?: string | null }).zip,
          ownerName: (project.analysis_metadata as { owner_name?: string | null } | null)?.owner_name,
          documentCount: documents.length,
        });
        const hasInputs = readiness.canRun;

        // ── SCOPE, ON THE BUTTON (Phase S3) ─────────────────────────────────────────────────────
        //
        // The API refuses an out-of-scope run with a 422, and that is the guard. This is the other
        // half: a button that starts a run it already knows will be refused is worse than a
        // disabled one, because the operator learns the answer after the wait rather than before
        // the click.
        //
        // Same verdict, same module, both sides — so the two can never disagree. `canRun` is what
        // gates the button; the notice explains it, including the `degraded` case where the answer
        // is yes and it costs money.
        const scope = checkScope(project.state, project.county);

        if (isAnalyzing) {
          // ── THE FIFTH OPINION (plan D1) ────────────────────────────────────────────────────
          //
          // This said "AI analysis is running — live progress is shown below." and the condition
          // behind it is:
          //
          //     project.status === 'analyzing' || currentStage === 'research'
          //
          // which is a fact about the WORKFLOW STAGE rendered as a claim about a RUN. Being on
          // the Research & Analysis step is not the same as a run being in progress, and the two
          // come apart constantly: a finished run, a cancelled one, a project that has never been
          // started at all. Browser QA on 2026-09-01 caught it doing exactly that — this bar
          // claimed a run was live, with a spinner, directly above a run view correctly reading
          // "No run has started yet."
          //
          // The page does not know the run state and should not pretend to. `ResearchRunView`
          // does, from `useRunState`, and it is four inches below this line. So this bar now says
          // where you are and defers to it — no spinner, and no claim about activity.
          return (
            <div className="research-action-bar" data-testid="research-action-bar">
              <Microscope size={16} className="research-action-bar__ok" aria-hidden="true" />
              <span className="research-action-bar__text">
                Research &amp; Analysis. The run&apos;s current status is shown below.
              </span>
            </div>
          );
        }
        if (postAnalysis) {
          return (
            <div className="research-action-bar" data-testid="research-action-bar">
              <span className="research-action-bar__text">
                <CheckCircle2 size={16} className="research-action-bar__ok" aria-hidden="true" />
                Analysis complete. Re-run STARR RECON to refresh with new documents or parameters.
              </span>
              <ScopeNotice scope={scope} id="scope-rerun" />
              <button
                className="research-action-bar__btn"
                disabled={!scope.canRun}
                aria-describedby={scopeDescribedBy(scope, 'scope-rerun')}
                title={scope.canRun ? 'Re-run the AI research pipeline' : scope.message}
                onClick={() => setShowRerunConfirm(true)}
              >
                <Sparkles size={16} aria-hidden="true" /> Re-run analysis
              </button>
            </div>
          );
        }
        // upload / configure → start
        return (
          <div className="research-action-bar" data-testid="research-action-bar">
            {/* ── WHAT YOU GAVE, AND WHAT IS STILL MISSING ────────────────────────────────────
                The old copy said "Add a property address (or parcel id), or upload a document" —
                the same sentence whatever you had already entered, so somebody who HAD typed an
                address and still could not start had no way to learn why. The readiness check names
                what was supplied and lists, in order, what would make the run possible. */}
            <span className="research-action-bar__text">
              {readiness.canRun
                ? <>Ready to analyze. STARR RECON will search public records, capture sources, and extract data with AI.</>
                : <><strong>{readiness.headline}</strong></>}
            </span>

            {!readiness.canRun && (
              <div className="research-readiness" role="status">
                <p className="research-readiness__have">
                  <span className="research-readiness__label">You have supplied</span>
                  {" "}{readiness.have.join(", ")}.
                </p>
                <p className="research-readiness__label">Any one of these would let the run start</p>
                <ul className="research-readiness__list">
                  {readiness.whatWouldWork.map(w => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Said even when the run CAN go ahead. "Ready" and "exact" are different claims, and an
                operator about to spend twenty-five minutes deserves to know which one this is. */}
            {readiness.canRun && readiness.caution && (
              <p className="research-readiness__caution" role="status">{readiness.caution}</p>
            )}
            <ScopeNotice scope={scope} id="scope-start" />
            <button
              className="research-action-bar__btn"
              disabled={!hasInputs || !scope.canRun}
              aria-describedby={scopeDescribedBy(scope, 'scope-start')}
              title={
                !scope.canRun ? scope.message
                  : readiness.canRun ? 'Start the AI research pipeline'
                  : describeRunReadiness(readiness)
              }
              onClick={handleStartAnalysis}
            >
              <Sparkles size={16} aria-hidden="true" /> Start AI analysis
            </button>
          </div>
        );
      })()}

      {/* ── The editable re-run (plan C4) ─────────────────────────────────────────────────
          What stood here was a two-button confirm: "Re-run with Same Parameters" started
          immediately, and "Update Parameters First" opened nothing — it sent the operator back
          to the Property Information stage to edit the PROJECT and walk forward again. So there
          was no way to change a setting for one attempt, and no way at all to change the one the
          owner named by name: whether the run may use TexasFile.

          Its warning was also wrong in the direction that loses work — "All data from the
          previous run will be permanently deleted, including pipeline-fetched documents". That
          was an accurate description of the code, and the code was doing the opposite of what
          was asked for. Re-runs supersede now, and the dialog says so. */}
      {showRerunConfirm && project && (
        <RerunDialog
          projectId={projectId}
          projectDefaults={{
            address: project.property_address || '',
            county: project.county || '',
            parcelId: project.parcel_id || '',
            ownerName: projectOwnerName(project) || '',
            allowPaidDocuments:
              (project as unknown as { allow_paid_documents?: boolean })
                .allow_paid_documents !== false,
          }}
          onCancel={() => setShowRerunConfirm(false)}
          onConfirm={(input) => void handleRerunResearch(input)}
        />
      )}

      {/* Quick stats — actionable buttons (Slice C4). Each tile is
          a proper button so keyboard users get focus + Enter to
          activate, and screen readers announce the destination.
          The Documents tile pushes the sub-route; the rest jump
          to the review summary panel + open the matching tab. */}
      <ProjectStats
        stats={stats}
        onOpenDocuments={() => router.push(`/admin/research/${projectId}/documents`)}
        onScrollToReview={scrollToReview}
      />

      {/* ════════════════════════════════════════════════════════════════
          STAGE 1: UPLOAD & PROVISION
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'upload' && (
        <UploadStagePanel
          projectId={projectId}
          documents={documents}
          address={project.property_address || ''}
          county={project.county || ''}
          parcelId={project.parcel_id || ''}
          ownerName={projectOwnerName(project) || ''}
          onDocumentsChanged={() => { loadDocuments(); loadProject(); }}
          onNavigateAway={(params) => {
            setPendingSearchParams(params);
            setShouldAutoStartPipeline(true);
            handleStatusUpdate('configure');
          }}
          allowPaidDocuments={
            (project as unknown as { allow_paid_documents?: boolean }).allow_paid_documents !== false
          }
        />
      )}

      {/* ════════════════════════════════════════════════════════════════
          STAGE 2: RESEARCH & ANALYSIS
          Shows only: (1) progress indicator and (2) raw log viewer.
          No address form, no document pills, no result card.
          "Continue to Review" button appears on completion.
          ════════════════════════════════════════════════════════════ */}
      {currentStage === 'research' && (
        <ResearchStagePanel
          projectId={projectId}
          address={pendingSearchParams?.address ?? project.property_address ?? ''}
          county={pendingSearchParams?.county ?? project.county ?? ''}
          parcelId={pendingSearchParams?.parcelId ?? project.parcel_id ?? ''}
          ownerName={pendingSearchParams?.ownerName ?? projectOwnerName(project) ?? ''}
          autoStart={shouldAutoStartPipeline}
          pendingRunInput={pendingRunInput}
          onRerun={() => setShowRerunConfirm(true)}
          onPipelineStart={() => {
            setPipelineHasStarted(true);
            setHoldOnResearchStage(true);
          }}
          onPipelineComplete={() => {
            setShouldAutoStartPipeline(false);
            loadDocuments();
            loadProject();
          }}
          onBack={() => {
            setPipelineHasStarted(false);
            handleRevertToStep('upload');
          }}
          onContinueToReview={() => {
            setHoldOnResearchStage(false);
            loadDocuments();
            loadProject();
            handleStatusUpdate('review');
            // The worker persists artifacts asynchronously after reporting completion, so
            // documents may still be writing to the DB. Retry after short delays to catch
            // late arrivals.
            setTimeout(() => loadDocuments(), 3000);
            setTimeout(() => loadDocuments(), 8000);
          }}
        />
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
            <span className="research-step-header__icon"><ClipboardList size={18} strokeWidth={1.75} /></span>
            <div className="research-step-header__body">
              <h2 className="research-step-header__title">Review Results</h2>
              <p className="research-step-header__desc">
                Review the complete research summary, extracted data, discrepancies, source documents, and logs.
              </p>
            </div>
          </div>

          {/* ── Navigation ── */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="research-back-btn" style={{ margin: 0 }} onClick={() => handleRevertToStep('configure')}>
              ← Back to Research &amp; Analysis
            </button>
            <button
              className="research-page__new-btn"
              onClick={() => handleStatusUpdate('drawing')}
            >
              Continue to Job Prep →
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowRerunConfirm(true)}
              style={{
                background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6,
                padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Re-run Research
            </button>
          </div>

          {/* R4 — One place to export results: data (JSON/CSV), printable PDF,
              and a path to the drawing/CAD export in Job Prep. */}
          <div className="research-export-bar" data-testid="research-export-bar">
            <span className="research-export-bar__label">Export results:</span>
            <button
              className="research-export-bar__btn"
              onClick={() => handleExportResultsData('csv')}
              disabled={exportingData || stats.data_point_count === 0}
              title={stats.data_point_count === 0 ? 'No extracted data yet' : 'Download extracted data as CSV'}
            >
              <FileText size={14} aria-hidden="true" /> Data (CSV)
            </button>
            <button
              className="research-export-bar__btn"
              onClick={() => handleExportResultsData('json')}
              disabled={exportingData || stats.data_point_count === 0}
              title={stats.data_point_count === 0 ? 'No extracted data yet' : 'Download extracted data as JSON'}
            >
              <FileText size={14} aria-hidden="true" /> Data (JSON)
            </button>
            <button
              className="research-export-bar__btn"
              onClick={() => window.print()}
              title="Print or save the results as a PDF"
            >
              <Printer size={14} aria-hidden="true" /> Print / PDF
            </button>
            <button
              className="research-export-bar__btn research-export-bar__btn--primary"
              onClick={() => handleStatusUpdate('drawing')}
              title="Generate and export the survey drawing / CAD"
            >
              <DraftingCompass size={14} aria-hidden="true" /> Drawing &amp; CAD →
            </button>
          </div>

          {/* Re-run confirmation dialog now lives at the top level (R1) so it
              works from both this button and the always-visible action bar. */}

          {/* ══════════════════════════════════════════════════════════
              SECTION 1 — Summary Panel with Tabs
              ══════════════════════════════════════════════════════ */}
          <div className="review-summary-panel" ref={reviewPanelRef}>
            {/* Tab bar */}
            <div className="review-summary-panel__tabs">
              {(['summary', 'property', 'survey', 'easements', 'neighbours', 'discrepancies', 'artifacts', 'packet'] as const).map(tab => (
                <button
                  key={tab}
                  className={`review-summary-panel__tab${reviewTab === tab ? ' review-summary-panel__tab--active' : ''}`}
                  onClick={() => setReviewTab(tab as typeof reviewTab)}
                >
                  {tab === 'summary'       && <><BarChart3 size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Summary</>}
                  {tab === 'property'      && <><Home size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Property Info</>}
                  {tab === 'survey'        && <><DraftingCompass size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Survey Data</>}
                  {tab === 'easements'     && <><Route size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Easements</>}
                  {tab === 'discrepancies' && (
                    <>Discrepancies{stats.discrepancy_count > 0 && <span className="review-summary-panel__tab-badge">{stats.discrepancy_count}</span>}</>
                  )}
                  {tab === 'artifacts'     && <><Camera size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Artifacts</>}
                  {tab === 'neighbours'    && <><MapPin size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Neighbours</>}
                  {tab === 'packet'        && <><PackageCheck size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Packet</>}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="review-summary-panel__body">

              {/* ── Tab: Packet ──
                  R25 built the packet and R26 put it on the job, but nothing let anybody CHOOSE
                  what goes in one — so the whole deliverable path was unreachable in practice. */}
              {reviewTab === 'packet' && <PacketBuilderPanel projectId={projectId} />}

              {/* ── Tab: Neighbours ──
                  The adjoiners the run identified, ranked by what is on file for them, with the
                  opt-in path to researching one properly (plan R31–R33). */}
              {reviewTab === 'neighbours' && <AdjoinersPanel projectId={projectId} />}

              {/* ── Tab: Summary ── */}
              {reviewTab === 'summary' && (() => {
                // B1a — 26 keys of cast moved to `_sections/summary-review-data.ts`, where
                // `review-reads-what-the-worker-writes` holds them against the producer.
                const {
                  finalSummary, ownerName, propertyId, situsAddress, acreage, legalDesc,
                  docCount, dpCount, discCount, durationMs, callCount, monumentCount,
                  confidenceTier, confidenceScore, fema, txdot, screenshotCount,
                  errorCount, fatalErrors, hasDocCount,
                } = summaryReviewData(project, stats);
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
                      {/* `docCount > 0` hid the row entirely, so a run that retrieved NOTHING
                          showed no Documents stat — identical to one where it was never
                          reported. This is the screen somebody signs off from. */}
                      {hasDocCount && <div className={`review-stat${docCount === 0 ? ' review-stat--warn' : ''}`}><span className="review-stat__label">Documents</span><span className="review-stat__value">{docCount === 0 ? 'none retrieved' : docCount}</span></div>}
                      {dpCount > 0 && <div className="review-stat"><span className="review-stat__label">Data Points</span><span className="review-stat__value">{dpCount}</span></div>}
                      {discCount > 0 && <div className="review-stat review-stat--warn"><span className="review-stat__label">Discrepancies</span><span className="review-stat__value">{discCount}</span></div>}
                      {/* Was `#f87171` / `#4ade80` inline — 2.77:1 and 1.74:1 on white. A flood
                          zone is a material fact for a survey and it was being signalled in two
                          colours a reader may not be able to tell apart, at ratios neither of
                          them could read. The words carry it; the colour reinforces it. */}
                      {fema && <div className={`review-stat${fema.inSFHA ? ' review-stat--warn' : ''}`}><span className="review-stat__label">Flood Zone</span><span className="review-stat__value" style={{ color: fema.inSFHA ? '#B91C1C' : '#047857' }}>{fema.floodZone}{fema.inSFHA ? ' (SFHA)' : ''}</span></div>}
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
                      <div style={{ color: '#4B5563', fontStyle: 'italic', padding: '1rem 0' }}>
                        No summary available. Run the full research pipeline to generate a summary.
                      </div>
                    )}

                    {/* ── Coherence Review (Multi-Pass) ── */}
                    {(() => {
                      // The seventeen-key cast that used to live here is `_sections/coherence-review-data.ts`.
                      // This panel's producer is `lib/research/analysis.service.ts` — the APP-side
                      // pipeline — not the worker, so it is held against the COHERENCE_SYNTHESIS
                      // prompt's declared schema by `coherence-review-contract.test.ts` rather than by
                      // the worker contract test every other panel here uses.
                      const cr = coherenceReviewData(project);
                      if (!cr) return null;

                      const {
                        verdictLabel, verdictColor, score, statement, execSummary, techSummary,
                        passCount, dataQuality: dq, coherenceIssues, pipelineIssues, fieldNotes,
                        missing, boundaryDetail, deedDetail, passComparison,
                        showBoundaryDetail, showDeedDetail,
                      } = cr;

                      return (
                        <div className="coherence-review">
                          <div className="coherence-review__header">
                            <span className="coherence-review__title">
                              Quality & Coherence Review
                              {passCount > 1 && <span className="coherence-review__pass-badge">{passCount}-pass</span>}
                            </span>
                            <span
                              className="coherence-review__verdict"
                              style={{ color: verdictColor }}
                            >
                              {verdictLabel} — {score}/100
                            </span>
                          </div>

                          {statement && (
                            <div className="coherence-review__statement">{statement}</div>
                          )}

                          {/* Executive summary (for project managers) */}
                          {execSummary && (
                            <div className="coherence-review__exec-summary">
                              <div className="coherence-review__exec-summary-label">Executive Summary</div>
                              <div className="coherence-review__exec-summary-text">{execSummary}</div>
                            </div>
                          )}

                          {/* Technical summary (for surveyors) */}
                          {techSummary && (
                            <div className="coherence-review__summary">{techSummary}</div>
                          )}

                          {/* Data quality scores with adjustment info */}
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
                                          background: scoreFillColor(val.score),
                                        }}
                                      />
                                    </div>
                                    <span className="coherence-review__score-label">
                                      {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className="coherence-review__score-value">
                                      {val.score}
                                      {val.pass1_score != null && val.pass1_score !== val.score && (
                                        <span className="coherence-review__score-delta" style={{ color: deltaColor(val.score, val.pass1_score) }}>
                                          {val.score < val.pass1_score ? '\u2193' : '\u2191'}{Math.abs(val.score - val.pass1_score)}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Boundary detail */}
                          {boundaryDetail && showBoundaryDetail && (
                            <div className="coherence-review__detail-box">
                              <div className="coherence-review__detail-box-title">Boundary Traverse</div>
                              {boundaryDetail.traverse_summary && (
                                <div className="coherence-review__detail-text">{boundaryDetail.traverse_summary}</div>
                              )}
                              <div className="coherence-review__detail-stats">
                                {boundaryDetail.call_count != null && <span>Calls: {boundaryDetail.call_count}</span>}
                                {boundaryDetail.issues_found != null && <span>Issues: {boundaryDetail.issues_found}</span>}
                                {boundaryDetail.closure_status && <span>Closure: {boundaryDetail.closure_status}</span>}
                              </div>
                              {boundaryDetail.critical_calls && boundaryDetail.critical_calls.length > 0 && (
                                <ul className="coherence-review__list">
                                  {boundaryDetail.critical_calls.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                              )}
                            </div>
                          )}

                          {/* Deed chain detail */}
                          {deedDetail && showDeedDetail && (
                            <div className="coherence-review__detail-box">
                              <div className="coherence-review__detail-box-title">
                                Deed Chain
                                {deedDetail.complete != null && (
                                  <span style={{ marginLeft: 8, color: deedCompleteColor(deedDetail.complete), fontWeight: 600, fontSize: '0.75rem' }}>
                                    {deedDetail.complete ? 'Complete' : 'Incomplete'}
                                  </span>
                                )}
                              </div>
                              {deedDetail.chain_summary && (
                                <div className="coherence-review__detail-text">{deedDetail.chain_summary}</div>
                              )}
                              <div className="coherence-review__detail-stats">
                                {deedDetail.deeds_found != null && <span>Deeds: {deedDetail.deeds_found}</span>}
                                {deedDetail.breaks != null && deedDetail.breaks > 0 && <span style={{ color: DEED_BREAKS_COLOR }}>Breaks: {deedDetail.breaks}</span>}
                              </div>
                              {deedDetail.missing_instruments && deedDetail.missing_instruments.length > 0 && (
                                <div style={{ marginTop: '0.4rem' }}>
                                  <div style={{ fontSize: '0.72rem', color: MISSING_INSTRUMENTS_COLOR, fontWeight: 600 }}>Missing instruments:</div>
                                  <ul className="coherence-review__list coherence-review__list--missing">
                                    {deedDetail.missing_instruments.map((inst, i) => <li key={i}>{inst}</li>)}
                                  </ul>
                                </div>
                              )}
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
                                      {issue.severity === 'critical' ? '\uD83D\uDD34' : issue.severity === 'warning' ? '\uD83D\uDFE1' : '\uD83D\uDD35'}
                                    </span>
                                    <span className="coherence-review__issue-title">{issue.title}</span>
                                    {issue.found_in && (
                                      <span className="coherence-review__issue-pass">
                                        {issue.found_in === 'both' ? 'P1+P2' : issue.found_in === 'pass2' ? 'P2' : 'P1'}
                                      </span>
                                    )}
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
                                      {issue.severity === 'critical' ? '\uD83D\uDD34' : issue.severity === 'warning' ? '\uD83D\uDFE1' : '\uD83D\uDD35'}
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

                          {/* Pass comparison (debug info) */}
                          {passComparison && (
                            <div className="coherence-review__pass-comparison">
                              <span>Pass 1 confirmed: {passComparison.pass1_issues_confirmed ?? 0}</span>
                              <span>Pass 2 new: {passComparison.pass2_new_issues ?? 0}</span>
                              <span>False alarms: {passComparison.pass1_false_alarms ?? 0}</span>
                              <span>Total: {passComparison.total_issues ?? 0}</span>
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
                // B1a — the field precedence moved to `_sections/property-review-fields.ts`,
                // where it can be asserted rather than read. Every field here has a fallback,
                // and which side wins is the only thing in this block a surveyor would notice
                // being wrong.
                const fields = propertyReviewFields(
                  project as unknown as ProjectLike,
                  projectOwnerName(project),
                );
                return (
                  <div className="review-tab-content">
                    {fields.length === 0 ? (
                      // Was an inline `color: '#4B5563'` — 2.56:1 on white, and invisible to the
                      // F2 stylesheet sweep because no stylesheet contains it.
                      <div className="review-property-empty">
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
                // B1a — the 25-line cast this used to open with moved to
                // `_sections/survey-review-data.ts`. It reads 29 keys across four nested
                // structures, all hand-written on both sides; a cast is a claim, not a check,
                // and `review-reads-what-the-worker-writes` is what turns it into one.
                const {
                  boundary, chainOfTitle, platAnalyses, crossValidation, deedSummary,
                  platSummary, hasBoundary, hasChain, hasPlats,
                } = surveyReviewData(project.analysis_metadata);

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
                        <div className="review-narrative__label">Boundary Bearings &amp; Distances ({boundary?.bearingsAndDistances?.length ?? 0} calls)</div>
                        <div className="admin-table-wrap"><table className="review-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginTop: '0.5rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #1e40af' }}>
                              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#1e3a8a', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase' as const }}>#</th>
                              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#1e3a8a', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase' as const }}>Bearing / Distance Call</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(boundary?.bearingsAndDistances ?? []).map((call, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #dbeafe', background: i % 2 === 0 ? '#f0f7ff' : '#ffffff' }}>
                                <td style={{ padding: '0.4rem 0.6rem', color: '#1e40af', fontWeight: 700, width: '2.5rem' }}>{i + 1}</td>
                                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--theme-fg-primary, #111827)', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.02em' }}>{call}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--theme-fg-secondary, #6b7280)', fontStyle: 'italic', padding: '0.5rem 0' }}>
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

                    {/* Chain of Title.

                        G15 — every value cell here was `color: '#e2e8f0'`, and `.review-table` is
                        defined in no stylesheet, so the table sat straight on `.review-summary-panel`
                        at `#fff`. 1.23:1: the date, grantor, grantee and instrument number of every
                        link have been rendering white on white. The colours are in the sheet now. */}
                    {hasChain && (
                      <div className="review-data-section">
                        <div className="review-narrative__label">Chain of Title ({chainOfTitle.length} links)</div>
                        <div className="admin-table-wrap"><table className="review-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Date</th>
                              <th>From</th>
                              <th>To</th>
                              <th>Instrument</th>
                              <th>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chainOfTitle.map((link, i) => (
                              <tr key={i}>
                                <td className="review-table__muted">{link.order}</td>
                                <td>{link.date || '—'}</td>
                                <td>{link.from}</td>
                                <td>{link.to}</td>
                                <td className="review-table__mono">{link.instrumentNumber || '—'}</td>
                                <td className="review-table__muted">{link.type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>
                      </div>
                    )}

                    {/* Per-Plat AI Analysis Details.

                        The other half of the same mistake, in the other direction: a real dark
                        `#0f172a` card carrying light-theme greys — the AI narrative at 2.36:1 and
                        the adjacent-plat references at 3.75:1. Re-themed light, like the rest. */}
                    {hasPlats && (
                      <div className="review-data-section">
                        <div className="review-narrative__label">Plat Analysis Details</div>
                        {platAnalyses.map((plat, pi) => (
                          <div key={pi} className="review-plat-card">
                            <div className="review-plat-card__title">
                              {plat.name}{plat.instrumentNumber ? ` (Inst# ${plat.instrumentNumber})` : ''}{plat.date ? ` — ${plat.date}` : ''}
                            </div>
                            {plat.narrative && <div className="review-plat-card__narrative">{plat.narrative}</div>}
                            {plat.adjacentReferences.length > 0 && (
                              <div className="review-plat-card__adjacent">
                                Adjacent: {plat.adjacentReferences.join('; ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback: DataPointsPanel for any extracted data points */}
                    <div className="review-data-points">
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
              {/* The encumbrance rollup, above the existing easement summary (plan R34). It pulls
                  in encumbrances recorded against a NEIGHBOUR, which never appeared here before —
                  an easement is usually recorded against only one of the two tracts it crosses. */}
              {reviewTab === 'easements' && <EncumbrancePanel projectId={projectId} />}

              {reviewTab === 'easements' && (() => {
                // B1a — the 20-line cast this used to open with moved to
                // `_sections/easements-review-data.ts`, the last one on the Review tab. It reads
                // 27 keys across four nested structures, and `hasData` counted four of the six
                // sources it renders — so a run that read the plats and found nothing at the
                // courthouse printed "No easement or encumbrance data found" UNDERNEATH the
                // right-of-way widths it had just listed.
                //
                // The dark `#0f172a` cards went with it. Four of this tab's five text colours
                // failed AA against its own background — including the description of every
                // recorded easement at 2.36:1 and "YES — flood insurance required" at 2.76:1 —
                // and neither contrast sweep could see them, because the colour and the
                // background it sat on were declared on different elements. See G15.
                const {
                  summary, fema, txdot, easements, covenants, rowWidths, platEasements, hasData,
                } = easementsReviewData(project.analysis_metadata);

                return (
                  <div className="review-tab-content">
                    {summary && (
                      <div className="review-narrative" style={{ marginBottom: '1rem' }}>
                        <div className="review-narrative__label">Easements &amp; Encumbrances Summary</div>
                        <div className="review-narrative__text">{summary}</div>
                      </div>
                    )}

                    {/* FEMA Flood Zone */}
                    <div className="review-encumbrance-box">
                      <div className="review-encumbrance-box__title">FEMA Flood Zone</div>
                      {fema ? (
                        <div className="review-encumbrance-grid">
                          <div>
                            <div className="review-encumbrance-field__label">Zone</div>
                            <div className={`review-encumbrance-field__value review-encumbrance-field__value--${fema.inSFHA ? 'flag-on' : 'flag-off'}`}>{fema.floodZone}</div>
                          </div>
                          {fema.zoneSubtype && (
                            <div>
                              <div className="review-encumbrance-field__label">Subtype</div>
                              <div className="review-encumbrance-field__value">{fema.zoneSubtype}</div>
                            </div>
                          )}
                          <div>
                            <div className="review-encumbrance-field__label">In SFHA?</div>
                            <div className={`review-encumbrance-field__value review-encumbrance-field__value--${fema.inSFHA ? 'flag-on' : 'flag-off'}`}>
                              {fema.inSFHA ? 'YES — flood insurance required' : 'No'}
                            </div>
                          </div>
                          {fema.firmPanel && (
                            <div>
                              <div className="review-encumbrance-field__label">FIRM Panel</div>
                              <div className="review-encumbrance-field__value">{fema.firmPanel}</div>
                            </div>
                          )}
                          {fema.effectiveDate && (
                            <div>
                              <div className="review-encumbrance-field__label">Effective Date</div>
                              <div className="review-encumbrance-field__value">{fema.effectiveDate}</div>
                            </div>
                          )}
                          {fema.sourceUrl && (
                            <div>
                              <div className="review-encumbrance-field__label">Source</div>
                              <a href={fema.sourceUrl} target="_blank" rel="noopener noreferrer" className="review-encumbrance-link">FEMA MSC</a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="review-encumbrance-empty">No FEMA flood zone data available. Requires valid coordinates from geocoding.</div>
                      )}
                    </div>

                    {/* TxDOT Right-of-Way */}
                    <div className="review-encumbrance-box">
                      <div className="review-encumbrance-box__title">TxDOT Right-of-Way</div>
                      {txdot ? (
                        <div className="review-encumbrance-grid">
                          {txdot.highwayName && (
                            <div>
                              <div className="review-encumbrance-field__label">Highway</div>
                              <div className="review-encumbrance-field__value review-encumbrance-field__value--strong">{txdot.highwayName}</div>
                            </div>
                          )}
                          <div>
                            <div className="review-encumbrance-field__label">ROW Width</div>
                            <div className={`review-encumbrance-field__value${txdot.rowWidth ? ' review-encumbrance-field__value--strong' : ' review-encumbrance-field__value--unknown'}`}>
                              {txdot.rowWidth ? `${txdot.rowWidth} ft` : 'Unknown'}
                            </div>
                          </div>
                          {txdot.highwayClass && (
                            <div>
                              <div className="review-encumbrance-field__label">Classification</div>
                              <div className="review-encumbrance-field__value">{txdot.highwayClass}</div>
                            </div>
                          )}
                          {txdot.csjNumber && (
                            <div>
                              <div className="review-encumbrance-field__label">CSJ Number</div>
                              <div className="review-encumbrance-field__value">{txdot.csjNumber}</div>
                            </div>
                          )}
                          {txdot.district && (
                            <div>
                              <div className="review-encumbrance-field__label">District</div>
                              <div className="review-encumbrance-field__value">{txdot.district}</div>
                            </div>
                          )}
                          {txdot.acquisitionDate && (
                            <div>
                              <div className="review-encumbrance-field__label">Acquisition Date</div>
                              <div className="review-encumbrance-field__value">{txdot.acquisitionDate}</div>
                            </div>
                          )}
                          {txdot.sourceUrl && (
                            <div>
                              <div className="review-encumbrance-field__label">Source</div>
                              <a href={txdot.sourceUrl} target="_blank" rel="noopener noreferrer" className="review-encumbrance-link">TxDOT GIS</a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="review-encumbrance-empty">No TxDOT ROW data available. Requires valid coordinates from geocoding.</div>
                      )}
                    </div>

                    {/* ROW Widths from Plats */}
                    {rowWidths.length > 0 && (
                      <div className="review-encumbrance-box">
                        <div className="review-encumbrance-box__title">Right-of-Way Widths (from Plats)</div>
                        <ul className="review-encumbrance-list">
                          {rowWidths.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Easements from Plats */}
                    {platEasements.length > 0 && (
                      <div className="review-encumbrance-box">
                        <div className="review-encumbrance-box__title">Easements Shown on Plats ({platEasements.length})</div>
                        <ul className="review-encumbrance-list">
                          {platEasements.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recorded Easements from Clerk */}
                    {easements.length > 0 && (
                      <div className="review-encumbrance-section">
                        <div className="review-narrative__label">Recorded Easements ({easements.length})</div>
                        {easements.map((e, i) => (
                          <div key={i} className="review-encumbrance-item">
                            <div className="review-encumbrance-item__title">{e.type}{e.instrumentNumber ? ` — Inst# ${e.instrumentNumber}` : ''}</div>
                            <div className="review-encumbrance-item__desc">{e.description}</div>
                            {e.width && <div className="review-encumbrance-item__meta">Width: {e.width}</div>}
                            {e.location && <div className="review-encumbrance-item__meta">Location: {e.location}</div>}
                            {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="review-encumbrance-link">View Source</a>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Restrictive Covenants */}
                    {covenants.length > 0 && (
                      <div className="review-encumbrance-section">
                        <div className="review-narrative__label">Restrictive Covenants ({covenants.length})</div>
                        <ul className="review-encumbrance-list">
                          {covenants.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!hasData && (
                      <div className="review-encumbrance-empty" style={{ padding: '1rem 0' }}>
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
                <>
                  <GisQualityCard report={gisQualityOf(project)} />
                  <ArtifactGallery projectId={projectId} />
                </>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION 2 — Raw Log Viewer (always visible)
              ══════════════════════════════════════════════════════ */}
          <div className="review-log-section">
            <div className="review-log-section__header">
              <span className="review-log-section__title"><Search size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Research Logs</span>
              <PipelineProgressStyles />
            </div>
            {/* ── AN OPERATOR SIGNED OFF A FAILED RUN FROM A GREEN TICK ────────────────────
                This passed the LITERAL string "success". Every project, forever, regardless of
                what its run did — so the review page's log viewer showed "✓ Research complete"
                above the logs of a run that had crashed, and the person reading them was being
                told the opposite of what the logs said.

                The page could not have known better: the outcome was the one thing the worker did
                not persist into analysis_metadata.result. It does now. Where it is absent — every
                project that ran before this change — the panel is given "archived", which claims
                nothing and titles itself "Run log". A page that does not know a run's outcome must
                say so rather than pick the cheerful option. */}
            <PipelineProgressPanel
              status={(() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const r = meta?.result as Record<string, unknown> | null;
                const stored = typeof r?.status === 'string' ? r.status : null;
                return stored ?? 'archived';
              })()}
              failureReason={(() => {
                const meta = project.analysis_metadata as Record<string, unknown> | null;
                const r = meta?.result as Record<string, unknown> | null;
                // The stop reason first: "reached the ceiling you set" is a more useful sentence
                // than a generic failure line, and it is the one the 2026-09-03 run needed.
                const stop = typeof r?.stopReason === 'string' ? r.stopReason : null;
                const fail = typeof r?.failureReason === 'string' ? r.failureReason : null;
                return stop ?? fail ?? undefined;
              })()}
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
            const docTypeIcons: Record<string, LucideIcon> = {
              deed: ScrollText, plat: MapIcon, survey: DraftingCompass, legal_description: Scale,
              title_commitment: ClipboardList, easement: Route, restrictive_covenant: FileText,
              field_notes: Notebook, subdivision_plat: MapIcon, metes_and_bounds: Ruler,
              county_record: Landmark, appraisal_record: DollarSign, aerial_photo: Satellite,
              topo_map: Mountain, utility_map: Plug,
              gis_map: MapIcon, flood_map: Waves, property_report: Home, road_map: Route,
              deed_screenshot: ScrollText, plat_screenshot: MapIcon, map_screenshot: MapIcon,
              other: Paperclip,
            };
            const sourceTypeLabels: Record<string, { label: string; icon: LucideIcon }> = {
              property_search:  { label: 'Research — Web Sources', icon: Search },
              user_upload:      { label: 'User Uploaded', icon: Upload },
              linked_reference: { label: 'Linked References', icon: Link2 },
              manual_entry:     { label: 'Manual Entry', icon: Pencil },
            };

            // Separate MISC documents from regular documents
            const isMiscDoc = (doc: typeof documents[0]) => {
              const label = (doc.document_label || '').toLowerCase();
              const path = (doc.storage_url || '').toLowerCase();
              return label.includes('misc screenshot') || label.startsWith('misc:') || path.includes('/screenshots-misc/');
            };
            const regularDocs = documents.filter(doc => !isMiscDoc(doc));
            const miscDocs = documents.filter(doc => isMiscDoc(doc));

            const grouped = regularDocs.reduce<Record<string, typeof documents>>((acc, doc) => {
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
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--theme-fg-secondary, #4B5563)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, marginTop: '1rem' }}>
                  <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "center", color: "var(--text-tertiary, #6B7280)" }}><Inbox size={30} strokeWidth={1.5} /></div>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No documents captured</div>
                  <div style={{ fontSize: '0.85rem' }}>Go back to Research &amp; Analysis to run the pipeline.</div>
                </div>
              );
            }
            return (
              <>
                <div className="review-doc-list">
                  <div className="review-doc-list__header">
                    <span className="review-doc-list__title"><FolderOpen size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Documents &amp; Sources</span>
                    <span className="review-doc-list__count">{regularDocs.length}</span>
                  </div>
                  {sortedKeys.map(sourceKey => {
                    const docs = grouped[sourceKey];
                    const { label, icon: SrcIcon } = sourceTypeLabels[sourceKey] || { label: sourceKey, icon: Paperclip };
                    return (
                      <div key={sourceKey} className="review-doc-group">
                        <div className="review-doc-group__header">
                          <span><SrcIcon size={15} strokeWidth={1.75} /></span>
                          <span className="review-doc-group__label">{label}</span>
                          <span className="review-doc-group__count">{docs.length}</span>
                        </div>
                        {docs.map(doc => {
                          const typeIcon = (doc.document_type ? docTypeIcons[doc.document_type] : null) || Paperclip;
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

                {/* MISC documents are excluded from display — they are error pages,
                   empty results, auth walls, and other non-useful captures */}
                {miscDocs.length > 0 && (
                  <div className="misc-docs-toggle__hint" style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--theme-fg-muted, #9CA3AF)' }}>
                    {miscDocs.length} non-useful screenshot{miscDocs.length !== 1 ? 's' : ''} filtered out (error pages, empty results, etc.)
                  </div>
                )}
              </>
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
            <span className="research-step-header__icon"><HardHat size={18} strokeWidth={1.75} /></span>
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
              <Pencil size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Drawing
            </button>
            <button
              className={`research-jobprep__tab${jobPrepTab === 'fieldplan' ? ' research-jobprep__tab--active' : ''}`}
              onClick={() => setJobPrepTab('fieldplan')}
            >
              <ClipboardList size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Field Plan
            </button>
            <button
              className={`research-jobprep__tab${jobPrepTab === 'finaldoc' ? ' research-jobprep__tab--active' : ''}`}
              onClick={() => setJobPrepTab('finaldoc')}
            >
              <Printer size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Final Document
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
                          {generatingDrawing ? <><Loader2 size={14} className="animate-spin" style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Generating…</> : <><Sparkles size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Generate AI Drawing</>}
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
                    onClick={async () => {
                      if (hasUnsavedChanges) {
                        const ok = await confirmDialog({
                          title: 'Leave without saving?',
                          body: 'You have unsaved changes. They will be discarded.',
                          confirmLabel: 'Leave',
                          tone: 'danger',
                        });
                        if (!ok) return;
                      }
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
                          <div style={{ color: 'var(--theme-fg-secondary, #6B7280)', fontSize: '0.88rem' }}>Loading drawing...</div>
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
                      {isOpeningInCAD ? <><Loader2 size={14} className="animate-spin" style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Opening…</> : <><Pencil size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Open in CAD Editor</>}
                    </button>
                    {/* Verify drawing.

                        `#059669` was 3.77:1 behind white at 0.82rem — not large text, so 4.5:1
                        applies. `#047857` is 5.48:1, and is the hex `AdminResearch.css` had
                        already retired it to. The audit could not see this one: the background is
                        a TERNARY, not a literal, so `inlinePair` recorded "declares a background"
                        and skipped the pair. Widened in the same commit. */}
                    <button
                      style={{ background: isVerifying ? '#6B7280' : '#047857', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: isVerifying ? 'not-allowed' : 'pointer' }}
                      onClick={handleRunVerification}
                      disabled={isVerifying}
                    >
                      {isVerifying ? <><Loader2 size={14} className="animate-spin" style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Verifying…</> : <><CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Run Verification</>}
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
                <span className="research-step-header__icon"><ClipboardList size={18} strokeWidth={1.75} /></span>
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
          <FinalDocumentTab
            project={project}
            projectId={projectId}
            documents={documents}
            stats={stats}
            activeDrawing={activeDrawing}
            comparisonResult={comparisonResult}
            sanitizedDrawingSvg={sanitizedDrawingSvg}
            jobNotes={jobNotes}
            isExporting={isExporting}
            isOpeningInCAD={isOpeningInCAD}
            lastExport={lastExport}
            showUITooltips={showUITooltips}
            onJobNotesChange={setJobNotes}
            onExport={handleExportDrawing}
            onOpenInCAD={handleOpenInCAD}
            onMarkComplete={handleMarkComplete}
            onChangeTab={setJobPrepTab}
          />
          )}
        </div>
      )}
        {/* Source document viewer modal */}
      {viewerDoc && (
        <SourceDocumentViewer
          document={viewerDoc}
          projectId={projectId}
          pagesPdfUrl={viewerPdfUrl}
          highlightText={viewerHighlight}
          onClose={() => { setViewerDoc(null); setViewerHighlight(undefined); setViewerPdfUrl(null); }}
        />
      )}

      {/* ── Edit Project Modal ─────────────────────────────────────────────────────────────────
          The overlay had `onClick={() => setShowEditProject(false)}`: a click anywhere beside the
          modal threw away whatever had been typed, with no confirmation and no undo.

          The owner asked for this to stop on 2026-08-30 — *"clicking off of the modal should not
          close it, we should be required to actually click the exit button"* — and it was fixed on
          the NEW PROJECT modal only. This one kept the behaviour, so the request was half applied
          and the half that survived is the one where the data being lost is edits to a record that
          already exists.

          Escape still closes, and the header's exit button still closes. What is gone is the
          accidental dismissal.

          The `stopPropagation` on the inner modal went with it: it existed solely to stop a click
          INSIDE the form reaching the overlay's close handler. With no handler there, it guards
          nothing — and a stray `stopPropagation` is the kind of line that makes the next person
          wonder what it was protecting. */}
      <EditProjectModal
        open={showEditProject}
        value={editProjectData}
        linkedJob={editProjectData.job_id ? linkedJob : null}
        onChange={setEditProjectData}
        onSubmit={handleSaveProject}
        onClose={() => setShowEditProject(false)}
        saving={savingProject}
      />

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
          <button className="research-toast__close" onClick={() => setToast(null)} aria-label="Close">&times;</button>
        </div>
      )}
    </div>
  );
}
