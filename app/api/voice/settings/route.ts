// app/api/voice/settings/route.ts — the site's identity, theme and business defaults.
//
// One row, id = 1, upserted. The CHECK constraint on the table makes a second row impossible, so this
// route does not have to be careful about which settings it is updating — there is only ever one.
//
// ── THE THEME IS STORED AS AN OVERRIDE BAG, NOT A FULL PALETTE ──────────────────────────────────
//
// `theme_preset` names the base and `theme` holds only the tokens Andrew has deliberately changed.
// Storing a complete palette would mean that any later improvement to a preset — a better muted
// colour, a fixed contrast ratio — would never reach a site that had ever opened the theme editor.
// Sparse overrides keep the eleven tokens he did not touch following the preset forever.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { THEME_PRESETS, resolveTheme, themeContrast } from '@/lib/voice/theme';
import { normalizePaymentMethods } from '@/lib/voice/payments';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const text = (key: string, column: string, max: number): void => {
    if (typeof body[key] === 'string') patch[column] = (body[key] as string).slice(0, max) || null;
  };

  text('artistName', 'artist_name', 120);
  text('tagline', 'tagline', 160);
  text('shortBio', 'short_bio', 2000);
  text('longBio', 'long_bio', 8000);
  text('email', 'email', 200);
  text('phone', 'phone', 40);
  text('location', 'location', 120);
  text('bookingUrl', 'booking_url', 400);
  text('metaTitle', 'meta_title', 200);
  text('metaDescription', 'meta_description', 400);
  text('ogImageUrl', 'og_image_url', 500);
  text('businessName', 'business_name', 200);
  text('businessAddress', 'business_address', 500);
  text('invoiceFooter', 'invoice_footer', 1000);
  text('contractTerms', 'contract_terms', 8000);
  text('heroPhotoId', 'hero_photo_id', 80);
  text('portraitPhotoId', 'portrait_photo_id', 80);

  // The artist name is what the header renders; an empty one leaves the site nameless.
  if (patch.artist_name === null) delete patch.artist_name;

  if (typeof body.invoicePrefix === 'string') {
    // Stripped to letters and digits because it becomes part of a document number that has to be
    // typed, read aloud and searched for.
    patch.invoice_prefix = body.invoicePrefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'AAV';
  }
  if (Number.isFinite(Number(body.invoiceTermsDays))) {
    patch.invoice_terms_days = Math.max(0, Math.min(180, Math.round(Number(body.invoiceTermsDays))));
  }

  if (typeof body.themePreset === 'string' && THEME_PRESETS.some((p) => p.id === body.themePreset)) {
    patch.theme_preset = body.themePreset;
  }
  if (body.theme && typeof body.theme === 'object' && !Array.isArray(body.theme)) {
    patch.theme = body.theme;
  }
  if (Array.isArray(body.navItems)) {
    patch.nav_items = body.navItems
      .filter((n): n is { label: string; href: string } => Boolean(n) && typeof n === 'object')
      .map((n) => ({
        label: String(n.label ?? '').slice(0, 60),
        href: String(n.href ?? '').slice(0, 300),
        ...(('external' in n && n.external) ? { external: true } : {}),
      }))
      .filter((n) => n.label && n.href)
      .slice(0, 12);
  }
  // Payment methods go through normalizePaymentMethods rather than being trusted: a handle is the one
  // string on the invoice page a client copies verbatim into their banking app, so it is length-capped
  // and stripped of anything that is not a recognised method here, at the only place it can be.
  if (Array.isArray(body.paymentMethods)) {
    patch.payment_methods = normalizePaymentMethods(body.paymentMethods);
  }
  text('paymentNote', 'payment_note', 600);

  if (Array.isArray(body.socialLinks)) {
    patch.social_links = body.socialLinks
      .filter((n): n is { label: string; url: string } => Boolean(n) && typeof n === 'object')
      .map((n) => ({ label: String(n.label ?? '').slice(0, 60), url: String(n.url ?? '').slice(0, 400) }))
      .filter((n) => n.label && /^https?:\/\//i.test(n.url))
      .slice(0, 10);
  }

  const { data, error } = await supabaseAdmin
    .from('va_settings')
    .upsert({ id: 1, ...patch }, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hand back the contrast report so the editor can warn in the moment rather than leaving Andrew to
  // discover an illegible palette from a client who could not read the page.
  const theme = resolveTheme(data.theme_preset, data.theme);
  return NextResponse.json({ settings: data, contrast: themeContrast(theme) });
}
