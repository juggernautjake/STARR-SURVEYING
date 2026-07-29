// lib/dnd/discord.ts — put a table's rolls where the table already is (P10-4).
//
// The counterpart to `roll-publish.ts`, and it follows the same first rule: **a roll must never fail
// because the network did.** P3-1 fixed rolls not reaching the shared feed; this puts that same feed into
// the Discord channel most tables are already sitting in.
//
// THE URL IS A CREDENTIAL, AND ALSO AN SSRF VECTOR. This module makes the server POST to an address a user
// typed in. Two consequences, both handled here rather than at the call site:
//
//   · It is validated against Discord's OWN hosts, as an allowlist. Without that, "webhook URL" is a
//     request-forgery primitive pointed at anything the server can reach — `http://169.254.169.254/`, an
//     internal admin endpoint, a port scan. An allowlist is the only form of this check that is not a
//     game of blocklist whack-a-mole.
//   · It is never shown back in full. `maskWebhookUrl` exists so the DM can confirm which webhook is
//     configured without the page, the export, or a screenshot carrying the token.

/** Discord's webhook hosts. Both are live; `discordapp.com` is the legacy domain and still works. */
const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);

/**
 * Is this a real Discord webhook URL?
 *
 * An ALLOWLIST of host + path shape, over https only. Everything else is refused, including
 * `https://evil.com/discord.com/api/webhooks/...` (host is checked, not the string) and
 * `http://discord.com/...` (plaintext would put the token on the wire).
 */
export function isDiscordWebhookUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (!DISCORD_HOSTS.has(u.hostname.toLowerCase())) return false;
  // /api/webhooks/<id>/<token> — optionally /api/v10/webhooks/...
  return /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname);
}

/**
 * A webhook URL with its token hidden: `https://discord.com/api/webhooks/12345/••••abcd`.
 *
 * Shown wherever the DM needs to know one is configured. Keeping the last four characters makes two
 * different webhooks distinguishable, which is the actual question being asked ("is this the right one?")
 * without answering the one that matters ("what is the token?").
 */
export function maskWebhookUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const parts = u.pathname.split('/').filter(Boolean);
    const token = parts[parts.length - 1] ?? '';
    const tail = token.length > 4 ? token.slice(-4) : '';
    parts[parts.length - 1] = `••••${tail}`;
    return `${u.origin}/${parts.join('/')}`;
  } catch {
    return '••••';
  }
}

export interface DiscordRoll {
  actorName?: string | null;
  characterName?: string | null;
  label: string;
  result?: number | null;
  breakdown?: string | null;
  crit?: boolean;
  fumble?: boolean;
}

/** Discord rejects a message over 2000 characters outright, so this is a hard limit, not a nicety. */
export const DISCORD_CONTENT_LIMIT = 2000;

/**
 * One roll as a Discord message body.
 *
 * Plain `content` rather than an embed: embeds are collapsed by Discord's mobile clients and read as
 * bot-spam in a busy channel, while a one-line roll reads like a person rolling. The breakdown rides in
 * backticks so `1d20[18]+5` is not mangled by markdown.
 */
export function rollToDiscordMessage(roll: DiscordRoll): { content: string } {
  const who = (roll.characterName || roll.actorName || 'Someone').trim();
  const mark = roll.crit ? ' 💥 **CRIT**' : roll.fumble ? ' 💀 **FUMBLE**' : '';
  const total = roll.result == null ? '' : ` **${roll.result}**`;
  const detail = roll.breakdown ? `  \`${roll.breakdown}\`` : '';
  const line = `🎲 **${who}** — ${roll.label}${total}${mark}${detail}`;
  return { content: line.length > DISCORD_CONTENT_LIMIT ? `${line.slice(0, DISCORD_CONTENT_LIMIT - 1)}…` : line };
}

/**
 * Send a message, and never let the caller feel it.
 *
 * Returns `void`, not a promise — the same shape and the same reason as `publishRoll`. A roll that hung or
 * threw because Discord was slow would be a far worse bug than the one this feature fixes, and awaiting it
 * on the request path would make every roll in the campaign as slow as Discord's worst minute.
 *
 * Refuses a non-Discord URL even here, so the guard cannot be bypassed by a caller that skipped validation
 * on the way in — the check that matters is the one immediately before the request leaves.
 */
export function sendToDiscord(webhookUrl: string | null | undefined, body: { content: string }): void {
  if (!isDiscordWebhookUrl(webhookUrl)) return;
  try {
    void fetch(webhookUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Discord's own suggestion for bots that do not need the response.
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never surfaces */
  }
}

/** Fields that must never leave the server in a campaign payload. Exported so the export route and any
 *  future serialiser share one list rather than each remembering. */
export const CAMPAIGN_SECRET_FIELDS = ['discord_webhook_url'] as const;

/** Strip the secrets from a campaign row. Used by the campaign export, which selects `*`. */
export function redactCampaignSecrets<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const f of CAMPAIGN_SECRET_FIELDS) {
    if (f in out) (out as Record<string, unknown>)[f] = out[f] ? '[redacted]' : null;
  }
  return out;
}
