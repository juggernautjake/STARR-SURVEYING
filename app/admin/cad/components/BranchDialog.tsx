'use client';
// app/admin/cad/components/BranchDialog.tsx
//
// cad-branching — the hub for GitHub-style drawing collaboration.
//
//   • Overview — context for the currently-open drawing: if it's a main you
//     can branch it; if it's a branch you can submit it for review / withdraw
//     / open the main; either way you see a change summary vs the main.
//   • Branches — every branch forked from this drawing, with the owner's
//     Accept / Reject controls on the ones awaiting review.
//   • Reviews — your inbox: branches other people submitted on drawings you
//     own, ready to accept (make main) or reject (keep yours).
//
// A branch is just another cad_drawings row (parent_id set), so opening one
// reuses the normal editor load/save pipeline.

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  GitBranch, GitPullRequest, GitFork, Check, X, Eye, RefreshCw,
  AlertTriangle, Send, Undo2, Loader2, Inbox, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useDrawingStore, useSaveTargetStore } from '@/lib/cad/store';
import { openDrawingById, fetchDrawingDocument } from '@/lib/cad/persistence/open-drawing';
import { requestDiscard } from '../hooks/useUnsavedChangesGuard';
import { confirmAction, alertAction } from './ConfirmDialog';
import { diffDrawingDocuments, summarizeCounts, type DrawingDiff } from '@/lib/cad/branch/diff';
import {
  BRANCH_STATUS_CHIP, BRANCH_STATUS_LABELS, parentDriftedSinceFork, type BranchSummary, type BranchStatus,
} from '@/lib/cad/branch/types';

interface Props { onClose: () => void; initialTab?: TabKey }
type TabKey = 'overview' | 'branches' | 'mine' | 'reviews';

