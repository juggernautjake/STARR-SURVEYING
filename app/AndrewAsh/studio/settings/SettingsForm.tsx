'use client';
// app/AndrewAsh/studio/settings/SettingsForm.tsx
//
// ── THE THEME PICKER WARNS BEFORE IT SAVES ──────────────────────────────────────────────────────
//
// Contrast is recomputed from the actual hex values on every change, using the same WCAG maths the
// presets were checked against. A picker that will happily produce grey-on-grey is a picker that
// eventually does, and the person who finds out is a client who could not read the page. The warning
// does not block saving — it is Andrew's site — but it is impossible to miss.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { THEME_PRESETS, resolveTheme, themeContrast, type VoiceTheme } from '@/lib/voice/theme';
import { ANDREW_PHOTOS } from '@/lib/voice/photos';
import type { SiteSettings } from '@/lib/voice/settings';

const TOKEN_LABELS: { key: keyof VoiceTheme; label: string }[] = [
  { key: 'ink', label: 'Page background' },
  { key: 'surface', label: 'Cards and panels' },
  { key: 'line', label: 'Hairlines' },
  { key: 'text', label: 'Body text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentBright', label: 'Accent (hover)' },
  { key: 'accentContrast', label: 'Text on buttons' },
  { key: 'glow', label: 'Secondary accent' },
];

