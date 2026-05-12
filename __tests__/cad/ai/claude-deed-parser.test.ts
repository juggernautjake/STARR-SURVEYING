// __tests__/cad/ai/claude-deed-parser.test.ts
//
// Phase 6 §1888 — Claude parser handles non-standard deed text.
// Uses `vi.mock` to stub the Anthropic SDK so the test runs
// without network access. Covers:
//   - MissingApiKeyError thrown when ANTHROPIC_API_KEY is unset
//   - Standard JSON response parses into DeedCall[]
//   - Fenced JSON (```json … ```) tolerated even though the
//     system prompt forbids it
//   - Confidence computed from filled-bearing ratio
//   - deedMeta fields extracted when present
//   - Missing/null fields coerced gracefully (no throw)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
      constructor(_opts: unknown) {
        // no-op
      }
    },
  };
});

import {
  parseCallsWithClaude,
  MissingApiKeyError,
} from '@/lib/cad/ai-engine/claude-deed-parser';

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function textResponse(text: string) {
  return Promise.resolve({
    content: [{ type: 'text', text }],
  });
}

describe('Phase 6 §1888 — Claude-assisted deed parser', () => {
  it('throws MissingApiKeyError when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(parseCallsWithClaude('any text')).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('parses a standard JSON response into DeedCall objects', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    createMock.mockReturnValue(
      textResponse(
        JSON.stringify({
          calls: [
            {
              index: 0,
              type: 'LINE',
              bearing: 45.5,
              distance: 100,
              curveData: null,
              monument: 'iron rod found',
              rawText: 'THENCE N 45-30 E 100.00 ft',
            },
          ],
          deedMeta: { county: 'Bell', abstract: 'A-123' },
        }),
      ),
    );
    const result = await parseCallsWithClaude(
      'A poorly OCR\'d 1923 deed with smudges',
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].bearing).toBe(45.5);
    expect(result.calls[0].distance).toBe(100);
    expect(result.calls[0].monument).toBe('iron rod found');
    expect(result.confidence).toBe(1);
    expect(result.deedMeta.county).toBe('Bell');
    expect(result.deedMeta.abstract).toBe('A-123');
  });

  it('tolerates a ```json fenced response', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    createMock.mockReturnValue(
      textResponse(
        '```json\n' +
          JSON.stringify({
            calls: [
              {
                index: 0,
                type: 'LINE',
                bearing: 90,
                distance: 50,
                curveData: null,
                monument: null,
                rawText: 'east 50 ft',
              },
            ],
            deedMeta: {},
          }) +
          '\n```',
      ),
    );
    const result = await parseCallsWithClaude('east 50 feet');
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].bearing).toBe(90);
  });

  it('computes confidence as the filled-bearing ratio', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    createMock.mockReturnValue(
      textResponse(
        JSON.stringify({
          calls: [
            // Two calls with bearing, one without → confidence 2/3.
            { type: 'LINE', bearing: 45, distance: 10, curveData: null, monument: null, rawText: '' },
            { type: 'LINE', bearing: 90, distance: 20, curveData: null, monument: null, rawText: '' },
            { type: 'LINE', bearing: null, distance: 30, curveData: null, monument: null, rawText: '' },
          ],
        }),
      ),
    );
    const result = await parseCallsWithClaude('deed');
    expect(result.confidence).toBeCloseTo(2 / 3, 5);
  });

  it('coerces missing/invalid fields without throwing', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    createMock.mockReturnValue(
      textResponse(
        JSON.stringify({
          calls: [
            // Junk types — coerceCall should give us sane defaults.
            { type: 'WHAT' },
            { bearing: 'nope', distance: undefined },
            { type: 'CURVE', curveData: { direction: 'BAD' } },
          ],
        }),
      ),
    );
    const result = await parseCallsWithClaude('weird');
    expect(result.calls).toHaveLength(3);
    expect(result.calls[0].type).toBe('LINE'); // junk → LINE default
    expect(result.calls[1].bearing).toBeNull(); // string → null
    expect(result.calls[1].distance).toBeNull(); // undefined → null
    expect(result.calls[2].type).toBe('CURVE');
    expect(result.calls[2].curveData?.direction).toBeNull(); // BAD → null
  });

  it('throws when Claude returns non-JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    createMock.mockReturnValue(textResponse('I cannot parse this deed.'));
    await expect(parseCallsWithClaude('garbled')).rejects.toThrow(
      /did not contain valid JSON/,
    );
  });
});