interface DrawingRow {
  id: string;
  name: string;
  created_by: string;
  parent_id: string | null;
  branch_status: BranchStatus | null;
  branch_note: string | null;
  forked_from_updated_at: string | null;
  updated_at: string;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

function StatusChip({ status }: { status: BranchStatus | null }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${BRANCH_STATUS_CHIP[status]}`}>
      {BRANCH_STATUS_LABELS[status]}
    </span>
  );
}

export default function BranchDialog({ onClose, initialTab = 'overview' }: Props) {
  const { data: session } = useSession();
  const me = (session?.user?.email ?? '').toLowerCase();

  const docId = useDrawingStore((s) => s.document.id);
  const docName = useDrawingStore((s) => s.document.name);
  const target = useSaveTargetStore((s) => s.target);
  const cloudId = target && target.docId === docId && target.kind === 'cloud' ? target.cloudId : null;

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [current, setCurrent] = useState<DrawingRow | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [myBranches, setMyBranches] = useState<BranchSummary[]>([]);
  const [reviews, setReviews] = useState<BranchSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Current drawing row ────────────────────────────────────────────────
  const refreshCurrent = useCallback(async () => {
    if (!cloudId) { setCurrent(null); return; }
    setLoadingCurrent(true);
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(cloudId)}`);
      if (res.ok) {
        const b = (await res.json()) as { drawing: DrawingRow };
        setCurrent(b.drawing);
      }
    } finally {
      setLoadingCurrent(false);
    }
  }, [cloudId]);

  // The main drawing this dialog's context resolves against.
  const mainId = current ? (current.parent_id ?? current.id) : null;
  const isBranch = !!current?.parent_id;
  const iOwnCurrentMain = !!current && !current.parent_id && current.created_by.toLowerCase() === me;
  const iAuthoredBranch = !!current?.parent_id && current.created_by.toLowerCase() === me;

  const refreshBranches = useCallback(async () => {
    if (!mainId) { setBranches([]); return; }
    setLoadingList(true);
    try {
      const res = await fetch(`/api/admin/cad/drawings?parent_id=${encodeURIComponent(mainId)}`);
      if (res.ok) setBranches(((await res.json()) as { branches: BranchSummary[] }).branches ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [mainId]);

  const refreshReviews = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/cad/drawings?review_inbox=true');
      if (res.ok) setReviews(((await res.json()) as { branches: BranchSummary[] }).branches ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const refreshMine = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/cad/drawings?branches_mine=true');
      if (res.ok) setMyBranches(((await res.json()) as { branches: BranchSummary[] }).branches ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void refreshCurrent(); }, [refreshCurrent]);
  useEffect(() => { if (tab === 'branches') void refreshBranches(); }, [tab, refreshBranches]);
  useEffect(() => { if (tab === 'mine') void refreshMine(); }, [tab, refreshMine]);
  useEffect(() => { if (tab === 'reviews') void refreshReviews(); }, [tab, refreshReviews]);

  // ── Actions ────────────────────────────────────────────────────────────
  const openById = useCallback((id: string) => {
    requestDiscard(() => {
      void openDrawingById(id).then(onClose).catch((e) => alertAction({ title: 'Open failed', message: String(e?.message ?? e) }));
    });
  }, [onClose]);

  async function createBranch() {
    if (!cloudId) return;
    setBusyId('create');
    setError(null);
    try {
      const res = await fetch('/api/admin/cad/drawings/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: cloudId }),
      });
      const b = (await res.json()) as { drawing?: { id: string }; error?: string };
      if (!res.ok || !b.drawing) throw new Error(b.error ?? 'Failed to create branch');
      const newId = b.drawing.id;
      onClose();
      // Open the fresh branch straight away so they can start working.
      requestDiscard(() => void openDrawingById(newId).catch(() => {}));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  async function lifecycle(id: string, action: 'submit' | 'withdraw' | 'accept' | 'reject', note?: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/cad/drawings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note }),
      });
      const b = (await res.json()) as { drawing?: unknown; error?: string };
      if (!res.ok) throw new Error(b.error ?? `Failed to ${action}`);
      await Promise.all([
        refreshCurrent(),
        tab === 'branches' ? refreshBranches() : Promise.resolve(),
        tab === 'mine' ? refreshMine() : Promise.resolve(),
        tab === 'reviews' ? refreshReviews() : Promise.resolve(),
      ]);
      // If we just accepted a branch onto the drawing that's currently open,
      // reload it so the merged geometry appears.
      if (action === 'accept' && current && (current.id === (b.drawing as { parent_id?: string })?.parent_id || mainId === cloudId)) {
        if (cloudId) void openDrawingById(cloudId).catch(() => {});
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  async function submitForReview(id: string) {
    const note = window.prompt('Add a note for the reviewer (optional):', '') ?? undefined;
    await lifecycle(id, 'submit', note?.trim() || undefined);
  }
  async function acceptBranch(b: BranchSummary) {
    const drift = parentDriftedSinceFork(b.forked_from_updated_at, b.parent_updated_at);
    const ok = await confirmAction({
      title: 'Accept this branch?',
      message: drift
        ? 'This will REPLACE the main drawing with this branch. Heads up: the main drawing was edited after this branch was created, so those newer edits will be discarded.'
        : "This will make this branch the main drawing. The author's version becomes the shared drawing everyone opens.",
      confirmLabel: 'Accept & make main',
      danger: drift,
    });
    if (!ok) return;
    await lifecycle(b.id, 'accept');
  }
  async function rejectBranch(b: BranchSummary) {
    const note = window.prompt('Reason for rejecting (optional — the author will see this):', '') ?? undefined;
    await lifecycle(b.id, 'reject', note?.trim() || undefined);
  }

  const cloudPrompt = (
    <div className="p-6 text-center text-sm text-gray-400">
      <GitBranch size={28} className="mx-auto mb-3 text-gray-500" />
      <p className="mb-1 text-gray-300 font-semibold">Save this drawing to the cloud first</p>
      <p className="text-xs mb-4">Branches live in the shared workspace, so the drawing needs a cloud copy before it can be branched or reviewed.</p>
      <button
        onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('cad:openDbDialog', { detail: { mode: 'save' } })); }}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg"
      >
        Save to Cloud…
      </button>
    </div>
  );

  return (
    <ModalFrame open onClose={onClose} title="STARR CAD — Branches & Reviews" initialWidth={640} initialHeight={620} minWidth={520} minHeight={420} storageKey="cad-branch-dialog">
      <div className="flex flex-col h-full text-gray-200">
        {/* Tabs */}
        <div className="flex items-stretch border-b border-gray-700 bg-gray-900/40 text-xs shrink-0">
          {([
            ['overview', 'Overview', <GitBranch key="i" size={13} />],
            ['branches', 'Branches', <GitFork key="i" size={13} />],
            ['mine', 'My branches', <GitBranch key="i" size={13} />],
            ['reviews', 'Reviews', <Inbox key="i" size={13} />],
          ] as [TabKey, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
                tab === key ? 'border-blue-500 text-white bg-gray-800/60' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-xs" role="alert">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* ── OVERVIEW ─────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="p-4 space-y-4">
              {!cloudId ? cloudPrompt : loadingCurrent ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {isBranch ? <GitFork size={15} className="text-blue-400" /> : <GitBranch size={15} className="text-green-400" />}
                      <span className="font-semibold text-sm truncate">{current?.name ?? docName}</span>
                      {isBranch && <StatusChip status={current?.branch_status ?? null} />}
                    </div>
                    <p className="text-xs text-gray-400">
                      {isBranch
                        ? <>Branch by <span className="text-gray-300">{current?.created_by}</span> · forked from the main drawing</>
                        : <>Main drawing · owned by <span className="text-gray-300">{current?.created_by}</span></>}
                    </p>
                  </div>

                  {/* MAIN → offer to branch it */}
                  {!isBranch && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">
                        Want to make changes without touching the shared original? Create a branch — your own copy to work on. When you&apos;re happy, submit it for the owner to accept.
                      </p>
                      <button
                        onClick={createBranch}
                        disabled={busyId === 'create'}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
                      >
                        {busyId === 'create' ? <Loader2 size={15} className="animate-spin" /> : <GitFork size={15} />}
                        Create a branch of this drawing
                      </button>
                    </div>
                  )}

                  {/* BRANCH → submit / withdraw / open main */}
                  {isBranch && (
                    <div className="space-y-3">
                      <ChangeSummary branchId={current!.id} parentId={current!.parent_id!} />
                      <div className="flex flex-wrap gap-2">
                        {iAuthoredBranch && (current?.branch_status === 'draft' || current?.branch_status === 'rejected') && (
                          <button
                            onClick={() => submitForReview(current!.id)}
                            disabled={busyId === current!.id}
                            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
                          >
                            {busyId === current!.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            Submit for review
                          </button>
                        )}
                        {iAuthoredBranch && current?.branch_status === 'in_review' && (
                          <button
                            onClick={() => lifecycle(current!.id, 'withdraw')}
                            disabled={busyId === current!.id}
                            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-sm font-semibold rounded-lg"
                          >
                            <Undo2 size={15} /> Withdraw
                          </button>
                        )}
                        <button
                          onClick={() => mainId && openById(mainId)}
                          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-semibold rounded-lg"
                        >
                          <Eye size={15} /> Open main drawing
                        </button>
                      </div>
                      {current?.branch_status === 'in_review' && (
                        <p className="text-xs text-amber-300/80 flex items-center gap-1.5"><Clock size={12} /> Awaiting the owner&apos;s review.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── BRANCHES ─────────────────────────────────────────────── */}
          {tab === 'branches' && (
            <div className="p-4">
              {!cloudId ? cloudPrompt : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-400">Branches forked from this drawing.</p>
                    <button onClick={refreshBranches} className="text-gray-400 hover:text-gray-200" title="Refresh"><RefreshCw size={13} /></button>
                  </div>
                  {loadingList ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
                  ) : branches.length === 0 ? (
                    <EmptyState icon={<GitFork size={26} />} text="No branches yet. Anyone can create one from the Overview tab." />
                  ) : (
                    <ul className="space-y-2">
                      {branches.map((b) => (
                        <BranchListItem
                          key={b.id} b={b} me={me} canReview={iOwnCurrentMain} busy={busyId === b.id}
                          onOpen={() => openById(b.id)} onAccept={() => acceptBranch(b)} onReject={() => rejectBranch(b)}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── MY BRANCHES ──────────────────────────────────────────── */}
          {tab === 'mine' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">Branches you&apos;ve created — resume a draft or submit it.</p>
                <button onClick={refreshMine} className="text-gray-400 hover:text-gray-200" title="Refresh"><RefreshCw size={13} /></button>
              </div>
              {loadingList ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
              ) : myBranches.length === 0 ? (
                <EmptyState icon={<GitBranch size={26} />} text="You haven't created any branches yet. Open a drawing and use “Create a branch” to start your own copy." />
              ) : (
                <ul className="space-y-2">
                  {myBranches.map((b) => (
                    <BranchListItem
                      key={b.id} b={b} me={me} showParent busy={busyId === b.id}
                      onOpen={() => openById(b.id)}
                      onSubmit={() => submitForReview(b.id)}
                      onAccept={() => acceptBranch(b)} onReject={() => rejectBranch(b)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── REVIEWS ──────────────────────────────────────────────── */}
          {tab === 'reviews' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">Branches submitted to you on drawings you own.</p>
                <button onClick={refreshReviews} className="text-gray-400 hover:text-gray-200" title="Refresh"><RefreshCw size={13} /></button>
              </div>
              {loadingList ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
              ) : reviews.length === 0 ? (
                <EmptyState icon={<Inbox size={26} />} text="Your review inbox is empty. When someone submits a branch of one of your drawings, it shows up here." />
              ) : (
                <ul className="space-y-2">
                  {reviews.map((b) => (
                    <BranchListItem
                      key={b.id} b={b} me={me} canReview showParent busy={busyId === b.id}
                      onOpen={() => openById(b.id)} onAccept={() => acceptBranch(b)} onReject={() => rejectBranch(b)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center text-center text-gray-500 py-10 px-6">
      <div className="mb-3 opacity-60">{icon}</div>
      <p className="text-xs max-w-xs">{text}</p>
    </div>
  );
}

function BranchListItem({
  b, me, canReview, showParent, busy, onOpen, onAccept, onReject, onSubmit,
}: {
  b: BranchSummary; me: string; canReview?: boolean; showParent?: boolean; busy?: boolean;
  onOpen: () => void; onAccept: () => void; onReject: () => void; onSubmit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const drift = parentDriftedSinceFork(b.forked_from_updated_at, b.parent_updated_at);
  const inReview = b.branch_status === 'in_review';
  const canSubmit = !!onSubmit && b.created_by.toLowerCase() === me && (b.branch_status === 'draft' || b.branch_status === 'rejected');
  return (
    <li className="rounded-lg border border-gray-700 bg-gray-800/50">
      <div className="flex items-start gap-2 p-3">
        <button onClick={() => setExpanded((v) => !v)} className="mt-0.5 text-gray-500 hover:text-gray-300" title="Change summary">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{b.name}</span>
            <StatusChip status={b.branch_status} />
            {b.created_by.toLowerCase() === me && <span className="text-[10px] text-gray-500">(yours)</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {showParent && b.parent_name && <>on <span className="text-gray-300">{b.parent_name}</span> · </>}
            by <span className="text-gray-300">{b.created_by}</span> · updated {timeAgo(b.updated_at)}
          </p>
          {b.branch_note && <p className="text-xs text-gray-400 mt-1 italic">“{b.branch_note}”</p>}
          {drift && inReview && (
            <p className="text-[11px] text-amber-300 mt-1 flex items-center gap-1"><AlertTriangle size={11} /> Main drawing changed after this branch was created.</p>
          )}
          {expanded && <ChangeSummary branchId={b.id} parentId={b.parent_id ?? ''} inline />}
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 pb-3 pl-9">
        <button onClick={onOpen} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-100"><Eye size={12} /> Open</button>
        {canSubmit && (
          <button onClick={onSubmit} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit
          </button>
        )}
        {canReview && inReview && (
          <>
            <button onClick={onAccept} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded text-white">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept
            </button>
            <button onClick={onReject} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded text-white"><X size={12} /> Reject</button>
          </>
        )}
      </div>
    </li>
  );
}

/** Lazily fetches the branch + parent documents and shows an add/change/remove
 *  summary. Used both in the Overview branch context and per-branch rows. */
function ChangeSummary({ branchId, parentId, inline }: { branchId: string; parentId: string; inline?: boolean }) {
  const [diff, setDiff] = useState<DrawingDiff | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const [branch, parent] = await Promise.all([fetchDrawingDocument(branchId), parentId ? fetchDrawingDocument(parentId) : Promise.resolve(null)]);
        if (!alive) return;
        if (!branch) { setState('error'); return; }
        setDiff(diffDrawingDocuments(parent?.document ?? null, branch.document));
        setState('idle');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [branchId, parentId]);

  const wrap = inline ? 'mt-2' : 'rounded-lg border border-gray-700 bg-gray-800/50 p-3';
  if (state === 'loading') return <div className={`${wrap} text-xs text-gray-500 flex items-center gap-1.5`}><Loader2 size={12} className="animate-spin" /> Comparing to main…</div>;
  if (state === 'error' || !diff) return <div className={`${wrap} text-xs text-gray-500`}>Couldn&apos;t compute the change summary.</div>;

  return (
    <div className={wrap}>
      {!inline && <p className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5"><GitPullRequest size={12} /> Changes vs the main drawing</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-300">Features: <span className="text-gray-400">{summarizeCounts(diff.featuresAdded.length, diff.featuresModified.length, diff.featuresRemoved.length)}</span></span>
        <span className="text-gray-300">Layers: <span className="text-gray-400">{summarizeCounts(diff.layersAdded.length, diff.layersModified.length, diff.layersRemoved.length)}</span></span>
      </div>
      {!diff.hasChanges && <p className="text-[11px] text-gray-500 mt-1">Identical to the main drawing.</p>}
    </div>
  );
}
