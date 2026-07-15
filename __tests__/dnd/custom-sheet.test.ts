// __tests__/dnd/custom-sheet.test.ts — the AI-built custom sheet composes to safe,
// sandboxed HTML from building blocks (Phase V, Slice 6).
import { describe, it, expect } from 'vitest';
import { composeCustomSheet, normalizeLayout, hasCustomLayout, sanitizeBlockHtml } from '@/lib/dnd/custom-sheet';

describe('custom sheet composition', () => {
  it('renders each building block type into the document', () => {
    const html = composeCustomSheet({
      title: 'Kael the Bold',
      blocks: [
        { type: 'heading', text: 'Fighter 5', sub: 'Human · Champion' },
        { type: 'stats', title: 'Abilities', items: [{ label: 'STR', value: 18 }, { label: 'DEX', value: 14 }] },
        { type: 'list', title: 'Features', items: ['Second Wind', 'Action Surge'] },
        { type: 'table', title: 'Attacks', columns: ['Weapon', 'Damage'], rows: [['Longsword', '1d8+4']] },
        { type: 'note', text: 'Remember Action Surge', tone: 'warn' },
        { type: 'text', text: 'A stoic frontline defender.' },
        { type: 'divider' },
      ],
    });
    expect(html).toContain('Kael the Bold');
    expect(html).toContain('Fighter 5');
    expect(html).toContain('Second Wind');
    expect(html).toContain('Longsword');
    expect(html).toContain('cs-note-warn');
    expect(html).toContain('<hr class="cs-divider">');
    // A full standalone document (goes into an iframe srcdoc).
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('escapes text content so blocks cannot inject markup', () => {
    const html = composeCustomSheet({ blocks: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('sanitizes html blocks (strips scripts and handlers)', () => {
    expect(sanitizeBlockHtml('<b>ok</b><script>steal()</script>')).toBe('<b>ok</b>');
    expect(sanitizeBlockHtml('<div onclick="evil()">x</div>')).not.toContain('onclick');
    expect(sanitizeBlockHtml('<a href="javascript:evil()">x</a>')).not.toContain('javascript:');
    const html = composeCustomSheet({ blocks: [{ type: 'html', html: '<p>Bio</p><script>bad()</script>' }] });
    expect(html).toContain('<p>Bio</p>');
    expect(html).not.toContain('bad()');
  });

  it('drops unknown/malformed blocks instead of rendering them', () => {
    const layout = normalizeLayout({ blocks: [{ type: 'mystery', payload: 42 }, { type: 'text', text: 'kept' }, null, 'nope'] });
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0]).toEqual({ type: 'text', text: 'kept' });
  });

  it('custom css cannot break out of the style element', () => {
    const html = composeCustomSheet({ blocks: [{ type: 'text', text: 'x' }] }, '</style><script>bad()</script>');
    expect(html).not.toContain('<script>bad()</script>');
    // The closing style tag in the CSS is neutralized.
    expect(html.match(/<\/style>/g)?.length).toBe(1);
  });

  it('hasCustomLayout reflects whether there are valid blocks', () => {
    expect(hasCustomLayout({ blocks: [] })).toBe(false);
    expect(hasCustomLayout({ blocks: [{ type: 'text', text: 'hi' }] })).toBe(true);
    expect(hasCustomLayout(null)).toBe(false);
    expect(hasCustomLayout('garbage')).toBe(false);
  });
});
