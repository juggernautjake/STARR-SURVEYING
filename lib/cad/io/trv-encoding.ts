// lib/cad/io/trv-encoding.ts
//
// trv-full-support — turn the raw bytes of a Traverse PC file into text.
//
// Traverse PC writes its files in the Windows ANSI code page
// (Windows-1252), NOT UTF-8: the degree sign in a bearing is the single
// byte 0xB0 and the label line separator `¶` is 0xB6. Reading such a
// file with `File.text()` / `Response.text()` (which always decode as
// UTF-8) turns both into U+FFFD, so bearings lose their degree sign and
// multi-line labels collapse. Every TRV read goes through
// `decodeTextBytes` instead:
//
//   1. a byte-order mark wins (UTF-8, UTF-16 LE, UTF-16 BE);
//   2. otherwise the bytes are tried as strict UTF-8 (a hand-edited
//      or newer-version file that really is UTF-8 stays intact);
//   3. anything that is not valid UTF-8 is decoded as Windows-1252.
//
// Safe for `.starr` JSON and other UTF-8 text too: step 2 accepts them
// unchanged. Pure: no DOM; uses TextDecoder (browsers + Node 18+).

/** Windows-1252 code points for bytes 0x80-0x9F (the only range where
 *  it differs from Latin-1). `undefined` slots are unassigned and map to
 *  the same-valued C1 control, matching browsers. */
const CP1252_HIGH: ReadonlyArray<number | undefined> = [
  0x20ac, undefined, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, undefined, 0x017d, undefined,
  undefined, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, undefined, 0x017e, 0x0178,
];

/** Decode bytes as Windows-1252 without relying on the runtime having
 *  that legacy decoder (some minimal ICU builds do not). */
export function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x4000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(bytes.length, i + CHUNK);
    const codes: number[] = new Array(end - i);
    for (let j = i; j < end; j++) {
      const b = bytes[j];
      codes[j - i] = b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] ?? b) : b;
    }
    out += String.fromCharCode(...codes);
  }
  return out;
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** Which decoding `decodeTextBytes` picked (exposed for tests + logs). */
export type TextEncodingGuess = 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'utf-8' | 'windows-1252';

/** Detect the encoding of a text file's bytes (see the module comment). */
export function detectTextEncoding(input: ArrayBuffer | Uint8Array): TextEncodingGuess {
  const b = toBytes(input);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8-bom';
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  // Pure ASCII is valid UTF-8 and identical in both decodings.
  let ascii = true;
  for (let i = 0; i < b.length; i++) if (b[i] >= 0x80) { ascii = false; break; }
  if (ascii) return 'utf-8';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

/** Decode a text file's bytes, honouring a BOM, accepting valid UTF-8
 *  and falling back to Windows-1252 (Traverse PC's native encoding). */
export function decodeTextBytes(input: ArrayBuffer | Uint8Array): string {
  const b = toBytes(input);
  switch (detectTextEncoding(b)) {
    case 'utf-8-bom': return new TextDecoder('utf-8').decode(b.subarray(3));
    case 'utf-16le': return new TextDecoder('utf-16le').decode(b.subarray(2));
    case 'utf-16be': return new TextDecoder('utf-16be').decode(b.subarray(2));
    case 'utf-8': return new TextDecoder('utf-8').decode(b);
    default: return decodeWindows1252(b);
  }
}

/** Read a browser `File` / `Blob` as text with {@link decodeTextBytes}. */
export async function readTextFile(file: Blob): Promise<string> {
  return decodeTextBytes(await file.arrayBuffer());
}
