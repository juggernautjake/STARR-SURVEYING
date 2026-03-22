// app/admin/components/jobs/FileViewer.tsx — Image/file viewer with zoom, pan, expand
'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface FileViewerProps {
  file: {
    file_name: string;
    file_url?: string;
    file_type: string;
    mime_type?: string;
  };
  onClose: () => void;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.csv'];

function isImageFile(name: string, mime?: string): boolean {
  if (mime && mime.startsWith('image/')) return true;
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

function getFileCategory(name: string, mime?: string): 'image' | 'pdf' | 'text' | 'other' {
  if (isImageFile(name, mime)) return 'image';
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (['.txt', '.csv', '.rtf'].includes(ext) || mime?.startsWith('text/')) return 'text';
  return 'other';
}

export default function FileViewer({ file, onClose }: FileViewerProps) {
  const [scale, setScale] = useState(1);
  // zoomInput tracks the text shown in the zoom input box; synced from scale
  const [zoomInput, setZoomInput] = useState('100');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const category = getFileCategory(file.file_name, file.mime_type);

  // Keep the zoom input display in sync when scale changes externally
  useEffect(() => {
    setZoomInput(String(Math.round(scale * 100)));
  }, [scale]);

  // Ctrl+scroll zoom: attach a native (non-passive) wheel listener so we can call
  // preventDefault() and prevent the browser from zooming or scrolling the page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || category !== 'image') return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => {
        const next = Math.min(Math.max(prev + delta, 0.05), 3);
        console.log(`[FileViewer] Ctrl+scroll zoom: ${(prev * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`, { deltaY: e.deltaY });
        return next;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [category]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (category !== 'image') return;
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [category, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  function resetView() {
    console.log(`[FileViewer] Reset view — scale: ${scale.toFixed(2)} → 1.00, position: (${position.x}, ${position.y}) → (0, 0)`, { file: file.file_name });
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  function zoomIn() {
    setScale(prev => {
      const next = Math.min(prev + 0.1, 3);
      console.log(`[FileViewer] Zoom IN: ${(prev * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`, { file: file.file_name });
      return next;
    });
  }

  function zoomOut() {
    setScale(prev => {
      const next = Math.max(prev - 0.1, 0.05);
      console.log(`[FileViewer] Zoom OUT: ${(prev * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`, { file: file.file_name });
      return next;
    });
  }

  function handleZoomInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setZoomInput(e.target.value);
  }

  // Apply the typed zoom value (5%–300%); revert to current scale if invalid
  function handleZoomInputCommit() {
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val >= 5 && val <= 300) {
      console.log(`[FileViewer] Zoom input commit: ${(scale * 100).toFixed(0)}% → ${val}%`, { file: file.file_name, typed_value: zoomInput });
      setScale(val / 100);
    } else {
      console.log(`[FileViewer] Zoom input rejected (invalid): "${zoomInput}" — reverting to ${(scale * 100).toFixed(0)}%`);
      setZoomInput(String(Math.round(scale * 100)));
    }
  }

  // Keyboard shortcuts (Escape/+/-/0) — stopPropagation in the zoom input prevents
  // these from firing while the user is typing a custom zoom value
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetView();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="file-viewer__overlay" onClick={onClose}>
      <div className="file-viewer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="file-viewer__header">
          <div className="file-viewer__header-info">
            <h3 className="file-viewer__title">{file.file_name}</h3>
            <span className="file-viewer__type">{file.file_type}</span>
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
                    // Prevent global zoom shortcuts (+/-/0/Esc) from firing while typing
                    if (['+', '=', '-', '0', 'Escape'].includes(e.key)) e.stopPropagation();
                  }}
                  title="Zoom level (5%–300%)"
                  aria-label="Zoom level"
                />
                <span className="file-viewer__zoom-pct">%</span>
                <button className="file-viewer__ctrl-btn" onClick={zoomIn} title="Zoom in (+)">+</button>
                <button className="file-viewer__ctrl-btn" onClick={resetView} title="Reset (0)">Fit</button>
                <span className="file-viewer__divider" />
              </>
            )}
            {file.file_url && (
              <a
                href={file.file_url}
                download={file.file_name}
                className="file-viewer__ctrl-btn"
                title="Download"
                onClick={e => e.stopPropagation()}
              >
                Download
              </a>
            )}
            <button className="file-viewer__close-btn" onClick={onClose} title="Close (Esc)">
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className="file-viewer__content"
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: category === 'image' ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {!file.file_url ? (
            <div className="file-viewer__no-preview">
              <span className="file-viewer__no-preview-icon">&#x1F4C4;</span>
              <p>No file URL available for preview</p>
              <p className="file-viewer__no-preview-sub">The file metadata is stored but the file content needs to be uploaded to storage.</p>
            </div>
          ) : category === 'image' ? (
            <div
              className="file-viewer__image-wrapper"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.file_url}
                alt={file.file_name}
                className="file-viewer__image"
                draggable={false}
              />
            </div>
          ) : category === 'pdf' ? (
            <iframe
              src={file.file_url}
              className="file-viewer__iframe"
              title={file.file_name}
            />
          ) : category === 'text' ? (
            <iframe
              src={file.file_url}
              className="file-viewer__iframe"
              title={file.file_name}
            />
          ) : (
            <div className="file-viewer__no-preview">
              <span className="file-viewer__no-preview-icon">&#x1F4CE;</span>
              <p>Preview not available for this file type</p>
              <p className="file-viewer__no-preview-sub">{file.file_name}</p>
              {file.file_url && (
                <a href={file.file_url} download={file.file_name} className="file-viewer__download-link">
                  Download File
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer hints */}
        {category === 'image' && (
          <div className="file-viewer__footer">
            Ctrl+Scroll to zoom &middot; Drag to pan &middot; Press 0 to reset &middot; Esc to close
          </div>
        )}
      </div>
    </div>
  );
}

export { isImageFile, getFileCategory };
