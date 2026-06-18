// __tests__/admin/employee-profile-ep2b.test.ts
//
// Slice EP2b — ProfilePanel "Contact methods" section that
// consumes the EP2a API. Source-locks the JSX wiring; the API +
// helpers are exercised by employee-profile-ep2.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('ProfilePanel — Contact methods section (EP2b)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('declares the ContactMethod interface alongside the existing Profile / Cert / etc.', () => {
    expect(SRC).toMatch(/interface ContactMethod \{[\s\S]*?kind: 'phone' \| 'email' \| 'address'/);
  });

  it('owns contacts state + fetchContacts useCallback that hits the EP2a endpoint', () => {
    expect(SRC).toMatch(/const \[contacts, setContacts\] = useState<ContactMethod\[\]>/);
    expect(SRC).toMatch(/\/api\/admin\/profile\/contact-methods\?email=\$\{encodeURIComponent\(email\)\}/);
  });

  it('renders one group per CONTACT_KIND with a stable testid', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-contact-group-\$\{kind\}`\}/);
  });

  it('renders each row with a stable testid + value + label + primary badge', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-contact-row-\$\{c\.id\}`\}/);
    expect(SRC).toMatch(/\(primary\)/);
  });

  it('"Set primary" button PATCHes the row to is_primary: true', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-contact-primary-\$\{c\.id\}`\}/);
    expect(SRC).toMatch(/JSON\.stringify\(\{ id: c\.id, is_primary: true \}\)/);
  });

  it('Delete button DELETEs the row after a confirm', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-contact-delete-\$\{c\.id\}`\}/);
    expect(SRC).toMatch(/window\.confirm\('Delete this contact method\?'\)/);
    expect(SRC).toMatch(/`\/api\/admin\/profile\/contact-methods\?id=\$\{encodeURIComponent\(c\.id\)\}`/);
  });

  it('Add form posts the four fields to the EP2a endpoint', () => {
    expect(SRC).toMatch(/data-testid="profile-contact-add-form"/);
    expect(SRC).toMatch(/data-testid="profile-contact-add-kind"/);
    expect(SRC).toMatch(/data-testid="profile-contact-add-value"/);
    expect(SRC).toMatch(/data-testid="profile-contact-add-label"/);
    expect(SRC).toMatch(/data-testid="profile-contact-add-submit"/);
    expect(SRC).toMatch(/method: 'POST'[\s\S]*?body: JSON\.stringify\(\{\s*kind: contactDraft\.kind/);
  });
});
