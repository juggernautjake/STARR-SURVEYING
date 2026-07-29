// __tests__/dnd/character-row-actions.test.ts — managing characters from the index (P4-1b).
//
// "The index lists and finds; it does not yet manage." Duplicate, export and delete were each reachable only
// from inside a character's own sheet, so every management task began by opening the thing you wanted to
// copy or throw away.
//
// THE DISTINCTION THIS SLICE RESTS ON: **duplicate is not "new variant"**. A variant is another VERSION
// inside one character (same row, git-like lineage, up to 20). A duplicate is a separate character with its
// own id. Conflating them would either put a version-picker on a grid card with nothing to pick from, or
// silently create rows when someone expected a version.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/characters/[id]/duplicate/route.ts');
const ui = read('app/dnd/_ui/CharacterRowActions.tsx');
const page = read('app/dnd/characters/page.tsx');

describe('duplicate creates a separate character', () => {
  it('INSERTs a new row rather than forking a version', () => {
    expect(route).toMatch(/\.from\('dnd_characters'\)\s*\n?\s*\.insert\(/);
    // Asserted positively: it returns a NEW character id, which a fork never does — it mutates the existing
    // row's version list. A negative check for the string "op: 'fork'" matches this route's own comment
    // explaining the distinction, which is the third time in this audit a test has flagged its own prose.
    expect(route).toMatch(/\.select\('id, name'\)/);
    expect(route).toMatch(/character: created/);
  });

  it('and ownership resets to the caller', () => {
    // Copying `owner_user_id` would hand someone a character they cannot delete; copying
    // `played_by_user_id` would silently assign a stranger to play it.
    expect(route).toContain('owner_user_id: session.userId');
    expect(route).toContain('played_by_user_id: null');
  });

  it('does not inherit the campaign', () => {
    // A duplicate joins no table until someone puts it in one — inheriting would drop an unapproved
    // character straight into a roster.
    expect(route).not.toMatch(/campaign_id: src\./);
  });

  it('nor the artwork, which belongs to the original’s upload ledger', () => {
    // Pointing a second row at the same stored objects means deleting one character strips the other's
    // portrait, and P2-7's storage ledger would free bytes still in use.
    expect(route).not.toMatch(/art_url: src\./);
    expect(route).not.toMatch(/token_url: src\./);
  });

  it('and is not marked an NPC', () => {
    expect(route).toContain('is_npc: false');
  });

  it('requires WRITE access', () => {
    // TIGHTENED after character-mutation-authorization flagged the first version, which accepted read
    // access so someone could copy another player's public character. That capability was never asked for,
    // and weakening a character-scoped write to enable it is the trade that guard exists to prevent.
    expect(route).toContain('requireCharacterWrite(params.id)');
    expect(route).toContain('!res.access.canWrite');
  });

  it('is throttled and signed-in only', () => {
    expect(route).toContain("enforceRateLimit('write'");
    expect(route).toContain('getDndSession()');
  });
});

describe('the row actions', () => {
  it('offer duplicate, export and delete', () => {
    expect(ui).toContain('/duplicate');
    expect(ui).toContain('/export');
    expect(ui).toMatch(/method: 'DELETE'/);
  });

  it('export is a LINK, not a fetch', () => {
    // The route streams a file; letting the browser handle it is what makes "Save as…" work. A fetch would
    // download it into memory and drop it.
    expect(ui).toMatch(/<a[\s\S]{0,200}href=\{`\/api\/dnd\/characters\/\$\{id\}\/export`\}/);
  });

  it('delete confirms first', () => {
    // A grid of similar-looking cards is a mis-click away from losing work.
    expect(ui).toContain('window.confirm(');
  });

  it('and delete is hidden from a non-owner', () => {
    // Mirrors the server rule — only the OWNER may delete, not an assigned player — so a player handed
    // someone else's character is not shown a button that would refuse them.
    expect(ui).toContain('canDelete &&');
    expect(page).toContain('canDelete={row.owner_user_id === session.userId}');
  });

  it('which means the page must SELECT owner_user_id', () => {
    // The gate silently evaluates to false for everyone if the column is not fetched — a button that
    // vanishes for its rightful owner, with nothing to indicate why.
    expect(page).toMatch(/\.select\('[^']*owner_user_id[^']*'\)/);
  });

  it('"new variant" is deliberately NOT here', () => {
    // A fork needs a source VERSION, and a grid card cannot say which one you meant. It stays on the sheet
    // where the VERSIONS picker shows what you are branching from.
    expect(ui).not.toContain('variants');
  });
});

describe('the card no longer nests interactive elements', () => {
  it('the grid item is a div, with the Link inside it', () => {
    // The card used to be one big <Link>. Buttons inside an anchor are invalid HTML, and a click on
    // "Delete" would also navigate to the sheet — the same structural bug as the P1-5 session banner.
    const grid = page.slice(page.indexOf('shown.map('), page.indexOf('</div>\n            </div>'));
    expect(grid).toMatch(/<div\s+key=\{row\.id\}/);
    // The actions sit OUTSIDE the Link.
    const linkClose = grid.indexOf('</Link>');
    expect(grid.indexOf('<CharacterRowActions')).toBeGreaterThan(linkClose);
  });
});
