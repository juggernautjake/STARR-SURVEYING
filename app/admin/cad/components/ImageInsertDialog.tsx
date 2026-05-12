'use client';
// app/admin/cad/components/ImageInsertDialog.tsx
// Popup shown when the user clicks on canvas with the DRAW_IMAGE tool.
// Supports paste from clipboard, drag-and-drop, and file picker.

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Upload, Clipboard, ImageIcon } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { ProjectImage } from '@/lib/cad/types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];

interface Props {
  /** World-space position where the user clicked (image anchor). */
  worldX: number;
  worldY: number;
  onClose: () => void;
  /** Called when image is ready. Returns the new ProjectImage and the initial world dimensions. */
  onInsert: (image: ProjectImage, worldW: number, worldH: number) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(reader.error);
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = dataUrl;
  });
}

function sanitizeName(raw: string): string {
  return raw.replace(/\.[^.]+$/, '') || 'Untitled Image';
}

export default function ImageInsertDialog({ worldX, worldY, onClose, onInsert }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const drawingStore = useDrawingStore();
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewW, setPreviewW] = useState(0);
  const [previewH, setPreviewH] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processDataUrl = useCallback(async (dataUrl: string, name: string) => {
    try {
      setLoading(true);
      setError(null);
      const { w, h } = await getImageDimensions(dataUrl);
      setPreview(dataUrl);
      setPreviewName(name);
      setPreviewW(w);
      setPreviewH(h);
    } catch {
      setError('Could not read image dimensions. The file may be corrupt.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_MIME.includes(file.type) && !file.name.endsWith('.svg')) {
        setError(`Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPG, SVG, GIF, WebP, or BMP.`);
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      await processDataUrl(dataUrl, sanitizeName(file.name));
    },
    [processDataUrl],
  );

  // Paste from clipboard on mount
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((i) => i.type.startsWith('image/'));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (file) await processFile(file);
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handlePasteButton() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const url = URL.createObjectURL(blob);
          await processDataUrl(url, 'Pasted Image');
          return;
        }
      }
      setError('No image found on the clipboard.');
    } catch {
      setError('Could not read clipboard. Try pasting with Ctrl+V instead.');
    }
  }

  function handleInsert() {
    if (!preview || !previewW || !previewH) return;

    const id = generateId();
    const image: ProjectImage = {
      id,
      name: previewName || 'Untitled Image',
      dataUrl: preview,
      originalWidth: previewW,
      originalHeight: previewH,
      addedAt: new Date().toISOString(),
    };

    // Default display size: scale so the image is 200 world-units wide (~ 4" at 1"=50')
    const drawingScale = drawingStore.document.settings.drawingScale ?? 50;
    const defaultWidthIn = 4; // 4 paper inches
    const worldW = defaultWidthIn * drawingScale;
    const worldH = worldW * (previewH / previewW);

    drawingStore.addProjectImage(image);
    onInsert(image, worldW, worldH);
  }

  const existingImages = drawingStore.getAllProjectImages();

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[480px] max-h-[85vh] flex flex-col text-sm text-gray-200 overflow-hidden animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon size={15} className="text-blue-400" />
            <h2 className="font-semibold text-white">Insert Image</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Drop zone */}
          {!preview && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <Upload size={32} className="mx-auto mb-3 text-gray-500" />
              <p className="text-gray-300 font-medium mb-1">Drop an image here</p>
              <p className="text-xs text-gray-500 mb-4">PNG, JPG, SVG, GIF, WebP, BMP supported</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                  <Upload size={13} />
                  Browse Files
                </button>
                <button
                  onClick={handlePasteButton}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 rounded transition-colors"
                >
                  <Clipboard size={13} />
                  Paste Image
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-600">Or press Ctrl+V to paste from clipboard</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="relative rounded overflow-hidden bg-gray-900 border border-gray-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-48 object-contain"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-700/50 rounded p-2">
                  <p className="text-gray-400">Name</p>
                  <input
                    type="text"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    className="mt-0.5 w-full bg-transparent text-white focus:outline-none"
                  />
                </div>
                <div className="bg-gray-700/50 rounded p-2">
                  <p className="text-gray-400">Dimensions</p>
                  <p className="text-white mt-0.5">{previewW} × {previewH} px</p>
                </div>
              </div>
              <button
                onClick={() => { setPreview(null); setError(null); }}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors"
              >
                ← Choose a different image
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-4 text-gray-400 text-xs">Loading image…</div>
          )}

          {error && (
            <div className="bg-red-900/40 border border-red-600/50 rounded p-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Existing project images (quick reuse) */}
          {existingImages.length > 0 && !preview && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">Or reuse an existing project image:</p>
              <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                {existingImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => processDataUrl(img.dataUrl, img.name)}
                    className="group relative rounded overflow-hidden bg-gray-700 border border-gray-600 hover:border-blue-400 aspect-square transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                      <p className="w-full px-1 py-0.5 text-[9px] text-white bg-black/60 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {img.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-4 py-3 border-t border-gray-600 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!preview || loading}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
}
