// lib/dnd/maps/execute.ts — perform a resolved trigger plan (M6-4's executor).
//
// M6-5 shipped the engine and named this as the larger half, with a condition attached:
//
//   *"Deliberately not rushed into this slice: a half-implemented executor that silently no-ops three of
//    its eleven actions is worse than an engine that plainly has no executor, because the DM's preview
//    would promise things that never happen."*
//
// So the contract here is not "perform everything". It is **every action returns an outcome, and no
// action returns nothing.** Three of the eleven genuinely cannot be performed by a server, and each says
// so in words a DM can act on rather than disappearing into a success count.
//
// ── THE THREE OUTCOMES, AND WHY `asked` IS NOT A FAILURE ───────────────────────────────────────────
//
//   · `done`   — the database changed.
//   · `asked`  — the table has to do it. A `roll_check` needs a player to roll a die; a `play_sound`
//                needs the session console's speakers. Recording these as failures would make a healthy
//                puzzle look broken, and recording them as `done` would be the lie this file exists to
//                prevent. They are posted to the campaign feed so the DM sees the ask.
//   · `failed` — it was attempted and the database refused, or the action names something that is not
//                there. Named with the reason.
//
// ── THE FEED IS `dnd_roll_log`, NOT A NEW TABLE ───────────────────────────────────────────────────
//
// M7-4 already says map-driven activity belongs in *"the existing recent-rolls feed … the feed work
// already shipped is the right home, not a second log"*. A trigger posting to its own log would be a
// second place a DM has to look during a fight, which is the moment they have least attention to spare.

import { supabaseAdmin } from '@/lib/supabase';
import { clampToMap, snapToGrid } from './tokens';
import type { Plan, TriggerAction } from './triggers';

export type OutcomeStatus = 'done' | 'asked' | 'failed';

export interface Outcome {
  kind: string;
  status: OutcomeStatus;
  detail: string;
}

export interface ExecutionReport {
  outcomes: Outcome[];
  done: number;
  asked: number;
  failed: number;
}

export interface ExecuteContext {
  campaignId: string;
  /** The node the trigger lives on — where `move_token` and `spawn_creature` write. */
  nodeId: string;
  /** The node's grid and bounds, so a moved token lands on a square like every other placement. */
  grid: unknown;
  bounds: unknown;
  /**
   * Who set it off. NOT used as the feed's actor — see `postFeed`, where the role is what the column
   * answers. Kept because a later audit trail wants to know which DM pressed the button.
   */
  actorName?: string | null;
}

/** Names a thing the same way the rest of the map does, so the feed and the board agree. */
const nameOf = (v: unknown, fallback: string) =>
  (typeof v === 'string' && v.trim()) || fallback;

/**
 * Perform every action in a plan, in order.
 *
 * IN ORDER, and sequentially rather than in parallel: a puzzle that reveals a door and then moves a token
 * through it has an order, and running the two at once would sometimes do them backwards. The engine
 * already produced them in the order the DM wrote.
 */
export async function executePlan(plan: Plan, ctx: ExecuteContext): Promise<ExecutionReport> {
  const outcomes: Outcome[] = [];
  for (const action of plan.actions) {
    outcomes.push(await performOne(action, ctx));
  }
  return {
    outcomes,
    done: outcomes.filter((o) => o.status === 'done').length,
    asked: outcomes.filter((o) => o.status === 'asked').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
  };
}

