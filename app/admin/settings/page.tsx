// app/admin/settings/page.tsx — the Company portal.
//
// C12b / P14 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── TWO OF THE FIVE, AND THE REASON THE OTHER THREE ARE NOT HERE ────────────────────────────────
//
// §8 lists five pages for this portal. Only two of them are the COMPANY's settings:
// `org-settings` and `orgs`, both already admin-gated, both absorbed here.
//
// The other three — `announcements`, `notifications`, `me/privacy` — are ungated and personal.
// `/admin/notifications` describes itself as "the current user's alerts". `/admin/me/privacy` is
// already in the `hub` workspace, where personal things live. `/admin/announcements` is the release
// archive that the Hub's WhatsNewBanner sends every employee to with "Read full notes →". This route
// is middleware-gated to `['admin']`, so absorbing any of them would DELETE it for everyone who is
// not an admin — the banner included. §8 grouped by what sounds like settings rather than by whose
// settings. The three belong with `/admin/me`, which is C13's decision to make.
//
// ── THE PAGE HAS BEEN RENDERING UNSTYLED, AND NOTHING WOULD EVER HAVE SAID SO ───────────────────
//
// Every class in this file — `.jobs-page`, `.job-detail__tabs`, `.job-detail__content`,
// `.job-form__grid`, `.job-form__submit` — is defined in `app/admin/styles/AdminJobs.css`, which is
// imported by `app/admin/jobs/layout.tsx` and therefore loads on the JOBS route tree. This page
// never imported it. Measured in a browser before the import below existed:
//
//     .job-detail__tabs    display: block   (the rule says flex)      border-bottom: 0px (says 2px)
//     .job-detail__tab     display: inline-block, no padding, no background
//     .job-detail__content no border, no padding, no card
//     .job-form__grid      display: block   (the rule says grid)
//     .job-form__submit    no background    (the rule says brand navy)
//
// A tab strip that was a column of bare words, a form that was a single column, and a submit button
// that looked like a link — on the page the owner asked to hold the page-visibility control. This is
// the route-scoped-CSS trap this repository has been caught by twice, in its other direction: not a
// fix written in the wrong sheet, but a page written against a sheet it does not load.
//
// The import is one line and restores what the markup always assumed. Unpicking the coupling — this
// page has no business wearing `.jobs-page` — is real work and belongs in C14's sweep, not in the
// slice that found it.
//
// ── THE TABS ARE URL STATE NOW ──────────────────────────────────────────────────────────────────
//
// They were `useState`, which is why the two redirects above could not have worked: forwarding to
// `/admin/settings?tab=org-profile` would have landed on General. Same three reasons the marketing
// portal gave: a reload keeps you where you were, back steps between tabs, and a tab is a link
// somebody can send.
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings, Building2, Lock, Bell, Link2, CreditCard, Check, Satellite,
  Monitor, Map as MapIcon, Mail, Calendar, LayoutList, Landmark, Network,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import '../styles/AdminJobs.css';
import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import { usePageError } from '../hooks/usePageError';
import HoursNotificationSetting from './HoursNotificationSetting';
import PageToggles from './PageToggles';
import OrgProfileTab from './_tabs/OrgProfileTab';
import OrgsTab from './_tabs/OrgsTab';

interface GeneralSettings {
  companyName: string;
  defaultState: string;
  jobNumberPrefix: string;
  timezone: string;
}
interface CompanySettings {
  address: string;
  phone: string;
  fax: string;
  website: string;
  tbpelsFirmNumber: string;
}

const GENERAL_DEFAULTS: GeneralSettings = {
  companyName: 'Starr Surveying', defaultState: 'TX', jobNumberPrefix: 'SS', timezone: 'America/Chicago',
};
const COMPANY_DEFAULTS: CompanySettings = {
  address: '', phone: '', fax: '', website: '', tbpelsFirmNumber: '',
};

