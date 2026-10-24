-- seeds/677_payout_autopilot.sql — commit a payout once; every line goes out its own way.
--
-- Plan: docs/planning/in-progress/PAYOUT_AUTOPILOT_2026-10-11.md. Owner, 2026-10-11: "whenever the
-- boss confirms the hours and is ready to payout … he can commit the payout and it will automatically
-- pay out everyone according to their preferred payment methods … The org will have the option to
-- attach a fee to cash and check payments that is automatically taken out."
--
-- 1. payout_batch_items accepts EVERY method in lib/payouts/methods.ts. Seed 325 allowed five
--    (venmo, cashapp, zelle, ach, cash), so a line for anyone who prefers `check`, `account` or
--    `other` made the whole batch insert fail — verified against the live database 2026-10-11.
-- 2. Fee, rail and provider columns on the line.
-- 3. payout_settings (one row per org), payout_fee_consents, payout_checks (+ numbering function),
--    payout_dispatch_events (what Commit did, line by line).
--
-- Idempotent.

BEGIN;

-- ── 0. Batches built from approved hours ───────────────────────────────────────────────────────
-- `/api/admin/payroll/pay-owed` and `/api/cron/payout-prepare` insert kind = 'hours', which seed 325's
-- CHECK ('weekly', 'ad_hoc') refuses — so "Pay what is owed" has never been able to create a batch
-- (zero batches exist live, verified 2026-10-11). 'hours' joins the list; like 'ad_hoc' it has no
-- week window.
ALTER TABLE public.payout_batches DROP CONSTRAINT IF EXISTS payout_batches_kind_check;
ALTER TABLE public.payout_batches ADD CONSTRAINT payout_batches_kind_check
  CHECK (kind IN ('weekly', 'ad_hoc', 'hours'));
ALTER TABLE public.payout_batches DROP CONSTRAINT IF EXISTS payout_batches_week_window;
ALTER TABLE public.payout_batches ADD CONSTRAINT payout_batches_week_window
  CHECK ((kind = 'weekly' AND week_start IS NOT NULL AND week_end IS NOT NULL) OR kind IN ('ad_hoc', 'hours'));

