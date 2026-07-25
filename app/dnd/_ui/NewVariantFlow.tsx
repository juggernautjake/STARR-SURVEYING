'use client';
// NewVariantFlow — the guided "create a variant" dialog. Replaces the old "+ Variant" button, which forked
// immediately and silently: one click produced an unnamed, byte-identical copy, and the only way to find out
// what it was for was to open it.
//
// Nothing is written until the final step. The wizard asks WHAT KIND of variant this is first, because the
// answer decides which route runs — a copy is a fork, a transpose is an AI rebuild in another system, a level
// variant is an AI rebuild at a different level — and then requires a NAME, so every version on the shelf
// says what it is.
//
//   Exact copy ──────────────► fork (tagged "Duplicate of …" until it diverges)
//   Edit in this system ─────► fork, then straight into the editor
//   Another system ──────────► AI vanilla / AI homebrew / build from scratch
//   Different level ─────────► AI rebuild of the same character at level N (either direction)
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { TransposeReport, type EditFlowSystem, type TransposeResult } from './EditFlow';

/** What the new variant is FOR. Chosen first — it decides every later step. */
type Purpose = 'copy' | 'edit' | 'system' | 'level';

export default function NewVariantFlow({
  characterId, sourceSlotId, sourceName, sourceSystem, sourceLevel, systems, aiConfigured = true,
  allowCustom = true, onClose,
}: {
  characterId: string;
  /** The version being branched FROM. */
  sourceSlotId: string;
  sourceName: string;
  sourceSystem: string;
  sourceLevel: number;
  /** Systems this variant could be built in (the source's own is filtered out by the caller). */
  systems: EditFlowSystem[];
  aiConfigured?: boolean;
  /** False in a vanilla-only campaign — the AI-homebrew choices are then withheld. */
  allowCustom?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  type Step = 'purpose' | 'name' | 'system' | 'how' | 'ai-kind' | 'level' | 'result';
  const [step, setStep] = useState<Step>('purpose');
  const [purpose, setPurpose] = useState<Purpose>('copy');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [level, setLevel] = useState<number>(sourceLevel || 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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

  const trimmed = name.trim();

  /** Copy / edit-here: a plain fork of the source, named. */
  async function createFork() {
    const j = await post(`/api/dnd/characters/${characterId}/variants`, { action: 'fork', fromSlotId: sourceSlotId, name: trimmed });
    if (j) window.location.reload(); // the fork is now active — land on it (in the editor, for 'edit')
  }

  /** Another system, built by the AI. */
  async function createTranspose(useCustom: boolean) {
    const j = await post(`/api/dnd/characters/${characterId}/system`, { action: 'transpose', system: target, allowCustom: useCustom, name: trimmed });
    if (!j) return;
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

  /** Another system, built by hand: park a blank sheet, switch to it, open the builder. */
  async function createFromScratch() {
    const add = await post(`/api/dnd/characters/${characterId}/system`, { action: 'add', system: target, name: trimmed });
    if (!add) return;
    const slot = (add as { slotId?: string }).slotId;
    if (slot) { const sw = await post(`/api/dnd/characters/${characterId}/system`, { slotId: slot }); if (!sw) return; }
    router.push(`/dnd/characters/${characterId}/builder`);
  }

  /** The same character at a different level — an AI rebuild, in either direction. */
  async function createAtLevel(useCustom: boolean) {
    const j = await post(`/api/dnd/characters/${characterId}/system`, {
      action: 'transpose', system: sourceSystem, allowCustom: useCustom, name: trimmed, targetLevel: level,
    });
    if (!j) return;
    setBusy(false);
    setResult({
      system: sourceSystem,
      summary: (j.summary as string | null) ?? null,
      hp: typeof j.hp === 'number' ? j.hp : undefined,
      custom: Array.isArray(j.custom) ? j.custom as TransposeResult['custom'] : [],
      violations: Array.isArray(j.violations) ? j.violations as TransposeResult['violations'] : [],
    });
    setStep('result');
  }

  /** Where the Next button on the name step goes — the purpose decides the rest of the walk. */
  function afterName() {
    if (purpose === 'copy' || purpose === 'edit') { void createFork(); return; }
    setStep(purpose === 'system' ? 'system' : 'level');
  }

  const closeFlow = () => { if (result) window.location.reload(); else onClose(); };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const panel: React.CSSProperties = { width: 'min(560px, 96vw)', maxHeight: '90vh', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' };
  const scroller: React.CSSProperties = { overflowY: 'auto', overflowX: 'hidden', minHeight: 0 };

  const choice = (opts: { title: string; desc: string; onClick: () => void; icon: string; primary?: boolean; disabled?: boolean; hint?: string }) => (
    <button type="button" disabled={busy || opts.disabled} onClick={opts.onClick} style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'start', textAlign: 'left', width: '100%', boxSizing: 'border-box',
      padding: '13px 15px', borderRadius: 10, cursor: busy || opts.disabled ? 'default' : 'pointer',
      border: `1px solid ${opts.primary ? 'var(--hx-gold-2, #c8aa6e)' : 'var(--hx-line, rgba(255,255,255,0.14))'}`,
      background: opts.primary ? 'rgba(200,170,110,0.10)' : 'rgba(255,255,255,0.03)',
      opacity: busy || opts.disabled ? 0.55 : 1,
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

  const pick = (p: Purpose, suggested: string) => { setPurpose(p); setName(suggested); setStep('name'); };

  return (
    <div style={overlay} onClick={closeFlow}>
      <div className={styles.framedPanel} style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={scroller}>
          {step === 'purpose' && (<>
            {header(`New version of ${sourceName}`, 'What is this version for? Nothing is saved until you confirm.')}
            <div style={{ display: 'grid', gap: 10 }}>
              {choice({ icon: '✎', title: 'A version to edit, in this system', desc: `Branch ${sourceName} and open it for editing. The same rules, your changes.`, onClick: () => pick('edit', `${sourceName} (edit)`), primary: true })}
              {choice({ icon: '⧉', title: 'An exact copy', desc: 'A snapshot of this version exactly as it is — a safety copy before big changes. It is tagged as a duplicate until you change something.', onClick: () => pick('copy', `${sourceName} (copy)`) })}
              {choice({ icon: '⇄', title: 'A version in another system', desc: 'Rebuild this character under a different game system — AI-built or from scratch.', onClick: () => pick('system', sourceName), disabled: systems.length === 0, hint: systems.length === 0 ? 'No other systems available' : undefined })}
              {choice({ icon: '⇡', title: 'The same character at a different level', desc: 'Rebuild this character as they were — or will be — at another level. Works in both directions.', onClick: () => pick('level', `${sourceName} (Lv ?)`), disabled: !aiConfigured, hint: !aiConfigured ? 'AI is not configured' : undefined })}
            </div>
          </>)}

          {step === 'name' && (<>
            {header('Name this version', 'Every version shows its name on the shelf — so give it one that says what it is.')}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>Version name</span>
              <input
                autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) afterName(); }}
                placeholder="e.g. Neon Odyssey build, or Lv 1 origin story"
                style={{ fontSize: 13.5, padding: '9px 11px', borderRadius: 8, background: 'rgba(1,10,19,0.7)', border: '1px solid var(--hx-line, rgba(255,255,255,0.14))', color: 'var(--hx-text, #e8e0cf)' }}
              />
            </label>
            <button type="button" disabled={!trimmed || busy} onClick={afterName} style={{
              marginTop: 14, padding: '9px 16px', borderRadius: 8, cursor: !trimmed || busy ? 'default' : 'pointer',
              fontFamily: 'var(--hx-font-display)', fontSize: 13,
              border: '1px solid var(--hx-gold-2, #c8aa6e)', background: 'rgba(200,170,110,0.16)',
              color: 'var(--hx-gold-2, #c8aa6e)', opacity: !trimmed || busy ? 0.5 : 1,
            }}>{purpose === 'copy' || purpose === 'edit' ? (busy ? 'Creating…' : 'Create this version') : 'Next →'}</button>
            {!trimmed && <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>A name is required.</p>}
            {back('purpose')}
          </>)}

          {step === 'system' && (<>
            {header('Which system?', `Rebuild ${sourceName} under another game system.`)}
            <div style={{ display: 'grid', gap: 8 }}>
              {systems.map((s) => choice({ icon: '◆', title: s.label, desc: `Rebuild ${sourceName} using ${s.label}'s rules.`, onClick: () => { setTarget(s.id); setStep('how'); } }))}
            </div>
            {back('name')}
          </>)}

          {step === 'how' && (<>
            {header('How should we build it?', `Building the ${systems.find((s) => s.id === target)?.label ?? 'new'} version.`)}
            <div style={{ display: 'grid', gap: 10 }}>
              {choice({ icon: '✨', title: 'Let AI build it', desc: 'The AI rebuilds the character in the new system, matching the original as closely as it can.', onClick: () => setStep('ai-kind'), primary: true, disabled: !aiConfigured, hint: !aiConfigured ? 'AI is not configured' : undefined })}
              {choice({ icon: '🛠', title: 'Build it from scratch', desc: 'Open the new system’s builder and make every choice yourself.', onClick: createFromScratch })}
            </div>
            {back('system')}
          </>)}

          {step === 'ai-kind' && (<>
            {header('Vanilla or homebrew?', 'How faithful vs. how creative should the AI be?')}
            <div style={{ display: 'grid', gap: 10 }}>
              {choice({ icon: '📖', title: 'Use vanilla system content', desc: 'Match the original as closely as possible using only official content.', onClick: () => createTranspose(false), primary: true })}
              {choice({ icon: '⚗️', title: 'Let AI homebrew to match', desc: 'Invent balanced content where needed to capture the original — each piece is flagged.', onClick: () => createTranspose(true), disabled: !allowCustom, hint: !allowCustom ? 'This campaign is vanilla-only' : undefined })}
            </div>
            {back('how')}
          </>)}

          {step === 'level' && (<>
            {header('Which level?', `${sourceName} is level ${sourceLevel || '?'}. The AI rebuilds them at the level you pick — adding what they'd have gained, or leaving out what they hadn't yet earned.`)}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>Target level (1–20)</span>
              <input
                type="number" min={1} max={20} value={level}
                onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                style={{ fontSize: 13.5, padding: '9px 11px', borderRadius: 8, background: 'rgba(1,10,19,0.7)', border: '1px solid var(--hx-line, rgba(255,255,255,0.14))', color: 'var(--hx-text, #e8e0cf)', width: 120 }}
              />
            </label>
            {level === sourceLevel && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>
                That’s the level this version already is — pick a different one, or go back and make an exact copy instead.
              </p>
            )}
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {choice({ icon: '📖', title: 'Vanilla only', desc: `Build the level-${level} version using only official content.`, onClick: () => createAtLevel(false), primary: true, disabled: level === sourceLevel })}
              {choice({ icon: '⚗️', title: 'Allow balanced homebrew', desc: 'Invent balanced content where no official option fits — each piece is flagged.', onClick: () => createAtLevel(true), disabled: level === sourceLevel || !allowCustom, hint: !allowCustom ? 'This campaign is vanilla-only' : undefined })}
            </div>
            {back('name')}
          </>)}

          {step === 'result' && result && (<>
            {header(`Created “${trimmed}”`, `${sourceName} now has a new version. The version you branched from is untouched.`)}
            <TransposeReport result={result} onOpen={() => window.location.reload()} openLabel="Open the new version →" />
          </>)}

          {busy && (step === 'ai-kind' || step === 'level' ? (
            <div style={{ margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={styles.spinner} aria-hidden />
              <span style={{ fontSize: 12, color: 'var(--hx-teal-1)', lineHeight: 1.45 }}>
                Building {trimmed}…<span style={{ color: 'var(--hx-muted)' }}> This takes a few seconds. Your other versions are kept.</span>
              </span>
            </div>
          ) : (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--hx-teal-1)' }}>Working…</p>
          ))}
          {err && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}
