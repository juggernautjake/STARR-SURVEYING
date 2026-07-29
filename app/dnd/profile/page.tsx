// app/dnd/profile/page.tsx — /dnd profile: who you are, and what you have here (B7, P11-9).
//
// This page was a display-name field, an avatar picker and a password form — everything about your
// ACCOUNT and nothing about your PLAY. The brief names it directly, so it now also answers "what do I
// have on this site": characters, tables, homebrew and recent sheet changes, each with a count and a way
// through to the page that does that thing properly.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import { loadProfileSummary } from '@/lib/dnd/profile-summary';
import ProfileForm from './ProfileForm';
import ProfileSections from './ProfileSections';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Profile | Starr Tabletop' };

export default async function DndProfilePage() {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const summary = await loadProfileSummary(user.id);

  return (
    <ProfileForm
      user={{
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url ?? null,
      }}
      sections={<ProfileSections summary={summary} />}
    />
  );
}
