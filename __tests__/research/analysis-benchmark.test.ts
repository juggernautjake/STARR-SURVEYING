import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { benchmarkResult, BENCHMARK_MS_PER_PAGE } from '@/lib/research/analysis.service';

// The benchmark calibration run (owner): analyse every page with NO cost cap, 30-60s/page, then
// total cost / total pages = the standardized rate. Pin the arithmetic and the wiring.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('benchmarkResult — cost / pages', () => {
  it('divides total cost by total pages across documents', () => {
    const r = benchmarkResult([{ page_count: 3 }, { page_count: 1 }, { page_count: 6 }], 5); // 10 pages, $5
    expect(r.benchmark).toBe(true);
    expect(r.benchmark_total_pages).toBe(10);
    expect(r.benchmark_cost_usd).toBe(5);
    expect(r.benchmark_usd_per_page).toBe(0.5);
  });

  it('counts a missing page_count as one page and handles zero pages', () => {
    expect(benchmarkResult([{}, {}], 2).benchmark_total_pages).toBe(2);
    expect(benchmarkResult([], 5).benchmark_usd_per_page).toBe(0);
  });

  it('allows up to a minute per page', () => {
    expect(BENCHMARK_MS_PER_PAGE).toBe(60_000);
  });
});

describe('benchmark mode is wired', () => {
  const svc = read('lib/research/analysis.service.ts');
  const route = read('app/api/admin/research/[projectId]/analyze/route.ts');

  it('runs with NO cost cap in benchmark mode', () => {
    expect(svc).toMatch(/const benchmark = config\?\.benchmark === true/);
    expect(svc).toMatch(/benchmark[\s\S]{0,40}\?[\s\S]{0,20}undefined/);
  });

  it('scales the per-document timeout to the page count in benchmark mode', () => {
    expect(svc).toMatch(/pageCountOf\(doc\) \* BENCHMARK_MS_PER_PAGE/);
  });

  it('records the benchmark rate in analysis_metadata', () => {
    expect(svc).toMatch(/benchmarkResult\(documents, estimateAnalysisCostUsd\(tokenUsage\)\)/);
  });

  it('the route accepts a benchmark flag', () => {
    expect(route).toMatch(/body\.benchmark === true/);
    expect(route).toMatch(/config\.benchmark = true/);
  });
});
