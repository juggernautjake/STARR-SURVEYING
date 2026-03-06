// worker/src/services/adjacent-queue-builder.ts — Phase 5 Step 1
// Builds the ordered research queue of adjacent properties from Phase 3/4 data.
// Consumes PropertyIntelligence (Phase 3) and optionally SubdivisionModel (Phase 4)
// to produce an ordered list of AdjacentResearchTask items for the research worker.
//
// Spec §5.3 — Adjacent Research Queue Builder
// Phase 4 handoff: SubdivisionModel.lotRelationships.adjacencyMatrix is consumed here
// to discover external neighbors ("external:OWNER_NAME" entries) from Phase 4.

import type { PropertyIntelligence, AdjacentProperty } from '../models/property-intelligence.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * One entry in the adjacent research queue.
 * Ordered by priority (1 = highest, longer shared boundaries = higher priority).
 */
export interface AdjacentResearchTask {
  /** Primary name to search for (from plat/deed data) */
  owner: string;
  /** Alternate spellings, initials, legal entities, etc. */
  alternateNames: string[];
  /** Called acreages found from all plat/deed references */
  calledAcreages: number[];
  /** Cardinal direction of the shared boundary */
  sharedDirection: string;
  /** Phase 3 callIds on the shared boundary (for cross-validation later) */
  sharedCallIds: string[];
  /** Estimated shared boundary length in feet (longer → higher priority) */
  estimatedSharedLength: number;
  /** 1 = highest priority */
  priority: number;
  /** Instrument# or vol/pg hints discovered from plat/deed (enables direct clerk search) */
  instrumentHints: string[];
  /** Where this task originated from */
  source: 'plat' | 'deed' | 'adjacency_matrix' | 'cad';
}

// ── AdjacentQueueBuilder ───────────────────────────────────────────────────────

export class AdjacentQueueBuilder {

  /**
   * Build the research queue from Phase 3 intelligence and (optionally) Phase 4 subdivision model.
   * De-duplicates by normalized owner name and assigns priority by shared boundary length.
   */
  buildQueue(
    intelligence: PropertyIntelligence,
    subdivisionModel?: Record<string, unknown>,
  ): AdjacentResearchTask[] {
    const tasks: AdjacentResearchTask[] = [];
    const ownerIndex = new Map<string, AdjacentResearchTask>();

    // ── Source 1: Adjacent properties from Phase 3 intelligence ─────────────
    for (const adj of (intelligence.adjacentProperties as AdjacentProperty[] | undefined) ?? []) {
      const key = this.normalizeOwnerName(adj.owner ?? '');
      if (key === '' || key === 'UNKNOWN') continue;
      // Roads are handled by Phase 6 (TxDOT ROW), not Phase 5
      if (this.isRoad(adj.owner ?? '')) continue;

      const existing = ownerIndex.get(key);
      if (existing) {
        // Merge called acreages from duplicate entries
        for (const ac of adj.calledAcreages ?? []) {
          if (!isNaN(ac) && !existing.calledAcreages.includes(ac)) {
            existing.calledAcreages.push(ac);
          }
        }
        // Merge instrument hints
        for (const inst of (adj.instrumentNumbers ?? [])) {
          if (!existing.instrumentHints.includes(inst)) existing.instrumentHints.push(inst);
        }
        continue;
      }

      const task: AdjacentResearchTask = {
        owner:                 adj.owner ?? '',
        alternateNames:        this.generateNameVariants(adj.owner ?? ''),
        calledAcreages:        [...(adj.calledAcreages ?? [])],
        sharedDirection:       adj.sharedBoundary ?? 'unknown',
        sharedCallIds:         this.findSharedCallIds(intelligence, adj),
        estimatedSharedLength: this.estimateSharedLength(intelligence, adj),
        priority:              0,
        instrumentHints:       [...(adj.instrumentNumbers ?? [])],
        source:                'plat',
      };
      ownerIndex.set(key, task);
      tasks.push(task);
    }

    // ── Source 2: Deed chain "called-from" references ────────────────────────
    for (const entry of (intelligence.deedChain ?? [])) {
      // DeedChainEntry may optionally have a calledFrom field if it was extended
      // in a future version. Use safe runtime access to avoid type errors.
      const calledFrom = (entry as unknown as Record<string, unknown>).calledFrom as
        Array<{ name?: string; acreage?: number; reference?: string; direction?: string }> | undefined;

      for (const cf of calledFrom ?? []) {
        const key = this.normalizeOwnerName(cf.name ?? '');
        if (key === '' || this.isRoad(cf.name ?? '')) continue;

        if (!ownerIndex.has(key)) {
          const task: AdjacentResearchTask = {
            owner:                 cf.name ?? '',
            alternateNames:        this.generateNameVariants(cf.name ?? ''),
            calledAcreages:        cf.acreage != null ? [cf.acreage] : [],
            sharedDirection:       cf.direction ?? 'unknown',
            sharedCallIds:         [],
            estimatedSharedLength: 0,
            priority:              0,
            instrumentHints:       cf.reference ? [cf.reference] : [],
            source:                'deed',
          };
          ownerIndex.set(key, task);
          tasks.push(task);
        }
      }
    }

    // ── Source 3: Phase 4 adjacency matrix (external neighbors) ─────────────
    if (subdivisionModel?.lotRelationships) {
      const matrix = (subdivisionModel.lotRelationships as Record<string, unknown>).adjacencyMatrix as
        Record<string, Record<string, string[]>> | undefined;

      for (const adjacencies of Object.values(matrix ?? {})) {
        for (const [direction, neighbors] of Object.entries(adjacencies)) {
          for (const neighbor of (Array.isArray(neighbors) ? neighbors : [])) {
            // Phase 4 marks external owners as "external:OWNER_NAME"
            if (typeof neighbor !== 'string' || !neighbor.startsWith('external:')) continue;
            const externalName = neighbor.replace(/^external:/i, '').trim();
            if (!externalName || externalName.toUpperCase() === 'PERIMETER') continue;
            if (this.isRoad(externalName)) continue;

            const key = this.normalizeOwnerName(externalName);
            if (!ownerIndex.has(key)) {
              const task: AdjacentResearchTask = {
                owner:                 externalName,
                alternateNames:        this.generateNameVariants(externalName),
                calledAcreages:        [],
                sharedDirection:       direction,
                sharedCallIds:         [],
                estimatedSharedLength: 0,
                priority:              0,
                instrumentHints:       [],
                source:                'adjacency_matrix',
              };
              ownerIndex.set(key, task);
              tasks.push(task);
            }
          }
        }
      }
    }

    // ── Assign priorities ────────────────────────────────────────────────────
    // Sort by shared length (descending) — longer shared boundary = higher priority
    tasks.sort((a, b) => b.estimatedSharedLength - a.estimatedSharedLength);
    tasks.forEach((t, i) => { t.priority = i + 1; });

    // Boost tasks with known instrument# hints (direct clerk search is faster and more reliable)
    for (const task of tasks) {
      if (task.instrumentHints.length > 0) {
        task.priority = Math.max(1, task.priority - 2);
      }
    }
    // Re-sort after priority boost
    tasks.sort((a, b) => a.priority - b.priority);
    tasks.forEach((t, i) => { t.priority = i + 1; });

    return tasks;
  }

