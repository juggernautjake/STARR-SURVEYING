// worker/src/research/captcha-signatures.ts — recognise a captcha / bot-wall in a page, by content.
//
// Plan B6: "captcha presence detected and reported (with a screenshot) rather than silently timed
// out." A captcha page answers HTTP 200 with real HTML, so a fetch "succeeds" and then parses zero
// results — indistinguishable from a genuinely empty search unless someone looks at the page. This
// reads the page's own markup for the signatures the common walls leave, so a scraper can say "a
// captcha stood in the way" instead of "found nothing". It does NOT solve anything — solving is
// refused by policy (R12); the value is an honest, named report and a screenshot to go with it.

export interface CaptchaSignature {
  present: boolean;
  /** The wall's vendor/kind, when recognised. */
  kind:
    | 'reCAPTCHA'
    | 'hCaptcha'
    | 'Cloudflare Turnstile'
    | 'Cloudflare challenge'
    | 'bot-management challenge'
    | 'human-verification prompt'
    | null;
  /** The token that matched, so a person can confirm the call. */
  signature: string | null;
}

// Ordered strongest → weakest: a named widget beats a generic "verify you are human" phrase.
const SIGNATURES: Array<{ kind: NonNullable<CaptchaSignature['kind']>; re: RegExp }> = [
  { kind: 'reCAPTCHA', re: /www\.google\.com\/recaptcha|\bgrecaptcha\b|\bg-recaptcha\b|recaptcha\/api\.js/i },
  { kind: 'hCaptcha', re: /\bhcaptcha\.com\b|\bh-captcha\b|js\.hcaptcha\.com/i },
  { kind: 'Cloudflare Turnstile', re: /challenges\.cloudflare\.com|\bcf-turnstile\b|\bturnstile\b/i },
  { kind: 'Cloudflare challenge', re: /cf-browser-verification|checking your browser before|__cf_chl|cf[-_]challenge|cdn-cgi\/challenge-platform/i },
  { kind: 'bot-management challenge', re: /\bperimeterx\b|\bdatadome\b|\bincapsula\b|\bimperva\b|_px[A-Za-z0-9]*\b/i },
  { kind: 'human-verification prompt', re: /verify\s+you\s+are\s+(?:a\s+)?(?:human|not\s+a\s+(?:robot|bot))|i['’]?m\s+not\s+a\s+robot|are\s+you\s+a\s+human|please\s+complete\s+the\s+security\s+check/i },
];

/** Read a page's HTML/text for a captcha or bot-wall signature. Pure. */
export function detectCaptcha(html: string | null | undefined): CaptchaSignature {
  const text = html ?? '';
  if (!text) return { present: false, kind: null, signature: null };
  for (const { kind, re } of SIGNATURES) {
    const m = re.exec(text);
    if (m) return { present: true, kind, signature: m[0] };
  }
  return { present: false, kind: null, signature: null };
}

/** One line for the run log, naming the wall and what matched. */
export function describeCaptcha(sig: CaptchaSignature): string {
  if (!sig.present) return 'No captcha or bot-wall signature on the page.';
  return `A ${sig.kind} stood in the way (matched "${sig.signature}") — reported, not solved; a screenshot is kept.`;
}
