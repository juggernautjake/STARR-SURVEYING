// __tests__/hub/widget-config-render-outstanding-invoices.test.ts
//
// Slice 14 of employee-hub-overhaul-2026-05-30.md. Locks the
// outstanding-invoices widget's content → render wiring. Content
// honors the Slice-12 schema fields:
//   - maxItems (clamp to 1–20; null when invalid → falls back to size cap)
//   - sortBy   ('due-date' | 'amount' | 'customer'; else 'due-date')
//   - showAging (boolean; default true)
//
// Pure-unit tests against the resolveX / sortInvoices / agingLabel
// helpers so the body wiring is locked without rendering React (SSR
// snapshot-caching limitation again).

import { describe, it, expect } from 'vitest';
import {
  agingLabel,
  resolveMaxItems,
  resolveShowAging,
  resolveSortBy,
  sortInvoices,
  type InvoiceSortBy,
  type OutstandingInvoicesContent,
} from '@/lib/hub/widgets/outstanding-invoices';
import { getWidgetOptionsEntry } from '@/lib/hub/widget-options';

interface Invoice { id: string; client_name: string; amount: number; due_date?: string | null }
const A: Invoice = { id: 'a', client_name: 'Acme',    amount: 250.0, due_date: '2026-05-20' };
const B: Invoice = { id: 'b', client_name: 'BoiseCo', amount: 1500,  due_date: '2026-06-05' };
const C: Invoice = { id: 'c', client_name: 'Zephyr',  amount: 50,    due_date: null };

describe('Slice 14 — outstanding-invoices: schema ↔ resolvers agree', () => {
  it('schema declares the same sortBy values resolveSortBy accepts', () => {
    const entry = getWidgetOptionsEntry('outstanding-invoices');
    expect(entry.source).toBe('schema');
    if (entry.source !== 'schema') return;
    const sortField = entry.fields.find((f) => f.key === 'sortBy');
    if (!sortField || sortField.type !== 'select') return;
    const expected: ReadonlyArray<InvoiceSortBy> = ['due-date', 'amount', 'customer'];
    expect(sortField.options.map((o) => o.value).sort()).toEqual([...expected].sort());
  });
});

describe('Slice 14 — resolveSortBy', () => {
  it.each<[OutstandingInvoicesContent, InvoiceSortBy]>([
    [{ sortBy: 'due-date' }, 'due-date'],
    [{ sortBy: 'amount' },   'amount'],
    [{ sortBy: 'customer' }, 'customer'],
    [{ sortBy: 'nope' as InvoiceSortBy }, 'due-date'],
    [{}, 'due-date'],
  ])('content %j -> %s', (content, expected) => {
    expect(resolveSortBy(content)).toBe(expected);
  });
});

describe('Slice 14 — resolveMaxItems clamps to [1, 20]', () => {
  it.each<[OutstandingInvoicesContent, number | null]>([
    [{ maxItems: 5 }, 5],
    [{ maxItems: 1 }, 1],
    [{ maxItems: 20 }, 20],
    [{ maxItems: 100 }, 20],
    [{ maxItems: 0 }, null],     // out of range → null falls back to size cap
    [{ maxItems: -1 }, null],
    [{ maxItems: NaN }, null],
    [{}, null],
    [{ maxItems: 3.9 }, 3],
  ])('content %j -> %s', (content, expected) => {
    expect(resolveMaxItems(content)).toBe(expected);
  });
});

describe('Slice 14 — resolveShowAging defaults true', () => {
  it.each<[OutstandingInvoicesContent, boolean]>([
    [{ showAging: true  }, true],
    [{ showAging: false }, false],
    [{}, true],
  ])('content %j -> %s', (content, expected) => {
    expect(resolveShowAging(content)).toBe(expected);
  });
});

describe('Slice 14 — sortInvoices', () => {
  it('amount sorts descending', () => {
    const out = sortInvoices([A, B, C], 'amount');
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('customer sorts alphabetically (A → Z)', () => {
    const out = sortInvoices([B, A, C], 'customer');
    expect(out.map((i) => i.client_name)).toEqual(['Acme', 'BoiseCo', 'Zephyr']);
  });

  it('due-date sorts earliest first; null due_date sinks to the end', () => {
    const out = sortInvoices([B, C, A], 'due-date');
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('Slice 14 — agingLabel reads days late / due in / null', () => {
  const TODAY = Date.parse('2026-05-30T12:00:00Z');

  it('returns null when due_date is null / undefined / invalid', () => {
    expect(agingLabel(null, TODAY)).toBeNull();
    expect(agingLabel(undefined, TODAY)).toBeNull();
    expect(agingLabel('not-a-date', TODAY)).toBeNull();
  });

  it('returns "N days late" when due_date < now', () => {
    expect(agingLabel('2026-05-20T12:00:00Z', TODAY)).toBe('10 days late');
    expect(agingLabel('2026-05-29T12:00:00Z', TODAY)).toBe('1 day late');
  });

  it('returns "due today" on the same day', () => {
    expect(agingLabel('2026-05-30T12:00:00Z', TODAY)).toBe('due today');
  });

  it('returns "due in Nd" when due_date > now', () => {
    expect(agingLabel('2026-06-05T12:00:00Z', TODAY)).toBe('due in 6d');
  });
});
