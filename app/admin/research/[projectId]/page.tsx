// app/admin/research/[projectId]/page.tsx — Research project hub
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import WorkflowStepper from '../components/WorkflowStepper';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import type { ResearchProject, ResearchDocument, WorkflowStep, AnalysisTemplate } from '@/types/research';
import { WORKFLOW_STEPS, SEVERITY_CONFIG } from '@/types/research';

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
        <DocumentUploadPanel
          projectId={projectId}
          documents={documents}
          onDocumentsChanged={() => { loadDocuments(); loadProject(); }}
        />
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

      {(project.status === 'review' || project.status === 'drawing' || project.status === 'verifying' || project.status === 'complete') && (
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
    </div>
  );
}
