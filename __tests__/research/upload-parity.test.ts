// __tests__/research/upload-parity.test.ts — Phase N4.
//
// ── A LIST YOU COULD NOT ADD TO, BESIDE A FORM YOU COULD NOT SEE THE LIST FROM ──────────────────
//
// Owner: *"be able to upload their own files and images"*. The upload worked. What did not exist
// was parity: the Document Library — the page that IS the files — could only say
//
//     "Run the research pipeline, or upload deeds and plats from the project page."
//
// and the project page's panel renders its own second copy of the same list. Two screens, each
// holding half of one feature, each telling you to go to the other.
//
// ── WHY THE SEQUENCE MOVED RATHER THAN GOT COPIED ───────────────────────────────────────────────
//
// The upload is three calls, not one, and the middle one goes straight to Supabase Storage because
// routing a 40 MB plat through the Next.js body parser returns 413. A second hand-written copy of
// that on the documents page is this repo's *two pipelines* defect: they agree on the day they are
// written and then quietly stop. Specifically, the POST in step 1 is what stamps
// `source_type: 'user_upload'`, and that single value is what every "Uploaded" pill, filter and
// count downstream reads. A copy that posted somewhere slightly different would produce rows that
// look retrieved — indistinguishable from documents the firm actually paid for.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripJs } from '../../scripts/audit-research-contrast.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateFiles, uploadDocuments, ACCEPT_ATTRIBUTE, ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES,
  formatFileSize,
} from '@/app/admin/research/components/upload-documents';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PANEL = 'app/admin/research/components/DocumentUploadPanel.tsx';
const PAGE = 'app/admin/research/[projectId]/documents/page.tsx';
const SHARED = 'app/admin/research/components/upload-documents.ts';

const file = (name: string, size = 1024, type = 'application/pdf'): File =>
  ({ name, size, type }) as File;

describe('there is one upload sequence', () => {
  it('and it lives in the shared module', () => {
    const src = read(SHARED);
    expect(src).toContain('/documents/upload-url');
    expect(src).toContain("method: 'PUT'");
    expect(src).toContain('action=confirm_upload');
  });

  it('the panel calls it instead of carrying its own', () => {
    const src = read(PANEL);
    expect(src).toContain("from './upload-documents'");
    expect(src).toContain('await uploadDocuments(projectId, valid)');
    expect(src, 'the panel still has its own copy of step 1')
      .not.toContain('/documents/upload-url');
  });

  it('and so does the documents page', () => {
    const src = read(PAGE);
    expect(src).toContain('uploadDocuments');
    expect(src, 'the page hand-rolled its own step 1').not.toContain('/documents/upload-url');
  });

  it('control: the route string is real code, so the not.toContain checks bite', () => {
    // The two `not.toContain` assertions above are only meaningful if this exact string is what
    // the sequence uses. Stripped of comments, it appears once — in the fetch — and the header's
    // "1. POST /documents/upload-url" is prose, which is why this counts code rather than the file
    // (measuring the raw file gives 2 and says nothing).
    const code: string = stripJs(read(SHARED));
    expect(code.split('/documents/upload-url').length - 1).toBe(1);
    expect(read(SHARED).split('/documents/upload-url').length - 1)
      .toBeGreaterThan(code.split('/documents/upload-url').length - 1);
  });
});

describe('the accepted-types list exists once', () => {
  it('and the file pickers derive their accept attribute from it', () => {
    // It was hard-coded in the panel's `accept=` as a fourth copy. A picker that disagrees with the
    // validator refuses to OFFER a file the system would happily take, which reads as the file
    // being unsupported.
    expect(read(PANEL)).toContain('accept={ACCEPT_ATTRIBUTE}');
    expect(read(PAGE)).toContain('accept={ACCEPT_ATTRIBUTE}');
    expect(ACCEPT_ATTRIBUTE).toContain('.pdf');
    expect(ACCEPT_ATTRIBUTE).toContain('image/png');
  });

  it('covering the formats a survey firm actually gets', () => {
    for (const ext of ['.pdf', '.png', '.jpg', '.tiff', '.heic']) {
      expect(ACCEPTED_EXTENSIONS.has(ext), `${ext} is not accepted`).toBe(true);
    }
  });
});

