// allowedPaths.ts — Defines which files/directories the Testing Lab can
// browse, view, edit, and push. Scoped to STARR RECON research & analysis
// code ONLY. The Testing Lab should never modify frontend code, the testing
// suite itself, billing, or infrastructure.
//
// WHY: The Testing Lab is for refining property research scrapers, AI
// analyzers, and county-specific adapters. Changes to those files can be
// tested immediately by hot-deploying the branch to the worker. Frontend
// and infrastructure changes require Vercel builds and are not in scope.

/** Directories the Testing Lab file browser can navigate into. */
export const ALLOWED_BROWSE_PREFIXES = [
  'worker/src/services/',        // Core pipeline services (discovery, harvest, AI extraction)
  'worker/src/adapters/',        // CAD and clerk system adapters (per-vendor)
  'worker/src/counties/',        // County-specific research implementations
  'worker/src/sources/',         // Government data source clients (FEMA, GLO, TCEQ, etc.)
  'worker/src/orchestrator/',    // Pipeline orchestration (master-orchestrator)
  'worker/src/ai/',              // AI prompt registry
  'worker/src/types/',           // Shared pipeline types
  'worker/src/lib/',             // Utilities (logger, coordinates, rate-limiter)
  'worker/src/models/',          // Data models (property intelligence)
  'worker/src/chain-of-title/',  // Chain of title builder
  'worker/src/reports/',         // Report generation (SVG, DXF, PDF)
  'worker/src/exports/',         // Export formats (RW5, JobXML, CSV)
  'STARR_RECON/',                // Planning & spec documents (read-only context)
] as const;

/** Root directories shown in the file browser's top-level view. */
export const BROWSER_ROOT_DIRS = [
  { name: 'services',       path: 'worker/src/services' },
  { name: 'adapters',       path: 'worker/src/adapters' },
  { name: 'counties',       path: 'worker/src/counties' },
  { name: 'sources',        path: 'worker/src/sources' },
  { name: 'orchestrator',   path: 'worker/src/orchestrator' },
  { name: 'ai',             path: 'worker/src/ai' },
  { name: 'types',          path: 'worker/src/types' },
  { name: 'lib',            path: 'worker/src/lib' },
  { name: 'models',         path: 'worker/src/models' },
  { name: 'chain-of-title', path: 'worker/src/chain-of-title' },
  { name: 'reports',        path: 'worker/src/reports' },
  { name: 'exports',        path: 'worker/src/exports' },
  { name: 'specs (read-only)', path: 'STARR_RECON' },
] as const;

/** Directories that are READ-ONLY (can browse/view but not edit/push). */
export const READ_ONLY_PREFIXES = [
  'STARR_RECON/',  // Planning documents — reference only
] as const;

/**
 * Check if a file path is within the allowed STARR RECON scope.
 * Returns true if the path can be browsed/viewed.
 */
export function isPathAllowed(path: string): boolean {
  return ALLOWED_BROWSE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Check if a file path can be edited and pushed.
 * Returns false for read-only paths (specs/planning docs).
 */
export function isPathEditable(path: string): boolean {
  if (!isPathAllowed(path)) return false;
  return !READ_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
}
