// worker/src/__tests__/regression/regression-runner.ts
//
// Regression-set harness scaffold (Phase 0).
//
// What this is for:
//   A "regression set" (a.k.a. "ground truth set") is a fixed list of
//   properties where Starr already knows the right answer because someone
//   surveyed them by hand. The pipeline runs against each one on a
//   schedule. If the pipeline result drifts away from the known answer on
//   any field, the deploy is blocked until we figure out what broke.
//
//   Typical breakage modes this catches:
//     - A county redesigns their portal and our adapter starts pulling
//       wrong data (or the wrong row entirely).
//     - An AI model update changes extraction behavior (silent regression).
//     - A coordinate system bug starts placing properties one zone over.
//     - A confidence-scoring tweak quietly classifies real boundaries
//       as "marginal".
//
// What this scaffold does:
//   - Loads JSON fixtures from `./fixtures/<county>/<property-id>.json`
//     (YAML support added in Phase A when we wire `yaml` package).
//   - Provides a `runFixture()` stub that Phase A will replace with a real
//     call to the worker's HTTP API.
//   - Compares the pipeline result against expected values using
//     per-field tolerance (exact, numeric ±, fuzzy string, list-set).
//   - Emits a delta report.
//
// What this scaffold does NOT do (yet):
//   - Actually call the pipeline. The runner is wired to a stub that
//     just returns the expected values, so the harness wiring is tested
//     end-to-end without needing a running worker.
//   - Persist results. Phase A adds Supabase writes for trend tracking.
//   - Run on a schedule. Phase A adds a GitHub Actions cron.
//
// Growth plan (see docs/RECON_INVENTORY.md §11):
//   Phase 0: 1 synthetic example fixture (this PR).
//   Phase A: 5 real fixtures from Dad's filing cabinet.
//   Phase B: 15 fixtures.
//   Phase D: 50 fixtures (gate for any non-Starr customer).
//
// Running locally:
//   cd worker && npx tsx src/__tests__/regression/regression-runner.ts
//
// (Not yet wired into `npm test` — that hookup happens in Phase A.)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Fixture shape ──────────────────────────────────────────────────────────

export interface RegressionFixture {
  /** Stable identifier; usually `<county>/<property-id>`. */
  id: string;
  /** Free-form description for human reviewers. */
  description: string;
  /** County FIPS code (e.g. '48027' for Bell). */
  countyFips: string;
  /** Address as it would be entered into the intake form. */
  inputAddress: string;
  /** Expected pipeline outputs, with per-field tolerance rules. */
  expected: ExpectedOutputs;
  /** Provenance — how we know the expected values are correct. */
  groundTruthSource: {
    /** 'starr_filing_cabinet' | 'starr_pc' | 'starr_flash_drive' | 'public_record' | 'synthetic' */
    type: string;
    /** Free-form note (e.g. "Job #2018-447, see binder"). */
    reference: string;
    /** ISO date the ground truth was captured. */
    capturedAt: string;
  };
}

export interface ExpectedOutputs {
  owner:            ToleranceField<string>;
  acreageCalc:      ToleranceField<number>;
  acreageDeeded:    ToleranceField<number>;
  closureRatio:     ToleranceField<number>;
  legalDescription: ToleranceField<string>;
  chainOfTitle:     ToleranceField<ChainEntry[]>;
  documentsFound:   ToleranceField<DocumentRef[]>;
  adjoiners:        ToleranceField<string[]>;
}

export interface ChainEntry {
  fromDate:     string;
  toDate:       string | null;
  grantor:      string;
  grantee:      string;
  recordingRef: string;
}

export interface DocumentRef {
  recordingRef: string;
  documentType: string;
}

/** Per-field tolerance specification. */
export type ToleranceField<T> =
  | { mode: 'exact';     value: T }
  | { mode: 'numeric';   value: number; absTolerance?: number; relTolerance?: number }
  | { mode: 'fuzzy';     value: string; minSimilarity?: number }
  | { mode: 'set';       value: string[]; requireAll?: boolean; allowExtra?: boolean }
  | { mode: 'chain';     value: ChainEntry[]; dateTolerance?: number }
  | { mode: 'documents'; value: DocumentRef[]; requireAll?: boolean }
  | { mode: 'skip';      reason: string };

// ── Pipeline-call stub ─────────────────────────────────────────────────────

