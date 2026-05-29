// __tests__/hub/settings-components.test.tsx
//
// Slice 104 — reusable settings components: NumberStepper, ToggleGroup,
// MultiSelect, FilterDropdown, RoutePicker. Pure render coverage via
// react-dom/server; interactive behaviour (clicks, key events) lives
// in the Playwright suite.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import NumberStepper from '@/lib/hub/components/settings/components/NumberStepper';
import ToggleGroup from '@/lib/hub/components/settings/components/ToggleGroup';
import MultiSelect from '@/lib/hub/components/settings/components/MultiSelect';
import FilterDropdown from '@/lib/hub/components/settings/components/FilterDropdown';

describe('NumberStepper', () => {
  it('renders value + suffix', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <NumberStepper value={30} onChange={() => {}} suffix="sec" ariaLabel="Refresh" />,
    );
    expect(html).toContain('value="30"');
    expect(html).toContain('sec');
    expect(html).toContain('aria-label="Refresh"');
  });

  it('disables decrement at min', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <NumberStepper value={0} onChange={() => {}} min={0} max={100} />,
    );
    // The decrement button is the first <button> in the DOM (− label).
    expect(html.indexOf('disabled')).toBeGreaterThan(html.indexOf('Decrease'));
  });

  it('disables increment at max', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <NumberStepper value={100} onChange={() => {}} min={0} max={100} />,
    );
    expect(html).toContain('aria-label="Increase"');
    expect(html).toContain('disabled');
  });
});

describe('ToggleGroup', () => {
  it('renders each option + marks the active one', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ToggleGroup
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ] as const}
        value="a"
        onChange={() => {}}
        ariaLabel="Test"
      />,
    );
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });
});

describe('MultiSelect', () => {
  const options = [
    { value: 'one' as const, label: 'One' },
    { value: 'two' as const, label: 'Two' },
    { value: 'three' as const, label: 'Three' },
  ];

  it('renders every option', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <MultiSelect options={options} value={['one']} onChange={() => {}} ariaLabel="Picker" />,
    );
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html).toContain('Three');
    expect(html).toContain('aria-label="Picker"');
  });

  it('checked attribute appears for selected values', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <MultiSelect options={options} value={['one', 'three']} onChange={() => {}} />,
    );
    const checked = html.match(/checked=""/g);
    expect(checked?.length).toBe(2);
  });
});

describe('FilterDropdown', () => {
  it('renders a native select with every option', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <FilterDropdown
        options={[
          { value: 'a' as const, label: 'Alpha' },
          { value: 'b' as const, label: 'Beta' },
          { value: 'c' as const, label: 'Gamma' },
        ]}
        value="b"
        onChange={() => {}}
        ariaLabel="Picker"
      />,
    );
    expect(html).toContain('<select');
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html).toContain('Gamma');
    expect(html).toContain('aria-label="Picker"');
  });
});
