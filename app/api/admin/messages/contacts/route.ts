// app/api/admin/messages/contacts/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET: Get list of contacts (all employees in the domain)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get unique emails from conversation_participants table
  // This gives us all known users who have ever participated in a conversation
  const { data: knownUsers } = await supabaseAdmin
    .from('conversation_participants')
    .select('user_email')
    .order('user_email');

  const uniqueEmails: string[] = [...new Set<string>((knownUsers || []).map((u: { user_email: string }) => u.user_email))];

  // Also check if we have admin emails that should always be available
  const ADMIN_EMAILS = [
    'hankmaddux@starr-surveying.com',
    'jacobmaddux@starr-surveying.com',
    'info@starr-surveying.com',
  ];

  const allEmails: string[] = [...new Set<string>([...uniqueEmails, ...ADMIN_EMAILS])].filter(
    (email: string) => email !== session.user!.email
  );

  // Build contact list with display names
  const contacts = allEmails.map(email => {
    const name = email.split('@')[0]
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\./g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    return {
      email,
      name,
      is_admin: ADMIN_EMAILS.includes(email),
    };
  });

  return NextResponse.json({ contacts });
}
