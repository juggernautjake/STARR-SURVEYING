// app/dnd/profile/ProfileForm.tsx — client profile editor (Phase B, B7).
'use client';

import { useRef, useState, type FormEvent } from 'react';
import AccountSecurity from '@/app/dnd/_ui/AccountSecurity';
import { useRouter } from 'next/navigation';
import styles from '../_ui/hextech.module.css';

interface DndUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export default function ProfileForm({ user, sections }: {
  user: DndUser;
  /** Server-rendered panels (P11-9) — characters, tables, content, activity. Passed in rather than
   *  fetched here because they need the database and this is a client component; this file owns the
   *  page's `root > screen` wrapper, so they have to be handed to it to land inside the layout. */
  sections?: React.ReactNode;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const initials = (displayName || user.email).trim().charAt(0).toUpperCase() || '?';

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch('/api/dnd/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save.');
        return;
      }
      setOk('Profile saved.');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setOk(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/dnd/profile/avatar', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed.');
        return;
      }
      setAvatarUrl(data.user.avatar_url);
      setOk('Avatar updated.');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen}>
        {/* A COLUMN INSIDE `.screen`. That class is `display: flex` with `align-items/justify-content:
            center` and no direction — it exists to centre ONE card, which is right for /dnd/login and
            /dnd/recover and was right here while this page was a single form. Adding siblings to it laid
            them out in a ROW: the panels marched across the viewport and pushed the form off the left
            edge. Fixed here rather than in `.screen`, because the other two pages still want exactly
            what it does. Width matches `.panel`'s own 420px cap so the form and the panels below it share
            one edge instead of stepping in and out. */}
        <div style={{ display: 'grid', width: '100%', maxWidth: 420, alignContent: 'start' }}>
        <form className={styles.panel} onSubmit={saveName}>
          <p className={styles.brand}>Starr Tabletop</p>
          <h1 className={styles.title}>Profile</h1>
          <p className={styles.subtitle}>{user.email}</p>

          {error && <div className={styles.error}>{error}</div>}
          {ok && <div className={styles.success}>{ok}</div>}

          <div className={styles.avatarRow}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.avatar} src={avatarUrl} alt="Your avatar" />
            ) : (
              <div className={`${styles.avatar} ${styles.avatarEmpty}`}>{initials}</div>
            )}
            <div className={styles.avatarActions}>
              <label className={styles.fileBtn}>
                {uploading ? 'Uploading…' : 'Change Avatar'}
                <input
                  ref={fileRef}
                  className={styles.fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onFile}
                  disabled={uploading}
                />
              </label>
              <p className={styles.fileHint}>PNG, JPG, WEBP, or GIF · up to 5 MB</p>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Display Name</span>
            <input
              className={styles.input}
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save Profile'}
          </button>

        </form>

        {/* OUTSIDE the form, like AccountSecurity below: these panels contain links, and a link inside a
            form is fine, but keeping every non-form block out of it means no future control can
            accidentally submit the profile. */}
        {sections}

        <a className={styles.buttonGhost} href="/dnd">
          ← Back to Campaign Portal
        </a>

          {/* Password change + recovery code (P2-4). OUTSIDE the profile form on purpose: nesting a form
              inside another is invalid HTML and would make the inner submit buttons post the outer form. */}
          <AccountSecurity />
        </div>
      </div>
    </div>
  );
}
