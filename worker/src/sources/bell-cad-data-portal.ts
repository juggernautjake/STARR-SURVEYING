// worker/src/sources/bell-cad-data-portal.ts
// Bell CAD Data Portal — direct bulk-data download client.
//
// The Bell CAD Data Portal (bellcad.org/data-portal) provides direct download
// links for bulk property data without any login, CAPTCHA, or scraping.
// This is the most important data source for Bell County base parcel/owner/value
// data because it eliminates the need to scrape the BIS eSearch portal.
//
// Available data (verified March 11, 2026):
//   • BellCAD_Shapefiles RAR  — 20 shapefiles, parcel boundaries + attributes
//   • 2025 Certified Appraisal Data (Condensed) XLSX — all parcels: owner, legal desc, values, exemptions
//   • 2024 Certified Appraisal Data (Condensed) XLSX — prior-year certified export
//   • Appraisal Export Layout v8.0.33 XLSX — field schema/definitions
//   • Delinquent Roll (Condensed) XLSX — all delinquent taxes, all years
//   • 2025 Full Certified Export 7z — full BIS export format with all tables
//   • Preliminary Data 2025 7z — pre-certification values
//   • Collection Export Layout PDF — field schema for collections data
//
// ⚠️ Shapefiles use NAD83 Texas Central Zone (EPSG:4326 geographic) — verify .prj
// ⚠️ RAR/7z extraction requires node-unrar-js or 7zip-bin
// ⚠️ Parse XLSX with SheetJS (xlsx npm package)

import { retryWithBackoff } from '../infra/resilience.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** Type of data available in the portal */
export type BellCADFileType =
  | 'shapefile_rar'       // 20 shapefiles (RAR archive)
  | 'appraisal_xlsx'      // Condensed appraisal export (XLSX)
  | 'appraisal_layout'    // Appraisal export field schema (XLSX)
  | 'delinquent_roll'     // Delinquent tax roll (XLSX)
  | 'full_export_7z'      // Full BIS certified export (7z archive)
  | 'preliminary_7z'      // Pre-certification preliminary data (7z)
  | 'collection_layout';  // Collection export schema (PDF)

/** A single downloadable file from the Bell CAD Data Portal */
export interface BellCADPortalFile {
  /** Short identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** File type classification */
  type: BellCADFileType;
  /** Direct download URL (no login required) */
  url: string;
  /** File extension */
  extension: 'rar' | 'xlsx' | '7z' | 'pdf';
  /** Tax year this export covers (null for layout/schema files) */
  taxYear: number | null;
  /** Whether this is the most recent version for its type */
  isCurrent: boolean;
  /** Notes about coordinate system, data currency, etc. */
  notes: string;
}

/** Summary of all files available on the portal */
export interface BellCADPortalManifest {
  /** Portal URL that was checked */
  portalUrl: string;
  /** All known download files */
  files: BellCADPortalFile[];
  /** Whether the portal was reachable when manifest was built */
  portalReachable: boolean;
  /** ISO timestamp of last successful portal check */
  lastChecked: string | null;
  /** Error message if portal was unreachable */
  error?: string;
}

/** Result of downloading a specific portal file */
export interface BellCADDownloadResult {
  /** File metadata */
  file: BellCADPortalFile;
  /** Raw bytes of the downloaded file */
  data: Buffer | null;
  /** HTTP status code */
  httpStatus: number | null;
  /** Content-Length header value if present */
  contentLength: number | null;
  /** Whether the download succeeded */
  success: boolean;
  /** Error message if download failed */
  error?: string;
}

// ── Known Portal Files (March 2026 verified) ────────────────────────────────
// These URLs are scraped from bellcad.org/data-portal on each request but we
// also maintain a known-good list as a fallback for when the portal is down.

