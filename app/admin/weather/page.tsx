// app/admin/weather/page.tsx
//
// weather-page-2026-06-21 — dedicated weather view the hub-widget
// daily cards route to when the user clicks one. Consumes the same
// /api/admin/weather endpoint that powers the widget so the data
// shape stays in lock-step; the page just shows MORE of it (full 5-
// day strip with description + severity advice + a hi/lo bar +
// a "see full hourly forecast on weather.gov" link out per location).
//
// `?date=YYYY-MM-DD` highlights + scrolls to that day so clicking
// "Mon" on the widget lands at the Monday card opened. Defaults to
// today's date.
//
// `?zip=78701` reads through to the API so the user can override
// the location without leaving the page.

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { buildDayTooltip, computeDaySeverity, type WeatherSeverity } from '@/lib/weather/severity';

interface WeatherDay {
  date: string;
  high_f: number;
  low_f: number;
  description: string;
  icon: string;
  code?: number;
  rain_chance_pct?: number | null;
  wind_mph?: number | null;
  wind_gust_mph?: number | null;
  feels_like_max_f?: number | null;
  feels_like_min_f?: number | null;
  humidity_max_pct?: number | null;
}

interface WeatherSnapshot {
  temperature_f: number;
  description: string;
  icon: string;
  high_f: number;
  low_f: number;
  location_label: string;
  daily?: WeatherDay[];
  feels_like_f?: number | null;
  humidity_pct?: number | null;
  rain_chance_pct?: number | null;
  wind_mph?: number | null;
}

