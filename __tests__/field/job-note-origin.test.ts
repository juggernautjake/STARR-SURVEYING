// Job notes — who posted it, from where, and when.
//
// Owner, 2026-08-16: *"Job note entries should be recorded and should display who posted it to the
// job, from where and the date and time."*
//
// ── WHY "FROM WHERE" IS THE PART THAT NEEDS TESTS ───────────────────────────────────────────────
//
// "Who" is a column and "when" is a column. "From where" is partly recorded and partly inferred,
// and an inference on an audit line is exactly the thing that goes quietly wrong: a note assigned
// the wrong origin still LOOKS filled in, so nobody re-checks it.
//
// The rule is that an explicit `context_type` always wins, and only rows that never recorded one
// are inferred — from columns that ONLY the field app could have written (`data_point_id`, because
// the office has no shot to attach to at the moment of writing; `note_template`, because the
// structured templates exist only in the mobile app). Anything left over says "Origin not
// recorded" rather than being given a plausible home.

import { describe, it, expect } from 'vitest';
import {
  jobNoteOrigin,
  describeJobNoteOrigin,
  officeJobNoteContext,
  JOB_NOTE_CONTEXT_OFFICE,
  JOB_NOTE_CONTEXT_FIELD,
} from '@/lib/field/job-note-origin';

describe('an explicit origin always wins', () => {
  it('an office note is an office note', () => {
    expect(jobNoteOrigin({ context_type: JOB_NOTE_CONTEXT_OFFICE })).toBe('office_job_page');
  });

  it('a field note is a field note', () => {
    expect(jobNoteOrigin({ context_type: JOB_NOTE_CONTEXT_FIELD })).toBe('field_app');
  });

  it('is not overridden by columns that would otherwise be inferred from', () => {
    // A row that says where it came from is not second-guessed. Without this, an office note that
    // was later linked to a survey point would start claiming it was written in the field.
    expect(jobNoteOrigin({
      context_type: JOB_NOTE_CONTEXT_OFFICE,
      data_point_id: 'point-1',
      note_template: 'hazard',
    })).toBe('office_job_page');
  });

  it('any other context is the fieldbook, not a guess', () => {
    // A note taken from a lesson page and later attached to a job.
    expect(jobNoteOrigin({ context_type: 'lesson' })).toBe('fieldbook');
  });

  it('whitespace is not an origin', () => {
    expect(jobNoteOrigin({ context_type: '   ' })).toBe('unknown');
  });
});

describe('inference, only for rows that never recorded an origin', () => {
  it('a note attached to a survey point came from the field app', () => {
    // Only the field app can attach one: at the moment of writing, the office has no shot to
    // attach to.
    expect(jobNoteOrigin({ data_point_id: 'point-1' })).toBe('field_app_point');
  });

  it('a structured template came from the field app', () => {
    // 'offset_shot' / 'monument_found' / 'hazard' exist only in the mobile app.
    expect(jobNoteOrigin({ note_template: 'monument_found' })).toBe('field_app');
  });

  it('the point is more specific than the template, so it wins', () => {
    expect(jobNoteOrigin({ data_point_id: 'p1', note_template: 'hazard' })).toBe('field_app_point');
  });

  it('a bare note is not placed at all', () => {
    // The honest answer. Assigning it "Office" would be a lie about every note the crew took
    // before origin tracking existed.
    expect(jobNoteOrigin({})).toBe('unknown');
    expect(jobNoteOrigin({ context_type: null, data_point_id: null, note_template: null })).toBe('unknown');
  });
});

describe('what the card prints', () => {
  it('every origin has a phrase, and none of them is bare "Unknown"', () => {
    for (const o of ['office_job_page', 'field_app_point', 'field_app', 'fieldbook', 'unknown'] as const) {
      const label = describeJobNoteOrigin(o);
      expect(label.length).toBeGreaterThan(3);
      // "Unknown" reads like a failed lookup. The truth is that the note predates origin tracking
      // and there is nothing to find.
      expect(label).not.toBe('Unknown');
    }
  });

  it('an unplaceable note says so in words', () => {
    expect(describeJobNoteOrigin('unknown')).toMatch(/not recorded/i);
  });

  it('the two field origins are distinguishable to a reader', () => {
    expect(describeJobNoteOrigin('field_app_point')).not.toBe(describeJobNoteOrigin('field_app'));
  });
});

describe('what the office stamps', () => {
  it('produces an origin the reader resolves back to the office', () => {
    // Round-trip: what the writer stamps must be what the reader recognises. Two constants that
    // drift apart would leave every new note reading "Fieldbook".
    const ctx = officeJobNoteContext('job-123');
    expect(jobNoteOrigin(ctx)).toBe('office_job_page');
    expect(describeJobNoteOrigin(jobNoteOrigin(ctx))).toMatch(/office/i);
  });

  it('records the page it was written from', () => {
    expect(officeJobNoteContext('job-123').page_url).toContain('job-123');
  });
});
