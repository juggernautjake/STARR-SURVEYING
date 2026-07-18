// lib/dnd/preferences.ts — the campaign/player preference layer (Phase 2, Area P1).
//
// The config every sheet + roller reads. The DM owns campaign-wide settings; a player may choose their OWN
// value ONLY where the DM allows it (playerCanChoose). `resolvePreferences` folds the two into the effective
// settings a sheet reads, flagging any the DM locked. Pure + framework-free — the store/hooks (P2) and the
// pages (P3/P4) sit on top. Every default is the VANILLA model (owner: "the default way needs to be the
// vanilla rules"); alternatives are opt-in.

export type ExhaustionModel = 'vanilla' | 'flat-2-per-level';
export type LongRestModel = 'vanilla' | 'half-hit-dice' | 'gritty' | 'epic';
export type EquipLimits = 'enforced' | 'off';
export type DiceRollerStyle = 'futuristic' | 'rugged' | 'natural' | 'fantasy' | 'medieval';
export type RecordMode = 'auto' | 'manual' | 'irl';
// How a shape-shift (Wild Shape, Primal Shape, Surge form, an assumed statblock) treats your ability
// scores: 'full' — the form's scores fully replace yours, up OR down (RAW; the DEFAULT per owner);
// 'partial' — the form only ever HELPS (a form score is used only when it beats your own); 'none' — forms
// never touch ability scores (they change shape/senses/movement only). Read at the form-apply site.
export type ShapeshiftStats = 'full' | 'partial' | 'none';
// PF2 "damage while already dying" model: 'official' — taking damage while dying increases your Dying
// value (by 1, or 2 on a crit / from a persistent source) per the PF2 rules (the DEFAULT); 'off' — dying
// only advances from failed recovery saves, never from fresh damage (a gentler house rule).
export type DownedDamageModel = 'official' | 'off';

const VALUES = {
  exhaustionModel: ['vanilla', 'flat-2-per-level'] as ExhaustionModel[],
  longRestModel: ['vanilla', 'half-hit-dice', 'gritty', 'epic'] as LongRestModel[],
  equipLimits: ['enforced', 'off'] as EquipLimits[],
  diceRollerStyle: ['futuristic', 'rugged', 'natural', 'fantasy', 'medieval'] as DiceRollerStyle[],
  recordMode: ['auto', 'manual', 'irl'] as RecordMode[],
  shapeshiftStats: ['full', 'partial', 'none'] as ShapeshiftStats[],
  downedDamageModel: ['official', 'off'] as DownedDamageModel[],
} as const;

/** One campaign-level setting: its value + whether a player may override it with their own choice. */
export interface CampaignSetting<T> {
  value: T;
  /** When false, the DM has LOCKED this — every player uses the campaign value, no self-choice. */
  playerCanChoose: boolean;
}

export interface CampaignPreferences {
  autoMechanics: CampaignSetting<boolean>;
  exhaustionModel: CampaignSetting<ExhaustionModel>;
  longRestModel: CampaignSetting<LongRestModel>;
  equipLimits: CampaignSetting<EquipLimits>;
  diceRollerStyle: CampaignSetting<DiceRollerStyle>;
  recordMode: CampaignSetting<RecordMode>;
  // Auto-attune: when true, a magic item that needs attunement is treated as attuned the moment it's in
  // your inventory (its effects apply automatically); when false you attune manually. EQUIPPING (armor,
  // clothing, weapons) is ALWAYS manual regardless — this only governs attunement.
  autoAttune: CampaignSetting<boolean>;
  featAutoApply: CampaignSetting<boolean>;
  shapeshiftStats: CampaignSetting<ShapeshiftStats>;
  downedDamageModel: CampaignSetting<DownedDamageModel>;
}

/** A player's chosen overrides. Partial — an unset field falls back to the campaign value. Only honored
 *  where the campaign's `playerCanChoose` is true. */
