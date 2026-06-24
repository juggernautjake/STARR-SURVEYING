// app/api/admin/messages/attachments/route.ts
// Upload an attachment for a conversation message. The file lands in a private
// `message-attachments` bucket, keyed by conversation id, and the route returns
// lightweight metadata { path, name, type, size } that the client stores on the
// outgoing message's `attachments` array. Display URLs are minted fresh (signed)
// by the messages GET route so private files never leak via a long-lived link.
//
// POST /api/admin/messages/attachments — body { conversation_id, dataUrl, name }
//
// Security: the caller must be an active participant of the conversation, mirroring
// the send route's participant check, so people can't upload into a thread they're
// not in.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per attachment

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { conversation_id?: string; dataUrl?: string; name?: string };
  const conversationId = body.conversation_id;
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });
  }
  if (typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'Expected a base64 data URL in "dataUrl".' }, { status: 400 });
  }
  const match = body.dataUrl.match(/^data:([^;]*);base64,(.*)$/s);
  if (!match) return NextResponse.json({ error: 'Only base64 data URLs are supported.' }, { status: 400 });

  // Verify the caller is an active participant of this conversation.
  const { data: participant } = await supabaseAdmin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_email', session.user.email)
    .is('left_at', null)
    .single();
  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  const mime = match[1] || 'application/octet-stream';
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const fileName = (body.name ?? 'file').trim() || 'file';
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${conversationId}/${objectId}-${safeName}`;

  await ensureStorageBucket(MESSAGE_ATTACHMENTS_BUCKET, { public: false, fileSizeLimit: MAX_BYTES });

  const { error: upErr } = await supabaseAdmin.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  return NextResponse.json({
    attachment: {
      path: storagePath,
      name: fileName,
      type: mime,
      size: bytes.length,
    },
  }, { status: 201 });
}, { routeName: 'admin/messages/attachments' });