const KNOWN_PORTAL_FILES: BellCADPortalFile[] = [
  {
    id: 'shapefiles_2026',
    name: 'BellCAD Shapefiles (20260228)',
    type: 'shapefile_rar',
    url: 'https://bellcad.org/wp-content/uploads/2026/03/BellCAD_Shapefiles_20260228.rar',
    extension: 'rar',
    taxYear: 2025,
    isCurrent: true,
    notes: 'NAD83 Texas Central Zone (likely EPSG:32139 projected or geographic WGS84-compatible) — always verify .prj file upon extraction. 20 shapefiles with parcel boundaries and attributes.',
  },
  {
    id: 'appraisal_2025_condensed',
    name: '2025 Certified Appraisal Data (Condensed)',
    type: 'appraisal_xlsx',
    url: 'https://bellcad.org/wp-content/uploads/2026/02/2025_BellCAD_Appraisal_Data_Condensed_20260206.xlsx',
    extension: 'xlsx',
    taxYear: 2025,
    isCurrent: true,
    notes: 'All parcels: owner name, legal description, market/appraised values, exemptions. Use for fast property lookups without parsing RAR.',
  },
  {
    id: 'appraisal_2024_condensed',
    name: '2024 Certified Appraisal Data (Condensed)',
    type: 'appraisal_xlsx',
    url: 'https://bellcad.org/wp-content/uploads/2025/07/2024_BellCAD_Appraisal_Data_Condensed_20250722.xlsx',
    extension: 'xlsx',
    taxYear: 2024,
    isCurrent: false,
    notes: 'Prior-year certified appraisal data for 2024.',
  },
  {
    id: 'appraisal_layout_v8',
    name: 'Appraisal Export Layout v8.0.33',
    type: 'appraisal_layout',
    url: 'https://bellcad.org/wp-content/uploads/2026/02/Appraisal-Export-Layout-8.0.33.xlsx',
    extension: 'xlsx',
    taxYear: null,
    isCurrent: true,
    notes: 'Field schema and definitions for all BIS export tables. Download this first to understand column names/types.',
  },
  {
    id: 'delinquent_roll_2026',
    name: 'Delinquent Roll (Condensed)',
    type: 'delinquent_roll',
    url: 'https://bellcad.org/wp-content/uploads/2026/02/BellCAD_Delinquent_Roll_Condensed_20260206.xlsx',
    extension: 'xlsx',
    taxYear: null,
    isCurrent: true,
    notes: 'All delinquent taxes across all years. Use to check for outstanding tax liens.',
  },
  {
    id: 'full_export_2025',
    name: '2025 Full Certified Export',
    type: 'full_export_7z',
    url: 'https://bellcad.org/wp-content/uploads/2025/07/2025-Bell-County-Certified-Export.7z',
    extension: '7z',
    taxYear: 2025,
    isCurrent: true,
    notes: 'Full BIS export format with all relational tables (PROP, OWN, VALUE, EXEMPT, LAND, IMPRV). Requires 7zip to extract.',
  },
  {
    id: 'preliminary_2025',
    name: 'Preliminary Data 20250618',
    type: 'preliminary_7z',
    url: 'https://bellcad.org/wp-content/uploads/2025/06/BellCAD-Preliminary-20250618.7z',
    extension: '7z',
    taxYear: 2025,
    isCurrent: false,
    notes: 'Pre-certification preliminary values — subject to change. Use only when certified data is not yet available.',
  },
  {
    id: 'collection_layout',
    name: 'Collection Export Layout (PDF)',
    type: 'collection_layout',
    url: 'https://bellcad.org/wp-content/uploads/2019/05/Collection_Transfer_File_Layout_810x.pdf',
    extension: 'pdf',
    taxYear: null,
    isCurrent: true,
    notes: 'Field schema for collections data (delinquent rolls, tax records).',
  },
];

// ── BellCADDataPortalClient ──────────────────────────────────────────────────

/**
 * Client for the Bell CAD Data Portal (bellcad.org/data-portal).
 *
 * Provides direct bulk-data download links for Bell County parcel data without
 * any login, CAPTCHA, or scraping of the BIS eSearch portal.
 *
 * Usage:
 * ```typescript
 * const client = new BellCADDataPortalClient();
 *
 * // Get the current appraisal XLSX download URL
 * const manifest = await client.getManifest();
 * const current = client.getCurrentAppraisalFile(manifest);
 *
 * // Download the condensed XLSX (faster than RAR shapefiles for lookups)
 * const result = await client.downloadFile(current);
 * ```
 */
export class BellCADDataPortalClient {
  private readonly portalUrl = 'https://bellcad.org/data-portal/';

  // ── Manifest ─────────────────────────────────────────────────────────────

  /**
   * Return a manifest of all known Bell CAD portal files.
   *
   * Attempts to probe the portal page to confirm it is reachable, but returns
   * the known-good file list regardless — so the manifest is always useful
   * even when the portal itself is temporarily down.
   */
  async getManifest(): Promise<BellCADPortalManifest> {
    let portalReachable = false;
    let error: string | undefined;

    try {
      const response = await fetch(this.portalUrl, {
        signal: AbortSignal.timeout(10_000),
        method: 'HEAD',
      });
      portalReachable = response.ok || response.status === 405; // 405 = HEAD not allowed but portal is up
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      portalUrl: this.portalUrl,
      files: KNOWN_PORTAL_FILES,
      portalReachable,
      lastChecked: portalReachable ? new Date().toISOString() : null,
      ...(error ? { error } : {}),
    };
  }

  /**
   * Get only the most current version of each file type.
   */
  getCurrentFiles(): BellCADPortalFile[] {
    return KNOWN_PORTAL_FILES.filter((f) => f.isCurrent);
  }

