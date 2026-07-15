// __tests__/dnd/dm-grant.test.ts — DM-granted custom content core (IG builder Slice 6).
// Validation gates a grant on name + mechanics; add/remove/read round-trip; a granted element is always
// DM-granted (never blocked) once tagged into a character's provenance.
import { describe, it, expect } from 'vitest';
import { validateGrant, readGrants, addGrant, removeGrant, GRANTABLE_KINDS } from '@/lib/dnd/dm-grant';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('dm-grant validation (Slice 6)', () => {
  it('requires a name and mechanics, and clamps an unknown kind to "other"', () => {
    expect(validateGrant({ name: '', mechanics: 'x' }).ok).toBe(false);
    expect(validateGrant({ name: 'Ember Ward', mechanics: '' }).ok).toBe(false);
    const ok = validateGrant({ kind: 'feat', name: '  Ember Ward  ', mechanics: '  +2 fire resistance  ' });
    expect(ok.ok).toBe(true);
    expect(ok.grant).toEqual({ kind: 'feat', name: 'Ember Ward', mechanics: '+2 fire resistance' });
    expect(validateGrant({ kind: 'nonsense', name: 'X', mechanics: 'does a thing' }).grant?.kind).toBe('other');
  });

  it('rejects over-long name/mechanics', () => {
    expect(validateGrant({ name: 'a'.repeat(121), mechanics: 'ok' }).ok).toBe(false);
    expect(validateGrant({ name: 'ok', mechanics: 'a'.repeat(2001) }).ok).toBe(false);
  });

  it('exposes a stable grantable-kind list', () => {
    expect(GRANTABLE_KINDS).toContain('feat');
    expect(GRANTABLE_KINDS).toContain('weapon');
    expect(GRANTABLE_KINDS).toContain('other');
  });
});

describe('dm-grant add/remove/read (Slice 6)', () => {
  it('adds, reads back, and removes a grant by id', () => {
    const g = validateGrant({ kind: 'ability', name: 'Second Wind', mechanics: 'Regain 1d6 once per rest.' }).grant!;
    let list = addGrant([], g, { id: 'grant-1', grantedBy: 'Jake', grantedAt: '2026-07-15T00:00:00Z' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'grant-1', name: 'Second Wind', grantedBy: 'Jake', kind: 'ability' });
    // read tolerates raw json and drops malformed entries
    const roundTripped = readGrants([...list, { name: 'no id, dropped' }, null, 'bad']);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].id).toBe('grant-1');
    list = removeGrant(list, 'grant-1');
    expect(list).toHaveLength(0);
  });
});

describe('dm-grant flows into provenance as dm-granted (Slice 6)', () => {
  it('a granted element is dm-granted and never blocking, even in a vanilla-only campaign', () => {
    const char = blankCharacter('Testy');
    // A homebrew feature on the sheet would normally be blocking custom…
    char.features = [{ name: 'Ember Ward', desc: '' } as never];
    const withoutGrant = summarizeCharacterProvenance(char, 'intuitive-games', []);
    expect(withoutGrant.hasBlockingCustom).toBe(true);
    // …but once the DM grants it, it's dm-granted and no longer blocks a vanilla-only submit.
    const g = validateGrant({ kind: 'feat', name: 'Ember Ward', mechanics: 'fire ward' }).grant!;
    const grants = addGrant([], g, { id: 'grant-1', grantedBy: 'DM', grantedAt: null });
    const withGrant = summarizeCharacterProvenance(char, 'intuitive-games', grants);
    expect(withGrant.hasBlockingCustom).toBe(false);
    expect(withGrant.dmGranted.some((e) => e.name === 'Ember Ward')).toBe(true);
  });
});
