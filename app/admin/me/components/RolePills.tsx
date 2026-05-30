'use client';
// app/admin/me/components/RolePills.tsx
//
// Slice 2 of hub-widget-excellence-01-greeting-roles-workmode. Renders
// EVERY role the user holds as a read-only colored pill below the
// greeting block, matching the user's sketch ("Your roles: Admin
// Student Teacher etc."). Each pill's background + contrast-chosen
// foreground come from lib/admin/role-colors.ts. Replaces the old
// persona-selector chip strip (that was a hub-preview toggle, not a
// display of the user's actual roles).

import React from 'react';
import { ROLE_LABELS, type UserRole } from '@/lib/auth';
import { rolePillColors } from '@/lib/admin/role-colors';

interface RolePillsProps {
  roles: UserRole[];
}

export default function RolePills({ roles }: RolePillsProps) {
  // De-dupe while preserving order so a multi-role user gets one pill
  // per distinct role.
  const seen = new Set<UserRole>();
  const unique = roles.filter((r) => {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  if (unique.length === 0) return null;

  return (
    <div className="hub-greeting__role-pills">
      <span className="hub-greeting__role-pills-label">Your roles:</span>
      <ul className="hub-greeting__role-pills-list" role="list" aria-label="Your roles">
        {unique.map((role) => {
          const { bg, fg } = rolePillColors(role);
          return (
            <li key={role}>
              <span
                className="hub-greeting__role-pill"
                style={{ background: bg, color: fg }}
                data-role={role}
              >
                {ROLE_LABELS[role] ?? role}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
