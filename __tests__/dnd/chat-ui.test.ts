// __tests__/dnd/chat-ui.test.ts — the AI chat surfaces (Slice 9).
//
// Two reported bugs, both locked out here:
//  1. The builder chat's send button was `align-self: stretch` beside a rows={2} textarea, so it
//     rendered as a ~60px slab — and grew with the input.
//  2. Both chats shipped at a fixed size, so a long adjudication was read through a letterbox.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SHEETCHAT_CSS = read('app/dnd/_ui/sheetchat.module.css');
const LIBRARY_CHAT = read('app/dnd/_ui/LibraryChat.tsx');
const EDIT_CHAT = read('app/dnd/_ui/SheetEditChat.tsx');

/** The declarations inside a CSS rule, by selector. */
function block(css: string, selector: string): string {
  const i = css.indexOf(selector + ' {');
  expect(i, `${selector} exists`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
}

describe('the send button is sized to its content, not to the input beside it', () => {
  const send = block(SHEETCHAT_CSS, '.send');

  it('does not stretch to the textarea height', () => {
    // The actual reported bug. `stretch` is what made it a slab, and it got worse as the
    // textarea grew — the button tracked the input's height forever.
    expect(send).not.toMatch(/align-self:\s*stretch/);
    expect(send).toMatch(/align-self:\s*flex-end/);
  });

  it('has a fixed, modest height and does not flex-grow', () => {
    expect(send).toMatch(/height:\s*34px/);
    expect(send).toMatch(/flex:\s*0 0 auto/);
  });

  it('sits on the same baseline as the input it belongs to', () => {
    expect(block(SHEETCHAT_CSS, '.inputRow')).toMatch(/align-items:\s*flex-end/);
  });
});

describe('the marketing site\'s form styling does not leak into the chat inputs', () => {
  // The site's globals.css styles its contact form with BARE element selectors. `textarea
  // { min-height: 140px }` reached into the chat and made a rows={2} input a 140px slab — which
  // is what made the send button beside it look absurd. Exactly the same class of bug as the
  // `p { color: var(--text-secondary) }` leak found in Slice 1.
  //
  // The guard is anchored to the leak still existing: if someone scopes globals.css properly,
  // this test tells them the local resets are now dead code instead of silently passing.
  const GLOBALS = read('app/styles/globals.css');

  it('globals.css still has the bare textarea rule these resets exist to neutralize', () => {
    expect(GLOBALS).toMatch(/^textarea \{[^}]*min-height:\s*140px/m);
  });

  it('both chat inputs neutralize it', () => {
    expect(block(SHEETCHAT_CSS, '.textarea')).toMatch(/min-height:\s*0/);
    expect(LIBRARY_CHAT).toMatch(/minHeight:\s*0/);
  });
});

describe('the chat panels are resizable', () => {
  it('the builder dock anchors its grip and can be sized', () => {
    expect(block(SHEETCHAT_CSS, '.panel')).toMatch(/position:\s*relative/);
    expect(SHEETCHAT_CSS).toMatch(/\.grip\s*\{/);
    expect(EDIT_CHAT).toContain('useResizable');
    expect(EDIT_CHAT).toContain('styles.grip');
  });

  it('the builder dock inverts BOTH axes — it is anchored bottom-right', () => {
    // A non-inverted top-left grip would shrink the panel as you drag away from the corner,
    // which is the opposite of what the gesture means.
    expect(EDIT_CHAT).toMatch(/invert:\s*\{\s*x:\s*true,\s*y:\s*true\s*\}/);
  });

  it('the librarian transcript resizes vertically and remembers', () => {
    expect(LIBRARY_CHAT).toContain('useResizable');
    expect(LIBRARY_CHAT).toMatch(/axis:\s*'y'/);
    expect(LIBRARY_CHAT).toMatch(/storageKey:\s*'dnd:chat-size:librarian'/);
    // It must READ the remembered height, not just compute one.
    expect(LIBRARY_CHAT).toMatch(/size\?\.h\s*\?\?\s*380/);
  });

  it('a remembered size can never strand a panel off-screen', () => {
    // A size saved on a 4K monitor, restored on a laptop, must still fit. The CSS cap is the
    // backstop for the hook's viewport clamp.
    const panel = block(SHEETCHAT_CSS, '.panel');
    expect(panel).toMatch(/max-width:\s*calc\(100vw/);
    expect(panel).toMatch(/max-height:\s*calc\(100vh/);
  });
});

describe('the chat never locks out the typist while the AI thinks (Slice 24)', () => {
  it('neither input is disabled on `busy`', () => {
    // The reported bug: `disabled={busy || !aiConfigured}` took the box away for the whole
    // round-trip — the one moment you have something to add. The request is in flight, not
    // the person. Only a missing API key may disable the input.
    expect(EDIT_CHAT).toMatch(/disabled=\{!aiConfigured\}/);
    expect(EDIT_CHAT).not.toMatch(/disabled=\{busy \|\| !aiConfigured\}/);
    expect(LIBRARY_CHAT).not.toMatch(/disabled=\{busy/);
  });

  it('a send made while busy QUEUES instead of being dropped', () => {
    // Both chats used to `if (busy) return` — typing while the AI worked silently ate the
    // message, which is worse than refusing it, because it looks like it was sent.
    expect(EDIT_CHAT).toMatch(/setQueue/);
    expect(LIBRARY_CHAT).toMatch(/setQueue/);
    expect(EDIT_CHAT).not.toMatch(/if \(!instruction \|\| busy\) return/);
    expect(LIBRARY_CHAT).not.toMatch(/if \(!q \|\| busy\) return/);
  });

  it('the queue is visible', () => {
    // A message you typed but cannot see is indistinguishable from one that was dropped.
    expect(EDIT_CHAT).toMatch(/queue\.length > 0/);
    expect(SHEETCHAT_CSS).toMatch(/\.queued\s*\{/);
  });

  it('edits still run SERIALLY (the queue must not become a race)', () => {
    // Two concurrent ai-edit calls each read the sheet, apply their change and write back — the
    // second silently erases the first. Queueing is what makes "type while busy" safe here;
    // firing them in parallel would be a lost update.
    expect(EDIT_CHAT).toMatch(/if \(busy \|\| queue\.length === 0\) return/);
  });
});

describe('the resize handle is reachable without a mouse', () => {
  const HOOK = read('app/dnd/_ui/useResizable.ts');

  it('exposes keyboard resize and a focusable, labelled handle', () => {
    // A drag-only affordance is invisible to keyboard users and to a tablet at the table,
    // which is exactly where this app gets used.
    expect(HOOK).toMatch(/onKeyDown/);
    expect(HOOK).toMatch(/ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
    expect(HOOK).toMatch(/tabIndex: 0/);
    expect(HOOK).toMatch(/'aria-label'/);
  });

  it('never reads storage during render (that would hydrate-mismatch)', () => {
    // The restore MUST happen in an effect. Seeding useState from localStorage makes the server
    // and the first client render disagree, and React throws the DOM away.
    //
    // Scoped to the HOOK BODY, not the file: `readStored` is a module-level helper declared
    // above it, so a naive "no localStorage before the first useEffect" slice would flag the
    // declaration and prove nothing.
    const body = HOOK.slice(HOOK.indexOf('export function useResizable'));
    const renderPhase = body.slice(0, body.indexOf('useEffect('));
    expect(renderPhase).not.toMatch(/localStorage|readStored\(/);
    // The state starts null and the CSS default covers the first paint.
    expect(renderPhase).toMatch(/useState<Size \| null>\(null\)/);
  });
});
