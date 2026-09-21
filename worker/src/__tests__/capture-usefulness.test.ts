/**
 * Which screenshots are worth filing.
 *
 * Owner, 2026-09-21: "A lot of times we are getting back screenshots of pages or websites where
 * nothing was found or it didn't load or something, and those images are useless."
 *
 * The tests that matter most here are the ones proving a vision call is NOT spent when a free check
 * already settles it — that is the difference between a gate and a tax on every capture.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  assessCapture, checkBytes, checkText, usefulnessLine, VISION_PROMPT,
  MIN_USEFUL_BYTES, MIN_USEFUL_PIXELS, type VisionJudge,
} from '../research/capture-usefulness.js';

const big = { byteLength: 400_000, width: 1440, height: 900 };

describe('gate 1 — the bytes, which cost nothing', () => {
  it('an empty file is useless', () => {
    expect(checkBytes({ byteLength: 0 })!.verdict).toBe('useless');
  });

  it('a few kilobytes is a blank page, and the reason says why', () => {
    // PNG compresses flat colour very well, which is exactly what makes the threshold work.
    const c = checkBytes({ byteLength: 4_000 })!;
    expect(c.verdict).toBe('useless');
    expect(c.why).toMatch(/compresses flat colour/i);
  });

  it('a tracking-pixel-sized image is not a page', () => {
    expect(checkBytes({ byteLength: 500_000, width: 1, height: 1 })!.verdict).toBe('useless');
  });

  it('a real capture passes the gate without a verdict', () => {
    // null means "this gate has nothing to say", not "useful".
    expect(checkBytes(big)).toBeNull();
  });

  it('the thresholds are sane', () => {
    expect(MIN_USEFUL_BYTES).toBeGreaterThan(1000);
    expect(MIN_USEFUL_PIXELS).toBeGreaterThan(50);
  });
});

describe('gate 2 — the page says so itself', () => {
  it.each([
    ['no results', 'Your search returned no results'],
    ['zero total', 'Showing page 1 of 1 for 0 Total Results'],
    ['no records', 'No records found for the criteria entered'],
    ['no documents', 'No documents were found'],
  ])('%s is useless — the FINDING belongs in the log, not in a picture', (_l, text) => {
    const c = checkText(text)!;
    expect(c.verdict).toBe('useless');
    expect(c.why).toMatch(/run log/i);
  });

  it.each([
    ['404', 'HTTP 404 — Page not found'],
    ['server error', 'Server Error — 500'],
    ['unreachable', "This site can't be reached — ERR_NAME_NOT_RESOLVED"],
    ['app error', 'An error has occurred. Please add this GUID to any support ticket'],
  ])('%s is useless', (_l, text) => {
    expect(checkText(text)!.verdict).toBe('useless');
  });

  it.each([
    ['outdated browser', 'Please visit outdatedbrowser.com to upgrade your browser'],
    ['cloudflare', 'Just a moment... checking your browser before accessing'],
    ['access denied', 'Access Denied — request blocked'],
  ])('%s is a wall, and filing it would picture our OWN blocked request', (_l, text) => {
    const c = checkText(text)!;
    expect(c.verdict).toBe('useless');
    expect(c.why).toMatch(/our own blocked request/i);
  });

  it('a spinner means retry, not file', () => {
    const c = checkText('Loading... please wait while we retrieve your records')!;
    expect(c.verdict).toBe('useless');
    expect(c.why).toMatch(/retry with a longer wait/i);
  });

  it('a page with real property content is useful', () => {
    const c = checkText(
      'Grantor EGGER STELLA Grantee CITY OF ROUND ROCK Legal Description 2.591 AC HARRIS W SVY ABST 298',
    )!;
    expect(c.verdict).toBe('useful');
  });

  it('needs TWO kinds of content, so one stray word is not enough', () => {
    expect(checkText('This page mentions an owner and nothing else whatsoever about anything.')).toBeNull();
  });

  it('an aerial photograph has almost no text and must NOT be called useless for it', () => {
    // The trap. An aerial is the most valuable capture the run takes and carries maybe a
    // attribution line.
    expect(checkText('Esri, Maxar')).toBeNull();
    expect(checkText('')).toBeNull();
    expect(checkText(null)).toBeNull();
  });

  it('"not found" inside real content does not trip the empty-page rule', () => {
    // A page ABOUT a monument not found is a useful page. The patterns are anchored to the shape
    // these messages actually take, precisely so this does not misfire.
    const t = 'Grantor SMITH Grantee JONES Legal Description LOT 4 BLOCK 2 — monument not found at corner';
    expect(checkText(t)!.verdict).toBe('useful');
  });
});

describe('gate 3 — the vision call, spent only when needed', () => {
  const ambiguous = { bytes: big, pageText: 'Williamson County', imageBase64: 'AAAA', label: 'Aerial — subject parcel' };

  it('is NOT called when the bytes already decided', async () => {
    const judge = vi.fn() as unknown as VisionJudge;
    const c = await assessCapture({ bytes: { byteLength: 900 }, imageBase64: 'AAAA', judge });
    expect(c.decidedBy).toBe('bytes');
    expect(judge).not.toHaveBeenCalled();
    expect(c.usedVision).toBe(false);
  });

  it('is NOT called when the text already decided', async () => {
    const judge = vi.fn() as unknown as VisionJudge;
    const c = await assessCapture({ bytes: big, pageText: 'No records found', imageBase64: 'AAAA', judge });
    expect(c.decidedBy).toBe('text');
    expect(judge).not.toHaveBeenCalled();
  });

  it('IS called when the free gates are inconclusive', async () => {
    const judge = vi.fn(async () => ({ useful: true, why: 'an aerial with the parcel in frame', confidence: 0.9 })) as unknown as VisionJudge;
    const c = await assessCapture({ ...ambiguous, judge });
    expect(c.decidedBy).toBe('vision');
    expect(c.usedVision).toBe(true);
    expect(c.verdict).toBe('useful');
    expect(c.confidence).toBe(0.9);
  });

  it('passes the capture\'s label as context', async () => {
    const seen: Array<{ context: string }> = [];
    const judge = (async (i: { context: string }) => { seen.push(i); return { useful: true, why: 'x', confidence: 1 }; }) as unknown as VisionJudge;
    await assessCapture({ ...ambiguous, judge });
    expect(seen[0]!.context).toContain('Aerial — subject parcel');
  });

  it('a failing vision call does not lose the capture', async () => {
    const judge = (async () => { throw new Error('rate limited'); }) as unknown as VisionJudge;
    const c = await assessCapture({ ...ambiguous, judge });
    expect(c.verdict).toBe('useful');
    expect(c.decidedBy).toBe('default');
  });

  it('a null verdict from the judge falls through to the default', async () => {
    const judge = (async () => null) as unknown as VisionJudge;
    expect((await assessCapture({ ...ambiguous, judge })).decidedBy).toBe('default');
  });
});

describe('the default leans towards keeping', () => {
  it('keeps when nothing decided', async () => {
    // A wrongly-dropped aerial cannot be recovered; a wrongly-kept one can be ignored.
    const c = await assessCapture({ bytes: big });
    expect(c.verdict).toBe('useful');
    expect(c.why).toMatch(/cannot be recovered/i);
  });

  it('honours an explicit drop-on-doubt', async () => {
    const c = await assessCapture({ bytes: big, whenUnsure: 'drop' });
    expect(c.verdict).toBe('useless');
  });

  it('works with no judge at all', async () => {
    const c = await assessCapture({ bytes: big, imageBase64: 'AAAA' });
    expect(c.usedVision).toBe(false);
    expect(c.verdict).toBe('useful');
  });
});

describe('the prompt names the failures this pipeline actually produces', () => {
  it('tells the model to judge content, not quality', () => {
    // A model told only "is this useful?" calls a well-rendered error page useful, because it is a
    // clear screenshot of something.
    expect(VISION_PROMPT).toMatch(/judge the CONTENT, not the quality/i);
  });

  it('lists the specific things to discard', () => {
    for (const phrase of ['empty result', 'bot check', 'update your browser', 'still loading', 'failed to render']) {
      expect(VISION_PROMPT.toLowerCase(), phrase).toContain(phrase.toLowerCase());
    }
  });

  it('asks for JSON with a reason', () => {
    expect(VISION_PROMPT).toContain('"useful"');
    expect(VISION_PROMPT).toContain('"why"');
    expect(VISION_PROMPT).toContain('"confidence"');
  });
});

describe('the log line', () => {
  it('says filed or not, and why', async () => {
    const c = await assessCapture({ bytes: { byteLength: 800 } });
    const line = usefulnessLine('Aerial — subject parcel', c);
    expect(line).toContain('Aerial — subject parcel');
    expect(line).toContain('not filed');
    expect(line).toContain('(bytes)');
  });

  it('names the vision confidence when one was spent', async () => {
    const judge = (async () => ({ useful: false, why: 'an empty table', confidence: 0.82 })) as unknown as VisionJudge;
    const c = await assessCapture({ bytes: big, imageBase64: 'A', judge });
    expect(usefulnessLine('County GIS', c)).toContain('vision, 0.82');
  });
});
