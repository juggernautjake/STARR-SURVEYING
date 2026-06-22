// __tests__/admin/pay-gate.test.ts
//
// S7 source-lock — the temporary /pay launch password gate. Verifies the gate
// is env-driven (clearing PAY_PORTAL_PASSWORD opens it), validates server-side,
// sets an httpOnly cookie, and wraps every /pay route via the layout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('pay-gate API route', () => {
  const SRC = read('app/api/public/pay-gate/route.ts');

  it('is driven by PAY_PORTAL_PASSWORD (clearing it opens the gate)', () => {
    expect(SRC).toMatch(/process\.env\.PAY_PORTAL_PASSWORD/);
    expect(SRC).toMatch(/required = password\.length > 0/);
  });

  it('validates the password server-side and rejects with 401', () => {
    expect(SRC).toMatch(/attempt !== password/);
    expect(SRC).toMatch(/status: 401/);
  });

  it('stores a hash (not the raw password) in an httpOnly cookie', () => {
    expect(SRC).toMatch(/createHash\('sha256'\)/);
    expect(SRC).toMatch(/httpOnly: true/);
  });
});

describe('PayGate wrapper + layout', () => {
  it('the /pay layout wraps children in PayGate', () => {
    const layout = read('app/pay/layout.tsx');
    expect(layout).toMatch(/import PayGate from '\.\/PayGate'/);
    expect(layout).toMatch(/<PayGate>{children}<\/PayGate>/);
  });

  it('PayGate renders children when open and a prompt when locked', () => {
    const gate = read('app/pay/PayGate.tsx');
    expect(gate).toMatch(/fetch\('\/api\/public\/pay-gate'\)/);
    expect(gate).toMatch(/data-testid="pay-gate-locked"/);
    expect(gate).toMatch(/if \(state === 'open'\) return <>{children}<\/>/);
  });
});
