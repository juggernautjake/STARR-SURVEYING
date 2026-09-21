/**
 * Reading the detail page out of its HTML.
 *
 * ── THE BUG THIS CLOSES ─────────────────────────────────────────────────────────────────────────
 *
 * `williamsonStage1` could parse a detail page from the day it was written and was never handed
 * one: the pipeline passed no `detailText`, so every Williamson run returned a property id and an
 * owner and then reported no legal description, no acreage and no subdivision. The three most
 * valuable fields on the page, missing from every run, with nothing failing anywhere.
 *
 * Found by looking for the caller of an option that had no caller.
 *
 * ── WHY THE TAG LIST IS EXPLICIT ────────────────────────────────────────────────────────────────
 *
 * `parseWcadDetail` reads label-line-then-value-line. The page lays those out as adjacent table
 * rows, so the block-level tags ARE the line breaks. Get that wrong and "Legal Description" joins
 * its own value on one line, every label lookup shifts by one, and each field silently returns its
 * neighbour's contents — which is worse than returning nothing.
 */

import { describe, it, expect } from 'vitest';
import { htmlToFieldText, fetchWcadDetail, parseWcadDetail } from '../counties/williamson/wcad.js';

describe('htmlToFieldText', () => {
  it('turns adjacent table rows into label and value lines', () => {
    const html = '<table><tr><td>Legal Description</td></tr><tr><td>VILLAGE GREEN (EXEMPT), LOT 1</td></tr></table>';
    const t = htmlToFieldText(html);
    expect(parseWcadDetail('R1', t).legalDescription).toBe('VILLAGE GREEN (EXEMPT), LOT 1');
  });

  it('drops script and style, which would land between a label and its value', () => {
    const html = '<tr><td>Owner Name</td></tr><script>var x="Account";</script><style>.a{}</style><tr><td>CITY OF ROUND ROCK</td></tr>';
    expect(parseWcadDetail('R1', htmlToFieldText(html)).ownerName).toBe('CITY OF ROUND ROCK');
  });

  it('turns &nbsp; into a space, so an EMPTY cell reads as empty', () => {
    // Left as the entity, a blank value cell looks like content and the field returns "&nbsp;".
    const html = '<tr><td>Map Number</td></tr><tr><td>&nbsp;</td></tr><tr><td>3-5927</td></tr>';
    const d = parseWcadDetail('R1', htmlToFieldText(html));
    expect(d.mapNumber).toBe('3-5927');
  });

  it('decodes the entities this page uses', () => {
    const t = htmlToFieldText('<tr><td>Owner Name</td></tr><tr><td>SMITH &amp; JONES &quot;THE FIRM&quot;</td></tr>');
    expect(parseWcadDetail('R1', t).ownerName).toBe('SMITH & JONES "THE FIRM"');
  });

  it('decodes numeric entities', () => {
    expect(htmlToFieldText('<p>&#65;&#66;</p>')).toContain('AB');
  });

  it('collapses horizontal whitespace but KEEPS the lines', () => {
    // The whole point. Collapsing newlines too would join every label to its value.
    const t = htmlToFieldText('<tr><td>  Account   </td></tr>\n\n\n<tr><td>   R-16-5591   </td></tr>');
    const lines = t.split('\n').filter(Boolean);
    expect(lines).toContain('Account');
    expect(lines).toContain('R-16-5591');
  });

  it('strips comments', () => {
    const t = htmlToFieldText('<tr><td>Account</td></tr><!-- Legal Description --><tr><td>R-1</td></tr>');
    expect(parseWcadDetail('R1', t).account).toBe('R-1');
  });

  it.each([['empty', ''], ['null', null], ['undefined', undefined], ['plain text', 'no tags here']])(
    '%s does not throw', (_l, v) => {
      expect(() => htmlToFieldText(v as string)).not.toThrow();
    },
  );

  it('an unclosed tag does not swallow the rest of the page', () => {
    // Real WebForms output is not always well-formed.
    const t = htmlToFieldText('<tr><td>Owner Name<tr><td>CITY OF ROUND ROCK');
    expect(t).toContain('CITY OF ROUND ROCK');
  });
});

