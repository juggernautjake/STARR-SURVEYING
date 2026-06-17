// __tests__/employee-pond/e12-visibility.test.ts
//
// employee-pond Slice E12 — privacy contract foundation. Locks
// the role matrix, the field defaults, and the visibility helper
// branches (own profile, admin role, per-toggle filter, always-
// admin-only salary/payout).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_VISIBILITY_ROLES,
  ALWAYS_ADMIN_ONLY_FIELDS,
  DEFAULT_EMPLOYEE_PRIVACY,
  filterEmployeeView,
  hydrateEmployeePrivacy,
  viewerSeesEverything,
  type EmployeePrivacy,
  type FullEmployeeProfile,
} from '@/lib/employee-pond/visibility';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const target: FullEmployeeProfile = {
  email: 'hank@starr-surveying.com',
  name: 'Hank Maddux',
  phone: '254-555-1234',
  date_of_birth: '1965-05-12',
  gender: 'male',
  address: '123 FM 436, Belton, TX',
  hire_date: '2010-03-01',
  job_title: 'Lead Surveyor',
  employment_type: 'full_time',
  avatar_url: 'https://example.com/hank.png',
  hourly_rate: 85,
  annual_salary: 175000,
  bonuses_total_cents: 850000,
  recent_hours_total: 168,
  jobs_history_count: 412,
  photos_count: 2104,
  payout_history: [],
};

describe('ADMIN_VISIBILITY_ROLES', () => {
  it('contains the four roles that see everything', () => {
    expect(ADMIN_VISIBILITY_ROLES).toEqual([
      'admin',
      'developer',
      'tech_support',
      'equipment_manager',
    ]);
  });
});

describe('ALWAYS_ADMIN_ONLY_FIELDS', () => {
  it('locks salary + payout fields as never-public', () => {
    expect(ALWAYS_ADMIN_ONLY_FIELDS).toEqual([
      'hourly_rate',
      'annual_salary',
      'payout_history',
    ]);
  });
});

describe('DEFAULT_EMPLOYEE_PRIVACY — sensible defaults', () => {
  it('contact + employment-context default to PUBLIC', () => {
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_full_name_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_email_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_phone_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_hire_date_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_job_title_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_employment_type_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_photos_to_employees).toBe(true);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_jobs_history_to_employees).toBe(true);
  });

  it('personal + pay-adjacent fields default to PRIVATE', () => {
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_dob_to_employees).toBe(false);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_gender_to_employees).toBe(false);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_address_to_employees).toBe(false);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_hours_to_employees).toBe(false);
    expect(DEFAULT_EMPLOYEE_PRIVACY.show_bonuses_to_employees).toBe(false);
  });
});

describe('viewerSeesEverything', () => {
  it('true when viewing your own profile (regardless of role)', () => {
    expect(
      viewerSeesEverything(
        { email: 'hank@starr-surveying.com', roles: ['employee'] },
        'HANK@starr-surveying.com',
      ),
    ).toBe(true);
  });

  it('true for each admin-visibility role', () => {
    for (const role of ADMIN_VISIBILITY_ROLES) {
      expect(
        viewerSeesEverything(
          { email: 'other@example.com', roles: [role] },
          'hank@starr-surveying.com',
        ),
      ).toBe(true);
    }
  });

  it('false for general-visibility roles', () => {
    expect(
      viewerSeesEverything(
        { email: 'other@example.com', roles: ['employee', 'field_crew'] },
        'hank@starr-surveying.com',
      ),
    ).toBe(false);
  });
});

describe('filterEmployeeView — own profile', () => {
  it('user looking at their own profile always sees everything', () => {
    const result = filterEmployeeView({
      viewer: { email: 'hank@starr-surveying.com', roles: ['employee'] },
      target,
      // even with maxed-out privacy, the owner still sees their own data
      targetPrivacy: {
        ...DEFAULT_EMPLOYEE_PRIVACY,
        show_full_name_to_employees: false,
        show_email_to_employees: false,
      },
    });
    expect(result.name).toBe('Hank Maddux');
    expect(result.hourly_rate).toBe(85);
  });
});

describe('filterEmployeeView — admin viewer', () => {
  it('any admin role sees every field including salary + payout', () => {
    const result = filterEmployeeView({
      viewer: { email: 'admin@example.com', roles: ['admin'] },
      target,
    });
    expect(result.hourly_rate).toBe(85);
    expect(result.annual_salary).toBe(175000);
    expect(result.payout_history).toEqual([]);
  });

  it('developer + tech_support + equipment_manager all share the admin treatment', () => {
    for (const role of ['developer', 'tech_support', 'equipment_manager'] as const) {
      const result = filterEmployeeView({
        viewer: { email: 'x@example.com', roles: [role] },
        target,
      });
      expect(result.hourly_rate).toBe(85);
    }
  });
});

