// __tests__/phone/every-twilio-route-verifies.test.ts — slice P0b of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// A source scan, not a behaviour test, and deliberately so.
//
// Every route under /api/twilio is a publicly reachable URL that can cause the firm's Twilio account
// to place calls. The check that stops that is one function call, and the failure mode is not a bug
// in the check — it is a route added in eight months by somebody who copies the shape of an existing
// handler and leaves the guard out. No behaviour test catches a file that does not exist yet.
//
// So this test asserts a property of the DIRECTORY: every handler in it goes through
// `readTwilioWebhook`, or is listed as exempt with a stated reason. Adding a route without either is
// a red suite, which is the only mechanism that reliably survives a year.
//
// This mirrors __tests__/notifications/every-job-mutation-notifies.test.ts, the same idea for job
// events.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const TWILIO_API_DIR = path.join(process.cwd(), 'app', 'api', 'twilio');

/**
 * Routes that legitimately do not verify a Twilio signature, each with the reason.
 *
 * Kept empty on purpose. An entry here is a public endpoint someone decided not to authenticate, and
 * it should take a paragraph of justification to add one.
 */
const EXEMPT: Record<string, string> = {};

function routeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(full);
  }
  return out;
}

const files = routeFiles(TWILIO_API_DIR);

describe('every Twilio webhook verifies its signature', () => {
  it('finds the routes at all, so an empty scan cannot pass silently', () => {
    // Without this, moving or renaming the directory makes the whole guard vacuous — it would scan
    // nothing, find no violations, and report green.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf-8');

    // Only handlers that accept data need the guard; a GET that returns a static document does not
    // mutate anything.
    const hasMutatingHandler = /export\s+(async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/.test(src);
    if (!hasMutatingHandler) continue;

    it(`${rel} calls readTwilioWebhook`, () => {
      if (EXEMPT[rel]) {
        expect(EXEMPT[rel].length, `${rel} is exempt but the reason is empty`).toBeGreaterThan(20);
        return;
      }
      expect(
        src.includes('readTwilioWebhook'),
        `${rel} handles a POST/PUT/PATCH/DELETE without verifying the Twilio signature. ` +
          'This URL is public: an unverified handler lets anyone forge call records or cause ' +
          'outbound dials billed to the firm. Call readTwilioWebhook(req, "<kind>") first, or add ' +
          'the route to EXEMPT with a reason.',
      ).toBe(true);
    });

    it(`${rel} checks the result before using the payload`, () => {
      if (EXEMPT[rel]) return;
      // Calling the guard and ignoring its verdict is the subtler version of the same bug, and it
      // reads as correct at a glance because the guard is right there in the file.
      expect(
        /\.ok\b/.test(src),
        `${rel} calls readTwilioWebhook but never tests \`.ok\`, so a rejected webhook falls ` +
          'through to the same code path as a genuine one.',
      ).toBe(true);
    });
  }
});

describe('the guard itself cannot be quietly weakened', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'phone', 'signature.ts'), 'utf-8');

  it('refuses rather than passes when no auth token is configured', () => {
    // The single most dangerous edit available: making a missing token mean "skip the check" turns
    // every webhook into an open endpoint, and it would look like a reasonable dev-mode convenience.
    expect(src).toContain("reason: 'no_auth_token'");
    expect(src).not.toMatch(/if\s*\(\s*!authToken\s*\)\s*return\s*\{\s*valid:\s*true/);
  });

  it('compares with a constant-time function, not ===', () => {
    expect(src).toContain('timingSafeEqual');
  });
});
