// lib/quote-attachments.ts
//
// Shared validation for files attached to the public quote-request
// forms (homepage + /contact + the /api/contact server route).
// QUOTE_FORM_UPGRADE slice C.
//
// Customers send a mix of property photos, deed PDFs, scanned plats,
// and the occasional CAD file. The allowlist is intentionally wide;
// the size caps keep emails under Resend's per-message ceiling.

export const QUOTE_ATTACHMENT_MAX_FILES = 10;
export const QUOTE_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

// Extension-based whitelist. Browsers report inconsistent MIME types
// for HEIC, DWG, DXF, etc., so the extension is the source of truth.
export const QUOTE_ATTACHMENT_EXTENSIONS = [
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif',
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  // CAD / mapping
  'dwg', 'dxf', 'kml', 'kmz',
] as const;

// Comma-joined string for the <input accept=""> attribute. Browsers
// use this to filter the file picker. Server side still re-validates.
export const QUOTE_ATTACHMENT_ACCEPT = QUOTE_ATTACHMENT_EXTENSIONS
  .map(ext => `.${ext}`)
  .join(',');

export interface AttachmentValidationError {
  code: 'too-many-files' | 'too-large' | 'bad-type';
  message: string;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

/**
 * Validate a candidate set of files against the quote-attachment
 * caps. Returns null if OK, or a structured error.
 *
 * Callers can pass either browser `File`s or a server-side
 * `{ name, size }` shape — both have what we need.
 */
export function validateQuoteAttachments(
  files: Array<{ name: string; size: number }>
): AttachmentValidationError | null {
  if (files.length > QUOTE_ATTACHMENT_MAX_FILES) {
    return {
      code: 'too-many-files',
      message: `You can attach up to ${QUOTE_ATTACHMENT_MAX_FILES} files. Please remove some and try again.`,
    };
  }
  let total = 0;
  for (const f of files) {
    total += f.size;
    const ext = extensionOf(f.name);
    if (!QUOTE_ATTACHMENT_EXTENSIONS.includes(ext as typeof QUOTE_ATTACHMENT_EXTENSIONS[number])) {
      return {
        code: 'bad-type',
        message: `"${f.name}" is not a supported file type. Allowed: ${QUOTE_ATTACHMENT_EXTENSIONS.join(', ')}.`,
      };
    }
  }
  if (total > QUOTE_ATTACHMENT_MAX_TOTAL_BYTES) {
    return {
      code: 'too-large',
      message: `Attachments total ${formatBytes(total)}. The limit is ${formatBytes(QUOTE_ATTACHMENT_MAX_TOTAL_BYTES)}. Please remove some files.`,
    };
  }
  return null;
}
