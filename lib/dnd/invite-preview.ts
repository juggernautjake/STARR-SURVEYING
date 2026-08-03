// lib/dnd/invite-preview.ts — what an invite link should SAY before you accept it (P14-10b).
//
// `/dnd/join/<code>` rendered a hardcoded "Join Campaign" and identified the campaign in no way at all —
// no name, no blurb, no picture. It is the one screen in the app where the reader genuinely does not know
// what they are looking at: an invite arrives as a bare URL, and the person clicking it is being asked to
// create an account for a table they cannot see the name of.
//
// ── WHAT IS SAFE TO SHOW, AND WHY ────────────────────────────────────────────────────────────────────
//
// The CODE IS THE CREDENTIAL. Holding it is what the DM granted, and it already buys membership through
// `auth/register` — so showing the campaign's own public identity (name, blurb, picture) to someone
// holding it reveals nothing that accepting would not. Deliberately NOT returned: the DM's notes, the
// member list, the roster, the Discord webhook — none of which the joiner is entitled to yet, and some of
// which is a credential.
//
// ── AN UNKNOWN CODE IS `null`, NOT AN ERROR ──────────────────────────────────────────────────────────
//
// The page still renders its form for a null preview. Two reasons, and only the first is about security:
// distinguishing "no such invite" from "invite to a campaign you may not see" would make this endpoint an
// oracle for guessing codes; and the register route is the thing that actually judges the code, so a page
// that refused early would be a second gate that can disagree with the real one. The joiner types their
// name, and `register` answers with the real reason.
//
// ── STATE IS REPORTED, NOT ENFORCED ──────────────────────────────────────────────────────────────────
//
// `used` and `expired` mirror `auth/register`'s own two refusals verbatim, so the page can say "this
// invite has already been used" BEFORE someone picks a name and a password and gets it thrown back. The
// page never blocks on them — `register` remains the only thing that decides, exactly as it does today.
import { supabaseAdmin } from '@/lib/supabase';

export interface InvitePreview {
  campaignId: string;
  campaignName: string;
  /** The campaign's public one-liner (`blurb`), if it has one. */
  setting: string | null;
  /** The campaign's picture (P14-10), so an invite looks like the table it is for. */
  thumbnailUrl: string | null;
  /** What the invite grants — a DM invite is a materially different thing to accept. */
  role: 'dm' | 'player';
  /** Already consumed. `auth/register` refuses these. */
  used: boolean;
  /** Past `expires_at`. `auth/register` refuses these too. */
  expired: boolean;
}

/**
 * Resolve an invite code to the campaign it is for, or `null` when there is nothing to show.
 *
 * Never throws: this decorates a page that must render regardless. A database hiccup degrades to the
 * old, unlabelled form rather than to an error screen on the one route a new player arrives through.
 */
export async function loadInvitePreview(code: string): Promise<InvitePreview | null> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return null;
  try {
    const { data } = await supabaseAdmin
      .from('dnd_invites')
      // Narrow on purpose. `register` selects `*` because it consumes the row; this only describes it,
      // and `character_id` / `created_by` / `used_by` are other people's identifiers.
      .select('campaign_id, role, expires_at, used_by')
      .eq('code', trimmed)
      .maybeSingle();
    const invite = data as { campaign_id: string; role: string; expires_at: string | null; used_by: string | null } | null;
    if (!invite?.campaign_id) return null;

    const { data: camp } = await supabaseAdmin
      .from('dnd_campaigns')
      .select('id, name, blurb, thumbnail_url')
      .eq('id', invite.campaign_id)
      .maybeSingle();
    const campaign = camp as { id: string; name: string; blurb: string | null; thumbnail_url: string | null } | null;
    // An invite whose campaign is gone is not a preview — the FK is ON DELETE CASCADE, so this is only
    // reachable mid-delete, and inventing a name for it would be worse than saying nothing.
    if (!campaign) return null;

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      setting: campaign.blurb?.trim() || null,
      thumbnailUrl: campaign.thumbnail_url ?? null,
      role: invite.role === 'dm' ? 'dm' : 'player',
      used: !!invite.used_by,
      expired: !!invite.expires_at && new Date(invite.expires_at) < new Date(),
    };
  } catch {
    return null;
  }
}
