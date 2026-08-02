// lib/voice/settings.ts — server-side reads for the public site.
//
// ── THE RULE THIS FILE ENFORCES: THE PUBLIC SITE NEVER FAILS ON DATA ────────────────────────────
//
// Every function here returns usable content when the database is unreachable, unseeded, or returns
// an error. Not an empty array — usable content, from `lib/voice/content.ts`.
//
// This is not defensiveness for its own sake. The platform is being built on a database it shares
// with a surveying business, it will be reviewed by Andrew before the tables are ever seeded, and it
// is intended to be lifted onto a different host later. In all three of those situations the honest
// behaviour of a `SELECT` is "no rows", and the honest behaviour of a portfolio is still to show the
// portfolio. A casting director who lands on a page of empty sections does not file a bug report.
//
// Errors are logged, never thrown. A missing hero image is a worse outcome than a warning in a log
// nobody reads, but a 500 is a worse outcome than both.

import { supabaseAdmin } from '@/lib/supabase';
import { ARTIST, DEFAULT_NAV, LONG_BIO, SHORT_BIO, SEED_CREDITS, PLACEHOLDER_DEMOS } from './content';
import { DEFAULT_THEME_ID, resolveTheme, type VoiceTheme } from './theme';
import { normalizeWidgets, publicWidgets, type Widget } from './widgets';

export interface SiteSettings {
  artistName: string;
  tagline: string;
  shortBio: string;
  longBio: string;
  email: string | null;
  phone: string | null;
  location: string;
  bookingUrl: string | null;
  socialLinks: { label: string; url: string; icon?: string }[];
  theme: VoiceTheme;
  themePreset: string;
  heroPhotoId: string;
  portraitPhotoId: string;
  navItems: { label: string; href: string; external?: boolean }[];
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string | null;
  businessName: string;
  businessAddress: string | null;
  invoicePrefix: string;
  invoiceTermsDays: number;
  invoiceFooter: string | null;
  contractTerms: string | null;
  /** True when these are the built-in defaults rather than a saved row. The studio shows a nudge. */
  isDefault: boolean;
}

