// __tests__/admin/calendar-day-create-s2.test.ts
//
// Slice S2 (calendar-day-create-and-alerts-2026-06-17) — visibility
// model. Per the user spec: "we can include users to be able to see
// that event as well. We can either include specific users, or all
// users, or keep it private."
//
// Coverage:
//   • Pure helper: parseViewerEmails (lowercase + dedupe + reject typos).
//   • buildSchedulePayload: visibility default, validation, viewer-emails
//     forced empty for 'private' / 'all_users'.
//   • Migration file exists with the right columns + indexes.
//   • API: SELECT_COLS includes the new fields; POST accepts +
//     validates visibility; PATCH zeroes viewer_emails when moving
//     away from specific_users; GET widens non-admin access via the
//     OR filter.
//   • AddEventForm: surfaces the selector + the textarea (only when
//     specific_users is picked).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSchedulePayload,
  parseViewerEmails,
  EVENT_VISIBILITIES,
  type AddEventForm,
} from '../../lib/hub/calendar/schedule-payload';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const BASE_FORM: AddEventForm = {
  title: 'Site visit',
  date: '2026-05-30',
  allDay: false,
  startTime: '09:00',
  endTime: '10:00',
  location: '',
  eventType: 'other',
};

describe('parseViewerEmails (pure helper)', () => {
  it('parses a comma-separated list', () => {
    expect(parseViewerEmails('alice@starr.com, bob@starr.com')).toEqual([
      'alice@starr.com', 'bob@starr.com',
    ]);
  });

  it('handles newlines + whitespace as separators too', () => {
    expect(parseViewerEmails('alice@starr.com\nbob@starr.com\ncarol@starr.com'))
      .toEqual(['alice@starr.com', 'bob@starr.com', 'carol@starr.com']);
  });

  it('lowercases + dedupes', () => {
    expect(parseViewerEmails('ALICE@starr.com, alice@starr.com'))
      .toEqual(['alice@starr.com']);
  });

  it('rejects entries that do not look like an email (no @, no dot)', () => {
    expect(parseViewerEmails('alice, not-an-email, alice@starr.com'))
      .toEqual(['alice@starr.com']);
  });

  it('returns an empty list for empty / blank input', () => {
    expect(parseViewerEmails('')).toEqual([]);
    expect(parseViewerEmails('  ,\n , ')).toEqual([]);
  });
});

describe('EVENT_VISIBILITIES enum', () => {
  it("locks the three allowed values", () => {
    expect(EVENT_VISIBILITIES).toEqual(['private', 'specific_users', 'all_users']);
  });
});

describe('buildSchedulePayload — visibility default + validation (S2)', () => {
  it("defaults visibility to 'private' when the form leaves it off", () => {
    const r = buildSchedulePayload(BASE_FORM);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.visibility).toBe('private');
    expect(r.payload.viewer_emails).toEqual([]);
  });

  it("rejects an unknown visibility value", () => {
    const r = buildSchedulePayload({
      ...BASE_FORM,
      visibility: 'nonsense' as unknown as 'private',
    });
    expect(r.ok).toBe(false);
  });

  it("requires at least one viewer for 'specific_users'", () => {
    const r = buildSchedulePayload({
      ...BASE_FORM,
      visibility: 'specific_users',
      viewerEmailsRaw: '',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/at least one viewer/i);
  });

  it("parses + carries viewer_emails for 'specific_users'", () => {
    const r = buildSchedulePayload({
      ...BASE_FORM,
      visibility: 'specific_users',
      viewerEmailsRaw: 'alice@starr.com, bob@starr.com',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.visibility).toBe('specific_users');
    expect(r.payload.viewer_emails).toEqual(['alice@starr.com', 'bob@starr.com']);
  });

  it("forces viewer_emails to empty for 'all_users' (no leakage)", () => {
    const r = buildSchedulePayload({
      ...BASE_FORM,
      visibility: 'all_users',
      viewerEmailsRaw: 'alice@starr.com',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.viewer_emails).toEqual([]);
  });
});

describe('Migration 308_schedule_visibility.sql', () => {
  const SQL = read('seeds/308_schedule_visibility.sql');

  it('adds the visibility column with a CHECK constraint over the three values', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS visibility\s+TEXT NOT NULL DEFAULT 'private'/);
    expect(SQL).toMatch(/CHECK \(visibility IN \('private', 'specific_users', 'all_users'\)\)/);
  });

  it('adds the viewer_emails column as a NOT NULL TEXT[] DEFAULT empty array', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS viewer_emails TEXT\[\] NOT NULL DEFAULT '\{\}'/);
  });

  it('creates a GIN index on viewer_emails for the array-contains lookup', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS idx_schedule_viewer_emails\s+ON public\.schedule_events USING GIN \(viewer_emails\)/);
  });

  it('creates a btree index on visibility', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS idx_schedule_visibility\s+ON public\.schedule_events\(visibility\)/);
  });
});

