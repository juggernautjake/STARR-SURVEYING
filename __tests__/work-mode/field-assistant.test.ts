// __tests__/work-mode/field-assistant.test.ts — the Work Mode AI field assistant (D8, text) + its route.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/admin/work-mode/assistant/route.ts'), 'utf8');
const workspace = readFileSync(join(process.cwd(), 'app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx'), 'utf8');

describe('field assistant route', () => {
  it('is auth-gated and configured-gated', () => {
    expect(route).toContain('export const POST');
    expect(route).toMatch(/Unauthorized/);
    expect(route).toContain('ANTHROPIC_API_KEY');
  });
  it('is scoped to surveying/field work (not a general chatbot)', () => {
    expect(route).toMatch(/land-surveying/i);
    expect(route).toMatch(/bearings|azimuth|traverse/i);
  });
  it('passes the last few turns + optional job context to Claude', () => {
    expect(route).toContain('.slice(-12)');
    expect(route).toContain('jobContext');
    expect(route).toContain('client.messages.create');
  });
});

describe('Ask AI tab wiring', () => {
  it('the workspace has an Ask AI tab that POSTs the assistant route with job context', () => {
    expect(workspace).toContain("{ id: 'ai'");
    expect(workspace).toContain('<FieldAssistant');
    expect(workspace).toContain("fetch('/api/admin/work-mode/assistant'");
    expect(workspace).toContain('jobContext: job ? jobLabel(job) : undefined');
  });
});
