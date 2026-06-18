// __tests__/admin/messenger-mx4.test.ts
//
// Slice MX4 — discussion-thread panel reuses the same
// useDraggable hook that landed for the messenger in MX3, plus
// the existing group-chat flow in the messenger panel still
// works inside the new two-pane layout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('DiscussionThreadButton — useDraggable wiring (MX4)', () => {
  const SRC = read('app/admin/components/DiscussionThreadButton.tsx');

  it('imports useDraggable from the shared lib', () => {
    expect(SRC).toMatch(/import \{ useDraggable \} from '@\/lib\/admin\/use-draggable'/);
  });

  it("declares the panel width / height / storage-key constants distinct from the messenger's", () => {
    expect(SRC).toMatch(/DISCUSSION_PANEL_WIDTH\s*=\s*460/);
    expect(SRC).toMatch(/DISCUSSION_PANEL_HEIGHT\s*=\s*620/);
    expect(SRC).toMatch(/DISCUSSION_DRAG_STORAGE_KEY\s*=\s*'admin\/discussion\/panel-position'/);
  });

  it('only enables the hook while the panel is open', () => {
    expect(SRC).toMatch(/enabled:\s*isOpen/);
  });

  it('default placement lands the panel above the FAB pill', () => {
    expect(SRC).toMatch(/x: Math\.max\(0, w - DISCUSSION_PANEL_WIDTH - 24\)/);
    expect(SRC).toMatch(/y: Math\.max\(0, h - DISCUSSION_PANEL_HEIGHT - 88\)/);
  });

  it("swaps to absolute left/top once `drag.mounted` is true", () => {
    expect(SRC).toMatch(/style=\{drag\.mounted \? \{[\s\S]*?left:\s*drag\.position\.x[\s\S]*?top:\s*drag\.position\.y/);
  });

  it('header div is the drag handle with all four pointer handlers attached', () => {
    expect(SRC).toMatch(/data-testid="discussion-panel-drag-handle"/);
    expect(SRC).toMatch(/onPointerDown=\{drag\.handlers\.onPointerDown\}/);
    expect(SRC).toMatch(/onPointerMove=\{drag\.handlers\.onPointerMove\}/);
    expect(SRC).toMatch(/onPointerUp=\{drag\.handlers\.onPointerUp\}/);
    expect(SRC).toMatch(/onPointerCancel=\{drag\.handlers\.onPointerCancel\}/);
  });

  it('the tabs + close button carry data-no-drag so clicks fire normally', () => {
    // Two tab buttons + the close button = 3 occurrences.
    const matches = SRC.match(/<button\s+data-no-drag/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('FloatingMessenger — group-chat creation still works in the two-pane layout (MX4)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('still keeps multi-select contact state for the new-conversation flow', () => {
    expect(SRC).toMatch(/const \[selectedContacts, setSelectedContacts\] = useState/);
  });

  it("preserves an optional groupTitle input the user can type into", () => {
    expect(SRC).toMatch(/const \[groupTitle, setGroupTitle\] = useState/);
  });

  it("the new-conversation view is reachable from the always-visible sidebar's ✏️ button", () => {
    // The button lives in the actions row at the top of the
    // sidebar. Attribute order varies between calls, so we
    // assert both the title + the click handler exist on the
    // same button.
    expect(SRC).toMatch(/setView\('new'\); fetchContacts\(\); \}\}\s+title="New conversation"/);
  });
});
