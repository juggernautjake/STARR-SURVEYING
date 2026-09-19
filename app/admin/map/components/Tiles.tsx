'use client';

// app/admin/map/components/Tiles.tsx — one file, and one attachment on a point.
//
// Lifted wholesale from the image-based map on 2026-09-19 when that page was retired for Google
// satellite imagery. Nothing about a tile was ever image-specific — a thumbnail, a name, what it is,
// and what you can do to it — so these moved across unchanged rather than being rewritten, and the
// reasons written into them are reasons that still apply.
import { useEffect, useState } from 'react';
import { Eye, GripVertical, MapPin, Mic, X } from 'lucide-react';
import Tooltip from '@/app/admin/research/components/Tooltip';
import InlineRename from '@/app/admin/components/files/InlineRename';
import { formatBytes } from '@/app/admin/components/files/format';
import type { LibraryFile } from '@/lib/jobs/property-map-server';
import type { PointMedia } from '@/lib/jobs/property-map';
import { KIND_ICON, KIND_ONE, assignedChip } from './kinds';

/** One attachment. Thumbnails are lazy and decode off the main thread; video never preloads more
 *  than its metadata, which is the difference between opening a point and pulling 40 MB nobody
 *  asked for. Audio plays right here — a fifteen-second voice note is not worth a full-screen
 *  player. */
export function MediaTile({
  media, editing, confirming, onOpen, onAskDetach, onCancelDetach, onDetach, onRename,
}: {
  media: PointMedia;
  editing: boolean;
  confirming: boolean;
  onOpen: () => void;
  onAskDetach: () => void;
  onCancelDetach: () => void;
  onDetach: () => void;
  /** Renames the underlying job file, not a caption local to this point — see `renameFile`. */
  onRename: (next: string) => Promise<void>;
}) {
  const Kind = KIND_ICON[media.kind];

  if (media.kind === 'audio') {
    return (
      <div className="pmap__audio" data-testid={`pmap-audio-${media.id}`}>
        <span className="pmap__audio-name">
          <Tooltip text={media.name}>
            <span><Mic size={12} aria-hidden /> {media.caption || media.name}</span>
          </Tooltip>
          {/* THE ONE CASE THAT KEEPS ITS OWN PLAYER (2026-09-16). Every other attachment opens in
              the dedicated viewer; a voice note plays right here as well, because the reason to
              press play on a fifteen-second "this corner was under a brush pile" is to hear it
              WHILE reading the point's notes — and a full-screen viewer covers the notes. The Open
              button is beside it for the case that is not that one: stepping through everything on
              the point, where the audio has to be one of the stops or the arrows lie. */}
          {media.url && (
            <button
              className="pmap__tile-open"
              type="button"
              data-testid={`pmap-audio-open-${media.id}`}
              aria-label={`Open ${media.name} in the file viewer`}
              onClick={onOpen}
            >
              <Eye size={11} aria-hidden /> Open
            </button>
          )}
          {editing && (
            confirming ? (
              <span>
                <button className="pmap__tile-detach" type="button" onClick={onDetach} data-testid={`pmap-detach-confirm-${media.id}`}>Really detach</button>
                {' '}
                <button className="pmap__btn pmap__btn--ghost" type="button" onClick={onCancelDetach}>Keep</button>
              </span>
            ) : (
              <button className="pmap__tile-detach" type="button" onClick={onAskDetach} data-testid={`pmap-detach-${media.id}`}>Detach</button>
            )
          )}
        </span>
        <audio controls preload="metadata" src={media.url ?? undefined}>
          Your browser cannot play this recording.
        </audio>
      </div>
    );
  }

  // ── THE TILE IS A STACK, NOT A PILE ─────────────────────────────────────────────────────────
  // Owner, 2026-09-17, with a screenshot: the kind chip and the Detach button were both absolutely
  // positioned over the top corners of a tile about a hundred pixels wide, so at any real file name
  // they overlapped each other AND the thumbnail — it read "docu… ✕ Detach". Nothing about that
  // needed to be an overlay. It is now the same stack the library tiles beside it already use:
  // picture, then name, then what it is, then what you can do to it, each on its own line, so
  // neither the panel's grid nor a long name can ever make two of them collide.
  return (
    <div className="pmap__tile-wrap" data-testid={`pmap-media-tile-${media.id}`}>
      <button
        className="pmap__tile"
        type="button"
        onClick={onOpen}
        aria-label={`Open ${media.name}`}
        data-testid={`pmap-media-${media.id}`}
      >
        {media.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="pmap__tile-img"
            src={media.thumbUrl}
            alt={media.caption || media.name}
            loading="lazy"
            decoding="async"
          />
        ) : media.kind === 'video' && media.url ? (
          <video className="pmap__tile-img" src={media.url} preload="metadata" muted playsInline />
        ) : (
          <span className="pmap__tile-blank"><Kind size={22} aria-hidden /></span>
        )}
      </button>
      <InlineRename
        name={media.caption || media.name}
        onRename={(next) => onRename(next)}
        canRename={editing}
        className="pmap__tile-namerow"
        inputClassName="pmap__tile-rename"
        buttonClassName="pmap__file-pencil"
        testId={`pmap-media-${media.id}`}
      >
        <Tooltip text={media.name}>
          <span className="pmap__tile-name">{media.caption || media.name}</span>
        </Tooltip>
      </InlineRename>
      <span className="pmap__tile-kind">
        <Kind size={10} aria-hidden /> {KIND_ONE[media.kind]}
        {media.sizeBytes ? ` · ${formatBytes(media.sizeBytes)}` : ''}
      </span>
      {editing && (
        confirming ? (
          <span className="pmap__tile-acts" role="group" data-testid={`pmap-tile-confirm-${media.id}`}>
            <button className="pmap__tile-detach pmap__tile-detach--go" type="button" onClick={onDetach} data-testid={`pmap-detach-confirm-${media.id}`}>
              Really detach
            </button>
            <button className="pmap__tile-detach" type="button" onClick={onCancelDetach} data-testid={`pmap-detach-cancel-${media.id}`}>
              Keep
            </button>
          </span>
        ) : (
          <span className="pmap__tile-acts">
            <button
              className="pmap__tile-detach"
              type="button"
              aria-label={`Detach ${media.name} from this point`}
              onClick={onAskDetach}
              data-testid={`pmap-detach-${media.id}`}
            >
              <X size={10} aria-hidden /> Detach
            </button>
          </span>
        )
      )}
    </div>
  );
}

