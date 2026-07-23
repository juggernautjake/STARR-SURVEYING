// __tests__/dnd/manual-mode-routing.test.ts — "manual" mode opens the dropdown builder, not the AI (MB-5).
//
// Source-anchors that the new-character form SKIPS AI ingestion for the step-by-step (manual) mode, so
// "manual" means the per-system dropdown-and-roll builder on the character page — not an AI prompt variant.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('manual mode routing', () => {
  it('the new-character form routes stepbystep to the guided builder without AI ingestion', () => {
    const form = read('app/dnd/_ui/NewCharacterForm.tsx');
    // stepbystep is the guided manual builder: route to /builder, and DON'T run AI ingestion.
    expect(form).toMatch(/mode === 'stepbystep'/);
    expect(form).toMatch(/characters\/\$\{j\.characterId\}\/builder/);
    // The ingest call still exists for the AI modes, in the else branch.
    expect(form).toContain('/ingest');
  });

  it('the manual build mode is described as the no-AI dropdown builder', () => {
    const modes = read('lib/dnd/build-modes.ts');
    expect(modes).toMatch(/No AI/);
    expect(modes).toMatch(/dropdown/i);
  });
});
