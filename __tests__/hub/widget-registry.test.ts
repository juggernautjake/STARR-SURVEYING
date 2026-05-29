// __tests__/hub/widget-registry.test.ts
//
// Coverage for defineWidget / getWidget / allWidgets / widgetsForRoles /
// widgetsByCategory. The widgets themselves are tested in their own
// suites (one file per widget under __tests__/hub/widgets/*).

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import {
  defineWidget,
  getWidget,
  allWidgets,
  widgetsForRoles,
  widgetsByCategory,
  type WidgetDefinition,
  type WidgetProps,
} from '@/lib/hub/widget-registry';

// Reset the registry between tests by overwriting with controlled
// definitions. defineWidget is idempotent (Map.set semantics) so
// re-registering the same id wipes the prior entry.

const adminOnly: WidgetDefinition = {
  id: 'test-admin-only',
  label: 'Admin Only',
  description: 'Only for admins.',
  category: 'office',
  iconName: 'Shield',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: {},
  allowedRoles: ['admin'],
  Widget: function StubAdmin(_props: WidgetProps) { return React.createElement('div'); },
};

const everyone: WidgetDefinition = {
  id: 'test-everyone',
  label: 'Everyone',
  description: 'Anyone can add.',
  category: 'personal',
  iconName: 'Star',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: {},
  allowedRoles: [], // empty = everyone
  Widget: function StubEveryone(_props: WidgetProps) { return React.createElement('div'); },
};

const fieldOnly: WidgetDefinition = {
  id: 'test-field-only',
  label: 'Field Only',
  description: 'Field crew only.',
  category: 'work',
  iconName: 'MapPin',
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: {},
  allowedRoles: ['field_crew'],
  Widget: function StubField(_props: WidgetProps) { return React.createElement('div'); },
};

describe('widget registry', () => {
  beforeEach(() => {
    defineWidget(adminOnly);
    defineWidget(everyone);
    defineWidget(fieldOnly);
  });

  it('defineWidget + getWidget round-trip', () => {
    const out = getWidget('test-admin-only');
    expect(out).toBeDefined();
    expect(out?.id).toBe('test-admin-only');
    expect(out?.label).toBe('Admin Only');
  });

  it('getWidget returns undefined for unknown ids', () => {
    expect(getWidget('totally-fake')).toBeUndefined();
  });

  it('allWidgets includes every registered widget', () => {
    const ids = allWidgets().map((w) => w.id);
    expect(ids).toContain('test-admin-only');
    expect(ids).toContain('test-everyone');
    expect(ids).toContain('test-field-only');
  });
});

describe('widgetsForRoles', () => {
  beforeEach(() => {
    defineWidget(adminOnly);
    defineWidget(everyone);
    defineWidget(fieldOnly);
  });

  it('a student sees only widgets with empty allowedRoles (everyone)', () => {
    const out = widgetsForRoles(['student']).map((w) => w.id);
    expect(out).toContain('test-everyone');
    expect(out).not.toContain('test-admin-only');
    expect(out).not.toContain('test-field-only');
  });

  it('an admin sees admin-only + everyone widgets', () => {
    const out = widgetsForRoles(['admin']).map((w) => w.id);
    expect(out).toContain('test-admin-only');
    expect(out).toContain('test-everyone');
    expect(out).not.toContain('test-field-only');
  });

  it('a multi-role user sees the union of their eligible widgets', () => {
    const out = widgetsForRoles(['admin', 'field_crew']).map((w) => w.id);
    expect(out).toContain('test-admin-only');
    expect(out).toContain('test-field-only');
    expect(out).toContain('test-everyone');
  });

  it('an empty roles array still sees the everyone widgets', () => {
    const out = widgetsForRoles([]).map((w) => w.id);
    expect(out).toContain('test-everyone');
    expect(out).not.toContain('test-admin-only');
  });
});

describe('widgetsByCategory', () => {
  beforeEach(() => {
    defineWidget(adminOnly);
    defineWidget(everyone);
    defineWidget(fieldOnly);
  });

  it('returns an object keyed by every category, even empty ones', () => {
    const out = widgetsByCategory();
    const keys = Object.keys(out);
    expect(keys).toContain('personal');
    expect(keys).toContain('work');
    expect(keys).toContain('office');
    expect(keys).toContain('cad');
    expect(keys).toContain('research');
    expect(keys).toContain('learning');
    expect(keys).toContain('communication');
    expect(keys).toContain('financial');
    expect(keys).toContain('operational');
    expect(keys).toContain('equipment');
    expect(keys).toContain('time-pay');
  });

  it('groups widgets by their category field', () => {
    const out = widgetsByCategory();
    const personalIds = out.personal.map((w) => w.id);
    const officeIds = out.office.map((w) => w.id);
    const workIds = out.work.map((w) => w.id);
    expect(personalIds).toContain('test-everyone');
    expect(officeIds).toContain('test-admin-only');
    expect(workIds).toContain('test-field-only');
  });

  it('empty categories return empty arrays', () => {
    const out = widgetsByCategory();
    expect(out.cad).toEqual([]);
    expect(out.research).toEqual([]);
  });
});
