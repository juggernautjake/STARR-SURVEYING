// A small ZIP reader for the Browserbase session downloads archive.
//
// Browserbase hands a session's downloaded files back as ONE zip (`bb.sessions.downloads.list`), and
// the worker has no zip dependency. The archive is small and plain — stored or deflated entries, no
// encryption, no spanning — so the central directory is walked here with node's zlib and nothing else.

import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  /** Uncompressed bytes. */
  data: Buffer;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Every file in the archive, in central-directory order. Throws on a malformed archive. */
export function readZipEntries(zip: Buffer): ZipEntry[] {
  if (zip.length < 22) return [];
  // The end-of-central-directory record is at the tail, before an optional comment (≤ 65535 bytes).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: end-of-central-directory record not found');
  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < entryCount; n++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIG) throw new Error(`zip: bad central directory entry at ${offset}`);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;

    if (zip.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`zip: bad local header for ${name}`);
    const localNameLen = zip.readUInt16LE(localOffset + 26);
    const localExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`zip: unsupported compression method ${method} for ${name}`);
    if (uncompressedSize && data.length !== uncompressedSize) {
      throw new Error(`zip: ${name} inflated to ${data.length} bytes, header says ${uncompressedSize}`);
    }
    if (!name.endsWith('/')) entries.push({ name, data });
  }
  return entries;
}
