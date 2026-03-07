'use client';
// app/admin/cad/components/StandardNotesEditor.tsx — Standard survey notes selector

import { useState } from 'react';
import { useTemplateStore } from '@/lib/cad/store/template-store';
import { STANDARD_NOTES } from '@/lib/cad/templates/standard-notes';

/** Group notes by category. */
function groupByCategory(notes: typeof STANDARD_NOTES) {
  const groups: Record<string, typeof STANDARD_NOTES> = {};
  for (const note of notes) {
    (groups[note.category] ??= []).push(note);
  }
  return groups;
}

export default function StandardNotesEditor() {
  const store = useTemplateStore();
  const notes = store.activeTemplate.standardNotes;
  const selected = new Set(notes.selectedNoteIds);

  const [customInput, setCustomInput] = useState('');

  const grouped = groupByCategory(STANDARD_NOTES);

  function toggleNote(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    store.updateActiveTemplate({
      standardNotes: { ...notes, selectedNoteIds: [...next] },
    });
  }

  function addCustomNote() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    store.updateActiveTemplate({
      standardNotes: { ...notes, customNotes: [...notes.customNotes, trimmed] },
    });
    setCustomInput('');
  }

  function removeCustomNote(index: number) {
    const next = notes.customNotes.filter((_, i) => i !== index);
    store.updateActiveTemplate({
      standardNotes: { ...notes, customNotes: next },
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-800 text-white text-sm select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 font-semibold text-xs uppercase tracking-wide text-gray-400">
        Standard Notes
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Standard note groups */}
        {Object.entries(grouped).map(([category, categoryNotes]) => (
          <div key={category}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {category}
            </div>
            <div className="space-y-1.5">
              {categoryNotes.map((note) => (
                <label
                  key={note.id}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(note.id)}
                    onChange={() => toggleNote(note.id)}
                    className="mt-0.5 accent-blue-500 shrink-0"
                  />
                  <span className="text-xs text-gray-300 group-hover:text-white leading-relaxed">
                    {note.text.length > 120 ? `${note.text.substring(0, 120)}…` : note.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Custom notes */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Custom Notes
          </div>
          {notes.customNotes.length === 0 && (
            <p className="text-xs text-gray-500 italic">No custom notes yet.</p>
          )}
          <div className="space-y-1 mb-2">
            {notes.customNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="flex-1 text-xs text-gray-300 leading-relaxed">{note}</span>
                <button
                  onClick={() => removeCustomNote(i)}
                  className="text-gray-500 hover:text-red-400 transition-colors text-xs shrink-0"
                  aria-label="Remove custom note"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Type a custom note…"
            rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addCustomNote}
            disabled={!customInput.trim()}
            className="mt-1 w-full px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Custom Note
          </button>
        </div>
      </div>
    </div>
  );
}
