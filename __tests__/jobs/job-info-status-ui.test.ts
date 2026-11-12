// Job info and Job status, redesigned (owner, 2026-11-11: "make them more appealing and easier to
// navigate"), and job home down to six widgets.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'app/admin/jobs/[id]/page.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/admin/components/hub/Hub.css'), 'utf8');

describe('job home', () => {
  it('six tiles in a three-by-two grid', () => {
    expect(src).toContain('className="jh__tiles jh__tiles--six"');
    expect(css).toContain('.jh__tiles--six { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
  });
});

describe('Job info', () => {
  it('section links on top that jump to each card', () => {
    expect(src).toContain('<nav className="ji__jump" aria-label="Sections">');
    for (const id of ['about', 'property', 'client', 'contacts', 'notes', 'checklist', 'team', 'equipment']) {
      expect(src).toContain(`{ id: '${id}',`);
      expect(src).toContain(`id="ji-${id}"`);
    }
  });
  it('labelled fields instead of bold prefixes, and no emoji call buttons', () => {
    expect(src).toContain('<dl className="ji__fields">');
    expect(src).not.toContain('📞');
    expect(src).not.toContain('<strong>Name:</strong>');
  });
});

describe('Job status', () => {
  it('the pipeline is a row of steps you can click to move the job', () => {
    expect(src).toContain("const PIPELINE = ['quote', 'research', 'fieldwork', 'drawing', 'legal', 'delivery', 'completed'];");
    expect(src).toContain('data-testid={`job-stage-step-${k}`}');
    expect(src).toContain("onClick={() => { if (k !== job.stage) void advanceStage(k); }}");
  });
  it('on hold / cancel / resume, how long in this stage, and a visible timeline', () => {
    expect(src).toContain('data-testid="job-stage-hold"');
    expect(src).toContain('data-testid="job-stage-resume"');
    expect(src).toContain('since {formatDate(stageSince)}');
    expect(src).toContain('<ol className="jst__timeline">');
    expect(src).not.toContain('<details className="jh__stages">');
  });
  it('every class it uses is styled', () => {
    const classes = new Set(Array.from(src.matchAll(/className="([^"]+)"/g)).flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(ji|jst)__/.test(c)));
    for (const c of classes) expect(css, `.${c}`).toContain(`.${c}`);
  });
});
