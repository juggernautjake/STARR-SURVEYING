import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAMPAIGN_PREFERENCES,
  resolvePreferences,
  normalizeCampaignPreferences,
  normalizePlayerPreferences,
  type CampaignPreferences,
} from '@/lib/dnd/preferences';

// Phase 2 · P1 — the campaign/player preference resolver. The DM owns campaign-wide settings; a player may
// choose their own value ONLY where the DM allows it. These pin the clamp, the vanilla defaults, and the
// safe load-from-JSON.

const campaign = (over: Partial<CampaignPreferences> = {}): CampaignPreferences => ({
  ...DEFAULT_CAMPAIGN_PREFERENCES,
  ...over,
});

describe('the defaults are the vanilla rules, players free to choose', () => {
  it('every setting defaults to its vanilla/standard value and is player-choosable', () => {
    const d = DEFAULT_CAMPAIGN_PREFERENCES;
    expect(d.autoMechanics.value).toBe(true);
    expect(d.exhaustionModel.value).toBe('vanilla');
    expect(d.longRestModel.value).toBe('vanilla');
    expect(d.equipLimits.value).toBe('enforced');
    expect(d.diceRollerStyle.value).toBe('futuristic');
    expect(d.recordMode.value).toBe('auto');
    for (const s of Object.values(d)) expect(s.playerCanChoose).toBe(true);
  });
});

describe('resolvePreferences — the DM clamps the player', () => {
  it('a player choice wins where the campaign allows it', () => {
    const eff = resolvePreferences(campaign(), { exhaustionModel: 'flat-2-per-level', autoMechanics: false });
    expect(eff.exhaustionModel).toEqual({ value: 'flat-2-per-level', lockedByDM: false });
    expect(eff.autoMechanics).toEqual({ value: false, lockedByDM: false });
  });

  it('falls back to the campaign value when the player has not chosen', () => {
    const eff = resolvePreferences(campaign({ longRestModel: { value: 'gritty', playerCanChoose: true } }), {});
    expect(eff.longRestModel).toEqual({ value: 'gritty', lockedByDM: false });
  });

  it('a LOCKED setting can never be overridden — the DM value wins and lockedByDM is set', () => {
    const eff = resolvePreferences(
      campaign({ exhaustionModel: { value: 'vanilla', playerCanChoose: false } }),
      { exhaustionModel: 'flat-2-per-level' }, // player tries to override a locked setting
    );
    expect(eff.exhaustionModel).toEqual({ value: 'vanilla', lockedByDM: true });
  });

  it('an empty player object yields the campaign values everywhere, unlocked', () => {
    const eff = resolvePreferences(campaign());
    expect(eff.equipLimits).toEqual({ value: 'enforced', lockedByDM: false });
    expect(eff.diceRollerStyle).toEqual({ value: 'futuristic', lockedByDM: false });
  });

  // recordMode was the one resolver field the clamp/lock cases above never exercised — pin it too so the
  // roll-recording preference gets the same player-choice-vs-DM-lock guarantee as the rest (P5).
  it('recordMode clamps + locks like every other setting', () => {
    const chosen = resolvePreferences(campaign(), { recordMode: 'irl' });
    expect(chosen.recordMode).toEqual({ value: 'irl', lockedByDM: false });
    const locked = resolvePreferences(
      campaign({ recordMode: { value: 'auto', playerCanChoose: false } }),
      { recordMode: 'irl' }, // player tries to override the DM's locked recording mode
    );
    expect(locked.recordMode).toEqual({ value: 'auto', lockedByDM: true });
  });

  // Totality guard (P5): the resolver must produce EVERY effective-preference field as a well-formed
  // {value, lockedByDM}. If a new preference is added to CampaignPreferences but forgotten in
  // resolvePreferences, that key resolves to `undefined` here and this fails — the pref can't ship half-wired.
  it('resolves every campaign setting into a well-formed effective preference (no field left unwired)', () => {
    const eff = resolvePreferences(campaign());
    const campaignKeys = Object.keys(DEFAULT_CAMPAIGN_PREFERENCES).sort();
    expect(Object.keys(eff).sort()).toEqual(campaignKeys);
    for (const key of campaignKeys) {
      const p = (eff as unknown as Record<string, { value: unknown; lockedByDM: unknown }>)[key];
      expect(p, `resolvePreferences left "${key}" unwired`).toBeDefined();
      expect(p.value, `"${key}" has no value`).not.toBeUndefined();
      expect(typeof p.lockedByDM, `"${key}" has no lockedByDM flag`).toBe('boolean');
    }
  });
});

describe('normalizeCampaignPreferences — safe load from stored JSON', () => {
  it('fills every missing field with its vanilla default', () => {
    expect(normalizeCampaignPreferences({})).toEqual(DEFAULT_CAMPAIGN_PREFERENCES);
    expect(normalizeCampaignPreferences(null)).toEqual(DEFAULT_CAMPAIGN_PREFERENCES);
  });

  it('drops an invalid enum value to the default but keeps a valid playerCanChoose', () => {
    const n = normalizeCampaignPreferences({ exhaustionModel: { value: 'nonsense', playerCanChoose: false } });
    // Invalid value → vanilla default; the DM's lock (playerCanChoose:false) is preserved.
    expect(n.exhaustionModel).toEqual({ value: 'vanilla', playerCanChoose: false });
  });

  it('keeps valid values through the round-trip', () => {
    const raw = { equipLimits: { value: 'off', playerCanChoose: false }, autoMechanics: { value: false, playerCanChoose: true } };
    const n = normalizeCampaignPreferences(raw);
    expect(n.equipLimits).toEqual({ value: 'off', playerCanChoose: false });
    expect(n.autoMechanics).toEqual({ value: false, playerCanChoose: true });
  });
});

describe('normalizePlayerPreferences — only valid overrides survive', () => {
  it('keeps valid enum + boolean overrides, drops invalid ones to unset', () => {
    const p = normalizePlayerPreferences({ diceRollerStyle: 'medieval', exhaustionModel: 'bogus', autoMechanics: true, recordMode: 'irl' });
    expect(p.diceRollerStyle).toBe('medieval');
    expect(p.autoMechanics).toBe(true);
    expect(p.recordMode).toBe('irl');
    expect('exhaustionModel' in p).toBe(false); // invalid → unset (falls back to campaign)
  });

  it('an empty/absent object is no overrides', () => {
    expect(normalizePlayerPreferences({})).toEqual({});
    expect(normalizePlayerPreferences(undefined)).toEqual({});
  });
});
