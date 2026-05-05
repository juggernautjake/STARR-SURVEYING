// lib/cad/delivery/deliverable-bundle.ts
//
// Phase 7 §9 — client-deliverable bundle builder. Packages
// every deliverable artifact for a finished job into a single
// downloadable .zip:
//
//   * drawing.dxf            — full sealed (when applicable)
//                              DXF export including TEXT +
//                              symbol blocks
//   * legal-description.txt  — human-readable metes-and-bounds
//                              + notes + certification
//   * survey-description.json— full SurveyDescription record
//                              (revision history, sniffed
//                              title-block fields, acreage)
//   * completeness-report.txt— human-readable check list
//   * audit-trail.json       — RPLSReviewRecord (status,
//                              event log, RPLS / submitter
//                              identity)
//   * seal.json              — SealData (RPLS license, hash,
//                              sealed-at) when present
//   * metadata.json          — top-level summary the
//                              receiving system can index
//                              (project name, jobId, hash,
//                              generatedAt, source versions)
//   * README.txt             — short overview the client can
//                              read without a CAD viewer
//
// Two entry points:
//   * `buildDeliverableBundle(inputs)` — pure; returns the
//     map of filename → string + a manifest. Use this when
//     you need to stream the bundle from a server route.
//   * `downloadDeliverableBundle(inputs)` — browser-side; zips
//     the manifest with JSZip and triggers an anchor-click
//     download. Returns the produced filename + byte size so
//     the caller can surface a toast.

import JSZip from 'jszip';

import type {
  DrawingDocument,
} from '../types';
import type { AnnotationBase } from '../labels/annotation-types';
import { exportToDxf } from './dxf-writer';
import {
  checkDrawingCompleteness,
  summarizeCompleteness,
} from './completeness-checker';
import type {
  CompletenessCheck,
  CompletenessSummary,
} from './completeness-checker';
import type {
  RPLSReviewRecord,
} from './rpls-workflow';
import type { SealData } from './seal-engine';
import type { SurveyDescription } from './description-generator';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface DeliverableBundleInputs {
  doc:           DrawingDocument;
  annotations:   Record<string, AnnotationBase>;
  description:   SurveyDescription | null;
  reviewRecord:  RPLSReviewRecord | null;
}

export interface DeliverableManifest {
  jobId:        string;
  projectName:  string;
  generatedAt:  string;
  status:       'DRAFT' | 'SEALED' | 'APPROVED' | 'DELIVERED' | 'OTHER';
  acreage:      number | null;
  signatureHash: string | null;
  fileList:     string[];
  completeness: CompletenessSummary;
}

