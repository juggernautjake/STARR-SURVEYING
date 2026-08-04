// app/api/admin/payment-cards/route.ts — the card registry (plan F1b).
//
// The owner's ask: *"We need to be able to recognize if the cards used to pay for things are on file
// or not and what the card role is. Some cards may be personal cards of clients or customers or
// employees, or they might be cards that belong to the company or my dad's personal cards or mine."*
//
// `lib/finance/payment-cards.ts` has answered that since F1 — `taxTreatmentForCard` turns a role into
// a tax consequence, `matchCardByLast4` refuses to guess between two cards sharing four digits — and
// had **no caller**, because the plan recorded F1b as un-buildable until seed 572 was applied.
//
// ── WHY THIS SHIPS BEFORE THE SEED ──────────────────────────────────────────────────────────────
//
// "There is nothing to render" was the recorded reason, and it is not quite true. The seed is
// written and was verified to apply cleanly (F7d). What the missing table changes is one thing: the
// query fails. So this route handles that ONE failure honestly and works the moment
// `apply-seeds.mjs` runs — rather than waiting for a session that happens to come after it.
//
// A missing table is distinguishable from every other failure, so a not-yet-created table is
// reported as exactly that, with the command that fixes it — not as "no cards on file", which is a
// claim, and the one a bookkeeper would act on by registering a card that is already there.
//
// **This route first shipped detecting that with `error.code === '42P01'`, and that branch was
// unreachable.** Postgres answers a missing relation with 42P01; we do not talk to Postgres. Every
// read here goes through PostgREST, which rejects the name against its schema cache first and
// answers `PGRST205`. The careful message below would never have rendered — the screen would have
// shown a raw schema-cache string as a 500. `isMissingTable` now owns the detection and checks both;
// see the reasoning in `lib/finance/missing-table.ts`.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { taxTreatmentForCard, type PaymentCard } from '@/lib/finance/payment-cards';
import { isMissingTable, missingTableMessage } from '@/lib/finance/missing-table';

export const runtime = 'nodejs';

interface CardRow {
  id: string;
  last4: string;
  brand: string | null;
  label: string | null;
  role: PaymentCard['role'];
  holder_name: string | null;
  holder_user_id: string | null;
  /** Set when the card is closed. Retired cards are RETURNED, not filtered: a receipt from March
   *  points at whatever card paid it, and hiding the card would orphan the receipt. */
  retired_at: string | null;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('payment_cards')
    .select('id, last4, brand, label, role, holder_name, holder_user_id, retired_at')
    .order('label', { nullsFirst: false });

  if (error) {
    if (isMissingTable(error)) {
      // NOT an empty list. "No cards are on file" and "the card registry does not exist yet" look
      // identical on screen and mean opposite things — the first invites you to add a card, the
      // second means nothing you add can be saved.
      return NextResponse.json({
        cards: [],
        registryExists: false,
        message: missingTableMessage('card registry', 'It comes from seed 572'),
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The tax consequence travels with each card, computed by the one module that knows the rule.
  // Deriving it on the client would put a second opinion about tax treatment in the browser.
  const cards = (data ?? []).map((row: CardRow) => {
    const r = row;
    const card: PaymentCard = {
      id: r.id,
      last4: r.last4,
      brand: r.brand,
      label: r.label,
      role: r.role,
      holderName: r.holder_name,
      holderUserId: r.holder_user_id,
      retiredAt: r.retired_at,
    };
    return { ...card, taxTreatment: taxTreatmentForCard(card) };
  });

  return NextResponse.json({ cards, registryExists: true });
});
