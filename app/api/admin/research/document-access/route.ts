// app/api/admin/research/document-access/route.ts — Phase 14
// Next.js API routes for document access tier management.
//
// Endpoints:
//   GET  /api/admin/research/document-access?countyFIPS=48027
//     → Get access plan for a specific county (or platform catalog if no FIPS)
//
//   POST /api/admin/research/document-access
//     → action: 'fund_wallet'       — Create Stripe Checkout to fund document wallet
//     → action: 'purchase_document' — Fetch a document (free-first, then paid)
//
// All document access operations are proxied to the worker service at
// WORKER_API_URL.  The Next.js layer handles auth and Stripe session creation.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import Stripe from 'stripe';

const WORKER_URL = process.env.WORKER_API_URL ?? 'http://localhost:3100';
const WORKER_KEY = process.env.WORKER_API_KEY ?? '';

/** Lazy Stripe client — only instantiated when STRIPE_SECRET_KEY is set */
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' as any });
}

// ── GET ──────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const countyFIPS = searchParams.get('countyFIPS');
  const countyName = searchParams.get('county') ?? 'Unknown';

  // County-specific access plan
  if (countyFIPS) {
    const workerRes = await fetch(
      `${WORKER_URL}/research/access/plan/${encodeURIComponent(countyFIPS)}?county=${encodeURIComponent(countyName)}`,
      { headers: { Authorization: `Bearer ${WORKER_KEY}` } },
    );
    if (!workerRes.ok) {
      const err = await workerRes.text();
      return NextResponse.json({ error: err }, { status: workerRes.status });
    }
    const plan = await workerRes.json();
    return NextResponse.json(plan);
  }

  // Platform catalog summary
  const workerRes = await fetch(`${WORKER_URL}/research/access/platforms`, {
    headers: { Authorization: `Bearer ${WORKER_KEY}` },
  });
  if (!workerRes.ok) {
    const err = await workerRes.text();
    return NextResponse.json({ error: err }, { status: workerRes.status });
  }
  const catalog = await workerRes.json();
  return NextResponse.json(catalog);
}, { routeName: 'research/document-access' });

