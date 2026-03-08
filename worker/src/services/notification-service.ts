// worker/src/services/notification-service.ts — Phase 15
// Notification service for Starr Research Worker.
// Sends email and/or SMS notifications when key pipeline events occur:
//   - Document purchase completed (clean image available)
//   - Research pipeline finished
//   - Purchase failed / manual intervention required
//   - Subscription billing events
//
// Transport options:
//   EMAIL: Resend API (resend.com) — configured via RESEND_API_KEY
//   SMS:   Twilio API — configured via TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
//
// Both transports are optional — if credentials are absent, notifications are
// logged to the worker console but not sent.
//
// Spec §15.8 — Notification Service
// v1.0: Initial implementation

import * as https from 'https';
import { PipelineLogger } from '../lib/logger.js';

// ── Notification Types ────────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'sms' | 'both';

export type NotificationEventType =
  | 'document_purchased'          // Clean document successfully purchased
  | 'document_purchase_failed'    // All purchase attempts failed
  | 'pipeline_complete'           // Full research pipeline finished
  | 'pipeline_failed'             // Pipeline encountered fatal error
  | 'manual_review_required'      // Document requires human intervention
  | 'subscription_expiring'       // Subscription renews/expires soon
  | 'wallet_low_balance'          // Document wallet balance below threshold
  | 'wallet_funded';              // Wallet top-up completed

export interface NotificationPayload {
  /** Event type determines the template and urgency */
  eventType: NotificationEventType;
  /** User's email address */
  recipientEmail: string;
  /** User's phone (E.164 format, e.g. "+12025551234") */
  recipientPhone?: string;
  /** Which channels to use */
  channel?: NotificationChannel;
  /** Project / research context */
  projectId?: string;
  /** Human-readable subject / summary (used in email subject + SMS prefix) */
  subject?: string;
  /** Additional key-value data for template rendering */
  data?: Record<string, string | number | boolean>;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  emailSent: boolean;
  smsSent: boolean;
  error?: string;
}

// ── Email Templates ────────────────────────────────────────────────────────────

