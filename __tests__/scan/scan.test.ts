// __tests__/scan/scan.test.ts — scanning into Starr Surveying, and cutting long recordings.
//
// Owner, 2026-10-06: a Scan button that finds whatever scanners and scanning apps the computer has,
// tells the person how to set up when there are none, previews before saving, and saves in the
// chosen format; and long videos cut into labelled parts of at most three minutes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { adviseSetup } from '@/lib/scan/setup';
import { encodeTiff } from '@/lib/scan/tiff';
import { cleanBaseName, pageFileName, defaultScanName } from '@/lib/scan/build-output';
import { trimPlan } from '@/lib/scan/trim';
import { clientOs, type HelperStatus } from '@/lib/scan/helper-client';
import { planSplit, isSplittableMedia } from '@/lib/jobs/video-split';
import { partArgs } from '@/lib/jobs/video-split-run';
// The helper is plain Node (scan-helper/); its pure parts are tested from here.
import { buildQuery, parseAnswers, assemble, scanSettingsXml } from '../../scan-helper/src/drivers/escl.mjs';
import { originAllowed } from '../../scan-helper/src/server.mjs';

const status = (p: Partial<HelperStatus>): HelperStatus => ({
  app: 'starr-scan', version: '1.0.0', os: 'win32', inbox: 'C:/x', sources: [], installed: [], naps2: false, busy: false, ...p,
});

