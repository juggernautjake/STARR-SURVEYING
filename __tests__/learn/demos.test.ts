// __tests__/learn/demos.test.ts — the directive that lets a lesson embed something interactive.
//
// The bar for this module is not "it parses the happy case". It is that a mistyped directive in a
// lesson somebody is reading tonight costs an illustration and nothing else.

import { describe, it, expect } from 'vitest';
import { splitDemos, hasDemo, numberProp, DEMO_NAMES } from '@/lib/learn/demos';

describe('splitDemos', () => {
  it('leaves ordinary prose as one segment', () => {
    const out = splitDemos('A paragraph.\n\nAnd another.');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'html', text: 'A paragraph.\n\nAnd another.' });
  });

  it('splits prose around a directive and keeps both halves', () => {
    const out = splitDemos('Before.\n\n[demo:quadrant azimuth=192]\n\nAfter.');
    expect(out.map((s) => s.kind)).toEqual(['html', 'demo', 'html']);
    expect((out[0] as { text: string }).text).toContain('Before.');
    expect((out[2] as { text: string }).text).toContain('After.');
  });

  it('reads the props', () => {
    const out = splitDemos('[demo:quadrant azimuth=192]');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'demo', demo: { name: 'quadrant', props: { azimuth: '192' } } });
  });

  it('takes a directive with no props', () => {
    const out = splitDemos('[demo:quadrant]');
    expect(out[0]).toEqual({ kind: 'demo', demo: { name: 'quadrant', props: {} } });
  });

  it('handles several directives in one section', () => {
    const out = splitDemos('One\n[demo:quadrant azimuth=45]\nTwo\n[demo:quadrant azimuth=300]\nThree');
    expect(out.map((s) => s.kind)).toEqual(['html', 'demo', 'html', 'demo', 'html']);
  });

  // ── the ways an author gets it wrong ──────────────────────────────────────────────────────────

  it('leaves an unknown demo name in the prose rather than dropping it', () => {
    // Visible nonsense beats an invisible nothing: the author can see what they typed.
    const out = splitDemos('Text\n[demo:compazz azimuth=192]\nMore');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('html');
    expect((out[0] as { text: string }).text).toContain('[demo:compazz azimuth=192]');
  });

  it('ignores a directive mentioned inside a sentence', () => {
    // An author explaining the syntax must not accidentally summon the widget.
    const out = splitDemos('Write [demo:quadrant azimuth=192] on its own line to embed the compass.');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('html');
  });

  it('never returns an empty list, even for empty content', () => {
    // The caller renders `segments.map(...)` with no guard, so this is load-bearing.
    expect(splitDemos('')).toHaveLength(1);
    expect(splitDemos('   ')).toHaveLength(1);
  });

  it('does not emit a blank prose segment when the directive is first or last', () => {
    const out = splitDemos('[demo:quadrant azimuth=1]\n\nAfter.');
    expect(out.map((s) => s.kind)).toEqual(['demo', 'html']);
  });

  it('is repeatable — the regex is global and must not carry lastIndex between calls', () => {
    // A module-level /g regex reused across calls is a genuinely nasty bug: the SECOND section of
    // a module silently loses its demo, and only that one.
    const content = 'Text\n[demo:quadrant azimuth=10]\nText';
    const a = splitDemos(content);
    const b = splitDemos(content);
    expect(b).toEqual(a);
    expect(b.filter((s) => s.kind === 'demo')).toHaveLength(1);
  });
});

describe('hasDemo', () => {
  it('is false for ordinary content and true when one is embedded', () => {
    expect(hasDemo('Just words about azimuths.')).toBe(false);
    expect(hasDemo('Words\n[demo:quadrant azimuth=192]')).toBe(true);
  });
});

describe('numberProp', () => {
  it('reads a number', () => {
    expect(numberProp({ azimuth: '192' }, 'azimuth', 0)).toBe(192);
  });

  it('falls back rather than handing NaN to a component that will draw with it', () => {
    // `Math.cos(NaN)` is NaN, an SVG path of "M NaN NaN" renders nothing, and nothing throws.
    expect(numberProp({ azimuth: '19o' }, 'azimuth', 192)).toBe(192);
    expect(numberProp({}, 'azimuth', 192)).toBe(192);
    expect(numberProp({ azimuth: '' }, 'azimuth', 192)).toBe(192);
  });

  it('takes a negative and a decimal, which are both legal azimuth inputs', () => {
    expect(numberProp({ a: '-30' }, 'a', 0)).toBe(-30);
    expect(numberProp({ a: '192.5' }, 'a', 0)).toBe(192.5);
  });
});

describe('the registry', () => {
  it('every name a lesson may use is rendered by LessonContent', async () => {
    // Structural, not textual: the guard is that the component's switch covers the registry, so
    // adding a name to DEMO_NAMES without teaching the renderer about it fails here rather than
    // rendering a blank box in a lesson.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('app/admin/components/learn/LessonContent.tsx', 'utf8'));
    for (const name of DEMO_NAMES) {
      expect(src, `LessonContent has no case for '${name}'`).toContain(`case '${name}':`);
    }
  });
});
