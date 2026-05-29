import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/pending-receipts';
import '@/lib/hub/widgets/pending-time-off';
import '@/lib/hub/widgets/pending-hours';
import '@/lib/hub/widgets/monthly-revenue';
import '@/lib/hub/widgets/outstanding-invoices';

describe('phase 17 — office + financial widgets', () => {
  it('pending-receipts → office', () => { expect(getWidget('pending-receipts')?.category).toBe('office'); });
  it('pending-time-off → office', () => { expect(getWidget('pending-time-off')?.category).toBe('office'); });
  it('pending-hours → office', () => { expect(getWidget('pending-hours')?.category).toBe('office'); });
  it('monthly-revenue → financial, admin-only', () => {
    const def = getWidget('monthly-revenue');
    expect(def?.category).toBe('financial');
    expect(def?.allowedRoles).toEqual(['admin']);
  });
  it('outstanding-invoices → financial', () => { expect(getWidget('outstanding-invoices')?.category).toBe('financial'); });
});