// Every tab is admin-only at the door — middleware gates `/admin/settings` to `['admin']` and this
// portal does not widen it. `orgs` carried admin + tech_support on its row; the tab keeps the pair,
// which grants nobody anything today and is the row's own statement about who it is for.
const PORTAL: PortalSpec = {
  tabs: [
    { id: 'general', label: 'General', icon: Settings, hint: 'The name, the state, the job-number prefix, the clock.' },
    { id: 'company', label: 'Company', icon: Building2, hint: 'Address, phone, firm registration — what goes on a plat.' },
    // T3 of §11, PAGE_CONSOLIDATION. Owner: "full control in the settings as to what all pages
    // are visible and what pages are not." It belongs in Settings because that is where the owner
    // said to put it, and beside these because it is the same kind of fact: something the FIRM
    // decides once, not something a person adjusts while working.
    { id: 'pages', label: 'Pages', icon: LayoutList, hint: 'Which pages this firm uses, and which are switched off.' },
    { id: 'org-profile', label: 'Org profile', icon: Landmark, hint: 'The organisation record behind the subscription.' },
    { id: 'orgs', label: 'Organisations', icon: Network, hint: 'Every organisation on the platform.', roles: ['admin', 'tech_support'] },
    { id: 'users', label: 'User Access', icon: Lock, hint: 'Who may sign in and what each of them may do.' },
    { id: 'notifications', label: 'Notifications', icon: Bell, hint: 'What this firm sends, and when.' },
    { id: 'integrations', label: 'Integrations', icon: Link2, hint: 'The outside services this firm is connected to.' },
    { id: 'billing', label: 'Billing', icon: CreditCard, hint: 'The subscription and what it costs.' },
  ],
  route: '/admin/settings',
  defaultTab: 'general',
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('SettingsPage');
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);
  const { active: activeSection, tabs: visibleSections, select: setActiveSection } = usePortalTabs(PORTAL, viewer);
  const [general, setGeneral] = useState<GeneralSettings>(GENERAL_DEFAULTS);
  const [company, setCompany] = useState<CompanySettings>(COMPANY_DEFAULTS);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const isAdminUser = session?.user?.roles?.includes('admin') ?? false;

  const load = useCallback(async () => {
    const res = await safeFetch<{ settings: { general?: Partial<GeneralSettings>; company?: Partial<CompanySettings> } }>('/api/admin/settings');
    if (res?.settings?.general) setGeneral({ ...GENERAL_DEFAULTS, ...res.settings.general });
    if (res?.settings?.company) setCompany({ ...COMPANY_DEFAULTS, ...res.settings.company });
  }, [safeFetch]);

  useEffect(() => { if (isAdminUser) void load(); }, [isAdminUser, load]);

  async function save(key: 'general' | 'company', value: GeneralSettings | CompanySettings) {
    setSavingKey(key);
    setSavedKey(null);
    try {
      await safeAction(`saving ${key} settings`, async () => {
        const res = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      });
      setSavedKey(key);
      setTimeout(() => setSavedKey(k => (k === key ? null : k)), 2500);
    } finally {
      setSavingKey(null);
    }
  }

  if (!session?.user) return null;
  if (!isAdminUser) return null;

  const sections = PORTAL.tabs;

  function SaveBar({ k }: { k: 'general' | 'company' }) {
    return (
      <div className="job-form__actions" style={{ marginTop: '1rem', alignItems: 'center', gap: '0.75rem' }}>
        {savedKey === k && <span style={{ color: 'var(--color-success)', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Check size={13} strokeWidth={2.5} /> Saved</span>}
        <button
          className="job-form__submit"
          disabled={savingKey === k}
          onClick={() => void save(k, k === 'general' ? general : company)}
        >
          {savingKey === k ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <h2 className="jobs-page__title">Settings</h2>
      </div>

      {/* Section tabs */}
      <div className="job-detail__tabs">
        {visibleSections.map(s => {
          const Icon = s.icon as typeof Settings;
          return (
            <button
              key={s.id}
              className={`job-detail__tab ${activeSection === s.id ? 'job-detail__tab--active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span className="job-detail__tab-icon"><Icon size={15} strokeWidth={1.75} /></span>
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="job-detail__content">
        {activeSection === 'general' && (
          <div className="job-detail__section">
            <h3>General Settings</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">Company Name</label>
                <input className="job-form__input" value={general.companyName} onChange={e => setGeneral(g => ({ ...g, companyName: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Default State</label>
                <input className="job-form__input" value={general.defaultState} onChange={e => setGeneral(g => ({ ...g, defaultState: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Job Number Prefix</label>
                <input className="job-form__input" value={general.jobNumberPrefix} onChange={e => setGeneral(g => ({ ...g, jobNumberPrefix: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Timezone</label>
                <select className="job-form__select" value={general.timezone} onChange={e => setGeneral(g => ({ ...g, timezone: e.target.value }))}>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                </select>
              </div>
            </div>
            <SaveBar k="general" />
          </div>
        )}

        {activeSection === 'company' && (
          <div className="job-detail__section">
            <h3>Company Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Company Address</label>
                <input className="job-form__input" placeholder="Street address" value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Phone</label>
                <input className="job-form__input" type="tel" value={company.phone} onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Fax</label>
                <input className="job-form__input" type="tel" value={company.fax} onChange={e => setCompany(c => ({ ...c, fax: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Website</label>
                <input className="job-form__input" placeholder="https://" value={company.website} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">TBPELS Firm Number</label>
                <input className="job-form__input" placeholder="Firm registration number" value={company.tbpelsFirmNumber} onChange={e => setCompany(c => ({ ...c, tbpelsFirmNumber: e.target.value }))} />
              </div>
            </div>
            <SaveBar k="company" />
          </div>
        )}

        {activeSection === 'org-profile' && <OrgProfileTab />}
        {activeSection === 'orgs' && <OrgsTab />}

        {activeSection === 'users' && (
          <div className="job-detail__section">
            <h3>User Access Control</h3>
            <p className="job-detail__section-desc">
              Manage which email addresses can access the admin panel and their permission levels.
              Currently, admin access is controlled by the isAdmin() function in /lib/auth.ts.
            </p>
            <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
              <span><Lock size={16} strokeWidth={1.75} /></span>
              <p>Role-based access control is configured in code</p>
              <p className="job-detail__field-data-sub">Admin emails are defined in /lib/auth.ts</p>
            </div>
          </div>
        )}

        {activeSection === 'notifications' && (
          <div className="job-detail__section">
            <h3>Notification Settings</h3>
            <p className="job-detail__section-desc">Configure email and in-app notifications for various events.</p>
            <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
              <span><Bell size={16} strokeWidth={1.75} /></span>
              <p>Per-user messaging notifications live under Messages → Settings</p>
            </div>

            {/* Renders nothing for somebody who cannot approve hours — a toggle that changes
                nothing teaches people the settings page lies. */}
            <HoursNotificationSetting />
          </div>
        )}

        {activeSection === 'integrations' && (
          <div className="job-detail__section">
            <h3>External Integrations</h3>
            <GoogleCalendarConnectCard />
            <div className="job-detail__integration-cards" style={{ marginTop: '1rem' }}>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon"><Satellite size={20} strokeWidth={1.75} /></span>
                <h4>Trimble Access</h4>
                <p>Real-time field data streaming</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon"><Monitor size={20} strokeWidth={1.75} /></span>
                <h4>Trimble Business Center</h4>
                <p>Data processing and adjustment</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon"><MapIcon size={20} strokeWidth={1.75} /></span>
                <h4>Google Maps / Mapbox</h4>
                <p>Satellite imagery and mapping</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon"><Mail size={20} strokeWidth={1.75} /></span>
                <h4>Email Service</h4>
                <p>Transactional emails and notifications</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'pages' && (
          <div className="job-detail__section">
            <PageToggles />
          </div>
        )}

        {activeSection === 'billing' && (
          <div className="job-detail__section">
            <h3>Billing &amp; Subscription</h3>
            <p className="job-detail__section-desc">Subscription, invoices, and plan management live in the Billing area.</p>
            <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
              <span><CreditCard size={16} strokeWidth={1.75} /></span>
              <p>Open <a href="/admin/billing" style={{ color: 'var(--color-brand-navy)' }}>Billing &amp; Plans &rarr;</a></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Google Calendar OAuth connect/disconnect card. Reads status on mount,
// kicks off the OAuth flow on Connect (POST → redirect URL), drops the
// connection on Disconnect (DELETE), and triggers a manual sync (POST).
function GoogleCalendarConnectCard() {
  const [status, setStatus] = useState<{ connected: boolean; last_synced_at: string | null } | null>(null);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'sync' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/google-calendar', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { connected: boolean; last_synced_at: string | null };
      setStatus(data);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Surface ?gcal=connected/error/state-mismatch flash from the OAuth callback.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('gcal');
    if (flag === 'connected') setMessage('Google Calendar connected.');
    else if (flag === 'error') setMessage('Google declined the request.');
    else if (flag === 'state-mismatch') setMessage('Could not verify the callback — try again.');
    if (flag) {
      params.delete('gcal');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  async function connect() {
    setBusy('connect');
    try {
      const res = await fetch('/api/admin/google-calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      if (!res.ok) {
        setMessage('Connect failed — check Google client env vars.');
        return;
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect Google Calendar? Future schedule changes won\'t sync.')) return;
    setBusy('disconnect');
    try {
      await fetch('/api/admin/google-calendar', { method: 'DELETE' });
      await refresh();
      setMessage('Disconnected.');
    } finally {
      setBusy(null);
    }
  }
  async function sync() {
    setBusy('sync');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/google-calendar/sync', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { pushed?: number; updated?: number; pulled?: number; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `Sync failed (${res.status}).`);
        return;
      }
      setMessage(`Synced — pushed ${data.pushed ?? 0}, updated ${data.updated ?? 0}, pulled ${data.pulled ?? 0}.`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="job-detail__integration-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className="job-detail__integration-icon"><Calendar size={24} strokeWidth={1.75} /></span>
        <div>
          <h4 style={{ margin: 0 }}>Google Calendar</h4>
          <p style={{ margin: '0.15rem 0 0', color: 'var(--theme-fg-secondary, #6B7280)', fontSize: '0.85rem' }}>
            Two-way sync between your schedule and your Google Calendar.
          </p>
          {status?.connected ? (
            <p style={{ margin: '0.25rem 0 0', color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>
              Connected{status.last_synced_at ? ` · last sync ${new Date(status.last_synced_at).toLocaleString()}` : ''}
            </p>
          ) : (
            <p style={{ margin: '0.25rem 0 0', color: 'var(--theme-fg-secondary, #6B7280)', fontSize: '0.8rem' }}>Not connected</p>
          )}
          {message && <p style={{ margin: '0.4rem 0 0', color: 'var(--color-brand-navy)', fontSize: '0.8rem' }}>{message}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {status?.connected ? (
          <>
            <button onClick={() => void sync()} disabled={busy === 'sync'} style={btnPrimary}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={() => void disconnect()} disabled={busy === 'disconnect'} style={btnSecondary}>
              {busy === 'disconnect' ? '…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button onClick={() => void connect()} disabled={busy === 'connect'} style={btnPrimary}>
            {busy === 'connect' ? 'Redirecting…' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '0.45rem 0.9rem', background: 'var(--color-brand-navy)', color: 'var(--theme-accent-fg, #FFF)',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
};
const btnSecondary: React.CSSProperties = {
  padding: '0.45rem 0.9rem', background: '#FFF', color: 'var(--color-brand-navy)',
  border: '1px solid var(--color-brand-navy)', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
};