export interface PlayerPreferences {
  autoMechanics?: boolean;
  exhaustionModel?: ExhaustionModel;
  longRestModel?: LongRestModel;
  equipLimits?: EquipLimits;
  diceRollerStyle?: DiceRollerStyle;
  recordMode?: RecordMode;
  autoAttune?: boolean;
  featAutoApply?: boolean;
  shapeshiftStats?: ShapeshiftStats;
  downedDamageModel?: DownedDamageModel;
}

/** One resolved setting the sheet reads, flagged if the DM locked it (so the UI can show "set by your DM"). */
export interface EffectivePreference<T> {
  value: T;
  lockedByDM: boolean;
}

export interface EffectivePreferences {
  autoMechanics: EffectivePreference<boolean>;
  exhaustionModel: EffectivePreference<ExhaustionModel>;
  longRestModel: EffectivePreference<LongRestModel>;
  equipLimits: EffectivePreference<EquipLimits>;
  diceRollerStyle: EffectivePreference<DiceRollerStyle>;
  recordMode: EffectivePreference<RecordMode>;
  autoAttune: EffectivePreference<boolean>;
  featAutoApply: EffectivePreference<boolean>;
  shapeshiftStats: EffectivePreference<ShapeshiftStats>;
  downedDamageModel: EffectivePreference<DownedDamageModel>;
}

/** The vanilla defaults — every setting on its RAW/standard value, and players free to choose by default. */
export const DEFAULT_CAMPAIGN_PREFERENCES: CampaignPreferences = {
  autoMechanics: { value: true, playerCanChoose: true },
  exhaustionModel: { value: 'vanilla', playerCanChoose: true },
  longRestModel: { value: 'vanilla', playerCanChoose: true }, // 'vanilla' = each system's own RAW long rest
  equipLimits: { value: 'enforced', playerCanChoose: true },
  diceRollerStyle: { value: 'futuristic', playerCanChoose: true },
  recordMode: { value: 'auto', playerCanChoose: true },
  autoAttune: { value: true, playerCanChoose: true }, // convenience default: attunement is automatic; equipping stays manual
  featAutoApply: { value: true, playerCanChoose: true }, // a feat's ability increase applies itself by default
  shapeshiftStats: { value: 'full', playerCanChoose: true }, // RAW: a form's scores fully replace yours
  downedDamageModel: { value: 'official', playerCanChoose: true }, // PF2 RAW: damage while dying raises Dying
};

/** Resolve one setting: a locked setting always uses the campaign value; otherwise the player's choice wins
 *  when they made one, else the campaign value. */
function resolveOne<T>(campaign: CampaignSetting<T>, playerChoice: T | undefined): EffectivePreference<T> {
  if (!campaign.playerCanChoose) return { value: campaign.value, lockedByDM: true };
  return { value: playerChoice !== undefined ? playerChoice : campaign.value, lockedByDM: false };
}

/**
 * Fold the DM's campaign preferences and a player's chosen overrides into the effective settings a sheet
 * reads. The DM's constraints clamp the player's: a locked setting can never be overridden, and its
 * `lockedByDM` flag lets the UI disable the control and show the DM's value.
 */
