// worker/src/services/billing-tracker.ts — Phase 9 §9.6
// Tracks all document purchase transactions, enforces budget constraints,
// and generates per-project invoices.
//
// Spec §9.6 — Billing & Transaction Tracker
// v1.1: PipelineLogger replaces bare console.log calls

import * as fs from 'fs';
import * as path from 'path';
import type {
  Transaction,
  ProjectBilling,
  BillingInvoice,
} from '../types/purchase.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Billing Tracker ─────────────────────────────────────────────────────────

export class BillingTracker {
  private billingDir: string;
  private logger: PipelineLogger;

  constructor(billingDir: string = '/tmp/billing', projectId: string = 'billing') {
    this.billingDir = billingDir;
    this.logger = new PipelineLogger(projectId);
    fs.mkdirSync(billingDir, { recursive: true });
  }

  // ── Record a completed transaction ──────────────────────────────────────

  recordTransaction(tx: Transaction): void {
    const billing = this.loadProjectBilling(tx.projectId);
    billing.transactions.push(tx);
    billing.totalSpent = billing.transactions
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + t.totalCost, 0);
    billing.remainingBudget = billing.budget - billing.totalSpent;
    this.saveProjectBilling(billing);

    this.logger.info(
      'Billing',
      `Recorded: ${tx.transactionId} — $${tx.totalCost.toFixed(2)} (${tx.instrument})`,
    );
  }

  // ── Budget Enforcement ────────────────────────────────────────────────

  checkBudget(
    projectId: string,
    proposedCost: number,
  ): { allowed: boolean; remaining: number } {
    const billing = this.loadProjectBilling(projectId);
    return {
      allowed: billing.remainingBudget >= proposedCost,
      remaining: billing.remainingBudget,
    };
  }

  setBudget(projectId: string, budget: number): void {
    const billing = this.loadProjectBilling(projectId);
    billing.budget = budget;
    billing.remainingBudget = budget - billing.totalSpent;
    this.saveProjectBilling(billing);
  }

  // ── Invoice Generation ────────────────────────────────────────────────

  generateInvoice(projectId: string): string {
    const billing = this.loadProjectBilling(projectId);
    const invoicePath = path.join(this.billingDir, `${projectId}_invoice.json`);
    const completedTxns = billing.transactions.filter(
      (t) => t.status === 'completed',
    );

    const invoice: BillingInvoice = {
      projectId,
      generatedAt: new Date().toISOString(),
      transactions: completedTxns,
      summary: {
        totalDocuments: completedTxns.length,
        totalPages: completedTxns.reduce((sum, t) => sum + t.pages, 0),
        totalCost: billing.totalSpent,
        budget: billing.budget,
        remaining: billing.remainingBudget,
      },
    };

    fs.writeFileSync(invoicePath, JSON.stringify(invoice, null, 2));
    this.logger.info(
      'Billing',
      `Invoice generated: ${invoicePath} — $${billing.totalSpent.toFixed(2)} spent of $${billing.budget.toFixed(2)} budget`,
    );
    return invoicePath;
  }

  // ── Get Summary ───────────────────────────────────────────────────────

  getProjectBilling(projectId: string): ProjectBilling {
    return this.loadProjectBilling(projectId);
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private loadProjectBilling(projectId: string): ProjectBilling {
    const filePath = path.join(this.billingDir, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProjectBilling;
      } catch (e) {
        // Corrupt billing file — reset to defaults and log warning
        this.logger.warn('Billing', `Failed to parse billing file for ${projectId}: ${String(e)} — resetting`);
      }
    }
    const defaultBudget = parseFloat(
      process.env.DEFAULT_PURCHASE_BUDGET || '50',
    );
    return {
      projectId,
      transactions: [],
      totalSpent: 0,
      budget: defaultBudget,
      remainingBudget: defaultBudget,
    };
  }

  private saveProjectBilling(billing: ProjectBilling): void {
    const filePath = path.join(this.billingDir, `${billing.projectId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(billing, null, 2));
  }
}
