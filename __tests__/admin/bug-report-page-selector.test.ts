// __tests__/admin/bug-report-page-selector.test.ts
//
// cad-trv-fidelity Slice 11 — the FAB bug-report flow
// (DiscussionThreadButton) lets the reporter CHOOSE which page the
// issue occurred on, defaulting to the current page. Storage + admin
// notification already exist in /api/admin/discussions; this locks the
// new page-selector wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('bug-report page selector', () => {
  const SRC = read('app/admin/components/DiscussionThreadButton.tsx');

  it('reuses the shared PAGE_TITLES route map', () => {
    expect(read('app/admin/components/AdminLayoutClient.tsx')).toMatch(/export const PAGE_TITLES/);
    expect(SRC).toMatch(/import \{ PAGE_TITLES \} from '\.\/AdminLayoutClient';/);
  });

  it('tracks a selectable page that defaults to the current pathname', () => {
    expect(SRC).toMatch(/const \[pagePath, setPagePath\] = useState\(pathname\)/);
    expect(SRC).toMatch(/useEffect\(\(\) => \{ setPagePath\(pathname\); \}, \[pathname\]\)/);
  });

  it('renders a page <select> bound to pagePath', () => {
    expect(SRC).toMatch(/value=\{pagePath\}/);
    expect(SRC).toMatch(/setPagePath\(e\.target\.value\)/);
    expect(SRC).toMatch(/Page this is about/);
  });

  it('always includes the current page as an option (even if not in PAGE_TITLES)', () => {
    expect(SRC).toMatch(/if \(!PAGE_TITLES\[pathname\]\)/);
  });

  it('submits the SELECTED page (not the hard-wired current path)', () => {
    expect(SRC).toMatch(/page_path: pagePath/);
    expect(SRC).toMatch(/page_title: PAGE_TITLES\[pagePath\]/);
  });
});

describe('bug reports are stored + alert admins (existing API)', () => {
  const API = read('app/api/admin/discussions/route.ts');
  it('inserts admin notifications on create', () => {
    expect(API).toMatch(/Notify other admins/);
    expect(API).toMatch(/from\('notifications'\)\.insert\(notifications\)/);
  });
});
