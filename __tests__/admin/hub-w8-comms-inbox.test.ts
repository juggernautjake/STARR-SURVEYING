// __tests__/admin/hub-w8-comms-inbox.test.ts
//
// Slice W8 — consolidated comms-inbox widget. Pure helpers cover
// the count math + bucket → layout decision. Source-locks pin
// the widget id, register-all wiring, and the size-relative
// testid contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { commsLayoutForBucket, totalCommsCount } from '@/lib/hub/widgets/comms-inbox';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('totalCommsCount (pure)', () => {
  it('sums unread DMs, mention count, and open discussion count', () => {
    expect(totalCommsCount({
      conversations: [{ id: 'a', title: null, last_message_preview: null, unread_count: 3 }, { id: 'b', title: null, last_message_preview: null, unread_count: 2 }],
      mentions: [{ id: 'm1', body: 'hi', sender_email: 'a@b.c', created_at: 'x' }],
      discussions: [{ id: 't1', title: 't', status: 'open' }, { id: 't2', title: 't', status: 'open' }],
    })).toBe(3 + 2 + 1 + 2);
  });

  it('treats missing unread_count as 0', () => {
    expect(totalCommsCount({
      conversations: [{ id: 'a', title: null, last_message_preview: null }],
      mentions: [],
      discussions: [],
    })).toBe(0);
  });
});

describe('commsLayoutForBucket (pure)', () => {
  it('maps each bucket to its layout variant', () => {
    expect(commsLayoutForBucket('tiny')).toBe('tiny');
    expect(commsLayoutForBucket('small')).toBe('small');
    expect(commsLayoutForBucket('medium')).toBe('medium');
    expect(commsLayoutForBucket('large')).toBe('three');
    expect(commsLayoutForBucket('xlarge')).toBe('three');
  });
});

describe('comms-inbox widget registration + render (W8)', () => {
  const SRC = read('lib/hub/widgets/comms-inbox/index.tsx');

  it('registers with id "comms-inbox"', () => {
    expect(SRC).toMatch(/defineWidget<CommsContent>\(\{\s*\n\s*id: 'comms-inbox'/);
  });

  it("default size is 6×3 so the consolidated tile reads as a row by default", () => {
    expect(SRC).toMatch(/defaultSize: \{ w: 6, h: 3 \}/);
  });

  it("treats 401 / 403 as 'empty' (auth says you can't see comms; not a broken service)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative content: tiny / small / medium / large / xlarge each have a stable testid', () => {
    expect(SRC).toMatch(/data-testid="comms-inbox-tiny"/);
    expect(SRC).toMatch(/data-testid="comms-inbox-small"/);
    expect(SRC).toMatch(/data-testid="comms-inbox-medium"/);
    expect(SRC).toMatch(/data-testid=\{`comms-inbox-\$\{bucket\}`\}/);
  });

  it('large + xlarge render three sections (Messages / Mentions / Discussions)', () => {
    // 3-column grid layout chosen for large/xlarge.
    expect(SRC).toMatch(/gridTemplateColumns: '1fr 1fr 1fr'/);
    // Badge testid is interpolated from `label.toLowerCase()`, so
    // the literal lives in the SectionHeader call sites — assert
    // the three labels are passed at render time.
    expect(SRC).toMatch(/<SectionHeader label="Messages"/);
    expect(SRC).toMatch(/<SectionHeader label="Mentions"/);
    expect(SRC).toMatch(/<SectionHeader label="Discussions"/);
  });

  it('xlarge widens each section to 8 rows (more room → more rows)', () => {
    expect(SRC).toMatch(/bucket === 'xlarge' \? 8 : 5/);
  });
});

describe('register-all wires comms-inbox (W8)', () => {
  it('imports the new widget directory', () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/comms-inbox'/);
  });
});
