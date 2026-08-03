// Every component is reachable (P4-6, audit A-1 / A-3).
//
// `no-orphan-modules.test.ts` does this for `lib/dnd`. This is the same guard for COMPONENTS, and it is the
// one that would have caught the audit's two most embarrassing findings years earlier:
//
//   · **A-1** — `TemplateBrowser` and `SheetStyleBrowser`, rendered by nothing after `SheetChrome` replaced
//     them, with a test still asserting against the orphan's source so the suite stayed green while
//     guarding code no user could execute.
//   · **A-3** — the three homebrew designers, complete and tested, that nothing linked to.
//
// A unit test proves a component RENDERS. This proves someone can get to it. Those are different claims,
// and this repo has repeatedly shipped the first while believing the second.
//
// WHAT IT FOUND ON ITS FIRST RUN (seven orphans, all real):
//   deleted — SkinSwitch, LayoutSwitch, CampaignGallery (all superseded by SheetChrome / CampaignGalleryDm)
//   wired   — CampaignCustomPolicyToggle (the vanilla-only switch: `allow_custom` gated content submission
//             on every campaign while no DM could set it), PartyGallery (its own header said it "mounts on
//             the campaign page"; it never did)
//   exempt  — SystemSwitcher and SystemLibrary, each with a reason and a slice
//
// SystemSwitcher is now DELETED (P4-6c, 2026-07-29) — the exemption did its job. It bought the time to
// re-point three test files that were asserting its transpose UI, one assertion at a time against the
// surfaces that inherited each behaviour, rather than deleting the component and the coverage together.
// That is what an exemption is for: a deadline with a reason attached, not a permanent pass. SystemLibrary
// remains, still looking for its slice.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIRS = ['app/dnd/_ui', 'app/dnd/_sheet/components'];

/**
 * Components that are legitimately unreferenced. Every entry needs a REASON and, where it is meant to be
 * temporary, the slice that removes it — the point of the list is that adding to it is a deliberate act
 * rather than a way to silence the guard.
 */
const EXEMPT: Record<string, string> = {
  // SystemLibrary was the single entry here, exempted with the note "Wire it or delete it
  // deliberately; do not let it sit here indefinitely." It is now mounted in the 5e and PF2
  // builders — the surface its own header always claimed — so the exemption goes with it.
};

/** Every component file the guard scans. */
function componentFiles(): string[] {
  const out: string[] = [];
  for (const dir of DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.tsx')) out.push(path.posix.join(dir, f));
    }
  }
  return out.sort();
}

/** Every .ts/.tsx source file that could reference a component. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(child); }
      else if (/\.tsx?$/.test(entry.name)) out.push(child);
    }
  };
  walk('app');
  walk('lib');
  return out;
}

const FILES = componentFiles();
const SOURCES = sourceFiles().map((f) => ({ path: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

/** Is this component imported or rendered from anywhere that is not itself? */
function isReferenced(rel: string): boolean {
  const name = path.basename(rel, '.tsx');
  // Both forms, because a component can be imported under a different local name and rendered under it,
  // or imported for a type. An import from its path is the reliable signal; `<Name` catches same-directory
  // renders where the import line was matched by the path check anyway.
  const importRe = new RegExp(`from\\s+['"][^'"]*/${name}['"]|from\\s+['"]\\./${name}['"]`);
  const renderRe = new RegExp(`<${name}[\\s/>]`);
  return SOURCES.some((s) => s.path !== rel && (importRe.test(s.text) || renderRe.test(s.text)));
}

describe('the sweep covers what it claims', () => {
  it('finds a realistic number of components', () => {
    // A lower bound, so adding components never breaks this — but deleting the scan does.
    expect(FILES.length).toBeGreaterThan(80);
    expect(FILES).toContain('app/dnd/_ui/SheetChrome.tsx');
  });

  it('and a realistic number of sources to search', () => {
    expect(SOURCES.length).toBeGreaterThan(200);
  });
});

describe('no component is an orphan', () => {
  it('every orphan is a KNOWN one', () => {
    const orphans = FILES.filter((f) => !isReferenced(f) && !EXEMPT[f]);
    expect(
      orphans,
      'These components are rendered by nothing. A component nobody can reach is indistinguishable from one '
      + 'that does not exist — and worse, because it looks done and its tests pass. Wire it up, delete it, '
      + 'or add it to EXEMPT with a reason.',
    ).toEqual([]);
  });

  it('and every exemption still applies', () => {
    const stale = Object.keys(EXEMPT).filter((f) => isReferenced(f));
    expect(stale, 'These are referenced now and should come off EXEMPT.').toEqual([]);
  });

  it('every exemption gives a real reason', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(60);
    }
  });
});

describe('the specific orphans the audit found stay fixed', () => {
  it('A-1: the superseded browsers are gone', () => {
    for (const gone of ['app/dnd/_ui/TemplateBrowser.tsx', 'app/dnd/_ui/SheetStyleBrowser.tsx']) {
      expect(fs.existsSync(path.join(ROOT, gone)), `${gone} should stay deleted`).toBe(false);
    }
  });

  it('A-3: the homebrew designers are still linked', () => {
    expect(isReferenced('app/dnd/_ui/HomebrewDesignerLinks.tsx')).toBe(true);
  });

  it('and the four this guard found on its first run are gone', () => {
    for (const gone of [
      'app/dnd/_sheet/components/SkinSwitch.tsx',
      'app/dnd/_sheet/components/LayoutSwitch.tsx',
      'app/dnd/_sheet/components/CampaignGallery.tsx',
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone)), `${gone} was superseded and should stay deleted`).toBe(false);
    }
  });

  it('while the two REAL features it found are now reachable', () => {
    // These were the valuable half: working DM controls nobody could open.
    expect(isReferenced('app/dnd/_ui/CampaignCustomPolicyToggle.tsx'), 'the vanilla-only switch').toBe(true);
    expect(isReferenced('app/dnd/_sheet/components/PartyGallery.tsx'), 'the party roster').toBe(true);
  });
});
