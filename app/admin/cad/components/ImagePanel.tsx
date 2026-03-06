'use client';
// app/admin/cad/components/ImagePanel.tsx
// Right-sidebar tab showing all project images as thumbnails.
// Users can drag images onto the canvas, delete them, or inspect them.

import { useState, useCallback } from 'react';
import { X, Trash2, ImageIcon, Eye, EyeOff, Info, Download } from 'lucide-react';
import { useDrawingStore, useSelectionStore } from '@/lib/cad/store';
import type { ProjectImage } from '@/lib/cad/types';
import Tooltip from './Tooltip';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when user clicks "Place" on a thumbnail — should activate DRAW_IMAGE tool with pre-selected image. */
  onPlaceImage?: (imageId: string) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function estimateDataUrlSize(dataUrl: string): number {
  // base64 overhead: 4/3 × decoded size
  const b64 = dataUrl.split(',')[1] ?? '';
  return Math.round((b64.length * 3) / 4);
}

function ImageThumbnail({
  image,
  selected,
  onClick,
  onDelete,
  onPlace,
}: {
  image: ProjectImage;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onPlace: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const approxBytes = estimateDataUrlSize(image.dataUrl);

  return (
    <div
      className={`relative rounded overflow-hidden border cursor-pointer transition-all group ${
        selected ? 'border-blue-400 ring-1 ring-blue-400/40' : 'border-gray-600 hover:border-gray-400'
      }`}
      style={{ aspectRatio: '1 / 1' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/starr-image-id', image.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.dataUrl}
        alt={image.name}
        className="w-full h-full object-cover bg-gray-900"
        draggable={false}
      />

      {/* Overlay on hover */}
      {hovered && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 p-1">
          <button
            onClick={(e) => { e.stopPropagation(); onPlace(); }}
            className="w-full py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
          >
            Place
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-full py-1 text-[10px] bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Name label at bottom */}
      <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1 py-0.5">
        <p className="text-[9px] text-gray-200 truncate leading-tight">{image.name}</p>
        <p className="text-[8px] text-gray-500 leading-none">
          {image.originalWidth}×{image.originalHeight} · {formatBytes(approxBytes)}
        </p>
      </div>
    </div>
  );
}

export default function ImagePanel({ open, onClose, onPlaceImage }: Props) {
  const drawingStore = useDrawingStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const images = drawingStore.getAllProjectImages();
  const selectedImage = selectedId ? drawingStore.getProjectImage(selectedId) : null;

  const handleDelete = useCallback(
    (imageId: string) => {
      // Remove all IMAGE features that reference this image
      const features = drawingStore.getAllFeatures().filter(
        (f) => f.geometry.type === 'IMAGE' && f.geometry.image?.imageId === imageId,
      );
      for (const f of features) {
        drawingStore.removeFeature(f.id);
      }
      drawingStore.removeProjectImage(imageId);
      if (selectedId === imageId) setSelectedId(null);
      setConfirmDelete(null);
    },
    [drawingStore, selectedId],
  );

  const handleDownload = useCallback((image: ProjectImage) => {
    const a = Object.assign(document.createElement('a'), {
      href: image.dataUrl,
      download: image.name + (image.dataUrl.startsWith('data:image/png') ? '.png'
        : image.dataUrl.startsWith('data:image/jpeg') ? '.jpg'
        : image.dataUrl.startsWith('data:image/svg') ? '.svg'
        : '.img'),
    });
    a.click();
  }, []);

  if (!open) return null;

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700 w-52 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-1.5">
          <ImageIcon size={13} className="text-blue-400" />
          <span className="text-xs font-semibold text-gray-200">Project Images</span>
          {images.length > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-700 rounded-full px-1.5">{images.length}</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Thumbnail grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <ImageIcon size={28} className="text-gray-600 mb-2" />
            <p className="text-xs text-gray-500 leading-relaxed">
              No images yet.
              <br />
              Use the <strong className="text-gray-400">Image tool</strong> to insert images.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {images.map((img) => (
              <ImageThumbnail
                key={img.id}
                image={img}
                selected={selectedId === img.id}
                onClick={() => setSelectedId(selectedId === img.id ? null : img.id)}
                onDelete={() => setConfirmDelete(img.id)}
                onPlace={() => onPlaceImage?.(img.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected image info */}
      {selectedImage && (
        <div className="border-t border-gray-700 p-2 space-y-1.5 shrink-0 bg-gray-750">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-xs text-white font-medium truncate">{selectedImage.name}</p>
              <p className="text-[10px] text-gray-400">
                {selectedImage.originalWidth} × {selectedImage.originalHeight} px
              </p>
              <p className="text-[10px] text-gray-500">
                Added {new Date(selectedImage.addedAt).toLocaleDateString()}
              </p>
            </div>
            <Tooltip label="Download original">
              <button
                onClick={() => handleDownload(selectedImage)}
                className="p-1 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
              >
                <Download size={13} />
              </button>
            </Tooltip>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onPlaceImage?.(selectedImage.id)}
              className="flex-1 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors text-center"
            >
              Place on Canvas
            </button>
            <button
              onClick={() => setConfirmDelete(selectedImage.id)}
              className="p-1 text-red-500 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Drag hint */}
      {images.length > 0 && !selectedImage && (
        <div className="px-2 pb-2 shrink-0">
          <p className="text-[10px] text-gray-600 leading-relaxed text-center">
            Drag a thumbnail onto the canvas to place it.
          </p>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3 w-full max-w-[200px] text-sm">
            <p className="text-white font-medium text-xs">Delete image?</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              This removes the image from the project and deletes all instances placed on the canvas.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