// ── POST ─────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    action: 'fund_wallet' | 'purchase_document';
    projectId?: string;
    countyFIPS?: string;
    countyName?: string;
    instrumentNumber?: string;
    documentType?: string;
    freeOnly?: boolean;
    maxCostPerDocument?: number;
    preferredPlatform?: string;
    // Wallet funding params
    fundAmountUSD?: number;
    stripeCustomerId?: string;
  };

  // ── Fund Wallet ─────────────────────────────────────────────────────────

  if (body.action === 'fund_wallet') {
    const { fundAmountUSD = 25, stripeCustomerId } = body;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'stripeCustomerId is required for wallet funding' },
        { status: 400 },
      );
    }

    const amount   = Math.min(Math.max(fundAmountUSD, 5), 500);
    const origin   = req.headers.get('origin') ?? 'https://starrsoftware.com';
    const stripe   = getStripe();
    const amtCents = Math.round(amount * 100);

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Document Purchase Wallet',
              description:
                'Pre-funded balance for automated Texas county document purchases. ' +
                'Typical cost: $1.00 per page from most county clerk systems.',
            },
            unit_amount: amtCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type:       'wallet_funding',
        customerId: stripeCustomerId,
        amountUSD:  amount.toFixed(2),
        platform:   'starr_software',
      },
      payment_intent_data: {
        metadata: {
          type:       'wallet_funding',
          customerId: stripeCustomerId,
          amountUSD:  amount.toFixed(2),
        },
      },
      success_url: `${origin}/admin/research/billing?funded=true&amount=${amount}`,
      cancel_url:  `${origin}/admin/research/billing?funded=false`,
    });

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      sessionId:   checkoutSession.id,
      amount,
    });
  }

  // ── Purchase / Access Document ─────────────────────────────────────────

  if (body.action === 'purchase_document') {
    const { projectId, countyFIPS, countyName, instrumentNumber, documentType } = body;

    if (!projectId || !countyFIPS || !instrumentNumber || !documentType) {
      return NextResponse.json(
        { error: 'projectId, countyFIPS, instrumentNumber, and documentType are required' },
        { status: 400 },
      );
    }

    const workerRes = await fetch(`${WORKER_URL}/research/access/document`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${WORKER_KEY}`,
      },
      body: JSON.stringify({
        projectId,
        countyFIPS,
        countyName:         countyName ?? 'Unknown',
        instrumentNumber,
        documentType,
        freeOnly:           body.freeOnly ?? false,
        maxCostPerDocument: body.maxCostPerDocument ?? 10.00,
        preferredPlatform:  body.preferredPlatform,
        stripeCustomerId:   body.stripeCustomerId,
      }),
    });

    if (!workerRes.ok) {
      const err = await workerRes.text();
      return NextResponse.json({ error: err }, { status: workerRes.status });
    }

    const result = await workerRes.json();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action. Valid: fund_wallet, purchase_document' }, { status: 400 });
}, { routeName: 'research/document-access' });

// ── GET ──────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const countyFIPS = searchParams.get('countyFIPS');
  const countyName = searchParams.get('county') ?? 'Unknown';

  // County-specific access plan
  if (countyFIPS) {
    const workerRes = await fetch(
      `${WORKER_URL}/research/access/plan/${encodeURIComponent(countyFIPS)}?county=${encodeURIComponent(countyName)}`,
      { headers: { Authorization: `Bearer ${WORKER_KEY}` } },
    );
    if (!workerRes.ok) {
      const err = await workerRes.text();
      return NextResponse.json({ error: err }, { status: workerRes.status });
    }
    const plan = await workerRes.json();
    return NextResponse.json(plan);
  }

  // Platform catalog summary
  const workerRes = await fetch(`${WORKER_URL}/research/access/platforms`, {
    headers: { Authorization: `Bearer ${WORKER_KEY}` },
  });
  if (!workerRes.ok) {
    const err = await workerRes.text();
    return NextResponse.json({ error: err }, { status: workerRes.status });
  }
  const catalog = await workerRes.json();
  return NextResponse.json(catalog);
}, { routeName: 'research/document-access' });

// ── POST ─────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    action: 'fund_wallet' | 'purchase_document';
    projectId?: string;
    countyFIPS?: string;
    countyName?: string;
    instrumentNumber?: string;
    documentType?: string;
    freeOnly?: boolean;
    maxCostPerDocument?: number;
    preferredPlatform?: string;
    // Wallet funding params
    fundAmountUSD?: number;
    stripeCustomerId?: string;
  };

  // ── Fund Wallet ─────────────────────────────────────────────────────────

  if (body.action === 'fund_wallet') {
    const { fundAmountUSD = 25, stripeCustomerId } = body;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'stripeCustomerId is required for wallet funding' },
        { status: 400 },
      );
    }

    const amount = Math.min(Math.max(fundAmountUSD, 5), 500);
    const origin = req.headers.get('origin') ?? 'https://starrsoftware.com';

    const billingService = new BillingService();
    const session_stripe = await billingService.createDocumentWalletFundingSession(
      stripeCustomerId,
      amount,
      `${origin}/admin/research/billing?funded=true&amount=${amount}`,
      `${origin}/admin/research/billing?funded=false`,
    );

    return NextResponse.json({
      checkoutUrl: session_stripe.url,
      sessionId:   session_stripe.id,
      amount,
    });
  }

  // ── Purchase / Access Document ─────────────────────────────────────────

  if (body.action === 'purchase_document') {
    const { projectId, countyFIPS, countyName, instrumentNumber, documentType } = body;

    if (!projectId || !countyFIPS || !instrumentNumber || !documentType) {
      return NextResponse.json(
        { error: 'projectId, countyFIPS, instrumentNumber, and documentType are required' },
        { status: 400 },
      );
    }

    const workerRes = await fetch(`${WORKER_URL}/research/access/document`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${WORKER_KEY}`,
      },
      body: JSON.stringify({
        projectId,
        countyFIPS,
        countyName: countyName ?? 'Unknown',
        instrumentNumber,
        documentType,
        freeOnly:           body.freeOnly ?? false,
        maxCostPerDocument: body.maxCostPerDocument ?? 10.00,
        preferredPlatform:  body.preferredPlatform,
        stripeCustomerId:   body.stripeCustomerId,
      }),
    });

    if (!workerRes.ok) {
      const err = await workerRes.text();
      return NextResponse.json({ error: err }, { status: workerRes.status });
    }

    const result = await workerRes.json();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'research/document-access' });
