// worker/src/services/project-cleanup-service.ts
// Cleanup/retention policy: archive or delete old project files after 90 days.

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, statSync } from 'fs';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExpiredProject {
  projectId: string;
  lastModified: Date;
  ageDays: number;
  sizeBytes: number;
  versionCount: number;
}

export interface ArchiveResult {
  projectId: string;
  archivedPath: string;
  sizeBytes: number;
  success: boolean;
  error?: string;
}

export interface RetentionReport {
  checkedAt: string;
  totalProjects: number;
  expiredProjects: number;
  archivedProjects: number;
  deletedProjects: number;
  bytesFreed: number;
  errors: string[];
  dryRun: boolean;
}

export interface RetentionStats {
  totalProjects: number;
  expiredProjects: number;
  totalSizeBytes: number;
  oldestProjectAge_days: number;
  nextRetentionDue: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSizeBytes(full);
      } else {
        try {
          const stat = await fs.stat(full);
          total += stat.size;
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return total;
}

async function rmrf(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ── Service ─────────────────────────────────────────────────────────────────

export class ProjectCleanupService {
  private retentionDays: number;
  private archiveDir: string;
  private versionsDir: string;

  constructor(
    retentionDays = 90,
    archiveDir = '/tmp/recon-archive',
    versionsDir = '/tmp/recon-versions',
  ) {
    this.retentionDays = retentionDays;
    this.archiveDir = archiveDir;
    this.versionsDir = versionsDir;
  }

  /** Scan projectsBaseDir and return projects older than retentionDays */
  async listExpiredProjects(projectsBaseDir: string): Promise<ExpiredProject[]> {
    if (!existsSync(projectsBaseDir)) return [];

    const entries = await fs.readdir(projectsBaseDir, { withFileTypes: true });
    const now = Date.now();
    const cutoffMs = this.retentionDays * 24 * 60 * 60 * 1000;
    const expired: ExpiredProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(projectsBaseDir, entry.name);
      try {
        const stat = await fs.stat(projectDir);
        const ageDays = (now - stat.mtimeMs) / (24 * 60 * 60 * 1000);
        if (ageDays < this.retentionDays) continue;

        const sizeBytes = await dirSizeBytes(projectDir);
        const versionCount = await this.countVersions(entry.name);

        expired.push({
          projectId: entry.name,
          lastModified: stat.mtime,
          ageDays: Math.floor(ageDays),
          sizeBytes,
          versionCount,
        });
      } catch {
        // skip projects we can't stat
      }
    }

    return expired;
  }

  /** Move project files to archiveDir with timestamp in folder name */
  async archiveProject(projectId: string, sourceDir: string): Promise<ArchiveResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivedPath = path.join(this.archiveDir, `${projectId}_${timestamp}`);

    try {
      const sizeBytes = await dirSizeBytes(sourceDir);
      await fs.mkdir(this.archiveDir, { recursive: true });
      await fs.rename(sourceDir, archivedPath);
      return { projectId, archivedPath, sizeBytes, success: true };
    } catch (err: any) {
      return { projectId, archivedPath, sizeBytes: 0, success: false, error: err.message };
    }
  }

  /** Permanently delete an archived project and return bytes freed */
  async deleteArchivedProject(projectId: string): Promise<number> {
    if (!existsSync(this.archiveDir)) return 0;

    const entries = await fs.readdir(this.archiveDir, { withFileTypes: true });
    let bytesFreed = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(`${projectId}_`)) continue;
      const fullPath = path.join(this.archiveDir, entry.name);
      bytesFreed += await dirSizeBytes(fullPath);
      await rmrf(fullPath);
    }

    return bytesFreed;
  }

  /** Full retention pass: find expired → archive → return report */
  async runRetentionPass(
    projectsBaseDir: string,
    options: { dryRun?: boolean; maxProjects?: number } = {},
  ): Promise<RetentionReport> {
    const { dryRun = false, maxProjects } = options;
    const report: RetentionReport = {
      checkedAt: new Date().toISOString(),
      totalProjects: 0,
      expiredProjects: 0,
      archivedProjects: 0,
      deletedProjects: 0,
      bytesFreed: 0,
      errors: [],
      dryRun,
    };

    if (!existsSync(projectsBaseDir)) return report;

    const allEntries = await fs.readdir(projectsBaseDir, { withFileTypes: true });
    report.totalProjects = allEntries.filter((e) => e.isDirectory()).length;

    const expired = await this.listExpiredProjects(projectsBaseDir);
    report.expiredProjects = expired.length;

    const toProcess = maxProjects ? expired.slice(0, maxProjects) : expired;

    if (!dryRun) {
      for (const project of toProcess) {
        const projectDir = path.join(projectsBaseDir, project.projectId);
        try {
          const result = await this.archiveProject(project.projectId, projectDir);
          if (result.success) {
            report.archivedProjects++;
            report.bytesFreed += result.sizeBytes;
          } else {
            report.errors.push(`Archive failed for ${project.projectId}: ${result.error}`);
          }
        } catch (err: any) {
          report.errors.push(`Error processing ${project.projectId}: ${err.message}`);
        }
      }
    }

    return report;
  }

  /** Stats: total projects, expired count, total size, oldest age, next cleanup */
  async getRetentionStats(projectsBaseDir: string): Promise<RetentionStats> {
    if (!existsSync(projectsBaseDir)) {
      return {
        totalProjects: 0,
        expiredProjects: 0,
        totalSizeBytes: 0,
        oldestProjectAge_days: 0,
        nextRetentionDue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    const entries = await fs.readdir(projectsBaseDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const now = Date.now();

    let totalSizeBytes = 0;
    let oldestAgeMs = 0;

    for (const entry of dirs) {
      const fullPath = path.join(projectsBaseDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs > oldestAgeMs) oldestAgeMs = ageMs;
        totalSizeBytes += await dirSizeBytes(fullPath);
      } catch {
        // skip
      }
    }

    const expired = await this.listExpiredProjects(projectsBaseDir);
    const nextRetentionDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      totalProjects: dirs.length,
      expiredProjects: expired.length,
      totalSizeBytes,
      oldestProjectAge_days: Math.floor(oldestAgeMs / (24 * 60 * 60 * 1000)),
      nextRetentionDue,
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async countVersions(projectId: string): Promise<number> {
    const indexPath = path.join(this.versionsDir, projectId, 'index.json');
    try {
      const raw = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(raw);
      return Array.isArray(index) ? index.length : 0;
    } catch {
      return 0;
    }
  }
}

// ── Convenience Export ───────────────────────────────────────────────────────

export async function runProjectCleanup(
  projectsBaseDir: string,
  options: { retentionDays?: number; dryRun?: boolean; archiveDir?: string } = {},
): Promise<RetentionReport> {
  const { retentionDays = 90, dryRun = false, archiveDir } = options;
  const service = new ProjectCleanupService(retentionDays, archiveDir);
  return service.runRetentionPass(projectsBaseDir, { dryRun });
}
