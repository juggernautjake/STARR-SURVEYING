// __tests__/phone/hours.test.ts — slice I1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// "If calls come outside of the specified hours, they go to voice mail." Every case below is a way
// that sentence comes out wrong without anything erroring: a caller at 4:59 sent to voicemail, a
// caller at 5:30 ringing an empty office, or — the one the existing `AFTER_HOUR = 18` cron actually
// has — an office whose closing time moves by an hour in November.
//
// All instants are written in UTC and asserted in America/Chicago, because that is exactly the
// conversion the bug lives in.

import { describe, it, expect } from 'vitest';
import {
  isOpenAt, localMoment, parseClock, formatClock, describeHours, parsePhoneHours,
  DEFAULT_PHONE_HOURS, type PhoneHours,
} from '@/lib/phone/hours';

/** Weekdays 08:00–17:00 Central, nothing else configured. */
const NINE_TO_FIVE: PhoneHours = {
  ...DEFAULT_PHONE_HOURS,
  days: [
    [],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [],
  ],
};

// 2026-08-11 is a Tuesday; Central is on CDT (UTC-5) that day.
const utc = (iso: string) => new Date(iso);

describe('the clock the office actually runs on', () => {
  it('reads Central time, not the server’s UTC', () => {
    // The whole reason this module exists. 14:00 UTC is 09:00 in Texas.
    const m = localMoment(utc('2026-08-11T14:00:00Z'), 'America/Chicago');
    expect(m.minutes).toBe(9 * 60);
    expect(m.weekday).toBe(2); // Tuesday
    expect(m.date).toBe('2026-08-11');
  });

  it('gives a different answer in winter than in summer for the same UTC hour', () => {
    // This is the DST test, and it is the one that catches a fixed UTC offset. 13:00 UTC is 08:00
    // CDT in August and 07:00 CST in January — open in one, closed in the other.
    expect(isOpenAt(utc('2026-08-11T13:00:00Z'), NINE_TO_FIVE).open).toBe(true);
    expect(isOpenAt(utc('2026-01-13T13:00:00Z'), NINE_TO_FIVE).open).toBe(false);
  });

  it('rolls the date over at local midnight, not UTC midnight', () => {
    // 03:00 UTC on the 12th is still the evening of the 11th in Texas. A holiday check against the
    // UTC date would close the office on the wrong day for five hours every night.
    const m = localMoment(utc('2026-08-12T03:00:00Z'), 'America/Chicago');
    expect(m.date).toBe('2026-08-11');
    expect(m.weekday).toBe(2);
  });

  it('renders local midnight as 0 minutes, never 1440', () => {
    // Some ICU builds format midnight as hour "24" under hour12:false. Unhandled, a 00:15 call
    // lands past every window instead of before them.
    const m = localMoment(utc('2026-08-11T05:00:00Z'), 'America/Chicago');
    expect(m.minutes).toBe(0);
  });

  it('falls back to UTC instead of throwing on an unusable zone', () => {
    // An inbound call must get a greeting, not a 500. A bad zone is a config error to report, not
    // a reason to drop the call.
    expect(() => localMoment(utc('2026-08-11T14:00:00Z'), 'Mars/Olympus_Mons')).not.toThrow();
  });
});

describe('the edges of the working day', () => {
  it('is open at exactly the opening minute', () => {
    expect(isOpenAt(utc('2026-08-11T13:00:00Z'), NINE_TO_FIVE).open).toBe(true); // 08:00 CDT
  });

  it('is open one minute before closing', () => {
    expect(isOpenAt(utc('2026-08-11T21:59:00Z'), NINE_TO_FIVE).open).toBe(true); // 16:59 CDT
  });

  it('is CLOSED at exactly the closing minute', () => {
    // Exclusive close. "We close at 5" means 17:00 goes to voicemail.
    const r = isOpenAt(utc('2026-08-11T22:00:00Z'), NINE_TO_FIVE); // 17:00 CDT
    expect(r.open).toBe(false);
    expect(r.reason).toBe('outside_hours');
  });

  it('is closed one minute before opening', () => {
    expect(isOpenAt(utc('2026-08-11T12:59:00Z'), NINE_TO_FIVE).open).toBe(false); // 07:59 CDT
  });

  it('is closed in the middle of the night', () => {
    expect(isOpenAt(utc('2026-08-11T07:00:00Z'), NINE_TO_FIVE).open).toBe(false); // 02:00 CDT
  });
});

