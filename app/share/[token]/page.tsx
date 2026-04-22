'use client';

// app/share/[token]/page.tsx
// Phase 17: Public read-only report viewer.
//
// No authentication required — this page is accessed via a share link.
// Renders a permission-filtered view of a research project report with
// optional password prompt and "Powered by Starr Recon" branding.

import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareRecord {
  token: string;
  projectId: string;
  permission: string;
  createdBy: string;
  expiresAt: string | null;
  viewCount: number;
  maxViews: number | null;
  label?: string;
  createdAt: string;
  lastViewedAt: string | null;
  isRevoked: boolean;
  is_password_protected?: boolean;
}

interface ReportData {
  property_address?: string;
  legal_description?: string;
  county?: string;
  state?: string;
  status?: string;
  confidence_score?: number;
  boundary_summary?: string;
  created_at?: string;
}

interface SharePageProps {
  params: { token: string };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PoweredBy() {
  return (
    <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
      Powered by{' '}
      <span className="font-semibold text-blue-600">Starr Recon</span> —
      AI Property Research by Starr Surveying Company, Belton, TX
    </footer>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? 'bg-green-100 text-green-800'
    : pct >= 60 ? 'bg-yellow-100 text-yellow-800'
    : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-base font-bold min-h-[44px] ${color}`}>
      {pct}% confidence
    </span>
  );
}

function PasswordForm({ onSubmit }: { onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Password Required
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          This report is password-protected. Enter the password to continue.
        </p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && pw && onSubmit(pw)}
          placeholder="Enter password"
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />
        <button
          onClick={() => pw && onSubmit(pw)}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-base font-medium py-3 min-h-[44px] rounded-lg transition-colors"
        >
          View Report
        </button>
        <PoweredBy />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharePage({ params }: SharePageProps) {
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareRecord, setShareRecord] = useState<ShareRecord | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  async function fetchReport(password?: string) {
    setLoading(true);
    setWrongPassword(false);

    const url = `/api/share/${token}${password ? `?password=${encodeURIComponent(password)}` : ''}`;

    try {
      const res = await fetch(url);
      if (res.status === 404) {
        setError('This report link is not available or has expired.');
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        const body = await res.json();
        if (body.is_password_protected && password) setWrongPassword(true);
        setNeedsPassword(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('An error occurred loading this report.');
        setLoading(false);
        return;
      }
      const body = await res.json();
      setShareRecord(body.shareRecord);
      setReportData(body.reportData);
      setNeedsPassword(false);
    } catch {
      setError('An error occurred loading this report.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400 animate-pulse">Loading report…</div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <>
        {wrongPassword && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow">
            Incorrect password — please try again.
          </div>
        )}
        <PasswordForm onSubmit={(pw) => fetchReport(pw)} />
      </>
    );
  }

  if (error || !shareRecord || !reportData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500 text-sm">{error ?? 'Report not found.'}</p>
          <PoweredBy />
        </div>
      </div>
    );
  }

  const permission = shareRecord.permission;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 overflow-x-hidden">
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
                Property Research Report
              </p>
              <h1 className="text-xl font-bold text-gray-900 leading-snug break-words">
                {reportData.property_address ?? 'Property Report'}
              </h1>
              {(reportData.county || reportData.state) && (
                <p className="text-base text-gray-500 mt-1">
                  {[reportData.county, reportData.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {reportData.confidence_score !== undefined && (
              <ConfidenceBadge score={reportData.confidence_score} />
            )}
          </div>
          {shareRecord.label && (
            <p className="mt-3 text-xs text-gray-400">Shared as: {shareRecord.label}</p>
          )}
        </div>

        {/* Legal description — hidden for summary_only */}
        {permission !== 'summary_only' && reportData.legal_description && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Legal Description</h2>
            <p className="text-base text-gray-600 whitespace-pre-wrap leading-relaxed">
              {reportData.legal_description}
            </p>
          </section>
        )}

        {/* Boundary summary — shown for boundary_only and documents_excluded */}
        {(permission === 'boundary_only' || permission === 'full_report' || permission === 'documents_excluded') &&
          reportData.boundary_summary && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Boundary Summary</h2>
            <p className="text-base text-gray-600 whitespace-pre-wrap leading-relaxed">
              {reportData.boundary_summary}
            </p>
          </section>
        )}

        {/* Status pill */}
        {reportData.status && permission !== 'boundary_only' && (
          <div className="mb-4">
            <span className="inline-block bg-gray-100 text-gray-600 text-sm font-medium px-4 py-2 min-h-[44px] flex items-center rounded-full">
              Status: {reportData.status.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        <PoweredBy />
      </div>
    </div>
  );
}
