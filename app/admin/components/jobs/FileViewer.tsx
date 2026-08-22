// app/admin/components/jobs/FileViewer.tsx — look at a job's files without leaving the job.
//
// Owner, 2026-08-22: *"I also need it so that I can view the videos and pictures and files in the
// app in a viewer that works well and has all of the controls that we might want."*
//
// ── WHAT WAS MISSING, AND WHY IT WAS THE NAVIGATION ─────────────────────────────────────────────
//
// The viewer already did the obvious things: zoom and pan an image, play a video with the browser's
// own controls, frame a PDF. What it could not do was go to the NEXT file. Reviewing forty photos
// from a site visit meant open, look, close, find the next row, open — forty times. That is the
// control that was actually missing, and no amount of zoom fixes it.
//
// So this now takes the whole list and an anchor within it. Stepping keeps the panel, the toolbar
// and the keyboard where they are; only the media and its notes change.
//
// ── WHY THE VIDEO TRANSPORT IS STILL THE BROWSER'S ──────────────────────────────────────────────
//
// `controls` rather than a hand-built scrubber. Scrubbing, volume, fullscreen, picture-in-picture
// and captions already work correctly there — on a phone as well as a desktop — and a bespoke
// transport would be a worse copy of five things. What IS added is what the native chrome does not
// expose consistently: a speed control and ±10s jumps, which are the two things somebody reviewing
// a walkthrough of an access road actually reaches for.
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Download, FileText, Info, Maximize2,
  Paperclip, RotateCw, SkipBack, SkipForward, Trash2, X,
} from 'lucide-react';
import FileDetailsPanel, { type DetailsFile } from './FileDetailsPanel';
// The viewer's own stylesheet, imported HERE rather than from a route layout. These rules used to
// live in `AdminJobs.css`, which only loads under /admin/jobs and /admin/leads — so a caller in
// /admin/projects got an unstyled dialog. Importing it from the component makes that impossible.
import '../../styles/FileViewer.css';

// A job attachment's bytes are reachable in three different ways depending on which writer made
// the row — a storage object, a legacy `data:` URI, or a linked File Explorer document. The server
// resolves that to one `download_href` (see `lib/jobs/file-storage.ts`); this component just
// prefers it, and keeps reading `file_url` so nothing that has not been updated breaks.
/** Where this file's bytes actually are. `download_href` covers storage, legacy and linked rows;
 *  `file_url` remains for any caller still passing a raw row. */
function src(file: { file_url?: string; download_href?: string | null }): string | null {
  return (file.download_href ?? file.file_url) || null;
}

export interface ViewerFile extends DetailsFile {
  file_url?: string;
  /** Resolved by `GET /api/admin/jobs/files` — works for every row shape. */
  download_href?: string | null;
  file_type: string;
  mime_type?: string;
}

