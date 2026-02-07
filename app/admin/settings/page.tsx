// app/admin/settings/page.tsx — Admin settings (admin only)
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState('general');

  if (!session?.user) return null;

  const sections = [
    { key: 'general', label: 'General', icon: '⚙️' },
    { key: 'company', label: 'Company', icon: '🏢' },
    { key: 'users', label: 'User Access', icon: '🔐' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'integrations', label: 'Integrations', icon: '🔗' },
    { key: 'billing', label: 'Billing', icon: '💳' },
  ];

  return (
    <>
      <UnderConstruction
        feature="Admin Settings"
        description="Configure system-wide settings, manage user access, set up integrations, and customize the platform for your organization."
      />

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
                  <input className="job-form__input" defaultValue="Starr Surveying" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Default State</label>
                  <input className="job-form__input" defaultValue="TX" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Job Number Prefix</label>
                  <input className="job-form__input" defaultValue="SS" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Timezone</label>
                  <select className="job-form__select" defaultValue="America/Chicago">
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'company' && (
            <div className="job-detail__section">
              <h3>Company Information</h3>
              <div className="job-form__grid">
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Company Address</label>
                  <input className="job-form__input" placeholder="Street address" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Phone</label>
                  <input className="job-form__input" type="tel" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Fax</label>
                  <input className="job-form__input" type="tel" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Website</label>
                  <input className="job-form__input" placeholder="https://" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">TBPELS Firm Number</label>
                  <input className="job-form__input" placeholder="Firm registration number" />
                </div>
              </div>
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
                <p>Notification system not yet configured</p>
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
              <h3>Billing & Subscription</h3>
              <div className="job-detail__field-data-empty" style={{ marginTop: '1rem' }}>
                <span>💳</span>
                <p>Billing management not yet configured</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Settings — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Settings Storage:</strong> Create <code>app_settings</code> table in Supabase with key-value pairs for company config</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/settings/route.ts</code> — GET/PUT for reading and updating settings</li>
            <li><strong>User Management:</strong> RBAC system with roles: super_admin, admin, employee. Move from hardcoded emails to database-driven</li>
            <li><strong>Integration OAuth:</strong> Trimble Connect OAuth flow, Google Maps API key config, email service setup (SendGrid/Resend)</li>
            <li><strong>Notification Preferences:</strong> Per-event toggle for email vs in-app notifications</li>
            <li><strong>Audit Log:</strong> Track all settings changes with who/when/what</li>
            <li><strong>Backup/Export:</strong> Data export functionality for compliance</li>
            <li><strong>Branding:</strong> Custom logo upload, company colors, email templates</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build the Settings page at /admin/settings/page.tsx.

CURRENT STATE: UI shell with 6 tabbed sections (General, Company, Users, Notifications, Integrations, Billing). Forms have input fields but are not connected to any API. Uses existing job-form and job-detail CSS classes.

NEXT STEPS:
1. Create app_settings table in Supabase (key TEXT PRIMARY KEY, value JSONB, updated_by TEXT, updated_at TIMESTAMPTZ)
2. Create /api/admin/settings/route.ts for reading/writing settings
3. Connect form inputs to settings API with save buttons
4. Build user management: invite users, assign roles, deactivate accounts
5. Move admin email list from hardcoded auth.ts to database-driven role assignments
6. Build Trimble Connect OAuth integration flow
7. Add Google Maps/Mapbox API key configuration
8. Set up email service integration (SendGrid or Resend)
9. Build notification preferences per user per event type
10. Add settings change audit log`}</pre>
        </div>
      </div>
    </>
  );
}
