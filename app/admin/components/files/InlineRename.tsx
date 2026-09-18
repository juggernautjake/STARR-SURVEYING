'use client';

// app/admin/components/files/InlineRename.tsx — rename a file where it is listed.
//
// Owner, 2026-09-18: "Please make sure that we can fully rename pictures/videos/files inside of
// projects/jobs and in the interactive map editor too."
//
// Until today the only way to rename anything was to open it full-screen in the viewer and click its
// title. That works, but it is the wrong shape for the job people actually do: going down a panel of
// forty files off a phone, where half are called IMG_5685.jpg, and naming them. Opening and closing a
// full-screen viewer forty times is not renaming, it is a penalty.
//
// So this is the same edit, inline, wherever a name is shown. It is one component rather than three
// copies because the fiddly parts — Enter commits, Escape cancels and puts the old name back, blur
// commits, the extension is kept, a failed save restores what was there — are exactly the parts that
// drift apart when they are written out three times.
//
// It renders the name however the caller already renders it (tooltip, clamping, whatever) and adds
// the control beside it, so no surface has to give up its own layout to become renameable.
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { applyRename, sanitizeFilename } from '@/lib/files/viewer-model';
import { MAX_LABEL_LENGTH, fitLabel } from '@/lib/files/labels';

export interface InlineRenameProps {
  /** The name as it stands. Also what Escape restores. */
  name: string;
  /** Persist it. Throwing (or rejecting) puts the old name back and keeps the box open. */
  onRename: (next: string) => Promise<void>;
  /** No control at all when false — a read-only surface shows a plain name. */
  canRename?: boolean;
  /**
   * File names keep their extension when only the stem is retyped; prose titles must not.
   *
   * `applyRename` finds the extension with `lastIndexOf('.')`, which on a point called
   * "Fence corner 3.5m offset" decides the extension is ".5m offset" and welds it onto whatever is
   * typed next. So a point's title, and the map's own name, opt out — they are sentences, not files.
   */
  preserveExtension?: boolean;
  /** Wrapper class, so each surface keeps its own type scale and clamping. */
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  /** e.g. `pmap-file-name-<id>` — the trigger gets `-rename`, the box `-rename-input`. */
  testId?: string;
  /** The name as the caller wants it displayed (tooltip, clamp, icon). */
  children: React.ReactNode;
}

export default function InlineRename({
  name, onRename, canRename = true, preserveExtension = true,
  className, inputClassName, buttonClassName, testId, children,
}: InlineRenameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guards the blur handler: Escape and a submit both blur the input on their way out, and without
  // this the cancel would be immediately undone by the commit that the blur fires.
  const doneRef = useRef(false);

  useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Select the stem, not the extension: renaming "IMG_5685.jpg" means typing over "IMG_5685",
    // and selecting ".jpg" too invites deleting the thing that makes the file openable. A title has
    // no extension to protect, so all of it is selected.
    const dot = preserveExtension ? name.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [editing, name, preserveExtension]);

  if (!canRename) return <>{children}</>;

  const start = () => { doneRef.current = false; setDraft(name); setEditing(true); };

  const cancel = () => { doneRef.current = true; setEditing(false); setDraft(name); };

  const commit = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    // `fitLabel` after `applyRename`, because applyRename is what can push a full box past the cap
    // by putting the extension back on the end.
    const next = fitLabel(preserveExtension ? applyRename(name, draft) : sanitizeFilename(draft, name));
    if (!next || next === name) { setEditing(false); setDraft(name); return; }
    setSaving(true);
    try {
      await onRename(next);
      setEditing(false);
    } catch {
      // The caller has already said what went wrong; all this has to do is not pretend it worked.
      setDraft(name);
      doneRef.current = false;
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        type="text"
        value={draft}
        disabled={saving}
        maxLength={MAX_LABEL_LENGTH}
        aria-label={`Rename ${name}`}
        data-testid={testId ? `${testId}-rename-input` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { void commit(); }}
        onKeyDown={(e) => {
          // Stopped here so a tile's own keyboard shortcuts — Escape closes the panel, Enter opens
          // the file — do not also fire while somebody is typing a name into it.
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className={className}>
      {children}
      <button
        className={buttonClassName}
        type="button"
        aria-label={`Rename ${name}`}
        title="Rename"
        data-testid={testId ? `${testId}-rename` : undefined}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); start(); }}
      >
        <Pencil size={10} aria-hidden />
      </button>
    </span>
  );
}
