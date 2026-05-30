// __tests__/hub/work-mode-prompt-clockin.test.tsx
//
// Slice 4 of hub-widget-excellence-01-greeting-roles-workmode. Locks
// the clock-in awareness step of the Enter-Work-Mode prompt:
//   - not clocked in  → "Clock in now?" / "Stay clocked out", with the
//     explicit reassurance that entering work mode won't clock you in;
//   - already clocked in → no clock-in buttons, just "Enter Work Mode"
//     plus the elapsed time ("we'll assume you're working").
//
// `@/lib/auth` + `next/navigation` are mocked for the same next-auth /
// router-context reasons as the role-step spec.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

vi.mock('@/lib/auth', () => ({
  ROLE_LABELS: {
    admin: 'Admin',
    drawer: 'Drawer',
    field_crew: 'Field Crew',
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { WorkModeClockStep } from '@/app/admin/me/components/WorkModePrompt';
import type { ClockSession } from '@/lib/work-mode/clock-session';

function render(clock: ClockSession | null, nowMs?: number): string {
  return ReactDOMServer.renderToStaticMarkup(
    <WorkModeClockStep
      clock={clock}
      nowMs={nowMs}
      onClockInNow={() => {}}
      onStayClockedOut={() => {}}
      onEnterWorking={() => {}}
      onBack={() => {}}
    />,
  );
}

describe('WorkModeClockStep — not clocked in', () => {
  const html = render(null);

  it('tells the user they are not clocked in', () => {
    expect(html).toContain("You&#x27;re not currently clocked in");
  });

  it('reassures that entering work mode will not clock them in', () => {
    expect(html).toMatch(/won&#x27;t clock you in/i);
  });

  it('offers both "Clock in now?" and "Stay clocked out"', () => {
    expect(html).toContain('Clock in now?');
    expect(html).toContain('Stay clocked out');
  });

  it('flags the status line as not-clocked-in for styling', () => {
    expect(html).toMatch(/data-clocked-in="false"/);
  });
});

describe('WorkModeClockStep — already clocked in (assume working)', () => {
  const startedAt = new Date('2026-05-30T09:00:00Z').toISOString();
  const nowMs = new Date('2026-05-30T10:30:00Z').getTime();
  const clock: ClockSession = { startedAt, jobId: 'J-1042', tagIds: [] };
  const html = render(clock, nowMs);

  it('says the user is clocked in + assumes working', () => {
    expect(html).toContain("You&#x27;re clocked in");
    expect(html).toMatch(/assume you&#x27;re working/i);
  });

  it('shows the elapsed time + the active job', () => {
    expect(html).toContain('J-1042');
    expect(html).toContain('1h 30m');
  });

  it('does NOT show the clock-in buttons (already working)', () => {
    expect(html).not.toContain('Clock in now?');
    expect(html).not.toContain('Stay clocked out');
  });

  it('offers a single Enter Work Mode action', () => {
    expect(html).toContain('Enter Work Mode');
    expect(html).toMatch(/data-clocked-in="true"/);
  });
});
