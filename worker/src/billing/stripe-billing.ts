// worker/src/billing/stripe-billing.ts — Phase 11 Module G
// Stripe integration for subscriptions, per-report purchases,
// and document purchase pass-through billing.
//
// Spec §11.8.2 — Stripe Integration
//
// NOTE: STRIPE_SECRET_KEY, STRIPE_PRICE_SURVEYOR_PRO,
//       STRIPE_PRICE_FIRM_UNLIMITED, and STRIPE_WEBHOOK_SECRET must be set
//       in environment variables before using this service.  Missing keys are
//       detected at call time and throw a descriptive error so callers can
//       surface them rather than sending an empty string to Stripe.

import Stripe from 'stripe';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Require an env var at call time.  Throws with a clear message when the var
 * is absent so callers don't silently send empty strings to Stripe.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[BillingService] Missing required environment variable: ${name}. ` +
        'Set this in your deployment environment before using BillingService.',
    );
  }
  return value;
}

// ── Stripe Client ───────────────────────────────────────────────────────────

// The Stripe SDK is instantiated lazily so that the module can be imported
// during tests without a real STRIPE_SECRET_KEY.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-12-18.acacia' as any,
    });
  }
  return _stripe;
}

// ── Billing Service ─────────────────────────────────────────────────────────

export class BillingService {

  /**
   * Create a new Stripe customer when user signs up.
   */
  async createCustomer(
    userId: string,
    email: string,
    name: string,
  ): Promise<string> {
    const customer = await getStripe().customers.create({
      email,
      name,
      metadata: { userId, platform: 'starr_software' },
    });
    return customer.id;
  }

  /**
   * Create a subscription for a user.
   *
   * @throws if STRIPE_PRICE_SURVEYOR_PRO or STRIPE_PRICE_FIRM_UNLIMITED env
   *         vars are not set.
   */
  async createSubscription(
    customerId: string,
    tier: 'SURVEYOR_PRO' | 'FIRM_UNLIMITED',
  ): Promise<Stripe.Subscription> {
    const priceEnvMap: Record<string, string> = {
      SURVEYOR_PRO: 'STRIPE_PRICE_SURVEYOR_PRO',
      FIRM_UNLIMITED: 'STRIPE_PRICE_FIRM_UNLIMITED',
    };
    const priceId = requireEnv(priceEnvMap[tier]);

    return getStripe().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
  }

  /**
   * Cancel a subscription.
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<Stripe.Subscription> {
    if (cancelAtPeriodEnd) {
      return getStripe().subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return getStripe().subscriptions.cancel(subscriptionId);
  }

  /**
   * Charge for a one-time report purchase.
   */
  async chargeForReport(
    customerId: string,
    reportType: 'BASIC_REPORT' | 'FULL_REPORT' | 'PREMIUM_REPORT',
    projectId: string,
  ): Promise<Stripe.PaymentIntent> {
    const amounts: Record<string, number> = {
      BASIC_REPORT: 2900,
      FULL_REPORT: 7900,
      PREMIUM_REPORT: 14900,
    };

    return getStripe().paymentIntents.create({
      amount: amounts[reportType],
      currency: 'usd',
      customer: customerId,
      metadata: {
        projectId,
        reportType,
        platform: 'starr_software',
      },
      description: `Property Research Report — ${reportType}`,
    });
  }