describe('days with no hours at all', () => {
  it('is closed on a Saturday', () => {
    // 2026-08-15 is a Saturday.
    const r = isOpenAt(utc('2026-08-15T15:00:00Z'), NINE_TO_FIVE);
    expect(r.open).toBe(false);
    expect(r.reason).toBe('day_closed');
  });

  it('is closed on a Sunday', () => {
    expect(isOpenAt(utc('2026-08-16T15:00:00Z'), NINE_TO_FIVE).reason).toBe('day_closed');
  });

  it('distinguishes "we are shut today" from "you called too late"', () => {
    // Different greetings are reasonable for the two, so the reason has to survive the check.
    expect(isOpenAt(utc('2026-08-15T15:00:00Z'), NINE_TO_FIVE).reason).toBe('day_closed');
    expect(isOpenAt(utc('2026-08-11T23:00:00Z'), NINE_TO_FIVE).reason).toBe('outside_hours');
  });
});

describe('holidays and the off switch', () => {
  it('is closed on a listed holiday even at 10am on a Tuesday', () => {
    const hours = { ...NINE_TO_FIVE, holidays: ['2026-08-11'] };
    const r = isOpenAt(utc('2026-08-11T15:00:00Z'), hours);
    expect(r.open).toBe(false);
    expect(r.reason).toBe('holiday');
  });

  it('matches the holiday against the LOCAL date', () => {
    // 02:00 UTC on the 12th is 21:00 on the 11th in Texas. Both are outside hours anyway, so the
    // assertion is on the reason: a UTC-dated holiday check reports the wrong one.
    const hours = { ...NINE_TO_FIVE, holidays: ['2026-08-11'] };
    expect(isOpenAt(utc('2026-08-12T02:00:00Z'), hours).reason).toBe('holiday');
  });

  it('sends everything to voicemail when disabled', () => {
    const r = isOpenAt(utc('2026-08-11T15:00:00Z'), { ...NINE_TO_FIVE, enabled: false });
    expect(r.open).toBe(false);
    expect(r.reason).toBe('disabled');
  });
});

describe('more than one window in a day', () => {
  const withLunch: PhoneHours = {
    ...NINE_TO_FIVE,
    days: NINE_TO_FIVE.days.map((d, i) =>
      i >= 1 && i <= 5 ? [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }] : d),
  };

  it('is open in the morning window', () => {
    expect(isOpenAt(utc('2026-08-11T14:00:00Z'), withLunch).open).toBe(true); // 09:00
  });

  it('is closed over lunch', () => {
    expect(isOpenAt(utc('2026-08-11T17:30:00Z'), withLunch).open).toBe(false); // 12:30
  });

  it('is open again in the afternoon', () => {
    expect(isOpenAt(utc('2026-08-11T19:00:00Z'), withLunch).open).toBe(true); // 14:00
  });

  it('reports which window was matched', () => {
    expect(isOpenAt(utc('2026-08-11T19:00:00Z'), withLunch).window?.open).toBe('13:00');
  });
});

describe('windows that are typed wrong', () => {
  it('treats a backwards window as closed rather than as overnight', () => {
    // 17:00–08:00 is almost always a transposition, not a night shift. Reading it as spanning
    // midnight would hold the line open all night and look deliberate.
    const backwards: PhoneHours = {
      ...NINE_TO_FIVE,
      days: NINE_TO_FIVE.days.map((d, i) => (i === 2 ? [{ open: '17:00', close: '08:00' }] : d)),
    };
    expect(isOpenAt(utc('2026-08-11T04:00:00Z'), backwards).open).toBe(false); // 23:00 CDT
    expect(isOpenAt(utc('2026-08-11T15:00:00Z'), backwards).open).toBe(false); // 10:00 CDT
  });

  it('skips a malformed window without discarding a good one beside it', () => {
    const mixed: PhoneHours = {
      ...NINE_TO_FIVE,
      days: NINE_TO_FIVE.days.map((d, i) =>
        i === 2 ? [{ open: 'lunchtime', close: '??' }, { open: '08:00', close: '17:00' }] : d),
    };
    expect(isOpenAt(utc('2026-08-11T15:00:00Z'), mixed).open).toBe(true);
  });

  it('treats a zero-length window as closed', () => {
    const zero: PhoneHours = {
      ...NINE_TO_FIVE,
      days: NINE_TO_FIVE.days.map((d, i) => (i === 2 ? [{ open: '09:00', close: '09:00' }] : d)),
    };
    expect(isOpenAt(utc('2026-08-11T14:00:00Z'), zero).open).toBe(false);
  });
});

