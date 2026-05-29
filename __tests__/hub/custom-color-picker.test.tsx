// __tests__/hub/custom-color-picker.test.tsx
//
// Slice 107 — per-widget custom color picker. Covers the static
// render shape: contrast badge color + Fix-it button visibility tied
// to the WCAG verdict. Interactive UX (click Fix-it, change bg via
// the color input, blank-fg auto-derive update) lives in the
// Playwright suite.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import CustomColorPicker from '@/lib/hub/components/settings/CustomColorPicker';
import type { WidgetCustomization } from '@/lib/hub/types';

describe('CustomColorPicker — render', () => {
  it('renders both color inputs labelled', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: '#FFFFFF', customFg: '#000000' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    expect(html).toContain('Background');
    expect(html).toContain('Text');
    expect(html).toContain('aria-label="Background"');
    expect(html).toContain('aria-label="Text"');
  });

  it('renders the AA-passing badge in green when colors clear AA', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: '#FFFFFF', customFg: '#000000' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    expect(html).toContain('var(--theme-success)');
    expect(html).toContain('21.00:1 (AAA)');
    // Fix it button hidden when passing.
    expect(html).not.toContain('>Fix it<');
  });

  it('renders the failing badge in red + the Fix it button when below AA', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: '#FFFFFF', customFg: '#CCCCCC' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    expect(html).toContain('var(--theme-danger)');
    expect(html).toContain('Fix it');
  });

  it('auto-derives fg from bg when no customFg is set', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: '#FFFFFF' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    // Auto-derived fg from white bg should be black → AAA contrast.
    expect(html).toContain('AAA');
    // No "auto" reset link appears when fg is auto-derived.
    expect(html).not.toContain('>auto<');
  });

  it('exposes the reset link when an explicit fg is set', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: '#FFFFFF', customFg: '#000000' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    expect(html).toContain('auto');
  });

  it('shows the validation hint when bg is unparseable', () => {
    const custom: WidgetCustomization = {
      style: { colorMode: 'custom', customBg: 'not hex', customFg: '#000000' },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <CustomColorPicker customization={custom} onChange={() => {}} />,
    );
    expect(html).toContain('Enter valid hex colors to check contrast.');
  });
});
