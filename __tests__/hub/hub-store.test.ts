// __tests__/hub/hub-store.test.ts
//
// Slice 97 — hub store. Locks down the edit-mode lifecycle:
// hydrate → enterEditMode → mutate draft → cancel/save.
//
// Save flow is exercised against `globalThis.fetch` swapped to a stub.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useHubStore } from '@/lib/hub/hub-store';
import type { WidgetInstance } from '@/lib/hub/types';

function makeWidget(id: string, type = 'pinned-pages', overrides: Partial<WidgetInstance> = {}): WidgetInstance {
  return { id, type, x: 0, y: 0, w: 6, h: 2, ...overrides };
}

function reset() {
  useHubStore.setState({
    widgets: [],
    draftWidgets: null,
    isEditMode: false,
    isDirty: false,
    saveStatus: 'idle',
    saveError: null,
    theme: null,
    customTheme: null,
    density: null,
    fontScale: null,
    hubSettings: {},
    activePersona: null,
  });
}

describe('hub store — hydrate', () => {
  beforeEach(reset);

  it('replaces saved widgets + non-widget settings, clears edit state', () => {
    const widgets = [makeWidget('w1'), makeWidget('w2')];
    useHubStore.getState().hydrate({
      widgets,
      theme: 'starr-dark',
      density: 'compact',
      fontScale: 1.0,
      hubSettings: { greetingAutoCollapseMin: 5 },
      activePersona: 'admin',
    });
    const s = useHubStore.getState();
    expect(s.widgets).toEqual(widgets);
    expect(s.draftWidgets).toBeNull();
    expect(s.isEditMode).toBe(false);
    expect(s.isDirty).toBe(false);
    expect(s.theme).toBe('starr-dark');
    expect(s.density).toBe('compact');
    expect(s.fontScale).toBe(1.0);
    expect(s.hubSettings).toEqual({ greetingAutoCollapseMin: 5 });
    expect(s.activePersona).toBe('admin');
  });

  it('hydrate resets any prior edit state', () => {
    const widgets = [makeWidget('w1')];
    useHubStore.setState({
      isEditMode: true,
      draftWidgets: [makeWidget('w-draft')],
      isDirty: true,
      saveStatus: 'error',
      saveError: 'old error',
    });
    useHubStore.getState().hydrate({ widgets });
    const s = useHubStore.getState();
    expect(s.isEditMode).toBe(false);
    expect(s.draftWidgets).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.saveStatus).toBe('idle');
    expect(s.saveError).toBeNull();
  });
});

describe('hub store — enterEditMode', () => {
  beforeEach(reset);

  it('seeds draftWidgets as a clone of widgets and flips on edit mode', () => {
    const widgets = [makeWidget('w1'), makeWidget('w2')];
    useHubStore.getState().hydrate({ widgets });
    useHubStore.getState().enterEditMode();
    const s = useHubStore.getState();
    expect(s.isEditMode).toBe(true);
    expect(s.draftWidgets).toEqual(widgets);
    expect(s.draftWidgets).not.toBe(widgets); // distinct array
    expect(s.isDirty).toBe(false);
  });

  it('is a no-op when already editing', () => {
    const widgets = [makeWidget('w1')];
    useHubStore.getState().hydrate({ widgets });
    useHubStore.getState().enterEditMode();
    const draftA = useHubStore.getState().draftWidgets;
    useHubStore.getState().enterEditMode();
    const draftB = useHubStore.getState().draftWidgets;
    expect(draftA).toBe(draftB);
  });
});

describe('hub store — cancelEdit', () => {
  beforeEach(reset);

  it('discards the draft + flips edit mode off', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().enterEditMode();
    useHubStore.getState().setDraftWidgets([makeWidget('w-other')]);
    expect(useHubStore.getState().isDirty).toBe(true);
    useHubStore.getState().cancelEdit();
    const s = useHubStore.getState();
    expect(s.isEditMode).toBe(false);
    expect(s.draftWidgets).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.widgets).toEqual([makeWidget('w1')]);
  });
});

