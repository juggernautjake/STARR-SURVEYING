/**
 * Bell County Site Intelligence Analyzer
 *
 * Uses AI to analyze screenshots of every page visited during research.
 * Identifies features, options, and patterns we could exploit to improve
 * the scraping system. This is a self-improvement mechanism.
 */

import type { ScreenshotCapture, SiteIntelligenceNote } from '../types/research-result';

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Analyze all captured screenshots for system improvement opportunities.
 */
export async function analyzeSiteScreenshots(
  screenshots: ScreenshotCapture[],
  anthropicApiKey: string,
  onProgress: (msg: string) => void,
): Promise<SiteIntelligenceNote[]> {
  if (!anthropicApiKey || screenshots.length === 0) return [];

  onProgress(`Analyzing ${screenshots.length} screenshot(s) for system improvement...`);

  const notes: SiteIntelligenceNote[] = [];

  // Group screenshots by source domain to reduce API calls
  const byDomain = new Map<string, ScreenshotCapture[]>();
  for (const ss of screenshots) {
    try {
      const domain = new URL(ss.url).hostname;
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push(ss);
    } catch {
      // Invalid URL — skip
    }
  }

  for (const [domain, domainScreenshots] of byDomain) {
    onProgress(`Analyzing ${domain} (${domainScreenshots.length} page(s))...`);

    // Analyze up to 5 screenshots per domain (to control cost)
    const sampled = domainScreenshots.slice(0, 5);

    for (const ss of sampled) {
      const analysis = await analyzeScreenshot(ss, anthropicApiKey);
      if (analysis) {
        notes.push(analysis);
      }
    }
  }

  onProgress(`Site intelligence: ${notes.length} observation(s) recorded`);
  return notes;
}

// ── Internal: Individual Screenshot Analysis ─────────────────────────

async function analyzeScreenshot(
  screenshot: ScreenshotCapture,
  apiKey: string,
): Promise<SiteIntelligenceNote | null> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.imageBase64,
            },
          },
          {
            type: 'text',
            text: `You are analyzing a screenshot of a government/county website page that was visited during property research. URL: ${screenshot.url}

Analyze this page and report:

1. OBSERVATIONS: What does this page show? What data is displayed? What interactive elements exist (search boxes, dropdowns, filters, tabs, maps, tables)?

2. IMPROVEMENT SUGGESTIONS: What features or data on this page are we NOT currently scraping that could be valuable? Are there:
   - Search filters or options we're not using?
   - Additional data fields visible that we could extract?
   - Navigation links to other useful pages?
   - Map features or layers we could query?
   - Download options or export features?
   - Pagination that suggests more data?
   - API endpoints hinted at in the page structure?

Respond in JSON format:
{
  "observations": ["observation 1", "observation 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Only include genuinely useful observations. Skip obvious things.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    if (!textBlock) return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          url: screenshot.url,
          screenshot: screenshot.imageBase64,
          observations: parsed.observations ?? [],
          suggestions: parsed.suggestions ?? [],
        };
      } catch (parseErr) {
        console.warn(
          `[site-intelligence] JSON parse failed for ${screenshot.url}: ` +
          `${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      `[site-intelligence] AI screenshot analysis failed for ${screenshot.url}: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return null;
}