const EMAIL_TEMPLATES: Record<NotificationEventType, {
  subject: (data: Record<string, string | number | boolean>) => string;
  html: (data: Record<string, string | number | boolean>) => string;
}> = {
  document_purchased: {
    subject: (d) => `✅ Document Retrieved — ${d.instrumentNumber ?? 'Unknown'} | Starr Research`,
    html: (d) => `
      <h2>Document Successfully Retrieved</h2>
      <p>Your document has been purchased and is ready for AI analysis.</p>
      <table>
        <tr><td><strong>Project:</strong></td><td>${d.projectId ?? 'N/A'}</td></tr>
        <tr><td><strong>Instrument:</strong></td><td>${d.instrumentNumber ?? 'N/A'}</td></tr>
        <tr><td><strong>County:</strong></td><td>${d.countyName ?? 'N/A'}</td></tr>
        <tr><td><strong>Platform:</strong></td><td>${d.vendor ?? 'N/A'}</td></tr>
        <tr><td><strong>Cost:</strong></td><td>$${Number(d.cost ?? 0).toFixed(2)}</td></tr>
        <tr><td><strong>Pages:</strong></td><td>${d.pages ?? 'N/A'}</td></tr>
      </table>
      <p><a href="${d.reportUrl ?? '#'}">View Research Report →</a></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  document_purchase_failed: {
    subject: (d) => `⚠️ Document Purchase Failed — ${d.instrumentNumber ?? 'Unknown'} | Starr Research`,
    html: (d) => `
      <h2>Document Purchase Failed</h2>
      <p>All automated purchase attempts failed for this document. Manual retrieval may be required.</p>
      <table>
        <tr><td><strong>Project:</strong></td><td>${d.projectId ?? 'N/A'}</td></tr>
        <tr><td><strong>Instrument:</strong></td><td>${d.instrumentNumber ?? 'N/A'}</td></tr>
        <tr><td><strong>County:</strong></td><td>${d.countyName ?? 'N/A'}</td></tr>
        <tr><td><strong>Error:</strong></td><td>${d.error ?? 'Unknown error'}</td></tr>
      </table>
      <p>Platforms attempted: ${d.platformsAttempted ?? 'None'}</p>
      <p><a href="${d.reportUrl ?? '#'}">View Research Report →</a></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  pipeline_complete: {
    subject: (d) => `✅ Research Complete — ${d.address ?? 'Property'} | Starr Research`,
    html: (d) => `
      <h2>Research Pipeline Complete</h2>
      <p>Your property research report is ready.</p>
      <table>
        <tr><td><strong>Address:</strong></td><td>${d.address ?? 'N/A'}</td></tr>
        <tr><td><strong>County:</strong></td><td>${d.countyName ?? 'N/A'}</td></tr>
        <tr><td><strong>Overall Confidence:</strong></td><td>${d.confidenceScore ?? 'N/A'}%</td></tr>
        <tr><td><strong>Runtime:</strong></td><td>${d.runtimeMinutes ?? 'N/A'} minutes</td></tr>
        <tr><td><strong>Documents:</strong></td><td>${d.documentCount ?? '0'} retrieved</td></tr>
      </table>
      <p><a href="${d.reportUrl ?? '#'}">View Full Report →</a></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  pipeline_failed: {
    subject: (d) => `❌ Research Pipeline Failed — ${d.projectId ?? 'Project'} | Starr Research`,
    html: (d) => `
      <h2>Research Pipeline Error</h2>
      <p>The research pipeline encountered a fatal error and could not complete.</p>
      <table>
        <tr><td><strong>Project:</strong></td><td>${d.projectId ?? 'N/A'}</td></tr>
        <tr><td><strong>Phase:</strong></td><td>${d.phase ?? 'N/A'}</td></tr>
        <tr><td><strong>Error:</strong></td><td>${d.error ?? 'Unknown error'}</td></tr>
      </table>
      <p>Our team has been alerted. You will not be charged for this report.</p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  manual_review_required: {
    subject: (d) => `👁️ Manual Review Required — ${d.instrumentNumber ?? 'Document'} | Starr Research`,
    html: (d) => `
      <h2>Manual Document Retrieval Required</h2>
      <p>One or more documents could not be retrieved automatically.</p>
      <table>
        <tr><td><strong>Instrument:</strong></td><td>${d.instrumentNumber ?? 'N/A'}</td></tr>
        <tr><td><strong>County:</strong></td><td>${d.countyName ?? 'N/A'}</td></tr>
        <tr><td><strong>Reason:</strong></td><td>${d.reason ?? 'No automated option available'}</td></tr>
      </table>
      <p>You may request this document directly from ${d.countyName ?? 'the county'} clerk's office.</p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  subscription_expiring: {
    subject: (d) => `🔔 Subscription ${d.action ?? 'Renewing'} Soon | Starr Research`,
    html: (d) => `
      <h2>Subscription Notice</h2>
      <p>Your ${d.tier ?? 'Starr Research'} subscription ${d.action ?? 'renews'} on ${d.date ?? 'N/A'}.</p>
      <p>Amount: $${d.amount ?? '0'}/month</p>
      <p><a href="${d.billingUrl ?? '#'}">Manage Subscription →</a></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  wallet_low_balance: {
    subject: () => '💰 Document Wallet Balance Low | Starr Research',
    html: (d) => `
      <h2>Low Wallet Balance Warning</h2>
      <p>Your document wallet balance is below $${d.threshold ?? '5.00'}.</p>
      <p>Current balance: <strong>$${d.balance ?? '0.00'}</strong></p>
      <p>Add funds to continue purchasing documents automatically.</p>
      <p><a href="${d.fundUrl ?? '#'}">Add Funds →</a></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
  wallet_funded: {
    subject: (d) => `✅ Wallet Funded — $${d.amount ?? '0.00'} Added | Starr Research`,
    html: (d) => `
      <h2>Wallet Funded Successfully</h2>
      <p>$${d.amount ?? '0.00'} has been added to your document wallet.</p>
      <p>New balance: <strong>$${d.newBalance ?? '0.00'}</strong></p>
      <hr><p style="font-size:12px">Starr Surveying Company · Belton, TX</p>
    `,
  },
};

// ── SMS Templates ──────────────────────────────────────────────────────────────

const SMS_TEMPLATES: Record<NotificationEventType, (data: Record<string, string | number | boolean>) => string> = {
  document_purchased: (d) =>
    `Starr Research: Document ${d.instrumentNumber ?? ''} retrieved ✅ (${d.pages ?? '?'} pages, $${d.cost ?? '0'}). View: ${d.reportUrl ?? ''}`,
  document_purchase_failed: (d) =>
    `Starr Research: Doc purchase FAILED for ${d.instrumentNumber ?? ''}. Manual retrieval may be needed. Project: ${d.projectId ?? ''}`,
  pipeline_complete: (d) =>
    `Starr Research: Research complete for ${d.address ?? 'your property'}. Confidence: ${d.confidenceScore ?? '?'}%. View: ${d.reportUrl ?? ''}`,
  pipeline_failed: (d) =>
    `Starr Research: Pipeline error on project ${d.projectId ?? ''}. Error: ${String(d.error ?? 'Unknown').slice(0, 80)}`,
  manual_review_required: (d) =>
    `Starr Research: Manual review needed for ${d.instrumentNumber ?? ''} in ${d.countyName ?? ''}.`,
  subscription_expiring: (d) =>
    `Starr Research: Subscription ${d.action ?? 'renews'} on ${d.date ?? 'N/A'}. $${d.amount ?? '0'}/mo.`,
  wallet_low_balance: (d) =>
    `Starr Research: Low wallet balance ($${d.balance ?? '0'}). Add funds: ${d.fundUrl ?? ''}`,
  wallet_funded: (d) =>
    `Starr Research: Wallet funded. Added $${d.amount ?? '0'}. New balance: $${d.newBalance ?? '0'}.`,
};

// ── Notification Service ───────────────────────────────────────────────────────

export class NotificationService {
  private logger: PipelineLogger;
  private resendApiKey: string | null;
  private twilioAccountSid: string | null;
  private twilioAuthToken: string | null;
  private twilioFromNumber: string | null;
  private fromEmail: string;

  constructor() {
    this.logger = new PipelineLogger('notification-service');
    this.resendApiKey = process.env.RESEND_API_KEY ?? null;
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID ?? null;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? null;
    this.twilioFromNumber = process.env.TWILIO_FROM_NUMBER ?? null;
    this.fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? 'noreply@starrsurveying.com';
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Send a notification via the specified channel(s).
   * Gracefully degrades if credentials are not configured.
   */
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const channel = payload.channel ?? 'email';
    const data = payload.data ?? {};
    if (payload.projectId) data.projectId = payload.projectId;

    let emailSent = false;
    let smsSent = false;
    const errors: string[] = [];

    if (channel === 'email' || channel === 'both') {
      const result = await this._sendEmail(payload.recipientEmail, payload.eventType, data);
      emailSent = result.success;
      if (!result.success && result.error) errors.push(`Email: ${result.error}`);
    }

    if ((channel === 'sms' || channel === 'both') && payload.recipientPhone) {
      const result = await this._sendSms(payload.recipientPhone, payload.eventType, data);
      smsSent = result.success;
      if (!result.success && result.error) errors.push(`SMS: ${result.error}`);
    }

    return {
      success: emailSent || smsSent,
      channel,
      emailSent,
      smsSent,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Convenience: notify when document purchase completes.
   */
  async notifyDocumentPurchased(
    recipientEmail: string,
    recipientPhone: string | undefined,
    projectId: string,
    instrumentNumber: string,
    countyName: string,
    vendor: string,
    pages: number,
    cost: number,
    reportUrl: string,
  ): Promise<NotificationResult> {
    return this.send({
      eventType: 'document_purchased',
      recipientEmail,
      recipientPhone,
      channel: recipientPhone ? 'both' : 'email',
      projectId,
      data: { instrumentNumber, countyName, vendor, pages, cost: cost.toFixed(2), reportUrl },
    });
  }

  /**
   * Convenience: notify when pipeline completes.
   */
  async notifyPipelineComplete(
    recipientEmail: string,
    recipientPhone: string | undefined,
    projectId: string,
    address: string,
    countyName: string,
    confidenceScore: number,
    runtimeMinutes: number,
    documentCount: number,
    reportUrl: string,
  ): Promise<NotificationResult> {
    return this.send({
      eventType: 'pipeline_complete',
      recipientEmail,
      recipientPhone,
      channel: recipientPhone ? 'both' : 'email',
      projectId,
      data: { address, countyName, confidenceScore, runtimeMinutes, documentCount, reportUrl },
    });
  }

  /**
   * Convenience: notify about low wallet balance.
   */
  async notifyLowWalletBalance(
    recipientEmail: string,
    balance: number,
    threshold: number,
    fundUrl: string,
  ): Promise<NotificationResult> {
    return this.send({
      eventType: 'wallet_low_balance',
      recipientEmail,
      channel: 'email',
      data: { balance: balance.toFixed(2), threshold: threshold.toFixed(2), fundUrl },
    });
  }

  // ── Email Transport (Resend API) ───────────────────────────────────────────

  private async _sendEmail(
    to: string,
    eventType: NotificationEventType,
    data: Record<string, string | number | boolean>,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.resendApiKey) {
      this.logger.info('Notification', `Email skipped (no RESEND_API_KEY): ${eventType} → ${to}`);
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const template = EMAIL_TEMPLATES[eventType];
    const subject = template.subject(data);
    const html = template.html(data);

    const body = JSON.stringify({
      from: this.fromEmail,
      to,
      subject,
      html,
    });

    try {
      await this._postJson('api.resend.com', '/emails', body, {
        Authorization: `Bearer ${this.resendApiKey}`,
      });
      this.logger.info('Notification', `Email sent: ${eventType} → ${to}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Notification', `Email send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ── SMS Transport (Twilio API) ─────────────────────────────────────────────

  private async _sendSms(
    to: string,
    eventType: NotificationEventType,
    data: Record<string, string | number | boolean>,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.twilioAccountSid || !this.twilioAuthToken || !this.twilioFromNumber) {
      this.logger.info('Notification', `SMS skipped (Twilio not configured): ${eventType} → ${to}`);
      return { success: false, error: 'Twilio credentials not configured' };
    }

    const messageBody = SMS_TEMPLATES[eventType](data);
    const formData = new URLSearchParams({
      To: to,
      From: this.twilioFromNumber,
      Body: messageBody,
    }).toString();

    const auth = Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64');

    try {
      await this._postForm(
        'api.twilio.com',
        `/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`,
        formData,
        { Authorization: `Basic ${auth}` },
      );
      this.logger.info('Notification', `SMS sent: ${eventType} → ${to}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Notification', `SMS send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ── HTTP Helpers ───────────────────────────────────────────────────────────

  private _postJson(
    host: string,
    urlPath: string,
    body: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path: urlPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          res.resume(); // Drain response
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode ?? 0} from ${host}${urlPath}`));
          } else {
            resolve();
          }
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private _postForm(
    host: string,
    urlPath: string,
    body: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path: urlPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          res.resume();
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode ?? 0} from ${host}${urlPath}`));
          } else {
            resolve();
          }
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── Configuration Check ────────────────────────────────────────────────────

  get isEmailConfigured(): boolean {
    return !!this.resendApiKey;
  }

  get isSmsConfigured(): boolean {
    return !!(this.twilioAccountSid && this.twilioAuthToken && this.twilioFromNumber);
  }

  get configuredChannels(): NotificationChannel[] {
    const channels: NotificationChannel[] = [];
    if (this.isEmailConfigured) channels.push('email');
    if (this.isSmsConfigured) channels.push('sms');
    return channels;
  }
}
