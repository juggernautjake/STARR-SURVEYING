'use client';
// app/AndrewAsh/studio/settings/TeamPanel.tsx — who can get into the studio.
//
// ── EITHER OWNER CAN RESET THE OTHER'S PASSWORD, AND THAT IS SAID OUT LOUD ──────────────────────
//
// With no mail delivery configured, "Andrew forgot his password" has to be solvable by the other
// person. That is a real privilege — each owner can lock the other out — and the correct response is
// to state it plainly in the interface rather than leave it as an undocumented capability someone
// discovers later. It is the right trade for a two-person business, where the alternative is a
// support request to a developer.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react';
import { passwordProblem } from '@/lib/voice/auth-rules';
import { relativeTime } from '@/lib/voice/notifications';

interface User {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  role: string;
  lastLoginAt: string | null;
}

export default function TeamPanel({ users, currentUserId }: { users: User[]; currentUserId: string }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function call(method: string, body: Record<string, unknown> | null, key: string, query = ''): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/team${query}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="vaPanel">
      <div className="vaPanelHead">
        <h2 className="vaPanelTitle">Who can sign in</h2>
        {!adding && (
          <button type="button" className="vaBtn vaBtnOutline vaBtnSm" onClick={() => setAdding(true)}>
            <UserPlus size={13} aria-hidden /> Add someone
          </button>
        )}
      </div>

      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <table className="vaDataTable">
        <thead>
          <tr>
            <th>Person</th>
            <th>Signs in with</th>
            <th>Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td data-label="Person">
                <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{u.displayName}</span>
                {u.id === currentUserId && <span className="vaStatusPill vaStatusNew" style={{ marginLeft: 8 }}>You</span>}
              </td>
              <td data-label="Signs in with">
                {u.username && <span style={{ display: 'block', color: 'var(--va-text)' }}>{u.username}</span>}
                <span style={{ color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>{u.email}</span>
              </td>
              <td data-label="Last seen" className="vaMuted">
                {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never'}
              </td>
              <td data-label="">
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {u.id !== currentUserId && (
                    <>
                      <button
                        type="button"
                        className="vaBtn vaBtnGhost vaBtnSm"
                        onClick={() => setResetting(resetting === u.id ? null : u.id)}
                      >
                        <KeyRound size={12} aria-hidden /> Reset password
                      </button>
                      <button
                        type="button"
                        className="vaBtn vaBtnGhost vaBtnSm"
                        style={{ color: '#ff9c7e' }}
                        disabled={busy === `del-${u.id}`}
                        onClick={() => {
                          if (!window.confirm(`Remove ${u.displayName}? They will not be able to sign in again.`)) return;
                          void call('DELETE', null, `del-${u.id}`, `?id=${encodeURIComponent(u.id)}`);
                        }}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </>
                  )}
                </span>

                {resetting === u.id && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <input
                      className="vaInput"
                      type="password"
                      placeholder="New password for them"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="vaBtn vaBtnSolid vaBtnSm"
                        disabled={busy === `reset-${u.id}`}
                        onClick={async () => {
                          const problem = passwordProblem(newPassword);
                          if (problem) {
                            setError(problem);
                            return;
                          }
                          const ok = await call('PATCH', { id: u.id, password: newPassword }, `reset-${u.id}`);
                          if (ok) {
                            setNewPassword('');
                            setResetting(null);
                          }
                        }}
                      >
                        {busy === `reset-${u.id}` ? <Loader2 size={13} aria-hidden className="vaSpin" /> : null}
                        Set it
                      </button>
                      <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setResetting(null)}>
                        Cancel
                      </button>
                    </div>
                    <p className="vaHint">Tell them the new password directly. Nothing is emailed.</p>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--va-line)', paddingTop: 18 }}>
          <div className="vaFieldRow vaFieldRow2">
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-tm-name">Their name</label>
              <input id="va-tm-name" className="vaInput" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-tm-email">Username or email</label>
              <input id="va-tm-email" className="vaInput" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-tm-pw">A password to start with</label>
            <input
              id="va-tm-pw"
              type="password"
              className="vaInput"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="vaHint">At least 10 characters. They can change it once they are in.</p>
          </div>
          <div className="vaStudioActions">
            <button
              type="button"
              className="vaBtn vaBtnSolid vaBtnSm"
              disabled={busy === 'add'}
              onClick={async () => {
                const problem = passwordProblem(password);
                if (problem) {
                  setError(problem);
                  return;
                }
                const ok = await call('POST', { displayName, email, password }, 'add');
                if (ok) {
                  setAdding(false);
                  setDisplayName('');
                  setEmail('');
                  setPassword('');
                }
              }}
            >
              {busy === 'add' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <UserPlus size={14} aria-hidden />}
              Add them
            </button>
            <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="vaHint" style={{ marginTop: 16 }}>
        Everyone here has full access, and either of you can reset the other&rsquo;s password. That is
        deliberate — with no email set up, it is the only way to recover a forgotten one without
        calling a developer.
      </p>
    </div>
  );
}