describe('validateFiles', () => {
  it('passes an ordinary plat', () => {
    const { valid, errors } = validateFiles([file('plat.pdf')]);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported type, naming it', () => {
    const { valid, errors } = validateFiles([file('notes.exe', 10, 'application/x-msdownload')]);
    expect(valid).toHaveLength(0);
    expect(errors[0]).toContain('.exe');
  });

  it('rejects a file over 50 MB before a single byte travels', () => {
    // The point of a client-side size check: otherwise somebody waits for 60 MB to upload and then
    // learns it was too big.
    const { errors } = validateFiles([file('huge.pdf', MAX_FILE_SIZE_BYTES + 1)]);
    expect(errors[0]).toContain('too large');
  });

  it('rejects a zero-byte file', () => {
    // It uploads perfectly and then fails to process, which reads as a pipeline bug.
    const { errors } = validateFiles([file('empty.pdf', 0)]);
    expect(errors[0]).toContain('empty');
  });

  it('keeps the good files when some are bad', () => {
    // One bad file in a selection of six must not stop the other five.
    const { valid, errors } = validateFiles([
      file('a.pdf'), file('b.exe', 10, 'application/x-msdownload'), file('c.png', 2048, 'image/png'),
    ]);
    expect(valid.map((f) => f.name)).toEqual(['a.pdf', 'c.png']);
    expect(errors).toHaveLength(1);
  });

  it('accepts by MIME type when the extension is missing', () => {
    expect(validateFiles([file('scan', 999, 'image/png')]).valid).toHaveLength(1);
  });
});

describe('uploadDocuments', () => {
  const calls: { url: string; method: string }[] = [];

  const mockFetch = (plan: Record<string, () => Response | Promise<Response>>) =>
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET' });
      const key = Object.keys(plan).find((k) => u.includes(k));
      if (!key) throw new Error(`unplanned fetch: ${u}`);
      return plan[key]!();
    });

  const json = (body: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => body }) as Response;

  beforeEach(() => { calls.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('runs all three steps, in order', () => {
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ docId: 'd1', signedUrl: 'https://sb/put', storagePath: 'p/1' }),
      'https://sb/put': () => json({}),
      'confirm_upload': () => json({}),
    }));

    return uploadDocuments('proj1', [file('plat.pdf')]).then((r) => {
      expect(r.anySuccess).toBe(true);
      expect(r.errors).toHaveLength(0);
      expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT', 'PATCH']);
      expect(calls[0]!.url).toContain('/api/admin/research/proj1/documents/upload-url');
    });
  });

  it('treats a duplicate as success, not as an error', async () => {
    // The server recognised the file as already present. The document the person wanted in the
    // project IS in the project — reporting a failure sends them looking for a problem that is not
    // there.
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ document: { id: 'existing' } }),
    }));

    const r = await uploadDocuments('proj1', [file('plat.pdf')]);
    expect(r.anySuccess).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('deletes the orphaned record when the bytes fail to land', async () => {
    // Without this, a dropped connection leaves a row with no file behind it: a document that
    // lists, opens, and shows nothing.
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ docId: 'd1', signedUrl: 'https://sb/put', storagePath: 'p/1' }),
      'https://sb/put': () => json({}, false, 500),
      'documents?id=d1': () => json({}),
    }));

    const r = await uploadDocuments('proj1', [file('plat.pdf')]);
    expect(r.anySuccess).toBe(false);
    expect(r.errors[0]).toContain('500');
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('id=d1')),
      'the half-created record was left behind').toBe(true);
  });

  it('and when the PUT throws outright', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ docId: 'd1', signedUrl: 'https://sb/put', storagePath: 'p/1' }),
      'https://sb/put': () => { throw new Error('offline'); },
      'documents?id=d1': () => json({}),
    }));

    const r = await uploadDocuments('proj1', [file('plat.pdf')]);
    expect(r.anySuccess).toBe(false);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('a failed step 3 is NOT fatal', async () => {
    // The bytes are stored and the row exists as `pending`; the Retry button re-triggers
    // processing. Treating this as failure would delete a document that uploaded perfectly.
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ docId: 'd1', signedUrl: 'https://sb/put', storagePath: 'p/1' }),
      'https://sb/put': () => json({}),
      'confirm_upload': () => { throw new Error('timeout'); },
    }));

    const r = await uploadDocuments('proj1', [file('plat.pdf')]);
    expect(r.anySuccess).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(calls.some((c) => c.method === 'DELETE'), 'a stored file was deleted').toBe(false);
  });

  it('reports the server error rather than a generic one', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => json({ error: 'Project is locked' }, false, 409),
    }));

    const r = await uploadDocuments('proj1', [file('plat.pdf')]);
    expect(r.errors[0]).toContain('Project is locked');
  });

  it('one bad file does not stop the rest', async () => {
    let first = true;
    vi.stubGlobal('fetch', mockFetch({
      'upload-url': () => {
        if (first) { first = false; return json({ error: 'nope' }, false, 400); }
        return json({ docId: 'd2', signedUrl: 'https://sb/put', storagePath: 'p/2' });
      },
      'https://sb/put': () => json({}),
      'confirm_upload': () => json({}),
    }));

    const r = await uploadDocuments('proj1', [file('bad.pdf'), file('good.pdf')]);
    expect(r.anySuccess, 'the second file was abandoned because the first failed').toBe(true);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('bad.pdf');
  });
});

