'use client';
// RecentBadge — the little "New" bubble on a file uploaded in the last 24 hours (owner, 2026-09-29).
// Renders nothing for any other file, so a list can put one on every row unconditionally.
import React from 'react';
import { isRecentUpload, uploadedAgo } from '@/lib/files/recent';
import './RecentBadge.css';

export default function RecentBadge({ uploadedAt, className }: { uploadedAt: string | Date | null | undefined; className?: string }) {
  if (!uploadedAt || !isRecentUpload(uploadedAt)) return null;
  const ago = uploadedAgo(uploadedAt);
  return (
    <span className={`recent-badge${className ? ` ${className}` : ''}`} title={ago} aria-label={`New — ${ago.toLowerCase()}`} data-testid="recent-upload-badge">
      New
    </span>
  );
}
