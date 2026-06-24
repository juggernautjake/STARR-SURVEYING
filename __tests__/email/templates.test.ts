import { describe, it, expect } from 'vitest';
import {
  EMAIL_TEMPLATES,
  getEmailTemplate,
  fillTemplate,
} from '@/lib/email/templates';

describe('email templates', () => {
  it('exposes a non-empty catalog with unique ids and required fields', () => {
    expect(EMAIL_TEMPLATES.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const t of EMAIL_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.subject).toBeTruthy();
      expect(t.body).toBeTruthy();
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });

  it('getEmailTemplate returns a template by id, null otherwise', () => {
    expect(getEmailTemplate('job-update')?.id).toBe('job-update');
    expect(getEmailTemplate('does-not-exist')).toBeNull();
  });

  it('fills known placeholders case-insensitively and leaves unknown ones intact', () => {
    const out = fillTemplate('Hi [Customer Name], see you at [Job Address].', {
      'customer name': 'Jane',
    });
    expect(out).toBe('Hi Jane, see you at [Job Address].');
  });

  it('leaves placeholders intact when no values are given', () => {
    const t = getEmailTemplate('schedule-reminder')!;
    expect(fillTemplate(t.body)).toContain('[Customer Name]');
  });

  it('ignores empty replacement values (keeps the placeholder visible)', () => {
    expect(fillTemplate('Hi [Customer Name]', { 'customer name': '' })).toBe('Hi [Customer Name]');
  });
});
