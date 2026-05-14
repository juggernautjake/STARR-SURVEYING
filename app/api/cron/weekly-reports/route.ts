// app/api/cron/weekly-reports/route.ts
//
// Weekly operations report cron. Runs every Monday 14:00 UTC
// (08:00 CST). For every org with a configured recipient, builds
// last week's report, renders to PDF, and emails it via Resend with
// the PDF attached.
//
// Phase R-7 of OWNER_REPORTS.md.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/weekly-reports", "schedule": "0 14 * * 1" }

import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { buildOperationsReport } from '@/lib/reports/operations-data';
import { renderReportHtml } from '@/lib/reports/render-report-html';
import { sendEmailViaResend } from '@/lib/saas/notifications/email';
import { renderTemplateDef } from '@/lib/saas/notifications/email';
import { loadTemplate } from '@/lib/saas/notifications/templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getChromiumLaunchOptions() {
  const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    return {
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, ...baseArgs],
      headless: true,
    };
  } catch {
    return { args: baseArgs, headless: true };
  }
}

async function htmlToPdfBase64(html: string): Promise<string> {
  const pw = await import('playwright').catch(() => import('playwright-core'));
  const opts = await getChromiumLaunchOptions();
  const browser = await pw.chromium.launch(opts);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
    });
    return Buffer.from(pdf).toString('base64');
  } finally {
    await browser.close();
  }
}

function lastWeekRange(): { from: Date; to: Date; label: string } {
  // Returns Mon 00:00 → Sun 23:59 of the previous calendar week.
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;            // 1 = Mon, 7 = Sun
  const thisWeekMonday = new Date(now);
  thisWeekMonday.setHours(0, 0, 0, 0);
  thisWeekMonday.setDate(thisWeekMonday.getDate() - (dayOfWeek - 1));
  const lastMonday = new Date(thisWeekMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSundayEnd = new Date(thisWeekMonday);
  lastSundayEnd.setMilliseconds(-1);
  const label = `${lastMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastSundayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return { from: lastMonday, to: lastSundayEnd, label };
}

function fmtMoneyShort(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const range = lastWeekRange();
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  // Pull every org with a primary_admin_email. The per-org
  // recipient-override is R-8 (org_settings.weekly_report_recipients);
  // until then, the primary admin gets it.
  const { data: orgs, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, primary_admin_email, billing_contact_email, status')
    .in('status', ['active', 'trialing']);

  if (orgErr) {
    return NextResponse.json({ error: 'orgs query failed', detail: orgErr.message }, { status: 500 });
  }

  const template = await loadTemplate('weekly_report_ready');
  if (!template) {
    return NextResponse.json({ error: 'template not found' }, { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const org of (orgs ?? []) as Array<{ id: string; name: string; slug: string; primary_admin_email: string | null; billing_contact_email: string | null }>) {
    const recipient = org.primary_admin_email ?? org.billing_contact_email;
    if (!recipient) { skipped++; continue; }

    try {
      const payload = await buildOperationsReport(org.id, fromIso, toIso);
      const html = renderReportHtml(payload);
      const pdfB64 = await htmlToPdfBase64(html);

      const vars = {
        user: { name: recipient.split('@')[0] },
        org: { name: org.name, url: `https://${org.slug}.starrsoftware.com` },
        report: {
          range: range.label,
          jobsCompleted: payload.jobs.completed,
          jobsInProgress: payload.jobs.inProgress,
          jobsStarted: payload.jobs.started,
          totalHours: (payload.hours.totalRegularHours + payload.hours.totalOtHours).toFixed(1) + 'h',
          otHours: payload.hours.totalOtHours.toFixed(1) + 'h',
          laborCost: fmtMoneyShort(payload.hours.totalLaborCostCents),
          receiptsTotal: fmtMoneyShort(payload.receipts.byStatus.approved + payload.receipts.byStatus.paid),
          mileageMiles: payload.mileage.totalMiles.toFixed(0),
          mileageDollars: '$' + payload.mileage.totalDollars.toFixed(0),
          grossMargin: fmtMoneyShort(payload.financials.grossMarginCents),
          grossMarginPct: payload.financials.grossMarginPct.toFixed(1) + '%',
        },
      };

      const rendered = renderTemplateDef(template, vars);

      const filename = `operations-report-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.pdf`;
      const ok = await sendEmailViaResend({
        to: recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: [{ filename, content: pdfB64, contentType: 'application/pdf' }],
        tags: { event: 'weekly_report_ready', org_id: org.id },
      });

      if (ok) {
        sent++;
        await supabaseAdmin.from('audit_log').insert({
          org_id: org.id,
          action: 'WEEKLY_REPORT_SENT',
          severity: 'info',
          metadata: { recipient, range_from: fromIso, range_to: toIso },
        });
      } else {
        failed++;
        errors.push(`${org.id}: Resend returned non-2xx`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${org.id}: ${msg}`);
      console.error('[cron/weekly-reports] failed for org', org.id, err);
    }
  }

  return NextResponse.json({
    range: { from: fromIso, to: toIso, label: range.label },
    sent, skipped, failed,
    errors: errors.slice(0, 10),
  });
}