export interface DeliverableBundle {
  files:    Record<string, string>;
  manifest: DeliverableManifest;
  /** Suggested filename for the zipped bundle. */
  filename: string;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function buildDeliverableBundle(
  inputs: DeliverableBundleInputs
): DeliverableBundle {
  const { doc, annotations, description, reviewRecord } = inputs;
  const seal = doc.settings.sealData ?? null;

  const dxf = exportToDxf(doc, { annotations });
  const completenessChecks = checkDrawingCompleteness({
    doc,
    annotations,
    queue: null,
    hasLegalDescription: description !== null,
  });
  const completenessSummary = summarizeCompleteness(completenessChecks);
  const generatedAt = new Date().toISOString();
  const status = pickStatus(reviewRecord, seal);

  const files: Record<string, string> = {};
  files['drawing.dxf'] = dxf;
  files['completeness-report.txt'] = renderCompletenessReport(
    completenessChecks,
    completenessSummary
  );
  if (description) {
    files['legal-description.txt'] = renderLegalText(description);
    files['survey-description.json'] = JSON.stringify(description, null, 2);
  }
  if (reviewRecord) {
    files['audit-trail.json'] = JSON.stringify(reviewRecord, null, 2);
  }
  if (seal) {
    files['seal.json'] = JSON.stringify(seal, null, 2);
  }

  // Fix the file list now so the manifest + README list every
  // file we actually ship — including manifest.json + README.txt
  // themselves, which are added below.
  const fileList = [...Object.keys(files), 'metadata.json', 'README.txt'];

  const manifest: DeliverableManifest = {
    jobId: doc.id,
    projectName: doc.settings.titleBlock.projectName || doc.name,
    generatedAt,
    status,
    acreage: description?.acreage ?? null,
    signatureHash: seal?.signatureHash ?? null,
    fileList,
    completeness: completenessSummary,
  };
  files['metadata.json'] = JSON.stringify(manifest, null, 2);
  files['README.txt'] = renderReadme(doc, description, manifest, seal);

  const filename = buildBundleFilename(manifest);
  return { files, manifest, filename };
}

/**
 * Browser-side wrapper that zips + downloads the bundle.
 * Returns the produced filename + byte size so the caller can
 * surface a toast / log line. Throws when invoked outside a
 * browser environment.
 */
export async function downloadDeliverableBundle(
  inputs: DeliverableBundleInputs
): Promise<{ filename: string; byteSize: number; manifest: DeliverableManifest }> {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('downloadDeliverableBundle can only run in the browser.');
  }
  const bundle = buildDeliverableBundle(inputs);
  const zip = new JSZip();
  for (const [name, content] of Object.entries(bundle.files)) {
    zip.file(name, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: bundle.filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return {
    filename: bundle.filename,
    byteSize: blob.size,
    manifest: bundle.manifest,
  };
}

// ────────────────────────────────────────────────────────────
// Renderers
// ────────────────────────────────────────────────────────────

function renderCompletenessReport(
  checks: CompletenessCheck[],
  summary: CompletenessSummary
): string {
  const lines: string[] = [];
  lines.push('DRAWING COMPLETENESS REPORT');
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(
    `Errors: ${summary.errors}    Warnings: ${summary.warnings}    Info: ${summary.infos}`
  );
  lines.push(`Ready for RPLS review: ${summary.ready ? 'YES' : 'NO'}`);
  lines.push('');
  for (const c of checks) {
    const icon = c.passed
      ? '[OK]   '
      : c.severity === 'ERROR'
        ? '[ERROR]'
        : c.severity === 'WARNING'
          ? '[WARN] '
          : '[INFO] ';
    lines.push(`${icon} ${c.label}`);
    if (!c.passed && c.details) {
      lines.push(`         ${c.details}`);
    }
  }
  return lines.join('\n') + '\n';
}

function renderLegalText(description: SurveyDescription): string {
  const lines: string[] = [];
  lines.push('LEGAL DESCRIPTION');
  lines.push('');
  lines.push(description.legalDescription);
  lines.push('');
  lines.push('SURVEY NOTES');
  lines.push('');
  description.surveyNotes.forEach((n, i) => {
    lines.push(`${i + 1}. ${n.text}`);
  });
  lines.push('');
  lines.push('CERTIFICATION');
  lines.push('');
  lines.push(description.certificationText);
  return lines.join('\n') + '\n';
}

function renderReadme(
  doc: DrawingDocument,
  description: SurveyDescription | null,
  manifest: DeliverableManifest,
  seal: SealData | null
): string {
  const tb = doc.settings.titleBlock;
  const lines: string[] = [];
  lines.push(`${manifest.projectName.toUpperCase()} — DELIVERABLE BUNDLE`);
  lines.push('');
  lines.push(`Generated:     ${manifest.generatedAt}`);
  lines.push(`Job ID:        ${manifest.jobId}`);
  lines.push(`Status:        ${manifest.status}`);
  if (manifest.acreage !== null) {
    lines.push(`Acreage:       ${manifest.acreage.toFixed(4)} ac`);
  }
  if (tb.surveyorName) {
    const license = tb.surveyorLicense ? ` (RPLS #${tb.surveyorLicense})` : '';
    lines.push(`Surveyor:      ${tb.surveyorName}${license}`);
  }
  if (tb.firmName) {
    lines.push(`Firm:          ${tb.firmName}`);
  }
  if (tb.clientName) {
    lines.push(`Client:        ${tb.clientName}`);
  }
  if (seal) {
    lines.push(
      `Seal:          ${seal.sealType} (${seal.state}) sealed ${seal.sealedAt}`
    );
    lines.push(`Hash:          ${seal.signatureHash}`);
  }
  lines.push('');
  lines.push('CONTENTS');
  for (const f of manifest.fileList) {
    lines.push(`  - ${f}`);
  }
  lines.push('');
  lines.push('NOTES');
  lines.push(
    '  - drawing.dxf opens in AutoCAD, Civil 3D, Land F/X, QGIS, FME, etc.'
  );
  if (description) {
    lines.push(
      '  - legal-description.txt contains the metes-and-bounds, survey notes,'
    );
    lines.push(
      '    and certification block in plain text for paste-ready use.'
    );
  }
  if (seal) {
    lines.push(
      '  - The signature hash on seal.json validates the drawing has not'
    );
    lines.push(
      '    been modified since sealing. Recompute via the STARR CAD'
    );
    lines.push('    "Drawing completeness" panel to verify integrity.');
  }
  lines.push('');
  lines.push('Generated by STARR Surveying — Phase 7 deliverable pipeline.');
  return lines.join('\n') + '\n';
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function pickStatus(
  reviewRecord: RPLSReviewRecord | null,
  seal: SealData | null
): DeliverableManifest['status'] {
  if (reviewRecord?.status === 'DELIVERED') return 'DELIVERED';
  if (reviewRecord?.status === 'SEALED' || seal !== null) return 'SEALED';
  if (reviewRecord?.status === 'APPROVED') return 'APPROVED';
  if (reviewRecord?.status === 'DRAFT' || !reviewRecord) return 'DRAFT';
  return 'OTHER';
}

function buildBundleFilename(manifest: DeliverableManifest): string {
  const slug = kebabCase(manifest.projectName) || 'drawing';
  const dateStr = isoDateOnly(manifest.generatedAt);
  return `${slug}-${manifest.status.toLowerCase()}-${dateStr}.zip`;
}

function isoDateOnly(iso: string): string {
  // 2026-05-05T05:58:29.714Z → 20260505
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'date';
  return `${match[1]}${match[2]}${match[3]}`;
}

function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