export function resolvePreferences(
  campaign: CampaignPreferences,
  player: PlayerPreferences = {},
): EffectivePreferences {
  return {
    autoMechanics: resolveOne(campaign.autoMechanics, player.autoMechanics),
    exhaustionModel: resolveOne(campaign.exhaustionModel, player.exhaustionModel),
    longRestModel: resolveOne(campaign.longRestModel, player.longRestModel),
    equipLimits: resolveOne(campaign.equipLimits, player.equipLimits),
    diceRollerStyle: resolveOne(campaign.diceRollerStyle, player.diceRollerStyle),
    recordMode: resolveOne(campaign.recordMode, player.recordMode),
    autoAttune: resolveOne(campaign.autoAttune, player.autoAttune),
    featAutoApply: resolveOne(campaign.featAutoApply, player.featAutoApply),
    shapeshiftStats: resolveOne(campaign.shapeshiftStats, player.shapeshiftStats),
    downedDamageModel: resolveOne(campaign.downedDamageModel, player.downedDamageModel),
  };
}

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function setting<T>(raw: unknown, allowed: readonly T[] | null, def: CampaignSetting<T>): CampaignSetting<T> {
  const r = (raw ?? {}) as { value?: unknown; playerCanChoose?: unknown };
  const value = allowed ? pick(r.value, allowed, def.value) : (typeof r.value === 'boolean' ? (r.value as T) : def.value);
  const playerCanChoose = typeof r.playerCanChoose === 'boolean' ? r.playerCanChoose : def.playerCanChoose;
  return { value, playerCanChoose };
}

/** Safely load campaign preferences from stored JSON, filling every missing/invalid field with its vanilla
 *  default — so a partial or corrupt row can never wedge a sheet. */
export function normalizeCampaignPreferences(raw: unknown): CampaignPreferences {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_CAMPAIGN_PREFERENCES;
  return {
    autoMechanics: setting(r.autoMechanics, null, d.autoMechanics),
    exhaustionModel: setting(r.exhaustionModel, VALUES.exhaustionModel, d.exhaustionModel),
    longRestModel: setting(r.longRestModel, VALUES.longRestModel, d.longRestModel),
    equipLimits: setting(r.equipLimits, VALUES.equipLimits, d.equipLimits),
    diceRollerStyle: setting(r.diceRollerStyle, VALUES.diceRollerStyle, d.diceRollerStyle),
    recordMode: setting(r.recordMode, VALUES.recordMode, d.recordMode),
    autoAttune: setting(r.autoAttune, null, d.autoAttune),
    featAutoApply: setting(r.featAutoApply, null, d.featAutoApply),
    shapeshiftStats: setting(r.shapeshiftStats, VALUES.shapeshiftStats, d.shapeshiftStats),
    downedDamageModel: setting(r.downedDamageModel, VALUES.downedDamageModel, d.downedDamageModel),
  };
}

/** Safely load a player's overrides from stored JSON — only valid enum values survive; anything else drops
 *  to "unset" (fall back to campaign). */
export function normalizePlayerPreferences(raw: unknown): PlayerPreferences {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: PlayerPreferences = {};
  if (typeof r.autoMechanics === 'boolean') out.autoMechanics = r.autoMechanics;
  if (VALUES.exhaustionModel.includes(r.exhaustionModel as ExhaustionModel)) out.exhaustionModel = r.exhaustionModel as ExhaustionModel;
  if (VALUES.longRestModel.includes(r.longRestModel as LongRestModel)) out.longRestModel = r.longRestModel as LongRestModel;
  if (VALUES.equipLimits.includes(r.equipLimits as EquipLimits)) out.equipLimits = r.equipLimits as EquipLimits;
  if (VALUES.diceRollerStyle.includes(r.diceRollerStyle as DiceRollerStyle)) out.diceRollerStyle = r.diceRollerStyle as DiceRollerStyle;
  if (VALUES.recordMode.includes(r.recordMode as RecordMode)) out.recordMode = r.recordMode as RecordMode;
  if (typeof r.autoAttune === 'boolean') out.autoAttune = r.autoAttune;
  if (typeof r.featAutoApply === 'boolean') out.featAutoApply = r.featAutoApply;
  if (VALUES.shapeshiftStats.includes(r.shapeshiftStats as ShapeshiftStats)) out.shapeshiftStats = r.shapeshiftStats as ShapeshiftStats;
  if (VALUES.downedDamageModel.includes(r.downedDamageModel as DownedDamageModel)) out.downedDamageModel = r.downedDamageModel as DownedDamageModel;
  return out;
}
