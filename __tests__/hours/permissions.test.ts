// __tests__/hours/permissions.test.ts
//
// Locks the employee edit/delete permission matrix (slice H9): pending
// and rejected are employee-editable/deletable; approved, adjusted, and
// disputed are admin-only.

import { describe, it, expect } from 'vitest';
import {
  canEmployeeEdit,
  canEmployeeDelete,
  EMPLOYEE_EDITABLE_STATUSES,
} from '@/lib/hours/permissions';

describe('employee time-log permission matrix', () => {
  const cases: Array<[string, boolean]> = [
    ['pending', true],
    ['rejected', true],
    ['approved', false],
    ['adjusted', false],
    ['disputed', false],
  ];

  it.each(cases)('canEmployeeEdit(%s) === %s', (status, expected) => {
    expect(canEmployeeEdit(status)).toBe(expected);
  });

  it.each(cases)('canEmployeeDelete(%s) === %s', (status, expected) => {
    expect(canEmployeeDelete(status)).toBe(expected);
  });

  it('treats null/undefined/unknown as not editable', () => {
    expect(canEmployeeEdit(null)).toBe(false);
    expect(canEmployeeEdit(undefined)).toBe(false);
    expect(canEmployeeEdit('locked')).toBe(false);
    expect(canEmployeeDelete(null)).toBe(false);
  });

  it('exposes the editable set used by the route + UI', () => {
    expect([...EMPLOYEE_EDITABLE_STATUSES]).toEqual(['pending', 'rejected']);
  });
});