  /**
   * Normalize an owner name for de-duplication: uppercase, remove punctuation, collapse spaces.
   */
  normalizeOwnerName(name: string): string {
    return name
      .toUpperCase()
      .replace(/[.,;:'"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate alternate name spellings for a property owner:
   * - Last name only
   * - "LAST, FIRST" format
   * - Stripped business suffixes (LLC, TRUST, etc.)
   * - Initials with/without dots
   */
  generateNameVariants(name: string): string[] {
    const variants: string[] = [name];
    const upper = name.toUpperCase().trim();

    // Strip business suffixes
    const suffixes = [
      'LLC', 'INC', 'CORP', 'LP', 'LTD', 'TRUST', 'FAMILY TRUST', 'LIVING TRUST',
      'REVOCABLE TRUST', 'IRREVOCABLE TRUST', 'ET AL', 'ET UX', 'ET VIR', 'ESTATE',
    ];
    for (const suffix of suffixes) {
      if (upper.endsWith(suffix)) {
        variants.push(upper.slice(0, -suffix.length).trim());
      }
    }

    // Name permutations for individuals
    const parts = upper.split(/\s+/);
    if (parts.length >= 2) {
      variants.push(parts[parts.length - 1]);                     // Last name only
      variants.push(`${parts[parts.length - 1]}, ${parts[0]}`);  // "LAST, FIRST"
      variants.push(parts.slice(0, 2).join(' '));                 // First two words
    }

    // Handle "R.K." → "RK" and "R. K." → "RK"
    const withoutDots = upper.replace(/\./g, '');
    if (withoutDots !== upper) variants.push(withoutDots);
    const withSpacedDots = upper.replace(/\.(\S)/g, '. $1');
    if (withSpacedDots !== upper) variants.push(withSpacedDots);

    // Deduplicate and filter out entries that are too short to be useful
    return [...new Set(variants)].filter((v) => v.length >= 3);
  }

  /**
   * Returns true if the name refers to a road/highway (handled by Phase 6, not Phase 5).
   */
  isRoad(name: string): boolean {
    const upper = name.toUpperCase();
    return (
      /^(FM|RM|SH|US|IH|CR|SPUR|LOOP|STATE\s+HWY|COUNTY\s+ROAD|INTERSTATE)\s*\d/.test(upper) ||
      /\b(ROW|RIGHT.OF.WAY|HIGHWAY|ROAD)\b/.test(upper)
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private findSharedCallIds(intelligence: PropertyIntelligence, adj: AdjacentProperty): string[] {
    const ids: string[] = [];
    const ownerUpper = (adj.owner ?? '').toUpperCase();

    // Check lot boundary calls
    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (call.along && call.along.toUpperCase().includes(ownerUpper)) {
          ids.push(call.callId);
        }
      }
    }

    // Check perimeter boundary calls (if present in intelligence)
    const perimBoundary = (intelligence as unknown as Record<string, unknown>).perimeterBoundary as
      { calls?: { callId?: string; along?: string }[] } | undefined;
    for (const call of perimBoundary?.calls ?? []) {
      if (call.along && call.along.toUpperCase().includes(ownerUpper) && call.callId) {
        ids.push(call.callId);
      }
    }

    // Use explicitly stored sharedCalls from Phase 3 (callIds from SharedBoundaryCall)
    for (const sc of adj.sharedCalls ?? []) {
      if (sc.callId && !ids.includes(sc.callId)) ids.push(sc.callId);
    }

    return [...new Set(ids)];
  }

  private estimateSharedLength(intelligence: PropertyIntelligence, adj: AdjacentProperty): number {
    let total = 0;
    const callIds = this.findSharedCallIds(intelligence, adj);

    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (callIds.includes(call.callId)) {
          total += (call.distance ?? 0);
        }
      }
    }

    return total;
  }
}
