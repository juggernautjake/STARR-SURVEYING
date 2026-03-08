// lib/cad/store/template-store.ts — Drawing template and print config state
import { create } from 'zustand';
import type { DrawingTemplate, PrintConfig } from '../templates/types';
import { STARR_SURVEYING_TEMPLATE, LETTER_TEMPLATE, ARCH_D_TEMPLATE } from '../templates/default-templates';
import { DEFAULT_PRINT_CONFIG } from '../templates/print-engine';

interface TemplateStore {
  activeTemplate: DrawingTemplate;
  builtInTemplates: DrawingTemplate[];
  customTemplates: DrawingTemplate[];
  printConfig: PrintConfig;

  setActiveTemplate: (template: DrawingTemplate) => void;
  updateActiveTemplate: (updates: Partial<DrawingTemplate>) => void;
  saveCustomTemplate: (template: DrawingTemplate) => void;
  deleteCustomTemplate: (id: string) => void;
  resetToDefault: () => void;
  updatePrintConfig: (updates: Partial<PrintConfig>) => void;
  getTemplate: (id: string) => DrawingTemplate | undefined;
  getAllTemplates: () => DrawingTemplate[];
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  activeTemplate: STARR_SURVEYING_TEMPLATE,
  builtInTemplates: [STARR_SURVEYING_TEMPLATE, LETTER_TEMPLATE, ARCH_D_TEMPLATE],
  customTemplates: [],
  printConfig: DEFAULT_PRINT_CONFIG,

  setActiveTemplate: (template) => set({ activeTemplate: template }),

  updateActiveTemplate: (updates) =>
    set((s) => ({ activeTemplate: { ...s.activeTemplate, ...updates } })),

  saveCustomTemplate: (template) =>
    set((s) => ({
      customTemplates: [
        ...s.customTemplates.filter((t) => t.id !== template.id),
        { ...template, isBuiltIn: false, isEditable: true },
      ],
    })),

  deleteCustomTemplate: (id) =>
    set((s) => ({ customTemplates: s.customTemplates.filter((t) => t.id !== id) })),

  resetToDefault: () => set({ activeTemplate: STARR_SURVEYING_TEMPLATE }),

  updatePrintConfig: (updates) =>
    set((s) => ({ printConfig: { ...s.printConfig, ...updates } })),

  getTemplate: (id) => {
    const all = get().getAllTemplates();
    return all.find((t) => t.id === id);
  },

  getAllTemplates: () => [...get().builtInTemplates, ...get().customTemplates],
}));
