// app/dnd/recover/page.tsx — the way back in (P2-4, audit F-3).
//
// Reachable from the hub's sign-in form. Unauthenticated by necessity: everyone who needs this page is, by
// definition, locked out.
import type { Metadata } from 'next';
import RecoverForm from '@/app/dnd/_ui/RecoverForm';

export const metadata: Metadata = {
  title: 'Recover your account',
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return <RecoverForm />;
}
