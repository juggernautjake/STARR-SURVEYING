// __tests__/projects/listing-pages-2026-09-09.test.ts — the two stacked listing pages.
//
// Owner, 2026-09-09 ("Projects Listing Page.pdf", "Research Page.pdf"): both lists simplified to
// a search bar, a Filter dropdown and vertically stacked cards, "fairly similar, but different
// enough to recognize them as different pages". The project card: name, status chip, customer,
// created, deadline, address(es), jobs complete of total, paid of quoted, project ID. The research
// card: name, research status chip, address, created, connected project. Ten a page.
//
// Pure halves first (the roll-up's new facts, sorting, paging), then the callers.

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';
import { rollUp, JOB_STAGE_COMPLETED } from '@/lib/projects/model';
import { sortRows, paginate, isOverdue, formatDate, money, SORT_OPTIONS, PAGE_SIZE } from '@/lib/admin/listing';

describe('the roll-up counts completed jobs and finds the nearest open deadline', () => {
  it('completed = live jobs at the completed stage; the deadline ignores them', () => {
    const r = rollUp([
      { stage: 'completed', deadline: '2026-01-01', quote_amount: 500, amount_paid: 500 },
      { stage: 'drawing', deadline: '2026-10-05', quote_amount: 1000, amount_paid: 0 },
      { stage: 'field_work', deadline: '2026-09-20', quote_amount: 800 },
      { stage: 'quote', deadline: null },
      { stage: 'completed', deadline: '2020-01-01', deleted_at: '2026-01-01' },   // deleted: not counted
    ]);
    expect(JOB_STAGE_COMPLETED).toBe('completed');
    expect(r.jobs).toBe(4);
    expect(r.completed).toBe(1);
    expect(r.next_deadline).toBe('2026-09-20');
    expect(r.quoted).toBe(2300);
    expect(r.paid).toBe(500);
  });

  it('a past-due open job is the nearest deadline — the most urgent, not the least', () => {
    const r = rollUp([{ stage: 'drawing', deadline: '2020-05-05' }, { stage: 'drawing', deadline: '2030-01-01' }]);
    expect(r.next_deadline).toBe('2020-05-05');
    expect(isOverdue('2020-05-05')).toBe(true);
    expect(isOverdue('2999-01-01')).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });

  it('CONTROL: no jobs → nothing complete, no deadline', () => {
    const r = rollUp([]);
    expect(r.completed).toBe(0);
    expect(r.next_deadline).toBeNull();
  });
});