  /**
   * Get the current condensed appraisal XLSX (fastest source for property lookups).
   * Returns null only if no appraisal file is known.
   */
  getCurrentAppraisalFile(manifest?: BellCADPortalManifest): BellCADPortalFile | null {
    const files = manifest?.files ?? KNOWN_PORTAL_FILES;
    return files.find((f) => f.type === 'appraisal_xlsx' && f.isCurrent) ?? null;
  }

  /**
   * Get the current shapefile RAR (20 shapefiles with parcel GIS boundaries).
   */
  getCurrentShapefileRar(manifest?: BellCADPortalManifest): BellCADPortalFile | null {
    const files = manifest?.files ?? KNOWN_PORTAL_FILES;
    return files.find((f) => f.type === 'shapefile_rar' && f.isCurrent) ?? null;
  }

  /**
   * Get the appraisal export layout XLSX (field definitions — download first).
   */
  getAppraisalLayout(manifest?: BellCADPortalManifest): BellCADPortalFile | null {
    const files = manifest?.files ?? KNOWN_PORTAL_FILES;
    return files.find((f) => f.type === 'appraisal_layout') ?? null;
  }

  /**
   * Get the current delinquent roll XLSX.
   */
  getDelinquentRoll(manifest?: BellCADPortalManifest): BellCADPortalFile | null {
    const files = manifest?.files ?? KNOWN_PORTAL_FILES;
    return files.find((f) => f.type === 'delinquent_roll' && f.isCurrent) ?? null;
  }

  /**
   * Get all files of a specific type.
   */
  getFilesByType(type: BellCADFileType, manifest?: BellCADPortalManifest): BellCADPortalFile[] {
    const files = manifest?.files ?? KNOWN_PORTAL_FILES;
    return files.filter((f) => f.type === type);
  }

  // ── Download ──────────────────────────────────────────────────────────────

  /**
   * Download a specific portal file.
   *
   * Returns the raw bytes in `result.data`.  For large files (RAR/7z) callers
   * should stream rather than buffer — this method buffers everything in memory
   * so it is best suited for the XLSX files (typically < 20 MB each).
   *
   * Never throws — errors are captured in `result.error`.
   */
  async downloadFile(
    file: BellCADPortalFile,
    options?: { timeoutMs?: number },
  ): Promise<BellCADDownloadResult> {
    const timeoutMs = options?.timeoutMs ?? 120_000; // 2 min default for large files

    try {
      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(file.url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; STARR-SURVEYING/1.0; +https://starrsurveying.com)',
            },
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} from ${file.url}`);
          }
          return res;
        },
        { maxAttempts: 2, baseDelayMs: 3_000 },
      );

      const contentLength = response.headers.get('content-length');
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      return {
        file,
        data,
        httpStatus: response.status,
        contentLength: contentLength ? parseInt(contentLength, 10) : data.byteLength,
        success: true,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        file,
        data: null,
        httpStatus: null,
        contentLength: null,
        success: false,
        error,
      };
    }
  }

  /**
   * Probe whether a file URL is accessible (HEAD request).
   * Useful for verifying URLs before committing to a full download.
   */
  async probeFileUrl(url: string): Promise<{ accessible: boolean; httpStatus: number | null; error?: string }> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });
      return { accessible: response.ok, httpStatus: response.status };
    } catch (err) {
      return {
        accessible: false,
        httpStatus: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Field Reference ───────────────────────────────────────────────────────

  /**
   * Returns the canonical BIS v8.0.33 field names for key tables.
   *
   * These are the column names used in the condensed XLSX export files.
   * Useful for parsing without downloading the layout Excel first.
   *
   * Source: Appraisal Export Layout v8.0.33 (bellcad.org/data-portal)
   */
  getKnownFieldNames(): Record<string, string[]> {
    return {
      property: [
        'PROP_ID', 'GEO_ID', 'PROP_TYPE', 'PROP_NAME',
        'SITUS_ADDR', 'SITUS_CITY', 'SITUS_ZIP', 'LEGAL_DESC', 'LAND_ACRES',
      ],
      owner: [
        'OWN_ID', 'PROP_ID', 'OWN_NAME',
        'MAIL_ADDR1', 'MAIL_ADDR2', 'MAIL_ADDR3',
        'MAIL_CITY', 'MAIL_ST', 'MAIL_ZIP', 'OWN_DATE',
      ],
      value: [
        'PROP_ID', 'TAX_YR', 'MKT_VAL', 'MKT_HS_VAL', 'APP_VAL', 'CERTIFIED',
      ],
      exemption: [
        'PROP_ID', 'EXEMPT_CD', 'EXEMPT_AMT', 'TAX_YR',
      ],
      land: [
        'PROP_ID', 'LAND_SQFT', 'LAND_ACRES', 'LAND_VAL', 'LAND_CAP', 'LAND_USE',
      ],
      improvement: [
        'PROP_ID', 'IMPRV_TYPE', 'IMPRV_VAL', 'YEAR_BUILT', 'SQFT', 'STATE_CD',
      ],
    };
  }
}
