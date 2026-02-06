// app/admin/messages/settings/page.tsx — Messaging Preferences
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import UnderConstruction from '../../components/messaging/UnderConstruction';

interface Preferences {
  notifications_enabled: boolean;
  sound_enabled: boolean;
  email_notifications: boolean;
  desktop_notifications: boolean;
  show_read_receipts: boolean;
  show_typing_indicators: boolean;
  message_preview_in_notification: boolean;
  auto_archive_days: number | null;
  theme: 'default' | 'compact' | 'comfortable';
  enter_to_send: boolean;
}

const DEFAULT_PREFS: Preferences = {
  notifications_enabled: true,
  sound_enabled: true,
  email_notifications: false,
  desktop_notifications: true,
  show_read_receipts: true,
  show_typing_indicators: true,
  message_preview_in_notification: true,
  auto_archive_days: null,
  theme: 'default',
  enter_to_send: true,
};

export default function MessagingSettingsPage() {
  const { data: session } = useSession();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      const res = await fetch('/api/admin/messages/preferences');
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPrefs(prev => ({ ...prev, ...data.preferences }));
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function savePreferences() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/messages/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }

  if (!session?.user) return null;

  return (
    <>
      <UnderConstruction
        feature="Messaging Settings"
        description="Configure your messaging notifications, privacy, and display preferences."
      />

      <div className="msg-settings">
        <div className="msg-settings__header">
          <Link href="/admin/messages" className="learn__back">&larr; Back to Messages</Link>
          <h2 className="msg-settings__title">Messaging Settings</h2>
        </div>

        {loading ? (
          <div className="msg-settings__loading">Loading preferences...</div>
        ) : (
          <div className="msg-settings__sections">
            {/* Notifications */}
            <div className="msg-settings__section">
              <h3 className="msg-settings__section-title">Notifications</h3>
              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Enable Notifications</span>
                  <span className="msg-settings__option-desc">Receive notifications for new messages</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.notifications_enabled}
                    onChange={e => updatePref('notifications_enabled', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Sound</span>
                  <span className="msg-settings__option-desc">Play a sound for new messages</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.sound_enabled}
                    onChange={e => updatePref('sound_enabled', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Email Notifications</span>
                  <span className="msg-settings__option-desc">Get email alerts for messages when you are offline</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.email_notifications}
                    onChange={e => updatePref('email_notifications', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Desktop Notifications</span>
                  <span className="msg-settings__option-desc">Show browser push notifications</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.desktop_notifications}
                    onChange={e => updatePref('desktop_notifications', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Message Preview in Notifications</span>
                  <span className="msg-settings__option-desc">Show message content in notification popups</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.message_preview_in_notification}
                    onChange={e => updatePref('message_preview_in_notification', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>
            </div>

            {/* Privacy */}
            <div className="msg-settings__section">
              <h3 className="msg-settings__section-title">Privacy</h3>
              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Read Receipts</span>
                  <span className="msg-settings__option-desc">Let others know when you have read their messages</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.show_read_receipts}
                    onChange={e => updatePref('show_read_receipts', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Typing Indicators</span>
                  <span className="msg-settings__option-desc">Show when you are typing a message</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.show_typing_indicators}
                    onChange={e => updatePref('show_typing_indicators', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>
            </div>

            {/* Display */}
            <div className="msg-settings__section">
              <h3 className="msg-settings__section-title">Display</h3>
              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Message Density</span>
                  <span className="msg-settings__option-desc">Choose how messages are spaced</span>
                </div>
                <select
                  className="msg-settings__select"
                  value={prefs.theme}
                  onChange={e => updatePref('theme', e.target.value as Preferences['theme'])}
                >
                  <option value="default">Default</option>
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Enter to Send</span>
                  <span className="msg-settings__option-desc">Press Enter to send messages (Shift+Enter for new line)</span>
                </div>
                <label className="msg-settings__toggle">
                  <input
                    type="checkbox"
                    checked={prefs.enter_to_send}
                    onChange={e => updatePref('enter_to_send', e.target.checked)}
                  />
                  <span className="msg-settings__toggle-slider" />
                </label>
              </div>

              <div className="msg-settings__option">
                <div className="msg-settings__option-info">
                  <span className="msg-settings__option-label">Auto-Archive</span>
                  <span className="msg-settings__option-desc">Automatically archive inactive conversations</span>
                </div>
                <select
                  className="msg-settings__select"
                  value={prefs.auto_archive_days ?? 'never'}
                  onChange={e => updatePref('auto_archive_days', e.target.value === 'never' ? null : Number(e.target.value))}
                >
                  <option value="never">Never</option>
                  <option value="30">After 30 days</option>
                  <option value="60">After 60 days</option>
                  <option value="90">After 90 days</option>
                </select>
              </div>
            </div>

            {/* Save Button */}
            <div className="msg-settings__actions">
              <button
                className="msg-settings__save"
                onClick={savePreferences}
                disabled={saving}
              >
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Messaging Settings — Development Guide</h2>

        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Toggle switches for notification preferences</li>
            <li>Privacy controls: read receipts, typing indicators</li>
            <li>Display options: message density, enter-to-send, auto-archive</li>
            <li>Loads/saves preferences via the preferences API</li>
            <li>Visual feedback on save (button state change)</li>
          </ul>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Database Requirements</h3>
          <p className="msg-setup-guide__text">
            Uses the <code>messaging_preferences</code> table from the messaging schema.
            Run the schema SQL to create this table. Preferences are stored as individual
            columns with sensible defaults.
          </p>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt for This Page</h3>
          <pre className="msg-setup-guide__prompt">{`Improve the messaging settings page at /admin/messages/settings/page.tsx. Current state: toggle switches for notifications (enabled, sound, email, desktop, preview), privacy (read receipts, typing indicators), display (density, enter-to-send, auto-archive), save button.

NEXT STEPS:
1. Add browser notification permission request (Notification.requestPermission()) when desktop notifications are enabled
2. Add notification sound preview/selection (let users choose from 3-4 sounds)
3. Add per-conversation notification overrides (mute specific conversations)
4. Add "Do Not Disturb" schedule (e.g., mute all from 10pm-7am)
5. Add blocked users management (block/unblock specific contacts)
6. Add data management: export chat history, delete all messages
7. Add keyboard shortcuts section (customizable shortcuts for common actions)
8. Add theme/color scheme selection for the messaging UI
9. Add font size adjustment for messages
10. Add status message (custom status like "In the field", "In office", "On vacation")
11. Add away message auto-reply configuration
12. Add integration settings (email digest frequency, mobile push config)
13. Real-time preview of display settings changes`}</pre>
        </div>
      </div>
    </>
  );
}
