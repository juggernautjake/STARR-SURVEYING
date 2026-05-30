// __tests__/notifications/drawing-notes-dialog.test.ts
//
// drawings-collaboration Slice 4 — locks the pure parseRecipients
// helper exported by the DrawingNotesDialog so users can paste in a
// comma-separated list and trust we'll normalize it (and not POST
// bogus values like " " or "not-an-email" to the route).

import { describe, it, expect } from 'vitest';
import { parseRecipients } from '@/app/admin/cad/components/DrawingNotesDialog';

describe('parseRecipients', () => {
  it('splits on commas, trims, lowercases', () => {
    expect(parseRecipients('Drawer@x.com,  RPLS@X.com')).toEqual(['drawer@x.com', 'rpls@x.com']);
  });

  it('drops entries without an @ sign', () => {
    expect(parseRecipients('drawer@x.com, notanemail, rpls@x.com')).toEqual(['drawer@x.com', 'rpls@x.com']);
  });

  it('drops empty entries from trailing commas / blank input', () => {
    expect(parseRecipients('')).toEqual([]);
    expect(parseRecipients('   ')).toEqual([]);
    expect(parseRecipients('a@x.com,,,')).toEqual(['a@x.com']);
  });
});
