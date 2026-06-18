// __tests__/hub/today-schedule-empty-vs-error.test.ts
//
// Slice widget-empty-vs-error-2026-06-17 — user feedback:
//   "if there is simply nothing scheduled, it should just say
//    'nothing is scheduled', not 'couldn't load this widget'."
//
// The fix has two halves:
//
//   1) The schedule API's non-admin OR filter was building a bare
//      PostgREST value with an `@`/`.` in it, which broke the
//      parser and returned HTTP 500. Wrapping the email in double
//      quotes (the PostgREST escape) makes the filter parseable.
//   2) The widget now distinguishes "auth says you can't see this
//      collection" (→ empty) from "the service is broken" (→
//      error with a specific message).
//
// Behavioral coverage would need an integration harness; this is
// pure source-lock so the contract can't regress silently.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe("API /api/admin/schedule — non-admin OR filter quotes the email", () => {
  const SRC = read('app/api/admin/schedule/route.ts');

  it('wraps the email value in double quotes for PostgREST', () => {
    expect(SRC).toMatch(/const safe = `"\$\{email\}"`/);
  });

  it('keeps the three-way OR (assigned / all_users / specific_users) using the safe value', () => {
    expect(SRC).toMatch(/`assigned_to\.eq\.\$\{safe\}`/);
    expect(SRC).toMatch(/`visibility\.eq\.all_users`/);
    expect(SRC).toMatch(/`and\(visibility\.eq\.specific_users,viewer_emails\.cs\.\{\$\{safe\}\}\)`/);
  });
});

describe('today-schedule widget — empty vs error distinction', () => {
  const SRC = read('lib/hub/widgets/today-schedule/index.tsx');

  it('keeps a separate `errorMessage` state so the UI can show a real reason', () => {
    expect(SRC).toMatch(/const \[errorMessage, setErrorMessage\] = useState<string>/);
  });

  it("treats 401 / 403 as empty (the user has no schedule to see, not a broken service)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403[\s\S]{0,200}setStatus\('empty'\)/);
  });

  it('treats non-OK 5xx responses as error with the status code in the message', () => {
    expect(SRC).toMatch(/Schedule service returned HTTP \$\{res\.status\}/);
  });

  it('treats fetch / parse exceptions as error with the underlying reason', () => {
    expect(SRC).toMatch(/Couldn't reach the schedule service \(\$\{reason\}\)/);
  });

  it('passes the dynamic errorMessage to WidgetError instead of a hard-coded string', () => {
    expect(SRC).toMatch(/<WidgetError message=\{errorMessage\}/);
  });
});
