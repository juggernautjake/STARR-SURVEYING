// __tests__/dnd/log-edit.test.ts — DND_RULES Slice 20: manual sheet edits route through the SAME
// audit vocabulary (`dnd_sheet_edits`) as the AI and DM overrides. Covers the pure diff that decides
// which fields become audit rows; the fetch-based poster is a thin fire-and-forget wrapper tested by
// the guard below (no-op when there's no characterId / nothing changed).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { diffFields, logManualEdit, logManualEdits } from '@/app/dnd/_sheet/lib/log-edit';

describe('diffFields — only moved fields become audit rows', () => {
  const before = { name: 'Longbow', damage: '1d8', damageType: 'piercing', bonusToHit: 0, proficient: true };
  type A = typeof before;
  const FIELDS: (keyof A)[] = ['name', 'damage', 'damageType', 'bonusToHit', 'proficient'];

  it('an untouched object produces zero rows', () => {
    expect(diffFields(before, { ...before }, 'attack.Longbow', FIELDS)).toEqual([]);
  });

  it('marks exactly the changed field, addressed by prefix.field', () => {
    const after = { ...before, damage: '1d10' };
    expect(diffFields(before, after, 'attack.Longbow', FIELDS)).toEqual([
      { path: 'attack.Longbow.damage', old: '1d8', new: '1d10' },
    ]);
  });

  it('captures multiple simultaneous changes', () => {
    const after = { ...before, name: 'Oathbow', damage: '1d10', proficient: false };
    const rows = diffFields(before, after, 'attack.Longbow', FIELDS);
    expect(rows.map((r) => r.path).sort()).toEqual([
      'attack.Longbow.damage', 'attack.Longbow.name', 'attack.Longbow.proficient',
    ]);
    const dmg = rows.find((r) => r.path.endsWith('.proficient'))!;
    expect(dmg).toEqual({ path: 'attack.Longbow.proficient', old: true, new: false });
  });

  it('normalizes undefined to null so an unset→value transition is still an auditable row', () => {
    const rows = diffFields({ x: undefined } as { x?: number }, { x: 5 }, 'attack.X', ['x']);
    expect(rows).toEqual([{ path: 'attack.X.x', old: null, new: 5 }]);
  });

  it('only diffs the fields it is asked to — an unlisted change is ignored', () => {
    const after = { ...before, damageType: 'fire' };
    expect(diffFields(before, after, 'attack.Longbow', ['name', 'damage'])).toEqual([]);
  });
});

describe('logManualEdit / logManualEdits — fire-and-forget guards', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs the diff to the character edit log when DB-backed and changed', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    logManualEdit('char-1', 'attack.Longbow.damage', '1d8', '1d10');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/dnd/characters/char-1/edits');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      field_path: 'attack.Longbow.damage', old_value: '1d8', new_value: '1d10', scope: 'permanent',
    });
  });

  it('does nothing without a characterId (a standalone/localStorage sheet has no server log)', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    logManualEdit(null, 'attack.X.damage', '1d8', '1d10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the value did not move (no-op → no row)', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    logManualEdit('char-1', 'attack.X.damage', '1d8', '1d8');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logManualEdits posts one row per change and honours the scope', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    logManualEdits('char-1', [
      { path: 'a.x', old: 1, new: 2 },
      { path: 'a.y', old: 3, new: 4 },
    ], 'temp');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).scope).toBe('temp');
  });
});