describe('API /api/admin/schedule — visibility wiring (S2)', () => {
  const SRC = read('app/api/admin/schedule/route.ts');

  it("SELECT_COLS includes 'visibility' and 'viewer_emails'", () => {
    expect(SRC).toMatch(/SELECT_COLS\s*=\s*\n?\s*'[^']*visibility[^']*'/);
    expect(SRC).toMatch(/SELECT_COLS\s*=\s*\n?\s*'[^']*viewer_emails[^']*'/);
  });

  it("GET widens non-admin access via assigned_to OR visibility filter", () => {
    // Slice widget-empty-vs-error-2026-06-17 — the email value is
    // now wrapped in double quotes (PostgREST escape) so emails
    // with `@` and `.` don't break the parser. The structure of
    // the three-way OR is unchanged.
    expect(SRC).toMatch(/assigned_to\.eq\.\$\{safe\}/);
    expect(SRC).toMatch(/visibility\.eq\.all_users/);
    expect(SRC).toMatch(/and\(visibility\.eq\.specific_users,viewer_emails\.cs\.\{\$\{safe\}\}\)/);
  });

  it("POST rejects an unknown visibility value", () => {
    expect(SRC).toMatch(/Invalid visibility/);
    expect(SRC).toMatch(/\['private', 'specific_users', 'all_users'\]\.includes\(visibility\)/);
  });

  it("POST inserts visibility + viewer_emails (force-empty when not specific_users)", () => {
    expect(SRC).toMatch(/visibility === 'specific_users'/);
    expect(SRC).toMatch(/insert\(\{[\s\S]*?visibility,\s*\n\s*viewer_emails: viewerEmails/);
  });

  it("PATCH accepts visibility + viewer_emails AND zeroes viewer_emails when toggling away from specific_users", () => {
    expect(SRC).toMatch(/'visibility', 'viewer_emails'/);
    expect(SRC).toMatch(/patch\.visibility !== undefined && patch\.visibility !== 'specific_users'/);
    expect(SRC).toMatch(/patch\.viewer_emails = \[\]/);
  });
});

describe('AddEventForm — UI surfaces the selector + viewer-emails textarea (S2)', () => {
  const SRC = read('lib/hub/calendar/AddEventForm.tsx');

  it('imports EventVisibility from schedule-payload', () => {
    expect(SRC).toMatch(/type EventVisibility/);
  });

  it("seeds the form with visibility: 'private' + empty viewerEmailsRaw", () => {
    expect(SRC).toMatch(/visibility:\s*'private'/);
    expect(SRC).toMatch(/viewerEmailsRaw:\s*''/);
  });

  it('renders the visibility <select> with the three options matching the user spec', () => {
    expect(SRC).toMatch(/aria-label="Visibility"/);
    expect(SRC).toMatch(/<option value="private">Private — just me<\/option>/);
    expect(SRC).toMatch(/<option value="specific_users">Specific users<\/option>/);
    expect(SRC).toMatch(/<option value="all_users">Everyone on the team<\/option>/);
  });

  it("renders the viewer-emails textarea ONLY when 'specific_users' is selected", () => {
    expect(SRC).toMatch(/form\.visibility === 'specific_users' && \(\s*\n\s*<textarea/);
    expect(SRC).toMatch(/aria-label="Viewer emails"/);
  });
});
