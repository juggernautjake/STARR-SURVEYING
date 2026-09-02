import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  attachUploadedDocuments,
  MAX_ATTACHED_BYTES,
  MAX_ATTACHED_FILE_BYTES,
  type UploadedDocumentRow,
} from '@/lib/research/attach-uploaded-documents';

// G1 — "make sure we can upload images and files to start the run so that it has as much info to go
// off of before the run begins."
//
// There is a whole STAGE for this. Upload sits immediately before Research in the workflow and
// `UploadStagePanel` is the last thing an operator touches before the pipeline starts, so it looks
// exactly like giving the run information.
//
// It was not. Uploads land in `research_documents` with `source_type: 'user_upload'`, and neither
// the pipeline route nor the worker ever read them back. The worker's `userFiles` path — which runs
// files through `processUserFiles` and merges them into `documents` immediately before Stage 3 AI
// Extraction — was fed only from the request body, and nothing populated it.
//
// So an operator could upload the client's survey, watch it appear on the project, start the run,
// and have the run never see it. Nothing failed. The file was stored; it just was not research.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const row = (over: Partial<UploadedDocumentRow> = {}): UploadedDocumentRow => ({
  id: 'd1',
  original_filename: 'survey.pdf',
  file_type: 'pdf',
  storage_url: 'https://example.test/survey.pdf',
  file_size_bytes: 1000,
  ...over,
});

const bytesOf = (n: number) => Buffer.alloc(n, 1);
const fetcher = (n = 1000) => async () => bytesOf(n);

describe('the project\'s uploaded documents travel with the run', () => {
  it('CONTROL: an ordinary upload is attached', () => {
    // Without this, "attach nothing" would satisfy every limit below.
    return attachUploadedDocuments([row()], fetcher()).then((r) => {
      expect(r.files).toHaveLength(1);
      expect(r.files[0].filename).toBe('survey.pdf');
      expect(r.notes).toEqual([]);
    });
  });

  it('sends base64, which is what the worker parses', async () => {
    const r = await attachUploadedDocuments([row()], async () => Buffer.from('hello'));
    expect(r.files[0].data).toBe(Buffer.from('hello').toString('base64'));
    expect(r.files[0].size).toBe(5);
  });

  it('maps the file type to something the worker can act on', async () => {
    const r = await attachUploadedDocuments(
      [row({ file_type: 'pdf' }), row({ id: 'd2', original_filename: 'plat.png', file_type: 'png' })],
      fetcher(),
    );
    const types = r.files.map((f) => f.mimeType).sort();
    expect(types).toEqual(['application/pdf', 'image/png']);
  });

  it('marks where they came from, so the run can tell them from what it found', async () => {
    const r = await attachUploadedDocuments([row()], fetcher());
    expect(r.files[0].description).toMatch(/before the run/i);
  });
});

describe('the budget is enforced, and every exclusion is stated', () => {
  it('skips a file too large to ride inline, and SAYS so', async () => {
    const r = await attachUploadedDocuments(
      [row({ file_size_bytes: MAX_ATTACHED_FILE_BYTES + 1 })],
      fetcher(),
    );
    expect(r.files).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/too large/i);
    expect(r.notes.join(' '), 'the operator is not told the file is still on the project')
      .toMatch(/remain on the project/i);
  });

  it('stops at the total budget and says how many did not fit', async () => {
    const big = 6 * 1024 * 1024;
    const rows = Array.from({ length: 6 }, (_, i) => row({ id: `d${i}`, file_size_bytes: big }));
    const r = await attachUploadedDocuments(rows, fetcher(big));
    expect(r.files.length).toBeLessThan(rows.length);
    expect(r.files.reduce((n, f) => n + f.size, 0)).toBeLessThanOrEqual(MAX_ATTACHED_BYTES);
    expect(r.notes.join(' ')).toMatch(/did not fit/i);
  });

  it('does not trust a wrong file_size — the budget is checked against the real bytes', async () => {
    // `file_size` is a recorded number and can be wrong or absent. Trusting it would let the budget
    // be blown by exactly the rows that lied about themselves.
    const rows = [row({ file_size_bytes: 10 }), row({ id: 'd2', file_size_bytes: 10 })];
    const r = await attachUploadedDocuments(rows, async () => bytesOf(MAX_ATTACHED_FILE_BYTES + 1));
    expect(r.files).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/too large/i);
  });

  it('attaches the MOST DOCUMENTS rather than the most bytes', async () => {
    // Smallest first. A run is better served by six deeds than by one enormous scan.
    const rows = [
      row({ id: 'big', file_size_bytes: 7 * 1024 * 1024 }),
      row({ id: 's1', file_size_bytes: 100 }),
      row({ id: 's2', file_size_bytes: 100 }),
    ];
    const r = await attachUploadedDocuments(rows, async (url) => bytesOf(url.includes('big') ? 7 * 1024 * 1024 : 100));
    expect(r.files.length).toBe(3);
    expect(r.files[0].size).toBe(100);
  });

  it('reports a row with no stored file', async () => {
    const r = await attachUploadedDocuments([row({ storage_url: null })], fetcher());
    expect(r.files).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/no stored file/i);
  });

  it('reports a download that failed instead of dropping it silently', async () => {
    const r = await attachUploadedDocuments([row()], async () => { throw new Error('403'); });
    expect(r.files).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/could not be downloaded/i);
  });

  it('an empty project produces no files and no noise', async () => {
    const r = await attachUploadedDocuments([], fetcher());
    expect(r.files).toEqual([]);
    expect(r.notes).toEqual([]);
  });
});

describe('the route actually does it — assert the CALLER', () => {
  const ROUTE = read('app/api/admin/research/[projectId]/pipeline/route.ts');
  const code = ROUTE
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

  it('reads the project\'s user uploads', () => {
    expect(code).toContain("source_type', 'user_upload'");
  });

  it('calls the attacher', () => {
    expect(code).toContain('attachUploadedDocuments(');
  });

  it('sends the result as userFiles — the field the worker has always parsed', () => {
    expect(code).toContain('userFiles: attachedFiles.length > 0 ? attachedFiles : undefined');
  });

  it('files attached to THIS run win over the project library', () => {
    // The re-run dialog's attachments are the operator's most recent statement of what the run
    // should read. Re-adding the whole library behind them would quietly change the request.
    expect(code).toContain('if (!bodyFiles)');
  });

  it('what could not be attached travels with the run, not into a server log', () => {
    // "Six of your twenty documents were attached" is exactly the fact that, left unsaid, makes an
    // operator believe the run read everything they gave it.
    expect(code).toContain('...attachmentNotes');
  });

  it('a failure to attach does not stop the run', () => {
    const at = code.indexOf('attachUploadedDocuments(');
    const block = code.slice(Math.max(0, at - 900), at + 1400);
    expect(block).toContain('catch');
  });
});
