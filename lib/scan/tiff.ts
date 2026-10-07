// lib/scan/tiff.ts — write a (multi-page) TIFF in the browser, with no library.
//
// Owner, 2026-10-06: scans upload "with the chosen file extension". PDF, JPG and PNG the browser can
// make already; TIFF it cannot, and it is the format county clerks and older records systems ask for.
// This writes baseline TIFF: uncompressed 8-bit RGB, one image per page, which every TIFF reader
// opens. Pure — RGBA pixels in, bytes out — so it is tested without a canvas.

export interface TiffPage { width: number; height: number; rgba: Uint8ClampedArray | Uint8Array; dpi?: number }

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

export function encodeTiff(pages: TiffPage[]): Uint8Array {
  if (!pages.length) throw new Error('No pages to write.');
  // Lay out: header, then for each page [IFD][bits-per-sample][resolutions][pixels].
  const ENTRIES = 13;
  const ifdSize = 2 + ENTRIES * 12 + 4;
  const sizes = pages.map((p) => ({ ifd: ifdSize, bps: 6, res: 16, pix: p.width * p.height * 3 }));
  const total = 8 + sizes.reduce((s, x) => s + x.ifd + x.bps + x.res + x.pix, 0);
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // "II", 42, offset of first IFD.
  view.setUint8(0, 0x49); view.setUint8(1, 0x49); view.setUint16(2, 42, true); view.setUint32(4, 8, true);

  let at = 8;
  pages.forEach((p, i) => {
    const ifdAt = at;
    const bpsAt = ifdAt + sizes[i].ifd;
    const resAt = bpsAt + sizes[i].bps;
    const pixAt = resAt + sizes[i].res;
    const next = pixAt + sizes[i].pix;
    const dpi = p.dpi ?? 200;
    const entries: Array<[number, number, number, number]> = [
      [256, LONG, 1, p.width],                // ImageWidth
      [257, LONG, 1, p.height],               // ImageLength
      [258, SHORT, 3, bpsAt],                 // BitsPerSample (8,8,8)
      [259, SHORT, 1, 1],                     // Compression: none
      [262, SHORT, 1, 2],                     // Photometric: RGB
      [273, LONG, 1, pixAt],                  // StripOffsets
      [277, SHORT, 1, 3],                     // SamplesPerPixel
      [278, LONG, 1, p.height],               // RowsPerStrip
      [279, LONG, 1, sizes[i].pix],           // StripByteCounts
      [282, RATIONAL, 1, resAt],              // XResolution
      [283, RATIONAL, 1, resAt + 8],          // YResolution
      [284, SHORT, 1, 1],                     // PlanarConfiguration: chunky
      [296, SHORT, 1, 2],                     // ResolutionUnit: inch
    ];
    view.setUint16(ifdAt, entries.length, true);
    entries.forEach(([tag, type, count, value], k) => {
      const e = ifdAt + 2 + k * 12;
      view.setUint16(e, tag, true);
      view.setUint16(e + 2, type, true);
      view.setUint32(e + 4, count, true);
      if (type === SHORT && count === 1) view.setUint16(e + 8, value, true);
      else view.setUint32(e + 8, value, true);
    });
    view.setUint32(ifdAt + 2 + entries.length * 12, i === pages.length - 1 ? 0 : next, true);
    view.setUint16(bpsAt, 8, true); view.setUint16(bpsAt + 2, 8, true); view.setUint16(bpsAt + 4, 8, true);
    view.setUint32(resAt, dpi, true); view.setUint32(resAt + 4, 1, true);
    view.setUint32(resAt + 8, dpi, true); view.setUint32(resAt + 12, 1, true);
    // RGBA → RGB.
    const src = p.rgba;
    let o = pixAt;
    for (let s = 0; s < src.length; s += 4) {
      bytes[o++] = src[s]; bytes[o++] = src[s + 1]; bytes[o++] = src[s + 2];
    }
    at = next;
  });
  return bytes;
}