export default function SettingsForm({ settings }: { settings: SiteSettings }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [v, setV] = useState({
    artistName: settings.artistName,
    tagline: settings.tagline,
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    location: settings.location,
    shortBio: settings.shortBio,
    metaTitle: settings.metaTitle,
    metaDescription: settings.metaDescription,
    businessName: settings.businessName,
    businessAddress: settings.businessAddress ?? '',
    invoicePrefix: settings.invoicePrefix,
    invoiceTermsDays: String(settings.invoiceTermsDays),
    invoiceFooter: settings.invoiceFooter ?? '',
    heroPhotoId: settings.heroPhotoId,
    portraitPhotoId: settings.portraitPhotoId,
  });

  const [themePreset, setThemePreset] = useState(settings.themePreset);
  const [overrides, setOverrides] = useState<Partial<VoiceTheme>>({});

  const theme = useMemo(() => resolveTheme(themePreset, overrides), [themePreset, overrides]);
  const contrast = useMemo(() => themeContrast(theme), [theme]);

  const set = (key: keyof typeof v, value: string): void => setV((prev) => ({ ...prev, [key]: value }));

  async function save(payload: Record<string, unknown>, key: string): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch('/api/voice/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not save.');
      setSaved(key);
      window.setTimeout(() => setSaved(null), 2500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  }

  const savedMark = (key: string) =>
    saved === key ? <span className="vaMuted" style={{ fontSize: '0.6875rem' }}>Saved</span> : null;

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {/* ── WHAT CLIENTS SEE ── */}
      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">You, on the site</h2>
          {savedMark('identity')}
        </div>

        <div className="vaFieldRow vaFieldRow2">
          <Field id="artistName" label="Your name">
            <input className="vaInput" value={v.artistName} onChange={(e) => set('artistName', e.target.value)} />
          </Field>
          <Field id="tagline" label="What you do" hint="Appears beside your name in the header.">
            <input className="vaInput" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </Field>
        </div>

        <div className="vaFieldRow vaFieldRow2">
          <Field id="email" label="Email" hint="Shown in the footer so people can reach you directly.">
            <input type="email" className="vaInput" value={v.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field id="phone" label="Phone">
            <input type="tel" className="vaInput" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <Field id="location" label="Where you are">
          <input className="vaInput" value={v.location} onChange={(e) => set('location', e.target.value)} />
        </Field>

        <Field id="shortBio" label="Short bio" hint="Used on the home page and in link previews.">
          <textarea className="vaTextarea" rows={4} value={v.shortBio} onChange={(e) => set('shortBio', e.target.value)} />
        </Field>

        <div className="vaFieldRow vaFieldRow2">
          <Field id="heroPhotoId" label="Home page background photo">
            <select className="vaSelect" value={v.heroPhotoId} onChange={(e) => set('heroPhotoId', e.target.value)}>
              {ANDREW_PHOTOS.map((p) => (
                <option key={p.id} value={p.id}>{p.id}</option>
              ))}
            </select>
          </Field>
          <Field id="portraitPhotoId" label="Inset portrait">
            <select className="vaSelect" value={v.portraitPhotoId} onChange={(e) => set('portraitPhotoId', e.target.value)}>
              {ANDREW_PHOTOS.map((p) => (
                <option key={p.id} value={p.id}>{p.id}</option>
              ))}
            </select>
          </Field>
        </div>

        <button
          type="button"
          className="vaBtn vaBtnSolid vaBtnSm"
          disabled={busy === 'identity'}
          onClick={() =>
            void save(
              {
                artistName: v.artistName,
                tagline: v.tagline,
                email: v.email,
                phone: v.phone,
                location: v.location,
                shortBio: v.shortBio,
                heroPhotoId: v.heroPhotoId,
                portraitPhotoId: v.portraitPhotoId,
              },
              'identity',
            )
          }
        >
          {busy === 'identity' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
          Save
        </button>
      </div>

      {/* ── THEME ── */}
      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Colours</h2>
          {savedMark('theme')}
        </div>

        <div className="vaThemeGrid">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`vaThemeCard${themePreset === p.id ? ' vaThemeCardActive' : ''}`}
              onClick={() => {
                setThemePreset(p.id);
                // Overrides are cleared when switching preset. Carrying a hand-picked gold onto the
                // light theme is how someone ends up with unreadable text and no idea why.
                setOverrides({});
              }}
            >
              <span className="vaThemeSwatches" aria-hidden>
                <span style={{ background: p.theme.ink }} />
                <span style={{ background: p.theme.surface }} />
                <span style={{ background: p.theme.accent }} />
                <span style={{ background: p.theme.text }} />
              </span>
              <span className="vaThemeName">{p.label}</span>
              <span className="vaThemeBlurb">{p.blurb}</span>
            </button>
          ))}
        </div>

        <details className="vaGuideSection" style={{ marginTop: 16, background: 'var(--va-ink)' }}>
          <summary className="vaGuideSummary" style={{ padding: '13px 15px' }}>
            <span className="vaGuideSummaryText">
              <span className="vaGuideSectionTitle" style={{ fontSize: '0.9375rem' }}>Change individual colours</span>
              <span className="vaGuideSectionSummary">Only if you want to. The presets are all checked for readability.</span>
            </span>
          </summary>
          <div style={{ padding: '4px 15px 18px' }}>
            {TOKEN_LABELS.map(({ key, label }) => (
              <div key={key} className="vaColorRow">
                <label htmlFor={`va-th-${key}`}>{label}</label>
                <input
                  id={`va-th-${key}`}
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(theme[key]) ? theme[key] : '#000000'}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
                />
                <code>{theme[key]}</code>
                {overrides[key] && (
                  <button
                    type="button"
                    onClick={() =>
                      setOverrides((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                  >
                    reset
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>

        {!contrast.passesAA && (
          <div className="vaNotice vaNoticeBad" style={{ marginTop: 14 }} role="alert">
            <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={15} aria-hidden /> Some of this will be hard to read
            </strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {contrast.warnings.map((w) => (
                <li key={w} style={{ fontSize: '0.875rem', marginBottom: 4 }}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="vaStudioActions">
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            disabled={busy === 'theme'}
            onClick={() => void save({ themePreset, theme: overrides }, 'theme')}
          >
            {busy === 'theme' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
            Save colours
          </button>
          <span className="vaMuted" style={{ fontSize: '0.75rem' }}>
            Body text {contrast.bodyText?.toFixed(1) ?? '—'}:1 · accent {contrast.accentOnInk?.toFixed(1) ?? '—'}:1
          </span>
        </div>
      </div>

      {/* ── PAPERWORK ── */}
      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Invoices and agreements</h2>
          {savedMark('business')}
        </div>

        <div className="vaFieldRow vaFieldRow2">
          <Field id="businessName" label="Business name" hint="Appears on invoices and contracts.">
            <input className="vaInput" value={v.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          <Field id="invoicePrefix" label="Invoice prefix" hint="Invoices are numbered PREFIX-YEAR-001.">
            <input className="vaInput" value={v.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} />
          </Field>
        </div>

        <Field id="businessAddress" label="Business address">
          <textarea className="vaTextarea" rows={3} value={v.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} />
        </Field>

        <Field id="invoiceTermsDays" label="Payment terms (days)" hint="How long after issue an invoice is due.">
          <input className="vaInput" inputMode="numeric" value={v.invoiceTermsDays} onChange={(e) => set('invoiceTermsDays', e.target.value)} />
        </Field>

        <Field id="invoiceFooter" label="Invoice footer" hint="Bank details, thank-you note — whatever should be on every invoice.">
          <textarea className="vaTextarea" rows={3} value={v.invoiceFooter} onChange={(e) => set('invoiceFooter', e.target.value)} />
        </Field>

        <button
          type="button"
          className="vaBtn vaBtnSolid vaBtnSm"
          disabled={busy === 'business'}
          onClick={() =>
            void save(
              {
                businessName: v.businessName,
                businessAddress: v.businessAddress,
                invoicePrefix: v.invoicePrefix,
                invoiceTermsDays: Number(v.invoiceTermsDays),
                invoiceFooter: v.invoiceFooter,
              },
              'business',
            )
          }
        >
          {busy === 'business' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
          Save
        </button>
      </div>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="vaField">
      <label className="vaLabel" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="vaHint">{hint}</p>}
    </div>
  );
}