/**
 * Phase 0 stub. Phase A replaces with a real HTTP call to the worker.
 * Returns the same shape the real pipeline will return.
 */
async function runPipelineStub(fixture: RegressionFixture): Promise<PipelineResult> {
  const e = fixture.expected;
  return {
    address:          fixture.inputAddress,
    owner:            extractValue(e.owner),
    acreageCalc:      extractValue(e.acreageCalc),
    acreageDeeded:    extractValue(e.acreageDeeded),
    closureRatio:     extractValue(e.closureRatio),
    legalDescription: extractValue(e.legalDescription),
    chainOfTitle:     extractValue(e.chainOfTitle) ?? [],
    documentsFound:   extractValue(e.documentsFound) ?? [],
    adjoiners:        extractValue(e.adjoiners) ?? [],
  };
}

function extractValue<T>(field: ToleranceField<T>): T | undefined {
  return 'value' in field ? (field.value as T) : undefined;
}

interface PipelineResult {
  address:           string;
  owner?:            string;
  acreageCalc?:      number;
  acreageDeeded?:    number;
  closureRatio?:     number;
  legalDescription?: string;
  chainOfTitle:      ChainEntry[];
  documentsFound:    DocumentRef[];
  adjoiners:         string[];
}

// ── Fixture loader ─────────────────────────────────────────────────────────

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname_, 'fixtures');

export function loadAllFixtures(): RegressionFixture[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  const counties = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const fixtures: RegressionFixture[] = [];
  for (const county of counties) {
    const countyDir = path.join(FIXTURES_DIR, county);
    const files = fs.readdirSync(countyDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const raw = fs.readFileSync(path.join(countyDir, file), 'utf8');
      try {
        fixtures.push(JSON.parse(raw) as RegressionFixture);
      } catch (err) {
        console.error(`[regression] Failed to parse ${file}: ${(err as Error).message}`);
      }
    }
  }
  return fixtures;
}

// ── Comparison ─────────────────────────────────────────────────────────────

export interface FieldDelta {
  field: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  expected: unknown;
  actual: unknown;
  note?: string;
}

export function compareFixture(
  fixture: RegressionFixture,
  result: PipelineResult,
): FieldDelta[] {
  const e = fixture.expected;
  return [
    compareField('owner',            e.owner,            result.owner),
    compareField('acreageCalc',      e.acreageCalc,      result.acreageCalc),
    compareField('acreageDeeded',    e.acreageDeeded,    result.acreageDeeded),
    compareField('closureRatio',     e.closureRatio,     result.closureRatio),
    compareField('legalDescription', e.legalDescription, result.legalDescription),
    compareField('chainOfTitle',     e.chainOfTitle,     result.chainOfTitle),
    compareField('documentsFound',   e.documentsFound,   result.documentsFound),
    compareField('adjoiners',        e.adjoiners,        result.adjoiners),
  ];
}