-- ── 1 + 2. Batch lines ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payout_batch_items DROP CONSTRAINT IF EXISTS payout_batch_items_method_check;
ALTER TABLE public.payout_batch_items ADD CONSTRAINT payout_batch_items_method_check
  CHECK (method IS NULL OR method IN ('cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'account', 'other'));

ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS fee_note text;
-- How Commit sent it: api (PayPal) · file (NACHA) · print (check) · manual (cash, Cash App, Zelle) · ledger (account).
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS rail text;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS provider_batch_id text;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS provider_item_id text;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS check_id uuid;
-- One send per line, ever. Stamped before any outbound call; a retry finds it and does not re-send.
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS payout_batch_items_idem_idx
  ON public.payout_batch_items (idempotency_key) WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_batch_items_fee_nonneg') THEN
    ALTER TABLE public.payout_batch_items ADD CONSTRAINT payout_batch_items_fee_nonneg CHECK (fee_cents >= 0);
  END IF;
  -- What is withheld (advance recovery + fee) can never exceed what the line settles.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_batch_items_withheld_le_total') THEN
    ALTER TABLE public.payout_batch_items ADD CONSTRAINT payout_batch_items_withheld_le_total
      CHECK (fee_cents + COALESCE(recovered_cents, 0) <= total_cents);
  END IF;
END $$;

COMMENT ON COLUMN public.payout_batch_items.fee_cents IS
  'Payment-method fee withheld from what is SENT (cash/check). Like recovered_cents it does not reduce total_cents: the line still settles the full balance. See lib/payouts/fees.ts.';

-- ── 3a. Settings, one row per org ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_settings (
  org_id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  -- Which ways of being paid this firm offers. One, several, or all. Anything not listed is never used.
  enabled_methods text[] NOT NULL DEFAULT ARRAY['ach', 'venmo', 'cashapp', 'zelle', 'check', 'cash', 'account'],
  -- For people who have not chosen. NULL = they must choose before they can be paid.
  default_method text,
  -- When someone's choice cannot be used (method switched off, or their details are missing).
  -- NULL = hold that one line for attention rather than guess.
  fallback_method text,
  -- Per-method charges, any method: { "check": {"flat_cents":200,"percent_bps":0,"cap_cents":500}, "venmo": {...} }
  fees jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Who a fee may apply to. 'contractors' (default) = 1099 only; 'everyone' still needs consent.
  fee_scope text NOT NULL DEFAULT 'contractors' CHECK (fee_scope IN ('contractors', 'everyone')),
  fee_requires_consent boolean NOT NULL DEFAULT true,
  fee_max_percent numeric(5,2) NOT NULL DEFAULT 5 CHECK (fee_max_percent >= 0 AND fee_max_percent <= 25),
  -- NACHA originator: company_name, company_id, odfi_routing, immediate_destination, immediate_destination_name,
  -- immediate_origin, immediate_origin_name, entry_description
  ach jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Checks: stock ('preprinted' | 'blank_micr'), payer_name, payer_address, bank_name, bank_address,
  -- routing, account_last4, next_number, void_after_days, signature_lines
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  check_account_number_enc bytea,
  -- Separation of duties: when true, whoever built a batch cannot also approve/commit it. Off by
  -- default — in a small firm one boss runs payroll (owner, 2026-10-11: "the boss confirms the hours
  -- … he can commit the payout"). The PAYOUT_ADMIN_SELF_APPROVE env override still works either way.
  two_person_approval boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_settings_methods_valid') THEN
    ALTER TABLE public.payout_settings ADD CONSTRAINT payout_settings_methods_valid CHECK (
      enabled_methods <@ ARRAY['cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'account', 'other']
      AND (default_method IS NULL OR default_method = ANY (enabled_methods))
      AND (fallback_method IS NULL OR fallback_method = ANY (enabled_methods)));
  END IF;
END $$;
INSERT INTO public.payout_settings (org_id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (org_id) DO NOTHING;

-- ── 3b. Written consent to a payment-method fee ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_fee_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  user_email text NOT NULL,
  method text NOT NULL,
  -- The exact words agreed to, and the fee they described, so a later change of fee is a new consent.
  terms text NOT NULL,
  fee_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  agreed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS payout_fee_consents_user_idx ON public.payout_fee_consents (user_email, method) WHERE revoked_at IS NULL;

-- ── 3c. Checks: every number ever used, voids included ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  check_number integer NOT NULL,
  batch_id uuid,
  payout_batch_item_id uuid,
  payee_email text,
  payee_name text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  issue_date date NOT NULL DEFAULT current_date,
  memo text,
  status text NOT NULL DEFAULT 'printed' CHECK (status IN ('printed', 'issued', 'cleared', 'void', 'stale')),
  void_reason text,
  voided_by text,
  voided_at timestamptz,
  reissue_of uuid REFERENCES public.payout_checks(id),
  stub jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  cleared_at timestamptz,
  positive_pay_exported_at timestamptz,
  UNIQUE (org_id, check_number)
);
CREATE INDEX IF NOT EXISTS payout_checks_batch_idx ON public.payout_checks (batch_id);
CREATE INDEX IF NOT EXISTS payout_checks_item_idx ON public.payout_checks (payout_batch_item_id);

-- Assign the next check number(s) under a row lock, so two people printing at once can never share
-- a number. Returns the numbers in order. Server-only (see the REVOKE below and seeds/668).
CREATE OR REPLACE FUNCTION public.take_payout_check_numbers(p_org uuid, p_count integer)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  used integer;
  start_at integer;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN RETURN ARRAY[]::integer[]; END IF;
  SELECT COALESCE((checks->>'next_number')::integer, 1001) INTO cur
    FROM public.payout_settings WHERE org_id = p_org FOR UPDATE;
  IF cur IS NULL THEN
    INSERT INTO public.payout_settings (org_id) VALUES (p_org) ON CONFLICT (org_id) DO NOTHING;
    cur := 1001;
  END IF;
  -- Never below a number already used, whatever the setting says.
  SELECT COALESCE(max(check_number) + 1, 0) INTO used FROM public.payout_checks WHERE org_id = p_org;
  start_at := GREATEST(cur, used);
  UPDATE public.payout_settings
     SET checks = jsonb_set(checks, '{next_number}', to_jsonb(start_at + p_count), true)
   WHERE org_id = p_org;
  RETURN ARRAY(SELECT generate_series(start_at, start_at + p_count - 1));
END $$;
REVOKE EXECUTE ON FUNCTION public.take_payout_check_numbers(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_payout_check_numbers(uuid, integer) TO service_role;

-- ── 3d. What Commit did ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  batch_id uuid NOT NULL,
  item_id uuid,
  rail text,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_dispatch_events_batch_idx ON public.payout_dispatch_events (batch_id, created_at DESC);

-- ── Bank details: encrypted and decrypted INSIDE the database ──────────────────────────────────
-- The app passes the key (PAYMENT_ENCRYPTION_KEY) and the plaintext once; the row only ever holds
-- pgp_sym_encrypt ciphertext (seed 324's columns). Server-only: EXECUTE is revoked from the public
-- roles below, so the anon key in a browser cannot call these.
CREATE OR REPLACE FUNCTION public.save_payout_bank(p_email text, p_routing text, p_account text, p_type text, p_key text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid;
  other_primary boolean;
BEGIN
  IF p_routing !~ '^\d{9}$' THEN RAISE EXCEPTION 'Routing number must be 9 digits'; END IF;
  IF p_account !~ '^[0-9-]{3,17}$' THEN RAISE EXCEPTION 'Account number must be 3-17 digits'; END IF;
  IF p_type NOT IN ('checking', 'savings') THEN RAISE EXCEPTION 'Account type must be checking or savings'; END IF;
  IF p_key IS NULL OR length(p_key) < 16 THEN RAISE EXCEPTION 'Encryption key is not configured'; END IF;
  DELETE FROM public.employee_payment_methods WHERE lower(user_email) = lower(p_email) AND kind = 'ach';
  SELECT EXISTS (SELECT 1 FROM public.employee_payment_methods WHERE lower(user_email) = lower(p_email) AND is_primary) INTO other_primary;
  INSERT INTO public.employee_payment_methods
    (user_email, kind, display_name, ach_account_number_enc, ach_routing_number_enc, ach_account_type, is_primary)
  VALUES
    (lower(p_email), 'ach', initcap(p_type) || ' ••' || right(regexp_replace(p_account, '\D', '', 'g'), 4),
     public.encrypt_ach_secret(p_account, p_key), public.encrypt_ach_secret(p_routing, p_key), p_type, NOT other_primary)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.read_payout_banks(p_emails text[], p_key text)
RETURNS TABLE (user_email text, routing text, account text, account_type text, method_id uuid)
LANGUAGE sql
AS $$
  SELECT m.user_email, public.decrypt_ach_secret(m.ach_routing_number_enc, p_key),
         public.decrypt_ach_secret(m.ach_account_number_enc, p_key), m.ach_account_type, m.id
    FROM public.employee_payment_methods m
   WHERE m.kind = 'ach' AND lower(m.user_email) = ANY (SELECT lower(e) FROM unnest(p_emails) e);
$$;

CREATE OR REPLACE FUNCTION public.save_check_account(p_org uuid, p_account text, p_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_account !~ '^[0-9-]{4,17}$' THEN RAISE EXCEPTION 'Account number must be 4-17 digits'; END IF;
  IF p_key IS NULL OR length(p_key) < 16 THEN RAISE EXCEPTION 'Encryption key is not configured'; END IF;
  UPDATE public.payout_settings
     SET check_account_number_enc = public.encrypt_ach_secret(p_account, p_key),
         checks = jsonb_set(checks, '{account_last4}', to_jsonb(right(regexp_replace(p_account, '\D', '', 'g'), 4)), true)
   WHERE org_id = p_org;
END $$;

CREATE OR REPLACE FUNCTION public.read_check_account(p_org uuid, p_key text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.decrypt_ach_secret(check_account_number_enc, p_key) FROM public.payout_settings
   WHERE org_id = p_org AND check_account_number_enc IS NOT NULL;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.save_payout_bank(text,text,text,text,text)', 'public.read_payout_banks(text[],text)',
                           'public.save_check_account(uuid,text,text)', 'public.read_check_account(uuid,text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── RLS: server only (service role), like seed 667 ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payout_settings', 'payout_fee_consents', 'payout_checks', 'payout_dispatch_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', t);
    EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

COMMIT;
