// __tests__/dnd/discord-webhook.test.ts — rolls out to where the table already is (P10-4).
//
// P3-1 got sheet rolls onto the shared feed; this mirrors that feed into Discord.
//
// MOST OF THIS FILE IS THE URL GUARD, and that is proportionate. A "webhook URL" field makes the SERVER
// issue a POST to an address a user typed in. Unvalidated, that is a request-forgery primitive aimed at
// anything the server can reach — the cloud metadata endpoint, an internal admin route, a port scan. The
// only version of this check that is not blocklist whack-a-mole is an allowlist of Discord's own hosts,
// and the tests below are mostly attempts to get past it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDiscordWebhookUrl, maskWebhookUrl, rollToDiscordMessage, redactCampaignSecrets,
  CAMPAIGN_SECRET_FIELDS, DISCORD_CONTENT_LIMIT,
} from '@/lib/dnd/discord';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const OK = 'https://discord.com/api/webhooks/123456789/abcDEF-ghi_jkl';

describe('the URL guard is an ALLOWLIST', () => {
  it('accepts a real webhook, including the versioned and legacy forms', () => {
    expect(isDiscordWebhookUrl(OK)).toBe(true);
    expect(isDiscordWebhookUrl('https://discord.com/api/v10/webhooks/1/tok')).toBe(true);
    expect(isDiscordWebhookUrl('https://discordapp.com/api/webhooks/1/tok')).toBe(true);
    expect(isDiscordWebhookUrl('https://ptb.discord.com/api/webhooks/1/tok')).toBe(true);
    expect(isDiscordWebhookUrl(`${OK}/`)).toBe(true);
  });

  it('REFUSES A LOOK-ALIKE HOST', () => {
    // The attack the check exists for. Every one of these contains the string "discord.com", and a
    // substring test — the obvious implementation — passes all of them.
    for (const bad of [
      'https://evil.com/discord.com/api/webhooks/1/tok',
      'https://discord.com.evil.com/api/webhooks/1/tok',
      'https://notdiscord.com/api/webhooks/1/tok',
      'https://discord.com@evil.com/api/webhooks/1/tok',
    ]) {
      expect(isDiscordWebhookUrl(bad), bad).toBe(false);
    }
  });

  it('refuses anything that is not https', () => {
    // Plaintext would put the token on the wire; `file:` and `gopher:` are the classic SSRF escapes.
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/1/tok')).toBe(false);
    expect(isDiscordWebhookUrl('file:///etc/passwd')).toBe(false);
  });

  it('refuses internal addresses outright', () => {
    // The reason this is an allowlist and not a "block localhost" list: there is no end to this list, and
    // an allowlist makes every one of them fail without naming any of them.
    for (const bad of [
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/api/webhooks/1/tok',
      'https://127.0.0.1/api/webhooks/1/tok',
      'https://[::1]/api/webhooks/1/tok',
      'https://10.0.0.5/api/webhooks/1/tok',
    ]) {
      expect(isDiscordWebhookUrl(bad), bad).toBe(false);
    }
  });

  it('refuses a Discord URL that is not a webhook path', () => {
    // A channel link is the mistake a DM actually makes, and it must be refused rather than POSTed to.
    expect(isDiscordWebhookUrl('https://discord.com/channels/123/456')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/notanumber/tok')).toBe(false);
  });

  it('and refuses junk without throwing', () => {
    for (const bad of ['', '   ', 'not a url', null, undefined, 42, {}]) {
      expect(isDiscordWebhookUrl(bad as unknown), String(bad)).toBe(false);
    }
  });
});

describe('the token is never shown in full', () => {
  it('masks all but the last four characters', () => {
    const masked = maskWebhookUrl(OK);
    expect(masked).toContain('discord.com/api/webhooks/123456789');
    expect(masked).toContain('••••');
    expect(masked).not.toContain('abcDEF-ghi_jkl');
    // Keeping four characters is what makes two webhooks distinguishable — the actual question a DM is
    // asking ("is this the right one?") without answering the one that matters.
    expect(masked.endsWith('_jkl')).toBe(true);
  });

  it('and degrades safely on junk rather than leaking the input', () => {
    expect(maskWebhookUrl('nonsense')).toBe('••••');
    expect(maskWebhookUrl('')).toBe('');
    expect(maskWebhookUrl(null)).toBe('');
  });
});

describe('the message', () => {
  it('reads like a person rolling', () => {
    const m = rollToDiscordMessage({ characterName: 'Vex', label: 'Perception', result: 18, breakdown: '1d20[13]+5' });
    expect(m.content).toContain('**Vex**');
    expect(m.content).toContain('Perception');
    expect(m.content).toContain('**18**');
    // Backticks, so `1d20[13]+5` is not mangled by markdown.
    expect(m.content).toContain('`1d20[13]+5`');
  });

  it('marks crits and fumbles, and never both', () => {
    expect(rollToDiscordMessage({ label: 'Attack', result: 20, crit: true }).content).toContain('CRIT');
    expect(rollToDiscordMessage({ label: 'Attack', result: 1, fumble: true }).content).toContain('FUMBLE');
    const both = rollToDiscordMessage({ label: 'Attack', result: 20, crit: true, fumble: true }).content;
    expect(both).toContain('CRIT');
    expect(both).not.toContain('FUMBLE');
  });

  it('falls back through character → actor → "Someone"', () => {
    expect(rollToDiscordMessage({ label: 'x', actorName: 'Jacob' }).content).toContain('**Jacob**');
    expect(rollToDiscordMessage({ label: 'x' }).content).toContain('**Someone**');
  });

  it('and is TRUNCATED to Discord’s hard limit', () => {
    // Discord rejects a message over 2000 characters outright, so an over-long roll would silently post
    // nothing at all — the failure that looks like the feature is off.
    const m = rollToDiscordMessage({ label: 'x'.repeat(5000), result: 1 });
    expect(m.content.length).toBeLessThanOrEqual(DISCORD_CONTENT_LIMIT);
    expect(m.content.endsWith('…')).toBe(true);
  });
});

describe('the credential does not leak', () => {
  it('the campaign export redacts it', () => {
    // The export selects `*`, so the column would otherwise ride along in a file a DM downloads and might
    // forward. Found while wiring this, not by the export slice.
    const out = redactCampaignSecrets({ id: 'c1', name: 'X', discord_webhook_url: OK });
    expect(out.discord_webhook_url).toBe('[redacted]');
    expect(out.name).toBe('X');
    // An unset one stays null rather than becoming the string '[redacted]', which would read as "there is
    // one, hidden" when there is not.
    expect(redactCampaignSecrets({ discord_webhook_url: null }).discord_webhook_url).toBeNull();
  });

  it('and the export route actually calls it', () => {
    expect(read('app/api/dnd/campaigns/[id]/export/route.ts')).toContain('redactCampaignSecrets(campaign');
  });

  it('the secret list is not empty (an empty one redacts nothing, silently)', () => {
    expect(CAMPAIGN_SECRET_FIELDS.length).toBeGreaterThan(0);
  });

  it('the campaign GET returns it MASKED, and only to the DM', () => {
    const route = read('app/api/dnd/campaigns/[id]/route.ts');
    expect(route).toContain("discordWebhook: role === 'dm' ? maskWebhookUrl(");
    // The main campaign select must not name the column at all.
    //
    // ASSERTS THE ABSENCE, not one exact string. This used to pin the literal
    // `.select('id, name, blurb, theme, created_at')`, which made it fail the moment P14-10 added
    // `thumbnail_url` to that list — a legitimate, unrelated widening. The rule being protected is
    // "the webhook column is never selected here", and a test that breaks on every other column
    // added is a test people fix by pasting in the new string, which is how the real guard gets
    // pasted away. Both selects in this file are checked, so a NEW one cannot skip the rule either.
    // The rule is about the SHARED campaign read — the one that fetches `name`/`blurb` and is returned
    // to every member. The route also has a deliberate DM-only `.select('discord_webhook_url')` for the
    // masked value, so a blanket "no select mentions it" is the wrong rule and fails on the real one.
    const shared = (route.match(/\.select\('[^']*'\)/g) ?? []).filter((s) => s.includes('name'));
    expect(shared.length).toBeGreaterThan(0);
    for (const s of shared) expect(s).not.toContain('discord_webhook_url');
  });

  it('and the manage page masks it SERVER-side, before it reaches a client prop', () => {
    // A raw value passed into a client component lands in the page's serialised RSC payload and is
    // readable in view-source.
    const page = read('app/dnd/campaigns/[id]/manage/page.tsx');
    expect(page).toContain('current={maskWebhookUrl(webhook)}');
  });
});

describe('the write path', () => {
  const route = read('app/api/dnd/campaigns/[id]/route.ts');

  it('is DM-only and validates before storing', () => {
    expect(route).toContain('isDiscordWebhookUrl(raw)');
    expect(route).toMatch(/Only the DM can edit the campaign/);
  });

  it('an empty string clears it — that is how the feature is turned off', () => {
    expect(route).toContain('patch.discord_webhook_url = null;');
  });

  it('and a bad URL is REFUSED rather than dropped', () => {
    // Silently ignoring it would leave the DM staring at a control that says nothing is configured after
    // they pasted something — the worst kind of "nothing happened".
    expect(route).toMatch(/That is not a Discord webhook URL/);
  });
});

describe('the send path never costs a roll', () => {
  const route = read('app/api/dnd/rolls/route.ts');

  it('posts AFTER the insert, so the shared log stays authoritative', () => {
    const insertAt = route.indexOf("from('dnd_roll_log')");
    const discordAt = route.indexOf('sendToDiscord(');
    expect(insertAt).toBeGreaterThan(-1);
    expect(discordAt).toBeGreaterThan(insertAt);
  });

  it('is fire-and-forget, and the whole block is wrapped', () => {
    // Same first rule as publishRoll: a roll must never fail because the network did. `sendToDiscord`
    // returns void rather than a promise so there is nothing to await by accident.
    expect(read('lib/dnd/discord.ts')).toMatch(/export function sendToDiscord\([^)]*\): void/);
    expect(route).toMatch(/try \{[\s\S]{0,600}sendToDiscord\([\s\S]{0,400}\} catch \{/);
  });

  it('re-validates immediately before the request leaves', () => {
    // The check that matters is the last one — a caller that skipped validation on the way in must not be
    // able to turn this into an arbitrary POST.
    expect(read('lib/dnd/discord.ts')).toMatch(/sendToDiscord[\s\S]{0,300}if \(!isDiscordWebhookUrl\(webhookUrl\)\) return;/);
  });

  it('and works before seed 461 is applied', () => {
    // The column arrives with a seed the owner has not run. A roll must not 500 because of that.
    expect(route).toMatch(/seed 461/);
  });
});
