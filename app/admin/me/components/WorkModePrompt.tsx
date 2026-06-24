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
// Slice 4 adds the clock-in awareness step: after picking a role the
// prompt reads the clock session. Clocked in → assume working (single
// Enter button). Not clocked in → "Clock in now?" (reuses ClockInModal
// + writeClockSession) or "Stay clocked out". Entering work mode never
// force-clocks-in, and a clocked-in user is never re-prompted.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, type UserRole } from '@/lib/auth';
import { eligibleWorkModeRoles } from '@/lib/hub/work-mode-eligibility';
import { ClockInModal } from '@/lib/work-mode/clock-modals';
import {
  readClockSession,
  writeClockSession,
  type ClockSession,
} from '@/lib/work-mode/clock-session';
import { useActivityTags } from '@/lib/work-mode/use-activity-tags';
import { formatElapsed } from './greeting-helpers';

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
          Continue
        </button>
      </div>
    </div>
  );
}

interface WorkModeClockStepProps {
  /** The active clock session, or null when the user isn't clocked in. */
  clock: ClockSession | null;
  /** Used to render the elapsed time for a clocked-in user. */
  nowMs?: number;
  onClockInNow: () => void;
  onStayClockedOut: () => void;
  onEnterWorking: () => void;
  onBack: () => void;
}

/** Pure presentational clock-in awareness step. Clocked in → assume the
 *  user is working (no clock-in buttons, just Enter). Not clocked in →
 *  "Clock in now?" / "Stay clocked out" — entering work mode is
 *  independent of clocking in. Exported for direct SSR assertions. */
export function WorkModeClockStep({
  clock,
  nowMs = Date.now(),
  onClockInNow,
  onStayClockedOut,
  onEnterWorking,
  onBack,
}: WorkModeClockStepProps) {
  const clockedIn = !!clock;
  return (
    <div className="work-mode-prompt__step">
      <p className="work-mode-prompt__clock-status" data-clocked-in={clockedIn ? 'true' : 'false'}>
        {clockedIn ? (
          <>
            <span className="work-mode-prompt__clock-dot" aria-hidden />
            You&apos;re clocked in
            {clock?.jobId ? ` to ${clock.jobId}` : ''}
            {clock?.startedAt ? (
              <>
                {' — '}
                <time dateTime={clock.startedAt}>
                  {formatElapsed(clock.startedAt, nowMs)}
                </time>
                {' elapsed'}
              </>
            ) : null}
            {'. '}
            We&apos;ll assume you&apos;re working.
          </>
        ) : (
          <>You&apos;re not currently clocked in. Entering work mode won&apos;t clock you in.</>
        )}
      </p>
      <div className="work-mode-prompt__actions">
        <button
          type="button"
          className="work-mode-prompt__btn work-mode-prompt__btn--ghost"
          onClick={onBack}
        >
          Back
        </button>
        {clockedIn ? (
          <button
            type="button"
            className="work-mode-prompt__btn work-mode-prompt__btn--primary"
            onClick={onEnterWorking}
          >
            Enter Work Mode
          </button>
        ) : (
          <>
            <button
              type="button"
              className="work-mode-prompt__btn work-mode-prompt__btn--ghost"
              onClick={onStayClockedOut}
            >
              Stay clocked out
            </button>
            <button
              type="button"
              className="work-mode-prompt__btn work-mode-prompt__btn--primary"
              onClick={onClockInNow}
            >
              Clock in now?
            </button>
          </>
        )}
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
  const [step, setStep] = useState<'role' | 'clock'>('role');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(() =>
    preselectRole(eligible),
  );
  const [clock, setClock] = useState<ClockSession | null>(null);
  const [clockInOpen, setClockInOpen] = useState(false);
  // Preloaded + shared so the reused ClockInModal opens fully-formed.
  const catalog = useActivityTags();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Re-seed the pre-selected role each time the modal opens so a
  // single-role user always lands ready-to-confirm.
  function openPrompt() {
    setSelectedRole(preselectRole(eligible));
    setStep('role');
    setOpen(true);
  }

  function closePrompt() {
    setOpen(false);
    setClockInOpen(false);
    setStep('role');
    // Return focus to the trigger for keyboard users.
    triggerRef.current?.focus();
  }

  // Role step → clock step. Read the (localStorage-backed) clock
  // session at confirm time so an already-clocked-in user skips the
  // clock-in buttons.
  function advanceToClockStep() {
    if (!selectedRole) return;
    setClock(readClockSession());
    setStep('clock');
  }

  // Final navigation into the role's workspace. Entering work mode is
  // independent of clock-in state — we never write a clock session here.
  const enterWorkMode = useCallback(() => {
    if (!selectedRole) return;
    router.push(workModeHref(selectedRole));
  }, [router, selectedRole]);

  // "Clock in now?" — reuse the top-bar ClockInModal. The tag catalog is
  // preloaded via useActivityTags, so the modal opens fully-formed.
  function startClockIn() {
    setClockInOpen(true);
  }

  // ClockInModal submit → persist the session, then proceed into work
  // mode. This is the ONLY place the prompt writes a clock session.
  function handleClockInSubmit({ jobId, tagIds }: { jobId: string | null; tagIds: string[] }) {
    writeClockSession({ startedAt: new Date().toISOString(), jobId, tagIds });
    setClockInOpen(false);
    enterWorkMode();
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

  // a11y — move focus into the dialog when it opens (and on step
  // change) so keyboard + screen-reader users land inside it. Focus is
  // returned to the trigger by `closePrompt`.
  useEffect(() => {
    if (!open || clockInOpen) return;
    modalRef.current?.focus();
  }, [open, clockInOpen, step]);

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

      {/* The prompt overlay hides while the nested ClockInModal is open
          so the two dialogs don't stack (ClockInModal owns the screen
          during clock-in). */}
      {open && !clockInOpen && (
        <div
          className="work-mode-prompt__overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="work-mode-prompt-title"
          aria-describedby={step === 'role' ? 'work-mode-prompt-question' : undefined}
          onClick={(e) => {
            if (e.target === e.currentTarget) closePrompt();
          }}
        >
          <div className="work-mode-prompt__modal" ref={modalRef} tabIndex={-1}>
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
            {step === 'role' ? (
              <WorkModeRoleStep
                eligible={eligible}
                selectedRole={selectedRole}
                onSelectRole={setSelectedRole}
                onConfirm={advanceToClockStep}
                onCancel={closePrompt}
              />
            ) : (
              <WorkModeClockStep
                clock={clock}
                onClockInNow={startClockIn}
                onStayClockedOut={enterWorkMode}
                onEnterWorking={enterWorkMode}
                onBack={() => setStep('role')}
              />
            )}
          </div>
        </div>
      )}

      <ClockInModal
        open={clockInOpen}
        onClose={() => setClockInOpen(false)}
        onSubmit={handleClockInSubmit}
        catalog={catalog}
      />
    </>
  );
}
