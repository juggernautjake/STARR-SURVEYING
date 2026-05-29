// app/admin/learn/modules/[id]/PayImpactCallout.tsx
//
// Client component that fetches the module's credential mapping and
// renders a small callout — "Completing this module earns the {credential}
// credential which adds ${X}/hr to your pay." Hidden when the module
// isn't linked to a credential.
//
// PAY_PROGRESSION_OVERHAUL.md P-25/P-26 deferred item — shipped 2026-05-28.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface CredentialPayload {
  credentialKey: string;
  credentialLabel: string;
  bonusPerHour: number;
  description?: string | null;
}

interface Props {
  moduleId: string;
}

export default function PayImpactCallout({ moduleId }: Props) {
  const [credential, setCredential] = useState<CredentialPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/learn/modules/${moduleId}/credential`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { credential: CredentialPayload | null };
        if (!cancelled) setCredential(data.credential);
      } catch {
        // network noise — hide the callout silently
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleId]);

  if (!loaded || !credential || !credential.bonusPerHour) return null;

  const bonusStr = credential.bonusPerHour.toFixed(2);

  return (
    <div
      className="pay-impact-callout"
      style={{
        marginTop: '0.85rem',
        padding: '0.75rem 1rem',
        background: '#F0FDF4',
        border: '1px solid #BBF7D0',
        borderLeft: '4px solid var(--color-success)',
        borderRadius: '8px',
        display: 'flex',
        gap: '0.65rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>💰</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '0.88rem', fontWeight: 700, color: '#166534' }}>
          Pay impact: completing this earns the <strong>{credential.credentialLabel}</strong> credential
        </div>
        <div style={{ fontSize: '0.78rem', color: '#15803D', marginTop: '0.15rem' }}>
          Adds <strong>+${bonusStr}/hr</strong> to your hourly rate once the credential is verified by an admin.
        </div>
      </div>
      <Link
        href="/admin/pay-progression"
        style={{ fontSize: '0.78rem', fontWeight: 600, color: '#166534', textDecoration: 'none', flexShrink: 0 }}
      >
        See pay path →
      </Link>
    </div>
  );
}