describe('hub store — patch helpers', () => {
  beforeEach(reset);

  it('setDraftWidgets only mutates when editing', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().setDraftWidgets([makeWidget('w-other')]);
    expect(useHubStore.getState().draftWidgets).toBeNull();
  });

  it('addWidget appends only while editing + marks dirty', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().enterEditMode();
    // Slice W1 — addWidget now rejects type duplicates, so the
    // second widget needs a distinct type from w1's default.
    useHubStore.getState().addWidget(makeWidget('w2', 'bookmarks'));
    const draft = useHubStore.getState().draftWidgets!;
    expect(draft.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(useHubStore.getState().isDirty).toBe(true);
  });

  it('removeWidget filters by id + marks dirty', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1'), makeWidget('w2')] });
    useHubStore.getState().enterEditMode();
    useHubStore.getState().removeWidget('w1');
    expect(useHubStore.getState().draftWidgets?.map((w) => w.id)).toEqual(['w2']);
    expect(useHubStore.getState().isDirty).toBe(true);
  });

  it('patchWidgetCustomization merges customization into the matched widget', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().enterEditMode();
    useHubStore.getState().patchWidgetCustomization('w1', {
      layout: { showTitle: false },
      style: { colorMode: 'accent' },
    });
    const w = useHubStore.getState().draftWidgets!.find((x) => x.id === 'w1')!;
    expect(w.customization?.layout?.showTitle).toBe(false);
    expect(w.customization?.style?.colorMode).toBe('accent');
    expect(useHubStore.getState().isDirty).toBe(true);
  });

  it('patchWidgetCustomization is a no-op when not editing', () => {
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().patchWidgetCustomization('w1', { layout: { showTitle: false } });
    expect(useHubStore.getState().widgets[0].customization).toBeUndefined();
  });
});

describe('hub store — saveDraft', () => {
  beforeEach(() => {
    reset();
    vi.restoreAllMocks();
  });

  it('PUTs the draft + echoed settings, then promotes draft → widgets on 200', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    useHubStore.getState().hydrate({
      widgets: [makeWidget('w1')],
      theme: 'starr-default',
      density: 'comfortable',
      fontScale: 1.0,
      hubSettings: { greetingPrefix: 'Howdy' },
      activePersona: 'admin',
    });
    useHubStore.getState().enterEditMode();
    // Slice W1 — addWidget now rejects type duplicates, so the
    // second widget needs a distinct type from w1's default.
    useHubStore.getState().addWidget(makeWidget('w2', 'bookmarks'));

    await useHubStore.getState().saveDraft();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('/api/admin/me/hub-layout');
    expect(call[1].method).toBe('PUT');
    const body = JSON.parse(call[1].body as string);
    expect(body.widgets.map((w: WidgetInstance) => w.id)).toEqual(['w1', 'w2']);
    expect(body.theme).toBe('starr-default');
    expect(body.density).toBe('comfortable');
    expect(body.fontScale).toBe(1.0);
    expect(body.hubSettings).toEqual({ greetingPrefix: 'Howdy' });
    expect(body.activePersona).toBe('admin');

    const s = useHubStore.getState();
    expect(s.isEditMode).toBe(false);
    expect(s.draftWidgets).toBeNull();
    expect(s.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(s.isDirty).toBe(false);
    expect(s.saveStatus).toBe('idle');
  });

  it('records saveError on non-2xx + leaves edit state intact', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad widget' }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().enterEditMode();
    // Slice W1 — addWidget now rejects type duplicates, so the
    // second widget needs a distinct type from w1's default.
    useHubStore.getState().addWidget(makeWidget('w2', 'bookmarks'));

    await useHubStore.getState().saveDraft();

    const s = useHubStore.getState();
    expect(s.saveStatus).toBe('error');
    expect(s.saveError).toBe('bad widget');
    expect(s.isEditMode).toBe(true);
    expect(s.draftWidgets?.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(s.widgets.map((w) => w.id)).toEqual(['w1']);
  });

  it('records saveError on network failure', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);

    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    useHubStore.getState().enterEditMode();
    // Slice W1 — addWidget now rejects type duplicates, so the
    // second widget needs a distinct type from w1's default.
    useHubStore.getState().addWidget(makeWidget('w2', 'bookmarks'));

    await useHubStore.getState().saveDraft();
    const s = useHubStore.getState();
    expect(s.saveStatus).toBe('error');
    expect(s.saveError).toBe('offline');
  });

  it('saveDraft is a no-op when not editing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useHubStore.getState().hydrate({ widgets: [makeWidget('w1')] });
    await useHubStore.getState().saveDraft();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
