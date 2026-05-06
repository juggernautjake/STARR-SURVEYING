'use client';
// app/admin/cad/components/SealImageUploader.tsx
//
// Phase 7 §8.3 — small upload affordance for the RPLS's seal
// image. Used inline inside the RPLS review-mode panel above
// the Apply Seal button so the surveyor can drop in a PNG /
// JPG / SVG of their embossed seal once and have it embedded
// on every subsequent Apply Seal pass.
//
// Validation:
//   * Type: image/png, image/jpeg, image/svg+xml.
//   * Size: ≤ 2 MB (matches the §8.3 spec).
//
// Persistence: cached on `useDeliveryStore.sealImage` for the
// session. Cross-session persistence (per-user settings) lands
// once the user-settings store ships.

import { useRef } from 'react';

import { useDeliveryStore } from '@/lib/cad/store';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
]);

export default function SealImageUploader() {
  const sealImage = useDeliveryStore((s) => s.sealImage);
  const setSealImage = useDeliveryStore((s) => s.setSealImage);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pick() {
    inputRef.current?.click();
  }

  function handleFile(file: File) {
    if (!ACCEPTED_MIME.has(file.type)) {
      alert(
        'Seal image must be PNG, JPG, or SVG. Re-export and try again.'
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      alert('Seal image must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setSealImage(result);
      }
    };
    reader.onerror = () => {
      alert('Could not read the seal image. Try a different file.');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>Seal image</span>
      <div style={styles.row}>
        <div style={styles.preview}>
          {sealImage ? (
            // next/image doesn't handle data: URLs cleanly; the
            // preview is a 48px-square local data URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sealImage}
              alt="RPLS seal preview"
              style={styles.previewImg}
            />
          ) : (
            <span style={styles.previewEmpty}>No image</span>
          )}
        </div>
        <div style={styles.actions}>
          <button type="button" onClick={pick} style={styles.btn}>
            {sealImage ? 'Replace…' : 'Upload…'}
          </button>
          {sealImage ? (
            <button
              type="button"
              onClick={() => setSealImage(null)}
              style={styles.btnGhost}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <p style={styles.hint}>
        PNG, JPG, or SVG up to 2 MB. Stored for this session and
        embedded on the next Apply Seal pass.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    border: '1px dashed #CBD5E1',
    borderRadius: 6,
    background: '#FFFFFF',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  preview: {
    width: 48,
    height: 48,
    border: '1px solid #E2E8F0',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F8FAFC',
    overflow: 'hidden',
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  previewEmpty: {
    fontSize: 9,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  actions: {
    display: 'flex',
    gap: 6,
    flexDirection: 'column',
  },
  btn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#475569',
    cursor: 'pointer',
  },
  hint: {
    margin: 0,
    fontSize: 10,
    color: '#6B7280',
    lineHeight: 1.4,
  },
};
