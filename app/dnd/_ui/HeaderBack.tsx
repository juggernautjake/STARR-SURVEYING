// app/dnd/_ui/HeaderBack.tsx — a "back to last page" control for the /dnd header.
// Client island: uses router.back() so it returns to wherever the user came from. Hidden on the
// hub root (/dnd) where there's nothing meaningful to go back to.
'use client';

import { useRouter, usePathname } from 'next/navigation';
import styles from './hextech.module.css';

export default function HeaderBack() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === '/dnd') return null;
  return (
    <button
      type="button"
      className={styles.siteNavLink}
      onClick={() => router.back()}
      aria-label="Back to last page"
      title="Back to last page"
      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      ← Back
    </button>
  );
}