describe('the documents page can be added to', () => {
  const src = read(PAGE);

  it('has a picker and a handler wired to it', () => {
    expect(src).toContain('data-testid="documents-upload-input"');
    expect(src).toContain('handleFiles(e.target.files)');
  });

  it('accepts a dropped file, and prevents the browser navigating to it', () => {
    // Without `preventDefault` on dragOver the browser opens the file and the page is gone. That
    // failure reads as a crash rather than as an unsupported gesture.
    expect(src).toContain('onDragOver');
    expect(src).toContain('onDrop');
    const at = src.indexOf('onDragOver');
    expect(src.slice(at, at + 120)).toContain('preventDefault');
  });

  it('reloads the list after a successful upload', () => {
    // The file is in the database and not on the screen otherwise, which looks like the upload
    // silently failed.
    const at = src.indexOf('if (anySuccess)');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400)).toContain('loadDocuments()');
  });

  it('says that processing is still to come', () => {
    // A row that lands as "Pending" and stays there for a minute looks stuck unless somebody said
    // it would.
    expect(src).toContain('Processing runs in the background');
  });

  it('and the empty state no longer sends you to another screen', () => {
    expect(src, 'the empty state still points at the project page')
      .not.toContain('upload deeds and plats from the project page');
    expect(src).toContain('drop deeds and plats here');
  });

  it('surfaces upload errors where the list is, as an alert', () => {
    const at = src.indexOf('{uploadError && (');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 220)).toContain('role="alert"');
  });
});

describe('an upload stays distinguishable from a retrieved document', () => {
  it('because one route stamps source_type and both callers use it', () => {
    // This is the property the whole slice rests on. `document-rows.ts` reads `user_upload` for the
    // "Uploaded" pill; the page filters on `isUpload`; the Library counts on it. All of that is
    // downstream of a single POST.
    expect(read('app/api/admin/research/[projectId]/documents/route.ts'))
      .toContain("source_type: 'user_upload'");
    expect(read('app/admin/research/[projectId]/documents/document-rows.ts'))
      .toContain("=== 'user_upload'");
  });

  it('and the page can filter to exactly those', () => {
    expect(read(PAGE)).toContain("if (filter === 'uploaded') return d.isUpload");
    expect(read(PAGE)).toContain("if (filter === 'retrieved') return !d.isUpload");
  });
});

describe('formatFileSize', () => {
  it('reads the way a person would say it', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('says nothing rather than "0 B" when the size is unknown', () => {
    // A blank is honest about not knowing; "0 B" is a claim that the file is empty.
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(0)).toBe('');
  });
});
