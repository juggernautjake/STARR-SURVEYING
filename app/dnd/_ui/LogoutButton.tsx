// app/dnd/_ui/LogoutButton.tsx — clears the dnd session and returns to login.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={styles.button}
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/dnd/auth/logout', { method: 'POST' });
        // Back to the hub, where the name + password sign-in lives (the "SIGN IN / CLAIM NAME"
        // form). /dnd/login is the older email form; the hub is the one the pseudo-login uses.
        router.push('/dnd');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