describe('sorting and paging are the same for both pages', () => {
  const rows = [
    { name: 'Bravo', created_at: '2026-02-01', updated_at: '2026-03-01', due: '2026-12-01' },
    { name: 'alpha', created_at: '2026-03-01', updated_at: '2026-03-02', due: null },
    { name: 'Charlie', created_at: '2026-01-01', updated_at: '2026-09-01', due: '2026-10-01' },
  ];
  it('offers the filters the owner named — status is per page; these are the sorts', () => {
    expect(SORT_OPTIONS.map((o) => o.key)).toEqual(['newest', 'oldest', 'due_soonest', 'name_asc', 'name_desc', 'updated']);
  });
  it('newest / oldest by creation, A→Z case-insensitively, due soonest with no-deadline rows last', () => {
    expect(sortRows(rows, 'newest').map((r) => r.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
    expect(sortRows(rows, 'oldest').map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(sortRows(rows, 'name_asc').map((r) => r.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
    expect(sortRows(rows, 'name_desc').map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(sortRows(rows, 'due_soonest').map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(sortRows(rows, 'updated').map((r) => r.name)).toEqual(['Charlie', 'alpha', 'Bravo']);
  });
  it('ten a page, one-based, and an out-of-range page clamps instead of going empty', () => {
    expect(PAGE_SIZE).toBe(10);
    const many = Array.from({ length: 23 }, (_, i) => ({ i }));
    expect(paginate(many, 1).rows.map((r) => r.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(many, 3)).toMatchObject({ page: 3, pages: 3, total: 23 });
    expect(paginate(many, 3).rows).toHaveLength(3);
    expect(paginate(many, 9).page).toBe(3);
    expect(paginate(many, 0).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, total: 0 });
  });
  it('formats without ever saying "Invalid Date" or "NaN"', () => {
    expect(formatDate('2026-09-09T12:00:00Z')).toMatch(/Sep \d{1,2}, 2026/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate('garbage')).toBe('—');
    expect(money(1000)).toBe('$1,000');
    expect(money(0)).toBe('$0');
    expect(money(null)).toBe('$0');
  });
});

// ── The callers ───────────────────────────────────────────────────────────

const PROJECTS = 'app/admin/jobs/_tabs/ProjectsTab.tsx';
const RESEARCH = 'app/admin/research/_tabs/ProjectsTab.tsx';
const CONTROLS = 'app/admin/components/listing/ListingControls.tsx';
const SHEET = 'app/admin/components/listing/Listing.css';

describe('both pages share the frame and read as siblings', () => {
  it('both mount the shared search, filter dropdown and pager', () => {
    for (const f of [PROJECTS, RESEARCH]) {
      const src = readSource(f);
      expect(src, f).toContain("from '../../components/listing/ListingControls'");
      expect(src, f).toContain('<ListingSearch');
      expect(src, f).toContain('<ListingFilter');
      expect(src, f).toContain('<ListingPager');
      expect(src, f).toContain('<FilterGroup label="Sort by">');
      expect(src, f).toContain('paginate(sorted, page)');
    }
  });
  it('the column is centred and wide enough for a desktop; the project facts go two-column on wide cards', () => {
    // Owner, 2026-09-09: a 1040 px column pinned left on a 1900 px screen left the right side dead.
    const css = readSource(SHEET);
    expect(css).toMatch(/\.lst \{[^}]*max-width: 1280px;[^}]*margin: 0 auto;/s);
    expect(css).toContain('.lst-card__lines--grid { display: grid;');
    expect(readSource(PROJECTS)).toContain('className="lst-card__lines lst-card__lines--grid"');
  });
  it('and are told apart by a root modifier the sheet styles differently', () => {
    expect(readSource(PROJECTS)).toContain('className="lst lst--projects"');
    expect(readSource(RESEARCH)).toContain('className="lst lst--research research-page"');
    const css = readSource(SHEET);
    expect(css).toContain('.lst--research {');
    expect(css).toContain('.lst--research .lst-card::before');
  });
  it('the controls bring the sheet, and the research tab imports it too (the guard reads co-located imports)', () => {
    expect(readSource(CONTROLS)).toContain("import './Listing.css'");
    expect(readSource(RESEARCH)).toContain("import '../../components/listing/Listing.css'");
  });
  it('every class either page renders is defined in the shared sheet', () => {
    const css = readSource(SHEET) + readSource('app/admin/research/components/ui/primitives.css');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
    for (const f of [PROJECTS, RESEARCH, CONTROLS]) {
      const src = readSource(f);
      const rendered = new Set<string>();
      for (const m of src.matchAll(/className="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) rendered.add(c);
      for (const m of src.matchAll(/className=\{`([^`]+)`\}/g)) for (const c of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (c) rendered.add(c);
      const missing = [...rendered].filter((c) => c.startsWith('lst') && !defined.has(c) && !defined.has(c.split('--')[0]));
      expect(missing, `${f} renders unstyled classes`).toEqual([]);
    }
  });
});

describe('the project card carries what the drawing lists', () => {
  const src = readSource(PROJECTS);
  it('status chip = the PROJECT status, not a job roll-up', () => {
    expect(src).toContain('PROJECT_STATUS_LABELS[p.status]');
    expect(src).toContain('<FilterGroup label="Status">');
  });
  it('customer, created, deadline (nearest open job), address(es), jobs complete, paid of quoted, project ID', () => {
    expect(src).toContain('p.client_company || p.client_name');
    expect(src).toContain('formatDate(p.created_at)');
    expect(src).toContain('const due = p.rollup.next_deadline;');
    expect(src).toContain('function addressLines(p: Project)');
    expect(src).toContain('{p.rollup.completed}/{p.rollup.jobs}</strong> jobs complete');
    expect(src).toContain('{money(p.rollup.paid)} / {money(p.rollup.quoted)}</strong> paid');
    expect(src).toContain('<span className="lst-card__id">{p.project_number');
  });
  it('the recents strip and the assignee search are gone — keep it simple', () => {
    // The header comment SAYS they are gone, so the probe reads the code without its prose.
    const code = src.replace(/^[ \t]*\/\/[^\n]*$/gm, '');
    expect(code).not.toContain('recent=true');
    expect(code).not.toContain('assignee');
  });
  it('the API sends what the card needs: job addresses, deadlines, completed', () => {
    const api = readSource('app/api/admin/projects/route.ts');
    expect(api).toContain('deleted_at, deadline, address, city');
    expect(api).toContain('job_addresses: [...(jobAddresses.get(p.id) ?? [])]');
    expect(readSource('lib/projects/model.ts')).toContain('next_deadline: nextDeadline');
  });
});

describe('the research card carries what its drawing lists', () => {
  const src = readSource(RESEARCH);
  it('name, research-status chip, address in bold, created on the left, connected project on the right', () => {
    expect(src).toContain('STATUS_LABELS[project.status]');
    expect(src).toContain('className="lst-card__address"');
    expect(src).toContain('Created <strong>{formatDate(project.created_at)}</strong>');
    expect(src).toContain('project.linked_project');
    expect(src).toContain('Not connected to a project');
  });
  it('the list API attaches the connected project in one query', () => {
    const api = readSource('app/api/admin/research/route.ts');
    expect(api).toContain("select('id, project_number, name')");
    expect(api).toContain('linked_project: r.project_id ? (linked.get(r.project_id) ?? null) : null');
  });
  it('keeps the error state as its own state, the deep links, and the New button', () => {
    expect(src).toContain('<ErrorState');
    expect(src).toContain("searchParams?.get('new') === '1'");
    expect(src).toContain('jobIdFromLink={jobIdFromLink}');
    expect(src).toContain('data-testid="research-new"');
  });
});