export function defaultSettings(): SiteSettings {
  return {
    artistName: ARTIST.name,
    tagline: ARTIST.tagline,
    shortBio: SHORT_BIO,
    longBio: LONG_BIO.join('\n\n'),
    email: null,
    phone: null,
    location: ARTIST.location,
    bookingUrl: null,
    socialLinks: [],
    theme: resolveTheme(DEFAULT_THEME_ID, null),
    themePreset: DEFAULT_THEME_ID,
    heroPhotoId: 'recital-expressive',
    portraitPhotoId: 'portrait-formal',
    navItems: DEFAULT_NAV.map((n) => ({ ...n })),
    metaTitle: `${ARTIST.name} — ${ARTIST.tagline}`,
    metaDescription: ARTIST.metaDescription,
    ogImageUrl: null,
    businessName: 'Andrew Ash Voice',
    businessAddress: null,
    invoicePrefix: 'AAV',
    invoiceTermsDays: 14,
    invoiceFooter: null,
    contractTerms: null,
    isDefault: true,
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const fallback = defaultSettings();
  try {
    const { data, error } = await supabaseAdmin.from('va_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) {
      if (error) console.warn('[voice/settings] falling back to defaults:', error.message);
      return fallback;
    }
    return {
      artistName: data.artist_name || fallback.artistName,
      tagline: data.tagline || fallback.tagline,
      shortBio: data.short_bio || fallback.shortBio,
      longBio: data.long_bio || fallback.longBio,
      email: data.email ?? null,
      phone: data.phone ?? null,
      location: data.location || fallback.location,
      bookingUrl: data.booking_url ?? null,
      socialLinks: Array.isArray(data.social_links) ? data.social_links : [],
      theme: resolveTheme(data.theme_preset, data.theme),
      themePreset: data.theme_preset || DEFAULT_THEME_ID,
      heroPhotoId: data.hero_photo_id || fallback.heroPhotoId,
      portraitPhotoId: data.portrait_photo_id || fallback.portraitPhotoId,
      // An empty saved nav means "I deleted every item", which would render a header with no links.
      // Treat it as "not configured" and fall back — the alternative is a site you cannot navigate.
      navItems: Array.isArray(data.nav_items) && data.nav_items.length ? data.nav_items : fallback.navItems,
      metaTitle: data.meta_title || fallback.metaTitle,
      metaDescription: data.meta_description || fallback.metaDescription,
      ogImageUrl: data.og_image_url ?? null,
      businessName: data.business_name || fallback.businessName,
      businessAddress: data.business_address ?? null,
      invoicePrefix: data.invoice_prefix || fallback.invoicePrefix,
      invoiceTermsDays: Number.isFinite(data.invoice_terms_days) ? data.invoice_terms_days : fallback.invoiceTermsDays,
      invoiceFooter: data.invoice_footer ?? null,
      contractTerms: data.contract_terms ?? null,
      isDefault: false,
    };
  } catch (err) {
    console.warn('[voice/settings] threw, using defaults:', err);
    return fallback;
  }
}

// ── Pages ────────────────────────────────────────────────────────────────────────────────────────

export interface VoicePage {
  id: string;
  slug: string;
  kind: 'project' | 'page';
  title: string;
  subtitle: string | null;
  summary: string | null;
  coverPhotoId: string | null;
  coverMediaUrl: string | null;
  status: 'draft' | 'live' | 'archived';
  workState: 'in_progress' | 'completed';
  clientName: string | null;
  roleLabel: string | null;
  projectType: string | null;
  year: number | null;
  tags: string[];
  blocks: Widget[];
  draftBlocks: Widget[] | null;
  pageStyle: Record<string, unknown>;
  featured: boolean;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPage(row: any): VoicePage {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind === 'page' ? 'page' : 'project',
    title: row.title ?? 'Untitled',
    subtitle: row.subtitle ?? null,
    summary: row.summary ?? null,
    coverPhotoId: row.cover_photo_id ?? null,
    coverMediaUrl: row.cover_media?.url ?? null,
    status: row.status ?? 'draft',
    workState: row.work_state === 'in_progress' ? 'in_progress' : 'completed',
    clientName: row.client_name ?? null,
    roleLabel: row.role_label ?? null,
    projectType: row.project_type ?? null,
    year: row.year ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    blocks: normalizeWidgets(row.blocks),
    draftBlocks: row.draft_blocks ? normalizeWidgets(row.draft_blocks) : null,
    pageStyle: row.page_style && typeof row.page_style === 'object' ? row.page_style : {},
    featured: row.featured === true,
    sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    publishedAt: row.published_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const PAGE_SELECT = '*, cover_media:va_media!va_pages_cover_media_id_fkey(url)';

/** Live pages of a kind, ordered the way the work index shows them. */
export async function listLivePages(kind: 'project' | 'page' = 'project'): Promise<VoicePage[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('va_pages')
      .select(PAGE_SELECT)
      .eq('kind', kind)
      .eq('status', 'live')
      .order('sort_order', { ascending: true })
      .order('year', { ascending: false, nullsFirst: false });
    if (error || !data) return [];
    return data.map(rowToPage);
  } catch {
    return [];
  }
}

/** Every page, for the studio. Includes drafts. */
export async function listAllPages(): Promise<VoicePage[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('va_pages')
      .select(PAGE_SELECT)
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return data.map(rowToPage);
  } catch {
    return [];
  }
}

/**
 * One page by slug.
 *
 * `includeDrafts` is what the studio's preview passes. It is a parameter rather than a session check
 * inside this function on purpose: data access should not read cookies, or every caller inherits an
 * authorisation decision it cannot see. The routes decide; this fetches.
 */
export async function getPageBySlug(
  slug: string,
  kind: 'project' | 'page' = 'project',
  includeDrafts = false,
): Promise<VoicePage | null> {
  try {
    let q = supabaseAdmin.from('va_pages').select(PAGE_SELECT).eq('kind', kind).eq('slug', slug);
    if (!includeDrafts) q = q.eq('status', 'live');
    const { data, error } = await q.maybeSingle();
    if (error || !data) return null;
    return rowToPage(data);
  } catch {
    return null;
  }
}

export async function getPageById(id: string): Promise<VoicePage | null> {
  try {
    const { data, error } = await supabaseAdmin.from('va_pages').select(PAGE_SELECT).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return rowToPage(data);
  } catch {
    return null;
  }
}

/** The blocks a visitor should see: the draft when previewing, the published set otherwise. */
export function renderableBlocks(page: VoicePage, preview = false): Widget[] {
  const source = preview && page.draftBlocks ? page.draftBlocks : page.blocks;
  return publicWidgets(source);
}

// ── Demos ────────────────────────────────────────────────────────────────────────────────────────

export interface VoiceDemo {
  id: string;
  title: string;
  category: string;
  description: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  traits: string[];
  featured: boolean;
  /** True when this is a "not recorded yet" slot rather than a real reel. */
  isPlaceholder: boolean;
}

/**
 * Demo reels, with placeholders filling the categories Andrew has not recorded yet.
 *
 * The merge matters: a brand-new portfolio with zero demos should still show four labelled reel slots
 * in a "coming soon" state, because that communicates "these are the categories I work in" — which is
 * useful — rather than "this section is broken", which is what an empty grid says.
 */
export async function listDemos(): Promise<VoiceDemo[]> {
  let real: VoiceDemo[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('va_demos')
      .select('*, media:va_media(url, meta)')
      .order('sort_order', { ascending: true });
    if (!error && data) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      real = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        description: row.description ?? null,
        audioUrl: row.audio_url || row.media?.url || null,
        durationSeconds: row.duration_seconds ?? row.media?.meta?.duration_seconds ?? null,
        traits: Array.isArray(row.traits) ? row.traits : [],
        featured: row.featured === true,
        isPlaceholder: false,
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
  } catch {
    real = [];
  }

  const covered = new Set(real.map((d) => d.category));
  const gaps: VoiceDemo[] = PLACEHOLDER_DEMOS.filter((p) => !covered.has(p.category)).map((p) => ({
    id: `placeholder-${p.id}`,
    title: p.title,
    category: p.category,
    description: p.blurb,
    audioUrl: null,
    durationSeconds: p.duration,
    traits: [],
    featured: false,
    isPlaceholder: true,
  }));

  return [...real, ...gaps];
}

// ── Credits & testimonials ───────────────────────────────────────────────────────────────────────

export interface VoiceCredit {
  id: string;
  production: string;
  role: string | null;
  company: string | null;
  year: number | null;
  type: string;
  detail: string | null;
}

export async function listCredits(): Promise<VoiceCredit[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('va_credits')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('year', { ascending: false, nullsFirst: false });
    if (!error && data && data.length) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return data.map((r: any) => ({
        id: r.id,
        production: r.production,
        role: r.role_name ?? null,
        company: r.company ?? null,
        year: r.year ?? null,
        type: r.credit_type ?? 'stage',
        detail: r.detail ?? null,
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
  } catch {
    /* fall through */
  }
  // Only the two known-true credits survive the fallback; the flagged examples do not go public.
  return SEED_CREDITS.filter((c) => !c.placeholder).map((c, i) => ({
    id: `seed-${i}`,
    production: c.production,
    role: c.role,
    company: c.company,
    year: c.year,
    type: c.type,
    detail: null,
  }));
}

export interface VoiceTestimonial {
  id: string;
  quote: string;
  author: string;
  role: string | null;
  company: string | null;
  context: string;
}

/** Testimonials for a surface. Returns [] rather than examples — a fake quote on a live page is the
 *  one placeholder that must never escape the studio. */
export async function listTestimonials(context: 'voice' | 'coaching' | 'all' = 'all'): Promise<VoiceTestimonial[]> {
  try {
    let q = supabaseAdmin.from('va_testimonials').select('*').order('sort_order', { ascending: true });
    if (context !== 'all') q = q.in('context', [context, 'both']);
    const { data, error } = await q;
    if (error || !data) return [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return data.map((r: any) => ({
      id: r.id,
      quote: r.quote,
      author: r.author_name,
      role: r.author_role ?? null,
      company: r.author_company ?? null,
      context: r.context ?? 'both',
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    return [];
  }
}

// ── Coaching packages ────────────────────────────────────────────────────────────────────────────

export interface CoachingPackage {
  id: string;
  name: string;
  blurb: string | null;
  inclusions: string[];
  sessionCount: number;
  sessionMinutes: number;
  priceCents: number;
  highlighted: boolean;
  isDefault: boolean;
}

/** Starting rates. Deliberately mid-market rather than the $20–30/hr that reads as "hobby teacher",
 *  and every number is editable from the studio the moment Andrew disagrees. */
export const DEFAULT_PACKAGES: CoachingPackage[] = [
  {
    id: 'default-single',
    name: 'Single lesson',
    blurb: 'One session. A good way to find out whether we work well together.',
    inclusions: ['45 minutes, one to one', 'Recorded for your practice', 'Written summary and exercises'],
    sessionCount: 1,
    sessionMinutes: 45,
    priceCents: 6500,
    highlighted: false,
    isDefault: true,
  },
  {
    id: 'default-four',
    name: 'Four-lesson block',
    blurb: 'The standard starting point. Long enough for technique to actually change.',
    inclusions: [
      'Four 45-minute sessions',
      'Recordings and written notes each week',
      'A practice plan between lessons',
      'Email questions between sessions',
    ],
    sessionCount: 4,
    sessionMinutes: 45,
    priceCents: 24000,
    highlighted: true,
    isDefault: true,
  },
  {
    id: 'default-audition',
    name: 'Audition intensive',
    blurb: 'Three focused sessions on specific repertoire, timed around an audition date.',
    inclusions: [
      'Three 60-minute sessions',
      'Repertoire selection and cuts',
      'Full run-throughs with feedback',
      'A recorded mock audition',
    ],
    sessionCount: 3,
    sessionMinutes: 60,
    priceCents: 25500,
    highlighted: false,
    isDefault: true,
  },
];

export async function listCoachingPackages(): Promise<CoachingPackage[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('va_coaching_packages')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error || !data || !data.length) return DEFAULT_PACKAGES;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return data.map((r: any) => ({
      id: r.id,
      name: r.name,
      blurb: r.blurb ?? null,
      inclusions: Array.isArray(r.inclusions) ? r.inclusions : [],
      sessionCount: r.session_count ?? 1,
      sessionMinutes: r.session_minutes ?? 45,
      priceCents: r.price_cents ?? 0,
      highlighted: r.highlighted === true,
      isDefault: false,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    return DEFAULT_PACKAGES;
  }
}
