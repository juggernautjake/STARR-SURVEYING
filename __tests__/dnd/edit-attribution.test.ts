// __tests__/dnd/edit-attribution.test.ts — the review queue says WHO, not just what role.
//
// The rules-platform doc wanted "8d6 → 10d6, **by Jacob**, date" on an edit. The previous slice shipped the
// diff; this is the "by Jacob" half, which turned out to have no data source at all: `dnd_sheet_edits`
// stores `editor_user_id` (a uuid) and `is_dm`, and nothing in the repo ever resolved either to a person.
// So the queue could only render "DM" or "player" — which at a table with three players answers the wrong
// question, since the DM reviewing a change wants to know WHICH one made it.
//
// The join is in the GET route rather than the component, so every consumer of that route gets the name and
// no second lookup can drift from it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/characters/[id]/edits/route.ts');
const PANEL = read('app/dnd/_sheet/components/EditReviewPanel.tsx');

describe('the route resolves the editor to a name', () => {
  it('looks the ids up in dnd_users', () => {
    expect(ROUTE).toContain("from('dnd_users')");
    expect(ROUTE).toContain("select('id, display_name')");
  });

  it('does ONE lookup for the distinct editors, not one per row', () => {
    // Rows are capped at 200 and the distinct editors on a character are a handful, so an `in` lookup
    // beats an embed on every row.
    expect(ROUTE).toContain('new Set(rows.map((r) => r.editor_user_id)');
    expect(ROUTE).toMatch(/\.in\('id', ids\)/);
  });

  it('skips the lookup entirely when no row has an editor', () => {
    expect(ROUTE).toContain('if (ids.length) {');
  });

  it('adds the name without changing the row shape', () => {
    // Additive: every existing consumer of this route keeps working untouched.
    expect(ROUTE).toMatch(/\{ \.\.\.r, editor_name: names\.get\(uid\) \}/);
  });

  it('omits the field rather than inventing a placeholder for a deleted account', () => {
    // `editor_user_id` is ON DELETE SET NULL, so a departed user legitimately has no name — printing
    // "Unknown" would read as though it were someone.
    expect(ROUTE).toContain('uid && names.has(uid) ? { ...r, editor_name:');
    expect(ROUTE).not.toMatch(/editor_name:\s*['"`](Unknown|Someone|Anonymous)/);
  });

  it('ignores a blank display_name rather than rendering empty parentheses', () => {
    expect(ROUTE).toContain('if (name && name.trim()) names.set(id, name.trim())');
  });
});

describe('the panel shows the person, then the role', () => {
  it('renders "Name (DM)" / "Name (player)"', () => {
    expect(PANEL).toContain("`${row.editor_name} (${row.is_dm ? 'DM' : 'player'})`");
  });

  it('falls back to the old wording when there is no name', () => {
    // Not a regression path — it is the correct output for an edit whose author has left the table.
    expect(PANEL).toMatch(/row\.editor_name \? .* : \(row\.is_dm \? 'DM' : 'player'\)/);
  });

  it('types the field as optional, matching a route that omits it', () => {
    expect(PANEL).toContain('editor_name?: string | null');
  });
});
