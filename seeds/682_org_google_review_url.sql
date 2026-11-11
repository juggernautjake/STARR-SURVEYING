-- seeds/682_org_google_review_url.sql — where a firm's customers leave a Google review.
--
-- Owner, 2026-11-10: "In the invoice, can you include a link to the review page so they can review
-- us on google?" The invoice and receipt emails show "Happy with our work? Leave us a Google review"
-- linking here (lib/payments/invoice-email.ts). A column on the firm, not a constant, because each
-- firm on the platform has its own Google Business Profile; none set → no review line.
--
-- Starr Surveying's is the one the public site's footer and review widget already use (place ID
-- ChIJV77ibdAVRYYRYCVt8suXPQE, app/components/GoogleReviewWidget.tsx). Additive; safe twice — the
-- update only fills a blank.

alter table public.organizations add column if not exists google_review_url text
  check (google_review_url is null or google_review_url ~ '^https://');
comment on column public.organizations.google_review_url is
  'Link customers use to review the firm on Google (e.g. https://search.google.com/local/writereview?placeid=…). Shown on invoice and receipt emails.';

update public.organizations
   set google_review_url = 'https://search.google.com/local/writereview?placeid=ChIJV77ibdAVRYYRYCVt8suXPQE'
 where id = '00000000-0000-0000-0000-000000000001'::uuid
   and google_review_url is null;
