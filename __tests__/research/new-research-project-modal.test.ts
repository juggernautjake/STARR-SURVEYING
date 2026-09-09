// __tests__/research/new-research-project-modal.test.ts — the intake form from the owner's drawing.
//
// Owner, 2026-09-09: "Initial Research Information Input Modal.pdf" — six sections, each with an
// "ⓘ More Info"; "+ Add Info" opens a picker of KINDS of information, "each option should render a
// field that is designed specifically for that option, with enforced formatting"; volume/page is two
// fields with a "/"; files are listed with a View button; a research project can be linked to a
// project and to any of its jobs. The modal takes information in and sets things up — the run's
// settings live on the research page, and the analysis of notes and files happens when the run
// starts, not here.
//
// Two halves: the pure catalogue (formats, on strings) and the wiring (the caller, the API, the seed).

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';
import {
  INFO_CATEGORIES, INFO_CATEGORY_BY_ID, checkLine, linesToSupplemental, countSupplemental,
  describeLine, US_STATES, type IntakeInfoLine,
} from '@/lib/research/intake-info';

const line = (category: IntakeInfoLine['category'], values: Record<string, string>): IntakeInfoLine =>
  ({ key: 'k', category, values });

// ── The catalogue ─────────────────────────────────────────────────────────

describe('every kind of information has a field of its own shape', () => {
  it('covers what a surveyor actually arrives with', () => {
    const ids = INFO_CATEGORIES.map((c) => c.id);
    for (const want of [
      'owner_current', 'owner_previous', 'instrument', 'volume_page', 'cabinet_slide', 'subdivision',
      'abstract', 'geo_id', 'legal_description', 'acreage', 'prior_address', 'recorded_date', 'coordinates', 'other',
    ]) expect(ids).toContain(want);
  });

  it('volume/page and cabinet/slide are TWO fields joined by a slash', () => {
    expect(INFO_CATEGORY_BY_ID.volume_page.fields.map((f) => f.key)).toEqual(['volume', 'page']);
    expect(INFO_CATEGORY_BY_ID.volume_page.joiner).toBe('/');
    expect(INFO_CATEGORY_BY_ID.cabinet_slide.fields.map((f) => f.key)).toEqual(['cabinet', 'slide']);
    expect(INFO_CATEGORY_BY_ID.cabinet_slide.joiner).toBe('/');
  });

  it('every category explains itself — label, hint, help and an example', () => {
    for (const c of INFO_CATEGORIES) {
      expect(c.label.length, c.id).toBeGreaterThan(2);
      expect(c.hint.length, c.id).toBeGreaterThan(5);
      expect(c.help.length, c.id).toBeGreaterThan(40);
      expect(c.example.length, c.id).toBeGreaterThan(0);
      expect(c.fields.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe('formats are ENFORCED as they are typed', () => {
  const sanitize = (cat: IntakeInfoLine['category'], key: string, raw: string) =>
    INFO_CATEGORY_BY_ID[cat].fields.find((f) => f.key === key)!.sanitize(raw);

  it('volume and page take digits (page allows one trailing letter)', () => {
    expect(sanitize('volume_page', 'volume', 'Vol 24a66')).toBe('2466');
    expect(sanitize('volume_page', 'page', ' 385 a')).toBe('385A');
    expect(checkLine(line('volume_page', { volume: '2466', page: '385' })).ok).toBe(true);
    expect(checkLine(line('volume_page', { volume: '2466', page: '385A' })).ok).toBe(true);
    expect(checkLine(line('volume_page', { volume: '2466', page: '' })).ok).toBe(false);
    expect(checkLine(line('volume_page', { volume: '2466', page: 'ABC' })).errors.page).toMatch(/Page is a number/);
  });

  it('an instrument number is upper-cased, de-spaced and needs four digits', () => {
    expect(sanitize('instrument', 'instrument', ' 2019 - 12345 ')).toBe('2019-12345');
    expect(sanitize('instrument', 'instrument', 'opr-2019-1234')).toBe('OPR-2019-1234');
    expect(checkLine(line('instrument', { instrument: '2022074210' })).ok).toBe(true);
    expect(checkLine(line('instrument', { instrument: '2009-109100' })).ok).toBe(true);
    expect(checkLine(line('instrument', { instrument: 'ABCD' })).ok).toBe(false);
    expect(checkLine(line('instrument', { instrument: '12' })).errors.instrument).toMatch(/4–20/);
  });

  it('a cabinet is short, a slide is a number with an optional suffix', () => {
    expect(checkLine(line('cabinet_slide', { cabinet: 'C', slide: '166-APR' })).ok).toBe(true);
    expect(checkLine(line('cabinet_slide', { cabinet: 'CABINET', slide: '166' })).ok).toBe(false);
    expect(checkLine(line('cabinet_slide', { cabinet: 'C', slide: 'APR' })).ok).toBe(false);
  });

  it('names need letters; the previous-owner kind is its own bucket', () => {
    expect(checkLine(line('owner_current', { name: '12345' })).ok).toBe(false);
    expect(checkLine(line('owner_current', { name: 'GOODNIGHT, W GENE ETUX' })).ok).toBe(true);
    const s = linesToSupplemental([line('owner_current', { name: 'WANBOB LC' }), line('owner_previous', { name: 'FERRELL, GEORGE W' })]);
    expect(s.ownerNames).toEqual(['WANBOB LC']);
    expect(s.priorOwnerNames).toEqual(['FERRELL, GEORGE W']);
  });

  it('a subdivision needs a name; lot and block are optional short codes', () => {
    expect(checkLine(line('subdivision', { name: 'FREEMAN' })).ok).toBe(true);
    expect(checkLine(line('subdivision', { name: 'FREEMAN', lot: '4', block: '1' })).ok).toBe(true);
    expect(checkLine(line('subdivision', { lot: '4' })).ok).toBe(false);
    expect(sanitize('subdivision', 'lot', 'pt 4')).toBe('PT4');
  });

  it('an abstract is the number alone — "A-38" is typed as 38', () => {
    expect(sanitize('abstract', 'number', 'A-38')).toBe('38');
    expect(checkLine(line('abstract', { number: '38', survey: 'DANIEL MONROE' })).ok).toBe(true);
    expect(checkLine(line('abstract', { survey: 'DANIEL MONROE' })).ok).toBe(false);
  });

  it('acreage is a positive decimal; coordinates are in range; a recording date is real and not in the future', () => {
    expect(checkLine(line('acreage', { acres: '0.4577' })).ok).toBe(true);
    expect(checkLine(line('acreage', { acres: '0' })).errors.acres).toMatch(/more than zero/);
    expect(sanitize('acreage', 'acres', '2.3.4 ac')).toBe('2.34');
    expect(checkLine(line('coordinates', { lat: '30.9873', lng: '-97.3428' })).ok).toBe(true);
    expect(checkLine(line('coordinates', { lat: '95', lng: '-97' })).errors.lat).toMatch(/-90 to 90/);
    expect(checkLine(line('recorded_date', { date: '2009-03-17' })).ok).toBe(true);
    expect(checkLine(line('recorded_date', { date: '2009-02-30' })).ok).toBe(false);
    expect(checkLine(line('recorded_date', { date: '2999-01-01' })).errors.date).toMatch(/future/);
  });

  it('a geo id keeps dots and dashes, as the appraisal district prints it', () => {
    expect(sanitize('geo_id', 'id', 's09200-001-01-00')).toBe('S09200-001-01-00');
    expect(checkLine(line('geo_id', { id: 'S09200-001-01-00' })).ok).toBe(true);
    expect(checkLine(line('geo_id', { id: '-' })).ok).toBe(false);
  });

  it('CONTROL: an untouched line is EMPTY, not invalid — it is dropped, not a reason to refuse', () => {
    const c = checkLine(line('instrument', {}));
    expect(c.empty).toBe(true);
    expect(c.ok).toBe(false);
    expect(c.errors).toEqual({});
  });
});

describe('the lines fold into the payload the run reads', () => {
  it('keeps the four names the run has read since plan H2, and adds the rest beside them', () => {
    const s = linesToSupplemental([
      line('instrument', { instrument: '2009-109100' }),
      line('volume_page', { volume: '1093', page: '560' }),
      line('cabinet_slide', { cabinet: 'A', slide: '166-APR' }),
      line('owner_current', { name: 'WANBOB LC' }),
      line('subdivision', { name: 'FREEMAN', block: '1' }),
      line('abstract', { number: '38', survey: 'DANIEL MONROE' }),
      line('geo_id', { id: 'S09200-001-01-00' }),
      line('legal_description', { text: 'S09200 FREEMAN BLK 1 W PT OF' }),
      line('acreage', { acres: '0.4577' }),
      line('prior_address', { address: 'RR 2 BOX 114' }),
      line('recorded_date', { date: '2009-03-17' }),
      line('coordinates', { lat: '30.9873', lng: '-97.3428' }),
      line('other', { label: 'Title file', value: '24-001873' }),
      line('instrument', {}),                       // empty → dropped
      line('volume_page', { volume: 'x', page: '1' }), // cannot happen through the form; dropped, not passed on
    ]);
    expect(s.instrumentNumbers).toEqual(['2009-109100']);
    expect(s.volumePages).toEqual([{ volume: '1093', page: '560' }]);
    expect(s.cabinetSlides).toEqual([{ cabinet: 'A', slide: '166-APR' }]);
    expect(s.ownerNames).toEqual(['WANBOB LC']);
    expect(s.subdivisions).toEqual([{ name: 'FREEMAN', block: '1' }]);
    expect(s.abstracts).toEqual([{ number: '38', survey: 'DANIEL MONROE' }]);
    expect(s.geoIds).toEqual(['S09200-001-01-00']);
    expect(s.legalDescriptions).toEqual(['S09200 FREEMAN BLK 1 W PT OF']);
    expect(s.acreages).toEqual([0.4577]);
    expect(s.priorAddresses).toEqual(['RR 2 BOX 114']);
    expect(s.recordedDates).toEqual(['2009-03-17']);
    expect(s.coordinates).toEqual([{ lat: 30.9873, lng: -97.3428 }]);
    expect(s.other).toEqual([{ label: 'Title file', value: '24-001873' }]);
    expect(countSupplemental(s)).toBe(13);
    expect(countSupplemental(linesToSupplemental([]))).toBe(0);
    expect(countSupplemental(null)).toBe(0);
  });

  it('describes a line the way it was typed', () => {
    expect(describeLine(line('volume_page', { volume: '1093', page: '560' }))).toBe('1093 / 560');
    expect(describeLine(line('subdivision', { name: 'FREEMAN', lot: '4' }))).toBe('FREEMAN, 4');
  });

  it('Texas leads the state list', () => {
    expect(US_STATES[0].code).toBe('TX');
    expect(US_STATES.length).toBeGreaterThanOrEqual(50);
  });
});

// ── Wiring — assert the CALLER ───────────────────────────────────────────

const MODAL = 'app/admin/research/components/NewResearchProjectModal.tsx';
const TAB = 'app/admin/research/_tabs/ProjectsTab.tsx';
const API = 'app/api/admin/research/route.ts';
const SEED = 'seeds/633_research_project_links.sql';

describe('the modal is mounted and the old inline form is gone', () => {
  it('ProjectsTab mounts it and passes the job deep link through', () => {
    const tab = readSource(TAB);
    expect(tab).toContain("import NewResearchProjectModal from '../components/NewResearchProjectModal'");
    expect(tab).toContain('<NewResearchProjectModal');
    expect(tab).toContain('jobIdFromLink={jobIdFromLink}');
    expect(tab).toContain("searchParams?.get('job')");
    // The 1,100-line inline form left with it.
    expect(tab).not.toContain('research-modal__section-title');
    expect(tab).not.toContain('data-testid="allow-paid-documents"');
  });

  it('has the six sections of the drawing, each with a More Info popover', () => {
    const src = readSource(MODAL);
    for (const title of ['Project name', 'Where is it?', 'Additional Information', 'File Upload', 'Link to a project', 'Additional Notes']) {
      expect(src, `section "${title}"`).toContain(`title="${title}"`);
    }
    expect(src).toContain('<SectionInfo title={infoTitle ?? title} open={infoOpen} onToggle={setInfoOpen}>');
    expect(src).toContain('More Info');
    expect(src).toContain('role="dialog" aria-label={title}');
    // The card renders IN FLOW under the section, never floating: a floating card above the first
    // section was clipped by the modal's scroll area when this was driven in the browser.
    const css = readSource('app/admin/research/components/NewResearchProjectModal.css');
    const card = css.slice(css.indexOf('.nrp-info__card {'), css.indexOf('}', css.indexOf('.nrp-info__card {')));
    expect(card).not.toContain('position: absolute');
    const picker = css.slice(css.indexOf('.nrp-picker {'), css.indexOf('}', css.indexOf('.nrp-picker {')));
    expect(picker).not.toContain('position: absolute');
  });

  it('the fields the drawing marks required are marked, and the Property ID is not', () => {
    const src = readSource(MODAL);
    for (const id of ['np-street-number', 'np-city', 'np-state', 'np-zip', 'np-county']) expect(src).toContain(`htmlFor="${id}" required`);
    expect(src).toContain('htmlFor="np-parcel">Property ID');
    expect(src).not.toContain('htmlFor="np-parcel" required');
    // A Property ID stands in for the address on a tract that has none; county is always required.
    expect(src).toContain("const hasIdentifier = hasFullAddress || Boolean(form.parcel_id.trim());");
    expect(src).toContain("if (!hasCounty) missing.push('the county');");
  });

  it('street number and name stay SEPARATE fields under one label (seed 624)', () => {
    const src = readSource(MODAL);
    expect(src).toContain('id="np-street-number"');
    expect(src).toContain('id="np-street-name"');
    expect(src).toContain('className="nrp-street"');
  });

  it('renders the info lines from the catalogue — no category is decided in the component', () => {
    const src = readSource(MODAL);
    expect(src).toContain("from '@/lib/research/intake-info'");
    expect(src).toContain('INFO_CATEGORIES.map((c) =>');
    expect(src).toContain('onChange={(e) => onChange(field.key, field.sanitize(e.target.value))}');
    expect(src).toContain('const check = checkLine(line);');
    expect(src).toContain('data-testid="add-info"');
    expect(src, 'a hard-coded volume/page input would be a second copy of the format').not.toContain('placeholder="Vol"');
  });

  it('lists files with size and a View button, through the SAME uploader as the project page', () => {
    const src = readSource(MODAL);
    expect(src).toContain('formatFileSize(f.size)');
    expect(src).toContain('onClick={() => viewFile(f)}');
    expect(src).toContain('URL.createObjectURL(f)');
    expect(src).toContain('uploadDocuments(data.project.id, files)');
    expect(src).toContain('validateFiles(picked)');
    expect(src).toContain('if (uploadFailed)');
  });

  it('links to a project and its jobs: search, confirm, tick jobs, all-jobs', () => {
    const src = readSource(MODAL);
    expect(src).toContain('/api/admin/projects?${params}');
    expect(src).toContain('/api/admin/projects/${projectId}');
    expect(src).toContain('Confirm link');
    expect(src).toContain('All jobs');
    expect(src).toContain("onJobs={(ids) => set('job_ids', ids)}");
    // From a job deep link: the job's project is linked and the job itself is ticked.
    expect(src).toContain('project_id: job.project_id ?? p.project_id');
    expect(src).toContain('job_ids: [job.id]');
  });

  it('carries no run settings — those belong to the research page (owner, 2026-09-09)', () => {
    const src = readSource(MODAL);
    expect(src).not.toContain('allow_paid_documents');
    expect(src).not.toContain('assessRunReadiness');
    expect(src).toContain('are chosen on the next page');
  });

  it('posts the whole form state plus the folded lines, then navigates', () => {
    const src = readSource(MODAL);
    expect(src).toMatch(/JSON\.stringify\(\{\s*\.\.\.form, county, name: projectName, supplemental: linesToSupplemental\(lines\)/);
    expect(src).toContain('router.push(`/admin/research/${data.project.id}`)');
  });

  it('every class it renders is defined in the sheet it imports', () => {
    const src = readSource(MODAL);
    expect(src).toContain("import './NewResearchProjectModal.css'");
    const css = readSource('app/admin/research/components/NewResearchProjectModal.css');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
    const rendered = new Set<string>();
    for (const m of src.matchAll(/className="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) rendered.add(c);
    for (const m of src.matchAll(/className=\{`([^`]+)`\}/g)) for (const c of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (c) rendered.add(c);
    const missing = [...rendered].filter((c) => !defined.has(c) && !defined.has(c.split('--')[0]));
    expect(missing, 'rendered but never styled').toEqual([]);
    // And every colour is a token, so the dark skins and the print sheet reach it.
    expect(css).not.toMatch(/style=/);
    const tokens = css.match(/var\((--theme-[a-z-]+)/g) ?? [];
    expect(tokens.length).toBeGreaterThan(40);
  });
});

describe('the link reaches the database (seed 633)', () => {
  it('the seed adds project_id and the join table, and backfills from job_id', () => {
    const seed = readSource(SEED);
    expect(seed).toContain('ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id)');
    expect(seed).toContain('CREATE TABLE IF NOT EXISTS research_project_jobs');
    expect(seed).toContain('PRIMARY KEY (research_project_id, job_id)');
    expect(seed).toContain('INSERT INTO research_project_jobs (research_project_id, job_id)');
  });

  it('POST stores project_id, mirrors job_id to the first linked job, and writes the join rows', () => {
    const api = readSource(API);
    expect(api).toMatch(/const \{[^}]*project_id, job_ids[^}]*\} = body;/s);
    expect(api).toContain('job_id: linkedJobIds[0] ?? null,');
    expect(api).toContain('project_id: linkedProjectId,');
    expect(api).toContain(".from('research_project_jobs')");
    expect(api).toContain('linked_job_ids: linkedJobIds');
    // A single job_id from an older client still links.
    expect(api).toContain("if (linkedJobIds.length === 0 && typeof job_id === 'string' && job_id) linkedJobIds.push(job_id);");
  });

  it('PATCH accepts project_id, so the link is not write-once (the job_id defect, again)', () => {
    expect(readSource(API)).toContain('allowed.project_id = updates.project_id ? String(updates.project_id) : null;');
  });

  it('the supplemental payload is counted generically, so a new kind needs no API edit', () => {
    const api = readSource(API);
    expect(api).toContain("import { countSupplemental } from '@/lib/research/intake-info'");
    expect(api).toContain('countSupplemental(supplemental) > 0 ? supplemental : null');
    expect(api).not.toContain('supplemental.cabinetSlides?.length');
  });

  it('the owner name still reaches the clerk search: the first "Current owner" line is the owner_name', () => {
    expect(readSource(API)).toContain("owner_name: (owner_name?.trim() || supplemental?.ownerNames?.[0]?.trim() || null)");
  });
});
