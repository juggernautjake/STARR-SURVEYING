// __tests__/admin/calendar-day-create-s1.test.ts
//
// Slice S1 (calendar-day-create-and-alerts-2026-06-17) — user
// feedback: "On the calendar, please make it so that whenever we
// hover over a day on the calendar, it shows a little plus button.
// We can click it, and then it will give us the option to create a
// special event, or create a job for that day."
//
// S1 ships the foundation:
//   • A hover-only "+" button anchored to each month-view day cell.
//   • Click the "+" → small Event/Job action menu anchored to the cell.
//   • "Create event" → opens a centered modal that reuses the
//     today-schedule widget's AddEventForm with the day's ISO
//     pre-filled. On success the calendar refetches via load().
//   • "Create job" → navigates to `/admin/jobs/new?scheduled_for=<iso>`
//     so the new-job page can prefill the scheduled date when S4
//     adds that handler.
//
// Visibility selector, multi-user picker, and custom reminder
// lead times are deferred to S2/S3 per the plan doc.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Calendar page — hover-plus + day-action menu wiring (S1)', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('imports AddEventForm from the hub calendar lib', () => {
    expect(SRC).toMatch(/import AddEventForm from '@\/lib\/hub\/calendar\/AddEventForm'/);
  });

  it('declares actionMenuIso + createEventForIso state', () => {
    expect(SRC).toMatch(/const \[actionMenuIso, setActionMenuIso\] = useState<string \| null>\(null\)/);
    expect(SRC).toMatch(/const \[createEventForIso, setCreateEventForIso\] = useState<string \| null>\(null\)/);
  });

  it('renders a hover-plus button inside every month cell with a stable testid', () => {
    expect(SRC).toMatch(/className="calendar-month__hover-add"/);
    expect(SRC).toMatch(/data-testid="calendar-day-add"/);
    expect(SRC).toMatch(/data-iso=\{cell\.iso\}/);
  });

  it("clicking the + button toggles actionMenuIso for that cell's iso", () => {
    expect(SRC).toMatch(/setActionMenuIso\(\(cur\) => \(cur === cell\.iso \? null : cell\.iso\)\)/);
  });

  it('renders the Event/Job action menu only when its iso matches actionMenuIso', () => {
    expect(SRC).toMatch(/\{actionMenuIso === cell\.iso && \(/);
    expect(SRC).toMatch(/data-testid="calendar-day-action-menu"/);
  });

  it('the "Create event" menu item sets createEventForIso to the day cell iso', () => {
    expect(SRC).toMatch(/data-testid="calendar-day-action-event"[\s\S]*?setCreateEventForIso\(cell\.iso\)/);
  });

  it('the "Create job" menu item is a Link to /admin/jobs/new?scheduled_for=<iso>', () => {
    expect(SRC).toMatch(/data-testid="calendar-day-action-job"[\s\S]*?href=\{`\/admin\/jobs\/new\?scheduled_for=\$\{cell\.iso\}`\}/);
  });

  it('mounts an outside-mousedown listener that closes the action menu', () => {
    expect(SRC).toMatch(/if \(!actionMenuIso\) return;[\s\S]*?document\.addEventListener\('mousedown'/);
  });
});

describe('Calendar page — create-event modal reuses AddEventForm (S1)', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('renders the modal only when createEventForIso is set', () => {
    expect(SRC).toMatch(/\{createEventForIso && \([\s\S]*?className="calendar-page__create-backdrop"/);
  });

  it('passes the clicked day iso to AddEventForm as defaultDate', () => {
    expect(SRC).toMatch(/<AddEventForm[\s\S]*?defaultDate=\{createEventForIso\}/);
  });

  it('onCreated closes the modal AND refetches via load()', () => {
    expect(SRC).toMatch(/onCreated=\{\(\)\s*=>\s*\{\s*setCreateEventForIso\(null\);\s*void load\(\);\s*\}\}/);
  });

  it('onCancel + the ✕ button both close the modal', () => {
    expect(SRC).toMatch(/onCancel=\{\(\)\s*=>\s*setCreateEventForIso\(null\)\}/);
    // The ✕ button has both `onClick → setCreateEventForIso(null)`
    // AND `data-testid="calendar-create-event-close"`. Attribute
    // order varies, and the JSX spans multiple lines, so we just
    // grab a slice of the source around the testid and assert the
    // onClick is in there too.
    const idx = SRC.indexOf('data-testid="calendar-create-event-close"');
    expect(idx).toBeGreaterThan(-1);
    const slice = SRC.slice(Math.max(0, idx - 300), idx + 100);
    expect(slice).toMatch(/onClick=\{\(\)\s*=>\s*setCreateEventForIso\(null\)\}/);
  });

  it('clicking the backdrop (but not the inner modal) closes it', () => {
    expect(SRC).toMatch(/if \(e\.target === e\.currentTarget\) setCreateEventForIso\(null\)/);
  });
});

describe('Calendar CSS — hover-plus + action menu + modal (S1)', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('the hover-plus button is hidden by default (opacity:0 + pointer-events:none)', () => {
    expect(CSS).toMatch(/\.calendar-month__hover-add\s*\{[\s\S]*?opacity:\s*0[\s\S]*?pointer-events:\s*none/);
  });

  it('the button fades in on cell hover or keyboard focus', () => {
    expect(CSS).toMatch(
      /\.calendar-month__cell:hover \.calendar-month__hover-add[\s\S]*?\.calendar-month__hover-add:focus-visible\s*\{[\s\S]*?opacity:\s*1[\s\S]*?pointer-events:\s*auto/,
    );
  });

  it('the button has the brand-navy fill + white "+" text per the screenshot', () => {
    expect(CSS).toMatch(/\.calendar-month__hover-add\s*\{[\s\S]*?background:\s*var\(--color-brand-navy\)[\s\S]*?color:\s*#FFFFFF/);
  });

  it('the action menu pops below the cell-num with a small offset', () => {
    expect(CSS).toMatch(/\.calendar-month__action-menu\s*\{[\s\S]*?top:\s*calc\(100% \+ 4px\)/);
  });

  it('the create-event modal is centered + has a dimmed backdrop', () => {
    expect(CSS).toMatch(/\.calendar-page__create-backdrop\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?justify-content:\s*center/);
  });
});