interface FileViewerProps {
  /** The file to show. Stays the anchor so existing callers work unchanged. */
  file: ViewerFile;
  /** The rest of the list, for stepping. Omitted means a single-file viewer, exactly as before. */
  files?: ViewerFile[];
  onClose: () => void;
  /** Called when the viewer steps to another file, so the caller owns which one is open. */
  onSelect?: (file: ViewerFile) => void;
  /** A rename or a tag change, so the list behind the viewer updates without a refetch. */
  onPatched?: (id: string, patch: Partial<ViewerFile>) => void;
  /**
   * Delete this file. Optional, and the button only appears when a handler is given — rendering a
   * control that silently does nothing is worse than not rendering it.
   *
   * The photo/video gallery had its own lightbox with a Delete button before it moved to this
   * viewer. Dropping it during the swap would have quietly removed a control people already use.
   */
  onDelete?: (file: ViewerFile) => void;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.csv'];
// Owner, 2026-08-19: *"we need to be able to upload videos as well as photos… so that we have a
// video viewer built in."* A field video of a washed-out access road used to fall through to
// `other` and render as a download prompt — the one file type where "download it and find an app"
// is most annoying, because it is usually being watched to answer a question in the next minute.
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.ogv', '.avi', '.mkv'];
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac'];

/** The speeds worth having. Slow for reading a monument stamp off a shaky frame, fast for skipping
 *  the walk between them. */
const SPEEDS = [0.5, 1, 1.5, 2];

function isImageFile(name: string, mime?: string): boolean {
  if (mime && mime.startsWith('image/')) return true;
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

export function isVideoFile(name: string, mime?: string): boolean {
  if (mime && mime.startsWith('video/')) return true;
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isAudioFile(name: string, mime?: string): boolean {
  if (mime && mime.startsWith('audio/')) return true;
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return AUDIO_EXTENSIONS.includes(ext);
}

function getFileCategory(name: string, mime?: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  if (isImageFile(name, mime)) return 'image';
  if (isVideoFile(name, mime)) return 'video';
  // Voice memos are attached to jobs and used to fall through to a download prompt, same as video
  // did. An <audio> element is one line and removes the round trip.
  if (isAudioFile(name, mime)) return 'audio';
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (['.txt', '.csv', '.rtf'].includes(ext) || mime?.startsWith('text/')) return 'text';
  return 'other';
}

export default function FileViewer({ file, files, onClose, onSelect, onPatched, onDelete }: FileViewerProps) {
  const [scale, setScale] = useState(1);
  // zoomInput tracks the text shown in the zoom input box; synced from scale
  const [zoomInput, setZoomInput] = useState('100');
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(true);
  const [speed, setSpeed] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);

  const category = getFileCategory(file.file_name, file.mime_type);

  // ── Where this file sits in the list ─────────────────────────────────────────────────────────
  //
  // Matched by id rather than by object identity: the list is refetched and re-mapped on every
  // patch, so the object the caller passed is frequently NOT the object in `files`, and identity
  // matching would silently report "1 of 40" forever.
  const list = useMemo(() => (files && files.length > 0 ? files : [file]), [files, file]);
  const index = useMemo(() => {
    const byId = file.id ? list.findIndex((f) => f.id === file.id) : -1;
    return byId >= 0 ? byId : 0;
  }, [list, file.id]);
  const canStep = list.length > 1 && !!onSelect;

  const step = useCallback((delta: number) => {
    if (!canStep) return;
    // Wraps deliberately: reviewing a site visit is a loop, and hitting a wall at photo forty means
    // holding the other arrow forty times to get back to the one you meant.
    const next = (index + delta + list.length) % list.length;
    onSelect?.(list[next]);
  }, [canStep, index, list, onSelect]);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 3)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.05)), []);

  // A new file starts fresh. Carrying a 300% zoom onto the next photo shows somebody a grey
  // rectangle and reads as a broken viewer.
  useEffect(() => {
    resetView();
    setSpeed(1);
  }, [file.id, resetView]);

  // Keep the zoom input display in sync when scale changes externally
  useEffect(() => {
    setZoomInput(String(Math.round(scale * 100)));
  }, [scale]);

  // Playback rate is a property, not an attribute — setting it in JSX does nothing. It also has to
  // be re-applied after the element swaps to a different source, which stepping does.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, file.id]);

  // Ctrl+scroll zoom: attach a native (non-passive) wheel listener so we can call
  // preventDefault() and prevent the browser from zooming or scrolling the page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || category !== 'image') return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [category, zoomIn, zoomOut]);

  function handleMouseDown(e: React.MouseEvent) {
    if (category !== 'image') return;
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }
  function handleMouseUp() { setDragging(false); }

  function handleZoomInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setZoomInput(e.target.value);
  }

  // Apply the typed zoom value (5%–300%); revert to current scale if invalid
  function handleZoomInputCommit() {
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val >= 5 && val <= 300) setScale(val / 100);
    else setZoomInput(String(Math.round(scale * 100)));
  }

  function toggleFullscreen() {
    const el = shellRef.current;
    if (!el) return;
    // Guarded because the Fullscreen API rejects when the document is not user-activated, and an
    // unhandled rejection here would surface as an error toast on a click that simply did nothing.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }

  function seek(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    // Clamped to the duration: seeking past the end on some browsers leaves the element in a
    // permanently stalled state rather than at the last frame.
    const duration = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(v.currentTime + delta, duration - 0.05));
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────────────────────
  //
  // Arrows step FILES, in every category including video. The alternative — arrows seek inside a
  // video and step files everywhere else — means the same key does two different things depending
  // on what happens to be open, which is how people stop using either. Video seeking gets its own
  // keys (J/L) and its own buttons, and the native scrubber is still right there.
  //
  // Every text input in the details panel calls `stopPropagation`, so typing "0" in a name box
  // cannot reset the zoom behind it.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case 'Escape':
          // Fullscreen swallows Escape for its own exit; closing as well would drop the viewer
          // entirely on the first press, which is not what the key means there.
          if (!document.fullscreenElement) onClose();
          break;
        case 'ArrowLeft': step(-1); break;
        case 'ArrowRight': step(1); break;
        case '+': case '=': zoomIn(); break;
        case '-': zoomOut(); break;
        case '0': resetView(); break;
        case 'r': case 'R': setRotation((d) => (d + 90) % 360); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'i': case 'I': setShowDetails((s) => !s); break;
        case 'j': case 'J': seek(-10); break;
        case 'l': case 'L': seek(10); break;
        case ' ':
          if (videoRef.current) {
            e.preventDefault();
            if (videoRef.current.paused) void videoRef.current.play().catch(() => {});
            else videoRef.current.pause();
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, zoomIn, zoomOut, resetView, step]);

  // Swipe to step, on the phone this is most used on. Ignored while zoomed in, where a horizontal
  // drag means panning the image and stealing it would make a zoomed photo impossible to explore.
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0]?.clientX ?? null; }
  function onTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || scale !== 1) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(dx) < 60) return;
    step(dx < 0 ? 1 : -1);
  }

  const href = src(file);
  const title = file.label?.trim() || file.file_name;

  return (
    <div className="file-viewer__overlay" onClick={onClose}>
      <div
        className={`file-viewer${showDetails ? ' file-viewer--with-details' : ''}`}
        ref={shellRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="file-viewer__header">
          <div className="file-viewer__header-info">
            <h3 className="file-viewer__title" title={file.label ? `${file.label} — uploaded as ${file.file_name}` : file.file_name}>
              {title}
            </h3>
            <span className="file-viewer__type">{file.file_type}</span>
            {list.length > 1 && (
              <span className="file-viewer__counter">{index + 1} of {list.length}</span>
            )}
          </div>
          <div className="file-viewer__controls">
            {category === 'image' && (
              <>
                <button className="file-viewer__ctrl-btn" onClick={zoomOut} title="Zoom out (−)">−</button>
                {/* Zoom selector: editable input showing current zoom %, range 5%–300% */}
                <input
                  className="file-viewer__zoom-input"
                  type="number"
                  min={5}
                  max={300}
                  value={zoomInput}
                  onChange={handleZoomInputChange}
                  onBlur={handleZoomInputCommit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { handleZoomInputCommit(); e.currentTarget.blur(); }
                    e.stopPropagation();
                  }}
                  title="Zoom level (5%–300%)"
                  aria-label="Zoom level"
                />
                <span className="file-viewer__zoom-pct">%</span>
                <button className="file-viewer__ctrl-btn" onClick={zoomIn} title="Zoom in (+)">+</button>
                <button
                  className="file-viewer__ctrl-btn"
                  onClick={() => setRotation((d) => (d + 90) % 360)}
                  title="Rotate 90° (R)"
                  aria-label="Rotate"
                >
                  <RotateCw size={14} />
                </button>
                <button className="file-viewer__ctrl-btn" onClick={resetView} title="Reset (0)">Fit</button>
                <span className="file-viewer__divider" />
              </>
            )}

            {category === 'video' && (
              <>
                <button className="file-viewer__ctrl-btn" onClick={() => seek(-10)} title="Back 10s (J)" aria-label="Back ten seconds">
                  <SkipBack size={14} />
                </button>
                <button className="file-viewer__ctrl-btn" onClick={() => seek(10)} title="Forward 10s (L)" aria-label="Forward ten seconds">
                  <SkipForward size={14} />
                </button>
                <select
                  className="file-viewer__speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  title="Playback speed"
                  aria-label="Playback speed"
                >
                  {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                </select>
                <span className="file-viewer__divider" />
              </>
            )}

            <button
              className="file-viewer__ctrl-btn"
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
              aria-label="Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
            <button
              className={`file-viewer__ctrl-btn${showDetails ? ' file-viewer__ctrl-btn--on' : ''}`}
              onClick={() => setShowDetails((s) => !s)}
              title="Name, tags and notes (I)"
              aria-label="Details and notes"
              aria-pressed={showDetails}
            >
              <Info size={14} />
            </button>
            {href && (
              <a
                href={href}
                download={file.file_name}
                className="file-viewer__ctrl-btn"
                title="Download"
                onClick={e => e.stopPropagation()}
              >
                <Download size={14} />
              </a>
            )}
            {onDelete && (
              <button
                className="file-viewer__ctrl-btn file-viewer__ctrl-btn--danger"
                onClick={() => onDelete(file)}
                title="Delete this file"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button className="file-viewer__close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body: media, then the details rail */}
        <div className="file-viewer__body">
          <div className="file-viewer__stage">
            {canStep && (
              <button
                className="file-viewer__nav file-viewer__nav--prev"
                onClick={() => step(-1)}
                title="Previous (←)"
                aria-label="Previous file"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <div
              className="file-viewer__content"
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              style={{ cursor: category === 'image' ? (dragging ? 'grabbing' : 'grab') : 'default' }}
            >
              {!href ? (
                <div className="file-viewer__no-preview">
                  <span className="file-viewer__no-preview-icon"><FileText size={36} strokeWidth={1.5} /></span>
                  <p>No file URL available for preview</p>
                  <p className="file-viewer__no-preview-sub">The file metadata is stored but the file content needs to be uploaded to storage.</p>
                </div>
              ) : category === 'image' ? (
                <div
                  className="file-viewer__image-wrapper"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    // Keyed by id so stepping swaps the element rather than mutating one <img>,
                    // which otherwise keeps showing the PREVIOUS photo until the next one decodes.
                    key={file.id ?? file.file_name}
                    src={href}
                    alt={title}
                    className="file-viewer__image"
                    draggable={false}
                  />
                </div>
              ) : category === 'video' ? (
                /* The browser's own transport. `controls` rather than a bespoke chrome because
                   scrubbing, volume, fullscreen and picture-in-picture already work correctly here,
                   on a phone as well as a desktop. NOT zoom-wrapped: dragging a <video> around a
                   zoom canvas fights the scrubber. */
                <video
                  key={file.id ?? file.file_name}
                  ref={videoRef}
                  src={href}
                  className="file-viewer__video"
                  controls
                  playsInline
                  preload="metadata"
                  data-testid="file-viewer-video"
                >
                  <track kind="captions" />
                </video>
              ) : category === 'audio' ? (
                <div className="file-viewer__audio-wrap">
                  <span className="file-viewer__no-preview-icon"><Paperclip size={30} strokeWidth={1.5} /></span>
                  <p className="file-viewer__no-preview-sub">{title}</p>
                  <audio key={file.id ?? file.file_name} src={href} controls className="file-viewer__audio" />
                </div>
              ) : category === 'pdf' ? (
                <iframe key={file.id ?? file.file_name} src={href} className="file-viewer__iframe" title={title} />
              ) : category === 'text' ? (
                <iframe key={file.id ?? file.file_name} src={href} className="file-viewer__iframe" title={title} />
              ) : (
                <div className="file-viewer__no-preview">
                  <span className="file-viewer__no-preview-icon"><Paperclip size={36} strokeWidth={1.5} /></span>
                  <p>Preview not available for this file type</p>
                  <p className="file-viewer__no-preview-sub">{file.file_name}</p>
                  <a href={href} download={file.file_name} className="file-viewer__download-link">
                    Download File
                  </a>
                </div>
              )}
            </div>

            {canStep && (
              <button
                className="file-viewer__nav file-viewer__nav--next"
                onClick={() => step(1)}
                title="Next (→)"
                aria-label="Next file"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>

          {/* Only for rows that have an id — a legacy `data:` attachment with no id cannot be
              renamed or commented on, and showing an editor that silently fails is worse than
              showing none. */}
          {showDetails && file.id && (
            <FileDetailsPanel
              file={file}
              onPatched={(patch) => onPatched?.(file.id as string, patch)}
            />
          )}
        </div>

        {/* Footer hints — the shortcuts that are not discoverable from the toolbar */}
        <div className="file-viewer__footer">
          {category === 'image' && <>Ctrl+Scroll zoom &middot; Drag to pan &middot; R rotate &middot; </>}
          {category === 'video' && <>Space play/pause &middot; J/L skip 10s &middot; </>}
          {canStep && <>← → to step &middot; </>}
          F fullscreen &middot; I notes &middot; Esc to close
        </div>
      </div>
    </div>
  );
}

export { isImageFile, getFileCategory };
