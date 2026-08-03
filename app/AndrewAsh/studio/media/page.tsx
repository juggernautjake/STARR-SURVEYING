// app/AndrewAsh/studio/media/page.tsx — the library.
//
// Everything that can appear ON the site: photographs, demo audio, video. The bundled photos of
// Andrew are listed alongside anything he uploads, because from his side they are the same thing —
// pictures he can put on a page — and making him learn that some are "built in" and some are "his"
// would be a distinction that serves the code rather than the user.
//
// Each item shows its widget id, because that is what he types into an image or gallery widget. A
// library that shows you a picture but not how to reference it is a library you cannot use.

import type { Metadata } from 'next';
import { Images } from 'lucide-react';

import StudioUploader from '../_ui/StudioUploader';
import MediaGrid from './MediaGrid';
import { supabaseAdmin } from '@/lib/supabase';
import { ANDREW_PHOTOS, photoUrl } from '@/lib/voice/photos';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function MediaPage(): Promise<React.ReactElement> {
  let uploaded: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('va_media')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    uploaded = data ?? [];
  } catch {
    uploaded = [];
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Media</h1>
          <p className="vaStudioSub">
            Photos, demo audio and video — anything that can go on a page. Private things (tax forms,
            session masters, signed agreements) belong in Documents instead.
          </p>
        </div>
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <Images size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            Add something
          </h2>
        </div>
        <StudioUploader
          destination="media"
          accept="image/*,audio/*,video/*"
          label="Choose files or drop them here"
          hint="Images, audio and video. Up to 200 MB each — a full WAV master is fine."
        />
      </div>

      <MediaGrid
        uploaded={uploaded.map((m) => ({
          id: m.id,
          title: m.title,
          kind: m.kind,
          url: m.url,
          sizeBytes: m.size_bytes ?? 0,
          isBuiltIn: false,
          reference: m.url,
        }))}
        builtIn={ANDREW_PHOTOS.map((p) => ({
          id: p.id,
          title: p.id,
          kind: 'image',
          url: photoUrl(p.id, 'card'),
          sizeBytes: 0,
          isBuiltIn: true,
          // Built-in photos are referenced by manifest id in a widget's `photoId`, not by URL —
          // that is what gets the responsive sources and the focal point.
          reference: p.id,
        }))}
      />
    </>
  );
}
