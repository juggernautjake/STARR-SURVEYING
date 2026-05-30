'use client';
// app/admin/me/components/WorkModePrompt.tsx
//
// Slice 3 of hub-widget-excellence-01-greeting-roles-workmode. The
// Enter-Work-Mode CTA used to be an <a> straight to
// /admin/work-mode/start (which fast-pathed single-role users or
// rendered a full-page RolePicker). It now opens this modal so the
// user explicitly picks WHICH role they're working under before
// entering — even single-role users see the prompt, because Slice 4
// hangs the clock-in awareness step off the same modal (entering work
// mode is independent of clocking in).
//
// This slice ships the ROLE STEP only. The clock-in branch lands in
// Slice 4 between `requestConfirm` and the actual navigation.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, type UserRole } from '@/lib/auth';
import { eligibleWorkModeRoles } from '@/lib/hub/work-mode-eligibility';

/** Destination workspace for a given work-mode role. Pure + exported
 *  so the routing target is unit-testable without a router. */
export function workModeHref(role: UserRole): string {
  return `/admin/work-mode/${role}`;
}

/** A user with exactly one eligible role is pre-selected; otherwise we
 *  force an explicit choice (null). Pure + exported for testing. */
export function preselectRole(eligible: UserRole[]): UserRole | null {
  return eligible.length === 1 ? eligible[0] : null;
}

const ROLE_BLURB: Partial<Record<UserRole, string>> = {
  field_crew: 'Jobs, photos, time, and field data.',
  drawer: 'CAD drawings + time on drafting work.',
  researcher: 'Research pipelines + adjacent deeds.',
  equipment_manager: 'Check gear in/out + maintenance.',
  admin: 'Org-wide work, with every role panel.',
  developer: 'Internal tooling + diagnostics.',
  tech_support: 'Investigate tickets + reset user state.',
};

interface WorkModeRoleStepProps {
  eligible: UserRole[];
  selectedRole: UserRole | null;
  onSelectRole: (role: UserRole) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Pure presentational role-picker step. Rendered inside the modal;
 *  exported so it can be SSR-rendered + asserted directly without
 *  driving the stateful wrapper's open/close. */
export function WorkModeRoleStep({
  eligible,
  selectedRole,
  onSelectRole,
  onConfirm,
  onCancel,
}: WorkModeRoleStepProps) {
  return (
    <div className="work-mode-prompt__step">
      <p className="work-mode-prompt__question" id="work-mode-prompt-question">
        What role are you working under?
      </p>
      <ul className="work-mode-prompt__roles" role="list">
        {eligible.map((role) => {
          const active = role === selectedRole;
          return (
            <li key={role}>
              <button
                type="button"
                className="work-mode-prompt__role"
                data-role={role}
                aria-pressed={active}
                data-active={active ? 'true' : undefined}
                onClick={() => onSelectRole(role)}
              >
                <span className="work-mode-prompt__role-name">
                  {ROLE_LABELS[role] ?? role}
                </span>
                {ROLE_BLURB[role] && (
                  <span className="work-mode-prompt__role-blurb">
                    {ROLE_BLURB[role]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="work-mode-prompt__actions">
        <button
          type="button"
          className="work-mode-prompt__btn work-mode-prompt__btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="work-mode-prompt__btn work-mode-prompt__btn--primary"
          disabled={!selectedRole}
          onClick={onConfirm}
        >
          Enter Work Mode
        </button>
      </div>
    </div>
  );
}

interface WorkModePromptProps {
  roles: UserRole[];
  /** Trigger button class names so it matches the greeting CTA. */
  triggerClassName?: string;
  triggerLabel?: string;
}

export default function WorkModePrompt({
  roles,
  triggerClassName = 'hub-btn hub-btn--primary hub-greeting__work-mode-btn',
  triggerLabel = 'Enter Work Mode',
}: WorkModePromptProps) {
  const router = useRouter();
  const eligible = useMemo(() => eligibleWorkModeRoles(roles), [roles]);
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(() =>
    preselectRole(eligible),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Re-seed the pre-selected role each time the modal opens so a
  // single-role user always lands ready-to-confirm.
  function openPrompt() {
    setSelectedRole(preselectRole(eligible));
    setOpen(true);
  }

  function closePrompt() {
    setOpen(false);
    // Return focus to the trigger for keyboard users.
    triggerRef.current?.focus();
  }

  function confirm() {
    if (!selectedRole) return;
    // Slice 4 inserts the clock-in awareness step here before nav.
    router.push(workModeHref(selectedRole));
  }

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePrompt();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={openPrompt}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="hub-greeting__work-mode-label">{triggerLabel}</span>
      </button>

      {open && (
        <div
          className="work-mode-prompt__overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="work-mode-prompt-title"
          aria-describedby="work-mode-prompt-question"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePrompt();
          }}
        >
          <div className="work-mode-prompt__modal">
            <header className="work-mode-prompt__header">
              <h2 id="work-mode-prompt-title" className="work-mode-prompt__title">
                Enter Work Mode
              </h2>
              <button
                type="button"
                className="work-mode-prompt__close"
                aria-label="Close"
                onClick={closePrompt}
              >
                ×
              </button>
            </header>
            <WorkModeRoleStep
              eligible={eligible}
              selectedRole={selectedRole}
              onSelectRole={setSelectedRole}
              onConfirm={confirm}
              onCancel={closePrompt}
            />
          </div>
        </div>
      )}
    </>
  );
}
