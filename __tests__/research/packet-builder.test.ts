// Choosing what goes to the crew (research plan R25, the picker).
//
// R25 built the packet: assembly, provenance lines, versioning, approval, the PDF. R26 put the
// approved packet on the job and in Work Mode. Neither gave anybody a way to CHOOSE what is in it —
// the API took a selection and nothing produced one, so the whole deliverable path was unreachable
// in practice, which is this repo's most common defect at product scale.
//
// The default matters more than the picker. Left to a blank list people ship an empty packet or tick
// everything, so the panel opens with a sensible selection already made — and with unreviewed facts
// left OUT, because fifty unchecked values in a packet is how one reaches a crew looking
// authoritative.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const panel = read('app/admin/research/components/PacketBuilderPanel.tsx');

describe('the defaults', () => {
  it('includes every conflict by default', () => {
    // They are what a crew must resolve.
    expect(panel).toMatch(/kind: 'conflict'[\s\S]{0,200}defaultOn: true/);
  });

  it('leaves an unreviewed fact OUT by default', () => {
    expect(panel).toContain("defaultOn: !unchecked && r.status !== 'rejected'");
    expect(panel).toContain('looking authoritative');
  });

  it('does not silently tick a document nobody could read', () => {
    // Including it prints that nobody could read it, which the crew needs; ticking it silently is
    // a different thing.
    expect(panel).toContain("defaultOn: d.processing_status !== 'unreadable'");
    expect(panel).toContain('Including it prints that fact; leaving it out hides it');
  });
});

describe('what the picker tells the person ticking', () => {
  it('shows the review and evidence state on every fact', () => {
    // The two axes R23 and R17 established — a picker that showed only the value would hide both.
    expect(panel).toContain('reviewMeta(f)');
    expect(panel).toContain('evidenceFor(f)');
    expect(panel).toContain('`${r.label} · ${e.label}`');
  });

  it('puts the caution on the item, not in a legend', () => {
    expect(panel).toContain('packet-builder__item-caution');
    expect(panel).toContain('whoever ticks it is the person who needs to know');
  });

  it('counts the cautioned items in the running total', () => {
    expect(panel).toContain('cautioned');
    expect(panel).toContain('need care');
  });
});

describe('honest failures', () => {
  it('does not report a failed read as an empty project', () => {
    expect(panel).toContain('This is not an empty project');
  });

  it('says why an empty packet cannot be created', () => {
    // The API refuses it; the button says so before the click rather than after.
    expect(panel).toContain('an empty packet cannot be approved');
    expect(panel).toContain('disabled={busy || counts.total === 0}');
  });

  it('distinguishes an empty project from an empty selection', () => {
    expect(panel).toContain('Nothing has been extracted for this project yet');
  });
});

describe('the packets it has already made', () => {
  it('shows the approver on an approved packet', () => {
    expect(panel).toContain('approved by');
  });

  it('offers approval only on a draft', () => {
    // The API rejects re-approving, and a button that cannot work teaches distrust.
    expect(panel).toContain("{p.status === 'draft' && (");
    expect(panel).toContain('Approve for the field');
  });

  it('keeps a superseded packet visible rather than hiding it', () => {
    // It is evidence of what a crew was previously given.
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.packet-builder__packet--superseded');
    expect(css).toContain('evidence of what a crew was previously given');
  });

  it('links the PDF for every version', () => {
    expect(panel).toContain('/packets/${p.id}/pdf');
  });
});

describe('the wiring', () => {
  const page = read('app/admin/research/[projectId]/page.tsx');

  it('is reachable as a tab', () => {
    expect(page).toContain("'packet'");
    expect(page).toContain('<PacketBuilderPanel projectId={projectId} />');
  });

  it('sends the selection in the on-screen order', () => {
    // The order the surveyor sees is the order the packet prints.
    expect(panel).toContain('.map((c, i) => ({ kind: c.kind, refId: c.refId, order: i }))');
  });
});
