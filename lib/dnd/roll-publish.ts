// lib/dnd/roll-publish.ts — put a sheet's rolls on the table's shared feed (P3-1, audit finding B-2).
//
// THE DEFECT. Every roll made on a character sheet — all four animated rollers, attacks, saves, damage,
// death saves — went into `commitRoll`, which is a local `setLog` capped at 40 entries. **Nothing posted to
// `/api/dnd/rolls`.** The only writer to the shared log was the manual dice box inside `RollFeed`, so the
// DM's "shared roll feed" showed rolls the DM typed in and none of the rolls the players actually made.
//
// The route's own header claimed the opposite — *"Every sheet / quick-sheet / quick-action / DM roll posts
// here"* — which means this was designed and then never wired. Four beautifully-built rollers that nobody
// else at the table could see.
//
// THREE RULES, and the first is the one that matters most:
//
//  1. **A roll must never fail because the network did.** Publishing is fire-and-forget: no await on the
//     render path, every error swallowed. A d20 that hangs or throws because a POST timed out would be a
//     far worse bug than the one this fixes.
//  2. **Only rolls at a TABLE are published.** A character with no campaign has no shared feed to post to,
//     and a standalone sheet's rolls are nobody else's business.
//  3. **The payload is what the log already holds.** The entry carries label, total, breakdown, crit and
//     fumble; nothing is recomputed here, so the feed and the sheet can never disagree about what was
//     rolled.
/** The bit of a roll-log entry this module needs. Declared HERE rather than imported from the sheet store:
 *  the store imports this file, so pulling its type back would be a cycle — and a publisher that depends on
 *  only five fields should say so. */
export interface PublishableRoll {
  label: string;
  total: number;
  breakdown?: string;
  crit?: boolean;
  fumble?: boolean;
}

export interface RollPublishContext {
  characterId?: string | null;
  campaignId?: string | null;
  /** Who to credit. The feed shows a name, and a roll attributed to nobody is noise. */
  actorName?: string | null;
}

/** The body `/api/dnd/rolls` accepts. Exported so a test can assert the shape without a network. */
export interface RollPublishBody {
  campaignId: string;
  characterId?: string;
  actorName?: string;
  label: string;
  formula?: string;
  result: number;
  breakdown?: string;
  crit: boolean;
  fumble: boolean;
}

/**
 * Turn a committed log entry into a publish body, or null when it should not be published.
 *
 * Pure, so the decision ("is this publishable, and as what") is testable without mocking fetch — which
 * matters because the *sending* is deliberately unobservable.
 */
export function rollPublishBody(
  entry: PublishableRoll,
  ctx: RollPublishContext,
): RollPublishBody | null {
  // Rule 2: no campaign, no shared feed.
  if (!ctx.campaignId) return null;
  const label = (entry.label ?? '').trim();
  // The route requires a label, so an unlabelled roll would 400. Refusing here keeps a pointless request
  // off the wire rather than relying on the server to reject it.
  if (!label) return null;

  return {
    campaignId: ctx.campaignId,
    ...(ctx.characterId ? { characterId: ctx.characterId } : {}),
    ...(ctx.actorName ? { actorName: ctx.actorName } : {}),
    label,
    // `breakdown` doubles as the formula: it is what the sheet already shows ("1d20+7 → 14+7"), and
    // inventing a second representation is how the feed starts disagreeing with the sheet.
    ...(entry.breakdown ? { formula: entry.breakdown, breakdown: entry.breakdown } : {}),
    result: Math.round(entry.total ?? 0),
    crit: !!entry.crit,
    fumble: !!entry.fumble,
  };
}

/**
 * Publish, and never let it matter if it fails.
 *
 * Deliberately returns void rather than a promise: an `await` here would put a network round trip on the
 * path between pressing a die and seeing it land. The caller cannot accidentally block on this, because
 * there is nothing to block on.
 */
export function publishRoll(
  entry: PublishableRoll,
  ctx: RollPublishContext,
): void {
  const body = rollPublishBody(entry, ctx);
  if (!body) return;
  // No `await`, and both rejection paths swallowed. Rule 1.
  try {
    void fetch('/api/dnd/rolls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // `keepalive` so a roll made as the tab closes still reaches the table — the one case where a
      // fire-and-forget request would otherwise be silently dropped by the browser.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never reachable in a browser, but a sheet rendered somewhere without `fetch` must not throw mid-roll.
  }
}
