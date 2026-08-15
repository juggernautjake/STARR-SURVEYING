'use client';
// app/admin/components/jobs/JobFieldMediaPanel.tsx
//
// C0d of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Field media captured on the mobile app — corner photos, monument shots, voice notes, video —
// reviewed from the job page.
//
// ── WHY THIS ONE NEEDED REHOMING AND ITS TWO NEIGHBOURS DID NOT ─────────────────────────────────
//
// Work Mode's field-crew shell had three read-only review tabs. Checking each against the job
// detail page before porting anything (the D6b discipline: read the findings first) showed they are
// not in the same position at all:
//
//   Job FILES  — Work Mode listed `GET /api/admin/jobs/files?job_id=`, read-only. The job page's
//                Files tab hits the SAME endpoint and also uploads, deletes and attaches from the
//                file explorer. Strictly superior. Nothing to move.
//
//   PHOTOS     — the job page's Photos tab reads `…/jobs/files?section=photos`, i.e. job FILES
//                tagged as photos. That is a different collection from the one below.
//
//   FIELD MEDIA — `GET /api/admin/jobs/[id]/field-data` returns `job_media`: what the crew captured
//                on their phones, with signed thumbnail/original URLs and an upload state. NOTHING
//                on the job page reads it. The job page's own field-data call is a DIFFERENT route
//                (`/api/admin/jobs/field-data?job_id=`, the `job_field_data` points table) and
//                FieldWorkView renders no media at all.
//
// So deleting the shell would have taken the only view of mobile-captured media with it. That is
// this panel.
//
// Capture stays mobile-first — a phone is where a corner photo is taken. This is review.

import { useCallback, useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { mediaDisplay } from '@/lib/jobs/hub';

interface JobMediaItem {
  id: string;
  media_type?: string | null;
  storage_signed_url?: string | null;
  thumbnail_signed_url?: string | null;
  original_signed_url?: string | null;
  captured_at?: string | null;
  uploaded_by_name?: string | null;
  upload_state?: string | null;
}

export default function JobFieldMediaPanel({ jobId }: { jobId: string }) {
  const [media, setMedia] = useState<JobMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/field-data`);
      if (!res.ok) throw new Error('load');
      const j = await res.json();
      // The manifest degrades per collection and names what it could not read. A 200 whose
      // `unavailable` includes media is NOT an empty job — treating it as one is precisely how the
      // old gallery reported "nothing captured" for two years.
      if (Array.isArray(j.unavailable) && j.unavailable.includes('media')) {
        throw new Error('media unavailable');
      }
      setMedia((j.job_media ?? []) as JobMediaItem[]);
    } catch {
      // A failure says so. Rendering an empty grid would read as "the crew captured nothing",
      // which is the opposite of "we could not find out".
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section style={s.card} aria-labelledby="job-field-media-heading">
      <div style={s.head}>
        <h3 id="job-field-media-heading" style={s.h3}>
          <Camera size={15} strokeWidth={2} aria-hidden /> Field media
          {media.length > 0 && <span style={s.count}>{media.length}</span>}
        </h3>
      </div>
      <p style={s.muted}>
        Photos, video and voice notes captured on the mobile app. Capture happens in the field; this
        is where you review what has been uploaded.
      </p>

      {loading ? (
        <p style={s.muted}>Loading captured media…</p>
      ) : failed ? (
        <p style={s.error}>
          Could not load field media.{' '}
          <button type="button" onClick={() => void load()} style={s.retry}>Try again</button>
        </p>
      ) : media.length === 0 ? (
        <p style={s.muted}>Nothing captured for this job yet.</p>
      ) : (
        <div style={s.grid}>
          {media.map((m) => {
            const { thumbUrl, openUrl, showImage, icon } = mediaDisplay(m);
            const when = m.captured_at ? new Date(m.captured_at).toLocaleString() : undefined;
            return (
              <a
                key={m.id}
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={s.tile}
                title={when}
              >
                <div style={s.thumb}>
                  {showImage
                    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
                    ? <img src={thumbUrl} alt="" style={s.img} />
                    : <span style={{ fontSize: 26 }} aria-hidden>{icon}</span>}
                </div>
                <span style={s.caption}>{m.uploaded_by_name || m.media_type || 'media'}</span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--theme-border, #E2E5EB)',
    borderRadius: 10,
    padding: 16,
    background: 'var(--theme-bg-surface, #FFF)',
    marginBottom: 16,
    display: 'grid',
    gap: 8,
  },
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  h3: { margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: 'var(--theme-fg-primary, #101828)' },
  count: {
    marginLeft: 2, padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
    background: 'var(--theme-bg-elevated, #F2F4F7)', color: 'var(--theme-fg-secondary, #6B7280)',
  },
  muted: { margin: 0, fontSize: 12.5, color: 'var(--theme-fg-secondary, #6B7280)', lineHeight: 1.5 },
  error: { margin: 0, fontSize: 13, color: '#B42318' },
  retry: {
    border: 'none', background: 'none', padding: 0, font: 'inherit',
    color: 'var(--theme-accent, #1F6FEB)', textDecoration: 'underline', cursor: 'pointer',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(110px, 100%), 1fr))', gap: 8 },
  tile: { textDecoration: 'none', color: 'inherit', display: 'grid', gap: 3, minWidth: 0 },
  thumb: {
    aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden',
    background: 'var(--theme-bg-elevated, #F2F4F7)',
    border: '1px solid var(--theme-border, #E2E5EB)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  caption: {
    fontSize: 11.5, color: 'var(--theme-fg-secondary, #6B7280)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};
