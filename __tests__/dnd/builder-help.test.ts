// __tests__/dnd/builder-help.test.ts — the builder help catalog covers the key surfaces
// with real explanations (Phase V, Slice 9).
import { describe, it, expect } from 'vitest';
import { BUILDER_HELP } from '@/lib/dnd/builder-help';

describe('builder help', () => {
  it('has non-empty help for every key builder surface', () => {
    const keys = ['name', 'system', 'buildMode', 'sources', 'notes', 'art', 'style', 'uploadsFate', 'aiBuild', 'buildQuestions', 'sheetStyle', 'editChat'] as const;
    for (const k of keys) {
      expect(BUILDER_HELP[k]).toBeTruthy();
      expect(BUILDER_HELP[k].title.length).toBeGreaterThan(2);
      expect(BUILDER_HELP[k].body.length).toBeGreaterThan(30);
    }
  });

  it('explains the three build modes and the no-cross-system guarantee', () => {
    expect(BUILDER_HELP.buildMode.body).toMatch(/ruthless/i);
    expect(BUILDER_HELP.buildMode.body).toMatch(/questioning/i);
    expect(BUILDER_HELP.buildMode.body).toMatch(/step-by-step/i);
    expect(BUILDER_HELP.system.body).toMatch(/never another system/i);
  });

  it('explains what happens to uploaded info', () => {
    expect(BUILDER_HELP.uploadsFate.body).toMatch(/stored privately/i);
    expect(BUILDER_HELP.uploadsFate.body).toMatch(/notes/i);
  });
});
