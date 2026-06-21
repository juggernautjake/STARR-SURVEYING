'use client';
// app/admin/profile/ProfilePanel.tsx
//
// Extracted body of the legacy /admin/profile page so it can be reused
// inside the Hub's `?tab=profile` body (admin-nav redesign Phase 2
// slice 2b). The legacy route at /admin/profile re-exports this same
// component until slice 2c lands the redirect to /admin/me?tab=profile.

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { X } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import { ThemePicker } from './components/ThemePicker';
import { DensityPicker } from './components/DensityPicker';
import { FontScaleSlider } from './components/FontScaleSlider';
import type { Density, HubLayoutRow, ThemeId } from '@/lib/hub/types';

interface Profile {
  user_name: string; job_title: string; hire_date: string | null;
  hourly_rate: number; is_active: boolean; available_balance: number;
  /** Slice EP1 — personal info. All four fields are optional; the
   *  card renders "Not set" placeholders when empty. */
  date_of_birth?: string | null;
  gender?: string | null;
  pronouns?: string | null;
  bio?: string | null;
}
interface Cert { id: string; certification_name: string; certification_type: string; issued_date: string; expiry_date: string | null; pay_bump_amount: number; }
interface ProfileChange { change_type: string; title: string; description: string; old_value: string; new_value: string; created_at: string; }
interface LearningCredit { entity_label: string; points_earned: number; earned_at: string; }

/** Slice EP2b — contact-method row served by
 *  /api/admin/profile/contact-methods. */
interface ContactMethod {
  id: string;
  user_email: string;
  kind: 'phone' | 'email' | 'address';
  value: string;
  label: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '—';
const fmtCurrency = (n: number) => '$' + (n || 0).toFixed(2);

/** Slice EP6 — convert a bigint-cents value to a `$X,XXX.XX`
 *  string. Returns "—" when the value is null/undefined so an
 *  empty bonus row doesn't blow the UI with NaN. Pure +
 *  exported for the test suite. */
export function fmtCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Slice EP1 — derive age from a DOB string (`YYYY-MM-DD` or full
 *  ISO). Returns null when the input is missing or unparseable. The
 *  365.25 factor handles leap years; we floor so a birthday in the
 *  future doesn't yield a fractional age. Pure + exported so the
 *  test suite can pin the contract. */
export function deriveAge(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (!Number.isFinite(t)) return null;
  const years = (now.getTime() - t) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0) return null;
  return Math.floor(years);
}

type Tab = 'info' | 'credentials' | 'credits' | 'changes' | 'themes';

