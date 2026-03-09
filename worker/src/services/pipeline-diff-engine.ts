// worker/src/services/pipeline-diff-engine.ts
// Phase 18: Data Versioning & Pipeline Diff Engine
//
// Compares two pipeline version snapshots and produces a structured diff
// so surveyors can see exactly what changed between watermarked and clean runs.

import type { PipelineVersion } from './pipeline-version-store.js';

export type { PipelineVersion };

export interface FieldDiff<T = unknown> {
  field: string;
  before: T;
  after: T;
  changeType: 'added' | 'removed' | 'changed' | 'unchanged';
  significance: 'critical' | 'major' | 'minor' | 'info';
}

export interface BoundaryCallDiff {
  callIndex: number;
  callId?: string;
  bearing?: FieldDiff<string>;
  distance?: FieldDiff<number>;
  monument?: FieldDiff<string>;
  confidence?: FieldDiff<number>;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface PipelineDiffResult {
  projectId: string;
  versionA: string;        // versionId
  versionB: string;        // versionId
  versionALabel: string;
  versionBLabel: string;

  confidenceChange: {
    before: number | null;
    after: number | null;
    delta: number | null;
    improved: boolean;
  };

  closureChange: {
    before: number | null;
    after: number | null;
    improved: boolean;
  };

  boundaryCalls: BoundaryCallDiff[];
  callsAdded: number;
  callsRemoved: number;
  callsModified: number;

  totalChanges: number;
  criticalChanges: number;
  summary: string[];

  generatedAt: string;
}

type RawCall = {
  callId?: string;
  bearing?: string;
  distance?: number;
  monument?: string;
  confidence?: number;
  [key: string]: unknown;
};

export class PipelineDiffEngine {
  private extractCalls(snapshot: Record<string, unknown>): RawCall[] {
    const calls =
      (snapshot.boundaryCalls as RawCall[] | undefined) ??
      (snapshot.calls as RawCall[] | undefined) ??
      ((snapshot.boundaryData as { calls?: RawCall[] } | undefined)?.calls) ??
      [];
    return Array.isArray(calls) ? calls : [];
  }

  private fieldDiff<T>(field: string, before: T, after: T): FieldDiff<T> {
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    let significance: FieldDiff['significance'];
    if (!changed) {
      significance = 'info';
    } else if (field === 'bearing') {
      significance = 'critical';
    } else if (field === 'distance') {
      significance = 'major';
    } else {
      significance = 'minor';
    }
    return {
      field,
      before,
      after,
      changeType: changed ? 'changed' : 'unchanged',
      significance,
    };
  }

  private diffCalls(
    callsA: RawCall[],
    callsB: RawCall[],
  ): { diffs: BoundaryCallDiff[]; added: number; removed: number; modified: number } {
    const diffs: BoundaryCallDiff[] = [];
    let added = 0;
    let removed = 0;
    let modified = 0;

    const maxLen = Math.max(callsA.length, callsB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = callsA[i];
      const b = callsB[i];

      if (!a && b) {
        diffs.push({ callIndex: i, callId: b.callId, changeType: 'added' });
        added++;
        continue;
      }
      if (a && !b) {
        diffs.push({ callIndex: i, callId: a.callId, changeType: 'removed' });
        removed++;
        continue;
      }

      if (a && b) {
        const bearingDiff = this.fieldDiff<string>('bearing', a.bearing ?? '', b.bearing ?? '');
        const distanceDiff = this.fieldDiff<number>('distance', a.distance ?? 0, b.distance ?? 0);
        const monumentDiff = this.fieldDiff<string>(
          'monument',
          a.monument ?? '',
          b.monument ?? '',
        );
        const confidenceDiff = this.fieldDiff<number>(
          'confidence',
          a.confidence ?? 0,
          b.confidence ?? 0,
        );

        const hasChange =
          bearingDiff.changeType === 'changed' ||
          distanceDiff.changeType === 'changed' ||
          monumentDiff.changeType === 'changed' ||
          confidenceDiff.changeType === 'changed';

        diffs.push({
          callIndex: i,
          callId: b.callId ?? a.callId,
          bearing: bearingDiff,
          distance: distanceDiff,
          monument: monumentDiff,
          confidence: confidenceDiff,
          changeType: hasChange ? 'modified' : 'unchanged',
        });
        if (hasChange) modified++;
      }
    }

    return { diffs, added, removed, modified };
  }

