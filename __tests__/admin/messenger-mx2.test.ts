// __tests__/admin/messenger-mx2.test.ts
//
// Messenger shell — single-pane layout. The conversation list fills the whole
// modal in `list` view; opening a chat / new / search swaps the entire body to
// that pane, with a header back-arrow to return to the list. The list and the
// chat are never shown side-by-side. (Supersedes the earlier two-pane shell:
// the single-pane redesign was adopted when main merged in.)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Messenger panel CSS — single-pane shell', () => {
  const CSS = read('app/admin/styles/AdminMessaging.css');

  it('widens the panel to 640px to match the /admin/messages proportions', () => {
    expect(CSS).toMatch(/\.messenger-panel\s*\{[\s\S]*?width:\s*640px/);
  });

  it('declares __body as a flex container that fills the panel', () => {
    expect(CSS).toMatch(/\.messenger-panel__body\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex:\s*1/);
  });

  it('the sidebar fills the body when it is the active (list) pane', () => {
    expect(CSS).toMatch(/\.messenger-panel__sidebar\s*\{[\s\S]*?flex:\s*1/);
  });

  it('the main pane fills the body when it is the active pane', () => {
    expect(CSS).toMatch(/\.messenger-panel__main\s*\{[\s\S]*?flex:\s*1/);
  });

  it("the empty-prompt pane centers its content vertically + horizontally", () => {
    expect(CSS).toMatch(/\.messenger-panel__main-empty\s*\{[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center/);
  });

  it("single-pane: no fixed 240px sidebar column to collapse", () => {
    // The old two-pane layout pinned the sidebar to 240px and hid it under
    // 520px. Single-pane shows one full-width pane at a time, so there's no
    // fixed-width sidebar (and no collapse media query needed).
    expect(CSS).not.toMatch(/\.messenger-panel__sidebar\s*\{[\s\S]*?flex:\s*0 0 240px/);
  });
});

describe('FloatingMessenger JSX — single-pane wiring', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('renders the __body wrapper with a stable testid', () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-body"/);
  });

  it('renders the sidebar as an <aside> with a stable testid', () => {
    expect(SRC).toMatch(/<aside className="messenger-panel__sidebar"[\s\S]*?data-testid="messenger-panel-sidebar"/);
  });

  it('renders the main pane as a <section> with a stable testid', () => {
    expect(SRC).toMatch(/<section className="messenger-panel__main"[\s\S]*?data-testid="messenger-panel-main"/);
  });

  it('gates the conversation list (sidebar) to the list view only', () => {
    expect(SRC).toMatch(/\{view === 'list' && \(\s*\n\s*<aside className="messenger-panel__sidebar"/);
  });

  it('gates the main pane to the non-list views, so the two never overlap', () => {
    expect(SRC).toMatch(/\{view !== 'list' && \(\s*\n\s*<section className="messenger-panel__main"/);
  });

  it('the chat / new / search views gate their inner content inside the main pane', () => {
    expect(SRC).toMatch(/\{view === 'chat' && activeConv && \(/);
    expect(SRC).toMatch(/\{view === 'new' && \(/);
    expect(SRC).toMatch(/\{view === 'search' && \(/);
  });
});
