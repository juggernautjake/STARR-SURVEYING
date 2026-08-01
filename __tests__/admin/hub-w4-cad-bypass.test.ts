// __tests__/admin/hub-w4-cad-bypass.test.ts
//
// Slice W4 — CAD route open to every signed-in user. Four gates
// to keep in sync (route registry, sidebar, quick-actions
// catalog, command palette) + the real middleware role list.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('CAD bypass — middleware (W4)', () => {
  const SRC = read('middleware.ts');

  it("the /admin/cad rule now lists every UserRole so no signed-in user is blocked", () => {
    const block = SRC.match(/\{\s*prefix:\s*'\/admin\/cad',\s*roles:\s*\[([^\]]*)\]\s*\}/);
    expect(block).not.toBeNull();
    const rolesList = block![1];
    for (const r of ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support', 'equipment_manager', 'employee', 'teacher', 'student', 'guest']) {
      expect(rolesList).toContain(`'${r}'`);
    }
  });
});

describe('CAD bypass — nav / quick-actions / command palette (W4)', () => {
  it('route registry no longer carries a roles: gate on /admin/cad', () => {
    const SRC = read('lib/admin/route-registry.ts');
    const line = SRC.match(/\{\s*href:\s*'\/admin\/cad'[^}]*\}/);
    expect(line).not.toBeNull();
    expect(line![0]).not.toMatch(/roles:\s*\[/);
  });

  it('the mobile drawer cannot re-introduce a CAD role gate, because it declares none', () => {
    // This used to find `{ href: '/admin/cad', … }` inside AdminSidebar.tsx and check it carried no
    // `roles:`. That entry no longer exists — the drawer derives its sections from the registry
    // (platform audit §1.3), so the gate asserted by the test ABOVE is now the only one there is.
    //
    // Stronger than the original: rather than checking that one entry lacks a gate, assert the drawer
    // has no per-item nav vocabulary at all. Hand-writing a nav item with its own `roles:` is exactly
    // how the two navigation systems came to disagree about 32 routes, and it now fails here.
    const SRC = read('app/admin/components/AdminSidebar.tsx');
    expect(SRC, 'the drawer must gate via accessibleRoutes()').toMatch(/accessibleRoutes\(/);
    expect(SRC, 'the drawer must not hand-declare route hrefs').not.toMatch(/href: '\/admin\//);
  });

  it('command palette no longer carries a roles: gate on the CAD action', () => {
    const SRC = read('app/admin/components/nav/CommandPalette.tsx');
    const cadLine = SRC.match(/href: '\/admin\/cad'[^}]*/);
    expect(cadLine).not.toBeNull();
    expect(cadLine![0]).not.toMatch(/roles:\s*\[/);
  });

  it("quick-actions catalog widens the CAD allowedRoles list to every UserRole", () => {
    const SRC = read('lib/hub/quick-actions-catalog.ts');
    const block = SRC.match(/id: 'open-cad'[\s\S]*?\},/);
    expect(block).not.toBeNull();
    const list = block![0].match(/allowedRoles:\s*\[([^\]]*)\]/)?.[1] ?? '';
    for (const r of ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support', 'equipment_manager', 'employee', 'teacher', 'student', 'guest']) {
      expect(list).toContain(`'${r}'`);
    }
  });
});