  /** Compare two pipeline version snapshots */
  diff(
    versionA: PipelineVersion,
    snapshotA: Record<string, unknown>,
    versionB: PipelineVersion,
    snapshotB: Record<string, unknown>,
  ): PipelineDiffResult {
    const confBefore = versionA.overallConfidence;
    const confAfter = versionB.overallConfidence;
    const confDelta =
      confBefore !== null && confAfter !== null ? confAfter - confBefore : null;

    const closureBefore = versionA.closureError_ft;
    const closureAfter = versionB.closureError_ft;
    const closureImproved =
      closureBefore !== null && closureAfter !== null
        ? closureAfter < closureBefore
        : false;

    const callsA = this.extractCalls(snapshotA);
    const callsB = this.extractCalls(snapshotB);
    const { diffs, added, removed, modified } = this.diffCalls(callsA, callsB);

    const criticalChanges = diffs.filter(
      (d) => d.bearing?.significance === 'critical',
    ).length;
    const totalChanges = added + removed + modified;

    const partial = {
      projectId: versionA.projectId,
      versionA: versionA.versionId,
      versionB: versionB.versionId,
      versionALabel: versionA.label,
      versionBLabel: versionB.label,
      confidenceChange: {
        before: confBefore,
        after: confAfter,
        delta: confDelta,
        improved: confDelta !== null ? confDelta > 0 : false,
      },
      closureChange: {
        before: closureBefore,
        after: closureAfter,
        improved: closureImproved,
      },
      boundaryCalls: diffs,
      callsAdded: added,
      callsRemoved: removed,
      callsModified: modified,
      totalChanges,
      criticalChanges,
      generatedAt: new Date().toISOString(),
    };

    return {
      ...partial,
      summary: this.summarizeChanges({ ...partial, summary: [] }),
    };
  }

  /** Get a plain-English summary of what changed */
  summarizeChanges(diff: PipelineDiffResult): string[] {
    const lines: string[] = [];

    if (diff.confidenceChange.delta !== null) {
      const dir = diff.confidenceChange.improved ? 'improved' : 'decreased';
      const delta = diff.confidenceChange.delta;
      lines.push(
        `Confidence ${dir} from ${(diff.confidenceChange.before ?? 0).toFixed(1)} to ` +
          `${(diff.confidenceChange.after ?? 0).toFixed(1)} ` +
          `(${delta > 0 ? '+' : ''}${delta.toFixed(1)} pts)`,
      );
    }

    if (diff.closureChange.before !== null && diff.closureChange.after !== null) {
      if (diff.closureChange.improved) {
        lines.push(
          `Closure error improved: ${diff.closureChange.before} ft → ${diff.closureChange.after} ft`,
        );
      } else if (diff.closureChange.before !== diff.closureChange.after) {
        lines.push(
          `Closure error changed: ${diff.closureChange.before} ft → ${diff.closureChange.after} ft`,
        );
      }
    }

    if (diff.callsAdded > 0) lines.push(`${diff.callsAdded} boundary call(s) added`);
    if (diff.callsRemoved > 0) lines.push(`${diff.callsRemoved} boundary call(s) removed`);
    if (diff.callsModified > 0) lines.push(`${diff.callsModified} boundary call(s) modified`);
    if (diff.criticalChanges > 0)
      lines.push(`${diff.criticalChanges} critical change(s) detected (bearing)`);
    if (diff.totalChanges === 0) lines.push('No changes detected between versions');

    return lines;
  }

  /** Check if changes are significant enough to notify the user */
  isSignificantChange(diff: PipelineDiffResult): boolean {
    if (diff.criticalChanges > 0) return true;
    if (diff.confidenceChange.delta !== null && Math.abs(diff.confidenceChange.delta) > 5)
      return true;
    if (diff.callsAdded > 0 || diff.callsRemoved > 0) return true;
    return false;
  }
}
