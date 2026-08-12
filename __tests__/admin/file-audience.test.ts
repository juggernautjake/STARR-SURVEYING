// __tests__/admin/file-audience.test.ts
//
// F4 — "who can see this folder?", pinned.
//
// This function is not decoration. Every other gap in the file explorer costs time; a wrong answer
// HERE costs privacy — somebody reads "Only you" and puts a doctor's note or a signed offer letter
// in a folder the whole firm can open. So the cases below lean on the ones where a plausible
// implementation gets it wrong, not the happy path.

import { describe, it, expect } from 'vitest';

import { describeAudience, type NodeWithGrants } from '@/lib/files/permissions';

const node = (
  id: string,
  mode: 'inherit' | 'custom',
  grants: NodeWithGrants['grants'] = [],
  owner: string | null = null,
): NodeWithGrants => ({ id, permission_mode: mode, owner_email: owner, grants });

const everyone = { grantee_type: 'everyone' as const, grantee_value: null, access_level: 'view' as const };
const role = (r: string) => ({ grantee_type: 'role' as const, grantee_value: r, access_level: 'view' as const });
const person = (e: string) => ({ grantee_type: 'user' as const, grantee_value: e, access_level: 'view' as const });

describe('describeAudience', () => {
  it('calls a folder with no grants anywhere private', () => {
    const a = describeAudience([node('root', 'custom', [], 'jacob@starr-surveying.com')]);
    expect(a.kind).toBe('private');
    expect(a.label).toBe('Only you');
  });

  it('does NOT claim administrators are shut out', () => {
    // The honest limit of "Only you". Admins resolve to `manage` on every node, so a badge that
    // promised true privacy would be lying — and this is exactly the badge somebody would trust
    // when deciding where to put something sensitive.
    const a = describeAudience([node('n', 'custom', [], 'jacob@starr-surveying.com')]);
    expect(a.detail).toMatch(/administrators/i);
  });

  it('calls an everyone-grant company-wide', () => {
    const a = describeAudience([node('n', 'custom', [everyone])]);
    expect(a.kind).toBe('everyone');
    expect(a.label).toBe('Everyone');
  });

  it('names a single role', () => {
    const a = describeAudience([node('n', 'custom', [role('field_crew')])]);
    expect(a.kind).toBe('role');
    expect(a.label).toBe('Field Crew');       // underscores gone, title-cased
  });

  it('counts people when the shares are individuals', () => {
    const a = describeAudience([node('n', 'custom', [person('a@x.com'), person('b@x.com')])]);
    expect(a.kind).toBe('people');
    expect(a.label).toBe('2 people');
  });

  // ── The cases a plausible implementation gets wrong ─────────────────────────────────────────

  it('an everyone-grant WINS over precise shares beside it', () => {
    // The most dangerous wrong answer available. A folder shared with two named people AND with
    // everyone is a company-wide folder; reporting "2 people" would describe the narrowest grant
    // while the widest one is what actually applies.
    const a = describeAudience([
      node('n', 'custom', [person('a@x.com'), role('drawer'), everyone]),
    ]);
    expect(a.kind).toBe('everyone');
  });

  it('resolves INHERITANCE rather than reporting it', () => {
    // The tempting implementation reads the node's own grants and says "Inherited" when the mode is
    // `inherit`. That is useless AND reassuring: "inherited" sounds contained while the parent may
    // be shared with the whole firm. The chain here is a company-wide parent with an inheriting
    // child, and the child must report what actually applies to it.
    const a = describeAudience([
      node('parent', 'custom', [everyone]),
      node('child', 'inherit', []),
    ]);
    expect(a.kind).toBe('everyone');
  });

  it('uses the NEAREST custom ancestor, not the furthest', () => {
    // A private sub-folder inside a company-wide folder is private. Walking from the root down
    // instead of the target up would report "Everyone" and invite somebody to trust it.
    const a = describeAudience([
      node('root', 'custom', [everyone]),
      node('mid', 'custom', [person('jacob@starr-surveying.com')]),
      node('leaf', 'inherit', []),
    ]);
    expect(a.kind).toBe('people');
    expect(a.label).toBe('1 person');
  });

  it('treats a chain with no custom node anywhere as private', () => {
    // Nothing has ever granted access, so nobody but an owner or an admin reaches it. Reporting
    // "unknown" here would be technically defensible and practically useless.
    const a = describeAudience([node('a', 'inherit'), node('b', 'inherit')]);
    expect(a.kind).toBe('private');
  });

  it('describes a mixed role + person share without pretending it is one or the other', () => {
    const a = describeAudience([node('n', 'custom', [role('drawer'), person('a@x.com')])]);
    expect(a.kind).toBe('people');
    expect(a.detail).toMatch(/Drawer/);
    expect(a.detail).toMatch(/1 person/);
  });

  it('never throws on an empty chain', () => {
    expect(describeAudience([]).kind).toBe('unknown');
  });
});

describe('the container case — found by driving production data', () => {
  // The root folder named "Personal" is granted `everyone = view` ON PURPOSE (seed 385): it is a
  // container, and each person's own folder inside it is owner-private. Badging it "Everyone" was
  // true and frightening, which is the worst combination — a badge that cries wolf gets disbelieved
  // on the folder where it mattered.
  const everyoneView = { grantee_type: 'everyone' as const, grantee_value: null, access_level: 'view' as const };
  const everyoneEdit = { grantee_type: 'everyone' as const, grantee_value: null, access_level: 'edit' as const };

  it('calls a seeded system root with everyone-VIEW a container', () => {
    const a = describeAudience([
      { id: 'personal', permission_mode: 'custom', owner_email: null, grants: [everyoneView], is_system: true },
    ]);
    expect(a.label).toBe('Container');
    expect(a.detail).toMatch(/stays private to its owner/);
  });

  it('still calls the Shared drive company-wide, because it grants EDIT', () => {
    // The distinction is in the data, not the name.
    const a = describeAudience([
      { id: 'shared', permission_mode: 'custom', owner_email: null, grants: [everyoneEdit], is_system: true },
    ]);
    expect(a.kind).toBe('everyone');
    expect(a.label).toBe('Everyone');
  });

  it('a read-only folder somebody CREATED is still Everyone, not a container', () => {
    // Only seeded roots are `is_system`. A user's own view-only company folder must not borrow the
    // reassuring wording.
    const a = describeAudience([
      { id: 'mine', permission_mode: 'custom', owner_email: 'a@x.com', grants: [everyoneView] },
    ]);
    expect(a.kind).toBe('everyone');
  });

  it('a child INSIDE the container does not inherit the container wording', () => {
    // The container label applies to the container itself. A folder inside it that genuinely is
    // shared with everyone must say so.
    const a = describeAudience([
      { id: 'personal', permission_mode: 'custom', owner_email: null, grants: [everyoneView], is_system: true },
      { id: 'child', permission_mode: 'inherit', owner_email: null, grants: [] },
    ]);
    expect(a.label).not.toBe('Container');
  });
});