function compareField(name: string, spec: ToleranceField<unknown>, actual: unknown): FieldDelta {
  switch (spec.mode) {
    case 'skip':
      return { field: name, status: 'skip', expected: undefined, actual, note: spec.reason };

    case 'exact':
      return {
        field: name,
        status: deepEqual(spec.value, actual) ? 'pass' : 'fail',
        expected: spec.value, actual,
      };

    case 'numeric': {
      if (typeof actual !== 'number') {
        return { field: name, status: 'fail', expected: spec.value, actual, note: 'not a number' };
      }
      const abs = spec.absTolerance ?? 0;
      const rel = spec.relTolerance ?? 0;
      const allowed = Math.max(abs, Math.abs(spec.value) * rel);
      const delta   = Math.abs(spec.value - actual);
      return {
        field: name,
        status: delta <= allowed ? 'pass' : 'fail',
        expected: spec.value, actual,
        note: `delta=${delta.toFixed(4)} allowed=${allowed.toFixed(4)}`,
      };
    }

    case 'fuzzy': {
      if (typeof actual !== 'string') {
        return { field: name, status: 'fail', expected: spec.value, actual, note: 'not a string' };
      }
      const minSim = spec.minSimilarity ?? 0.85;
      const sim = jaccardSim(spec.value.toLowerCase(), actual.toLowerCase());
      return {
        field: name,
        status: sim >= minSim ? 'pass' : 'fail',
        expected: spec.value, actual,
        note: `similarity=${sim.toFixed(2)} threshold=${minSim}`,
      };
    }

    case 'set': {
      const requireAll = spec.requireAll ?? true;
      const allowExtra = spec.allowExtra ?? false;
      const expected   = new Set(spec.value);
      const got        = new Set(Array.isArray(actual) ? actual as string[] : []);
      const missing    = [...expected].filter((v) => !got.has(v));
      const extra      = [...got].filter((v) => !expected.has(v));
      const passes =
        (!requireAll || missing.length === 0) &&
        (allowExtra || extra.length === 0);
      return {
        field: name,
        status: passes ? 'pass' : 'fail',
        expected: spec.value, actual,
        note: `missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`,
      };
    }

    case 'chain': {
      const tol = spec.dateTolerance ?? 0;
      const exp = spec.value;
      const got = Array.isArray(actual) ? actual as ChainEntry[] : [];
      if (exp.length !== got.length) {
        return {
          field: name, status: 'fail',
          expected: spec.value, actual,
          note: `chain length differs: expected=${exp.length} got=${got.length}`,
        };
      }
      for (let i = 0; i < exp.length; i++) {
        if (!chainEntryMatches(exp[i], got[i], tol)) {
          return {
            field: name, status: 'fail',
            expected: spec.value, actual,
            note: `chain entry ${i} mismatched`,
          };
        }
      }
      return { field: name, status: 'pass', expected: spec.value, actual };
    }

    case 'documents': {
      const requireAll = spec.requireAll ?? true;
      const got = Array.isArray(actual) ? actual as DocumentRef[] : [];
      const missingDocs = spec.value.filter(
        (e) => !got.some((g) => g.recordingRef === e.recordingRef && g.documentType === e.documentType),
      );
      const passes = !requireAll || missingDocs.length === 0;
      return {
        field: name,
        status: passes ? 'pass' : 'fail',
        expected: spec.value, actual,
        note: `missing=${missingDocs.length}`,
      };
    }
  }
}

function chainEntryMatches(a: ChainEntry, b: ChainEntry, dayTolerance: number): boolean {
  if (a.recordingRef !== b.recordingRef) return false;
  if (a.grantor.toLowerCase() !== b.grantor.toLowerCase()) return false;
  if (a.grantee.toLowerCase() !== b.grantee.toLowerCase()) return false;
  return dateWithin(a.fromDate, b.fromDate, dayTolerance) &&
         dateWithin(a.toDate, b.toDate, dayTolerance);
}

function dateWithin(a: string | null, b: string | null, days: number): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms <= days * 86_400_000;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** Jaccard similarity over whitespace-tokenized words. Cheap and good enough for legal descriptions. */
function jaccardSim(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// ── Runner ─────────────────────────────────────────────────────────────────

export interface RunReport {
  fixtureId: string;
  passed:    number;
  failed:    number;
  skipped:   number;
  warned:    number;
  deltas:    FieldDelta[];
}

export async function runRegressionSuite(): Promise<RunReport[]> {
  const fixtures = loadAllFixtures();
  const reports: RunReport[] = [];

  for (const fix of fixtures) {
    const result = await runPipelineStub(fix);
    const deltas = compareFixture(fix, result);
    reports.push({
      fixtureId: fix.id,
      passed:  deltas.filter((d) => d.status === 'pass').length,
      failed:  deltas.filter((d) => d.status === 'fail').length,
      skipped: deltas.filter((d) => d.status === 'skip').length,
      warned:  deltas.filter((d) => d.status === 'warn').length,
      deltas,
    });
  }
  return reports;
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────

const isMainModule = (() => {
  try { return import.meta.url === `file://${process.argv[1]}`; }
  catch { return false; }
})();

if (isMainModule) {
  runRegressionSuite()
    .then((reports) => {
      let totalFail = 0;
      for (const r of reports) {
        totalFail += r.failed;
        const status = r.failed === 0 ? '✅' : '❌';
        console.log(`${status} ${r.fixtureId}  pass=${r.passed} fail=${r.failed} skip=${r.skipped}`);
        for (const d of r.deltas) {
          if (d.status === 'fail') {
            console.log(`     ✗ ${d.field}: ${d.note ?? ''}`);
            console.log(`         expected: ${JSON.stringify(d.expected)}`);
            console.log(`         actual:   ${JSON.stringify(d.actual)}`);
          }
        }
      }
      process.exit(totalFail === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('[regression] runner crashed:', err);
      process.exit(2);
    });
}
