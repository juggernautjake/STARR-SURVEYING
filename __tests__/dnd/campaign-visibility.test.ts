// Campaigns can be hidden, archived and deleted (P2-5, audit finding D-2).
//
// THE FINDING: `loadAllCampaignSummaries()` selected EVERY campaign — no visibility filter, no pagination,
// no recency ordering — and returned the DM's name, every player's name and every character's name, to
// anyone opening `/dnd` in open-access mode. And with only GET and PATCH on the campaign route, a campaign
// once created **could never be removed or hidden by anyone**.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const seed = read('seeds/457_dnd_campaign_visibility.sql');
const summary = read('lib/dnd/campaign-summary.ts');
const route = read('app/api/dnd/campaigns/[id]/route.ts');
const control = read('app/dnd/_ui/CampaignVisibilityControl.tsx');

describe('the migration', () => {
  it('adds both columns and constrains visibility', () => {
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS visibility/);
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS archived_at/);
    expect(seed).toMatch(/CHECK \(visibility IN \('public', 'unlisted', 'private'\)\)/);
  });

  it('BACKFILLS EXISTING CAMPAIGNS TO UNLISTED, NOT PUBLIC', () => {
    // The decision that makes the migration real rather than decorative: backfilling to 'public' would
    // preserve the exact leak it exists to close. 'unlisted' is not destructive — every link keeps
    // working, members see no change — it only stops strangers reading the roster off a public index.
    expect(seed).toMatch(/SET visibility = 'unlisted'/);
    expect(seed).not.toMatch(/SET visibility = 'public'/);
  });

  it('and new campaigns default to unlisted too — opt in to being listed', () => {
    expect(seed).toMatch(/visibility TEXT NOT NULL DEFAULT 'unlisted'/);
  });

  it('explains why the backfill went that way, where the next reader will look', () => {
    expect(seed).toMatch(/BACKFILL DECISION/);
    expect(seed).toMatch(/would preserve the exact leak/);
  });
});

describe('the public index is filtered, bounded and ordered', () => {
  it('shows only public, non-archived campaigns', () => {
    expect(summary).toMatch(/\.eq\('visibility', 'public'\)/);
    expect(summary).toMatch(/\.is\('archived_at', null\)/);
  });

  it('is bounded — it used to select every row that had ever existed', () => {
    expect(summary).toMatch(/\.limit\(limit\)/);
    expect(summary).toMatch(/Math\.min\(100/);
  });

  it('and newest first, not oldest', () => {
    // Ascending meant a growing site pushed every live table below years of abandoned ones.
    //
    // Scoped to the FUNCTION, not the file: other loaders in here legitimately order ascending, and the
    // first version of this assertion swept the whole module and failed on one of them.
    const fn = summary.slice(summary.indexOf('export async function loadAllCampaignSummaries'));
    const body = fn.slice(0, fn.indexOf('\nexport '));
    expect(body).toMatch(/\.order\('created_at', \{ ascending: false \}\)/);
    expect(body).not.toMatch(/\.order\('created_at', \{ ascending: true \}\)/);
  });

  it('but a viewer still sees their OWN campaigns whatever the visibility', () => {
    // "Where did my table go" is a worse experience than a slightly longer list — and it is their data.
    expect(summary).toContain('opts.viewerId');
    expect(summary).toMatch(/\.eq\('dm_user_id', opts\.viewerId\)/);
  });

  it('and the hub passes the viewer', () => {
    expect(read('app/dnd/page.tsx')).toMatch(/loadAllCampaignSummaries\(\{ viewerId/);
  });
});

describe('removing a campaign', () => {
  it('the route finally HAS a DELETE', () => {
    expect(route).toMatch(/export async function DELETE/);
  });

  it('gated on being THIS campaign’s DM', () => {
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toContain('getCampaignRole');
    expect(del).toMatch(/!== 'dm'/);
  });

  it('ARCHIVES by default; a hard delete needs an explicit flag', () => {
    // A campaign cascades to sessions, recaps, roll history, invites and the roster. The row is small and
    // the consequences are not.
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toMatch(/hard = req\.nextUrl\.searchParams\.get\('hard'\) === '1'/);
    expect(del).toMatch(/if \(!hard\)/);
    expect(del).toMatch(/archived_at: new Date\(\)\.toISOString\(\)/);
  });

  it('and a hard delete DETACHES characters before it cascades', () => {
    // Characters belong to their owners. A DM closing their table must not delete other people's
    // characters, and the FK cascade would do exactly that if they were still attached.
    const del = route.slice(route.indexOf('export async function DELETE'));
    const detach = del.indexOf("from('dnd_characters').update({ campaign_id: null })");
    const drop = del.indexOf("from('dnd_campaigns').delete()");
    expect(detach, 'characters must be detached').toBeGreaterThan(-1);
    expect(detach, 'and detached BEFORE the cascade').toBeLessThan(drop);
  });

  it('archiving is reversible through the ordinary PATCH', () => {
    expect(route).toMatch(/if \('archived' in body\) patch\.archived_at = body\.archived \? .* : null;/);
  });

  it('PATCH drops an unknown visibility rather than storing it', () => {
    // The column has a CHECK constraint, so a typo would 500 on write.
    expect(route).toMatch(/\['public', 'unlisted', 'private'\]\.includes\(body\.visibility\)/);
  });
});

describe('the DM control', () => {
  it('is mounted on the manage page', () => {
    const page = read('app/dnd/campaigns/[id]/manage/page.tsx');
    expect(page).toMatch(/<CampaignVisibilityControl/);
  });

  it('reads the SAVED value server-side rather than guessing a default', () => {
    // Matches the COLUMN, not the exact select string: P4-6 widened it to fetch `allow_custom` alongside,
    // and a test that breaks when a neighbouring column joins the query is testing the wrong thing.
    const page = read('app/dnd/campaigns/[id]/manage/page.tsx');
    expect(page).toMatch(/\.select\('[^']*visibility[^']*'\)/);
  });

  it('rolls its highlight back when a change fails to save', () => {
    // A control showing the state you asked for rather than the state that saved is how someone believes
    // their campaign is private when it is not.
    expect(control).toMatch(/setVisibility\(previous\)/);
  });

  it('puts the hard delete behind a second confirmation that says what it destroys', () => {
    expect(control).toMatch(/confirmDelete/);
    expect(control).toMatch(/sessions, recaps, roll history, invites and roster/);
    expect(control, 'and reassures about the thing people actually fear').toMatch(/Characters are not deleted/);
  });

  it('and explains the backfill, because that is what most DMs will be looking at', () => {
    expect(control).toMatch(/made before this setting existed/);
  });
});
