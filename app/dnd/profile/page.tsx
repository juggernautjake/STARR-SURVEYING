// app/dnd/profile/page.tsx — /dnd profile (display name + avatar). Auth-gated (B7).
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function DndProfilePage() {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  return (
    <ProfileForm
      user={{
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url ?? null,
      }}
    />
  );
}
