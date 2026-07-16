// __tests__/dnd/campaign-port.test.ts — cross-system character port in the campaign flow (Slice 38d).
//
// The AI transposition endpoint already existed (POST /characters/[id]/system: switch-if-variant,
// else transpose, source never lost). This slice threads the campaign + character `system` into the
// hub and offers a Translate when they differ. Source-anchored (the hub loader hits Supabase; the
// UI is a client component); the transpose mechanism is verified by the endpoint's own presence.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SUMMARY = read('lib/dnd/campaign-summary.ts');
const HUB = read('app/dnd/_ui/CampaignHub.tsx');

describe('the hub carries the campaign + character system (38d data)', () => {
  it('the campaign query + type + return expose `system`', () => {
    expect(SUMMARY).toContain("select('id, name, blurb, theme, system')");
    expect(SUMMARY).toContain('system: campaign.system ?? null');
    expect(SUMMARY).toContain('system: string | null;'); // on CampaignHubData / HubCharacter
  });
  it('each hub character carries its own system', () => {
    expect(SUMMARY).toMatch(/sheet_type, system'\)/); // character query includes system
    expect(SUMMARY).toContain('system: ch.system ?? null');
  });
});

describe('CampaignHub offers a non-destructive translate on mismatch', () => {
  it('detects a mine-character built for a different system than the campaign', () => {
    expect(HUB).toContain('const mismatched');
    // ignores ambiguous on either side (no rulebook to translate to/from).
    expect(HUB).toContain('!== SYSTEM_AMBIGUOUS');
    expect(HUB).toContain('normalizeSystem(c.system) !== campSys');
  });
  it('calls the existing transpose endpoint with the campaign system, then refreshes', () => {
    expect(HUB).toContain('/api/dnd/characters/${charId}/system');
    expect(HUB).toContain('system: data.system');
    expect(HUB).toContain('router.refresh()');
    // frames it as non-destructive, per the request.
    expect(HUB).toContain('your original stays intact');
  });
});

describe('the transpose endpoint exists and is non-destructive', () => {
  it('installs a new variant / snapshots rather than overwriting the source', () => {
    const route = read('app/api/dnd/characters/[id]/system/route.ts');
    expect(route).toContain('installTransposed');
    expect(route).toContain('switchActive');
    expect(route).toMatch(/target system|TARGET system/); // grounded on the target rules only
  });
});
