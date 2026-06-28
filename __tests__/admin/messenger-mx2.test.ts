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

  it("single-pane: the sidebar (conversation list) fills the panel", () => {
    // The messenger is now a single-pane modal (list <-> full chat), so the
    // sidebar fills the panel (flex: 1) instead of being a fixed 240px column.
    expect(CSS).toMatch(/\.messenger-panel__sidebar\s*\{[\s\S]*?flex:\s*1/);
  });

  it("the main pane expands to fill the rest of the row", () => {
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

  it("single-pane: the sidebar shows for the list view, the main pane for the rest", () => {
    // No simultaneous empty main pane any more — when view === 'list' the
    // conversation list (sidebar) fills the panel; every other view renders the
    // main pane instead. The two are mutually exclusive (single pane).
    expect(SRC).toMatch(/\{view === 'list' && \(\s*\n\s*<aside className="messenger-panel__sidebar"/);
    expect(SRC).toMatch(/\{view !== 'list' && \(\s*\n\s*<section className="messenger-panel__main"/);
  });

  it("the chat / new / search views still gate their inner content (now rendered inside the main pane)", () => {
    expect(SRC).toMatch(/\{view === 'chat' && activeConv && \(/);
    expect(SRC).toMatch(/\{view === 'new' && \(/);
    expect(SRC).toMatch(/\{view === 'search' && \(/);
  });
});
