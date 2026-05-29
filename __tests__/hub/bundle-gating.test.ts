import { describe, it, expect } from 'vitest';
import React from 'react';
import { eligibleWorkModesAfterBundleGate, isWidgetBundleLocked, WORK_MODE_BUNDLE_GATES } from '@/lib/hub/bundle-gating';
import type { WidgetDefinition, WidgetProps } from '@/lib/hub/widget-registry';

function w(id: string, requires?: 'recon' | 'draft' | 'field' | 'office' | 'academy' | 'firm_suite'): WidgetDefinition {
  return {
    id, label: id, description: 'x', category: 'personal', iconName: 'Star',
    defaultSize: { w: 4, h: 2 }, minSize: { w: 3, h: 1 }, maxSize: { w: 12, h: 4 },
    defaultContent: {}, allowedRoles: [],
    requiresBundle: requires,
    Widget: function Stub(_: WidgetProps) { return React.createElement('div'); },
  };
}

describe('isWidgetBundleLocked', () => {
  it('returns false when widget has no requirement', () => {
    expect(isWidgetBundleLocked(w('a'), ['recon'])).toBe(false);
  });
  it('returns false when active=null (gate skipped)', () => {
    expect(isWidgetBundleLocked(w('a', 'office'), null)).toBe(false);
  });
  it('returns false when required bundle is granted', () => {
    expect(isWidgetBundleLocked(w('a', 'office'), ['office'])).toBe(false);
  });
  it('returns true when required bundle is missing', () => {
    expect(isWidgetBundleLocked(w('a', 'office'), ['field'])).toBe(true);
  });
  it('respects firm_suite implying every bundle', () => {
    expect(isWidgetBundleLocked(w('a', 'office'), ['firm_suite'])).toBe(false);
  });
});

describe('eligibleWorkModesAfterBundleGate', () => {
  it('with active=null returns the input list', () => {
    expect(eligibleWorkModesAfterBundleGate(['admin', 'field_crew'], null)).toEqual(['admin', 'field_crew']);
  });
  it('filters roles whose bundle is missing', () => {
    expect(eligibleWorkModesAfterBundleGate(['drawer', 'field_crew'], ['field'])).toEqual(['field_crew']);
  });
  it('firm_suite implies access to everything', () => {
    expect(eligibleWorkModesAfterBundleGate(['drawer', 'field_crew', 'admin'], ['firm_suite'])).toEqual(['drawer', 'field_crew', 'admin']);
  });
});

describe('WORK_MODE_BUNDLE_GATES', () => {
  it('maps each work mode role to a bundle', () => {
    expect(WORK_MODE_BUNDLE_GATES.drawer).toBe('draft');
    expect(WORK_MODE_BUNDLE_GATES.field_crew).toBe('field');
    expect(WORK_MODE_BUNDLE_GATES.researcher).toBe('recon');
  });
});
