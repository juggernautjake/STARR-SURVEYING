'use client';
// EditFlow — the guided "edit this version" dialog (unified edit/build flow). Opened from a version's Edit
// button. It walks the owner's decision tree with big, clear, described choices:
//   Edit directly ─────────────────────────────► begin a working draft (save-time: this version / new variant)
//   Transpose to another system ─► AI build ─► Vanilla  (match with system content)
//                                │            └ Homebrew (balanced invented content to match)
//                                └ From scratch ─────► the target-system builder
// Transpose always lands as a NEW variant (the source version stays put).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export interface EditFlowSystem { id: string; label: string }

/** The `/system` transpose response, as far as the report cares about it. */
export interface TransposeResult {
  system: string;
  summary?: string | null;
  hp?: number;
  /** Every element the AI INVENTED because the target system had no vanilla equivalent. */
  custom?: { type: string; name: string; note?: string }[];
  /** Rule-legality issues the safety net caught on the built sheet. */
  violations?: { field: string; severity: string; message: string }[];
}

/**
 * What the AI built on a transpose — the summary, the HP it landed on, every element it INVENTED, and any
 * rules issues. Its own component so it can be rendered (and tested) without driving a real AI build.
 *
 * The custom list is the reason this exists: the house rule is that homebrew is flagged, not hidden, and a
 * flag that scrolls past in a page reload was never shown at all.
 */
