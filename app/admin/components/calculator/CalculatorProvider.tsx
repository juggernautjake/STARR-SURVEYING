// app/admin/components/calculator/CalculatorProvider.tsx
//
// Context + provider for the approved-exam-calculator modal.
// C-3 of EXAM_CALCULATORS.md.
//
// Anything in the admin app can call `useCalculator().openCalculator(...)`
// to surface the modal, switch tabs, or close it. The provider keeps a
// single instance mounted at the layout level so the modal's internal
// state (display buffer, stack, etc.) survives navigation between pages.
//
// Phase 1 placeholder: tabs render but the body shows a "Coming in
// Phase N" stub. Each per-model slice (C-6..C-21) replaces the stub
// with the real keypad + display.

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalculatorModal } from './CalculatorModal';
import { Ti36xPro } from './models/Ti36xPro';
import { Ti30xsMultiView } from './models/Ti30xsMultiView';
import { Ti30xa } from './models/Ti30xa';
import { CasioFx991 } from './models/CasioFx991';
import { CasioFx115 } from './models/CasioFx115';
import { Hp35s } from './models/Hp35s';
import { Hp33s } from './models/Hp33s';

export type ModelKey =
  | 'ti-36x-pro'
  | 'ti-30xs-multiview'
  | 'ti-30xa'
  | 'casio-fx-991'
  | 'casio-fx-115'
  | 'hp-35s'
  | 'hp-33s';

export interface ModelDef {
  key: ModelKey;
  brand: 'TI' | 'Casio' | 'HP';
  label: string;
  /** Default modal dimensions per device. Real keypads have a natural ratio. */
  width: number;
  height: number;
  /** Phase that lands this model's working keypad (so the placeholder can hint). */
  phase: number;
}

export const CALCULATOR_MODELS: ModelDef[] = [
  // Widths bumped per user feedback — earlier widths cramped the keys.
  // Heights also bumped a touch to keep the keypad aspect-ratio sane.
  // Phase 2: representative algebraic.
  { key: 'ti-36x-pro',        brand: 'TI',    label: 'TI-36X Pro',          width: 380, height: 580, phase: 2 },
  // Phase 3: natural display.
  { key: 'casio-fx-991',      brand: 'Casio', label: 'Casio fx-991ES PLUS', width: 400, height: 600, phase: 3 },
  // Phase 4: RPN.
  { key: 'hp-35s',            brand: 'HP',    label: 'HP 35s',              width: 360, height: 620, phase: 4 },
  // Phase 5: siblings (re-skins).
  { key: 'casio-fx-115',      brand: 'Casio', label: 'Casio fx-115ES PLUS', width: 400, height: 600, phase: 5 },
  { key: 'hp-33s',            brand: 'HP',    label: 'HP 33s',              width: 360, height: 620, phase: 5 },
  { key: 'ti-30xs-multiview', brand: 'TI',    label: 'TI-30XS MultiView',   width: 380, height: 580, phase: 5 },
  // Post-plan addition (user-requested): TI-30Xa, the original single-line
  // TI-30X. Approved by NCEES under the "TI-30X" model-name rule.
  { key: 'ti-30xa',           brand: 'TI',    label: 'TI-30Xa',             width: 360, height: 560, phase: 5 },
];

const LAST_MODEL_STORAGE_KEY = 'calculatorLastModel';
const DEFAULT_MODEL: ModelKey = 'ti-36x-pro';

interface CalculatorCtx {
  isOpen: boolean;
  currentModel: ModelKey;
  openCalculator: (model?: ModelKey) => void;
  closeCalculator: () => void;
  setCurrentModel: (model: ModelKey) => void;
  /** Per-model engines call this with their JSON-serializable state. The
   *  provider debounces writes to /api/admin/calculator-state. */
  saveState: (model: ModelKey, state: unknown) => void;
  /** Per-model engines call this on mount to hydrate from the server.
   *  Resolves to null if no row exists yet. */
  loadState: (model: ModelKey) => Promise<unknown | null>;
  /** Wipe saved state for a model (called by the modal's ↻ button). */
  clearState: (model: ModelKey) => Promise<void>;
}

