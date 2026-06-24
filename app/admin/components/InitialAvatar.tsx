'use client';
// app/admin/components/InitialAvatar.tsx
//
// One shared circular initial-avatar used everywhere a user is shown
// (top-bar account menu, user lists, employee management, …) so avatars
// look uniform across the whole app on desktop and mobile. Renders the
// photo when one exists, otherwise 1–2 initials on a deterministic,
// readable background color derived from the name.

import React from 'react';

/** 1–2 uppercase initials: first letter of the first + last word, or the
 *  first two letters of a single word. "?" when empty. */
export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Deterministic, readable (white-on-) background color from a name. */
export function avatarColor(name: string | null | undefined): string {
  const s = name ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 52%, 42%)`;
}

export interface InitialAvatarProps {
  name: string;
  size?: number;
  imageUrl?: string | null;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function InitialAvatar({
  name,
  size = 34,
  imageUrl,
  title,
  className,
  style,
}: InitialAvatarProps) {
  return (
    <span
      className={className}
      title={title}
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: imageUrl ? 'transparent' : avatarColor(name),
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
        overflow: 'hidden',
        ...style,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initialsFor(name)
      )}
    </span>
  );
}
