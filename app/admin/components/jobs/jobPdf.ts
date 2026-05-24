// app/admin/components/jobs/jobPdf.ts — client-side job summary PDF
// JOB_WORKSPACE_BUILDOUT slice G.
//
// Generates a one-page job summary in the browser with jsPDF (all the
// data is already loaded on the detail page, so no server round-trip).

import jsPDF from 'jspdf';

export interface JobPdfInput {
  job_number: string;
  name: string;
  stage: string;
  survey_type: string;
  is_priority?: boolean;
  result?: string | null;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  lot_number?: string;
  subdivision?: string;
  abstract_number?: string;
  acreage?: number;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  deadline?: string;
  quote_amount?: number;
  amount_paid?: number;
  payment_status?: string;
  lead_rpls_email?: string;
  created_at?: string;
  counts?: { files?: number; photos?: number; drawings?: number; research?: number; hours?: number };
}

export function exportJobPdf(job: JobPdfInput): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const left = 48;
  let y = 56;
  const lineGap = 16;
  const pageWidth = doc.internal.pageSize.getWidth();

  const heading = (text: string) => {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(29, 48, 149); // brand navy
    doc.text(text, left, y);
    doc.setDrawColor(220);
    doc.line(left, y + 4, pageWidth - left, y + 4);
    y += lineGap;
    doc.setTextColor(20);
  };
  const row = (label: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === '') return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${label}:`, left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), left + 110, y, { maxWidth: pageWidth - left - 110 - left });
    y += lineGap;
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Job ${job.job_number}`, left, y);
  y += 22;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(job.name, left, y);
  y += 8;

  heading('Status');
  row('Stage', job.stage);
  row('Survey Type', job.survey_type);
  if (job.is_priority) row('Priority', 'YES');
  row('Result', job.result ?? 'Active');
  row('Deadline', job.deadline ? new Date(job.deadline).toLocaleDateString() : undefined);
  row('Created', job.created_at ? new Date(job.created_at).toLocaleDateString() : undefined);
  row('Lead RPLS', job.lead_rpls_email);

  heading('Property');
  const addr = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ');
  row('Address', addr || undefined);
  row('County', job.county);
  row('Lot', job.lot_number);
  row('Subdivision', job.subdivision);
  row('Abstract', job.abstract_number);
  row('Acreage', job.acreage);

  heading('Client');
  row('Name', job.client_name);
  row('Company', job.client_company);
  row('Email', job.client_email);
  row('Phone', job.client_phone);

  heading('Financial');
  if (job.quote_amount != null) row('Quote', `$${job.quote_amount.toLocaleString()}`);
  if (job.amount_paid != null) row('Paid', `$${job.amount_paid.toLocaleString()}`);
  row('Payment Status', job.payment_status);

  if (job.counts) {
    heading('Work Manifest');
    row('Files', job.counts.files ?? 0);
    row('Photos', job.counts.photos ?? 0);
    row('CAD Drawings', job.counts.drawings ?? 0);
    row('Research Items', job.counts.research ?? 0);
    if (job.counts.hours != null) row('Hours Logged', job.counts.hours);
  }

  if (job.description) {
    heading('Description');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(job.description, pageWidth - left * 2);
    doc.text(lines, left, y);
    y += lines.length * 13;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Starr Surveying — generated ${new Date().toLocaleString()}`,
    left,
    doc.internal.pageSize.getHeight() - 28,
  );

  doc.save(`Job_${job.job_number}_${job.name.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
}
