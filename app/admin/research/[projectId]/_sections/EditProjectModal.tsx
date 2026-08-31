'use client';

// app/admin/research/[projectId]/_sections/EditProjectModal.tsx — Phase B5 (under B1a).

// Third extraction from `page.tsx`, and the one that had a bug in it an hour ago: the overlay
// closed on an outside click, so a stray click beside the form threw away every edit. The owner
// asked for that to stop on 2026-08-30 and it was applied to the NEW project modal only.
//
// Extracted AFTER the fix, deliberately. Moving code and changing it in the same commit turns the
// diff from "these lines moved" into "these lines moved AND something changed", which is the shape
// a regression hides in — so the fix landed first, on its own, with its own guard.
//
// ── FIVE FIELDS, ONE SETTER, TWO CALLBACKS ──────────────────────────────────────────────────────
//
// The state stays on the page: this renders it and reports changes. `onChange` takes the same
// updater function the page's `setEditProjectData` did, so the call sites inside the form are
// unchanged and the byte-comparison against HEAD holds.

import React from 'react';
import JobLinkPicker, { type JobSummary } from '../../components/JobLinkPicker';

export interface EditProjectValue {
  name: string;
  description: string;
  property_address: string;
  county: string;
  state: string;
  /** Phase J1 — the column has existed since seeds/090 and had no UI at all. */
  job_id: string | null;
}

export interface EditProjectModalProps {
  open: boolean;
  value: EditProjectValue;
  /** The job currently linked, so the picker can name it without a second fetch. */
  linkedJob?: JobSummary | null;
  onChange: (update: (prev: EditProjectValue) => EditProjectValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}

export default function EditProjectModal({
  open, value, linkedJob, onChange, onSubmit, onClose, saving,
}: EditProjectModalProps) {
  if (!open) return null;

  return (
    <div
      className="research-modal-overlay"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Project Details"
    >
      <div className="research-modal">
        <h2 className="research-modal__title">Edit Project Details</h2>
        <form onSubmit={onSubmit}>
          <div className="research-modal__field">
            <label className="research-modal__label" htmlFor="edit-project-name">Project Name *</label>
            <input
              id="edit-project-name"
              className="research-modal__input"
              type="text"
              value={value.name}
              onChange={e => onChange(p => ({ ...p, name: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="research-modal__field">
            <label className="research-modal__label" htmlFor="edit-project-address">Property Address</label>
            <input
              id="edit-project-address"
              className="research-modal__input"
              type="text"
              value={value.property_address}
              onChange={e => onChange(p => ({ ...p, property_address: e.target.value }))}
            />
          </div>
          <div className="research-modal__row">
            <div className="research-modal__field">
              <label className="research-modal__label" htmlFor="edit-project-county">County</label>
              <input
                id="edit-project-county"
                className="research-modal__input"
                type="text"
                value={value.county}
                onChange={e => onChange(p => ({ ...p, county: e.target.value }))}
              />
            </div>
            <div className="research-modal__field">
              <label className="research-modal__label" htmlFor="edit-project-state">State</label>
              <input
                id="edit-project-state"
                className="research-modal__input"
                type="text"
                value={value.state}
                onChange={e => onChange(p => ({ ...p, state: e.target.value }))}
              />
            </div>
          </div>
          <div className="research-modal__field">
            <label className="research-modal__label" htmlFor="edit-project-desc">Description</label>
            <textarea
              id="edit-project-desc"
              className="research-modal__textarea"
              value={value.description}
              onChange={e => onChange(p => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>
          {/* ── THE JOB LINK (Phase J1) ──────────────────────────────────────────────────────
              Owner: "can link the research to a specific job if they want". Optional, and last in
              the form because it is: everything above describes the property, and this describes
              what the firm is doing about it. */}
          <div className="research-modal__field">
            <JobLinkPicker
              id="edit-project-job"
              value={value.job_id}
              linked={linkedJob ?? null}
              onChange={jobId => onChange(p => ({ ...p, job_id: jobId }))}
              disabled={saving}
            />
          </div>

          <div className="research-modal__actions">
            <button type="button" className="research-modal__cancel" onClick={() => onClose()}>
              Cancel
            </button>
            <button
              type="submit"
              className="research-modal__submit"
              disabled={!value.name.trim() || saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
