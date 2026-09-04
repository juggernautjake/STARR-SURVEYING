import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { triggerAppAnalysis } from '../research/trigger-app-analysis.js';

// ── P3/A5: the worker auto-runs the app's AI data-point analysis at run finish ────────────────────

const ENV = { APP_BASE_URL: 'https://app.example.com', WORKER_API_KEY: 'k-123' } as unknown as NodeJS.ProcessEnv;

describe('triggerAppAnalysis', () => {
  it('does nothing when the run settings do not allow it', async () => {
    const spy = vi.fn();
    const r = await triggerAppAnalysis('p1', { allow: false }, ENV, spy as unknown as typeof fetch);
    expect(r.attempted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips (does not throw) when APP_BASE_URL or WORKER_API_KEY is missing', async () => {
    const spy = vi.fn();
    const r = await triggerAppAnalysis('p1', { allow: true }, {} as NodeJS.ProcessEnv, spy as unknown as typeof fetch);
    expect(r.attempted).toBe(false);
    expect(r.statement).toContain('not set');
    expect(spy).not.toHaveBeenCalled();
  });

  it('POSTs the analyze route with the worker key when allowed', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    const r = await triggerAppAnalysis('proj-9', { allow: true }, ENV, fetchMock);
    expect(r.ok).toBe(true);
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://app.example.com/api/admin/research/proj-9/analyze');
    expect((init as { method: string }).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers['x-worker-key']).toBe('k-123');
  });

  it('reports a non-OK response instead of throwing', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 409 })) as unknown as typeof fetch;
    const r = await triggerAppAnalysis('p1', { allow: true }, ENV, fetchMock);
    expect(r.attempted).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.statement).toContain('HTTP 409');
  });

  it('reports a transport failure instead of throwing', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await triggerAppAnalysis('p1', { allow: true }, ENV, fetchMock);
    expect(r.ok).toBe(false);
    expect(r.statement).toContain('could not reach the app');
  });
});

describe('wiring', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  it('the Bell run-finish tail calls triggerAppAnalysis', () => {
    const index = strip(fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8'));
    expect(index).toContain('triggerAppAnalysis(projectId, { allow: true })');
  });
  it('the app analyze route accepts the worker key and bypasses the interactive status gates', () => {
    const route = fs.readFileSync(
      path.resolve(process.cwd(), '../app/api/admin/research/[projectId]/analyze/route.ts'), 'utf8',
    );
    expect(route).toContain("req.headers.get('x-worker-key')");
    expect(route).toContain('!isWorker && project.status !==');
    expect(route).toContain("project.status === 'analyzing' && !isResume && !isWorker");
  });
});
