// app/admin/research/components/ResearchAnalysisPanel.tsx
// Unified Research & Analysis panel — replaces PropertySearchPanel + configure + analyzing.
// Single "Initiate Research & Analysis" button triggers the full pipeline:
//   1. Compiling Resources  →  2. Validating Information  →  3. Analyzing Resources
//   4. Extracting Data  →  5. Compiling Data  →  6. Validating Data
//   7. Building Resource Summary  →  8. Building Final Summary
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineLogEntry {
  layer: string;
  source: string;
  method: string;
  input: string;
  status: 'success' | 'fail' | 'skip' | 'partial';
  duration_ms: number;
  dataPointsFound: number;
  error?: string;
  details?: string;
  timestamp?: string;
  steps?: string[];
}

interface PipelineStatusResponse {
  projectId: string;
  status: string;
  currentStage?: string;
  message?: string;
  result?: {
    propertyId?: string;
    ownerName?: string;
    legalDescription?: string;
    acreage?: string | number;
    documentCount?: number;
    duration_ms?: number;
    boundary?: {
      type?: string;
      callCount?: number;
      confidence?: number;
      verified?: boolean;
    } | null;
    searchDiagnostics?: Record<string, unknown>;
    finalSummary?: string;
  };
  documents?: Array<{
    ref?: { documentType?: string; instrumentNumber?: string | null; source?: string };
    hasText?: boolean;
    hasImage?: boolean;
    hasOcr?: boolean;
    extractedData?: { type?: string; confidence?: number; summary?: string } | null;
  }>;
  log?: PipelineLogEntry[];
  failureReason?: string;
}

interface ResourceSummary {
  instrumentNumber: string | null;
  documentType: string;
  source: string;
  rating: number; // 0-100
  summary: string;
  hasText: boolean;
  hasImage: boolean;
  hasOcr: boolean;
}

/** Friendly log entry shown in the live stream */
interface FriendlyLog {
  id: string;
  ts: number;
  level: 'info' | 'success' | 'warn' | 'progress';
  message: string;
}

// ── Stage Definitions ─────────────────────────────────────────────────────────

const RESEARCH_STAGES = [
  { id: 'compiling',   label: 'Compiling Resources',      detail: 'Finding online sources and importing all resources' },
  { id: 'validating',  label: 'Validating Information',    detail: 'Verifying all resources relate to the property in question' },
  { id: 'analyzing',   label: 'Analyzing Resources',       detail: 'Processing each document and resource' },
  { id: 'extracting',  label: 'Extracting Data',           detail: 'Pulling key data from each resource' },
  { id: 'compiling_data', label: 'Compiling Data',         detail: 'Organizing extracted data across all resources' },
  { id: 'validating_data', label: 'Validating Data',       detail: 'Cross-referencing and validating all extracted data' },
  { id: 'resource_summary', label: 'Building Resource Summary', detail: 'Creating individual summaries for each resource' },
  { id: 'final_summary', label: 'Building Final Summary',  detail: 'Compiling the complete research summary' },
] as const;

type ResearchStageId = (typeof RESEARCH_STAGES)[number]['id'];

