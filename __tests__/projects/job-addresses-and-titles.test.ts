/**
 * A project has no address — its jobs do; and the bar says which project or job you are on
 * (owner, 2026-09-10).
 *
 * "The project info does not have an address, but the individual jobs do. We might have a project
 * that has multiple properties with different addresses … each job should have its own quote and
 * address and name and job number." And: "in the header we have the title of the page … this one
 * says 'Admin' … we need to go through all of the project and job pages and make sure they all
 * have apt titles."
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INHERITED_FIELDS } from '@/lib/projects/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

describe('a project has no address; a job inherits only the client', () => {
  it('the inherited fields are the client and the lead surveyor — no site field', () => {
    expect([...INHERITED_FIELDS]).toEqual(['customer_id', 'client_name', 'client_email', 'client_phone', 'client_company', 'client_address', 'lead_rpls_email']);
    for (const f of ['address', 'city', 'state', 'zip', 'county', 'subdivision', 'acreage', 'latitude', 'longitude']) {
      expect((INHERITED_FIELDS as readonly string[]).includes(f), `${f} is still inherited`).toBe(false);
    }
  });

  it('the project forms have no Site fieldset', () => {
    for (const p of ['app/admin/projects/new/page.tsx', 'app/admin/projects/[id]/edit/page.tsx']) {
      const s = stripJs(read(p));
      expect(s, `${p} still asks for a site`).not.toContain('<legend>Site</legend>');
      expect(s).not.toMatch(/set\('address'\)/);
      expect(s).toContain('<legend>Client</legend>');
    }
  });

  it('the new-job form fills the client from the project and never the site', () => {
    const s = stripJs(read('app/admin/jobs/new/page.tsx'));
    expect(s).toContain("fill('client_name', p.client_name)");
    expect(s).not.toMatch(/fill\('address', p\.address\)/);
    expect(s).not.toMatch(/fill\('county', p\.county\)/);
  });

  it('the listing card lists the JOBS\' addresses, one per line, and search reaches them', () => {
    const tab = stripJs(read('app/admin/jobs/_tabs/ProjectsTab.tsx'));
    expect(tab).toContain('return (p.job_addresses ?? []).filter((a) => {');
    expect(tab).not.toContain('const own = [p.address, p.city]');
    expect(tab).toContain('className="lst-card__address-line"');
    const api = stripJs(read('app/api/admin/projects/route.ts'));
    expect(api).toContain("or(`address.ilike.%${search}%,city.ilike.%${search}%,county.ilike.%${search}%");
    expect(api).toContain('id.in.(${hitIds.join(\',\')})');
    expect(api).toContain('deleted_at, deadline, address, city, county');
    expect(api, 'the project search still reads the project\'s own address').not.toMatch(/\+ `client_company\.ilike\.%\$\{search\}%,address\.ilike/);
  });

  it('the project page shows each job in full — number, stage, name, address, survey, deadline, money', () => {
    const page = stripJs(read('app/admin/projects/[id]/page.tsx'));
    expect(page, 'the Site card is back').not.toContain('<h3>Site</h3>');
    expect(page).toContain('className={`pd__jobcard${j.is_archived');
    for (const cls of ['pd__jobcard-num', 'pd__jobcard-stage', 'pd__jobcard-name', 'pd__jobcard-facts']) expect(page).toContain(cls);
    expect(page).toContain('SURVEY_TYPES[j.survey_type] ?? j.survey_type');
    expect(page).toContain('dueBubble(j.deadline)');
    expect(page).toContain('data-testid="project-job-pay"');
    expect(page).toContain("const PAY_LABEL: Record<string, string> = { paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid' };");
    // a missing fact is a dash, never a blank
    expect((page.match(/pd__jobcard-muted">—</g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(stripJs(read('app/api/admin/projects/[id]/route.ts'))).toContain('acreage, deadline, quote_amount, final_amount, amount_paid,');
    const css = read('app/admin/styles/AdminProjects.css');
    for (const cls of ['pd__jobcard', 'pd__jobcard-head', 'pd__jobcard-facts', 'pd__jobcard-fact--money', 'pd__jobcard-pay--partial']) {
      expect(css, `.${cls} is rendered but never styled`).toContain(`.${cls}`);
    }
    expect(css, 'the old row rules linger').not.toContain('.pd__job {');
  });
});

describe('the bar says which project or job you are on', () => {
  it('a page can set its own title; the layout prefers it to the route rule', () => {
    const lib = stripJs(read('lib/admin/page-title.ts'));
    expect(lib).toContain('export function usePageTitle(');
    expect(lib).toContain('document.title = tabTitle(t)');
    expect(lib, 'the firm name is spelled here').not.toMatch(/Starr Surveying/);
    const layout = stripJs(read('app/admin/components/AdminLayoutClient.tsx'));
    expect(layout).toContain("from '@/lib/admin/page-title'");
    expect(layout).toContain('const pageTitle = ownTitle ?? getTitle(pathname);');
  });

  it('the route rules no longer fall to "Admin" for a project', () => {
    const layout = stripJs(read('app/admin/components/AdminLayoutClient.tsx'));
    expect(layout).toContain("return 'Edit Project';");
    expect(layout).toContain("return 'Project Detail';");
    expect(layout).toContain("return 'Field Captures';");
  });

  it('the project, edit-project, job and field-captures pages set their titles from their data', () => {
    expect(stripJs(read('app/admin/projects/[id]/page.tsx'))).toContain('usePageTitle(project ? projectLabel(project) : null);');
    expect(stripJs(read('app/admin/projects/[id]/edit/page.tsx'))).toContain('usePageTitle(number ? `Edit ${number}');
    expect(stripJs(read('app/admin/jobs/[id]/page.tsx'))).toContain("usePageTitle(job ? [job.job_number, job.name].filter(Boolean).join(' — ') : null);");
    expect(stripJs(read('app/admin/jobs/[id]/field/page.tsx'))).toContain('usePageTitle(data?.job ? `Field captures — ');
  });
});
