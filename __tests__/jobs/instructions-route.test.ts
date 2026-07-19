// __tests__/jobs/instructions-route.test.ts — the job-instructions GET/PUT route contract (Area D5).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/admin/jobs/[id]/instructions/route.ts'), 'utf8');

describe('job instructions route', () => {
  it('GET resolves the embeds server-side and reports edit rights', () => {
    expect(route).toContain('export async function GET');
    expect(route).toContain('resolveInstructions');
    expect(route).toContain('canEdit');
  });
  it('is org-scoped — a job from another org is 404, not readable', () => {
    expect(route).toContain('.org_id !== member.orgId');
    expect(route).toContain("{ error: 'Job not found' }");
  });
  it('PUT is limited to the lead RPLS or an admin', () => {
    expect(route).toContain('export async function PUT');
    expect(route).toContain('lead_rpls_email');
    expect(route).toMatch(/lead RPLS.*can edit instructions/);
  });
  it('PUT warns about broken file links at save time', () => {
    expect(route).toContain('brokenInstructionRefs');
    expect(route).toContain('brokenRefs');
  });
});