interface ResearchAnalysisPanelProps {
  projectId: string;
  defaultAddress?: string;
  defaultCounty?: string;
  defaultParcelId?: string;
  onComplete?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map pipeline status messages to our 8 research stages */
function inferResearchStage(message: string | undefined, status: string | null, documentCount: number): ResearchStageId {
  if (!status || status === 'starting') return 'compiling';
  if (status === 'success' || status === 'partial') return 'final_summary';

  if (!message) return 'compiling';
  const lower = message.toLowerCase();

  // Stage 0-1: address normalization + CAD search = Compiling Resources
  if (/stage\s*0/i.test(message) || /stage\s*1/i.test(message) || /normaliz/i.test(lower) || /searching.*cad/i.test(lower)) {
    return 'compiling';
  }
  // Stage 2: document retrieval = still Compiling Resources
  if (/stage\s*2/i.test(message) || /retrieving/i.test(lower) || /document/i.test(lower)) {
    return documentCount > 0 ? 'validating' : 'compiling';
  }
  // Stage 3: AI extraction
  if (/stage\s*3/i.test(message) || /extract/i.test(lower) || /ai/i.test(lower) || /claude/i.test(lower)) {
    if (/validat/i.test(lower)) return 'validating_data';
    if (/summar/i.test(lower)) return 'resource_summary';
    if (/compil/i.test(lower)) return 'compiling_data';
    return 'extracting';
  }
  // Stage 3.5 / 4: geo-reconcile + validation
  if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';
  if (/stage\s*4/i.test(message) || /valid/i.test(lower) || /quality/i.test(lower)) return 'validating_data';

  return 'analyzing';
}

function stageIndex(id: ResearchStageId): number {
  return RESEARCH_STAGES.findIndex(s => s.id === id);
}

/** Convert a raw pipeline log entry into a user-friendly message.
 *
 *  Pipeline log entries come in two forms:
 *   1. `logger.attempt(layer, source, method, input).success(pts, details)`
 *      → source = actual source, method = actual method, status = success/fail/partial
 *   2. `logger.info(layer, message)` / `logger.warn(layer, message)`
 *      → source = 'info'/'warn', method = 'info'/'warn', details = the actual message
 *
 *  We match on `layer` (e.g. 'Stage0', 'Stage1', 'Stage2', 'Stage2-Addr') and `details`
 *  to generate accurate friendly messages.
 */
function logEntryToFriendly(entry: PipelineLogEntry): FriendlyLog | null {
  const id = `${entry.layer}-${entry.source}-${entry.timestamp || Date.now()}`;
  const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();
  const details = entry.details || '';
  const layer = entry.layer || '';

  // ── Info/warn convenience logs (source='info'/'warn', details=message) ────

  if (entry.source === 'info' || entry.source === 'warn') {
    // Skip internal/noisy entries
    if (/Stage \d completed/i.test(details) || /^\d+ doc\(s\)/i.test(details)) return null;
    if (/^Total:/i.test(details)) return null;
    if (/PDF.*bundl/i.test(details)) return null;
    if (/Fetched \w+:/i.test(details)) return null;

    // County detection
    if (/County.*specific.*CAD/i.test(details)) {
      return { id, ts, level: 'success', message: details };
    }
    if (/County clerk records available/i.test(details)) {
      return { id, ts, level: 'success', message: details };
    }
    if (/No county-specific/i.test(details)) {
      return { id, ts, level: 'warn', message: details };
    }

    // Property found
    if (/Found:.*conf\s/i.test(details)) {
      const ownerMatch = details.match(/Found:\s*(.+?)\s*·/);
      const idMatch = details.match(/ID\s+(\S+)/);
      const acreMatch = details.match(/([\d.]+)\s*ac/);
      const parts: string[] = [];
      if (ownerMatch) parts.push(`Owner: ${ownerMatch[1]}`);
      if (idMatch) parts.push(`Property ID: ${idMatch[1]}`);
      if (acreMatch) parts.push(`${acreMatch[1]} acres`);
      return { id, ts, level: 'success', message: `Found the property! ${parts.join(', ')}` };
    }

    // CAD lookup failed
    if (/CAD lookup failed/i.test(details)) {
      return { id, ts, level: 'warn', message: 'Property not found in the county appraisal records. Searching clerk records instead...' };
    }

    // Direct ID lookup
    if (/Direct ID lookup/i.test(details)) {
      return { id, ts, level: 'info', message: `Looking up property by ID: ${details.replace(/Direct ID lookup:\s*/i, '')}` };
    }

    // Instruments found
    if (/Instruments:/i.test(details)) {
      const count = (details.match(/\(/g) || []).length;
      return { id, ts, level: 'success', message: `Retrieved ${count} deed document${count !== 1 ? 's' : ''} from the county clerk by instrument number!` };
    }

    // Owner-name search results
    if (/Owner-name:.*doc/i.test(details)) {
      const docCount = details.match(/(\d+)\s*doc/)?.[1] || '0';
      return { id, ts, level: 'success', message: `Owner name search found ${docCount} document${docCount !== '1' ? 's' : ''} in the county clerk records.` };
    }
    if (/No documents found for/i.test(details)) {
      const name = details.match(/for\s+"([^"]+)"/)?.[1] || 'owner';
      return { id, ts, level: 'warn', message: `No clerk records found under "${name}". Trying alternative search methods...` };
    }

    // Address search
    if (/trying address-based/i.test(details)) {
      return { id, ts, level: 'info', message: 'Searching county clerk records by property address...' };
    }
    if (/Address search found/i.test(details)) {
      const count = details.match(/(\d+)/)?.[1] || '0';
      return { id, ts, level: 'success', message: `Address search found ${count} document${count !== '1' ? 's' : ''} in the clerk records!` };
    }

    // SuperSearch
    if (/trying SUPERSEARCH/i.test(details)) {
      return { id, ts, level: 'info', message: 'Running a broad full-text search to find additional related documents...' };
    }
    if (/SUPERSEARCH found/i.test(details)) {
      const count = details.match(/(\d+)/)?.[1] || '0';
      return { id, ts, level: 'success', message: `Broad search found ${count} additional document${count !== '1' ? 's' : ''}!` };
    }

    // Plat search
    if (/No plats found.*searching clerk/i.test(details)) {
      return { id, ts, level: 'info', message: 'Searching county clerk for subdivision plat documents...' };
    }
    if (/Plat search found/i.test(details)) {
      const count = details.match(/(\d+)/)?.[1] || '0';
      return { id, ts, level: 'success', message: `Found ${count} plat document${count !== '1' ? 's' : ''} for the subdivision!` };
    }
    if (/Plat:.*\(/i.test(details)) {
      const name = details.match(/Plat:\s*"([^"]+)"/)?.[1] || 'subdivision';
      return { id, ts, level: 'success', message: `Found plat: "${name}" from the county plat repository.` };
    }

    // AI extraction stage
    if (/Stage 3: AI extraction/i.test(details)) {
      return { id, ts, level: 'progress', message: 'Starting AI document analysis and data extraction...' };
    }
    if (/Extraction:.*calls/i.test(details)) {
      const callMatch = details.match(/(\d+)\s*calls/);
      if (callMatch) {
        return { id, ts, level: 'success', message: `AI found ${callMatch[1]} boundary calls in the documents!` };
      }
      return { id, ts, level: 'info', message: 'AI extraction complete.' };
    }
    if (/no boundary/i.test(details)) {
      return { id, ts, level: 'info', message: 'No boundary calls extracted — may be a lot-and-block or reference-only description.' };
    }

    // Geo-reconciliation
    if (/Geometric Reconciliation/i.test(details)) {
      return { id, ts, level: 'progress', message: 'Cross-checking document data against plat geometry...' };
    }
    if (/Reconciliation:.*confirmed/i.test(details)) {
      const confirmed = details.match(/(\d+)\s*confirmed/)?.[1] || '0';
      const conflicts = details.match(/(\d+)\s*conflicts/)?.[1] || '0';
      const pct = details.match(/(\d+)%/)?.[1] || '0';
      if (conflicts === '0') {
        return { id, ts, level: 'success', message: `Geometry check: all ${confirmed} data points confirmed (${pct}% agreement). Looking good!` };
      }
      return { id, ts, level: 'warn', message: `Geometry check: ${confirmed} confirmed, ${conflicts} conflict${conflicts !== '1' ? 's' : ''} (${pct}% agreement). Conflicts flagged for review.` };
    }
    if (/No plat image available/i.test(details)) {
      return { id, ts, level: 'info', message: 'No plat image available — skipping geometry reconciliation.' };
    }

    // Validation
    if (/STAGE 4.*Validation/i.test(details)) {
      return { id, ts, level: 'progress', message: 'Running final validation checks...' };
    }
    if (/Quality:/i.test(details)) {
      const quality = details.match(/Quality:\s*(\w+)/)?.[1] || 'unknown';
      const flags = details.match(/Flags:\s*(\d+)/)?.[1] || '0';
      if (quality === 'excellent' || quality === 'good') {
        return { id, ts, level: 'success', message: `Validation passed! Quality: ${quality}${flags !== '0' ? ` (${flags} minor flag${flags !== '1' ? 's' : ''})` : ''}.` };
      }
      return { id, ts, level: 'warn', message: `Validation: ${quality} quality${flags !== '0' ? ` with ${flags} flag${flags !== '1' ? 's' : ''}` : ''}. Some data may need review.` };
    }

    // Pipeline completion
    if (/Pipeline (COMPLETE|PARTIAL|FAILED)/i.test(details)) {
      return null; // Handled by the completion message in pollPipelineStatus
    }

    // User files
    if (/Processing:.*KB/i.test(details) && layer === 'UserFiles') {
      return { id, ts, level: 'info', message: `Processing uploaded file: ${details.replace('Processing: ', '')}` };
    }
    if (/Processed.*user files/i.test(details)) {
      const count = details.match(/(\d+)/)?.[1] || '0';
      return { id, ts, level: 'success', message: `Processed ${count} uploaded file${count !== '1' ? 's' : ''}.` };
    }

    // Warning-level entries
    if (entry.source === 'warn') {
      if (/WARNING:/i.test(details)) {
        const msg = details.replace(/^WARNING:\s*/i, '');
        // Skip noisy warnings
        if (/Instrument errors/i.test(msg) || /capping/i.test(msg)) return null;
        return { id, ts, level: 'warn', message: msg };
      }
    }

    // Generic info — skip most to avoid noise
    return null;
  }

  // ── Structured attempt entries (actual source/method/status) ──────────────

  // Failed entries
  if (entry.status === 'fail') {
    const errText = entry.error || '';
    if (/timeout/i.test(errText)) {
      return { id, ts, level: 'warn', message: `A search is taking longer than expected. Moving on to other sources.` };
    }
    if (/not found|no results|empty/i.test(errText)) {
      return { id, ts, level: 'warn', message: `Didn't find matches from ${entry.source || 'this source'}. Checking other sources.` };
    }
    if (/error/i.test(entry.source)) return null; // Skip error-level convenience logs
    return { id, ts, level: 'warn', message: `Ran into an issue with ${entry.source || 'a source'}. Continuing with other resources.` };
  }

  // Skipped entries — skip to avoid noise unless they have useful details
  if (entry.status === 'skip') {
    return null;
  }

  // Successful entries with data points
  const pts = entry.dataPointsFound;
  if (entry.status === 'success' && pts > 0) {
    const src = entry.source || 'a source';
    if (/cad/i.test(src) || /property/i.test(entry.method)) {
      return { id, ts, level: 'success', message: `Found ${pts} data point${pts !== 1 ? 's' : ''} from the county appraisal records!` };
    }
    if (/clerk|kofile/i.test(src)) {
      return { id, ts, level: 'success', message: `Found ${pts} data point${pts !== 1 ? 's' : ''} from the county clerk records!` };
    }
    return { id, ts, level: 'success', message: `Extracted ${pts} data point${pts !== 1 ? 's' : ''} from ${src}.` };
  }

  // Partial success
  if (entry.status === 'partial') {
    return { id, ts, level: 'info', message: `Got partial results from ${entry.source || 'a source'} — using what was available.` };
  }

  // Generic success without data points — skip to reduce noise
  return null;
}

/** Generate stage-transition friendly messages */
function stageTransitionMessage(stage: ResearchStageId, docCount: number): FriendlyLog {
  const ts = Date.now();
  switch (stage) {
    case 'compiling':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Starting up! Searching for all available resources...' };
    case 'validating':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: `Found ${docCount} resource${docCount !== 1 ? 's' : ''} so far. Validating that everything relates to the right property...` };
    case 'analyzing':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Analyzing each document and resource in detail...' };
    case 'extracting':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Extracting key data points — legal descriptions, boundaries, ownership info...' };
    case 'compiling_data':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Organizing all extracted data into a structured format...' };
    case 'validating_data':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Cross-referencing data across sources to check for consistency...' };
    case 'resource_summary':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Building individual summaries for each resource...' };
    case 'final_summary':
      return { id: `stage-${stage}-${ts}`, ts, level: 'progress', message: 'Almost done! Compiling the final research summary...' };
  }
}

