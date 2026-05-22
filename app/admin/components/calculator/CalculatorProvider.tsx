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

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CalculatorModal } from './CalculatorModal';

export type ModelKey =
  | 'ti-36x-pro'
  | 'ti-30xs-multiview'
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
  // Phase 2: representative algebraic.
  { key: 'ti-36x-pro',        brand: 'TI',    label: 'TI-36X Pro',         width: 320, height: 540, phase: 2 },
  // Phase 3: natural display.
  { key: 'casio-fx-991',      brand: 'Casio', label: 'Casio fx-991ES PLUS', width: 340, height: 560, phase: 3 },
  // Phase 4: RPN.
  { key: 'hp-35s',            brand: 'HP',    label: 'HP 35s',             width: 280, height: 580, phase: 4 },
  // Phase 5: siblings (re-skins).
  { key: 'casio-fx-115',      brand: 'Casio', label: 'Casio fx-115ES PLUS', width: 340, height: 560, phase: 5 },
  { key: 'hp-33s',            brand: 'HP',    label: 'HP 33s',             width: 280, height: 580, phase: 5 },
  { key: 'ti-30xs-multiview', brand: 'TI',    label: 'TI-30XS MultiView',  width: 320, height: 540, phase: 5 },
];

const LAST_MODEL_STORAGE_KEY = 'calculatorLastModel';
const DEFAULT_MODEL: ModelKey = 'ti-36x-pro';

interface CalculatorCtx {
  isOpen: boolean;
  currentModel: ModelKey;
  openCalculator: (model?: ModelKey) => void;
  closeCalculator: () => void;
  setCurrentModel: (model: ModelKey) => void;
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

  const closeCalculator = useCallback(() => setIsOpen(false), []);

  const ctxValue = useMemo<CalculatorCtx>(() => ({
    isOpen, currentModel, openCalculator, closeCalculator, setCurrentModel,
  }), [isOpen, currentModel, openCalculator, closeCalculator, setCurrentModel]);

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
        <ModelPlaceholder model={activeModel} />
      </CalculatorModal>
    </Ctx.Provider>
  );
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