  /**
   * Charge for document purchases (pass-through + service fee).
   * Called after documents are purchased from county clerk / TexasFile.
   */
  async chargeForDocumentPurchases(
    customerId: string,
    projectId: string,
    documentCost: number,
    serviceFeePerPage: number,
    totalPages: number,
  ): Promise<Stripe.PaymentIntent> {
    const serviceFee = serviceFeePerPage * totalPages;
    const totalAmount = Math.round((documentCost + serviceFee) * 100); // cents

    return getStripe().paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      customer: customerId,
      metadata: {
        projectId,
        documentCost: documentCost.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        totalPages: String(totalPages),
        platform: 'starr_software',
      },
      description: `Document Purchase — ${totalPages} pages`,
    });
  }

  /**
   * Track metered usage (for usage-based billing tiers).
   */
  async reportUsage(
    subscriptionItemId: string,
    quantity: number,
  ): Promise<void> {
    await getStripe().subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      action: 'increment',
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Get customer billing history.
   */
  async getInvoices(
    customerId: string,
    limit: number = 10,
  ): Promise<Stripe.Invoice[]> {
    const invoices = await getStripe().invoices.list({
      customer: customerId,
      limit,
    });
    return invoices.data;
  }

  /**
   * Get subscription status.
   */
  async getSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return getStripe().subscriptions.retrieve(subscriptionId);
  }

  /**
   * Create a checkout session for initial subscription.
   *
   * @throws if STRIPE_PRICE_SURVEYOR_PRO or STRIPE_PRICE_FIRM_UNLIMITED env
   *         vars are not set.
   */
  async createCheckoutSession(
    customerId: string,
    tier: 'SURVEYOR_PRO' | 'FIRM_UNLIMITED',
    successUrl: string,
    cancelUrl: string,
  ): Promise<Stripe.Checkout.Session> {
    const priceEnvMap: Record<string, string> = {
      SURVEYOR_PRO: 'STRIPE_PRICE_SURVEYOR_PRO',
      FIRM_UNLIMITED: 'STRIPE_PRICE_FIRM_UNLIMITED',
    };
    const priceId = requireEnv(priceEnvMap[tier]);

    return getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  /**
   * Handle Stripe webhooks for subscription lifecycle events.
   */
  async handleWebhook(
    event: Stripe.Event,
  ): Promise<{ action: string; data: any }> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          action: 'update_subscription',
          data: {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodEnd: new Date(
              subscription.current_period_end * 1000,
            ).toISOString(),
          },
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          action: 'cancel_subscription',
          data: {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
          },
        };
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          action: 'payment_failed',
          data: {
            customerId: invoice.customer,
            invoiceId: invoice.id,
            amountDue: invoice.amount_due,
          },
        };
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          action: 'payment_succeeded',
          data: {
            customerId: intent.customer,
            projectId: intent.metadata?.projectId,
            reportType: intent.metadata?.reportType,
            amount: intent.amount,
          },
        };
      }

      default:
        return { action: 'unhandled', data: { type: event.type } };
    }
  }

  /**
   * Verify Stripe webhook signature.
   *
   * Wraps `stripe.webhooks.constructEvent` so that signature failures throw a
   * descriptive error that callers can catch and respond to with 400 Bad Request
   * rather than letting an unhandled exception crash the request handler.
   *
   * @throws {Error} if STRIPE_WEBHOOK_SECRET is not set or the signature is invalid.
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');
    try {
      return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }
  }

  // ── Document Access Payments (Phase 14) ──────────────────────────────────

  /**
   * Create a Stripe Checkout Session that lets a user fund their document
   * purchase wallet from the website.
   *
   * Workflow:
   *   1. User visits /billing/fund-wallet in the Next.js app
   *   2. App calls this method to create a Checkout Session
   *   3. User is redirected to Stripe Checkout (hosted page)
   *   4. On success, Stripe webhook fires payment_intent.succeeded
   *   5. Webhook handler credits the user's wallet in Supabase
   *   6. DocumentAccessOrchestrator uses wallet balance for document purchases
   *
   * @param customerId  Stripe customer ID
   * @param amountUSD   Amount to fund in USD (min $5, max $500)
   * @param successUrl  URL to redirect after successful payment
   * @param cancelUrl   URL to redirect if user cancels
   */
  async createDocumentWalletFundingSession(
    customerId: string,
    amountUSD: number,
    successUrl: string,
    cancelUrl: string,
  ): Promise<Stripe.Checkout.Session> {
    const amountCents = Math.round(Math.min(Math.max(amountUSD, 5), 500) * 100);

    return getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Document Purchase Wallet',
              description:
                'Pre-funded balance for automated county document purchases. ' +
                '$1.00 per page for most Texas county clerk systems.',
              images: [],
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'wallet_funding',
        customerId,
        amountUSD: amountUSD.toFixed(2),
        platform: 'starr_software',
      },
      payment_intent_data: {
        metadata: {
          type: 'wallet_funding',
          customerId,
          amountUSD: amountUSD.toFixed(2),
        },
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });
  }

  /**
   * Create a one-time checkout for a specific document purchase.
   * Used when the user doesn't have enough wallet balance.
   *
   * @param customerId       Stripe customer ID
   * @param projectId        Research project ID
   * @param instrumentNumber County clerk instrument number
   * @param documentType     e.g. 'warranty_deed', 'plat'
   * @param pages            Estimated page count
   * @param pricePerPage     Cost per page from the target platform
   * @param platformId       Which paid platform will be used (e.g. 'texasfile')
   * @param successUrl / cancelUrl  Redirect URLs
   */
  async createDocumentPurchaseCheckoutSession(
    customerId: string,
    projectId: string,
    instrumentNumber: string,
    documentType: string,
    pages: number,
    pricePerPage: number,
    platformId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<Stripe.Checkout.Session> {
    // Service fee: $0.25 per document (covers platform overhead)
    const documentCost = pages * pricePerPage;
    const serviceFee   = 0.25;
    const totalUSD     = documentCost + serviceFee;
    const totalCents   = Math.round(totalUSD * 100);

    return getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Document: ${documentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
              description:
                `Instrument #${instrumentNumber} — ${pages} pages @ $${pricePerPage.toFixed(2)}/page ` +
                `via ${platformId}. Project: ${projectId}.`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type:             'document_purchase',
        customerId,
        projectId,
        instrumentNumber,
        documentType,
        pages:            String(pages),
        pricePerPage:     pricePerPage.toFixed(2),
        platformId,
        documentCost:     documentCost.toFixed(2),
        serviceFee:       serviceFee.toFixed(2),
        platform:         'starr_software',
      },
      payment_intent_data: {
        metadata: {
          type:             'document_purchase',
          projectId,
          instrumentNumber,
          documentType,
          pages:            String(pages),
          platformId,
        },
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });
  }

  /**
   * Get the current document wallet balance for a customer.
   * In practice, the balance is stored in Supabase.
   * This method reads from Stripe balance transactions as a cross-check.
   *
   * NOTE: Call this from the Next.js API layer; don't call it in hot paths.
   */
  async getDocumentWalletBalance(customerId: string): Promise<number> {
    const intents = await getStripe().paymentIntents.list({
      customer: customerId,
      limit: 100,
    });

    let totalFunded = 0;
    let totalSpent  = 0;

    for (const intent of intents.data) {
      if (intent.status !== 'succeeded') continue;
      if (intent.metadata?.type === 'wallet_funding') {
        totalFunded += intent.amount / 100; // cents → USD
      } else if (intent.metadata?.type === 'document_purchase') {
        totalSpent += intent.amount / 100;
      }
    }

    return Math.max(0, totalFunded - totalSpent);
  }

  /**
   * Handle wallet_funding and document_purchase webhook events.
   * Called from the existing handleWebhookEvent() method's switch statement.
   * Returns structured data for the database layer to persist.
   */
  handleDocumentPaymentEvent(event: Stripe.Event): {
    action: 'wallet_funded' | 'document_purchased' | 'unhandled';
    data: Record<string, unknown>;
  } {
    if (event.type !== 'payment_intent.succeeded') {
      return { action: 'unhandled', data: { type: event.type } };
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const meta = intent.metadata ?? {};

    if (meta.type === 'wallet_funding') {
      return {
        action: 'wallet_funded',
        data: {
          customerId:  meta.customerId,
          amountUSD:   parseFloat(meta.amountUSD ?? '0'),
          paymentIntentId: intent.id,
          fundedAt:    new Date().toISOString(),
        },
      };
    }

    if (meta.type === 'document_purchase') {
      return {
        action: 'document_purchased',
        data: {
          projectId:        meta.projectId,
          instrumentNumber: meta.instrumentNumber,
          documentType:     meta.documentType,
          pages:            parseInt(meta.pages ?? '0', 10),
          platformId:       meta.platformId,
          documentCost:     parseFloat(meta.documentCost ?? '0'),
          serviceFee:       parseFloat(meta.serviceFee ?? '0'),
          totalCharged:     intent.amount / 100,
          paymentIntentId:  intent.id,
          purchasedAt:      new Date().toISOString(),
        },
      };
    }

    return { action: 'unhandled', data: { type: event.type, intentId: intent.id } };
  }
}
