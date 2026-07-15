// __tests__/dnd/system-store.test.ts — the game-systems store's pure/guard behaviour.
import { describe, it, expect } from 'vitest';
import { entryEmbedText, searchSystemEntries } from '@/lib/dnd/system-store';

describe('system store', () => {
  it('embeds on name (weighted) + body', () => {
    const t = entryEmbedText({ name: 'Rage', body: 'Bonus damage while raging.' });
    expect(t.match(/Rage/g)?.length).toBeGreaterThanOrEqual(2); // name repeated for weight
    expect(t).toContain('Bonus damage while raging.');
  });

  it('returns nothing for an empty query — never leaks another system', async () => {
    // The empty-query guard runs before any DB/embedding call, so this is env-independent and
    // proves a blank/unscoped lookup yields no cross-system data.
    await expect(searchSystemEntries('dnd5e-2014', '   ')).resolves.toEqual([]);
  });
});
