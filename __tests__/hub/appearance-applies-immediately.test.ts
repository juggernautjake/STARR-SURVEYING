// __tests__/hub/appearance-applies-immediately.test.ts
//
// Owner: *"make sure they are applied as soon as they are selected by the user to all pages."*
//
// ── THE THIRD VARIANT OF ONE DEFECT, IN ONE DAY ─────────────────────────────────────────────────
//
// | | what was wrong | what the user saw |
// |---|---|---|
// | theme | applied at the wrong LEVEL — a wrapper inside the Hub | the Hub changed, nothing else did |
// | density / text size | the tokens had no READER anywhere | nothing changed at all |
// | this | the reader existed and **nothing told it** | the setting saved and did nothing |
//
// The three pickers save to `/api/admin/me/hub-layout` and update their own component state.
// `ShellTheme` reads `useHubStore`. Neither picker touches the store — so a chosen theme applied on
// the next full load of the Hub, the only page that hydrates it, and never on any other page.
//
// All three failures are indistinguishable from the outside, which is why each needed finding
// separately and why this file pins the wiring rather than the appearance.

import { describe, it, expect } from 'vitest';
import { readCode } from '../_helpers/source';
import { APPEARANCE_CHANGED } from '@/lib/hub/appearance-broadcast';

const shell = readCode('app/admin/components/ShellTheme.tsx');
const pickers = {
  theme: readCode('app/admin/profile/components/ThemePicker.tsx'),
  density: readCode('app/admin/profile/components/DensityPicker.tsx'),
  fontScale: readCode('app/admin/profile/components/FontScaleSlider.tsx'),
};

describe('a saved appearance change reaches the shell', () => {
  it('every picker announces its save', () => {
    // All three, not just the theme: a user who changes density and sees nothing happen learns the
    // settings page does not work, and stops trying the others.
    for (const [name, src] of Object.entries(pickers)) {
      expect(src, `the ${name} picker saves and tells nobody`).toContain('broadcastAppearanceChange');
    }
  });

  it('announces AFTER the save succeeds, not before', () => {
    // Applying on click would show a theme the server rejected — the UI and the database disagreeing
    // about what you chose, with the wrong one on screen.
    for (const [name, src] of Object.entries(pickers)) {
      // The CALL, not the name — `indexOf('broadcastAppearanceChange')` finds the import statement
      // at the top of the file and reports every picker as broadcasting first. Caught by this test
      // failing on its own first run, which is the cheapest place to find it.
      const at = src.indexOf('broadcastAppearanceChange({');
      const savedAt = src.indexOf('setLayout(data.layout)');
      expect(at, `${name}: no broadcast call found`).toBeGreaterThan(-1);
      expect(savedAt, `${name}: no save-success marker found`).toBeGreaterThan(-1);
      expect(at, `${name} broadcasts before the save is confirmed`).toBeGreaterThan(savedAt);
    }
  });

  it('the shell listens for it', () => {
    expect(shell).toContain('addEventListener(APPEARANCE_CHANGED');
    // …and stops listening. A shell-level listener leaking on every navigation is the kind of thing
    // that shows up months later as a slow page nobody can explain.
    expect(shell).toContain('removeEventListener(APPEARANCE_CHANGED');
  });

  it('the event name is shared, not spelled out twice', () => {
    // A typo between dispatcher and listener fails silently and looks exactly like the bug this
    // fixes, so both sides import the constant.
    expect(APPEARANCE_CHANGED).toBe('starr:appearance-changed');
    expect(shell).toContain("from '@/lib/hub/appearance-broadcast'");
    for (const src of Object.values(pickers)) {
      expect(src).toContain("from '@/lib/hub/appearance-broadcast'");
    }
  });
});

describe('a hard load of a non-Hub page still gets your theme', () => {
  it('fetches the saved layout when the store and the echo are both empty', () => {
    // Only the Hub hydrates the store. Open /admin/jobs directly and `theme` is null forever, so
    // without this the shell shows the default whatever was saved — and the localStorage echo
    // cannot help a device that has never written one.
    expect(shell).toContain("fetch('/api/admin/me/hub-layout'");
  });

  it('does not fetch when it already knows the answer', () => {
    // The common path must stay a zero-request render: a preference lookup on every page load of
    // every admin page is a cost paid by everyone to fix a first-visit case.
    expect(shell).toMatch(/if \(typeof window === 'undefined' \|\| theme\) return;/);
    expect(shell).toMatch(/localStorage\.getItem\(ECHO_KEY\)\) return;/);
  });

  it('fails silently, because a palette is not worth an error', () => {
    expect(shell).toMatch(/\.catch\(\(\) => \{[^}]*\}\)/);
  });
});

describe('one writer to <html>', () => {
  it('all three sources go through the same apply()', () => {
    // Store, event and fetch each supply the same three values. Three call sites writing them three
    // slightly different ways is how one path forgets to clamp, or forgets the echo, and the bug
    // only appears for whoever took that path.
    expect(shell).toContain('const apply = useCallback');
    // The clamp lives inside it, so no source can bypass the bounds.
    expect(shell).toMatch(/const apply = useCallback[\s\S]*?clampFontScale/);
  });
});