describe('the whole page, as the site actually serves it', () => {
  /** Trimmed but structurally faithful: the label/value row pairs WCAD emits. */
  const PAGE = `
    <html><head><title>PublicAccess &gt; Property Detail</title></head><body>
    <script>var junk = "Legal Description";</script>
    <div><span>PROPERTY:</span></div><div><span>R075105</span></div>
    <table>
      <tr><th>Property Type</th></tr><tr><td>C3</td></tr>
      <tr><th>Legal Description</th></tr><tr><td>VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82</td></tr>
      <tr><th>Account</th></tr><tr><td>R-16-5591-EX00-0001</td></tr>
      <tr><th>Map Number</th></tr><tr><td>3-5927</td></tr>
      <tr><th>Effective Acres</th></tr><tr><td>0.000000</td></tr>
      <tr><th>Owner Name</th></tr><tr><td>CITY OF ROUND ROCK</td></tr>
      <tr><th>Mailing Address</th></tr><tr><td>221 MAIN ST ROUND ROCK, TX 78664-5299</td></tr>
      <tr><td>Total Main Area (Exterior Measured):</td></tr><tr><td>24,420 Sq. Ft</td></tr>
      <tr><td>YEAR BUILT:</td></tr><tr><td>2002</td></tr>
      <tr><td>LAND SIZE:</td></tr><tr><td>122,839 Sq. ft / 2.820000 acres</td></tr>
    </table></body></html>`;

  const d = parseWcadDetail('R075105', htmlToFieldText(PAGE));

  it('reads every field the run was silently missing', () => {
    expect(d.legalDescription).toBe('VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82');
    expect(d.account).toBe('R-16-5591-EX00-0001');
    expect(d.mapNumber).toBe('3-5927');
    expect(d.ownerName).toBe('CITY OF ROUND ROCK');
    expect(d.propertyType).toBe('C3');
  });

  it('takes acreage from the LAND SEGMENT, not from Effective Acres', () => {
    // Effective Acres reads 0.000000 on this parcel while the land segment says 2.82. Trusting the
    // first reports a two-and-a-half-acre property as having no land.
    expect(d.acres).toBe(2.82);
  });

  it('reads the improvement', () => {
    expect(d.improvementSqFt).toBe(24420);
    expect(d.yearBuilt).toBe(2002);
  });
});

describe('fetching it', () => {
  const fake = (body: string, ok = true, status = 200) =>
    (async () => ({ ok, status, text: async () => body })) as unknown as typeof fetch;

  it('asks for the right URL', async () => {
    const calls: string[] = [];
    const impl = (async (u: string) => {
      calls.push(String(u));
      return { ok: true, status: 200, text: async () => '<tr><td>Owner Name</td></tr><tr><td>X</td></tr>' } as unknown as Response;
    }) as unknown as typeof fetch;

    await fetchWcadDetail('R075105', 'O011710', impl);
    expect(calls[0]).toContain('PropertyQuickRefID=R075105');
    expect(calls[0]).toContain('PartyQuickRefID=O011710');
  });

  it('a non-200 is an ERROR, not an empty detail', async () => {
    // "This parcel has no legal description" and "we could not fetch the page carrying it" are
    // different facts, and only one belongs in a report.
    const r = await fetchWcadDetail('R1', null, fake('', false, 503));
    expect(r.detail).toBeNull();
    expect(r.error).toContain('503');
  });

  it('a thrown fetch is reported rather than swallowed', async () => {
    const impl = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    const r = await fetchWcadDetail('R1', null, impl);
    expect(r.detail).toBeNull();
    expect(r.error).toContain('ECONNRESET');
  });

  it('an EMPTY page parses to nulls rather than throwing', async () => {
    const r = await fetchWcadDetail('R1', null, fake('<html></html>'));
    expect(r.error).toBeNull();
    expect(r.detail!.legalDescription).toBeNull();
    expect(r.detail!.propertyId).toBe('R1');
  });

  it('works without a party id', async () => {
    const calls: string[] = [];
    const impl = (async (u: string) => {
      calls.push(String(u));
      return { ok: true, status: 200, text: async () => '' } as unknown as Response;
    }) as unknown as typeof fetch;
    await fetchWcadDetail('R1', null, impl);
    expect(calls[0]).not.toContain('PartyQuickRefID');
  });
});
