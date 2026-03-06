// worker/src/ai/prompt-registry.ts — Phase 11 Module L
// AI prompt version registry with accuracy tracking and A/B testing.
//
// Spec §11.13.2 — AI Prompt Registry

import * as fs from 'fs';
import * as path from 'path';
import type { PromptVersion } from '../types/expansion.js';

// ── Prompt Registry ─────────────────────────────────────────────────────────

export class PromptRegistry {
  private registryDir: string;
  private prompts: Map<string, PromptVersion[]> = new Map();

  constructor(registryDir: string = '/tmp/prompt-registry') {
    this.registryDir = registryDir;
    fs.mkdirSync(registryDir, { recursive: true });
    this.loadAll();
  }

  /**
   * Register a new prompt version.
   */
  register(prompt: Omit<PromptVersion, 'deployedAt' | 'totalRuns' | 'averageTokens' | 'averageCost'>): PromptVersion {
    const version: PromptVersion = {
      ...prompt,
      deployedAt: new Date().toISOString(),
      totalRuns: 0,
      averageTokens: 0,
      averageCost: 0,
    };

    const versions = this.prompts.get(prompt.promptId) || [];
    versions.push(version);
    this.prompts.set(prompt.promptId, versions);
    this.save(prompt.promptId);

    console.log(
      `[PromptRegistry] Registered: ${prompt.promptId} v${prompt.version} (${prompt.status})`,
    );

    return version;
  }

  /**
   * Get the active prompt version for a given prompt ID.
   */
  getActive(promptId: string): PromptVersion | null {
    const versions = this.prompts.get(promptId) || [];
    return (
      versions.find((v) => v.status === 'active') ||
      versions[versions.length - 1] ||
      null
    );
  }

  /**
   * Get a specific version of a prompt.
   */
  getVersion(promptId: string, version: number): PromptVersion | null {
    const versions = this.prompts.get(promptId) || [];
    return versions.find((v) => v.version === version) || null;
  }

  /**
   * List all versions of a prompt.
   */
  listVersions(promptId: string): PromptVersion[] {
    return this.prompts.get(promptId) || [];
  }

  /**
   * List all registered prompt IDs.
   */
  listPromptIds(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Record a run of a prompt (update usage stats).
   */
  recordRun(
    promptId: string,
    version: number,
    tokens: number,
    cost: number,
  ): void {
    const prompt = this.getVersion(promptId, version);
    if (!prompt) return;

    const prevTotal = prompt.averageTokens * prompt.totalRuns;
    const prevCost = prompt.averageCost * prompt.totalRuns;

    prompt.totalRuns++;
    prompt.averageTokens = (prevTotal + tokens) / prompt.totalRuns;
    prompt.averageCost = (prevCost + cost) / prompt.totalRuns;

    this.save(promptId);
  }

  /**
   * Update accuracy score for a prompt version.
   */
  updateAccuracy(
    promptId: string,
    version: number,
    accuracy: number,
  ): void {
    const prompt = this.getVersion(promptId, version);
    if (!prompt) return;

    prompt.accuracy = accuracy;
    this.save(promptId);

    console.log(
      `[PromptRegistry] Accuracy updated: ${promptId} v${version} → ${accuracy}%`,
    );
  }

  /**
   * Promote a testing prompt to active, deprecating the previous active version.
   */
  promote(promptId: string, version: number): void {
    const versions = this.prompts.get(promptId) || [];

    for (const v of versions) {
      if (v.status === 'active') {
        v.status = 'deprecated';
      }
    }

    const target = versions.find((v) => v.version === version);
    if (target) {
      target.status = 'active';
      target.deployedAt = new Date().toISOString();
    }

    this.save(promptId);

    console.log(
      `[PromptRegistry] Promoted: ${promptId} v${version} → active`,
    );
  }

  /**
   * Rollback to a previous version.
   */
  rollback(promptId: string): PromptVersion | null {
    const versions = this.prompts.get(promptId) || [];
    const active = versions.find((v) => v.status === 'active');
    const deprecated = versions
      .filter((v) => v.status === 'deprecated')
      .sort((a, b) => b.version - a.version);

    if (!deprecated.length) return null;

    if (active) active.status = 'deprecated';
    deprecated[0].status = 'active';
    deprecated[0].deployedAt = new Date().toISOString();

    this.save(promptId);

    console.log(
      `[PromptRegistry] Rolled back: ${promptId} → v${deprecated[0].version}`,
    );

    return deprecated[0];
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private save(promptId: string): void {
    const versions = this.prompts.get(promptId) || [];
    const filePath = path.join(this.registryDir, `${promptId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(versions, null, 2));
  }

  private loadAll(): void {
    if (!fs.existsSync(this.registryDir)) return;

    for (const file of fs.readdirSync(this.registryDir)) {
      if (!file.endsWith('.json')) continue;
      const promptId = file.replace('.json', '');
      try {
        const versions = JSON.parse(
          fs.readFileSync(
            path.join(this.registryDir, file),
            'utf-8',
          ),
        );
        this.prompts.set(promptId, versions);
      } catch {
        // Skip corrupted files
      }
    }
  }
}

// ── Built-in Prompt Definitions ─────────────────────────────────────────────

export const DEFAULT_PROMPTS: Omit<PromptVersion, 'deployedAt' | 'totalRuns' | 'averageTokens' | 'averageCost'>[] = [
  {
    promptId: 'plat_extraction',
    version: 1,
    systemPrompt:
      'You are a Texas land surveying expert. Extract boundary calls from plat images with exact bearing/distance notation.',
    userPromptTemplate:
      'Extract all boundary calls from this plat image for {{propertyDescription}}. Return JSON with calls array.',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: 0,
    accuracy: 0,
    status: 'active',
  },
  {
    promptId: 'deed_extraction',
    version: 1,
    systemPrompt:
      'You are a Texas land surveying expert. Extract metes and bounds calls from deed documents.',
    userPromptTemplate:
      'Extract all metes and bounds calls from this deed for {{propertyDescription}}. Return JSON with calls array.',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: 0,
    accuracy: 0,
    status: 'active',
  },
  {
    promptId: 'easement_extraction',
    version: 1,
    systemPrompt:
      'You are a Texas land surveying expert. Extract easement details from recorded instruments.',
    userPromptTemplate:
      'Extract easement details from this document: width, purpose, location, grantee. Return JSON.',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 2048,
    temperature: 0,
    accuracy: 0,
    status: 'active',
  },
];