const Ctx = createContext<CalculatorCtx | null>(null);

export function useCalculator(): CalculatorCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCalculator must be used inside <CalculatorProvider>');
  return value;
}

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentModel, setCurrentModelState] = useState<ModelKey>(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL;
    const stored = window.localStorage.getItem(LAST_MODEL_STORAGE_KEY) as ModelKey | null;
    if (stored && CALCULATOR_MODELS.some(m => m.key === stored)) return stored;
    return DEFAULT_MODEL;
  });

  const setCurrentModel = useCallback((model: ModelKey) => {
    setCurrentModelState(model);
    try { window.localStorage.setItem(LAST_MODEL_STORAGE_KEY, model); } catch { /* ignore quota */ }
  }, []);

  const openCalculator = useCallback((model?: ModelKey) => {
    if (model) setCurrentModel(model);
    setIsOpen(true);
  }, [setCurrentModel]);

  const closeCalculator = useCallback(() => {
    // Flush any pending debounced save before hiding.
    void flushPendingSave();
    setIsOpen(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced state save (C-5) ────────────────────────────────────────────
  // Engines call ctx.saveState(model, state) freely; we coalesce calls per
  // model and PUT after 5s of quiet (or immediately on flush — modal close,
  // tab switch, beforeunload).
  const pendingRef = useRef(new Map<ModelKey, unknown>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingSave = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (pendingRef.current.size === 0) return;
    const entries = Array.from(pendingRef.current.entries());
    pendingRef.current = new Map();
    await Promise.all(entries.map(async ([model, state]) => {
      try {
        await fetch('/api/admin/calculator-state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, state }),
        });
      } catch { /* network blip — engine will retry next save */ }
    }));
  }, []);

  const saveState = useCallback((model: ModelKey, state: unknown) => {
    pendingRef.current.set(model, state);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flushPendingSave(); }, 5000);
  }, [flushPendingSave]);

  const loadState = useCallback(async (model: ModelKey): Promise<unknown | null> => {
    try {
      const res = await fetch(`/api/admin/calculator-state?model=${encodeURIComponent(model)}`);
      if (!res.ok) return null;
      const data = await res.json() as { state: unknown | null };
      return data.state;
    } catch { return null; }
  }, []);

  const clearState = useCallback(async (model: ModelKey): Promise<void> => {
    pendingRef.current.delete(model);
    try {
      await fetch(`/api/admin/calculator-state?model=${encodeURIComponent(model)}`, {
        method: 'DELETE',
      });
    } catch { /* ignore */ }
  }, []);

  // Flush on tab switch — the activeModel may be unmounting.
  useEffect(() => { void flushPendingSave(); }, [currentModel, flushPendingSave]);

  // Flush on tab close / navigation.
  useEffect(() => {
    function onBeforeUnload() {
      // Synchronous best-effort: fire-and-forget; modern beforeunload doesn't
      // wait for async work anyway.
      void flushPendingSave();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushPendingSave]);

  // ── Keyboard accelerators (C-24) ──────────────────────────────────────────
  // While the modal is open, common physical keys map to canonical key ids
  // that every model recognizes (n0..n9, dot, add/sub/mul/div, eq, del,
  // enter). Tab navigation (←/→) stays here in the provider. The model
  // wrappers each subscribe to a `calculator:key` CustomEvent on window
  // — see useCalculatorKeyEvents() in CalculatorKeyboard.tsx.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept typing in an input/textarea — the user is filling
      // a quiz field, not driving the calculator.
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return;
      }
      // Tab navigation (alt-arrow so we don't fight inline text editing).
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const idx = CALCULATOR_MODELS.findIndex(m => m.key === currentModel);
        const next = e.key === 'ArrowLeft'
          ? (idx - 1 + CALCULATOR_MODELS.length) % CALCULATOR_MODELS.length
          : (idx + 1) % CALCULATOR_MODELS.length;
        setCurrentModel(CALCULATOR_MODELS[next].key);
        e.preventDefault();
        return;
      }
      const id = mapKey(e.key);
      if (!id) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('calculator:key', { detail: { keyId: id } }));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, currentModel, setCurrentModel]);

  const ctxValue = useMemo<CalculatorCtx>(() => ({
    isOpen, currentModel, openCalculator, closeCalculator, setCurrentModel,
    saveState, loadState, clearState,
  }), [isOpen, currentModel, openCalculator, closeCalculator, setCurrentModel, saveState, loadState, clearState]);

  const activeModel = CALCULATOR_MODELS.find(m => m.key === currentModel) ?? CALCULATOR_MODELS[0];

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      <CalculatorModal
        open={isOpen}
        title={activeModel.label}
        width={activeModel.width}
        height={activeModel.height}
        onClose={closeCalculator}
        onClearState={() => {
          if (window.confirm(`Clear saved state for ${activeModel.label}? This wipes the display, memory, and history for this calculator.`)) {
            void clearState(activeModel.key);
          }
        }}
        toolbar={
          <div className="calc-tabstrip" role="tablist" aria-label="Approved calculators">
            {CALCULATOR_MODELS.map(m => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={m.key === currentModel}
                className={`calc-tabstrip__tab ${m.key === currentModel ? 'calc-tabstrip__tab--active' : ''}`}
                onClick={() => setCurrentModel(m.key)}
                title={m.label}
              >
                <span className="calc-tabstrip__brand">{m.brand}</span>
                <span className="calc-tabstrip__label">{m.label}</span>
              </button>
            ))}
          </div>
        }
      >
        {renderModel(activeModel)}
      </CalculatorModal>
    </Ctx.Provider>
  );
}

