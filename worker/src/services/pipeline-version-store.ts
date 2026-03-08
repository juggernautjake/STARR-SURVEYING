// worker/src/services/pipeline-version-store.ts
// Phase 18: Data Versioning & Pipeline Diff Engine
//
// Stores versioned snapshots of pipeline results so surveyors can compare
// watermarked vs. clean-document runs and see exactly what changed.

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface PipelineVersion {
  versionId: string;
  projectId: string;
  versionNumber: number;       // 1, 2, 3... (auto-incremented per project)
  label: string;               // e.g. "Initial (watermarked)", "After Deed Purchase"
  trigger: VersionTrigger;
  overallConfidence: number | null;  // 0–100
  overallGrade: string | null;       // A, B, C, D, F
  closureError_ft: number | null;
  callCount: number;
  documentCount: number;
  createdAt: string;
  snapshotPath: string;        // relative path within versionsDir to the JSON snapshot
  metadata?: Record<string, unknown>;
}

export type VersionTrigger =
  | 'initial_run'
  | 'document_purchased'
  | 'manual_rerun'
  | 'adjacent_update'
  | 'txdot_update';

const DEFAULT_VERSIONS_DIR = '/tmp/recon-versions';

export class PipelineVersionStore {
  private versionsDir: string;

  constructor(versionsDir?: string) {
    this.versionsDir = versionsDir ?? DEFAULT_VERSIONS_DIR;
  }

  private projectIndexPath(projectId: string): string {
    return path.join(this.versionsDir, projectId, 'index.json');
  }

  private globalIndexPath(): string {
    return path.join(this.versionsDir, '_global.json');
  }

  /** Save a new version snapshot for a project */
  async saveVersion(
    projectId: string,
    trigger: VersionTrigger,
    label: string,
    snapshot: Record<string, unknown>,
    stats: Pick<
      PipelineVersion,
      'overallConfidence' | 'overallGrade' | 'closureError_ft' | 'callCount' | 'documentCount'
    >,
  ): Promise<PipelineVersion> {
    const versionId = randomUUID();

    // Determine the next version number from existing versions
    const existing = await this.listVersions(projectId);
    const versionNumber = existing.length + 1;

    // Ensure project directory exists
    const projectDir = path.join(this.versionsDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });

    // Write snapshot JSON
    const snapshotPath = path.join(projectId, `${versionId}.json`);
    await fs.writeFile(
      path.join(this.versionsDir, snapshotPath),
      JSON.stringify(snapshot, null, 2),
    );

    const version: PipelineVersion = {
      versionId,
      projectId,
      versionNumber,
      label,
      trigger,
      overallConfidence: stats.overallConfidence,
      overallGrade: stats.overallGrade,
      closureError_ft: stats.closureError_ft,
      callCount: stats.callCount,
      documentCount: stats.documentCount,
      createdAt: new Date().toISOString(),
      snapshotPath,
    };

    // Update project index (stored ascending; listVersions reverses on read)
    const stored = [...existing].sort((a, b) => a.versionNumber - b.versionNumber);
    stored.push(version);
    await fs.writeFile(this.projectIndexPath(projectId), JSON.stringify(stored, null, 2));

    // Update global versionId → projectId lookup
    let globalIndex: Record<string, string> = {};
    try {
      const raw = await fs.readFile(this.globalIndexPath(), 'utf-8');
      globalIndex = JSON.parse(raw) as Record<string, string>;
    } catch {
      // File doesn't exist yet — start fresh
    }
    globalIndex[versionId] = projectId;
    await fs.writeFile(this.globalIndexPath(), JSON.stringify(globalIndex, null, 2));

    return version;
  }

  /** List all versions for a project, newest first */
  async listVersions(projectId: string): Promise<PipelineVersion[]> {
    try {
      const raw = await fs.readFile(this.projectIndexPath(projectId), 'utf-8');
      const versions = JSON.parse(raw) as PipelineVersion[];
      return versions.sort((a, b) => b.versionNumber - a.versionNumber);
    } catch {
      return [];
    }
  }

  /** Get a specific version by versionId */
  async getVersion(versionId: string): Promise<PipelineVersion | null> {
    try {
      const raw = await fs.readFile(this.globalIndexPath(), 'utf-8');
      const globalIndex = JSON.parse(raw) as Record<string, string>;
      const projectId = globalIndex[versionId];
      if (!projectId) return null;
      const versions = await this.listVersions(projectId);
      return versions.find((v) => v.versionId === versionId) ?? null;
    } catch {
      return null;
    }
  }

  /** Load the snapshot data for a version */
  async loadSnapshot(versionId: string): Promise<Record<string, unknown> | null> {
    const version = await this.getVersion(versionId);
    if (!version) return null;
    try {
      const raw = await fs.readFile(
        path.join(this.versionsDir, version.snapshotPath),
        'utf-8',
      );
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Get the latest (highest versionNumber) version for a project */
  async getLatestVersion(projectId: string): Promise<PipelineVersion | null> {
    const versions = await this.listVersions(projectId);
    return versions[0] ?? null; // listVersions returns newest-first
  }

  /** Delete all versions for a project; returns the count that was deleted */
  async deleteProjectVersions(projectId: string): Promise<number> {
    const versions = await this.listVersions(projectId);
    const count = versions.length;
    if (count === 0) return 0;

    // Remove the entire project directory (index + snapshots)
    const projectDir = path.join(this.versionsDir, projectId);
    try {
      await fs.rm(projectDir, { recursive: true });
    } catch {
      // Directory may already be missing — ignore
    }

    // Scrub these versionIds from the global lookup
    try {
      const raw = await fs.readFile(this.globalIndexPath(), 'utf-8');
      const globalIndex = JSON.parse(raw) as Record<string, string>;
      for (const v of versions) {
        delete globalIndex[v.versionId];
      }
      await fs.writeFile(this.globalIndexPath(), JSON.stringify(globalIndex, null, 2));
    } catch {
      // Global index may not exist — ignore
    }

    return count;
  }
}