describe('reading a time', () => {
  it('reads the shapes a settings form produces', () => {
    expect(parseClock('08:00')).toBe(480);
    expect(parseClock('8:00')).toBe(480);
    expect(parseClock('17:30')).toBe(1050);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('24:00')).toBe(1440);
  });

  it('refuses what is not a time', () => {
    for (const bad of ['', '25:00', '12:60', '24:01', '8', '8:0', 'noon', '08:00:00', null, undefined, 800]) {
      expect(parseClock(bad as unknown), String(bad)).toBeNull();
    }
  });

  it('round-trips', () => {
    for (const m of [0, 480, 1050, 1439]) expect(parseClock(formatClock(m))).toBe(m);
  });
});

describe('reading stored settings', () => {
  it('returns the defaults for an empty store', () => {
    const h = parsePhoneHours(undefined);
    expect(h.timeZone).toBe('America/Chicago');
    expect(h.days[1]).toHaveLength(1);
    expect(h.enabled).toBe(true);
  });

  it('does not fall back to defaults for a day deliberately set to closed', () => {
    // The distinction that matters: "days was never configured" takes the default weekday hours,
    // but "Monday was explicitly emptied" must stay empty. Merging them would reopen a day the
    // owner just closed.
    const h = parsePhoneHours({ days: [[], [], [], [], [], [], []] });
    expect(h.days[1]).toHaveLength(0);
    expect(isOpenAt(utc('2026-08-11T15:00:00Z'), h).open).toBe(false);
  });

  it('keeps good fields when a neighbouring one is junk', () => {
    const h = parsePhoneHours({
      days: [[], [{ open: '07:00', close: '16:00' }], [], [], [], [], []],
      ringSeconds: 'soon',
      holidays: 'christmas',
    });
    expect(h.days[1][0].open).toBe('07:00');
    expect(h.ringSeconds).toBe(DEFAULT_PHONE_HOURS.ringSeconds);
    expect(h.holidays).toEqual([]);
  });

  it('drops a window that is not a time rather than storing it', () => {
    const h = parsePhoneHours({ days: [[], [{ open: 'x', close: 'y' }, { open: '08:00', close: '17:00' }], [], [], [], [], []] });
    expect(h.days[1]).toHaveLength(1);
  });

  it('keeps only real dates in the holiday list', () => {
    const h = parsePhoneHours({ holidays: ['2026-12-25', 'Christmas', '12/25/2026', '2026-07-04'] });
    expect(h.holidays).toEqual(['2026-12-25', '2026-07-04']);
  });

  it('clamps the ring time to something a caller will tolerate', () => {
    expect(parsePhoneHours({ ringSeconds: 9999 }).ringSeconds).toBe(120);
    expect(parsePhoneHours({ ringSeconds: 0 }).ringSeconds).toBe(5);
    expect(parsePhoneHours({ ringSeconds: -30 }).ringSeconds).toBe(5);
  });

  it('does not throw on anything at all', () => {
    for (const junk of [null, 42, 'hours', [], true]) {
      expect(() => parsePhoneHours(junk), String(junk)).not.toThrow();
    }
  });

  it('survives a round trip through JSON', () => {
    const once = parsePhoneHours({ days: [[], [{ open: '07:30', close: '16:30' }], [], [], [], [], []], enabled: false });
    expect(parsePhoneHours(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('saying it back to the owner', () => {
  it('names every day, including the closed ones', () => {
    const lines = describeHours(NINE_TO_FIVE);
    expect(lines.some((l) => l.startsWith('Monday: 08:00'))).toBe(true);
    expect(lines.some((l) => l === 'Sunday: closed')).toBe(true);
    expect(lines.some((l) => l === 'Saturday: closed')).toBe(true);
  });

  it('leads with the off switch when it is on', () => {
    expect(describeHours({ ...NINE_TO_FIVE, enabled: false })[0]).toContain('voicemail');
  });

  it('lists the holidays', () => {
    expect(describeHours({ ...NINE_TO_FIVE, holidays: ['2026-12-25'] }).join(' ')).toContain('2026-12-25');
  });
});