// Map a physical keyboard event to a canonical keypad-data id.
function mapKey(key: string): string | null {
  if (/^[0-9]$/.test(key)) return `n${key}`;
  if (key === '.') return 'dot';
  if (key === '+') return 'add';
  if (key === '-') return 'sub';
  if (key === '*') return 'mul';
  if (key === '/') return 'div';
  if (key === '(') return 'lparen';
  if (key === ')') return 'rparen';
  if (key === ',') return 'comma';
  if (key === '!') return 'fact';
  if (key === '^') return 'pow';
  if (key === 'Enter') return 'enter';
  if (key === '=') return 'eq';
  if (key === 'Backspace') return 'del';
  return null;
}

function renderModel(model: ModelDef) {
  // C-6+ replaces each placeholder with the real shell as phases ship.
  if (model.key === 'ti-36x-pro') return <Ti36xPro />;
  if (model.key === 'ti-30xs-multiview') return <Ti30xsMultiView />;
  if (model.key === 'ti-30xa') return <Ti30xa />;
  if (model.key === 'casio-fx-991') return <CasioFx991 />;
  if (model.key === 'casio-fx-115') return <CasioFx115 />;
  if (model.key === 'hp-35s') return <Hp35s />;
  if (model.key === 'hp-33s') return <Hp33s />;
  return <ModelPlaceholder model={model} />;
}

function ModelPlaceholder({ model }: { model: ModelDef }) {
  return (
    <div className="calc-placeholder">
      <div className="calc-placeholder__brand">{model.brand}</div>
      <h3 className="calc-placeholder__title">{model.label}</h3>
      <p className="calc-placeholder__phase">
        Working emulator ships in Phase {model.phase} of <code>EXAM_CALCULATORS.md</code>.
      </p>
      <p className="calc-placeholder__hint">
        Until then, switch tabs above to preview the other calculators or close the modal with the × in the
        header (or press <kbd>Esc</kbd>).
      </p>
    </div>
  );
}
