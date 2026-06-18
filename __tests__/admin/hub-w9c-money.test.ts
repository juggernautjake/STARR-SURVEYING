// __tests__/admin/hub-w9c-money.test.ts
//
// Slice W9c — consolidated money widget. Pure helpers +
// source-lock for the size-relative contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fmtCents, fmtUSD, moneyLayoutForBucket } from '@/lib/hub/widgets/money';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('fmtUSD (pure)', () => {
  it('formats a positive number as USD currency', () => {
    expect(fmtUSD(1234.5)).toBe('$1,234.50');
  });

  it('formats zero as $0.00', () => {
    expect(fmtUSD(0)).toBe('$0.00');
  });

  it("returns '—' for null / undefined / NaN", () => {
    expect(fmtUSD(null)).toBe('—');
    expect(fmtUSD(undefined)).toBe('—');
    expect(fmtUSD(Number.NaN)).toBe('—');
  });
});

describe('fmtCents (pure)', () => {
  it('divides cents by 100 then formats as USD', () => {
    expect(fmtCents(123450)).toBe('$1,234.50');
  });

  it('formats 0 cents as $0.00', () => {
    expect(fmtCents(0)).toBe('$0.00');
  });

  it("returns '—' for null / undefined / NaN", () => {
    expect(fmtCents(null)).toBe('—');
    expect(fmtCents(undefined)).toBe('—');
    expect(fmtCents(Number.NaN)).toBe('—');
  });
});

describe('moneyLayoutForBucket (pure)', () => {
  it('returns tiny / small / medium / three for each bucket', () => {
    expect(moneyLayoutForBucket('tiny')).toBe('tiny');
    expect(moneyLayoutForBucket('small')).toBe('small');
    expect(moneyLayoutForBucket('medium')).toBe('medium');
    expect(moneyLayoutForBucket('large')).toBe('three');
    expect(moneyLayoutForBucket('xlarge')).toBe('three');
  });
});

describe('money widget registration + render (W9c)', () => {
  const SRC = read('lib/hub/widgets/money/index.tsx');

  it('registers with id "money"', () => {
    expect(SRC).toMatch(/defineWidget<MoneyContent>\(\{\s*\n\s*id: 'money'/);
  });

  it("treats 401 / 403 as 'empty' (matches the W5 / W8 / W9a / W9b pattern)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative testids: tiny / small / medium static + per-bucket dynamic at large / xlarge', () => {
    expect(SRC).toMatch(/data-testid="money-tiny"/);
    expect(SRC).toMatch(/data-testid="money-small"/);
    expect(SRC).toMatch(/data-testid="money-medium"/);
    expect(SRC).toMatch(/data-testid=\{`money-\$\{bucket\}`\}/);
  });

  it('large + xlarge render three columns (Pay + Revenue + Outstanding)', () => {
    expect(SRC).toMatch(/threeColStyle/);
    expect(SRC).toMatch(/gridTemplateColumns: '1fr 1fr 1fr'/);
    expect(SRC).toMatch(/<PaySection\s/);
    expect(SRC).toMatch(/<RevenueSection\s/);
    expect(SRC).toMatch(/<InvoiceSection\s/);
  });

  it('per-section "Open →" links route to pay / reports / finances', () => {
    expect(SRC).toMatch(/href="\/admin\/me\?tab=pay"/);
    expect(SRC).toMatch(/href="\/admin\/reports"/);
    expect(SRC).toMatch(/href="\/admin\/finances"/);
  });

  it('xlarge bucket shows the invoice list (showList=true)', () => {
    expect(SRC).toMatch(/showList=\{bucket === 'xlarge'\}/);
  });

  it('uses the financial category so the Add-Widget modal groups it correctly', () => {
    expect(SRC).toMatch(/category: 'financial'/);
  });
});

describe('register-all + widget-options wire money (W9c)', () => {
  it('imports the new widget', () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/money'/);
  });

  it("the schema registry has a 'money' entry so the Slice-12 coverage spec passes", () => {
    const SRC = read('lib/hub/widget-options.ts');
    expect(SRC).toMatch(/'money':\s*\{\s*source:\s*'none'\s*\}/);
  });
});
