// lib/reports/render-report-html.ts
//
// Pure HTML renderer for the operations report. Used by:
//   - /api/admin/reports/operations.pdf  (Playwright → PDF)
//   - /api/cron/weekly-reports          (PDF attached to email)
//
// Phase R-6 of OWNER_REPORTS.md.

import type { ReportPayload } from '@/lib/reports/operations-data';

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtMoneyShort(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function renderReportHtml(data: ReportPayload): string {
  const { org, range, jobs, hours, receipts, mileage, payouts, financials } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Operations Report — ${escapeHtml(org.name)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #0F1419;
    margin: 0;
    font-size: 11pt;
    line-height: 1.4;
  }
  header.report-header {
    border-bottom: 2px solid #000;
    padding-bottom: 0.4rem;
    margin-bottom: 1rem;
  }
  header.report-header h1 {
    font-family: 'Sora', sans-serif;
    font-size: 18pt;
    margin: 0 0 0.2rem;
  }
  header.report-header .meta {
    font-size: 10pt;
    color: #444;
  }
  section.card {
    border: 1px solid #000;
    border-radius: 4px;
    padding: 0.8rem 1rem;
    margin-bottom: 0.85rem;
    page-break-inside: avoid;
  }
  section.card h2 {
    font-family: 'Sora', sans-serif;
    font-size: 13pt;
    margin: 0 0 0.6rem;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .stat {
    background: #F4F4F4;
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
  }
  .stat .label {
    font-size: 8pt;
    color: #444;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }
  .stat .value {
    font-family: 'Sora', sans-serif;
    font-size: 14pt;
    font-weight: 700;
  }
  .stat .secondary {
    font-size: 8pt;
    color: #444;
    margin-top: 0.1rem;
  }
  .financial-line {
    padding: 0.4rem 0.6rem;
    background: #F4F4F4;
    border-radius: 3px;
    font-size: 10pt;
    margin-bottom: 0.55rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
    margin-top: 0.3rem;
  }
  th, td {
    text-align: left;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid #DDD;
  }
  th {
    background: #F4F4F4;
    font-weight: 600;
    color: #333;
  }
  .right { text-align: right; }
  .pills { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .pill {
    padding: 0.15rem 0.5rem;
    background: #EEE;
    border-radius: 999px;
    font-size: 9pt;
  }
  .indent { padding-left: 1rem; color: #444; }
  .finance-total td { border-top: 2px solid #000; padding-top: 0.4rem; font-weight: 700; }
  .empty { color: #666; font-style: italic; font-size: 9.5pt; }
  footer.report-footer {
    margin-top: 1.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #999;
    font-size: 8pt;
    color: #666;
    text-align: center;
  }
</style>
</head>
<body>
<header class="report-header">
  <h1>Operations Report</h1>
  <div class="meta">${escapeHtml(org.name)} &middot; ${fmtDate(range.from)} – ${fmtDate(range.to)} &middot; Generated ${fmtDate(new Date().toISOString())}</div>
</header>

<section class="card">
  <h2>Jobs</h2>
  <div class="stat-grid">
    <div class="stat"><div class="label">Started</div><div class="value">${jobs.started}</div></div>
    <div class="stat"><div class="label">Completed</div><div class="value">${jobs.completed}</div><div class="secondary">${fmtMoneyShort(jobs.invoicedTotalCents)}</div></div>
    <div class="stat"><div class="label">In Progress</div><div class="value">${jobs.inProgress}</div></div>
    <div class="stat"><div class="label">Lost</div><div class="value">${jobs.lost}</div></div>
    <div class="stat"><div class="label">Not Started</div><div class="value">${jobs.notStarted}</div></div>
    <div class="stat"><div class="label">Abandoned</div><div class="value">${jobs.abandoned}</div></div>
  </div>
  <div class="financial-line">
    Quoted: <strong>${fmtMoney(jobs.quotedTotalCents)}</strong> &middot;
    Invoiced: <strong>${fmtMoney(jobs.invoicedTotalCents)}</strong> &middot;
    Outstanding: <strong>${fmtMoney(jobs.outstandingCents)}</strong>
  </div>
  ${jobs.details.length > 0 ? `
    <table>
      <thead><tr><th>Job</th><th>Client</th><th>Stage/Result</th><th>Started</th><th>Delivered</th><th class="right">Quote</th><th class="right">Final</th></tr></thead>
      <tbody>
        ${jobs.details.map((j) => `
          <tr>
            <td>${escapeHtml(j.name)}</td>
            <td>${escapeHtml(j.client ?? '—')}</td>
            <td>${escapeHtml(j.result ?? j.stage)}</td>
            <td>${fmtDate(j.dateStarted)}</td>
            <td>${fmtDate(j.dateDelivered)}</td>
            <td class="right">${fmtMoney(j.quoteCents)}</td>
            <td class="right">${j.finalCents === null ? '—' : fmtMoney(j.finalCents)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">No job activity in this window.</p>'}
</section>

<section class="card">
  <h2>Employee Hours</h2>
  <div class="financial-line">
    Regular: <strong>${hours.totalRegularHours.toFixed(1)}h</strong> &middot;
    OT: <strong>${hours.totalOtHours.toFixed(1)}h</strong> &middot;
    Labor cost: <strong>${fmtMoney(hours.totalLaborCostCents)}</strong>
  </div>
  ${hours.perEmployee.length > 0 ? `
    <table>
      <thead><tr><th>Employee</th><th class="right">Regular</th><th class="right">OT</th><th class="right">Total</th><th class="right">Labor $</th></tr></thead>
      <tbody>
        ${hours.perEmployee.map((e) => `
          <tr>
            <td>${escapeHtml(e.name)}</td>
            <td class="right">${e.regularHours.toFixed(1)}</td>
            <td class="right">${e.otHours.toFixed(1)}</td>
            <td class="right"><strong>${e.totalHours.toFixed(1)}</strong></td>
            <td class="right">${fmtMoney(e.laborCostCents)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">No time entries in this window.</p>'}
</section>

<section class="card">
  <h2>Receipts</h2>
  <div class="financial-line">
    Approved: <strong>${fmtMoney(receipts.byStatus.approved)}</strong> &middot;
    Paid: <strong>${fmtMoney(receipts.byStatus.paid)}</strong> &middot;
    Pending: <strong>${fmtMoney(receipts.byStatus.pending)}</strong> &middot;
    Rejected: <strong>${fmtMoney(receipts.byStatus.rejected)}</strong>
  </div>
  ${Object.keys(receipts.byCategory).length > 0 ? `
    <div class="pills">
      ${Object.entries(receipts.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, cents]) =>
        `<span class="pill">${escapeHtml(cat)}: ${fmtMoney(cents)}</span>`,
      ).join('')}
    </div>
  ` : ''}
  ${receipts.entries.length > 0 ? `
    <table>
      <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Status</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${receipts.entries.map((r) => `
          <tr>
            <td>${fmtDate(r.date)}</td>
            <td>${escapeHtml(r.vendor ?? '—')}</td>
            <td>${escapeHtml(r.category ?? '—')}</td>
            <td>${escapeHtml(r.status)}</td>
            <td class="right">${fmtMoney(r.amountCents)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">No receipts in this window.</p>'}
</section>

<section class="card">
  <h2>Mileage</h2>
  <div class="financial-line">
    Total miles: <strong>${mileage.totalMiles.toFixed(1)}</strong> &middot;
    Reimbursement: <strong>$${mileage.totalDollars.toFixed(2)}</strong>
  </div>
  ${mileage.perEmployee.length > 0 ? `
    <table>
      <thead><tr><th>Employee</th><th class="right">Miles</th><th class="right">Dollars</th></tr></thead>
      <tbody>
        ${mileage.perEmployee.map((m) => `
          <tr>
            <td>${escapeHtml(m.name)}</td>
            <td class="right">${m.miles.toFixed(1)}</td>
            <td class="right">$${m.dollars.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">No mileage entries in this window.</p>'}
</section>

<section class="card">
  <h2>Payouts</h2>
  <div class="financial-line">
    Total paid: <strong>${fmtMoney(payouts.totalCents)}</strong>
    ${Object.keys(payouts.byMethod).length > 0 ? ' &middot; ' + Object.entries(payouts.byMethod).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${escapeHtml(m)}: <strong>${fmtMoney(c)}</strong>`).join(' &middot; ') : ''}
  </div>
  ${payouts.entries.length > 0 ? `
    <table>
      <thead><tr><th>Paid on</th><th>Employee</th><th>Method</th><th>Reference</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${payouts.entries.map((p) => `
          <tr>
            <td>${fmtDate(p.paidAt)}</td>
            <td>${escapeHtml(p.userEmail)}</td>
            <td>${escapeHtml(p.method)}</td>
            <td>${escapeHtml(p.reference ?? '—')}</td>
            <td class="right">${fmtMoney(p.amountCents)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">No payouts recorded in this window.</p>'}
</section>

<section class="card">
  <h2>Financial Roll-up</h2>
  <table>
    <tbody>
      <tr><td>Revenue (jobs invoiced)</td><td class="right">${fmtMoney(financials.revenueCents)}</td></tr>
      <tr><td class="indent">– Labor cost</td><td class="right">(${fmtMoney(financials.laborCostCents)})</td></tr>
      <tr><td class="indent">– Receipts (approved + paid)</td><td class="right">(${fmtMoney(financials.receiptsCostCents)})</td></tr>
      <tr><td class="indent">– Mileage</td><td class="right">(${fmtMoney(financials.mileageCostCents)})</td></tr>
      <tr class="finance-total">
        <td>Gross margin</td>
        <td class="right">${fmtMoney(financials.grossMarginCents)} (${financials.grossMarginPct.toFixed(1)}%)</td>
      </tr>
      <tr><td>Outstanding invoices</td><td class="right">${fmtMoney(financials.outstandingInvoicesCents)}</td></tr>
      <tr><td>Quotes pending acceptance</td><td class="right">${fmtMoney(financials.pendingQuotesCents)}</td></tr>
      <tr><td>Payouts recorded (cash out)</td><td class="right">${fmtMoney(payouts.totalCents)}</td></tr>
    </tbody>
  </table>
</section>

<footer class="report-footer">
  Starr Software &middot; Internal &mdash; Do Not Forward
</footer>
</body>
</html>`;
}
