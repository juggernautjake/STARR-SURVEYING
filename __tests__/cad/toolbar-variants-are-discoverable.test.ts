// CAD_AUDIT Slice S13c — the palette says how to reach its own tools.
//
// S13a counted **51 distinct tools across 18 palette groups**. Every tool past the first in a group
// is reachable ONLY by right-clicking its button (`onContextMenu` → `openFlyout`), and the only
// affordances were a `▸` appended to the tooltip label and an `aria-hidden` chevron in the button's
// corner. Both announce "there is more here" to a reader who already knows, and neither says how.
//
// Checked before changing anything, which mattered: the descriptions themselves were already written
// AND already reachable — the palette renders a rich `Tooltip` carrying `description` and `shortcut`,
// so the assumption that they never reached the user was wrong. The gap was one sentence naming the
// gesture.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/cad/components/ToolBar.tsx'), 'utf8');

describe('the variant gesture is stated, not merely signalled', () => {
  it('names right-click in the tooltip description', () => {
    expect(src).toMatch(/Right-click for \$\{group\.variants\.length\} more/);
  });

  it('includes the count, because a number is a reason to try', () => {
    // "4 more" invites a right-click; a bare chevron is decoration.
    expect(src).toContain('group.variants.length');
  });

  it('only says it for groups that actually have variants', () => {
    // Telling someone to right-click a button with nothing behind it teaches them the hint is noise.
    expect(src).toMatch(/hasVariants\s*\n?\s*\?\s*`\$\{group\.description/);
  });

  it('keeps the existing description rather than replacing it', () => {
    // The descriptions are instruction-shaped already ("Click start point, then end point…"), and
    // they were the part that was NOT broken.
    expect(src).toContain('group.description ?? \'\'');
  });
});

describe('the affordances it supplements still exist', () => {
  it('still opens the flyout on right-click', () => {
    // This slice adds an explanation, not a behaviour change. If the gesture it documents were
    // removed, the sentence would become a lie.
    expect(src).toContain('onContextMenu');
    expect(src).toContain('openFlyout(group, e.currentTarget)');
  });

  it('still renders the corner chevron for groups with variants', () => {
    expect(src).toMatch(/hasVariants && \(\s*<ChevronDown/);
  });

  it('still passes the description and shortcut to the rich tooltip', () => {
    // The pre-existing behaviour this slice depends on. If descriptions stopped reaching the
    // Tooltip, the added sentence would go with them and nobody would notice.
    expect(src).toContain('shortcut={group.shortcut}');
    expect(src).toMatch(/description=\{/);
  });
});
