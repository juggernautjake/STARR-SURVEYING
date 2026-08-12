// lib/receipts/rematch-cards.ts — what happens to yesterday's flags when a card is registered today.
//
// The card check runs during extraction, against the cards on file AT THAT MOMENT. That is the only
// thing it can do, and it leaves a gap that would otherwise never close:
//
//   A receipt is captured. The fuel card is not registered yet, so the receipt is flagged
//   *"Card ending 4054 is NOT on file — add it under company cards."* The bookkeeper does exactly
//   that. And the receipt keeps saying the card is not on file, because nothing re-asks the question.
//
// A flag that survives the fix it asked for is worse than no flag: it teaches people that the flags
// are noise. So registering or editing a card re-asks it, for every receipt that is still waiting on
// an answer.
//
// ── WHAT IS AND IS NOT TOUCHED ────────────────────────────────────────────────────────────────────
//
// Only receipts whose card question is still OPEN — `not_on_file` and `unknown`. Deliberately not
// `on_file`: a receipt already matched to a card was matched to a DIFFERENT card, and quietly
// re-pointing it because a new card shares four digits would rewrite a settled fact. Two cards ending
// 4054 is ordinary (see seed 572), and this is exactly where that bites.
//
// `retired` is left alone for the same reason — it is matched, and the flag on it is a statement
// about the purchase, not an open question.
//
// The receipt's OWN evidence is never rewritten. `payment_last4` stays as captured; what changes is
// the conclusion drawn from it.

import { supabaseAdmin } from '@/lib/supabase';
import { matchCardOnFile, type CardOnFile } from './card-on-file';

/** The statuses that represent an unanswered question. See the header for why `on_file` is absent. */
const OPEN_STATUSES = ['not_on_file', 'unknown'];

export interface RematchSummary {
  /** Receipts examined. */
  considered: number;
  /** Receipts whose card question changed answer. */
  updated: number;
  /** Of those, how many now resolve to a card on file. */
  resolved: number;
}

interface ReceiptRow {
  id: string;
  payment_method: string | null;
  payment_last4: string | null;
  card_match_status: string | null;
  ai_extras: { card_brand?: string | null; card_holder_name?: string | null; review_flags?: string[] } | null;
}

/**
 * Re-run the card check over receipts that are still waiting for an answer.
 *
 * Best-effort and non-throwing: this runs as a side effect of saving a card, and a card that saved
 * correctly must not report failure because a follow-up sweep hit a bad row. The worst case is that a
 * stale flag survives until the next extraction — which is the situation this improves on, not one it
 * creates.
 */
export async function rematchOpenReceipts(): Promise<RematchSummary> {
  const summary: RematchSummary = { considered: 0, updated: 0, resolved: 0 };

  try {
    const { data: cards } = await supabaseAdmin
      .from('payment_cards')
      .select('id, last4, brand, label, holder_name, retired_at');

    const { data: rows } = await supabaseAdmin
      .from('receipts')
      .select('id, payment_method, payment_last4, card_match_status, ai_extras')
      .in('card_match_status', OPEN_STATUSES);

    const list = (rows ?? []) as ReceiptRow[];
    summary.considered = list.length;

    for (const row of list) {
      const extras = row.ai_extras ?? {};
      const match = matchCardOnFile(
        {
          payment_method: row.payment_method,
          payment_last4: row.payment_last4,
          card_brand: extras.card_brand ?? null,
          card_holder_name: extras.card_holder_name ?? null,
        },
        (cards ?? []) as CardOnFile[],
      );

      if (match.status === row.card_match_status) continue;

      // Drop the flag this check previously wrote, and add the new one if there still is one.
      // Filtering by the sentence the matcher itself produces keeps the model's own flags — a tip
      // that did not reconcile, a missing total — untouched by a card being registered.
      const kept = (extras.review_flags ?? []).filter((f) => !isCardFlag(f));
      const flags = match.flag ? [...kept, match.flag] : kept;

      await supabaseAdmin
        .from('receipts')
        .update({
          card_match_status: match.status,
          payment_card_id: match.cardId,
          ai_extras: { ...extras, review_flags: flags },
        })
        .eq('id', row.id);

      summary.updated += 1;
      if (match.status === 'on_file' || match.status === 'retired') summary.resolved += 1;
    }
  } catch {
    /* see the doc comment — a sweep failure must not fail the save that triggered it */
  }

  return summary;
}

/** Recognise a flag written by the card matcher, so re-running it replaces its own output and
 *  nothing else. Matched on phrasing because the flags are stored as sentences, not as codes —
 *  which is what makes them readable on the row, and is the cost of that choice. */
function isCardFlag(flag: string): boolean {
  return /card (number is not legible|ending)/i.test(flag) || /is NOT on file/i.test(flag);
}
