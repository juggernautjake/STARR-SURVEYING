// You can always get back to Google's consent screen.
//
// Owner, 2026-08-17: *"I am not seeing the connect / reconnect google ads button on the marketing
// page. Please make sure it is easy to find and is surfaced."*
//
// Three separate things had to be true and only one was:
//
//   1. The tab holding it was called "Upload log", which gives nobody a reason to open it looking
//      for connection settings.
//   2. The connect block rendered ONLY when `problem === 'not-connected'`, so once an account was
//      linked there was no way to RE-authorise it — and re-authorising is how a new permission gets
//      granted, which is exactly what Google's move to the Data Manager API now requires.
//   3. Nothing said the connection was missing that permission. It reads reports fine; only the
//      uploads are dead, and a healthy-looking connection with no error is the hardest state to spot.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const tab = read('app/admin/marketing/_tabs/UploadsTab.tsx');
const page = read('app/admin/marketing/page.tsx');
const banner = read('app/admin/marketing/AdsAccessBanner.tsx');
const uploadsRoute = read('app/api/admin/marketing/uploads/route.ts');

describe('the tab is named for what people go looking for', () => {
  it('says "Connection" in the label, not only "Upload log"', () => {
    expect(page).toMatch(/label: 'Connection & uploads'/);
  });

  it('and the hint mentions connecting, not just the log', () => {
    expect(page).toMatch(/hint: '[^']*[Cc]onnect/);
  });
});

describe('reconnect exists once an account is linked', () => {
  it('is keyed on customerId, NOT on the absence of a problem', () => {
    // Gating on `!conn.problem` hid the button whenever anything was wrong — including a revoked
    // refresh token, which this button is the fix for. Caught by driving the page.
    expect(tab).toMatch(/conn\?\.customerId && \(/);
    expect(tab).toContain('uploads-reconnect-button');
  });

  it('passes the account id explicitly rather than through state', () => {
    // `setCustomerId(x)` then `connect()` sends the PREVIOUS value: `connect` closes over state as
    // it was at render. That produces a consent screen for the wrong account, and only in a browser.
    expect(tab).toMatch(/connect\(conn\.customerId \?\? ''\)/);
    expect(tab).toMatch(/const connect = useCallback\(async \(forCustomerId\?: string\)/);
  });

  it('and the initial connect form still exists for a fresh account', () => {
    expect(tab).toContain('uploads-connect-button');
  });
});

describe('a connection missing the Data Manager permission says so', () => {
  it('the API reports which scopes the stored connection carries', () => {
    expect(uploadsRoute).toMatch(/scopes:\s*\{/);
    expect(uploadsRoute).toContain('grantedDataManagerScope');
    // It has to read the column to know.
    expect(uploadsRoute).toMatch(/\.select\('[^']*scope'\)/);
  });

  it('and the tab renders a warning naming the consequence, not the mechanism', () => {
    expect(tab).toContain('uploads-scope-missing');
    expect(tab).toMatch(/Offline conversions are not being uploaded/);
  });
});

describe('the banner offers a way out of the state it describes', () => {
  it('links to the connection tab', () => {
    // A notice that names a fault and offers no action is the shape this codebase keeps paying for.
    expect(banner).toContain('/admin/marketing?tab=uploads');
  });
});
