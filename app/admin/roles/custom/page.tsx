// app/admin/roles/custom/page.tsx
//
// Slice W7 — admin role builder. Lists every custom_roles row +
// surfaces a "+ New role" form. Admin-only at the request level
// (middleware) AND the page level (the redirect).

import { redirect } from 'next/navigation';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import CustomRoleBuilderClient from './CustomRoleBuilderClient';

interface CustomRoleRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  permissions: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export default async function CustomRolesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/admin/login');
  if (!isAdmin(session.user.roles)) redirect('/admin/me');

  const { data } = await supabaseAdmin
    .from('custom_roles')
    .select('id, key, label, description, permissions, created_by, created_at')
    .order('created_at', { ascending: false })
    .returns<CustomRoleRow[]>();

  const roles = data ?? [];

  return (
    <div className="admin-content" data-testid="admin-role-builder-page">
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: '1.5rem', fontWeight: 700 }}>
          Role builder
        </h1>
        <p style={{ color: '#6B7280', margin: '0.25rem 0 0' }}>
          Define new roles on top of the built-in role list. Holders carry the role key in their
          <code style={{ marginLeft: 4 }}>registered_users.roles[]</code> array.
        </p>
      </header>

      <CustomRoleBuilderClient initialRoles={roles} />
    </div>
  );
}
