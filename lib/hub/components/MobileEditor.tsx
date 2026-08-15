'use client';
// lib/hub/components/MobileEditor.tsx
//
// Mobile hub customization sheet. Replaces the desktop GridEditor on
// phones (<768px) where the 8-col drag-and-drop grid painter is
// unusable. On mobile the hub view already collapses to a single
// vertical column (collapseLayout @ breakpoint=1 renders widgets in
// *array order*), and desktop renders by explicit x/y — so reordering
// the widgets array changes only the mobile stack and leaves the
// desktop layout untouched. That's exactly what this sheet edits:
//
//   - reorder the vertical stack (dnd-kit vertical sortable, touch
//     sensors) → setDraftWidgets(arrayMove(...))
//   - remove a widget → removeWidget(id)
//   - add a widget from the role/bundle-filtered catalog → addWidget(...)
//   - Save / Cancel via the shared hub store (saveDraft / cancelEdit)
//
// No layout-model change is needed: the widgets array order is already
// what the saved JSON preserves and what the mobile collapse honors.
//
// hub-mobile-customization slice 1.

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus, X, SlidersHorizontal } from 'lucide-react';

import type { UserRole } from '@/lib/auth-roles';
import type { BundleId } from '@/lib/saas/bundles';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';
import { getWidget, allWidgets, type WidgetDefinition } from '@/lib/hub/widget-registry';
import { filterCatalog } from '@/lib/hub/widget-catalog-filter';
import { HUB_GRID_COLS } from '@/lib/hub/grid-model';
import type { WidgetInstance } from '@/lib/hub/types';
import { generatePlacementId } from './GridEditor';
import MobileWidgetSettings, { widgetHasSettings } from './MobileWidgetSettings';

import './MobileEditor.css';

export interface MobileEditorProps {
  open: boolean;
  onClose: () => void;
  roles: UserRole[];
  activeBundles?: BundleId[] | null;
}