export default function WeatherPage(): React.ReactElement {
  const { data: session, status } = useSession();
  const search = useSearchParams();
  const focusDate = search.get('date') ?? '';
  const zip = search.get('zip') ?? '';

  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('location', zip ? 'manual' : 'auto');
      if (zip) params.set('zip', zip);
      const res = await fetch(`/api/admin/weather?${params}`);
      if (res.status === 204) { setSnapshot(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnapshot(await res.json() as WeatherSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weather.');
    } finally {
      setLoading(false);
    }
  }, [zip]);

  useEffect(() => {
    if (status === 'authenticated') void fetchWeather();
  }, [status, fetchWeather]);

  // Scroll the focused day into view once the data lands.
  useEffect(() => {
    if (!snapshot || !focusDate) return;
    const el = document.getElementById(`weather-day-${focusDate}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [snapshot, focusDate]);

  const currentSeverity: WeatherSeverity | null = useMemo(() => {
    if (!snapshot) return null;
    // Render the current-day advice when one applies.
    const today = snapshot.daily?.[0];
    if (!today) return null;
    return computeDaySeverity({
      code: today.code,
      high_f: today.high_f,
      low_f: today.low_f,
      feels_like_max_f: today.feels_like_max_f,
      feels_like_min_f: today.feels_like_min_f,
      humidity_max_pct: today.humidity_max_pct,
      rain_chance_pct: today.rain_chance_pct,
      wind_mph: today.wind_mph,
      wind_gust_mph: today.wind_gust_mph,
    });
  }, [snapshot]);

  if (status === 'loading') return <Shell><p style={styles.muted}>Loading session&hellip;</p></Shell>;
  if (status === 'unauthenticated' || !session?.user) {
    return (
      <Shell>
        <Gate
          title="Sign in required"
          body="The weather page is signed-in-only."
          actionHref="/api/auth/signin"
          actionLabel="Sign in"
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <header style={styles.header}>
        <Link href="/admin/me" style={styles.back}>&larr; Back to hub</Link>
        <h1 style={styles.h1}>Weather</h1>
        {snapshot && (
          <p style={styles.subtitle}>{snapshot.location_label}</p>
        )}
      </header>

      {error && <div style={styles.errorBanner} role="alert">{error}</div>}

      {loading && !snapshot && <p style={styles.muted}>Loading forecast&hellip;</p>}

      {!loading && !snapshot && !error && (
        <div style={styles.gate}>
          <h2 style={styles.gateTitle}>Forecast unavailable</h2>
          <p style={styles.gateBody}>
            We couldn&rsquo;t reach the forecast service right now. The widget shows the
            last known good data; refresh in a few minutes to retry.
          </p>
        </div>
      )}

      {snapshot && (
        <>
          {/* ── Current conditions hero ──────────────────────── */}
          <section style={styles.hero}>
            <div style={styles.heroLeft}>
              <span aria-hidden style={styles.heroIcon}>{snapshot.icon}</span>
              <div>
                <div style={styles.heroTemp}>{Math.round(snapshot.temperature_f)}&deg;</div>
                <div style={styles.heroDesc}>{snapshot.description}</div>
                <div style={styles.heroMeta}>
                  H {Math.round(snapshot.high_f)}&deg; / L {Math.round(snapshot.low_f)}&deg;
                </div>
              </div>
            </div>
            <div style={styles.heroChips}>
              {snapshot.feels_like_f != null && (
                <Chip icon="🌡️" label={`Feels ${Math.round(snapshot.feels_like_f)}°`} />
              )}
              {snapshot.humidity_pct != null && (
                <Chip icon="💧" label={`${snapshot.humidity_pct}% humidity`} />
              )}
              {snapshot.rain_chance_pct != null && (
                <Chip icon="🌧️" label={`${snapshot.rain_chance_pct}% rain today`} />
              )}
              {snapshot.wind_mph != null && snapshot.wind_mph >= 5 && (
                <Chip icon="🌬️" label={`${snapshot.wind_mph} mph wind`} />
              )}
            </div>
          </section>

          {/* ── Severity advisory (when one applies) ─────────── */}
          {currentSeverity && (
            <section style={{ ...styles.advisory, borderColor: '#FCA5A5', background: '#FEF2F2' }}>
              <span aria-hidden style={{ fontSize: '1.6rem' }}>{currentSeverity.icon}</span>
              <div>
                <div style={styles.advisoryLabel}>{currentSeverity.label}</div>
                <div style={styles.advisoryAdvice}>{currentSeverity.advice}</div>
              </div>
            </section>
          )}

          {/* ── Full forecast cards ──────────────────────────── */}
          <h2 style={styles.h2}>5-day forecast</h2>
          <div style={styles.forecastGrid}>
            {(snapshot.daily ?? []).map((d) => {
              const severity = computeDaySeverity({
                code: d.code,
                high_f: d.high_f,
                low_f: d.low_f,
                feels_like_max_f: d.feels_like_max_f,
                feels_like_min_f: d.feels_like_min_f,
                humidity_max_pct: d.humidity_max_pct,
                rain_chance_pct: d.rain_chance_pct,
                wind_mph: d.wind_mph,
                wind_gust_mph: d.wind_gust_mph,
              });
              const tooltip = buildDayTooltip({
                date: d.date,
                description: d.description,
                code: d.code,
                high_f: d.high_f,
                low_f: d.low_f,
                feels_like_max_f: d.feels_like_max_f,
                feels_like_min_f: d.feels_like_min_f,
                humidity_max_pct: d.humidity_max_pct,
                rain_chance_pct: d.rain_chance_pct,
                wind_mph: d.wind_mph,
                wind_gust_mph: d.wind_gust_mph,
              });
              const isFocused = d.date === focusDate;
              return (
                <article
                  key={d.date}
                  id={`weather-day-${d.date}`}
                  data-focused={isFocused ? 'true' : undefined}
                  style={{
                    ...styles.dayCard,
                    ...(isFocused ? styles.dayCardFocused : null),
                    ...(severity ? styles.dayCardSevere : null),
                  }}
                  title={tooltip}
                >
                  <div style={styles.dayHeader}>
                    <span style={styles.dayWeekday}>
                      {new Date(d.date).toLocaleDateString(undefined, {
                        weekday: 'long',
                      })}
                    </span>
                    <span style={styles.dayDate}>
                      {new Date(d.date).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric',
                      })}
                    </span>
                    {severity && (
                      <span
                        aria-hidden
                        style={styles.daySeverityBadge}
                        title={`${severity.label}: ${severity.advice}`}
                      >
                        {severity.icon}
                      </span>
                    )}
                  </div>

                  <div style={styles.dayBody}>
                    <span aria-hidden style={styles.dayIcon}>{d.icon}</span>
                    <div>
                      <div style={styles.dayDesc}>{d.description}</div>
                      <div style={styles.dayTemps}>
                        <strong>{Math.round(d.high_f)}&deg;</strong>
                        {' / '}
                        <span>{Math.round(d.low_f)}&deg;</span>
                      </div>
                    </div>
                  </div>

                  <div style={styles.dayStats}>
                    {d.feels_like_max_f != null && (
                      <Chip icon="🌡️" label={`Feels ${Math.round(d.feels_like_max_f)}°`} small />
                    )}
                    {d.humidity_max_pct != null && (
                      <Chip icon="💧" label={`${Math.round(d.humidity_max_pct)}% hum`} small />
                    )}
                    {d.rain_chance_pct != null && (
                      <Chip icon="🌧️" label={`${d.rain_chance_pct}% rain`} small />
                    )}
                    {d.wind_mph != null && d.wind_mph >= 5 && (
                      <Chip icon="🌬️" label={`${d.wind_mph} mph${d.wind_gust_mph ? ` (gusts ${d.wind_gust_mph})` : ''}`} small />
                    )}
                  </div>

                  {severity && (
                    <div style={styles.daySeverityAdvice}>
                      <strong>{severity.label}.</strong> {severity.advice}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <footer style={styles.footer}>
            <p style={styles.muted}>
              Source: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (free,
              keyless, WMO weather codes). For radar + watches/warnings, see{' '}
              <a
                href="https://forecast.weather.gov/MapClick.php?lat=30.5&lon=-97.5"
                target="_blank"
                rel="noopener noreferrer"
              >weather.gov</a>.
            </p>
          </footer>
        </>
      )}
    </Shell>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function Chip({ icon, label, small }: { icon: string; label: string; small?: boolean }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: small ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: '#F3F4F6',
        color: '#374151',
        whiteSpace: 'nowrap',
        fontSize: small ? '0.74rem' : '0.85rem',
      }}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return <main style={styles.shell}>{children}</main>;
}

function Gate({
  title, body, actionHref, actionLabel,
}: {
  title: string; body: string; actionHref?: string; actionLabel?: string;
}): React.ReactElement {
  return (
    <div style={styles.gate}>
      <h2 style={styles.gateTitle}>{title}</h2>
      <p style={styles.gateBody}>{body}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} style={styles.gateAction}>{actionLabel}</Link>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 980, margin: '0 auto', padding: '1.5rem 1.25rem',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#0F1419',
  },
  header: { marginBottom: '1.25rem' },
  back: { color: '#6B7280', textDecoration: 'none', fontSize: '0.85rem' },
  h1: { fontFamily: 'Sora, sans-serif', fontSize: '1.7rem', margin: '0.4rem 0 0.2rem', fontWeight: 600 },
  h2: { fontFamily: 'Sora, sans-serif', fontSize: '1.05rem', margin: '1.25rem 0 0.6rem', fontWeight: 600 },
  subtitle: { color: '#6B7280', margin: 0, fontSize: '0.92rem' },
  muted: { color: '#6B7280', fontSize: '0.9rem' },
  errorBanner: {
    background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B',
    padding: '0.75rem 1rem', borderRadius: 8, margin: '0 0 1rem', fontSize: '0.88rem',
  },

  hero: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
    flexWrap: 'wrap',
    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14,
    padding: '1.25rem 1.5rem',
  },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  heroIcon: { fontSize: '3.5rem', lineHeight: 1 },
  heroTemp: { fontFamily: 'Sora, sans-serif', fontSize: '2.4rem', fontWeight: 700, lineHeight: 1 },
  heroDesc: { fontSize: '1rem', color: '#374151', marginTop: 4 },
  heroMeta: { fontSize: '0.85rem', color: '#6B7280', marginTop: 2 },
  heroChips: { display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: '0.85rem' },

  advisory: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '0.85rem 1rem',
    border: '1px solid', borderRadius: 10,
    margin: '0.85rem 0',
  },
  advisoryLabel: { fontWeight: 600, fontSize: '0.95rem' },
  advisoryAdvice: { color: '#7F1D1D', fontSize: '0.85rem', marginTop: 2 },

  forecastGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  },
  dayCard: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    padding: '0.85rem 1rem',
    display: 'flex', flexDirection: 'column', gap: 8,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  dayCardFocused: {
    borderColor: '#1D3095',
    boxShadow: '0 0 0 3px rgba(29, 48, 149, 0.12)',
  },
  dayCardSevere: {
    background: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  dayHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  dayWeekday: { fontFamily: 'Sora, sans-serif', fontWeight: 600, fontSize: '0.95rem' },
  dayDate: { fontSize: '0.78rem', color: '#6B7280' },
  daySeverityBadge: { marginLeft: 'auto', fontSize: '1.1rem' },
  dayBody: { display: 'flex', alignItems: 'center', gap: 10 },
  dayIcon: { fontSize: '2.2rem', lineHeight: 1 },
  dayDesc: { fontSize: '0.88rem', color: '#374151' },
  dayTemps: { fontSize: '0.92rem', color: '#1F2937', marginTop: 2 },
  dayStats: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  daySeverityAdvice: {
    fontSize: '0.78rem', color: '#7C2D12',
    borderTop: '1px solid #FED7AA', paddingTop: 6, marginTop: 4, lineHeight: 1.4,
  },

  footer: { marginTop: '1.5rem' },

  gate: {
    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '2rem',
    maxWidth: 520, margin: '3rem auto', textAlign: 'center',
  },
  gateTitle: { fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', margin: '0 0 0.6rem' },
  gateBody: { color: '#4B5563', lineHeight: 1.6, margin: '0 0 0.85rem' },
  gateAction: {
    display: 'inline-block', background: '#1D3095', color: '#FFFFFF',
    padding: '0.55rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.92rem',
  },
};
