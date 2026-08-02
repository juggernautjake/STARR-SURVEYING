// lib/stardust/genesis/types.ts — the shape the Genesis generator emits.
// Spec: docs/planning/in-progress/STARDUST_GENESIS_SEQUENCE_2026-07-21.md (Stage 1)
//
// This is deliberately the SAME shape the Stardust map suite already reads and writes
// (`mapData()` in public/dnd/maps/map-studio.html), so a generated galaxy opens in the map studio
// as an ordinary map with no adapter. Fields the studio owns but the generator has no opinion on
// (label styling, POIs, layering) are left at their defaults.

/** Why an object is concealed. Mirrors HIDE_MODES in map-studio.html. */
export type HideMode = 'dm' | 'cloaked' | 'undiscovered';

/** Kinds the generator emits. The studio supports more (image/text/html/…); we don't need them. */
export type GenesisKind = 'star' | 'planet' | 'moon';

/** The `look` sub-object the 2D renderer (`art()`) and the 3D builders both read. */
export interface StardustLook {
  kind: GenesisKind;
  seed: number;
  c1: string;
  c2: string;
  c3: string;
  /** planet only */
  ptype?: string;
  ring?: boolean;
  cloudStyle?: string;
  cloudColor?: string;
  cloudAmount?: number;
  atmo?: boolean;
  atmoColor?: string;
  atmoThick?: number;
  /** moon only */
  mtype?: string;
  /** star only */
  stype?: string;
  rays?: boolean;
  brightness?: number;
  coronaSize?: number;
  breathe?: { on: boolean; speed: number; depth: number };
  raySpec?: { count: number; length: number; intensity: number };
}

export interface StardustFx {
  sparkle: boolean;
  nebula: boolean;
  nebulaColor: string;
  shoot: boolean;
  color: string;
}

/** One placed body. Matches the instance shape built at map-studio.html:1404. */
export interface StardustInstance {
  id: string;
  kind: GenesisKind;
  name: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  opacity: number;
  z: number;
  desc: string;
  /** Orbital elements. Authored by the studio inspector; read by Stage 3 onward. */
  orbitParent: string;
  orbitRadius: number;
  orbitSpeed: number;
  /** Starting angle in radians. NEW field — instances serialize whole, so it persists for free. */
  orbitPhase: number;
  sector: string | null;
  pois: never[];
  fx: StardustFx;
  look: StardustLook;
  hidden?: boolean;
  hideMode?: HideMode;
  /** Genesis bookkeeping — which beat reveals this body. Ignored by the studio. */
  genesisRole?: 'homestar' | 'homestar-companion' | 'homeworld' | 'homemoon' | 'field';
}

/** A system region. Matches the EXPLICIT sector field list in mapData()/cleanState(). */
export interface StardustSector {
  id: string;
  name: string;
  color: string;
  points: { x: number; y: number }[];
  creed: string;
  desc: string;
  fx: { sparkle: boolean; nebula: boolean; nebulaColor: string; shoot: boolean };
  parent: string | null;
  hidden?: boolean;
  hideMode?: HideMode;
}

export interface GenesisMap {
  type: 'stardust-map';
  version: 2;
  meta: { name: string; campaign: null; published: false; genesisSeed: number };
  instances: StardustInstance[];
  sectors: StardustSector[];
  assets: never[];
  trash: never[];
  background: null;
  centerGalaxy: null;
  selStyle: { width: number; style: string; color: string };
  mapFx: Record<string, unknown>;
  bg3d: Record<string, unknown>;
}

/** What the cinematic needs to know about the galaxy it's about to reveal. */
export interface GenesisPlan {
  seed: number;
  map: GenesisMap;
  /** The homeworld's star(s) — 1, 2 or 3 of them. Index 0 is the primary. */
  homeStarIds: string[];
  homeworldId: string;
  homeworldName: string;
  homeMoonIds: string[];
  homeSystemId: string;
  starCount: 1 | 2 | 3;
  /** Every body that starts concealed — i.e. everything except the home star(s). */
  hiddenIds: string[];
}

export interface GenesisOptions {
  /** Force a multiplicity instead of rolling for one. Used by the dev harness. */
  starCount?: 1 | 2 | 3;
  /** Number of other star systems in the galaxy besides the home system. */
  fieldSystems?: number;
}
