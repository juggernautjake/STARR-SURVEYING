// lib/research/artifact-category.ts — what kind of thing a research document is.
//
// A research project accumulates one heterogeneous pile of `research_documents`: uploaded deeds, PDFs
// fetched from a county clerk, plat images, and screenshots the pipeline captured while browsing. The
// row does not say which; the answer is derived from where the file was stored, then its declared
// document type, then its label.
//
// This lives here because it was written twice. `app/api/admin/research/[projectId]/artifacts/route.ts`
// had it, and `full-extract/route.ts` needed the same answer — but reached for a `research_artifacts`
// table that has never existed in any database or seed (platform audit §1.1b/§8.4). It read `category`,
// `description` and `metadata` columns off a table with no rows, so the entire visual half of the
// full-extract pipeline analysed nothing, silently, because the query discarded its error.
//
// The categories are not cosmetic. `screenshots-misc` is the pipeline's bin for error pages, empty
// result sets and auth walls; feeding those to a vision model costs money to learn nothing.

/** Image file extensions the vision pipeline can actually read. */
const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg']);

export function isImageFileType(fileType: string | null | undefined): boolean {
  if (!fileType) return false;
  return IMAGE_TYPES.has(fileType.toLowerCase());
}

export type ArtifactCategory =
  | 'screenshots' | 'screenshots-misc' | 'deeds' | 'plats' | 'surveys' | 'easements'
  | 'fema' | 'txdot' | 'tax' | 'aerial' | 'topo' | 'other';

export function categorizeDocument(
  docType: string | null | undefined,
  storagePath: string | null | undefined,
  label: string | null | undefined,
): ArtifactCategory {
  // Storage path wins: it is where the pipeline itself filed the artifact, so it reflects what the
  // fetcher knew at capture time rather than what a later classifier guessed.
  //
  // `screenshots-misc` MUST be tested before `screenshots` — it is the longer, more specific prefix,
  // and checking the shorter one first would swallow every junk capture into the useful bucket.
  if (storagePath?.includes('/artifacts/screenshots-misc/')) return 'screenshots-misc';
  if (storagePath?.includes('/artifacts/screenshots/')) return 'screenshots';
  if (storagePath?.includes('/artifacts/deed/')) return 'deeds';
  if (storagePath?.includes('/artifacts/plat/')) return 'plats';
  if (storagePath?.includes('/artifacts/easement/')) return 'easements';
  if (storagePath?.includes('/artifacts/fema/')) return 'fema';
  if (storagePath?.includes('/artifacts/txdot/')) return 'txdot';
  if (storagePath?.includes('/artifacts/tax/')) return 'tax';

  // Then the declared document type — set on upload or by the ingesting route.
  if (docType === 'deed' || docType === 'deed_screenshot') return 'deeds';
  if (docType === 'plat' || docType === 'subdivision_plat' || docType === 'plat_screenshot') return 'plats';
  if (docType === 'survey' || docType === 'field_notes' || docType === 'metes_and_bounds') return 'surveys';
  if (docType === 'easement') return 'easements';
  if (docType === 'aerial_photo') return 'aerial';
  if (docType === 'topo_map') return 'topo';
  if (docType === 'appraisal_record' || docType === 'property_report') return 'tax';
  if (docType === 'flood_map') return 'fema';
  if (docType === 'road_map' || docType === 'utility_map') return 'txdot';
  if (docType === 'gis_map' || docType === 'map_screenshot') return 'screenshots';
  if (docType === 'county_record' || docType === 'legal_description') return 'other';

  // Last resort: the human-written label.
  if (label?.toLowerCase().includes('misc screenshot')) return 'screenshots-misc';
  if (label?.toLowerCase().includes('screenshot')) return 'screenshots';

  return 'other';
}

/** The `ResourceType` the vision analyser should use for a document in this category. */
export function visualResourceTypeFor(
  category: ArtifactCategory,
): 'gis_map' | 'plat_document' | 'street_map' | 'flood_map' | 'aerial_imagery' {
  if (category === 'plats') return 'plat_document';
  if (category === 'fema') return 'flood_map';
  if (category === 'txdot') return 'street_map';
  if (category === 'screenshots') return 'gis_map';
  return 'aerial_imagery';
}
