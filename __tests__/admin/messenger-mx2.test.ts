// __tests__/admin/messenger-mx2.test.ts
//
// Slice MX2 — two-pane layout. Sidebar always shows the
// conversation list; main pane shows chat / new / search /
// empty prompt depending on `view`. The wider 640px panel
// matches the gold-standard /admin/messages proportions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Messenger panel CSS — two-pane shell', () => {
  const CSS = read('app/admin/styles/AdminMessaging.css');

  it("widens the panel to 640px to fit the sidebar + main split", () => {
    expect(CSS).toMatch(/\.messenger-panel\s*\{[\s\S]*?width:\s*640px/);
  });

  it("declares __body as a flex row that fills the panel", () => {
    expect(CSS).toMatch(/\.messenger-panel__body\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex:\s*1/);
  });

  it("the sidebar carries a fixed 240px basis + a right divider", () => {
    expect(CSS).toMatch(/\.messenger-panel__sidebar\s*\{[\s\S]*?flex:\s*0 0 240px[\s\S]*?border-right:\s*1px solid #E5E7EB/);
  });

  it("the main pane expands to fill the rest of the row", () => {
    expect(CSS).toMatch(/\.messenger-panel__main\s*\{[\s\S]*?flex:\s*1/);
  });

  it("the empty-prompt pane centers its content vertically + horizontally", () => {
    expect(CSS).toMatch(/\.messenger-panel__main-empty\s*\{[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center/);
  });

  it("collapses the sidebar at narrow viewports (≤ 520px)", () => {
    expect(CSS).toMatch(/@media \(max-width: 520px\)\s*\{[\s\S]*?\.messenger-panel__sidebar\s*\{[\s\S]*?display:\s*none/);
  });
});

describe('FloatingMessenger JSX — two-pane wiring', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it("renders the __body wrapper with a stable testid", () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-body"/);
  });

  it("renders the sidebar as an <aside> with a stable testid", () => {
    expect(SRC).toMatch(/<aside className="messenger-panel__sidebar"[\s\S]*?data-testid="messenger-panel-sidebar"/);
  });

  it("renders the main pane as a <section> with a stable testid", () => {
    expect(SRC).toMatch(/<section className="messenger-panel__main"[\s\S]*?data-testid="messenger-panel-main"/);
  });

  it("the list view no longer gates the sidebar — actions + list render unconditionally", () => {
    // The previous `{view === 'list' && (` outer guard is gone;
    // the conversation list now sits inside the sidebar and is
    // visible across all views.
    expect(SRC).not.toMatch(/\{view === 'list' && \(\s*\n\s*<>\s*\n\s*<div className="messenger-panel__actions"/);
  });

  it("the main pane shows an empty prompt when view === 'list'", () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-main-empty"/);
    expect(SRC).toMatch(/Pick a conversation from the left/);
  });

  it("the chat / new / search views still gate their inner content (now rendered inside the main pane)", () => {
    expect(SRC).toMatch(/\{view === 'chat' && activeConv && \(/);
    expect(SRC).toMatch(/\{view === 'new' && \(/);
    expect(SRC).toMatch(/\{view === 'search' && \(/);
  });
});
