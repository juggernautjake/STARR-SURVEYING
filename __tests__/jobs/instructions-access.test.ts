// __tests__/jobs/instructions-access.test.ts — slice Q3 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// > **Q3** — Verify what an admin, a secretary, the owner, a researcher and a field crew member each
// > see and can do on a job — and that nothing important is admin-only by accident.
//
// It was. **The field crew could not read the field-crew instructions.**
//
// Read access was org membership alone, which needs a `registered_users.default_org_id` AND a
// matching `organization_members` row. The firm's only `field_crew` user has neither, so
// `GET /api/admin/jobs/<id>/instructions` — the route Work Mode's Instructions tab calls — returned
// 403 and the crew saw *"Could not load instructions."* on the truck.
//
// Nothing looked wrong from the office: every admin has an org row, so every screen an admin opened
// worked. This is only visible by signing in as somebody else, which is the entire argument for the
// role matrix being a slice rather than an assumption.

import { describe, it, expect } from 'vitest';
import { canReadInstructions, canWriteInstructions, type InstructionsActor } from '@/lib/jobs/instructions';

const actor = (over: Partial<InstructionsActor> = {}): InstructionsActor =>
  ({ orgRole: null, sameOrg: false, onCrew: false, isLeadRpls: false, ...over });

describe('who may read the instructions', () => {
  it('lets the field crew on the job read them — the case that was broken', () => {
    // No org row at all: exactly the state of the firm's only field_crew user.
    expect(canReadInstructions(actor({ onCrew: true }))).toBe(true);
  });

  it('lets any member of the job’s org read them', () => {
    expect(canReadInstructions(actor({ sameOrg: true, orgRole: 'view_only' }))).toBe(true);
    expect(canReadInstructions(actor({ sameOrg: true, orgRole: 'admin' }))).toBe(true);
  });

  it('refuses somebody with no claim on the job at all', () => {
    expect(canReadInstructions(actor())).toBe(false);
  });

  it('refuses an org member whose org does NOT own the job', () => {
    // `sameOrg` is separate from `orgRole` precisely so an admin of another tenant is not an admin
    // here. Collapsing the two would make every tenant's admin an admin of every job.
    expect(canReadInstructions(actor({ orgRole: 'admin', sameOrg: false }))).toBe(false);
  });

  it('lets the lead RPLS read them even with no org row and no crew row', () => {
    // They are accountable for the job whether or not anybody added them to anything — the same
    // rule jobRecipients applies when deciding who hears about it. This case was MISSING from the
    // first version of the rule and was caught by the write-implies-read invariant below: the lead
    // RPLS could author instructions and then be told the job did not exist.
    expect(canReadInstructions(actor({ isLeadRpls: true }))).toBe(true);
  });
});

describe('who may write them', () => {
  it('is the job’s lead RPLS', () => {
    expect(canWriteInstructions(actor({ isLeadRpls: true }))).toBe(true);
  });

  it('is an admin of the job’s own org', () => {
    expect(canWriteInstructions(actor({ sameOrg: true, orgRole: 'admin' }))).toBe(true);
  });

  it('is NOT the crew, even though they can read', () => {
    // The asymmetry is the point of the fix, not a leftover. The instructions are what the office
    // told the field; a crew member editing them erases the record of what they were actually told.
    const crew = actor({ onCrew: true });
    expect(canReadInstructions(crew)).toBe(true);
    expect(canWriteInstructions(crew)).toBe(false);
  });

  it('is NOT an ordinary office employee', () => {
    // `employee` with an org row reads (they are org staff) and does not author.
    const office = actor({ sameOrg: true, orgRole: 'view_only' });
    expect(canReadInstructions(office)).toBe(true);
    expect(canWriteInstructions(office)).toBe(false);
  });

  it('is NOT an admin of a different tenant', () => {
    expect(canWriteInstructions(actor({ orgRole: 'admin', sameOrg: false }))).toBe(false);
  });

  it('never lets somebody write what they cannot read', () => {
    // The invariant that makes the two functions safe to call independently: any actor shape that
    // can write must also be able to read, or a PUT would succeed against a job the caller is
    // told does not exist.
    for (const orgRole of [null, 'admin', 'view_only']) {
      for (const sameOrg of [true, false]) {
        for (const onCrew of [true, false]) {
          for (const isLeadRpls of [true, false]) {
            const a = actor({ orgRole, sameOrg, onCrew, isLeadRpls });
            if (canWriteInstructions(a)) {
              expect(canReadInstructions(a), JSON.stringify(a)).toBe(true);
            }
          }
        }
      }
    }
  });
});