describe('setup guidance (owner: "tells the user what they need to do to set up scanning")', () => {
  it('no helper → install it, connect the scanner, it appears on its own', () => {
    const a = adviseSetup(null, 'windows');
    expect(a.state).toBe('no-helper');
    expect(a.steps.map((s) => s.title)).toEqual(['Install the Starr Scan helper', 'Connect your scanner', 'Come back here']);
  });
  it('an installed scanner that is switched off is named, with how to wake it', () => {
    const a = adviseSetup(status({ installed: [{ name: 'Brother DS-640', present: false }] }), 'windows');
    expect(a.state).toBe('scanner-asleep');
    expect(a.headline).toContain('Brother DS-640');
    expect(a.steps[0].detail).toMatch(/feed it a page/);
  });
  it('a scanner or an app means ready', () => {
    expect(adviseSetup(status({ sources: [{ id: 'wia:x', kind: 'device', driver: 'wia', name: 'DS-640' }] }), 'windows').state).toBe('ready');
    expect(adviseSetup(status({ sources: [{ id: 'app:windows-scan', kind: 'app', driver: 'app', name: 'Windows Scan' }] }), 'windows').state).toBe('ready');
  });
  it('phones use the camera and never ask for the helper', () => {
    expect(adviseSetup(null, 'ios').state).toBe('mobile');
    expect(adviseSetup(null, 'android').state).toBe('mobile');
  });
  it('a Chromebook is pointed at its own Scan app', () => {
    expect(adviseSetup(null, 'chromeos').steps[0].title).toMatch(/another app/);
  });
  it('reads the OS from the user agent', () => {
    expect(clientOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(clientOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe('mac');
    expect(clientOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe('ios');
    expect(clientOs('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('chromeos');
  });
});

describe('TIFF output', () => {
  it('writes a valid little-endian multi-page TIFF', () => {
    const px = (w: number, h: number) => new Uint8Array(w * h * 4).fill(200);
    const t = encodeTiff([{ width: 3, height: 2, rgba: px(3, 2), dpi: 300 }, { width: 2, height: 2, rgba: px(2, 2) }]);
    const v = new DataView(t.buffer);
    expect(String.fromCharCode(t[0], t[1])).toBe('II');
    expect(v.getUint16(2, true)).toBe(42);
    const ifd1 = v.getUint32(4, true);
    const entries = v.getUint16(ifd1, true);
    const tag = (ifd: number, id: number) => {
      for (let k = 0; k < v.getUint16(ifd, true); k += 1) {
        const e = ifd + 2 + k * 12;
        if (v.getUint16(e, true) === id) return v.getUint16(e + 2, true) === 3 ? v.getUint16(e + 8, true) : v.getUint32(e + 8, true);
      }
      return null;
    };
    expect(tag(ifd1, 256)).toBe(3);
    expect(tag(ifd1, 257)).toBe(2);
    const next = v.getUint32(ifd1 + 2 + entries * 12, true);
    expect(next).toBeGreaterThan(0);
    expect(tag(next, 256)).toBe(2);
    expect(v.getUint32(next + 2 + v.getUint16(next, true) * 12, true)).toBe(0); // last page
    const strip = tag(ifd1, 273)!;
    expect(t[strip]).toBe(200);
    expect(v.getUint32(tag(ifd1, 282)!, true)).toBe(300);
  });
});

describe('file names', () => {
  it('cleans what storage and Windows refuse', () => {
    expect(cleanBaseName('Smith/Jones: deed?.pdf')).toBe('Smith Jones deed');
    expect(cleanBaseName('   ')).toBe('Scan');
  });
  it('numbers pages only when there is more than one', () => {
    expect(pageFileName('Deed', 'jpg', 0, 1)).toBe('Deed.jpg');
    expect(pageFileName('Deed', 'jpg', 1, 3)).toBe('Deed-2.jpg');
    expect(pageFileName('Deed', 'png', 0, 12)).toBe('Deed-01.png');
  });
  it('defaults to the date and time', () => {
    expect(defaultScanName(new Date(2026, 9, 6, 14, 5))).toBe('Scan 2026-10-06 14-05');
  });
});

describe('network scanners (eSCL / AirScan)', () => {
  it('asks for both eSCL services', () => {
    const q = buildQuery(['_uscan._tcp.local', '_uscans._tcp.local']);
    expect(q.readUInt16BE(4)).toBe(2);
    expect(q.toString('latin1')).toContain('_uscan');
  });

  it('assembles PTR + SRV + A + TXT into a scanner', () => {
    const recs = [
      { name: '_uscans._tcp.local', type: 12, data: 'EPSON WF-7840 Series._uscans._tcp.local' },
      { name: 'EPSON WF-7840 Series._uscans._tcp.local', type: 33, data: { port: 443, target: 'EPSON123.local' } },
      { name: 'EPSON123.local', type: 1, data: '192.168.1.118' },
      { name: 'EPSON WF-7840 Series._uscans._tcp.local', type: 16, data: { rs: 'eSCL', ty: 'EPSON WF-7840 Series', is: 'platen,adf', duplex: 'T' } },
    ];
    const [s] = assemble(recs);
    expect(s.id).toBe('escl:https://192.168.1.118:443/eSCL');
    expect(s.name).toBe('EPSON WF-7840 Series');
    expect(s.sources).toEqual(['feeder', 'flatbed', 'duplex']);
  });

  it('parses a real-shaped mDNS answer packet', () => {
    // A response with one PTR answer, built by hand.
    const name = (n: string) => Buffer.concat([...n.split('.').map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
    const target = name('Scanner._uscan._tcp.local');
    const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(1, 6);
    const rr = Buffer.concat([name('_uscan._tcp.local'), Buffer.from([0, 12, 0, 1, 0, 0, 0, 120]), Buffer.from([0, target.length]), target]);
    const recs = parseAnswers(Buffer.concat([header, rr]));
    expect(recs[0]).toMatchObject({ name: '_uscan._tcp.local', type: 12, data: 'Scanner._uscan._tcp.local' });
  });

  it('asks the scanner for what the person chose', () => {
    const x = scanSettingsXml({ source: 'flatbed', dpi: 300, color: 'gray' });
    expect(x).toContain('<pwg:InputSource>Platen</pwg:InputSource>');
    expect(x).toContain('<scan:ColorMode>Grayscale8</scan:ColorMode>');
    expect(x).toContain('<scan:XResolution>300</scan:XResolution>');
  });
});

describe('the helper answers only the Starr Surveying site', () => {
  it('allows production, local development and preview deployments', () => {
    expect(originAllowed('https://www.starr-surveying.com')).toBe(true);
    expect(originAllowed('http://localhost:3000')).toBe(true);
    expect(originAllowed('https://starr-surveying-abc123-juggernautjakes-projects.vercel.app')).toBe(true);
  });
  it('refuses every other website', () => {
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('https://starr-surveying.com.evil.example')).toBe(false);
    expect(originAllowed(undefined)).toBe(false);
  });
  it('holds no credentials and never uploads — the website does', () => {
    const src = readFileSync('scan-helper/src/server.mjs', 'utf8');
    expect(src).not.toMatch(/supabase|SERVICE_ROLE|Authorization: Bearer/i);
  });
});

describe('cutting long recordings into parts (owner: "10 3 minute long videos")', () => {
  it('a 30-minute video under the size limit becomes ten 3-minute parts when asked', () => {
    const p = planSplit({ sizeBytes: 400 * 1048576, durationSec: 1800, capBytes: 500 * 1048576, name: 'walk.mov', maxPartSeconds: 180, force: true });
    expect(p.parts).toHaveLength(10);
    expect(p.parts[0].durationSec).toBe(180);
    expect(p.parts[9].name).toBe('walk (part 10 of 10).mov');
  });
  it('an over-limit video is cut into whichever is more: parts that fit, or parts of the asked length', () => {
    // 642 MB, 6:52 — IMG_5891 from 2026-10-05.
    const p = planSplit({ sizeBytes: 642 * 1048576, durationSec: 412, capBytes: 500 * 1048576, name: 'IMG_5891.MOV', maxPartSeconds: 180 });
    expect(p.parts).toHaveLength(3);
    expect(Math.max(...p.parts.map((x) => x.durationSec))).toBeLessThanOrEqual(180);
  });
  it('a short file under the limit is left alone', () => {
    expect(planSplit({ sizeBytes: 10 * 1048576, durationSec: 60, capBytes: 500 * 1048576, name: 'a.mov', maxPartSeconds: 180, force: true }).needed).toBe(false);
  });
  it('audio splits the same way', () => {
    expect(isSplittableMedia('meeting.m4a')).toBe(true);
    expect(isSplittableMedia('memo.wav', 'audio/wav')).toBe(true);
    expect(isSplittableMedia('plat.pdf')).toBe(false);
  });
  it('each part is a stream copy, video and audio only, the last running to the end', () => {
    const part = { index: 2, total: 3, startSec: 180, durationSec: 180, name: 'x' };
    const args = partArgs('/in/x.MOV', part, 'part_2.mov', false);
    expect(args.slice(0, 4)).toEqual(['-ss', '180', '-i', '/in/x.MOV']);
    expect(args).toContain('copy');
    expect(args.join(' ')).toContain('-map 0:v? -map 0:a?');
    expect(partArgs('/in/x.MOV', { ...part, index: 3 }, 'part_3.mov', true)).not.toContain('-t');
  });
  it('reads the input from disk rather than copying it into memory (the 5-minute-video failure)', () => {
    const src = readFileSync('lib/jobs/video-split-run.ts', 'utf8');
    expect(src).toContain("mount('WORKERFS'");
    expect(src).not.toMatch(/writeFile\(input, await fetchFile/);
  });
});

describe('receipt scanning (owner, 2026-10-07) — only on the receipt page', () => {
  it('the receipt page opens the scanner in receipts mode and feeds its queue', () => {
    const src = readFileSync('app/admin/receipts/new/page.tsx', 'utf8');
    expect(src).toContain('mode="receipts"');
    expect(src).toMatch(/for \(const f of files\) enqueue\(f, await hashPickedFile\(f\)\)/);
  });
  it('no other Scan button uses receipts mode ("It should just be on the receipt page")', () => {
    for (const f of ['app/admin/components/files/FolderExplorer.tsx', 'app/admin/files/page.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('<ScanDialog');
      expect(src, f).not.toContain('mode="receipts"');
    }
  });
  it('the scanner defaults to document mode, so nothing changes where receipts mode is not asked for', () => {
    expect(readFileSync('app/admin/components/scan/ScanDialog.tsx', 'utf8')).toContain("mode = 'document'");
  });
});

describe('trimming the blank paper a sheet feeder scans past the page (2026-10-07)', () => {
  // A 100×140 "page": content in rows 0–99, then 40 rows of white — a letter page scanned 14" long.
  it('cuts the blank strip under the content, keeping a margin', () => {
    const rows = new Array(140).fill(0).map((_, i) => (i < 100 ? 30 : 0));
    const cols = new Array(100).fill(50);
    expect(trimPlan(rows, cols, 100, 140, 4)).toEqual({ left: 0, top: 0, width: 100, height: 104 });
  });
  it('crops a narrow receipt in the middle of a wide scan on all four sides', () => {
    // 300×400 scan; the receipt's content spans columns 110–189 and rows 20–299.
    const rows = new Array(400).fill(0).map((_, i) => (i >= 20 && i < 300 ? 40 : 0));
    const cols = new Array(300).fill(0).map((_, i) => (i >= 110 && i < 190 ? 120 : 0));
    expect(trimPlan(rows, cols, 300, 400, 5)).toEqual({ left: 105, top: 15, width: 90, height: 290 });
  });
  it('leaves a full page alone', () => {
    expect(trimPlan(new Array(140).fill(30), new Array(100).fill(50), 100, 140, 4)).toBeNull();
  });
  it('leaves a blank page alone — the person decides', () => {
    expect(trimPlan(new Array(140).fill(0), new Array(100).fill(0), 100, 140, 4)).toBeNull();
  });
  it('ignores a few specks of dust', () => {
    const rows = new Array(140).fill(0).map((_, i) => (i < 100 ? 30 : i === 130 ? 1 : 0));
    expect(trimPlan(rows, new Array(100).fill(50), 100, 140, 4)?.height).toBe(104);
  });
  it('the helper saves colour pages as JPEG', () => {
    expect(readFileSync('scan-helper/src/drivers/wia.mjs', 'utf8')).toContain('{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}');
  });
});
