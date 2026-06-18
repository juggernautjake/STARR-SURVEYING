-- ============================================================================
-- 321_reply_templates.sql
--
-- LR4 of lead-reply-expansion-2026-06-18.md — reusable email reply
-- templates surfaced in the lead-detail Reply composer's "Templates ▾"
-- picker. Variables interpolate at render-time:
--   {{first_name}}, {{full_name}}, {{ref_number}},
--   {{survey_type}}, {{quote_amount}}
--
-- The seed installs five org-default templates that cover the
-- most-common email shapes the office writes:
--   - First contact
--   - Quote follow-up
--   - Scheduling site visit
--   - Requesting more info
--   - Job complete
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reply_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'general',
  subject_template    TEXT NOT NULL,
  body_html_template  TEXT NOT NULL,
  created_by          TEXT,
  is_org_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id              UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  UNIQUE (org_id, name)
);

COMMENT ON TABLE public.reply_templates IS
  'Reusable email templates for the lead-detail Reply composer. Variables interpolate via interpolateTemplate(template, vars).';

CREATE INDEX IF NOT EXISTS idx_reply_templates_category
  ON public.reply_templates (category, name);
CREATE INDEX IF NOT EXISTS idx_reply_templates_org_default
  ON public.reply_templates (is_org_default)
  WHERE is_org_default = TRUE;

-- Keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.reply_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reply_templates_updated_at ON public.reply_templates;
CREATE TRIGGER reply_templates_updated_at
  BEFORE UPDATE ON public.reply_templates
  FOR EACH ROW EXECUTE FUNCTION public.reply_templates_set_updated_at();

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_reply_templates ON public.reply_templates
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Seed five org-default templates ──────────────────────────────────────────
-- Idempotent via UNIQUE (org_id, name); ON CONFLICT DO NOTHING keeps
-- re-runs safe even after the office edits the body.

INSERT INTO public.reply_templates (name, category, subject_template, body_html_template, is_org_default)
VALUES
  (
    'First contact',
    'intake',
    'Re: Your Starr Surveying request [{{ref_number}}]',
    '<p>Hello {{first_name}},</p><p>Thank you for reaching out to Starr Surveying. We received your inquiry about {{survey_type}} and have it in our pipeline.</p><p>I''ll review the details and get back to you within one business day with next steps.</p><p>If you have any questions in the meantime, please reply to this email or call us at (936) 662-0077.</p><p>—<br>Starr Surveying<br>info@starr-surveying.com</p>'
  ),
  (
    'Quote follow-up',
    'sales',
    'Following up on your survey quote [{{ref_number}}]',
    '<p>Hello {{first_name}},</p><p>I wanted to follow up on the {{survey_type}} quote we sent for your property. The estimated total is <strong>{{quote_amount}}</strong>.</p><p>If you have any questions about the scope or pricing, I''m happy to walk through it on the phone. If you''re ready to move forward, just reply and I''ll get the next steps started.</p><p>—<br>Starr Surveying</p>'
  ),
  (
    'Scheduling site visit',
    'scheduling',
    'Scheduling your survey site visit [{{ref_number}}]',
    '<p>Hello {{first_name}},</p><p>I''d like to schedule a site visit for your {{survey_type}}. Could you let me know which of the following work for you?</p><ul><li>This week (Mon–Fri, 8 AM–4 PM)</li><li>Next week (Mon–Fri, 8 AM–4 PM)</li><li>Specific date you prefer</li></ul><p>Typical site work runs 2–4 hours depending on the parcel. Once we''re on the schedule, I''ll confirm the day before to make sure everything''s still good on your end.</p><p>—<br>Starr Surveying</p>'
  ),
  (
    'Requesting more info',
    'intake',
    'Quick question about your survey request [{{ref_number}}]',
    '<p>Hello {{first_name}},</p><p>Thanks again for reaching out. To finalize the quote for your {{survey_type}}, I need a couple more details:</p><ul><li>Approximate acreage of the parcel</li><li>Any existing surveys or deeds you can share</li><li>Preferred completion timeline</li></ul><p>You can reply to this email with the details — attach any documents directly to your response and they''ll come straight to us.</p><p>—<br>Starr Surveying</p>'
  ),
  (
    'Job complete',
    'delivery',
    'Your survey is complete [{{ref_number}}]',
    '<p>Hello {{first_name}},</p><p>Good news — your {{survey_type}} is complete. Attached to this email are the final survey documents and any supporting materials for your records.</p><p>The total for this job was <strong>{{quote_amount}}</strong>. If you have any questions about the deliverables or need anything explained, please don''t hesitate to reach out.</p><p>Thank you for choosing Starr Surveying!</p><p>—<br>Starr Surveying<br>info@starr-surveying.com</p>'
  )
ON CONFLICT (org_id, name) DO NOTHING;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.reply_templates');                -- non-null
--   SELECT name, category FROM public.reply_templates ORDER BY name;