async function performOne(action: TriggerAction, ctx: ExecuteContext): Promise<Outcome> {
  const kind = action.kind;
  const out = (status: OutcomeStatus, detail: string): Outcome => ({ kind, status, detail });

  try {
    switch (kind) {
      // ── the map's own state ───────────────────────────────────────────────────────────────────────
      case 'reveal_object':
      case 'hide_object': {
        const id = String(action.objectId ?? '');
        if (!id) return out('failed', `${kind} names no object.`);
        const visibility = kind === 'reveal_object' ? 'players' : 'dm';
        // Scoped to THIS node. A trigger on one map must not reach into another campaign's object by id,
        // and the node is the only campaign-bounded thing this executor is given.
        const { data, error } = await supabaseAdmin
          .from('dnd_map_objects')
          .update({ visibility, updated_at: new Date().toISOString() })
          .eq('id', id).eq('map_node_id', ctx.nodeId)
          .select('id, label');
        if (error) return out('failed', error.message);
        if (!data?.length) return out('failed', `No object "${id}" on this map.`);
        const label = nameOf((data[0] as { label: string | null }).label, 'an object');
        return out('done', `${kind === 'reveal_object' ? 'Revealed' : 'Hid'} ${label}.`);
      }

      case 'move_token': {
        const id = String(action.objectId ?? '');
        const x = Number(action.x);
        const y = Number(action.y);
        if (!id) return out('failed', 'move_token names no token.');
        if (!Number.isFinite(x) || !Number.isFinite(y)) return out('failed', 'move_token needs a numeric x and y.');
        // Snapped and clamped through the same helpers the placing route uses, so a trigger cannot put a
        // token somewhere a DM could not — including outside the map, where nothing can scroll to it.
        const snapped = snapToGrid(x, y, ctx.grid as Record<string, unknown>);
        const at = clampToMap(snapped.x, snapped.y, ctx.bounds as { maxX?: number; maxY?: number });
        const { data, error } = await supabaseAdmin
          .from('dnd_map_objects')
          .update({ x: at.x, y: at.y, updated_at: new Date().toISOString() })
          .eq('id', id).eq('map_node_id', ctx.nodeId)
          .select('id, label');
        if (error) return out('failed', error.message);
        if (!data?.length) return out('failed', `No token "${id}" on this map.`);
        return out('done', `Moved ${nameOf((data[0] as { label: string | null }).label, 'a token')} to (${at.x}, ${at.y}).`);
      }

      case 'spawn_creature': {
        const creatureId = String(action.creatureId ?? '');
        if (!creatureId) return out('failed', 'spawn_creature names no creature.');
        const x = Number(action.x);
        const y = Number(action.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return out('failed', 'spawn_creature needs a numeric x and y.');
        const snapped = snapToGrid(x, y, ctx.grid as Record<string, unknown>);
        const at = clampToMap(snapped.x, snapped.y, ctx.bounds as { maxX?: number; maxY?: number });
        const { error } = await supabaseAdmin.from('dnd_map_objects').insert({
          map_node_id: ctx.nodeId, kind: 'token', x: at.x, y: at.y,
          // Visible: a creature that ambushes the party is a creature they are meant to see arrive. A DM
          // who wants it hidden hides it — the object tools do that in one press.
          visibility: 'players',
          label: nameOf(action.label, 'Spawned creature'),
          data: { creatureId },
        });
        if (error) return out('failed', error.message);
        return out('done', `Spawned ${nameOf(action.label, 'a creature')} at (${at.x}, ${at.y}).`);
      }

      // ── the sheet ─────────────────────────────────────────────────────────────────────────────────
      case 'apply_condition': {
        const characterId = String(action.characterId ?? '');
        const condition = String(action.condition ?? '').trim();
        if (!characterId || !condition) return out('failed', 'apply_condition needs a characterId and a condition.');
        const { data: row } = await supabaseAdmin
          .from('dnd_characters').select('id, name, data')
          .eq('id', characterId).eq('campaign_id', ctx.campaignId).maybeSingle();
        if (!row) return out('failed', `No character "${characterId}" in this campaign.`);
        const sheet = ((row as { data: unknown }).data ?? {}) as Record<string, unknown>;
        const combat = (sheet.combat ?? {}) as Record<string, unknown>;
        const list = Array.isArray(combat.conditions) ? (combat.conditions as unknown[]).map(String) : [];
        // ALREADY THERE IS `done`, NOT A FAILURE. A pit trap that fires twice should not report an error
        // the second time — the character is prone either way, which is the state the DM asked for.
        if (list.some((c) => c.toLowerCase() === condition.toLowerCase())) {
          return out('done', `${(row as { name: string }).name} was already ${condition}.`);
        }
        const { error } = await supabaseAdmin
          .from('dnd_characters')
          .update({ data: { ...sheet, combat: { ...combat, conditions: [...list, condition] } } })
          .eq('id', characterId);
        if (error) return out('failed', error.message);
        return out('done', `${(row as { name: string }).name} is now ${condition}.`);
      }

      case 'apply_damage': {
        const characterId = String(action.characterId ?? '');
        const amount = Number(action.amount);
        if (!characterId || !Number.isFinite(amount)) {
          return out('failed', 'apply_damage needs a characterId and a numeric amount.');
        }
        const { data: row } = await supabaseAdmin
          .from('dnd_characters').select('id, name, data')
          .eq('id', characterId).eq('campaign_id', ctx.campaignId).maybeSingle();
        if (!row) return out('failed', `No character "${characterId}" in this campaign.`);
        const sheet = ((row as { data: unknown }).data ?? {}) as Record<string, unknown>;
        const combat = (sheet.combat ?? {}) as Record<string, unknown>;
        const hp = (combat.hp ?? {}) as Record<string, unknown>;
        const before = Number(hp.current);
        if (!Number.isFinite(before)) {
          // Refused rather than guessed. Writing `0 - amount` onto a sheet with no HP would invent a
          // number for a character whose HP the map has no business deciding.
          return out('failed', `${(row as { name: string }).name} has no current HP on their sheet, so damage cannot be applied.`);
        }
        // Floored at zero: negative HP is a rules question this map does not get to answer (5e says 0 and
        // death saves, other systems differ), and a −7 on a sheet is a number no ruleset produced.
        const after = Math.max(0, before - amount);
        const { error } = await supabaseAdmin
          .from('dnd_characters')
          .update({ data: { ...sheet, combat: { ...combat, hp: { ...hp, current: after } } } })
          .eq('id', characterId);
        if (error) return out('failed', error.message);
        return out('done', `${(row as { name: string }).name} takes ${amount} damage (${before} → ${after}).`);
      }

      // ── things the table does, not the server ─────────────────────────────────────────────────────
      case 'roll_check': {
        // A die is rolled by a person. The server could generate a number, and that would be the map
        // quietly taking a roll away from the table — the same reason `maps/search` accepts the player's
        // total instead of re-deriving it.
        const what = nameOf(action.skill ?? action.label, 'a check');
        const dc = Number(action.dc);
        const ask = `Roll ${what}${Number.isFinite(dc) ? ` (DC ${dc})` : ''}.`;
        await postFeed(ctx, ask, 'Trigger');
        return out('asked', ask);
      }

      case 'play_sound': {
        // Speakers are in the room, not on the server. The sound is LOOKED UP so a broken reference is
        // reported now rather than discovered as silence mid-scene.
        const label = nameOf(action.sound ?? action.label, '');
        if (!label) return out('failed', 'play_sound names no sound.');
        const { data } = await supabaseAdmin
          .from('dnd_sounds').select('id, label').eq('campaign_id', ctx.campaignId).ilike('label', label).limit(1);
        if (!data?.length) return out('failed', `No sound called "${label}" in this campaign's soundboard.`);
        await postFeed(ctx, `♪ ${label}`, 'Trigger');
        return out('asked', `Cue "${label}" on the soundboard.`);
      }

      // ── narration ────────────────────────────────────────────────────────────────────────────────
      case 'show_description':
      case 'post_feed': {
        const text = nameOf(action.text ?? action.description ?? action.message, '');
        if (!text) return out('failed', `${kind} has no text to say.`);
        const ok = await postFeed(ctx, text, kind === 'show_description' ? 'Read aloud' : 'Map');
        return ok ? out('done', text) : out('failed', 'Could not post to the campaign feed.');
      }

      // ── already handled upstream ─────────────────────────────────────────────────────────────────
      case 'fire_trigger':
        // `resolve` walks these and inlines the chained trigger's own actions, so one reaching the
        // executor means the engine reported a problem about it (a dangling reference) and kept it in the
        // plan rather than dropping it. Saying so is more useful than performing nothing quietly.
        return out('failed', 'This trigger chains to one that could not be resolved — see the problems above.');

      default:
        // The engine already reported it as unknown and kept it in the plan so nothing disappears
        // silently. The executor's job is to not be the place it disappears either.
        return out('failed', `"${kind}" is not an action this map knows how to perform.`);
    }
  } catch (e) {
    return out('failed', e instanceof Error ? e.message : 'Unknown error.');
  }
}

/**
 * One line in the campaign's live feed. Best-effort is NOT acceptable — the caller reports a failure.
 *
 * The actor column is the ROLE, not the DM's name, and that was a real slip: the first version wrote the
 * session's display name, so the feed read *"Andrew — The floor gives way beneath you."* The column
 * answers "who is speaking", and for a trap the answer is the trap. Everyone at the table already knows
 * who the DM is; what they cannot tell from a name is read-aloud text from an instruction to roll.
 */
async function postFeed(ctx: ExecuteContext, label: string, actor: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('dnd_roll_log').insert({
    campaign_id: ctx.campaignId,
    actor_name: actor,
    label,
    // No formula and no result: this is narration, not a roll, and a `0` in the result column would put a
    // die that nobody threw into the feed.
    crit: false,
    fumble: false,
  });
  return !error;
}

/** One line summarising a run, for the DM's confirmation. */
export function describeExecution(report: ExecutionReport): string {
  if (!report.outcomes.length) return 'Nothing to do — this trigger has no actions.';
  const parts = [`${report.done} done`];
  if (report.asked) parts.push(`${report.asked} for the table`);
  if (report.failed) parts.push(`${report.failed} failed`);
  return parts.join(' · ');
}
