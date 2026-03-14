// __tests__/recon/bell-county-routing.test.ts
//
// Unit tests for Bell County auto-routing:
//   Module A — isBellCountyAddress() detection helper
//   Module B — detectCountyFromAddress() auto-fill helper
//   Module C — hasCountySpecificModule() + getCountiesWithModules()
//   Module D — BELL_COUNTY_CITIES exported list
//
// All tests are pure-logic — no live network calls.

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
//  Module A: isBellCountyAddress()
// ═══════════════════════════════════════════════════════════════════

describe('isBellCountyAddress — Bell County city/ZIP detection', () => {
  it('A-1. returns true for Belton address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('3779 W FM 436, Belton, TX 76513')).toBe(true);
  });

  it('A-2. returns true for Temple address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('1000 S 31st St, Temple, TX 76504')).toBe(true);
  });

  it('A-3. returns true for Killeen address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('1234 Rancier Ave, Killeen, TX 76541')).toBe(true);
  });

  it('A-4. returns true for Harker Heights address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('500 E Central Texas Expy, Harker Heights, TX 76548')).toBe(true);
  });

  it('A-5. returns true for Salado address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('123 Main St, Salado, TX 76571')).toBe(true);
  });

  it('A-6. returns true for explicit Bell County mention', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('123 Ranch Rd, Bell County, TX')).toBe(true);
    expect(isBellCountyAddress('Bell County, Texas')).toBe(true);
  });

  it('A-7. returns true for Bell County ZIP code 76513', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('123 Somewhere Dr, TX 76513')).toBe(true);
  });

  it('A-8. returns true for Bell County ZIP code 76501 (Temple)', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('456 N Main St 76501')).toBe(true);
  });

  it('A-9. returns false for Austin address (Travis County)', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('1234 Lavaca St, Austin, TX 78701')).toBe(false);
  });

  it('A-10. returns false for Houston address (Harris County)', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('1 Main St, Houston, TX 77002')).toBe(false);
  });

  it('A-11. returns false for empty string', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('')).toBe(false);
  });

  it('A-12. returns false for non-Bell ZIP code', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('1234 Main St, TX 78731')).toBe(false);
  });

  it('A-13. returns true for Nolanville address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('123 Comanche Gap Rd, Nolanville, TX 76559')).toBe(true);
  });

  it('A-14. returns true for Copperas Cove address', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('100 US Highway 190, Copperas Cove, TX 76522')).toBe(true);
  });

  it('A-15. case-insensitive matching for city names', async () => {
    const { isBellCountyAddress } = await import('../../worker/src/counties/router.js');
    expect(isBellCountyAddress('123 MAIN ST, BELTON, TX')).toBe(true);
    expect(isBellCountyAddress('123 Main St, TEMPLE, TX')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Module B: detectCountyFromAddress()
// ═══════════════════════════════════════════════════════════════════

describe('detectCountyFromAddress — auto-fill county field', () => {
  it('B-1. returns Bell for Bell County address when county is blank', async () => {
    const { detectCountyFromAddress } = await import('../../worker/src/counties/router.js');
    expect(detectCountyFromAddress('3779 W FM 436, Belton, TX 76513', '')).toBe('Bell');
  });

  it('B-2. returns null when county is already set', async () => {
    const { detectCountyFromAddress } = await import('../../worker/src/counties/router.js');
    expect(detectCountyFromAddress('3779 W FM 436, Belton, TX 76513', 'Bell')).toBeNull();
    expect(detectCountyFromAddress('3779 W FM 436, Belton, TX 76513', 'Travis')).toBeNull();
  });

  it('B-3. returns null when address is not Bell County', async () => {
    const { detectCountyFromAddress } = await import('../../worker/src/counties/router.js');
    expect(detectCountyFromAddress('100 Congress Ave, Austin, TX 78701', '')).toBeNull();
  });

  it('B-4. returns null for empty address', async () => {
    const { detectCountyFromAddress } = await import('../../worker/src/counties/router.js');
    expect(detectCountyFromAddress('', '')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Module C: County Module Registry
// ═══════════════════════════════════════════════════════════════════

describe('County module registry', () => {
  it('C-1. hasCountySpecificModule returns true for bell', async () => {
    const { hasCountySpecificModule } = await import('../../worker/src/counties/router.js');
    expect(hasCountySpecificModule('bell')).toBe(true);
    expect(hasCountySpecificModule('Bell')).toBe(true);
    expect(hasCountySpecificModule('BELL')).toBe(true);
  });

  it('C-2. hasCountySpecificModule returns false for other counties', async () => {
    const { hasCountySpecificModule } = await import('../../worker/src/counties/router.js');
    expect(hasCountySpecificModule('travis')).toBe(false);
    expect(hasCountySpecificModule('williamson')).toBe(false);
    expect(hasCountySpecificModule('')).toBe(false);
  });

  it('C-3. getCountiesWithModules includes bell', async () => {
    const { getCountiesWithModules } = await import('../../worker/src/counties/router.js');
    const modules = getCountiesWithModules();
    expect(modules).toContain('bell');
    expect(modules.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Module D: BELL_COUNTY_CITIES exported list
// ═══════════════════════════════════════════════════════════════════

describe('BELL_COUNTY_CITIES list', () => {
  it('D-1. includes core Bell County cities', async () => {
    const { BELL_COUNTY_CITIES } = await import('../../worker/src/counties/router.js');
    const lower = BELL_COUNTY_CITIES.map((c: string) => c.toLowerCase());
    expect(lower).toContain('belton');
    expect(lower).toContain('killeen');
    expect(lower).toContain('temple');
    expect(lower).toContain('harker heights');
    expect(lower).toContain('salado');
  });

  it('D-2. does not include non-Bell cities', async () => {
    const { BELL_COUNTY_CITIES } = await import('../../worker/src/counties/router.js');
    const lower = BELL_COUNTY_CITIES.map((c: string) => c.toLowerCase());
    expect(lower).not.toContain('austin');
    expect(lower).not.toContain('houston');
    expect(lower).not.toContain('dallas');
  });
});
