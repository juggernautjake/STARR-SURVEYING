'use client'
// HubSignIn (Phase P) — the pseudo-login surfaced on the /dnd hub. Signed out: a
// name + password form (each ≥ 4 chars) that create-or-verifies via /api/dnd/auth/quick.
// Signed in: a small bar with the name + a sign-out button. It's NOT real auth — it just
// lets people keep track of the characters they own and the campaigns they're in.
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

export default function HubSignIn({ displayName }: { displayName: string | null }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (name.trim().length < 4) return setError('Name must be at least 4 characters.')
    if (password.length < 4) return setError('Password must be at least 4 characters.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dnd/auth/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data.error || 'Sign in failed.')
      setName('')
      setPassword('')
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/dnd/auth/logout', { method: 'POST' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (displayName) {
    return (
      <div
        className={styles.framedPanel}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 13, color: 'var(--hx-muted)' }}>
          Signed in as <strong style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', letterSpacing: '0.02em' }}>{displayName}</strong>
        </span>
        <button className={styles.hexBtn} style={{ padding: '6px 14px', fontSize: 12 }} onClick={signOut} disabled={busy}>
          {busy ? '…' : 'Sign out'}
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={signIn}
      className={styles.framedPanel}
      style={{ display: 'grid', gap: 10, padding: '16px 18px', maxWidth: 520, margin: '0 auto', width: '100%' }}
    >
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 15 }}>Sign in to track your table</h2>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
        Just a name and a password (4+ characters each). This isn&apos;t a real account — it only keeps track of the
        characters you own and the campaigns you&apos;re in or running. New name? It&apos;s claimed on first sign-in.
      </p>
      {error && <div className={styles.error}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label className={styles.field} style={{ flex: '1 1 180px', margin: 0 }}>
          <span className={styles.label}>Name</span>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} minLength={4} autoComplete="username" required />
        </label>
        <label className={styles.field} style={{ flex: '1 1 180px', margin: 0 }}>
          <span className={styles.label}>Password</span>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} autoComplete="current-password" required />
        </label>
      </div>
      <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} type="submit" disabled={busy} style={{ padding: '10px 18px' }}>
        {busy ? 'Signing in…' : 'Sign in / Claim name'}
      </button>
    </form>
  )
}
