// lib/scan/build-output.ts — turn the previewed pages into the file(s) that get saved.
//
// Owner, 2026-10-06: scans upload "to the selected file location with the chosen file extension",
// after "a preview of the scan, and then we can confirm it". The preview lets a page be turned or
// dropped; this applies those choices and writes:
//   pdf   one document, every page in order, each sized to the paper it was scanned from
//   jpg   one file per page ("Deed-1.jpg", "Deed-2.jpg"), or just "Deed.jpg" for one page
//   png   the same, lossless
//   tiff  one multi-page TIFF (lib/scan/tiff.ts)
// A page that arrived as a PDF (a scanning app saved one) is passed through untouched as its own
// file: re-rendering someone's PDF in the browser would lose its text layer.
import { encodeTiff } from './tiff';

export type ScanFormat = 'pdf' | 'jpg' | 'png' | 'tiff';

export const SCAN_FORMATS: Array<{ id: ScanFormat; label: string; hint: string }> = [
  { id: 'pdf', label: 'PDF', hint: 'One document with every page — best for deeds, plats and forms.' },
  { id: 'jpg', label: 'JPG', hint: 'One image per page, small files — best for photos.' },
  { id: 'png', label: 'PNG', hint: 'One image per page, no quality loss — best for line drawings.' },
  { id: 'tiff', label: 'TIFF', hint: 'One multi-page image file — what some county records systems ask for.' },
];

export interface PreviewPage {
  blob: Blob;
  /** Quarter turns clockwise chosen in the preview. */
  rotate: 0 | 1 | 2 | 3;
  /** The resolution it was scanned at, for the PDF page size. */
  dpi: number;
}

/** "Smith deed" → "Smith deed"; strips characters storage and Windows refuse. */
export function cleanBaseName(name: string): string {
  const s = name.replace(/\.(pdf|jpe?g|png|tiff?)$/i, '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s || 'Scan';
}

/** The file name for page `i` of `n` in a one-file-per-page format. */
export function pageFileName(base: string, ext: string, i: number, n: number): string {
  return n === 1 ? `${base}.${ext}` : `${base}-${String(i + 1).padStart(n >= 10 ? 2 : 1, '0')}.${ext}`;
}

/** Default name: "Scan 2026-10-06 14-05". */
export function defaultScanName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Scan ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}-${p(now.getMinutes())}`;
}

async function toCanvas(page: PreviewPage): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(page.blob);
  const turned = page.rotate % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = turned ? bmp.height : bmp.width;
  canvas.height = turned ? bmp.width : bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the scan.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((page.rotate * Math.PI) / 2);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The page could not be encoded.'))), type, quality));
}

const isPdf = (b: Blob) => b.type === 'application/pdf';

export async function buildScanFiles(pages: PreviewPage[], format: ScanFormat, name: string): Promise<File[]> {
  const base = cleanBaseName(name);
  const pdfs = pages.filter((p) => isPdf(p.blob));
  const images = pages.filter((p) => !isPdf(p.blob));
  const out: File[] = pdfs.map((p, i) => new File([p.blob], pdfs.length === 1 && !images.length ? `${base}.pdf` : `${base}-document-${i + 1}.pdf`, { type: 'application/pdf' }));
  if (!images.length) return out;

  if (format === 'pdf') {
    const { default: JsPDF } = await import('jspdf');
    let doc: InstanceType<typeof JsPDF> | null = null;
    for (const page of images) {
      const canvas = await toCanvas(page);
      // Page size in points from the scan's own size: a letter page at 200 dpi is 1700×2200 px → 612×792 pt.
      const w = (canvas.width / page.dpi) * 72;
      const h = (canvas.height / page.dpi) * 72;
      const orientation = w > h ? 'landscape' : 'portrait';
      if (!doc) doc = new JsPDF({ orientation, unit: 'pt', format: [w, h], compress: true });
      else doc.addPage([w, h], orientation);
      const jpeg = canvas.toDataURL('image/jpeg', 0.85);
      doc.addImage(jpeg, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      canvas.width = 1; canvas.height = 1;
    }
    out.push(new File([doc!.output('blob')], `${base}.pdf`, { type: 'application/pdf' }));
    return out;
  }

  if (format === 'tiff') {
    const tiffPages = [];
    for (const page of images) {
      const canvas = await toCanvas(page);
      const ctx = canvas.getContext('2d')!;
      tiffPages.push({ width: canvas.width, height: canvas.height, rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data, dpi: page.dpi });
    }
    out.push(new File([encodeTiff(tiffPages) as BlobPart], `${base}.tiff`, { type: 'image/tiff' }));
    return out;
  }

  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  for (let i = 0; i < images.length; i += 1) {
    const canvas = await toCanvas(images[i]);
    const blob = await canvasBlob(canvas, type, format === 'jpg' ? 0.9 : undefined);
    out.push(new File([blob], pageFileName(base, format, i, images.length), { type }));
    canvas.width = 1; canvas.height = 1;
  }
  return out;
}