export default function ResearchAnalysisPanel({
  projectId,
  defaultAddress,
  defaultCounty,
  defaultParcelId,
  onComplete,
}: ResearchAnalysisPanelProps) {
  // Form state
  const [address, setAddress] = useState(defaultAddress || '');
  const [county, setCounty] = useState(defaultCounty || '');
  const [parcelId, setParcelId] = useState(defaultParcelId || '');
  const [ownerName, setOwnerName] = useState('');

  // Pipeline state
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentStage, setCurrentStage] = useState<ResearchStageId>('compiling');
  const [error, setError] = useState('');
  const [documentCount, setDocumentCount] = useState(0);
  const [pipelineResult, setPipelineResult] = useState<PipelineStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results state
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [finalSummary, setFinalSummary] = useState('');
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const [logsCopied, setLogsCopied] = useState(false);

  // Friendly live log stream
  const [friendlyLogs, setFriendlyLogs] = useState<FriendlyLog[]>([]);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const logStreamRef = useRef<HTMLDivElement>(null);
  const prevStageRef = useRef<ResearchStageId | null>(null);
  const processedLogCountRef = useRef(0);

  // Supplemental upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll log stream to bottom when new entries arrive
  useEffect(() => {
    if (logStreamRef.current) {
      logStreamRef.current.scrollTop = logStreamRef.current.scrollHeight;
    }
  }, [friendlyLogs]);

  // ── Pipeline Control ──────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`);
      if (!res.ok) {
        if (res.status === 404) stopPolling();
        return;
      }
      const data = await res.json() as PipelineStatusResponse;
      setPipelineResult(data);

      // Update document count from pipeline response
      const docCount = data.documents?.length ?? data.result?.documentCount ?? 0;
      setDocumentCount(docCount);

      // Infer current stage
      const stage = inferResearchStage(data.message, data.status, docCount);
      setCurrentStage(stage);

      // Update raw logs
      if (data.log) setLogs(data.log);

      // Generate friendly logs from new pipeline log entries
      if (data.log && data.log.length > processedLogCountRef.current) {
        const newEntries = data.log.slice(processedLogCountRef.current);
        processedLogCountRef.current = data.log.length;

        const newFriendly: FriendlyLog[] = [];
        for (const entry of newEntries) {
          const friendly = logEntryToFriendly(entry);
          if (friendly) newFriendly.push(friendly);
        }
        if (newFriendly.length > 0) {
          setFriendlyLogs(prev => [...prev, ...newFriendly]);
        }
      }

      // Add stage transition message if stage changed
      if (prevStageRef.current !== stage) {
        prevStageRef.current = stage;
        setFriendlyLogs(prev => [...prev, stageTransitionMessage(stage, docCount)]);
      }

      if (data.status !== 'running') {
        // Pipeline finished
        setIsRunning(false);
        setIsComplete(true);
        setCurrentStage('final_summary');
        stopPolling();

        // Add completion message
        if (data.status === 'failed') {
          setFriendlyLogs(prev => [...prev, {
            id: `complete-fail-${Date.now()}`,
            ts: Date.now(),
            level: 'warn',
            message: data.failureReason || 'Research pipeline encountered an error. Some results may still be available.',
          }]);
        } else {
          const totalDocs = data.documents?.length ?? 0;
          const totalPts = data.log?.reduce((sum, l) => sum + l.dataPointsFound, 0) ?? 0;
          setFriendlyLogs(prev => [...prev, {
            id: `complete-success-${Date.now()}`,
            ts: Date.now(),
            level: 'success',
            message: `Research complete! Analyzed ${totalDocs} resource${totalDocs !== 1 ? 's' : ''} and extracted ${totalPts} data point${totalPts !== 1 ? 's' : ''}.`,
          }]);
        }

        // Build resource summaries from pipeline documents
        if (data.documents) {
          const summaries: ResourceSummary[] = data.documents.map((doc, i) => ({
            instrumentNumber: doc.ref?.instrumentNumber ?? null,
            documentType: doc.ref?.documentType ?? 'Unknown',
            source: doc.ref?.source ?? 'Unknown',
            rating: doc.extractedData?.confidence
              ? Math.round(doc.extractedData.confidence * 100)
              : doc.hasText || doc.hasImage ? 60 : 30,
            summary: doc.extractedData?.type
              ? `${doc.extractedData.type} document with ${doc.hasText ? 'text' : ''}${doc.hasImage ? (doc.hasText ? ' and image' : 'image') : ''} content.`
              : `Resource ${i + 1}: ${doc.ref?.documentType ?? 'document'} from ${doc.ref?.source ?? 'unknown source'}.`,
            hasText: doc.hasText ?? false,
            hasImage: doc.hasImage ?? false,
            hasOcr: doc.hasOcr ?? false,
          }));
          setResources(summaries);
        }

        // Set final summary
        if (data.result?.finalSummary) {
          setFinalSummary(data.result.finalSummary);
        } else if (data.result) {
          const parts: string[] = [];
          if (data.result.ownerName) parts.push(`Owner: ${data.result.ownerName}`);
          if (data.result.acreage) parts.push(`Acreage: ${data.result.acreage}`);
          if (data.result.legalDescription) parts.push(`Legal Description: ${data.result.legalDescription}`);
          if (data.result.documentCount) parts.push(`${data.result.documentCount} document(s) retrieved`);
          if (data.result.boundary?.callCount) parts.push(`${data.result.boundary.callCount} boundary call(s) extracted`);
          if (data.result.boundary?.confidence) parts.push(`Confidence: ${Math.round(data.result.boundary.confidence * 100)}%`);
          setFinalSummary(parts.join('\n'));
        }

        if (data.status === 'failed') {
          setError(data.failureReason || 'Research pipeline failed. Please try again.');
        }

        onComplete?.();
      }
    } catch { /* keep polling */ }
  }, [projectId, stopPolling, onComplete]);

  async function handleInitiateResearch() {
    if (isRunning) return;
    if (!address.trim() && !county.trim() && !parcelId.trim()) {
      setError('Enter a property address, county, or parcel ID to start research.');
      return;
    }

    // Reset state
    setError('');
    setIsRunning(true);
    setIsComplete(false);
    setCurrentStage('compiling');
    setDocumentCount(0);
    setPipelineResult(null);
    setResources([]);
    setFinalSummary('');
    setLogs([]);
    setFriendlyLogs([{
      id: `init-${Date.now()}`,
      ts: Date.now(),
      level: 'progress',
      message: 'Initiating Research & Analysis pipeline...',
    }]);
    processedLogCountRef.current = 0;
    prevStageRef.current = null;

    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim() || undefined,
          county: county.trim() || undefined,
          propertyId: parcelId.trim() || undefined,
          ownerName: ownerName.trim() || undefined,
        }),
      });

      if (res.ok) {
        setFriendlyLogs(prev => [...prev, {
          id: `started-${Date.now()}`,
          ts: Date.now(),
          level: 'success',
          message: 'Pipeline started successfully! Searching for resources...',
        }]);

        // Also trigger the public records search to auto-import
        fetch(`/api/admin/research/${projectId}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address.trim() || undefined,
            county: county.trim() || undefined,
            parcel_id: parcelId.trim() || undefined,
            owner_name: ownerName.trim() || undefined,
          }),
        }).then(async searchRes => {
          if (searchRes.ok) {
            const data = await searchRes.json();
            if (data.results && data.results.length > 0) {
              setFriendlyLogs(prev => [...prev, {
                id: `public-records-${Date.now()}`,
                ts: Date.now(),
                level: 'success',
                message: `Found ${data.results.length} public record${data.results.length !== 1 ? 's' : ''} to import! Auto-importing all results...`,
              }]);
              await fetch(`/api/admin/research/${projectId}/search`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  results: data.results.map((r: Record<string, unknown>) => ({
                    source: r.source,
                    source_name: r.source_name,
                    title: r.title,
                    url: r.url,
                    document_type: r.document_type,
                    description: r.description,
                  })),
                  address: address.trim() || undefined,
                }),
              });
              setFriendlyLogs(prev => [...prev, {
                id: `imported-${Date.now()}`,
                ts: Date.now(),
                level: 'success',
                message: `All ${data.results.length} public records imported into the research pipeline.`,
              }]);
            } else {
              setFriendlyLogs(prev => [...prev, {
                id: `no-public-${Date.now()}`,
                ts: Date.now(),
                level: 'info',
                message: 'No additional public records found — the deep search will cover other sources.',
              }]);
            }
          }
        }).catch(() => { /* non-critical */ });

        // Start polling
        stopPolling();
        pollRef.current = setInterval(pollPipelineStatus, 3_000);
      } else if (res.status === 503) {
        setFriendlyLogs(prev => [...prev, {
          id: `lite-fallback-${Date.now()}`,
          ts: Date.now(),
          level: 'info',
          message: 'Full research worker unavailable. Falling back to lite pipeline...',
        }]);

        const liteRes = await fetch(`/api/admin/research/${projectId}/lite-pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address.trim() || undefined,
            county: county.trim() || undefined,
            owner_name: ownerName.trim() || undefined,
            parcel_id: parcelId.trim() || undefined,
          }),
        });
        if (liteRes.ok) {
          setFriendlyLogs(prev => [...prev, {
            id: `lite-started-${Date.now()}`,
            ts: Date.now(),
            level: 'success',
            message: 'Lite pipeline started. This may take a few minutes...',
          }]);
          stopPolling();
          pollRef.current = setInterval(async () => {
            try {
              const r = await fetch(`/api/admin/research/${projectId}/lite-pipeline`);
              if (!r.ok) return;
              const d = await r.json();
              if (d.status !== 'running') {
                setIsRunning(false);
                setIsComplete(true);
                setCurrentStage('final_summary');
                stopPolling();
                setFriendlyLogs(prev => [...prev, {
                  id: `lite-done-${Date.now()}`,
                  ts: Date.now(),
                  level: 'success',
                  message: 'Lite pipeline completed!',
                }]);
                onComplete?.();
              } else {
                const stg = d.stage?.includes('extract') ? 'extracting' : 'analyzing';
                setCurrentStage(stg as ResearchStageId);
              }
            } catch { /* keep polling */ }
          }, 4_000);
        } else {
          setError('Research worker is not available. Please try again later.');
          setIsRunning(false);
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to start research' }));
        setError(err.error || 'Failed to start research pipeline.');
        setIsRunning(false);
      }
    } catch {
      setError('Network error. Check your internet connection and try again.');
      setIsRunning(false);
    }
  }

  // ── Supplemental Upload ─────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setUploadFiles(prev => [...prev, ...files]);
  }

  function removeFile(index: number) {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleUploadAndReanalyze() {
    if (uploading || uploadFiles.length === 0) return;
    setUploading(true);

    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`/api/admin/research/${projectId}/documents`, {
          method: 'POST',
          body: formData,
        });
      }

      setUploadFiles([]);
      setShowUpload(false);
      setUploading(false);

      setReanalyzing(true);
      setFriendlyLogs(prev => [...prev, {
        id: `reanalyze-${Date.now()}`,
        ts: Date.now(),
        level: 'progress',
        message: 'Re-analyzing with new files included...',
      }]);

      const res = await fetch(`/api/admin/research/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: true }),
      });

      if (res.ok) {
        const analyzeInterval = setInterval(async () => {
          try {
            const r = await fetch(`/api/admin/research/${projectId}/analyze`);
            if (!r.ok) return;
            const data = await r.json();
            if (data.status !== 'analyzing') {
              clearInterval(analyzeInterval);
              setReanalyzing(false);
              setFriendlyLogs(prev => [...prev, {
                id: `reanalyze-done-${Date.now()}`,
                ts: Date.now(),
                level: 'success',
                message: 'Re-analysis complete! Summary updated with new information.',
              }]);
              onComplete?.();
            }
          } catch { /* keep polling */ }
        }, 3_000);
      } else {
        setReanalyzing(false);
      }
    } catch {
      setUploading(false);
      setError('Failed to upload files. Please try again.');
    }
  }

  // ── Log Copy ────────────────────────────────────────────────────────────

  function handleCopyLogs() {
    // Copy both friendly logs and raw pipeline logs
    const friendlyText = friendlyLogs.map(l => {
      const time = new Date(l.ts).toLocaleTimeString();
      const prefix = l.level === 'success' ? '[OK]' : l.level === 'warn' ? '[WARN]' : l.level === 'progress' ? '[>>]' : '[--]';
      return `${time} ${prefix} ${l.message}`;
    }).join('\n');

    const rawText = logs.length > 0
      ? '\n\n--- Raw Pipeline Log ---\n' + logs.map(l =>
          `[${l.layer}] ${l.source} | ${l.method} | ${l.status} | ${l.duration_ms}ms | ${l.dataPointsFound} pts${l.error ? ` | ERROR: ${l.error}` : ''}${l.details ? ` | ${l.details}` : ''}`
        ).join('\n')
      : '';

    navigator.clipboard.writeText(friendlyText + rawText).then(() => {
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    });
  }

  // ── Log Stream Render (shared between running & complete states) ────────

  function renderLogStream() {
    if (friendlyLogs.length === 0) return null;

    const warnCount = friendlyLogs.filter(l => l.level === 'warn').length;

    return (
      <div className="ra-live-log">
        <div
          className="ra-live-log__header"
          onClick={() => setLogCollapsed(c => !c)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="ra-live-log__toggle"
              style={{ fontSize: '0.75rem', opacity: 0.7, transition: 'transform 0.2s', display: 'inline-block', transform: logCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            >
              {logCollapsed ? '\u25B6' : '\u25BC'}
            </span>
            <span className="ra-live-log__title">Activity Log</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
              ({friendlyLogs.length} entries{warnCount > 0 ? `, ${warnCount} warning${warnCount !== 1 ? 's' : ''}` : ''})
            </span>
            {logCollapsed && (
              <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: '4px' }}>
                {isRunning ? 'live' : isComplete ? 'complete' : ''}
              </span>
            )}
          </div>
          <button
            className="ra-live-log__copy-btn"
            onClick={(e) => { e.stopPropagation(); handleCopyLogs(); }}
          >
            {logsCopied ? 'Copied!' : 'Copy Logs'}
          </button>
        </div>
        {!logCollapsed && (
          <div className="ra-live-log__stream" ref={logStreamRef}>
            {friendlyLogs.map((entry) => (
              <div
                key={entry.id}
                className={`ra-live-log__entry ra-live-log__entry--${entry.level}`}
              >
                <span className="ra-live-log__time">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span className="ra-live-log__icon">
                  {entry.level === 'success' ? '\u2705' :
                   entry.level === 'warn' ? '\u26A0\uFE0F' :
                   entry.level === 'progress' ? '\u27A1\uFE0F' :
                   '\u2139\uFE0F'}
                </span>
                <span className="ra-live-log__msg">{entry.message}</span>
              </div>
            ))}
            {isRunning && (
              <div className="ra-live-log__entry ra-live-log__entry--typing">
                <span className="ra-live-log__time">&nbsp;</span>
                <span className="ra-live-log__icon">&nbsp;</span>
                <span className="ra-live-log__dots">
                  <span className="ra-live-log__dot" />
                  <span className="ra-live-log__dot" />
                  <span className="ra-live-log__dot" />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const activeStageIdx = stageIndex(currentStage);

  // If not running and not complete, show the form
  if (!isRunning && !isComplete) {
    return (
      <div className="ra-panel">
        <div className="ra-panel__header">
          <h3 className="ra-panel__title">Research & Analysis</h3>
          <p className="ra-panel__desc">
            Enter the property details below and click <strong>Initiate Research & Analysis</strong>.
            All resources will be automatically found, imported, analyzed, and summarized.
          </p>
        </div>

        <div className="ra-panel__form">
          <div className="ra-panel__field">
            <label className="ra-panel__label" htmlFor="ra-address">Property Address</label>
            <input
              id="ra-address"
              className="ra-panel__input"
              type="text"
              placeholder="e.g. 1234 Main St, Belton, TX 76513"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInitiateResearch()}
            />
          </div>

          <div className="ra-panel__row">
            <div className="ra-panel__field ra-panel__field--half">
              <label className="ra-panel__label" htmlFor="ra-county">County</label>
              <input
                id="ra-county"
                className="ra-panel__input"
                type="text"
                placeholder="e.g. Bell"
                value={county}
                onChange={e => setCounty(e.target.value)}
              />
            </div>
            <div className="ra-panel__field ra-panel__field--half">
              <label className="ra-panel__label" htmlFor="ra-parcel">Parcel / Property ID</label>
              <input
                id="ra-parcel"
                className="ra-panel__input"
                type="text"
                placeholder="e.g. R12345"
                value={parcelId}
                onChange={e => setParcelId(e.target.value)}
              />
            </div>
          </div>

          <div className="ra-panel__field">
            <label className="ra-panel__label" htmlFor="ra-owner">Owner Name</label>
            <input
              id="ra-owner"
              className="ra-panel__input"
              type="text"
              placeholder="e.g. John Smith"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
            />
          </div>

          {error && <div className="ra-panel__error">{error}</div>}

          <button
            className="ra-panel__initiate-btn"
            onClick={handleInitiateResearch}
          >
            Initiate Research & Analysis
          </button>
        </div>
      </div>
    );
  }

  // Running state — show progress stages + live log stream
  if (isRunning) {
    return (
      <div className="ra-panel">
        <div className="ra-panel__progress">
          <div className="ra-panel__progress-header">
            <div className="ra-panel__spinner" />
            <h3 className="ra-panel__progress-title">Research & Analysis In Progress</h3>
          </div>

          {documentCount > 0 && (
            <div className="ra-panel__doc-count">
              <span className="ra-panel__doc-count-num">{documentCount}</span>
              <span className="ra-panel__doc-count-label">resource{documentCount !== 1 ? 's' : ''} in pipeline</span>
            </div>
          )}

          <div className="ra-panel__stages">
            {RESEARCH_STAGES.map((stage, i) => {
              const isDone = i < activeStageIdx;
              const isActive = i === activeStageIdx;
              const isPending = i > activeStageIdx;
              return (
                <div
                  key={stage.id}
                  className={`ra-stage ${isDone ? 'ra-stage--done' : ''} ${isActive ? 'ra-stage--active' : ''} ${isPending ? 'ra-stage--pending' : ''}`}
                >
                  <div className="ra-stage__indicator">
                    {isDone ? (
                      <svg className="ra-stage__check" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : isActive ? (
                      <div className="ra-stage__pulse" />
                    ) : (
                      <div className="ra-stage__dot" />
                    )}
                  </div>
                  <div className="ra-stage__content">
                    <div className="ra-stage__label">{stage.label}</div>
                    {isActive && <div className="ra-stage__detail">{stage.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {error && <div className="ra-panel__error">{error}</div>}

          {/* Live Log Stream — directly below stages */}
          {renderLogStream()}
        </div>
      </div>
    );
  }

  // Complete state — show results with persistent log stream
  return (
    <div className="ra-panel">
      <div className="ra-results">
        <div className="ra-results__header">
          <h3 className="ra-results__title">Research & Analysis Complete</h3>
          <div className="ra-results__meta">
            {resources.length} resource{resources.length !== 1 ? 's' : ''} analyzed
            {pipelineResult?.result?.duration_ms && (
              <> in {Math.round(pipelineResult.result.duration_ms / 1000)}s</>
            )}
          </div>
        </div>

        {error && <div className="ra-panel__error">{error}</div>}

        {/* Final Summary Section */}
        {finalSummary && (
          <div className="ra-results__final-summary">
            <h4 className="ra-results__section-title">Final Summary</h4>
            <div className="ra-results__summary-text">
              {finalSummary.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Resources List */}
        {resources.length > 0 && (
          <div className="ra-results__resources">
            <h4 className="ra-results__section-title">Resources ({resources.length})</h4>
            {resources.map((r, i) => (
              <div key={i} className="ra-resource">
                <div className="ra-resource__header">
                  <span className="ra-resource__type">{r.documentType}</span>
                  <span className="ra-resource__source">{r.source}</span>
                  <div className="ra-resource__rating">
                    <div className="ra-resource__rating-bar">
                      <div
                        className="ra-resource__rating-fill"
                        style={{
                          width: `${r.rating}%`,
                          background: r.rating >= 80 ? '#059669' : r.rating >= 50 ? '#F59E0B' : '#EF4444',
                        }}
                      />
                    </div>
                    <span className="ra-resource__rating-pct">{r.rating}%</span>
                  </div>
                </div>
                <div className="ra-resource__summary">{r.summary}</div>
                <div className="ra-resource__badges">
                  {r.hasText && <span className="ra-resource__badge ra-resource__badge--text">Text</span>}
                  {r.hasImage && <span className="ra-resource__badge ra-resource__badge--image">Image</span>}
                  {r.hasOcr && <span className="ra-resource__badge ra-resource__badge--ocr">OCR</span>}
                  {r.instrumentNumber && (
                    <span className="ra-resource__badge ra-resource__badge--instr">#{r.instrumentNumber}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload More Files */}
        <div className="ra-results__upload-section">
          {!showUpload ? (
            <button
              className="ra-results__upload-btn"
              onClick={() => setShowUpload(true)}
              disabled={reanalyzing}
            >
              {reanalyzing ? 'Re-analyzing...' : 'Upload Additional Files'}
            </button>
          ) : (
            <div className="ra-results__upload-form">
              <h4 className="ra-results__section-title">Upload Additional Files</h4>
              <p className="ra-results__upload-desc">
                Upload more documents to be analyzed. The AI will extract data from the new files
                and update the final summary if the new information is impactful.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.doc,.docx,.txt"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="ra-results__choose-files-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Files
              </button>
              {uploadFiles.length > 0 && (
                <div className="ra-results__file-list">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="ra-results__file-item">
                      <span>{f.name}</span>
                      <button onClick={() => removeFile(i)} className="ra-results__file-remove">&times;</button>
                    </div>
                  ))}
                  <button
                    className="ra-panel__initiate-btn"
                    onClick={handleUploadAndReanalyze}
                    disabled={uploading}
                    style={{ marginTop: '0.5rem' }}
                  >
                    {uploading ? 'Uploading...' : `Upload & Analyze ${uploadFiles.length} File${uploadFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
              <button
                className="ra-results__upload-cancel"
                onClick={() => { setShowUpload(false); setUploadFiles([]); }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Persistent Log Stream — always visible after completion */}
        {renderLogStream()}
      </div>
    </div>
  );
}
