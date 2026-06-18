// __tests__/admin/messenger-mx1.test.ts
//
// Slice MX1 (messenger-overhaul-2026-06-17) — first visible piece
// of the chat / report-an-issue overhaul. Locks:
//
//   • Both panels sit ABOVE the FAB pill (bottom: 5.5rem) instead
//     of `bottom: 0`.
//   • The messenger panel header gets a real polish + an "Open in
//     /admin/messages →" link the user explicitly asked for.
//   • The discussion panel gets the same offset + a header polish.
//
// Two-pane layout, draggability, and group-chat parity are
// deferred to MX2/MX3/MX4.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Messenger panel CSS — sits above the FAB + has the new shell', () => {
  const CSS = read('app/admin/styles/AdminMessaging.css');

  it("bottom anchor moves from 0 → 5.5rem so the FAB stays uncovered", () => {
    expect(CSS).toMatch(/\.messenger-panel\s*\{[\s\S]*?bottom:\s*5\.5rem/);
  });

  it('the panel widens to 420px with a 16px corner radius (no longer a top-left-only corner)', () => {
    expect(CSS).toMatch(/\.messenger-panel\s*\{[\s\S]*?width:\s*420px/);
    expect(CSS).toMatch(/\.messenger-panel\s*\{[\s\S]*?border-radius:\s*16px/);
  });

  it("the header gets real padding + an 'Open in /admin/messages →' link class", () => {
    expect(CSS).toMatch(/\.messenger-panel__header\s*\{[\s\S]*?padding:\s*0\.85rem 1rem/);
    expect(CSS).toMatch(/\.messenger-panel__open-full\s*\{/);
  });
});

describe('Discussion panel CSS — same FAB-clearing offset + header polish', () => {
  const CSS = read('app/admin/styles/AdminDiscussions.css');

  it("bottom anchor moves from 0 → 5.5rem", () => {
    expect(CSS).toMatch(/\.discussion-panel\s*\{[\s\S]*?bottom:\s*5\.5rem/);
  });

  it('the panel widens to 460px with a full 16px corner radius', () => {
    expect(CSS).toMatch(/\.discussion-panel\s*\{[\s\S]*?width:\s*460px/);
    expect(CSS).toMatch(/\.discussion-panel\s*\{[\s\S]*?border-radius:\s*16px/);
  });

  it('the header gets the same padding bump as the messenger', () => {
    expect(CSS).toMatch(/\.discussion-panel__header\s*\{[\s\S]*?padding:\s*0\.85rem 1rem/);
  });
});

describe("FloatingMessenger JSX — 'Open in /admin/messages →' link", () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('imports Link from next/link', () => {
    expect(SRC).toMatch(/import Link from 'next\/link'/);
  });

  it('renders the open-full link with a stable testid', () => {
    expect(SRC).toMatch(/data-testid="messenger-open-full"/);
    expect(SRC).toMatch(/className="messenger-panel__open-full"/);
  });

  it('the link deep-links into the active conversation when one is open', () => {
    expect(SRC).toMatch(/`\/admin\/messages\?conversation=\$\{encodeURIComponent\(activeConv\.id\)\}`/);
  });

  it("closes the popup before navigating so the full page isn't fighting the modal", () => {
    expect(SRC).toMatch(/data-testid="messenger-open-full"[\s\S]{0,250}onClick=\{\(\) => \{ setIsOpen\(false\); \}\}/);
  });

  it("defensive inline style now matches the new CSS (bottom: 5.5rem, right: 1.5rem)", () => {
    // The JSX opener carries a comment block + onClick before the
    // style prop; bump the window so the assertion captures all
    // of them without going so wide it could match a different
    // panel elsewhere.
    expect(SRC).toMatch(/className="messenger-panel"[\s\S]{0,800}bottom:\s*'5\.5rem'/);
    expect(SRC).toMatch(/className="messenger-panel"[\s\S]{0,800}right:\s*'1\.5rem'/);
  });
});

describe('DiscussionThreadButton JSX — defensive inline style matches new contract', () => {
  const SRC = read('app/admin/components/DiscussionThreadButton.tsx');

  it("the inline style still anchors above the FAB (bottom: 5.5rem)", () => {
    expect(SRC).toMatch(/className="discussion-panel"[\s\S]{0,400}bottom:\s*'5\.5rem'/);
    expect(SRC).toMatch(/className="discussion-panel"[\s\S]{0,400}right:\s*'1\.5rem'/);
  });
});
