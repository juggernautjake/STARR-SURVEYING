// __tests__/dnd/character-delete.test.ts — permanent character deletion (owner-gated, confirmed).
//
// Deletion is irreversible, so this pins the two guards: the DELETE route is OWNER-only (not merely writable,
// so a DM/assigned player can't erase someone's character), it cleans up the per-character child rows before
// removing the character, and the settings UI puts it behind a typed confirmation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('DELETE /api/dnd/characters/[id]', () => {
  const route = read('app/api/dnd/characters/[id]/route.ts');

  it('exists and is gated to the OWNER, not just canWrite', () => {
    expect(route).toContain('export async function DELETE');
    expect(route).toContain('res.access.isOwner');
    expect(route).toMatch(/Only the character.s owner can delete it/);
  });

  it('removes the per-character child rows, then the character', () => {
    for (const table of ['dnd_sheet_edits', 'dnd_character_uploads', 'dnd_roll_log', 'dnd_campaign_characters']) {
      expect(route).toContain(table);
    }
    expect(route).toContain(".eq('character_id', params.id)");
    expect(route).toMatch(/from\('dnd_characters'\)\s*\.delete\(\)\s*\.eq\('id', params\.id\)/);
  });
});

describe('the settings UI deletes behind a typed confirmation', () => {
  const modal = read('app/dnd/_ui/CharacterSettingsModal.tsx');

  it('shows a Danger zone only to the owner', () => {
    expect(modal).toContain('Danger zone');
    expect(modal).toMatch(/isOwner &&/);
  });

  it('requires typing the confirmation before the permanent delete is enabled', () => {
    expect(modal).toContain('confirmText');
    expect(modal).toContain("method: 'DELETE'");
    expect(modal).toMatch(/confirmText\.trim\(\) !== \(characterName \|\| 'DELETE'\)/);
    expect(modal).toContain('Permanently delete');
  });
});
