import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { detectCaptcha, describeCaptcha } from '../research/captcha-signatures.js';

// ── B6: a captcha answers 200 with real HTML, so a "successful" fetch parses to zero results ──────
// unless the page is read for the wall's signature. detectCaptcha names it so the run reports a
// captcha instead of an empty search. It never solves anything — solving is refused by policy.

describe('detectCaptcha', () => {
  it('recognises reCAPTCHA', () => {
    const s = detectCaptcha('<script src="https://www.google.com/recaptcha/api.js"></script>');
    expect(s.present).toBe(true);
    expect(s.kind).toBe('reCAPTCHA');
  });

  it('recognises hCaptcha and Cloudflare Turnstile', () => {
    expect(detectCaptcha('<div class="h-captcha" data-sitekey="x"></div>').kind).toBe('hCaptcha');
    expect(detectCaptcha('<div class="cf-turnstile"></div>').kind).toBe('Cloudflare Turnstile');
  });

  it('recognises a Cloudflare interstitial and a bot-management wall', () => {
    expect(detectCaptcha('Checking your browser before accessing the site. cdn-cgi/challenge-platform').kind).toBe('Cloudflare challenge');
    expect(detectCaptcha('<script>window._pxAppId="PX123"</script>').kind).toBe('bot-management challenge');
  });

  it('recognises a plain human-verification prompt', () => {
    expect(detectCaptcha('Please verify you are a human to continue').kind).toBe('human-verification prompt');
    expect(detectCaptcha("I'm not a robot").kind).toBe('human-verification prompt');
  });

  it('does not fire on an ordinary results page', () => {
    const html = '<html><body><table><tr><td>OAK ESTATES</td><td><a href="oaks.pdf">plat</a></td></tr></table></body></html>';
    const s = detectCaptcha(html);
    expect(s.present).toBe(false);
    expect(s.kind).toBeNull();
  });

  it('is safe on empty/null input', () => {
    expect(detectCaptcha('').present).toBe(false);
    expect(detectCaptcha(null).present).toBe(false);
  });
});

describe('describeCaptcha', () => {
  it('names the wall and says it was reported, not solved', () => {
    const line = describeCaptcha(detectCaptcha('grecaptcha.render()'));
    expect(line).toContain('reCAPTCHA');
    expect(line).toContain('not solved');
  });
});

describe('the plat index fetch reports a captcha instead of an empty index', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/county-plats.ts'), 'utf8');
  it('both the direct and browser-route success paths check detectCaptcha before returning html', () => {
    expect((src.match(/const captcha = detectCaptcha\(html\)/g) ?? []).length).toBe(2);
    expect(src).toContain('captcha in the way');
  });
});