describe('filterEmployeeView — general viewer + default privacy', () => {
  const viewer = { email: 'pal@example.com', roles: ['employee'] as const };

  it('public defaults: name + email + phone + employment context all visible', () => {
    const result = filterEmployeeView({ viewer, target });
    expect(result.name).toBe('Hank Maddux');
    expect(result.email).toBe('hank@starr-surveying.com');
    expect(result.phone).toBe('254-555-1234');
    expect(result.hire_date).toBe('2010-03-01');
    expect(result.job_title).toBe('Lead Surveyor');
    expect(result.employment_type).toBe('full_time');
    expect(result.avatar_url).toBe('https://example.com/hank.png');
    expect(result.jobs_history_count).toBe(412);
  });

  it("private-by-default: dob + gender + address + hours + bonuses NEVER appear in the result", () => {
    const result = filterEmployeeView({ viewer, target });
    expect(result.date_of_birth).toBeUndefined();
    expect(result.gender).toBeUndefined();
    expect(result.address).toBeUndefined();
    expect(result.recent_hours_total).toBeUndefined();
    expect(result.bonuses_total_cents).toBeUndefined();
  });

  it("salary + payout NEVER appear regardless of any user toggle (admin-only enforcement)", () => {
    const result = filterEmployeeView({
      viewer,
      target,
      // hypothetically a user could try to flip pay-data toggles
      // (the columns don't even exist in the schema, but if a
      // malformed object came through the helper must still deny).
      targetPrivacy: {
        ...DEFAULT_EMPLOYEE_PRIVACY,
        // not in the interface but worth checking
      } as EmployeePrivacy,
    });
    expect(result.hourly_rate).toBeUndefined();
    expect(result.annual_salary).toBeUndefined();
    expect(result.payout_history).toBeUndefined();
  });
});

describe('filterEmployeeView — user opted to share more', () => {
  const viewer = { email: 'pal@example.com', roles: ['employee'] as const };

  it('flipping dob on → it appears in the result', () => {
    const result = filterEmployeeView({
      viewer,
      target,
      targetPrivacy: {
        ...DEFAULT_EMPLOYEE_PRIVACY,
        show_dob_to_employees: true,
      },
    });
    expect(result.date_of_birth).toBe('1965-05-12');
  });

  it("flipping gender on but the underlying value is null → field is omitted", () => {
    const result = filterEmployeeView({
      viewer,
      target: { ...target, gender: null },
      targetPrivacy: {
        ...DEFAULT_EMPLOYEE_PRIVACY,
        show_gender_to_employees: true,
      },
    });
    expect(result.gender).toBeUndefined();
  });
});

describe('filterEmployeeView — user opted to share less', () => {
  const viewer = { email: 'pal@example.com', roles: ['employee'] as const };

  it("hide-name fallback renders 'Employee' so the UI still has something", () => {
    const result = filterEmployeeView({
      viewer,
      target,
      targetPrivacy: { ...DEFAULT_EMPLOYEE_PRIVACY, show_full_name_to_employees: false },
    });
    expect(result.name).toBe('Employee');
  });

  it("email is the ID and is always returned (even if the toggle was false)", () => {
    const result = filterEmployeeView({
      viewer,
      target,
      targetPrivacy: { ...DEFAULT_EMPLOYEE_PRIVACY, show_email_to_employees: false },
    });
    expect(result.email).toBe('hank@starr-surveying.com');
  });

  it("phone hides when toggle off (even though underlying value is set)", () => {
    const result = filterEmployeeView({
      viewer,
      target,
      targetPrivacy: { ...DEFAULT_EMPLOYEE_PRIVACY, show_phone_to_employees: false },
    });
    expect(result.phone).toBeUndefined();
  });
});

describe('hydrateEmployeePrivacy', () => {
  it('null/undefined input returns the defaults', () => {
    expect(hydrateEmployeePrivacy(null)).toEqual(DEFAULT_EMPLOYEE_PRIVACY);
    expect(hydrateEmployeePrivacy(undefined)).toEqual(DEFAULT_EMPLOYEE_PRIVACY);
  });

  it('partial input merges over defaults (override semantics)', () => {
    const merged = hydrateEmployeePrivacy({ show_dob_to_employees: true });
    expect(merged.show_dob_to_employees).toBe(true);
    expect(merged.show_full_name_to_employees).toBe(true); // still default
    expect(merged.show_bonuses_to_employees).toBe(false); // still default
  });
});

describe('seeds/295_employee_privacy.sql — schema', () => {
  const SQL = read('seeds/295_employee_privacy.sql');

  it('creates the employee_privacy table with user_email as PK', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.employee_privacy/);
    expect(SQL).toMatch(/user_email[\s\S]*?PRIMARY KEY/);
  });

  it('declares every contact + employment + media field with the documented defaults', () => {
    // contact / employment defaults: true
    expect(SQL).toMatch(/show_full_name_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_email_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_phone_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_hire_date_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_job_title_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_employment_type_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_photos_to_employees[\s\S]*?DEFAULT true/);
    expect(SQL).toMatch(/show_jobs_history_to_employees[\s\S]*?DEFAULT true/);
    // personal + pay-adjacent defaults: false
    expect(SQL).toMatch(/show_dob_to_employees[\s\S]*?DEFAULT false/);
    expect(SQL).toMatch(/show_gender_to_employees[\s\S]*?DEFAULT false/);
    expect(SQL).toMatch(/show_address_to_employees[\s\S]*?DEFAULT false/);
    expect(SQL).toMatch(/show_hours_to_employees[\s\S]*?DEFAULT false/);
    expect(SQL).toMatch(/show_bonuses_to_employees[\s\S]*?DEFAULT false/);
  });

  it('does NOT declare salary / payout columns (those are admin-only at the JS layer)', () => {
    expect(SQL).not.toMatch(/show_salary_to_employees/);
    expect(SQL).not.toMatch(/show_payout_history_to_employees/);
  });

  it('has updated_at index for "recently changed" admin diagnostics', () => {
    expect(SQL).toMatch(/idx_employee_privacy_updated_at[\s\S]*?\(updated_at DESC\)/);
  });
});