export default function MobileEditor({ open, roles, activeBundles = null }: MobileEditorProps) {
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const isDirty = useHubStore((s) => s.isDirty);
  const saveStatus = useHubStore((s) => s.saveStatus);
  const saveError = useHubStore((s) => s.saveError);
  const { saveDraft, cancelEdit, addWidget, removeWidget, setDraftWidgets } = useHubActions();

  const [showAdd, setShowAdd] = useState(false);
  // The widget whose settings sheet is open, or null. A second layer over the reorder sheet rather
  // than a route, so Cancel/Save still governs the whole edit and closing it returns to the list.
  const [editingId, setEditingId] = useState<string | null>(null);

  const widgets = useMemo(() => draftWidgets ?? [], [draftWidgets]);

  const sensors = useSensors(
    // A small drag distance for mouse/stylus; a short press-delay for
    // touch so a tap on the remove button isn't swallowed by a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const catalog = useMemo(() => allWidgets(), []);
  const presentTypes = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);
  const available = useMemo(
    () =>
      filterCatalog(catalog, { roles, activeBundles, category: 'all' }).filter(
        (w) => !presentTypes.has(w.id),
      ),
    [catalog, roles, activeBundles, presentTypes],
  );

  if (!open) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDraftWidgets(arrayMove(widgets, oldIndex, newIndex));
  }

  /**
   * C0n — change one widget's height, clamped to what its definition permits.
   *
   * Goes through `setDraftWidgets`, which is how the desktop grid painter resizes too, so a height
   * set on a phone and one dragged at a desk are the same edit to the same draft and Save writes
   * them identically.
   *
   * Only `h` moves. `x`, `y` and `w` are the desktop arrangement, and this sheet exists precisely
   * because that arrangement is not editable on a phone — changing them here would rearrange a
   * layout the user cannot see.
   */
  function resizeWidget(id: string, requestedH: number) {
    const target = widgets.find((w) => w.id === id);
    if (!target) return;
    const def = getWidget(target.type);
    const min = def?.minSize.h ?? 1;
    const max = def?.maxSize.h ?? 8;
    const h = Math.max(min, Math.min(max, requestedH));
    if (h === target.h) return;
    setDraftWidgets(widgets.map((w) => (w.id === id ? { ...w, h } : w)));
  }

  function handleAdd(def: WidgetDefinition<Record<string, unknown>>) {
    // Place at the bottom of the desktop grid (x:0, y:maxBottom) so the
    // new widget doesn't overlap on desktop; appending to the array
    // also puts it at the bottom of the mobile stack. The user can then
    // drag it up here without affecting the desktop arrangement.
    const bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    const w = Math.max(1, Math.min(HUB_GRID_COLS, def.defaultSize.w));
    addWidget({
      id: generatePlacementId(),
      type: def.id,
      x: 0,
      y: bottom,
      w,
      h: Math.max(1, def.defaultSize.h),
      customization: { content: def.defaultContent },
    });
    setShowAdd(false);
  }

  const saving = saveStatus === 'saving';

  return (
    <div className="hub-msheet" role="dialog" aria-modal="true" aria-label="Customize hub">
      <header className="hub-msheet__bar">
        <button
          type="button"
          className="hub-msheet__btn"
          onClick={cancelEdit}
          disabled={saving}
        >
          <X size={17} aria-hidden /> Cancel
        </button>
        <span className="hub-msheet__title">Customize hub</span>
        <button
          type="button"
          className="hub-msheet__btn hub-msheet__btn--primary"
          onClick={saveDraft}
          disabled={saving || !isDirty}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="hub-msheet__body">
        <p className="hub-msheet__hint">
          Drag the handle to reorder. Widgets stack top-to-bottom on your phone;
          this doesn&apos;t change your desktop layout.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="hub-msheet__list">
              {widgets.map((instance) => (
                <SortableRow
                  key={instance.id}
                  instance={instance}
                  onRemove={() => removeWidget(instance.id)}
                  onEdit={() => setEditingId(instance.id)}
                  onResize={(nextH) => resizeWidget(instance.id, nextH)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {widgets.length === 0 && (
          <p className="hub-msheet__empty">No widgets yet — add one below.</p>
        )}

        <button
          type="button"
          className="hub-msheet__add-toggle"
          onClick={() => setShowAdd((s) => !s)}
          aria-expanded={showAdd}
        >
          <Plus size={16} aria-hidden /> Add a widget
        </button>

        {showAdd && (
          <ul className="hub-msheet__catalog">
            {available.length === 0 && (
              <li className="hub-msheet__cat-empty">
                Every widget available to you is already on your hub.
              </li>
            )}
            {available.map((def) => (
              <li key={def.id}>
                <button
                  type="button"
                  className="hub-msheet__cat-item"
                  onClick={() => handleAdd(def)}
                >
                  <span className="hub-msheet__cat-text">
                    <span className="hub-msheet__cat-label">{def.label}</span>
                    <span className="hub-msheet__cat-cat">{def.category}</span>
                  </span>
                  <Plus size={16} aria-hidden className="hub-msheet__cat-plus" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saveStatus === 'error' && saveError && (
        <div role="alert" className="hub-msheet__error">
          {saveError}
        </div>
      )}

      {/* The per-widget settings sheet, layered over the list. Mounted here so it inherits the same
          fixed full-screen container and the reorder list stays behind it. */}
      {editingId && (
        <MobileWidgetSettings instanceId={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

interface SortableRowProps {
  instance: WidgetInstance;
  onRemove: () => void;
  onEdit: () => void;
  /** C0n — set this widget's height. The caller clamps to the widget definition's bounds. */
  onResize: (nextH: number) => void;
}

function SortableRow({ instance, onRemove, onEdit, onResize }: SortableRowProps) {
  const def = getWidget(instance.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 5 : undefined,
  };
  const label = def?.label ?? instance.type;
  // The Edit control shows only when the widget has something to edit — a pencil that opens
  // "nothing to customize" is worse than no pencil.
  const editable = widgetHasSettings(instance.type);

  return (
    <li ref={setNodeRef} style={style} className="hub-msheet__row">
      <button
        type="button"
        className="hub-msheet__handle"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <span className="hub-msheet__row-label">{label}</span>
      {/* C0n — HEIGHT, the one capability the desktop editor had and this sheet did not.
       *
       * Desktop resizes by dragging in the 8-column grid painter, which is why this sheet replaces
       * it wholesale on a phone. But the phone stack is one column, so WIDTH genuinely has no
       * meaning here — `mobileSizeOverride` forces it to 2 for the bucket maths regardless — while
       * HEIGHT still decides how much of a widget you actually see. A phone-only user could
       * previously reorder, add, remove and configure, and was stuck with whatever height had been
       * set at a desk.
       *
       * Buttons rather than a drag handle: a 40px-tall row on a touch screen cannot host a resize
       * grip that is distinguishable from the reorder grip beside it. Clamped to the widget's own
       * declared bounds, so this cannot produce a size the desktop grid would reject. */}
      <span className="hub-msheet__height" role="group" aria-label={`Height of ${label}`}>
        <button
          type="button"
          className="hub-msheet__height-btn"
          onClick={() => onResize(instance.h - 1)}
          disabled={instance.h <= (def?.minSize.h ?? 1)}
          aria-label={`Make ${label} shorter`}
        >
          −
        </button>
        <span className="hub-msheet__height-value" aria-live="polite">{instance.h}</span>
        <button
          type="button"
          className="hub-msheet__height-btn"
          onClick={() => onResize(instance.h + 1)}
          disabled={instance.h >= (def?.maxSize.h ?? 8)}
          aria-label={`Make ${label} taller`}
        >
          +
        </button>
      </span>
      {editable && (
        <button
          type="button"
          className="hub-msheet__edit"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
        >
          <SlidersHorizontal size={16} aria-hidden />
        </button>
      )}
      <button
        type="button"
        className="hub-msheet__remove"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </li>
  );
}
