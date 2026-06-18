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

  it('admin sidebar no longer carries a roles: gate on the CAD entry', () => {
    const SRC = read('app/admin/components/AdminSidebar.tsx');
    const line = SRC.match(/\{\s*href:\s*'\/admin\/cad'[^}]*\}/);
    expect(line).not.toBeNull();
    expect(line![0]).not.toMatch(/roles:\s*\[/);
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