export default function ProfilePanel() {
  const { data: session } = useSession();
  const { safeFetch, reportPageError } = usePageError('ProfilePanel');
  const email = session?.user?.email || '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [changes, setChanges] = useState<ProfileChange[]>([]);
  const [credits, setCredits] = useState<LearningCredit[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  // Deep-link support: /admin/me?tab=profile&sub=themes opens the themes
  // sub-tab directly (the hub uses ?tab= for its own tab, so the profile
  // panel reads ?sub= for its inner tab). Falls back to 'info'.
  const searchParams = useSearchParams();
  const subParam = searchParams?.get('sub');
  const initialTab: Tab = (subParam === 'credentials' || subParam === 'credits' || subParam === 'changes' || subParam === 'themes')
    ? subParam
    : 'info';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [hubLayout, setHubLayout] = useState<HubLayoutRow | null>(null);
  // Slice EP3 — avatar upload state. `liveAvatarUrl` overrides
  // `session.user.image` after a successful upload so the user
  // sees their new photo without a full page reload; null falls
  // through to the session value.
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Slice EP1 — personal-info card edit state.
  const [personalEditing, setPersonalEditing] = useState(false);
  const [personalDraft, setPersonalDraft] = useState<{
    date_of_birth: string;
    gender: string;
    pronouns: string;
    bio: string;
  }>({ date_of_birth: '', gender: '', pronouns: '', bio: '' });
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  // Slice EP2b — contact methods state. Loaded from
  // /api/admin/profile/contact-methods on mount; CRUD via the
  // inline add form + per-row delete + primary-toggle controls.
  const [contacts, setContacts] = useState<ContactMethod[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactDraft, setContactDraft] = useState<{
    kind: 'phone' | 'email' | 'address';
    value: string;
    label: string;
    is_primary: boolean;
  }>({ kind: 'phone', value: '', label: '', is_primary: false });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  // Slice EP4 — gallery state. Holds the rows loaded from
  // /api/admin/profile/images + an in-flight upload draft.
  const [images, setImages] = useState<Array<{
    id: string; image_url: string; caption: string | null; sort_order: number;
  }>>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState('');
  // Slice EP5 — "Jobs I've worked on" state. Sourced from
  // /api/admin/profile/jobs which collapses job_team rows by
  // job_id and orders by most-recent assignment first.
  const [workedJobs, setWorkedJobs] = useState<Array<{
    job_id: string;
    job_name: string | null;
    job_number: string | null;
    stage: string | null;
    address: string | null;
    is_crew_lead: boolean;
    state: string | null;
    assigned_from: string | null;
  }>>([]);
  const [workedJobsLoading, setWorkedJobsLoading] = useState(false);
  // Slice EP6 — compensation panel: current rate + history +
  // bonuses + recent payouts. Surfaced on the signed-in user's
  // own profile (or by admins / payroll roles when they're
  // viewing someone else later — EP7b).
  const [compensation, setCompensation] = useState<{
    salary_history: Array<{
      id: string;
      base_hourly_rate_cents: number | null;
      base_annual_salary_cents: number | null;
      effective_from: string;
      effective_to: string | null;
      change_reason: string | null;
    }>;
    bonuses: Array<{
      id: string;
      amount_cents: number;
      reason: string;
      awarded_at: string;
    }>;
    payouts: Array<{
      id: string;
      period_start: string;
      period_end: string;
      gross_cents: number;
      net_cents: number;
      paid_at: string;
      method: string;
    }>;
  }>({ salary_history: [], bonuses: [], payouts: [] });
  const [compensationLoading, setCompensationLoading] = useState(false);

  const fetchCompensation = useCallback(async () => {
    if (!email) return;
    setCompensationLoading(true);
    try {
      const res = await fetch(`/api/admin/profile/compensation?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as typeof compensation;
      setCompensation(data);
    } catch {
      /* swallow — the card just renders the empty state */
    } finally {
      setCompensationLoading(false);
    }
  }, [email]);

  useEffect(() => { void fetchCompensation(); }, [fetchCompensation]);

  const fetchWorkedJobs = useCallback(async () => {
    if (!email) return;
    setWorkedJobsLoading(true);
    try {
      const res = await fetch(`/api/admin/profile/jobs?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { jobs: typeof workedJobs };
      setWorkedJobs(data.jobs ?? []);
    } catch {
      /* swallow — card just shows the empty state */
    } finally {
      setWorkedJobsLoading(false);
    }
  }, [email]);

  useEffect(() => { void fetchWorkedJobs(); }, [fetchWorkedJobs]);

  const fetchImages = useCallback(async () => {
    if (!email) return;
    setImagesLoading(true);
    try {
      const res = await fetch(`/api/admin/profile/images?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { images: typeof images };
      setImages(data.images ?? []);
    } catch {
      /* swallow — UI just renders the empty state */
    } finally {
      setImagesLoading(false);
    }
  }, [email]);

  useEffect(() => { void fetchImages(); }, [fetchImages]);

  const fetchContacts = useCallback(async () => {
    if (!email) return;
    setContactsLoading(true);
    try {
      const res = await fetch(`/api/admin/profile/contact-methods?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { contacts: ContactMethod[] };
      setContacts(data.contacts ?? []);
    } catch {
      /* swallow — section just renders empty + the add form still works */
    } finally {
      setContactsLoading(false);
    }
  }, [email]);

  useEffect(() => { void fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    if (!email) return;
    async function loadProfile() {
      try {
        setLoading(true);
        const profileData = await safeFetch<{ profile: Profile; certifications: Cert[]; exists: boolean }>(
          `/api/admin/payroll/employees?email=${encodeURIComponent(email)}`
        );
        if (profileData?.profile) {
          setProfile(profileData.profile);
          setCerts(profileData.certifications || []);
        }

        // Load profile changes and learning credits from employee-accessible endpoint
        try {
          const myData = await safeFetch<{ profile_changes: ProfileChange[]; employee_credits: LearningCredit[]; total_points: number }>(
            '/api/admin/profile/changes'
          );
          if (myData) {
            setChanges(myData.profile_changes || []);
            setCredits(myData.employee_credits || []);
            setTotalPoints(myData.total_points || 0);
          }
        } catch { /* ignore */ }
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error('Load failed'));
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [email, safeFetch, reportPageError]);

  useEffect(() => {
    // Hub layout fetch is best-effort — if it fails the picker falls
    // back to the starr-default theme and the user can still browse the
    // other profile tabs.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/me/hub-layout', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { layout: HubLayoutRow | null };
        if (!cancelled) setHubLayout(data.layout);
      } catch {
        /* swallow — picker handles the null case */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!session?.user) return null;
  const { name, image, role } = session.user;
  const roles = session.user.roles || ['employee'];

  if (loading) return <div className="tl-loading">Loading profile...</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Profile' },
    { key: 'credentials', label: 'Credentials' },
    { key: 'credits', label: 'Learning Credits' },
    { key: 'changes', label: 'Recent Changes' },
    { key: 'themes', label: 'Themes' },
  ];

  const initialThemeId: ThemeId = hubLayout?.theme ?? 'starr-default';
  const initialDensity: Density = hubLayout?.density ?? 'comfortable';
  const initialFontScale: number = hubLayout?.fontScale ?? 1.0;

  return (
    <div className="profile-page">
      {/* Header card */}
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <div className="profile-page__header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          {/* Slice EP3 — clickable avatar that triggers a file
              picker. After a successful upload the new public
              URL takes over via `liveAvatarUrl` so the user sees
              the change immediately. */}
          <label
            data-testid="profile-avatar-change"
            title="Change profile photo"
            style={{ position: 'relative', display: 'inline-block', cursor: avatarSaving ? 'progress' : 'pointer' }}
          >
            {(liveAvatarUrl ?? image) ? (
              <Image
                src={(liveAvatarUrl ?? image) as string}
                alt={name || 'User'}
                width={64}
                height={64}
                unoptimized
                className="profile-page__avatar"
                style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #E5E7EB', objectFit: 'cover' }}
              />
            ) : (
              <div className="profile-page__avatar" style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-brand-red)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sora,sans-serif', fontSize: '1.25rem', fontWeight: 700 }}>
                {(name || 'U').charAt(0)}
              </div>
            )}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.45)',
                color: '#FFFFFF',
                fontSize: '0.7rem',
                fontWeight: 600,
                opacity: 0,
                transition: 'opacity 120ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
              className="profile-page__avatar-hover"
            >
              {avatarSaving ? 'Saving…' : 'Change'}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              data-testid="profile-avatar-input"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setAvatarError(null);
                setAvatarSaving(true);
                try {
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
                    reader.readAsDataURL(file);
                  });
                  const res = await fetch('/api/admin/profile/avatar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                  }
                  const data = await res.json() as { avatar_url: string };
                  setLiveAvatarUrl(data.avatar_url);
                } catch (err) {
                  setAvatarError(err instanceof Error ? err.message : 'Could not upload.');
                } finally {
                  setAvatarSaving(false);
                }
              }}
            />
          </label>
          <div>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.2rem', fontWeight: 700, color: '#0F1419' }}>{name}</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280' }}>{email}</div>
            {avatarError && (
              <div role="alert" data-testid="profile-avatar-error" style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{avatarError}</div>
            )}
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {roles.map(r => (
                <span key={r} className={`admin-topbar__role-badge admin-topbar__role-badge--${r}`} style={{ display: 'inline-flex' }}>{r.replace('_', ' ')}</span>
              ))}
            </div>
          </div>
        </div>
        {profile && (
          <div className="profile-page__stats" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>HOURLY RATE</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand-navy)' }}>{fmtCurrency(profile.hourly_rate)}/hr</span></div>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>LEARNING CREDITS</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand-navy)' }}>{totalPoints}</span></div>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>CREDENTIALS</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand-navy)' }}>{certs.length}</span></div>
            {profile.hire_date && <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>HIRE DATE</span><span style={{ fontSize: '0.9rem', color: '#374151' }}>{fmtDate(profile.hire_date)}</span></div>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="emp-manage__tabs">
        {tabs.map(t => (
          <button key={t.key} className={`emp-manage__tab ${tab === t.key ? 'emp-manage__tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile Info */}
      {tab === 'info' && (
        <>
        <div className="admin-card">
          <div className="emp-manage__field"><label>Name</label><span>{profile?.user_name || name || '—'}</span></div>
          <div className="emp-manage__field"><label>Email</label><span>{email}</span></div>
          <div className="emp-manage__field"><label>Role</label><span>{profile?.job_title || role}</span></div>
          <div className="emp-manage__field"><label>Authentication</label><span>Google Workspace (@starr-surveying.com)</span></div>
          <div className="emp-manage__field"><label>Status</label><span style={{ color: profile?.is_active !== false ? '#059669' : 'var(--color-error)' }}>{profile?.is_active !== false ? 'Active' : 'Inactive'}</span></div>
          {profile?.available_balance !== undefined && (
            <div className="emp-manage__field"><label>Available Balance</label><span>{fmtCurrency(profile.available_balance)}</span></div>
          )}
        </div>

        {/* Slice EP1 — Personal info card. View / edit toggle so
            the surveyor can fill in DOB / gender / pronouns / bio
            without leaving the page. */}
        <div className="admin-card" data-testid="profile-personal-info" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>Personal info</strong>
            {!personalEditing && (
              <button
                type="button"
                className="admin-btn admin-btn--secondary admin-btn--sm"
                data-testid="profile-personal-edit"
                onClick={() => {
                  setPersonalDraft({
                    date_of_birth: profile?.date_of_birth ?? '',
                    gender: profile?.gender ?? '',
                    pronouns: profile?.pronouns ?? '',
                    bio: profile?.bio ?? '',
                  });
                  setPersonalError(null);
                  setPersonalEditing(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
          {!personalEditing ? (
            <>
              <div className="emp-manage__field">
                <label>Date of birth</label>
                <span data-testid="profile-personal-dob">
                  {profile?.date_of_birth ? fmtDate(profile.date_of_birth) : 'Not set'}
                </span>
              </div>
              <div className="emp-manage__field">
                <label>Age</label>
                <span data-testid="profile-personal-age">
                  {(() => {
                    const age = deriveAge(profile?.date_of_birth);
                    return age == null ? 'Not set' : `${age} years`;
                  })()}
                </span>
              </div>
              <div className="emp-manage__field">
                <label>Gender</label>
                <span data-testid="profile-personal-gender">
                  {profile?.gender?.trim() || 'Not set'}
                </span>
              </div>
              <div className="emp-manage__field">
                <label>Pronouns</label>
                <span data-testid="profile-personal-pronouns">
                  {profile?.pronouns?.trim() || 'Not set'}
                </span>
              </div>
              <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <label>About me</label>
                <p data-testid="profile-personal-bio" style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>
                  {profile?.bio?.trim() || 'Not set'}
                </p>
              </div>
            </>
          ) : (
            <form
              data-testid="profile-personal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setPersonalSaving(true);
                setPersonalError(null);
                try {
                  const res = await fetch('/api/admin/payroll/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      user_email: email,
                      date_of_birth: personalDraft.date_of_birth || null,
                      gender: personalDraft.gender || null,
                      pronouns: personalDraft.pronouns || null,
                      bio: personalDraft.bio || null,
                    }),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const data = await res.json() as { profile: Profile };
                  setProfile((cur) => cur ? { ...cur, ...data.profile } : data.profile);
                  setPersonalEditing(false);
                } catch (err) {
                  setPersonalError(err instanceof Error ? err.message : 'Could not save.');
                } finally {
                  setPersonalSaving(false);
                }
              }}
            >
              <div className="emp-manage__field">
                <label htmlFor="profile-personal-dob-input">Date of birth</label>
                <input
                  id="profile-personal-dob-input"
                  type="date"
                  value={personalDraft.date_of_birth}
                  onChange={(e) => setPersonalDraft((d) => ({ ...d, date_of_birth: e.target.value }))}
                />
              </div>
              <div className="emp-manage__field">
                <label htmlFor="profile-personal-gender-input">Gender</label>
                <input
                  id="profile-personal-gender-input"
                  type="text"
                  placeholder="Free-form (e.g. Woman, Man, Non-binary…)"
                  value={personalDraft.gender}
                  onChange={(e) => setPersonalDraft((d) => ({ ...d, gender: e.target.value }))}
                />
              </div>
              <div className="emp-manage__field">
                <label htmlFor="profile-personal-pronouns-input">Pronouns</label>
                <input
                  id="profile-personal-pronouns-input"
                  type="text"
                  placeholder="she/her, they/them…"
                  value={personalDraft.pronouns}
                  onChange={(e) => setPersonalDraft((d) => ({ ...d, pronouns: e.target.value }))}
                />
              </div>
              <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <label htmlFor="profile-personal-bio-input">About me</label>
                <textarea
                  id="profile-personal-bio-input"
                  rows={4}
                  placeholder="A short bio for your profile."
                  value={personalDraft.bio}
                  onChange={(e) => setPersonalDraft((d) => ({ ...d, bio: e.target.value }))}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              {personalError && (
                <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.78rem' }}>
                  {personalError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  onClick={() => { setPersonalEditing(false); setPersonalError(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  disabled={personalSaving}
                  data-testid="profile-personal-save"
                >
                  {personalSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Slice EP2b — Contact methods card. Lists existing
            phones / emails / addresses + lets the user add new
            rows + delete + mark a primary per kind. Editing in
            place is deferred to a follow-up; delete + re-add
            covers the same need today. */}
        <div className="admin-card" data-testid="profile-contact-methods" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>Contact methods</strong>
            {contactsLoading && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Loading…</span>
            )}
          </div>
          {(['phone', 'email', 'address'] as const).map((kind) => {
            const rows = contacts.filter((c) => c.kind === kind);
            const label = kind === 'phone' ? 'Phones' : kind === 'email' ? 'Other emails' : 'Addresses';
            return (
              <div
                key={kind}
                className="emp-manage__field"
                data-testid={`profile-contact-group-${kind}`}
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
              >
                <label>{label}</label>
                {rows.length === 0 ? (
                  <span style={{ color: '#6B7280' }}>None added.</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '1rem', width: '100%' }}>
                    {rows.map((c) => (
                      <li
                        key={c.id}
                        data-testid={`profile-contact-row-${c.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
                      >
                        <span style={{ whiteSpace: 'pre-wrap' }}>{c.value}</span>
                        {c.label && <span style={{ color: '#6B7280' }}>· {c.label}</span>}
                        {c.is_primary && (
                          <span style={{ color: 'var(--color-brand-navy)', fontWeight: 600 }}>(primary)</span>
                        )}
                        {!c.is_primary && (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary admin-btn--sm"
                            data-testid={`profile-contact-primary-${c.id}`}
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/admin/profile/contact-methods', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: c.id, is_primary: true }),
                                });
                                if (res.ok) void fetchContacts();
                              } catch { /* ignore */ }
                            }}
                          >
                            Set primary
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          data-testid={`profile-contact-delete-${c.id}`}
                          onClick={async () => {
                            if (!window.confirm('Delete this contact method?')) return;
                            try {
                              const res = await fetch(`/api/admin/profile/contact-methods?id=${encodeURIComponent(c.id)}`, {
                                method: 'DELETE',
                              });
                              if (res.ok) void fetchContacts();
                            } catch { /* ignore */ }
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Add new contact form */}
          <form
            data-testid="profile-contact-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setContactSaving(true);
              setContactError(null);
              try {
                const res = await fetch('/api/admin/profile/contact-methods', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    kind: contactDraft.kind,
                    value: contactDraft.value,
                    label: contactDraft.label || null,
                    is_primary: contactDraft.is_primary,
                  }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({})) as { error?: string };
                  throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                setContactDraft({ kind: contactDraft.kind, value: '', label: '', is_primary: false });
                void fetchContacts();
              } catch (err) {
                setContactError(err instanceof Error ? err.message : 'Could not save.');
              } finally {
                setContactSaving(false);
              }
            }}
            style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px dashed #E5E7EB', paddingTop: '0.75rem' }}
          >
            <strong style={{ fontSize: '0.85rem' }}>Add new</strong>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={contactDraft.kind}
                aria-label="Kind"
                data-testid="profile-contact-add-kind"
                onChange={(e) => setContactDraft((d) => ({ ...d, kind: e.target.value as 'phone' | 'email' | 'address' }))}
                style={{ flex: '0 0 auto' }}
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="address">Address</option>
              </select>
              <input
                type="text"
                placeholder={contactDraft.kind === 'phone' ? '+1 (555) 123-4567' : contactDraft.kind === 'email' ? 'alice@example.com' : '101 Maple St…'}
                value={contactDraft.value}
                aria-label="Value"
                data-testid="profile-contact-add-value"
                onChange={(e) => setContactDraft((d) => ({ ...d, value: e.target.value }))}
                style={{ flex: 1, minWidth: 200 }}
              />
              <input
                type="text"
                placeholder="Label (Mobile, Work…)"
                value={contactDraft.label}
                aria-label="Label"
                data-testid="profile-contact-add-label"
                onChange={(e) => setContactDraft((d) => ({ ...d, label: e.target.value }))}
                style={{ flex: '0 1 180px' }}
              />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151' }}>
              <input
                type="checkbox"
                checked={contactDraft.is_primary}
                onChange={(e) => setContactDraft((d) => ({ ...d, is_primary: e.target.checked }))}
              />
              Make this my primary {contactDraft.kind}
            </label>
            {contactError && (
              <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.78rem', margin: 0 }}>
                {contactError}
              </p>
            )}
            <div>
              <button
                type="submit"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={contactSaving || !contactDraft.value.trim()}
                data-testid="profile-contact-add-submit"
              >
                {contactSaving ? 'Saving…' : 'Add contact'}
              </button>
            </div>
          </form>
        </div>

        {/* Slice EP4 — "About me" gallery. Grid of uploaded images
            with a caption + delete button per row + an upload
            input at the bottom. Storage lands in the public
            user-gallery bucket via /api/admin/profile/images. */}
        <div className="admin-card" data-testid="profile-gallery" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>About-me gallery</strong>
            {imagesLoading && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Loading…</span>
            )}
          </div>
          {images.length === 0 ? (
            <p style={{ color: '#6B7280', margin: 0 }}>No images yet — pick a file below to add one.</p>
          ) : (
            <ul
              data-testid="profile-gallery-grid"
              style={{
                listStyle: 'none', margin: 0, padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.6rem',
              }}
            >
              {images.map((img) => (
                <li
                  key={img.id}
                  data-testid={`profile-gallery-tile-${img.id}`}
                  style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.image_url}
                    alt={img.caption ?? 'Profile gallery image'}
                    style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }}
                  />
                  {img.caption && (
                    <div style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem', color: '#374151' }}>
                      {img.caption}
                    </div>
                  )}
                  <button
                    type="button"
                    data-testid={`profile-gallery-delete-${img.id}`}
                    title="Delete image"
                    onClick={async () => {
                      if (!window.confirm('Delete this image?')) return;
                      try {
                        const res = await fetch(`/api/admin/profile/images?id=${encodeURIComponent(img.id)}`, { method: 'DELETE' });
                        if (res.ok) void fetchImages();
                      } catch { /* ignore */ }
                    }}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      background: 'rgba(15, 23, 42, 0.75)', color: '#FFF',
                      border: 0, borderRadius: '6px',
                      padding: '0.15rem 0.45rem', fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={12} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px dashed #E5E7EB', paddingTop: '0.75rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Add image</strong>
            <input
              type="text"
              placeholder="Optional caption"
              value={imageCaption}
              data-testid="profile-gallery-caption"
              onChange={(e) => setImageCaption(e.target.value)}
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              data-testid="profile-gallery-input"
              disabled={imageUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setImageError(null);
                setImageUploading(true);
                try {
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
                    reader.readAsDataURL(file);
                  });
                  const res = await fetch('/api/admin/profile/images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl, caption: imageCaption || null }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                  }
                  setImageCaption('');
                  void fetchImages();
                } catch (err) {
                  setImageError(err instanceof Error ? err.message : 'Could not upload.');
                } finally {
                  setImageUploading(false);
                }
              }}
            />
            {imageError && (
              <p role="alert" data-testid="profile-gallery-error" style={{ color: 'var(--color-error)', fontSize: '0.78rem', margin: 0 }}>
                {imageError}
              </p>
            )}
            {imageUploading && (
              <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: 0 }}>Uploading…</p>
            )}
          </div>
        </div>

        {/* Slice EP5 — Jobs I've worked on. Sourced from
            /api/admin/profile/jobs (joins job_team + jobs).
            Sorted by latest assignment first; each row links
            to the job's dedicated page. */}
        <div className="admin-card" data-testid="profile-worked-jobs" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>Jobs I&apos;ve worked on</strong>
            {workedJobsLoading && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Loading…</span>
            )}
          </div>
          {workedJobs.length === 0 ? (
            <p style={{ color: '#6B7280', margin: 0 }}>You haven&apos;t been assigned to any jobs yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {workedJobs.map((j) => (
                <li
                  key={j.job_id}
                  data-testid={`profile-worked-job-${j.job_id}`}
                  style={{ borderBottom: '1px solid #F1F5F9', padding: '0.4rem 0' }}
                >
                  <a
                    href={`/admin/jobs/${j.job_id}`}
                    style={{ color: 'var(--color-brand-navy)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {j.job_number ? `${j.job_number} — ` : ''}{j.job_name ?? 'Untitled job'}
                  </a>
                  {j.is_crew_lead && (
                    <span
                      data-testid={`profile-worked-job-${j.job_id}-lead`}
                      style={{ marginLeft: '0.4rem', color: 'var(--color-brand-navy)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      · Crew lead
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', color: '#6B7280', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    {j.stage && <span>{j.stage}</span>}
                    {j.address && <span>· {j.address}</span>}
                    {j.assigned_from && (
                      <span>· Since {new Date(j.assigned_from).toLocaleDateString()}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Slice EP6 — Compensation card. The API is role-gated;
            non-self viewers without a payroll role get a 403,
            so the card simply renders the empty state for them.
            For the surveyor themself it surfaces the current
            rate, recent salary history, bonuses, and last few
            payouts. */}
        <div className="admin-card" data-testid="profile-compensation" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>Compensation</strong>
            {compensationLoading && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Loading…</span>
            )}
          </div>

          {(() => {
            const currentSalary = compensation.salary_history.find((s) => s.effective_to == null)
              ?? compensation.salary_history[0]
              ?? null;
            return (
              <>
                <div className="emp-manage__field" data-testid="profile-compensation-current">
                  <label>Current rate</label>
                  <span>
                    {currentSalary?.base_hourly_rate_cents != null
                      ? `${fmtCents(currentSalary.base_hourly_rate_cents)} / hr`
                      : currentSalary?.base_annual_salary_cents != null
                      ? `${fmtCents(currentSalary.base_annual_salary_cents)} / yr`
                      : 'Not on file'}
                  </span>
                </div>
                {currentSalary?.effective_from && (
                  <div className="emp-manage__field">
                    <label>Effective from</label>
                    <span>{fmtDate(currentSalary.effective_from)}</span>
                  </div>
                )}
              </>
            );
          })()}

          {compensation.salary_history.length > 1 && (
            <div
              className="emp-manage__field"
              data-testid="profile-compensation-history"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
            >
              <label>Salary history</label>
              <ul style={{ margin: 0, paddingLeft: '1rem', width: '100%' }}>
                {compensation.salary_history.slice(1, 6).map((s) => (
                  <li key={s.id}>
                    {fmtDate(s.effective_from)}
                    {' — '}
                    {s.base_hourly_rate_cents != null
                      ? `${fmtCents(s.base_hourly_rate_cents)}/hr`
                      : s.base_annual_salary_cents != null
                      ? `${fmtCents(s.base_annual_salary_cents)}/yr`
                      : '—'}
                    {s.change_reason && <span style={{ color: '#6B7280' }}> · {s.change_reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div
            className="emp-manage__field"
            data-testid="profile-compensation-bonuses"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
          >
            <label>Bonuses</label>
            {compensation.bonuses.length === 0 ? (
              <span style={{ color: '#6B7280' }}>None on file.</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1rem', width: '100%' }}>
                {compensation.bonuses.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    {fmtDate(b.awarded_at)} — <strong>{fmtCents(b.amount_cents)}</strong>
                    <span style={{ color: '#6B7280' }}> · {b.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className="emp-manage__field"
            data-testid="profile-compensation-payouts"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
          >
            <label>Recent payouts</label>
            {compensation.payouts.length === 0 ? (
              <span style={{ color: '#6B7280' }}>No payouts logged yet.</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1rem', width: '100%' }}>
                {compensation.payouts.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    {fmtDate(p.paid_at)} — <strong>{fmtCents(p.net_cents)}</strong> net
                    <span style={{ color: '#6B7280' }}> · gross {fmtCents(p.gross_cents)}</span>
                    <span style={{ color: '#6B7280' }}> · {p.method}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </>
      )}

      {/* Credentials */}
      {tab === 'credentials' && (
        <div className="admin-card">
          {certs.length === 0 ? (
            <div className="emp-manage__empty">No credentials on file yet. Your admin can assign credentials to your profile.</div>
          ) : (
            <div className="emp-manage__cred-list">
              {certs.map(c => (
                <div key={c.id} className="emp-manage__cred-item">
                  <div className="emp-manage__cred-info">
                    <span className="emp-manage__cred-name">{c.certification_name}</span>
                    <span className="emp-manage__cred-type">{c.certification_type}</span>
                  </div>
                  <div className="emp-manage__cred-details">
                    <span>Issued: {fmtDate(c.issued_date)}</span>
                    {c.expiry_date && <span>Expires: {fmtDate(c.expiry_date)}</span>}
                    {c.pay_bump_amount > 0 && <span className="emp-manage__cred-bonus">+{fmtCurrency(c.pay_bump_amount)}/hr</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learning Credits */}
      {tab === 'credits' && (
        <div className="admin-card">
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#374151' }}>
            Total Learning Credits: <strong style={{ color: 'var(--color-brand-navy)' }}>{totalPoints}</strong>
          </div>
          {credits.length === 0 ? (
            <div className="emp-manage__empty">No learning credits earned yet. Complete modules, quizzes, and lessons to earn credits.</div>
          ) : (
            <div className="emp-manage__credit-list">
              {credits.slice(0, 30).map((lc, i) => (
                <div key={i} className="emp-manage__credit-item">
                  <span className="emp-manage__credit-points">+{lc.points_earned}</span>
                  <div className="emp-manage__credit-info">
                    <span className="emp-manage__credit-label">{lc.entity_label || 'Learning Activity'}</span>
                    <span className="emp-manage__credit-meta">{fmtDate(lc.earned_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Changes */}
      {tab === 'changes' && (
        <div className="admin-card">
          {changes.length === 0 ? (
            <div className="emp-manage__empty">No recent profile changes.</div>
          ) : (
            <div className="emp-manage__changelog">
              {changes.map((pc, i) => (
                <div key={i} className="emp-manage__change-item">
                  <div className="emp-manage__change-header">
                    <span className={`emp-manage__change-type emp-manage__change-type--${pc.change_type}`}>
                      {pc.change_type.replace(/_/g, ' ')}
                    </span>
                    <span className="emp-manage__change-date">{new Date(pc.created_at).toLocaleString()}</span>
                  </div>
                  <div className="emp-manage__change-title">{pc.title}</div>
                  {pc.description && <div className="emp-manage__change-desc">{pc.description}</div>}
                  {(pc.old_value || pc.new_value) && (
                    <div className="emp-manage__change-values">
                      {pc.old_value && <span className="emp-manage__change-old">{pc.old_value}</span>}
                      {pc.old_value && pc.new_value && <span>&rarr;</span>}
                      {pc.new_value && <span className="emp-manage__change-new">{pc.new_value}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Themes (Hub theme picker — Slice 82) + Density + Font scale (Slice 86) */}
      {tab === 'themes' && (
        <>
          <ThemePicker initialThemeId={initialThemeId} />
          <div className="admin-card" style={{ marginTop: '0.75rem' }}>
            <DensityPicker initialDensity={initialDensity} />
            <FontScaleSlider initialFontScale={initialFontScale} />
          </div>
        </>
      )}
    </div>
  );
}
