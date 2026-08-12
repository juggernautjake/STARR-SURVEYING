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

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { taxTreatmentForCard, type PaymentCard, type CardRole } from '@/lib/finance/payment-cards';
import { isMissingTable, missingTableMessage } from '@/lib/finance/missing-table';
import { validateCardInput } from '@/lib/finance/card-input';
import { rematchOpenReceipts } from '@/lib/receipts/rematch-cards';

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

// ── WRITING TO THE REGISTRY ───────────────────────────────────────────────────────────────────────
//
// The read side above shipped alone, and the page it feeds says *"A card is added the first time a
// receipt is matched to one, or by hand once you know whose it is."* Neither of those existed. The
// registry has been readable and unwritable since F1b, which is why `payment_cards` holds zero rows
// and why every card receipt extracted on 2026-08-12 flagged as "not on file" — correctly, and with
// no way to act on it. This is that missing half.
//
// Both handlers re-run the card check afterwards (`rematchOpenReceipts`). Registering the card a
// receipt complained about must clear the complaint; a flag that outlives its own fix is how people
// learn to ignore flags.

/** Fields a person may set. Everything else about a card row is set by the system. */
interface CardBody {
  last4?: unknown;
  brand?: unknown;
  label?: unknown;
  role?: unknown;
  holder_name?: unknown;
  holder_user_id?: unknown;
  notes?: unknown;
}

async function requireAdmin(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { email: session.user.email };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json()) as CardBody;
  const check = validateCardInput(body, { mode: 'create' });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('payment_cards')
    .insert(check.values)
    .select('id, last4, label')
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: missingTableMessage('card registry', 'It comes from seed 572') },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deliberately after the card is safely saved, and deliberately awaited: the bookkeeper who just
  // registered this card is about to look at the receipt that asked for it, and finding it still
  // flagged would be the wrong answer even if it corrected itself an hour later.
  const rematch = await rematchOpenReceipts();

  return NextResponse.json({ card: data, rematch }, { status: 201 });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json()) as CardBody & { id?: unknown; retired?: unknown };
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Which card?' }, { status: 400 });

  // Read the row first so the edit can be checked against the card it will PRODUCE. A PATCH that
  // only sets `role: 'OWNER_PERSONAL'` is valid on a card that already names a holder and invalid on
  // one that does not, and only the merged view can tell those apart — see `validateCardInput`.
  const { data: current, error: readErr } = await supabaseAdmin
    .from('payment_cards')
    .select('id, role, holder_name, holder_user_id, retired_at')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) {
      return NextResponse.json(
        { error: missingTableMessage('card registry', 'It comes from seed 572') },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: 'That card is no longer on file.' }, { status: 404 });

  const check = validateCardInput(body, {
    mode: 'edit',
    currentRole: current.role as CardRole,
    currentHolder: (current.holder_name as string | null) ?? (current.holder_user_id as string | null),
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const values: Record<string, unknown> = { ...check.values, updated_at: new Date().toISOString() };

  // Retiring is a toggle, not a delete. A receipt from March points at whatever card paid it, so the
  // row survives and un-retiring is possible — a card closed by mistake must be recoverable without
  // creating a second row that historical receipts do not point at.
  if (body.retired !== undefined) {
    values.retired_at = body.retired ? (current.retired_at ?? new Date().toISOString()) : null;
  }

  const { error } = await supabaseAdmin.from('payment_cards').update(values).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rematch = await rematchOpenReceipts();
  return NextResponse.json({ ok: true, rematch });
});
