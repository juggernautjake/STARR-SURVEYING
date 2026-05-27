// app/admin/settings/page.tsx — Admin settings (admin only)
'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

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

export default function SettingsPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('SettingsPage');
  const [activeSection, setActiveSection] = useState('general');
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

  const sections = [
    { key: 'general', label: 'General', icon: '⚙️' },
    { key: 'company', label: 'Company', icon: '🏢' },
    { key: 'users', label: 'User Access', icon: '🔐' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'integrations', label: 'Integrations', icon: '🔗' },
    { key: 'billing', label: 'Billing', icon: '💳' },
  ];

  function SaveBar({ k }: { k: 'general' | 'company' }) {
    return (
      <div className="job-form__actions" style={{ marginTop: '1rem', alignItems: 'center', gap: '0.75rem' }}>
        {savedKey === k && <span style={{ color: 'var(--color-success)', fontSize: '0.82rem' }}>✓ Saved</span>}
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
        {sections.map(s => (
          <button
            key={s.key}
            className={`job-detail__tab ${activeSection === s.key ? 'job-detail__tab--active' : ''}`}
            onClick={() => setActiveSection(s.key)}
          >
            <span className="job-detail__tab-icon">{s.icon}</span>
            {s.label}
          </button>
        ))}
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

        {activeSection === 'users' && (
          <div className="job-detail__section">
            <h3>User Access Control</h3>
            <p className="job-detail__section-desc">
              Manage which email addresses can access the admin panel and their permission levels.
              Currently, admin access is controlled by the isAdmin() function in /lib/auth.ts.
            </p>
            <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
              <span>🔐</span>
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
              <span>🔔</span>
              <p>Per-user messaging notifications live under Messages → Settings</p>
            </div>
          </div>
        )}

        {activeSection === 'integrations' && (
          <div className="job-detail__section">
            <h3>External Integrations</h3>
            <div className="job-detail__integration-cards">
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon">📡</span>
                <h4>Trimble Access</h4>
                <p>Real-time field data streaming</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon">💻</span>
                <h4>Trimble Business Center</h4>
                <p>Data processing and adjustment</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon">🗺️</span>
                <h4>Google Maps / Mapbox</h4>
                <p>Satellite imagery and mapping</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
              <div className="job-detail__integration-card">
                <span className="job-detail__integration-icon">📧</span>
                <h4>Email Service</h4>
                <p>Transactional emails and notifications</p>
                <span className="job-detail__integration-status">Not Connected</span>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'billing' && (
          <div className="job-detail__section">
            <h3>Billing &amp; Subscription</h3>
            <p className="job-detail__section-desc">Subscription, invoices, and plan management live in the Billing area.</p>
            <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
              <span>💳</span>
              <p>Open <a href="/admin/billing" style={{ color: 'var(--color-brand-navy)' }}>Billing &amp; Plans &rarr;</a></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
