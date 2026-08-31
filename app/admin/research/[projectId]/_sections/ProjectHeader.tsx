'use client';

// app/admin/research/[projectId]/_sections/ProjectHeader.tsx — Phase B3 (under B1a).
//
// Second extraction from `page.tsx`. Title, address line, description, and the two project-level
// actions.
//
// ── EXTRACTED VERBATIM, INCLUDING THE INLINE HEXES ──────────────────────────────────────────────
//
// `#D1D5DB`, `#FECACA` and `#DC2626` are inline here, and there are tokens that would replace all
// three. They were NOT changed on the way out, deliberately.
//
// B1a's rule is "behaviour identical; the route renders the same markup", and the way each
// extraction is made trustworthy is by comparing the moved lines byte-for-byte against `HEAD`.
// Tidying colours in the same commit destroys that check — the diff stops being "these lines moved"
// and becomes "these lines moved AND something changed", which is exactly the shape in which a real
// regression hides. The inline-hex ratchet moves the count from `page.tsx` to this file and the
// total is unchanged, so nothing is lost by doing it in a separate pass.
//
// ── WHY THE ACTIONS ARE CALLBACKS ───────────────────────────────────────────────────────────────
//
// `openEditProject` opens a modal the page owns; `handleArchiveProject` mutates and navigates. Both
// stay on the page. This section renders a project and reports two clicks, which is the whole of
// what a header should be able to do.

import React from 'react';
import { MapPin, Pencil } from 'lucide-react';

/** Only the fields the header actually reads. A wider type would invite it to grow. */
export interface ProjectHeaderProject {
  name: string;
  property_address?: string | null;
  county?: string | null;
  state?: string | null;
  description?: string | null;
}

export interface ProjectHeaderProps {
  project: ProjectHeaderProject;
  onEdit: () => void;
  onArchive: () => void;
}

export default function ProjectHeader({ project, onEdit, onArchive }: ProjectHeaderProps) {
  return (
    <div className="research-page__header">
      <div>
        <h1 className="research-page__title">{project.name}</h1>
        {project.property_address && (
          <div style={{ color: 'var(--theme-fg-secondary, #374151)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            <MapPin size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />{project.property_address}
            {project.county && (
              <span className="research-county-badge">
                {project.county} County{project.state ? `, ${project.state}` : ''}
              </span>
            )}
            {!project.county && project.state && `, ${project.state}`}
          </div>
        )}
        {project.description && (
          <div style={{ color: 'var(--theme-fg-secondary, #4B5563)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {project.description}
          </div>
        )}
      </div>
      <div className="research-page__actions" style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onEdit}
          style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--theme-fg-secondary, #374151)' }}
          aria-label="Edit project details"
        >
          <Pencil size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Edit Details
        </button>
        <button
          onClick={onArchive}
          style={{ background: 'none', border: '1px solid #FECACA', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: '#DC2626' }}
          aria-label="Archive project"
        >
          Archive
        </button>
      </div>
    </div>
  );
}
