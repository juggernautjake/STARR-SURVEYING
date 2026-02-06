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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const category = getFileCategory(file.file_name, file.mime_type);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.min(Math.max(prev + delta, 0.25), 5));
  }, []);

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
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  function zoomIn() {
    setScale(prev => Math.min(prev + 0.25, 5));
  }

  function zoomOut() {
    setScale(prev => Math.max(prev - 0.25, 0.25));
  }

  // Close on Escape
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
                <button className="file-viewer__ctrl-btn" onClick={zoomOut} title="Zoom out (-)">-</button>
                <span className="file-viewer__zoom-level">{Math.round(scale * 100)}%</span>
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
          onWheel={category === 'image' ? handleWheel : undefined}
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
            Scroll to zoom &middot; Drag to pan &middot; Press 0 to reset &middot; Esc to close
          </div>
        )}
      </div>
    </div>
  );
}

export { isImageFile, getFileCategory };