/** One file in the panel beside the map.
 *
 *  Owner: "We should be able to grab the thumbnail/preview of the file … and drag it to a point …
 *  once a file has been assigned to a point, it cannot be assigned to another point. It will still
 *  be in the … panel, but it will be a bit transparent and marked as already assigned. There will be
 *  an option to unassign it which will require confirmation."
 *
 *  So an assigned tile is NOT removed, and it is not merely faded either: fade alone is a signal
 *  somebody with low vision or a bright screen cannot read. It fades AND wears a chip with the
 *  point's number on it — and that chip is a button, because the first question after "which point
 *  has it?" is always "show me".
 *
 *  The confirm is inline and not `window.confirm`: a modal dialog takes the focus away from a panel
 *  somebody is working down, and cannot say which point in the same breath. */
export function FileTile({
  file, editing, armed, dragging, placing, flashing, confirming,
  onArm, onDragStart, onDragEnd, onOpen, onShowPoint, onAskUnassign, onCancelUnassign, onUnassign, onThumbError,
  onRename,
}: {
  file: LibraryFile;
  editing: boolean;
  armed: boolean;
  dragging: boolean;
  placing: boolean;
  flashing: boolean;
  confirming: boolean;
  onArm: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onShowPoint: () => void;
  onAskUnassign: () => void;
  onCancelUnassign: () => void;
  /** Takes the file off ONE point — which one has to be said now that it can be on several. */
  onUnassign: (at: LibraryFile['assignedTo'][number]) => void;
  /** An expired thumbnail URL. The page turns one of these into ONE library refresh. */
  onThumbError: () => void;
  /** Writes `job_files.label`, so the new name follows the file out of this panel. */
  onRename: (next: string) => Promise<void>;
}) {
  const Kind = KIND_ICON[file.kind];
  const assigned = file.assignedTo.length > 0;
  const chip = assignedChip(file);
  // ── NEVER SHOW A BROKEN IMAGE (owner, 2026-09-17) ─────────────────────────────────────────
  // The owner reported the PDF previews as broken. They were not — they were still arriving, and
  // a bare <img> whose bytes have not turned up yet renders the browser's broken-image glyph.
  // A tile that says "this file is broken" while it loads is a bug report waiting to happen, and
  // it produced exactly one. So the thumbnail is only shown once it has actually decoded: until
  // then the tile wears its kind icon, and if the image genuinely fails it keeps it for good.
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'failed'>(file.thumbUrl ? 'loading' : 'failed');
  useEffect(() => { setImgState(file.thumbUrl ? 'loading' : 'failed'); }, [file.thumbUrl]);
  const where = assigned
    ? (file.assignedTo.length === 1
      ? (file.assignedTo[0]!.title || 'that point')
      : `${file.assignedTo.length} points`)
    : 'that point';
  // An assigned file used to be undraggable, because there was nowhere legal for it to go. It can
  // now go on another point as well, so the only thing that stops a drag is not being in edit mode
  // or the tile already being in flight.
  const canDrag = editing && !placing;
  /** No signed URL means there is nothing for the viewer to show — a row whose bytes went missing. */
  const canOpen = Boolean(file.url);

  return (
    <div
      className={[
        'pmap__file',
        assigned ? 'pmap__file--assigned' : '',
        armed ? 'pmap__file--armed' : '',
        dragging ? 'pmap__file--dragging' : '',
        placing ? 'pmap__file--placing' : '',
        flashing ? 'pmap__file--flash' : '',
        canDrag ? 'pmap__file--draggable' : '',
      ].filter(Boolean).join(' ')}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-file-id={file.id}
      data-testid={`pmap-file-${file.id}`}
    >
      {/* ── THE THUMBNAIL IS THE OPEN BUTTON ───────────────────────────────────────────────────
          Owner, 2026-09-16: "a user should be able to open and view the document/picture/video/
          audio file." The picture is the thing a hand goes to, so clicking it — or pressing Enter
          on it — opens the dedicated viewer on this file, with the panel's current list behind the
          arrows. Assigning got its own control below, so the two are never one ambiguous click.

          Still draggable, on the BUTTON as well as on the tile around it: Firefox will not start a
          drag from inside a form control just because an ancestor is draggable, and the thumbnail
          is the thing the owner asked to be able to "grab". A drag does not fire a click, so
          grabbing the picture and clicking it remain different gestures on the same pixel.
          `dragstart` bubbles, so the tile's handler still gets it either way. */}
      <button
        className="pmap__file-shot"
        type="button"
        draggable={canDrag}
        disabled={!canOpen}
        data-testid={`pmap-file-open-${file.id}`}
        aria-label={[
          canOpen ? `Open ${file.name}` : file.name,
          KIND_ONE[file.kind],
          formatBytes(file.sizeBytes),
          assigned ? `already on ${where}` : 'not placed yet',
        ].filter(Boolean).join(', ')}
        onClick={onOpen}
      >
        {file.thumbUrl && imgState !== 'failed' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={`pmap__file-img${imgState === 'ok' ? '' : ' pmap__file-img--waiting'}`}
            src={file.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setImgState('ok')}
            // A thumbnail that will not load is very rarely a bad thumbnail — it is a signature
            // that expired while this page sat open. Say so upwards; the page turns however many
            // of these arrive into one library refresh, which re-signs the lot.
            onError={() => { setImgState('failed'); onThumbError(); }}
          />
        )}
        {imgState === 'loading' && (
          // A spinner rather than the kind icon while the preview is on its way (owner, 2026-09-17:
          // "if they are loading they just like, have spinning loading wheel"). It says "wait" where
          // a static icon says "this is what you get" — and the browser's broken glyph, which is
          // what used to be here, said "this is broken".
          <span className="pmap__file-spinner" role="status" aria-label={`Loading the preview of ${file.name}`} data-testid={`pmap-file-loading-${file.id}`} />
        )}
        {imgState === 'failed' && (
          <span className="pmap__file-icon"><Kind size={20} aria-hidden /></span>
        )}
        {canOpen && <span className="pmap__file-eye" aria-hidden><Eye size={11} /></span>}
        {placing && <span className="pmap__file-veil" data-testid={`pmap-file-placing-${file.id}`}>Placing…</span>}
        {armed && <span className="pmap__file-veil" data-testid={`pmap-file-armed-${file.id}`}>Assign to…</span>}
      </button>

      {/* ── THE TITLE, AND THE WHOLE TITLE ─────────────────────────────────────────────────────
          Owner: "Each item should have the title of the file below it and if the user hovers over
          the item then a tooltip displays the full title." Two lines clamped — one is not enough
          for "2026-09-14 NE corner iron rod found.jpg", and three turns the grid into a wall of
          text — and the hover gives the rest. The shared tooltip, so it behaves like every other
          tooltip in this admin: 300 ms, and gone the instant the pointer is. */}
      <InlineRename
        name={file.name}
        onRename={(next) => onRename(next)}
        canRename={editing}
        className="pmap__file-namerow"
        inputClassName="pmap__file-rename"
        buttonClassName="pmap__file-pencil"
        testId={`pmap-file-${file.id}`}
      >
        <Tooltip text={file.name}>
          <span className="pmap__file-name" data-testid={`pmap-file-name-${file.id}`}>{file.name}</span>
        </Tooltip>
      </InlineRename>
      <span className="pmap__file-meta">{KIND_ONE[file.kind]} · {formatBytes(file.sizeBytes)}</span>

      {/* ── THE ASSIGN CONTROL ─────────────────────────────────────────────────────────────────
          The touch and keyboard half of the drag, and now a control of its own rather than "click
          anywhere on the tile": with the thumbnail opening the viewer, arming had to become
          something you can see and aim at. It is still exactly one piece of state — `armed` — so
          the finger path and the keyboard path cannot drift apart. */}
      {/* No longer hidden once the file is placed: it can go on another point too. */}
      {editing && (
        <button
          className={`pmap__file-assign${armed ? ' pmap__file-assign--on' : ''}`}
          type="button"
          draggable={canDrag}
          aria-pressed={armed}
          data-testid={`pmap-file-pick-${file.id}`}
          aria-label={armed
            ? `${file.name} is picked up. Choose the point to put it on, or press Escape.`
            : `Assign ${file.name} to a point. You can also drag it onto one.`}
          onClick={onArm}
        >
          <GripVertical size={11} aria-hidden /> {armed ? 'Pick a point…' : 'Assign'}
        </button>
      )}

      {assigned && (
        <button
          className="pmap__file-on"
          type="button"
          title={`Show me ${where}`}
          aria-label={`${file.name} is on ${where}. Show me.`}
          data-testid={`pmap-file-on-${file.id}`}
          onClick={onShowPoint}
        >
          <MapPin size={10} aria-hidden /> {chip}
        </button>
      )}

      {/* ── TAKING IT OFF — BUT OFF WHICH ONE? ─────────────────────────────────────────────────
          With one point this is the confirmation it always was. With several it has to ASK, because
          "Unassign" has stopped being unambiguous: a file on points 2, 7 and 9 has three different
          things that button could mean, and picking one silently is how somebody loses the wrong
          attachment. So the confirm becomes the list, one button per point, each saying its number.
          Still inline rather than window.confirm — a modal takes the focus out of a panel somebody
          is working down, and cannot name the point in the same breath. */}
      {assigned && editing && (
        confirming ? (
          <div className="pmap__file-confirm" role="group" data-testid={`pmap-file-confirm-${file.id}`}>
            <span className="pmap__file-confirm-ask">
              {file.assignedTo.length === 1 ? `Take this off ${where}?` : 'Take it off which point?'}
            </span>
            <span className="pmap__file-confirm-acts">
              {file.assignedTo.map((at) => (
                <button
                  key={at.pointId}
                  className="pmap__btn pmap__btn--danger"
                  type="button"
                  title={at.title}
                  data-testid={`pmap-file-unassign-yes-${file.id}-${at.pointId}`}
                  onClick={() => onUnassign(at)}
                >
                  {file.assignedTo.length === 1
                    ? 'Unassign'
                    : `Off ${at.title || 'it'}`}
                </button>
              ))}
              <button
                className="pmap__btn"
                type="button"
                data-testid={`pmap-file-unassign-no-${file.id}`}
                onClick={onCancelUnassign}
              >
                Cancel
              </button>
            </span>
          </div>
        ) : (
          <button
            className="pmap__file-unassign"
            type="button"
            aria-label={`Unassign ${file.name} from ${where}`}
            data-testid={`pmap-file-unassign-${file.id}`}
            onClick={onAskUnassign}
          >
            <X size={10} aria-hidden /> Unassign
          </button>
        )
      )}
    </div>
  );
}
