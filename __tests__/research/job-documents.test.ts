// __tests__/research/job-documents.test.ts — what the AI gets handed, and what it does not.
//
// Owner, 2026-09-21: "the user has to select which files he wants to be included in the AI research
// pipeline and analysis."
//
// The selection is the operator's. What this module decides is what is TICKED when the dialog
// opens, and that default has a real cost attached: every ticked file is copied into the research
// project and read by a model that charges per page.
//
// Measured on this database, 2026-09-21: 182 job files, 147 of them photographs and video. A
// default of "everything" would hand a run seventy pictures of a fence.

import { describe, it, expect } from 'vitest';
import {
  classify, offerJobFiles, suggestedIds, describeOffer, MAX_ATTACH_BYTES,
  type JobFileForResearch,
} from '@/lib/research/job-documents';

const f = (over: Partial<JobFileForResearch> & { id: string; name: string }): JobFileForResearch => ({
  contentType: null, section: null, sizeBytes: 1024, ...over,
});

describe('classify', () => {
  it.each([
    ['pdf', 'application/pdf', 'deed.pdf'],
    ['word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'notes.docx'],
    ['csv', 'text/csv', 'points.csv'],
    ['plain text', 'text/plain', 'field.txt'],
  ])('%s is a document', (_l, mime, name) => {
    expect(classify(f({ id: '1', name, contentType: mime }))).toBe('document');
  });

  it.each([
    ['jpeg', 'image/jpeg', 'IMG_4471.jpg'],
    ['png', 'image/png', 'shot.png'],
    ['mp4', 'video/mp4', 'walk.mp4'],
    ['quicktime', 'video/quicktime', 'walk.mov'],
    ['audio', 'audio/m4a', 'memo.m4a'],
  ])('%s is media', (_l, mime, name) => {
    expect(classify(f({ id: '1', name, contentType: mime }))).toBe('media');
  });

  it('falls back to the extension when the mime type is empty', () => {
    // Two rows in this database have an empty content_type. The extension is the only other thing
    // the file says about itself.
    expect(classify(f({ id: '1', name: 'deed.pdf', contentType: '' }))).toBe('document');
    expect(classify(f({ id: '2', name: 'IMG_1.HEIC', contentType: '' }))).toBe('media');
    expect(classify(f({ id: '3', name: 'thing.xyz', contentType: '' }))).toBe('other');
    expect(classify(f({ id: '4', name: 'noextension', contentType: null }))).toBe('other');
  });

  it('trusts the mime type over the folder', () => {
    // `section` is where somebody dropped the file, not what it is — and `general` already holds
    // PDFs, JPEGs and CSVs. A deed scanned into the photos folder is still a deed.
    expect(classify(f({ id: '1', name: 'deed.pdf', contentType: 'application/pdf', section: 'photos' })))
      .toBe('document');
    expect(classify(f({ id: '2', name: 'corner.jpg', contentType: 'image/jpeg', section: 'general' })))
      .toBe('media');
  });
});

describe('what is ticked when the dialog opens', () => {
  const files = [
    f({ id: 'a', name: 'deed.pdf', contentType: 'application/pdf' }),
    f({ id: 'b', name: 'IMG_1.jpg', contentType: 'image/jpeg' }),
    f({ id: 'c', name: 'walk.mp4', contentType: 'video/mp4' }),
    f({ id: 'd', name: 'plat.pdf', contentType: 'application/pdf' }),
  ];

  it('documents yes, photos and video no', () => {
    expect(suggestedIds(files).sort()).toEqual(['a', 'd']);
  });

  it('every offer explains itself', () => {
    // An unticked box with no reason next to it looks like a bug, and somebody re-ticks all of them
    // to be safe — which is the behaviour this default exists to avoid.
    for (const o of offerJobFiles(files)) {
      expect(o.why.length, o.name).toBeGreaterThan(10);
    }
  });

  it('documents sort first so the two that matter are not inside seventy photos', () => {
    const many = [
      ...Array.from({ length: 30 }, (_, i) => f({ id: `p${i}`, name: `IMG_${i}.jpg`, contentType: 'image/jpeg' })),
      f({ id: 'deed', name: 'deed.pdf', contentType: 'application/pdf' }),
    ];
    expect(offerJobFiles(many)[0]!.id).toBe('deed');
  });

  it('nothing is hidden — every file comes back', () => {
    // The default decides what is TICKED. It must never decide what is visible: a deed misfiled as
    // a .jpg has to still be reachable.
    expect(offerJobFiles(files)).toHaveLength(files.length);
  });
});

describe('the size cap', () => {
  const huge = f({ id: 'v', name: 'drone.mp4', contentType: 'video/mp4', sizeBytes: MAX_ATTACH_BYTES + 1 });

  it('is never suggested', () => {
    expect(offerJobFiles([huge])[0]!.suggested).toBe(false);
  });

  it('says it is the SIZE, not the kind', () => {
    // The dialog disables the checkbox on this exact wording. If the reason changed to something
    // else the file would silently become selectable and the copy would time out.
    expect(offerJobFiles([huge])[0]!.why).toMatch(/^too large/);
  });

  it('a large DOCUMENT is capped too', () => {
    const bigPdf = f({ id: 'p', name: 'survey.pdf', contentType: 'application/pdf', sizeBytes: MAX_ATTACH_BYTES + 1 });
    expect(offerJobFiles([bigPdf])[0]!.suggested).toBe(false);
    expect(offerJobFiles([bigPdf])[0]!.why).toMatch(/^too large/);
  });

  it('one byte under the cap is fine', () => {
    const ok = f({ id: 'p', name: 'survey.pdf', contentType: 'application/pdf', sizeBytes: MAX_ATTACH_BYTES });
    expect(offerJobFiles([ok])[0]!.suggested).toBe(true);
  });
});

describe('describeOffer', () => {
  it('counts the kinds in plain words', () => {
    const s = describeOffer([
      f({ id: 'a', name: 'deed.pdf', contentType: 'application/pdf' }),
      f({ id: 'b', name: 'IMG_1.jpg', contentType: 'image/jpeg' }),
      f({ id: 'c', name: 'IMG_2.jpg', contentType: 'image/jpeg' }),
    ]);
    expect(s).toContain('1 document');
    expect(s).toContain('2 photos');
  });

  it('says so when there are none', () => {
    expect(describeOffer([])).toBe('This job has no files yet.');
  });

  it('gets the singular right', () => {
    expect(describeOffer([f({ id: 'a', name: 'd.pdf', contentType: 'application/pdf' })]))
      .toBe('1 document');
  });
});

describe('thumbnails ride along for the picker', () => {
  it('passes a thumbnail through untouched', () => {
    const o = offerJobFiles([
      f({ id: 'a', name: 'deed.pdf', contentType: 'application/pdf', thumbUrl: 'https://x/t.png', url: 'https://x/f.pdf' }),
    ])[0]!;
    expect(o.thumbUrl).toBe('https://x/t.png');
    expect(o.url).toBe('https://x/f.pdf');
  });

  it('a missing thumbnail is ordinary, not an error', () => {
    // thumb_state is `pending` until a browser makes one, and `unsupported` when nothing can. The
    // picker draws a labelled placeholder; a broken-image icon would read as a broken FILE and
    // somebody would leave the deed out because it looked corrupt.
    const o = offerJobFiles([f({ id: 'a', name: 'deed.pdf', contentType: 'application/pdf' })])[0]!;
    expect(o.thumbUrl ?? null).toBeNull();
    expect(o.suggested, 'and it is still suggested').toBe(true);
  });
});