export function TransposeReport({ result, onOpen }: { result: TransposeResult; onOpen: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {result.summary && (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--hx-text)', whiteSpace: 'pre-wrap' }}>{result.summary}</p>
      )}
      {typeof result.hp === 'number' && (
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Built at <strong style={{ color: 'var(--hx-text)' }}>{result.hp} HP</strong> for the character’s level.</span>
      )}
      {result.custom && result.custom.length > 0 && (
        <div style={{ border: '1px solid var(--hx-gold-1)', borderRadius: 8, background: 'rgba(212,175,55,0.07)', padding: '9px 11px', display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 11.5, color: 'var(--hx-gold-2)', letterSpacing: '0.04em' }}>
            ✦ {result.custom.length} custom {result.custom.length === 1 ? 'element' : 'elements'} created — not vanilla to this system
          </strong>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
            {result.custom.map((c, i) => (
              <li key={i} style={{ fontSize: 11.5, color: 'var(--hx-text)', lineHeight: 1.45 }}>
                <span style={{ fontSize: 9, color: 'var(--hx-gold-2)', border: '1px solid currentColor', borderRadius: 3, padding: '0 4px', marginRight: 5, textTransform: 'uppercase' }}>{c.type}</span>
                <strong>{c.name}</strong>
                {c.note && <span style={{ color: 'var(--hx-muted)' }}> — {c.note}</span>}
              </li>
            ))}
          </ul>
          <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>These are flagged as customized on the sheet for DM review.</span>
        </div>
      )}
      {result.violations && result.violations.length > 0 && (
        <div style={{ border: '1px solid var(--hx-danger)', borderRadius: 8, background: 'rgba(198,64,59,0.08)', padding: '9px 11px', display: 'grid', gap: 5 }}>
          <strong style={{ fontSize: 11.5, color: 'var(--hx-danger)' }}>⚠ {result.violations.length} rules {result.violations.length === 1 ? 'issue' : 'issues'} to review</strong>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {result.violations.map((v, i) => (
              <li key={i} style={{ fontSize: 11.5, color: v.severity === 'error' ? 'var(--hx-danger)' : 'var(--hx-muted)', lineHeight: 1.45 }}>
                <span style={{ fontSize: 9, textTransform: 'uppercase', marginRight: 5, opacity: 0.8 }}>{v.severity}</span>{v.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={onOpen} style={{
        marginTop: 2, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--hx-font-display)',
        border: '1px solid var(--hx-gold-2, #c8aa6e)', background: 'rgba(200,170,110,0.16)', color: 'var(--hx-gold-2, #c8aa6e)', fontSize: 13,
      }}>Open the new version →</button>
    </div>
  );
}

export default function EditFlow({
  characterId, slotId, name, system, systems, aiConfigured = true, onClose,
}: {
  characterId: string;
  /** The version being edited (source). */
  slotId: string;
  name: string;
  system: string;
  /** Systems available to transpose into (excludes the current one). */
  systems: EditFlowSystem[];
  aiConfigured?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  type Step = 'root' | 'system' | 'how' | 'ai-kind' | 'result';
  const [step, setStep] = useState<Step>('root');
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** What the AI actually built (consolidation: this report used to exist only in SystemSwitcher). Reloading
   *  straight past it threw away the two things that matter most on a transpose — WHICH pieces are homebrew
   *  rather than vanilla, and any rules issues to review. A flag that never gets shown isn't a flag. */
  const [result, setResult] = useState<TransposeResult | null>(null);

  async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr((j as { error?: string }).error ?? 'Something went wrong.'); setBusy(false); return null; }
      return j as Record<string, unknown>;
    } catch { setErr('Network error — please try again.'); setBusy(false); return null; }
  }

  async function editDirectly() {
    const j = await post(`/api/dnd/characters/${characterId}/variants`, { action: 'begin-draft', fromSlotId: slotId });
    if (j) window.location.reload(); // lands in draft edit mode (Save banner appears)
  }
  async function transposeAI(allowCustom: boolean) {
    const j = await post(`/api/dnd/characters/${characterId}/system`, { action: 'transpose', system: target, allowCustom });
    if (!j) return;
    // The new variant IS saved and active at this point — we hold the dialog open on the report rather than
    // reloading, so what the AI built (and invented) is read before the page changes under the user.
    setBusy(false);
    setResult({
      system: target,
      summary: (j.summary as string | null) ?? null,
      hp: typeof j.hp === 'number' ? j.hp : undefined,
      custom: Array.isArray(j.custom) ? j.custom as TransposeResult['custom'] : [],
      violations: Array.isArray(j.violations) ? j.violations as TransposeResult['violations'] : [],
    });
    setStep('result');
  }
  async function fromScratch() {
    const add = await post(`/api/dnd/characters/${characterId}/system`, { action: 'add', system: target });
    if (!add) return;
    const slot = (add as { slotId?: string }).slotId;
    if (slot) { const sw = await post(`/api/dnd/characters/${characterId}/system`, { slotId: slot }); if (!sw) return; }
    router.push(`/dnd/characters/${characterId}/builder`);
  }

  // Dismissing the report still has to reload: by then the new variant is saved AND active, so the page
  // behind the dialog is showing a version that is no longer the live one.
  const closeFlow = () => { if (result) window.location.reload(); else onClose(); };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  // The frame does NOT scroll: .framedPanel draws its gold corners at -1px, so `overflow-y: auto` on the
  // frame itself always overflows by that 1px and shows a scrollbar even on a short step. The frame stays
  // visible-overflow and an inner wrapper does the scrolling, so the bar appears only when it's needed.
  const panel: React.CSSProperties = { width: 'min(560px, 96vw)', maxHeight: '90vh', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' };
  const scroller: React.CSSProperties = { overflowY: 'auto', overflowX: 'hidden', minHeight: 0 };

  const choice = (opts: { title: string; desc: string; onClick: () => void; icon: string; primary?: boolean; disabled?: boolean; hint?: string }) => (
    <button type="button" disabled={busy || opts.disabled} onClick={opts.onClick} style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'start', textAlign: 'left', width: '100%', boxSizing: 'border-box',
      padding: '13px 15px', borderRadius: 10, cursor: busy || opts.disabled ? 'default' : 'pointer',
      border: `1px solid ${opts.primary ? 'var(--hx-gold-2, #c8aa6e)' : 'var(--hx-line, rgba(255,255,255,0.14))'}`,
      background: opts.primary ? 'rgba(200,170,110,0.10)' : 'rgba(255,255,255,0.03)',
      opacity: busy || opts.disabled ? 0.55 : 1, transition: 'border-color .12s, background .12s',
    }}>
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{opts.icon}</span>
      <span style={{ display: 'grid', gap: 3 }}>
        <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 14.5, color: opts.primary ? 'var(--hx-gold-2)' : 'var(--hx-text)', letterSpacing: '0.01em' }}>{opts.title}</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{opts.desc}</span>
        {opts.hint && <span style={{ fontSize: 10.5, color: 'var(--hx-teal-1)' }}>{opts.hint}</span>}
      </span>
    </button>
  );

  const header = (title: string, sub?: string) => (
    <div style={{ display: 'grid', gap: 3, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 16, color: 'var(--hx-gold-2)', letterSpacing: '0.04em' }}>{title}</span>
        <button type="button" onClick={closeFlow} aria-label="Close" style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer' }}>✕</button>
      </div>
      {sub && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{sub}</span>}
    </div>
  );

  const back = (to: Step) => <button type="button" onClick={() => { setStep(to); setErr(null); }} disabled={busy} style={{ marginTop: 12, fontSize: 12, background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer' }}>← Back</button>;

  return (
    <div style={overlay} onClick={closeFlow}>
      <div className={styles.framedPanel} style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={scroller}>
        {step === 'root' && (<>
          {header(`Edit ${name}`, 'Edit this version, or reimagine it in another game system. You choose whether to overwrite this version or branch a new one when you save.')}
          <div style={{ display: 'grid', gap: 10 }}>
            {choice({ icon: '✎', title: `Edit ${name} directly`, desc: 'Open the editor on a working copy. When you save, keep it on this version or branch a new variant.', onClick: editDirectly, primary: true })}
            {choice({ icon: '⇄', title: 'Transpose to another system', desc: 'Rebuild this character in a different game system. Always saved as a new variant — this version stays as it is.', onClick: () => setStep('system'), disabled: systems.length === 0, hint: systems.length === 0 ? 'No other systems available' : undefined })}
          </div>
        </>)}

        {step === 'system' && (<>
          {header('Transpose to…', `Pick the game system to rebuild ${name} in.`)}
          <div style={{ display: 'grid', gap: 8 }}>
            {systems.map((s) => choice({ icon: '◆', title: s.label, desc: `Rebuild ${name} using ${s.label}'s rules.`, onClick: () => { setTarget(s.id); setStep('how'); } }))}
          </div>
          {back('root')}
        </>)}

        {step === 'how' && (<>
          {header('How should we build it?', `Building the ${systems.find((s) => s.id === target)?.label ?? 'new'} version of ${name}.`)}
          <div style={{ display: 'grid', gap: 10 }}>
            {choice({ icon: '✨', title: 'Let AI build it', desc: 'The AI rebuilds the character in the new system, matching the original as closely as it can.', onClick: () => setStep('ai-kind'), primary: true, disabled: !aiConfigured, hint: !aiConfigured ? 'AI is not configured' : undefined })}
            {choice({ icon: '🛠', title: 'Build it from scratch', desc: 'Open the new system’s builder and make every choice yourself.', onClick: fromScratch })}
          </div>
          {back('system')}
        </>)}

        {step === 'ai-kind' && (<>
          {header('Vanilla or homebrew?', 'How faithful vs. how creative should the AI be?')}
          <div style={{ display: 'grid', gap: 10 }}>
            {choice({ icon: '📖', title: 'Use vanilla system content', desc: 'Match the original as closely as possible using only official content from the system library.', onClick: () => transposeAI(false), primary: true })}
            {choice({ icon: '⚗️', title: 'Let AI homebrew to match', desc: 'Invent balanced feats, abilities and stats where needed to capture the original — never too weak or too strong.', onClick: () => transposeAI(true) })}
          </div>
          {back('how')}
        </>)}

        {step === 'result' && result && (<>
          {header(`Built in ${systems.find((s) => s.id === result.system)?.label ?? 'the new system'}`, `${name} now has a new version in this system. Your other versions are untouched.`)}
          <TransposeReport result={result} onOpen={() => window.location.reload()} />
        </>)}

        {/* A transpose is a full AI rebuild, so it says what is happening and that nothing is being lost —
            "Working…" on a 20-second wait reads like the app hung. */}
        {busy && (step === 'ai-kind' ? (
          <div style={{ margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={styles.spinner} aria-hidden />
            <span style={{ fontSize: 12, color: 'var(--hx-teal-1)', lineHeight: 1.45 }}>
              Rebuilding {name} in {systems.find((s) => s.id === target)?.label ?? 'the new system'}…
              <span style={{ color: 'var(--hx-muted)' }}> This takes a few seconds. Your other versions are kept.</span>
            </span>
          </div>
        ) : (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--hx-teal-1)' }}>Working… this can take a few seconds.</p>
        ))}
        {err && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}
