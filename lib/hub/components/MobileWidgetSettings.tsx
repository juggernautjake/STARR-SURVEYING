'use client';

// lib/hub/components/MobileWidgetSettings.tsx
//
// EDIT ONE WIDGET, ON A PHONE (owner request, 2026-08-05)
// ══════════════════════════════════════════════════════
//
// *"There are some widgets like the quick actions widget that we need to be able to edit… we need
// to be able to edit what quick actions/links are included. This is for the mobile version."*
//
// The mobile editor could reorder, add and remove widgets — but not open one and change what it
// shows. Quick Actions has a full "which actions, in what order" form; on mobile there was no way
// to reach it.
//
// ── THIS BUILDS NOTHING NEW ─────────────────────────────────────────────────────────────────────
//
// The desktop `WidgetOptionsPanel` already resolves a widget's editor three ways, and this reuses
// exactly those three so the two surfaces cannot drift:
//
//   settings-form → the widget's own `SettingsForm` (Quick Actions ships one)
//   schema        → `SchemaOptionsForm` over the widget's declared fields
//   none          → an honest "nothing to edit here" rather than an empty panel
//
// Writes go through `patchWidgetCustomization` — the same store action the desktop uses — so an edit
// made on a phone and one made at a desk are the same operation on the same draft.

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { getWidget } from '@/lib/hub/widget-registry';
import { getWidgetOptionsEntry, defaultContentForSchema } from '@/lib/hub/widget-options';
import { useHubActions } from '@/lib/hub/use-hub-actions';
import { useHubStore } from '@/lib/hub/hub-store';
import type { WidgetInstance } from '@/lib/hub/types';
import SchemaOptionsForm from './SchemaOptionsForm';

export interface MobileWidgetSettingsProps {
  instanceId: string;
  onClose: () => void;
}

export default function MobileWidgetSettings({ instanceId, onClose }: MobileWidgetSettingsProps) {
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const { patchWidgetCustomization } = useHubActions();

  // Read the live instance from the draft so edits show immediately and survive a reorder.
  const instance: WidgetInstance | undefined = useMemo(
    () => (draftWidgets ?? []).find((w) => w.id === instanceId),
    [draftWidgets, instanceId],
  );

  if (!instance) {
    // The widget was removed while its editor was open. Close rather than render a dangling sheet.
    onClose();
    return null;
  }

  const def = getWidget(instance.type);
  const label = def?.label ?? instance.type;
  const entry = getWidgetOptionsEntry(instance.type);
  const SettingsForm = def?.SettingsForm;

  // The content the form edits. Seeded from the widget's defaults so a freshly-added widget shows
  // complete controls before anything is changed.
  const content = (instance.customization?.content ?? {}) as Record<string, unknown>;

  function commit(next: Record<string, unknown>) {
    // `patchWidgetCustomization` REPLACES the whole customization object — it does not merge. Passing
    // only `{ content }` would wipe the widget's layout, style and interaction settings, so the
    // existing ones are spread back in and only `content` is changed. (The desktop panel merges one
    // level deep for the same reason; this keeps them consistent.)
    patchWidgetCustomization(instanceId, { ...instance!.customization, content: next });
  }

  return (
    <div className="hub-msheet__wsheet" role="dialog" aria-modal="true" aria-label={`Edit ${label}`}>
      <header className="hub-msheet__bar">
        <button type="button" className="hub-msheet__btn" onClick={onClose}>
          <X size={17} aria-hidden /> Done
        </button>
        <span className="hub-msheet__title">Edit {label}</span>
        {/* Symmetric spacer so the title stays centred without a second real control. */}
        <span className="hub-msheet__bar-spacer" aria-hidden />
      </header>

      <div className="hub-msheet__body">
        {entry.source === 'settings-form' && SettingsForm ? (
          <SettingsForm value={content} onChange={(next) => commit(next as Record<string, unknown>)} />
        ) : entry.source === 'schema' ? (
          <SchemaOptionsForm
            fields={entry.fields}
            value={{ ...defaultContentForSchema(entry.fields), ...content }}
            onChange={(next) => commit(next)}
          />
        ) : (
          <p className="hub-msheet__empty">
            {label} doesn&rsquo;t have anything to customize yet. You can still reorder or remove it.
          </p>
        )}
      </div>
    </div>
  );
}

/** Does this widget have anything to edit? Drives whether the row shows an Edit affordance at all —
 *  a pencil that opens "nothing to customize" is worse than no pencil. */
export function widgetHasSettings(type: string): boolean {
  const entry = getWidgetOptionsEntry(type);
  if (entry.source === 'none') return false;
  if (entry.source === 'settings-form') return Boolean(getWidget(type)?.SettingsForm);
  return entry.fields.length > 0;
}
