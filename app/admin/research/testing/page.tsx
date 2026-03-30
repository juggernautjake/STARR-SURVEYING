// app/admin/research/testing/page.tsx — Testing Lab main dashboard
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PropertyContextBar, { PropertyContextProvider } from './components/PropertyContextBar';
import BranchSelector from './components/BranchSelector';
import ScrapersTab from './components/ScrapersTab';
import AnalyzersTab from './components/AnalyzersTab';
import PhasesTab from './components/PhasesTab';
import FullPipelineTab from './components/FullPipelineTab';
import HealthCheckTab from './components/HealthCheckTab';
import LogViewerTab from './components/LogViewerTab';
import '@/app/admin/styles/TestingLab.css';

type TabKey = 'scrapers' | 'analyzers' | 'phases' | 'pipeline' | 'health' | 'logs';

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: 'scrapers', label: 'Scrapers', description: '10 individual data scrapers' },
  { key: 'analyzers', label: 'Analyzers', description: '8 AI/logic analyzers' },
  { key: 'phases', label: 'Pipeline Phases', description: '9 phases individually' },
  { key: 'pipeline', label: 'Full Pipeline', description: 'Run all phases with controls' },
  { key: 'health', label: 'Health Check', description: 'Worker & site status' },
  { key: 'logs', label: 'Logs', description: 'Aggregated log viewer' },
];

function TestingLabContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('scrapers');
  const [currentBranch, setCurrentBranch] = useState('main');
  const [compareBranch, setCompareBranch] = useState<string | null>(null);
  const [branchMsg, setBranchMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showBranchMsg = (text: string, ok: boolean) => {
    setBranchMsg({ text, ok });
    setTimeout(() => setBranchMsg(null), 4000);
  };

  const handlePull = async (branch: string) => {
    try {
      const res = await fetch('/api/admin/research/testing/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json() as { success?: boolean; sha?: string; message?: string; error?: string };
      if (res.ok && data.success) {
        showBranchMsg(`Pulled ${branch} — latest commit: ${(data.sha ?? '').slice(0, 7)} "${data.message ?? ''}"`, true);
      } else {
        showBranchMsg(data.error ?? 'Pull failed', false);
      }
    } catch (err) {
      showBranchMsg(err instanceof Error ? err.message : 'Pull failed', false);
    }
  };

  const handleCreateBranch = async (name: string, from: string) => {
    try {
      const res = await fetch('/api/admin/research/testing/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, from }),
      });
      const data = await res.json() as { success?: boolean; branch?: string; error?: string };
      if (res.ok && data.success) {
        showBranchMsg(`Branch "${data.branch ?? name}" created from ${from}`, true);
      } else {
        showBranchMsg(data.error ?? 'Failed to create branch', false);
      }
    } catch (err) {
      showBranchMsg(err instanceof Error ? err.message : 'Failed to create branch', false);
    }
  };

  return (
    <div className="testing-lab">
      {/* Header */}
      <div className="testing-lab__header">
        <div className="testing-lab__header-left">
          <button
            className="research-back-btn"
            onClick={() => router.push('/admin/research')}
          >
            &larr; Back to Research
          </button>
          <h1 className="testing-lab__title">Research Testing Lab</h1>
          <p className="testing-lab__subtitle">
            Debug and test every scraper, analyzer, and pipeline phase individually.
          </p>
        </div>
        <div className="testing-lab__header-right">
          <span className="testing-lab__admin-badge">Admin Only</span>
        </div>
      </div>

      {/* Branch selector */}
      <BranchSelector
        currentBranch={currentBranch}
        compareBranch={compareBranch}
        onBranchChange={setCurrentBranch}
        onCompareBranchChange={setCompareBranch}
        onPull={handlePull}
        onCreateBranch={handleCreateBranch}
      />

      {/* Branch operation feedback */}
      {branchMsg && (
        <div className={`testing-lab__branch-msg ${branchMsg.ok ? 'testing-lab__branch-msg--ok' : 'testing-lab__branch-msg--err'}`}>
          {branchMsg.ok ? '✓' : '✕'} {branchMsg.text}
        </div>
      )}

      {/* Property context */}
      <PropertyContextBar />

      {/* Tab navigation */}
      <div className="testing-lab__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`testing-lab__tab ${activeTab === tab.key ? 'testing-lab__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="testing-lab__content">
        {activeTab === 'scrapers' && <ScrapersTab />}
        {activeTab === 'analyzers' && <AnalyzersTab />}
        {activeTab === 'phases' && <PhasesTab />}
        {activeTab === 'pipeline' && <FullPipelineTab />}
        {activeTab === 'health' && <HealthCheckTab />}
        {activeTab === 'logs' && <LogViewerTab />}
      </div>
    </div>
  );
}

export default function TestingLabPage() {
  return (
    <PropertyContextProvider>
      <TestingLabContent />
    </PropertyContextProvider>
  );
}
