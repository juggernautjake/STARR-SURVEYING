// app/api/admin/reports/operations.pdf/route.ts
//
// Server-rendered PDF of the operations report. Uses Playwright +
// @sparticuz/chromium (same pattern as lib/research/browser-scrape.service.ts)
// to load the HTML produced by `renderReportHtml` and emit a PDF.
//
// Phase R-6 of OWNER_REPORTS.md.
//
// GET /api/admin/reports/operations.pdf?from=<iso>&to=<iso>
//
// Note: this endpoint runs Chromium, which on Vercel needs the
// extended function timeout. Configure in vercel.json:
//   "app/api/admin/reports/operations.pdf/route.ts": { "maxDuration": 60 }

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildOperationsReport } from '@/lib/reports/operations-data';
import { renderReportHtml } from '@/lib/reports/render-report-html';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseIsoDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to };
}

async function getChromiumLaunchOptions(): Promise<{
  executablePath?: string;
  args: string[];
  headless: boolean;
}> {
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

async function htmlToPdf(html: string): Promise<Buffer> {
  const pw = await import('playwright').catch(() => import('playwright-core'));
  const opts = await getChromiumLaunchOptions();
  const browser = await pw.chromium.launch(opts);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return new Response('No org', { status: 403 });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return new Response('Forbidden — admins only', { status: 403 });
  }

  const url = new URL(req.url);
  const fallback = defaultRange();
  const from = parseIsoDate(url.searchParams.get('from')) ?? fallback.from;
  const to = parseIsoDate(url.searchParams.get('to')) ?? fallback.to;

  let payload;
  try {
    payload = await buildOperationsReport(user.default_org_id, from.toISOString(), to.toISOString());
  } catch (err) {
    console.error('[reports/operations.pdf] build failed', err);
    return new Response('Failed to build report', { status: 500 });
  }

  const html = renderReportHtml(payload);

  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html);
  } catch (err) {
    console.error('[reports/operations.pdf] render failed', err);
    return new Response('Failed to render PDF', { status: 500 });
  }

  const filename = `operations-report-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
