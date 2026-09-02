import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  rejectionReason,
  stripDataUrlPrefix,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type RunFile,
} from '@/app/admin/research/components/RunFileAttachments';

// Phases F and G.
//
// ── F: THE PREMISE WAS FALSE, AS THE PLAN SUSPECTED ─────────────────────────────────────────────
//
// "I do not think that we have made it so that when the user is typing in the address that the
// system autocompletes it." The new-project intake has had Google Places autocomplete filling city,
// county, state and ZIP from one selection, and it is mounted. What did NOT have it was the RE-RUN
// dialog — four free-text boxes — which is the one place a corrected address actually gets typed,
// because being editable is the entire reason that dialog exists.
//
// ── G: EVERY PART EXISTED EXCEPT THE PART A PERSON TOUCHES ──────────────────────────────────────
//
//   worker/src/index.ts   has parsed `userFiles` since it was written
//   the pipeline route    forwards them
//   useRunState.start()   puts them in the POST body
//   …the UI               never collected one
//
// A survey the client emailed is the single most useful thing a run can be given, and there was
// nowhere to put it.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const file = (name: string, size: number) => ({ name, size });
const attached = (name: string, size: number): RunFile =>
  ({ filename: name, mimeType: 'application/pdf', data: 'x', size });

describe('what may be attached to a run', () => {
  it('CONTROL: an ordinary file is accepted', () => {
    // Without this, "reject everything" would satisfy every rule below.
    expect(rejectionReason(file('survey.pdf', 400_000), [])).toBeNull();
  });

  it('rejects a file too large to ride inside the request', () => {
    // These are base64-encoded into a JSON body, which inflates by a third and is held in memory at
    // both ends. lib/storage/uploads.ts allows 500 MB because that is a streamed bucket upload — a
    // different thing wearing the same word.
    const why = rejectionReason(file('huge.tif', MAX_FILE_BYTES + 1), []);
    expect(why).toBeTruthy();
    expect(why).toContain('huge.tif');
    expect(why, 'the rejection does not say where to put it instead').toMatch(/documents instead/i);
  });

  it('rejects the file that would take the run past the total', () => {
    const already = [attached('a.pdf', MAX_TOTAL_BYTES - 1000)];
    const why = rejectionReason(file('b.pdf', 5000), already);
    expect(why).toBeTruthy();
    expect(why).toContain('already attached');
  });

  it('counts the total, so ten small files cannot do what one big one may not', () => {
    const already = Array.from({ length: 3 }, (_, i) => attached(`f${i}.pdf`, 6 * 1024 * 1024));
    expect(rejectionReason(file('one-more.pdf', 6 * 1024 * 1024), already)).toBeTruthy();
  });

  it('rejects an empty file rather than sending nothing', () => {
    expect(rejectionReason(file('blank.pdf', 0), [])).toMatch(/empty/i);
  });

  it('rejects a duplicate by name', () => {
    expect(rejectionReason(file('survey.pdf', 100), [attached('survey.pdf', 100)]))
      .toMatch(/already attached/i);
  });

  it('names the file in every rejection — a nameless one is unactionable', () => {
    const cases: Array<[{ name: string; size: number }, RunFile[]]> = [
      [file('big.pdf', MAX_FILE_BYTES + 1), []],
      [file('empty.pdf', 0), []],
      [file('dupe.pdf', 10), [attached('dupe.pdf', 10)]],
    ];
    for (const [f, already] of cases) {
      expect(rejectionReason(f, already)).toContain(f.name);
    }
  });
});

describe('the base64 the worker will parse', () => {
  it('strips the data URL prefix a FileReader produces', () => {
    // The worker does String(f.data) and hands it on. Leaving `data:application/pdf;base64,` on the
    // front produces a file that decodes to garbage, with nothing failing on the way.
    expect(stripDataUrlPrefix('data:application/pdf;base64,AAAA')).toBe('AAAA');
  });

  it('leaves a bare base64 string alone', () => {
    expect(stripDataUrlPrefix('AAAA')).toBe('AAAA');
  });
});

describe('sizes read as sizes', () => {
  it('uses units a person reads', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('the re-run dialog collects what the run can be given', () => {
  const DIALOG = read('app/admin/research/components/RerunDialog.tsx');

  it('F4: the address field is the autocomplete, not a bare input', () => {
    expect(DIALOG).toContain('<AddressAutocomplete');
  });

  it('F4: selecting a suggestion fills the COUNTY — the field that routes the run', () => {
    // A re-run typed with the wrong county researches the wrong courthouse and reports the result as
    // a finding about the property.
    expect(DIALOG).toMatch(/details\.county.*set\('county'|set\('county', details\.county\)/s);
  });

  it('F4: an empty county from Google does not clear a good one', () => {
    // The dangerous default. `set('county', details.county)` unconditionally would wipe a county the
    // operator typed correctly whenever Google resolved an address without one.
    expect(DIALOG).toContain('if (details.county)');
  });

  it('G2: it mounts the attachment control', () => {
    expect(DIALOG).toContain('<RunFileAttachments');
  });

  it('G2: and actually SENDS the files — assert the caller', () => {
    // The whole gap this closes was a payload field nothing populated. A picker whose files never
    // reach the POST body would reproduce it exactly.
    expect(DIALOG).toContain('userFiles: attachments.length > 0 ? attachments : undefined');
  });

  it('G2: attachments are not seeded from the previous run', () => {
    // FormState is seeded from what the LAST run was told. Re-presenting its attachments as this
    // run's would be the same mistake the operator notes deliberately avoid.
    const at = DIALOG.indexOf('const [attachments, setAttachments]');
    expect(at, 'attachments moved into the seeded form state').toBeGreaterThan(-1);
    expect(DIALOG.slice(at, at + 120)).toContain('useState<RunFile[]>([])');
  });

  it('G2: attaching a file counts as a change to the run', () => {
    // Otherwise the dialog reports "nothing changed" with a survey attached, and records the run as
    // `rerun_same` — which is what the run list uses to explain a different report six weeks later.
    expect(DIALOG).toContain('file(s) attached to this run');
    expect(DIALOG, 'the change summary will not recompute when files are added')
      .toContain('attachments.length]');
  });
});

describe('the chain the files travel down still exists', () => {
  it('the hook forwards userFiles', () => {
    const HOOK = read('app/admin/research/components/useRunState.ts');
    expect(HOOK).toContain('userFiles: input.userFiles?.length ? input.userFiles : undefined');
  });

  it('the route forwards them to the worker', () => {
    const ROUTE = read('app/api/admin/research/[projectId]/pipeline/route.ts');
    expect(ROUTE).toContain('userFiles');
  });
});
