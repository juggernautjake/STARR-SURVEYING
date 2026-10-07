// scan-helper/src/drivers/escl.mjs — network scanners that speak eSCL ("AirScan" / Mopria).
//
// Nearly every network scanner and multifunction printer sold since about 2015 — Brother, Canon,
// Epson, HP, Kyocera, Ricoh, Xerox — answers eSCL, which is plain HTTP plus a bit of XML. No driver
// is needed on any OS, so this is the route that makes a Wi-Fi scanner work the same on Windows, Mac
// and Linux. Scanners announce themselves on the local network over mDNS as `_uscan._tcp` (plain)
// and `_uscans._tcp` (TLS); this file asks, listens for a moment, and talks HTTP to whoever answers.
import dgram from 'node:dgram';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import https from 'node:https';
import { log } from '../util.mjs';

const SERVICES = ['_uscan._tcp.local', '_uscans._tcp.local'];

// ── A minimal mDNS query/answer codec ─────────────────────────────────────────────────────────
function encodeName(name) {
  const parts = name.split('.').filter(Boolean);
  const bufs = parts.map((p) => Buffer.concat([Buffer.from([Buffer.byteLength(p)]), Buffer.from(p)]));
  return Buffer.concat([...bufs, Buffer.from([0])]);
}

export function buildQuery(names) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(names.length, 4); // QDCOUNT
  const qs = names.map((n) => Buffer.concat([encodeName(n), Buffer.from([0x00, 0x0c, 0x00, 0x01])])); // PTR, IN
  return Buffer.concat([header, ...qs]);
}

function readName(buf, offset) {
  const labels = [];
  let jumped = false;
  let end = offset;
  for (let guard = 0; guard < 64; guard++) {
    const len = buf[offset];
    if (len === undefined) break;
    if ((len & 0xc0) === 0xc0) {
      if (!jumped) end = offset + 2;
      offset = ((len & 0x3f) << 8) | buf[offset + 1];
      jumped = true;
      continue;
    }
    if (len === 0) { if (!jumped) end = offset + 1; break; }
    labels.push(buf.toString('utf8', offset + 1, offset + 1 + len));
    offset += 1 + len;
  }
  return { name: labels.join('.'), end };
}

/** Parse every record in an mDNS packet into { name, type, data }. */
export function parseAnswers(buf) {
  const out = [];
  if (buf.length < 12) return out;
  const qd = buf.readUInt16BE(4);
  const counts = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let o = 12;
  for (let i = 0; i < qd; i++) { o = readName(buf, o).end + 4; }
  for (let i = 0; i < counts && o < buf.length; i++) {
    const { name, end } = readName(buf, o);
    o = end;
    const type = buf.readUInt16BE(o);
    const len = buf.readUInt16BE(o + 8);
    const start = o + 10;
    let data = null;
    if (type === 12) data = readName(buf, start).name; // PTR
    else if (type === 33) data = { port: buf.readUInt16BE(start + 4), target: readName(buf, start + 6).name }; // SRV
    else if (type === 1 && len === 4) data = [...buf.subarray(start, start + 4)].join('.'); // A
    else if (type === 16) { // TXT
      const kv = {};
      let p = start;
      while (p < start + len) {
        const l = buf[p];
        const s = buf.toString('utf8', p + 1, p + 1 + l);
        const eq = s.indexOf('=');
        if (eq > 0) kv[s.slice(0, eq).toLowerCase()] = s.slice(eq + 1);
        p += 1 + l;
      }
      data = kv;
    }
    out.push({ name, type, data });
    o = start + len;
  }
  return out;
}

/** Ask the network who scans. Resolves after `waitMs` with whatever answered. */
export function discover(waitMs = 1500) {
  return new Promise((resolve) => {
    const records = [];
    let sock;
    try {
      sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }
    sock.on('message', (msg) => { try { records.push(...parseAnswers(msg)); } catch { /* malformed */ } });
    sock.on('error', () => { try { sock.close(); } catch { /* */ } resolve([]); });
    sock.bind(0, () => {
      try { sock.send(buildQuery(SERVICES), 5353, '224.0.0.251'); } catch { /* no network */ }
    });
    setTimeout(() => {
      try { sock.close(); } catch { /* */ }
      Promise.all(assemble(records).map(enrich)).then(resolve, () => resolve(assemble(records)));
    }, waitMs);
  });
}

/** Join PTR → SRV → A/TXT into scanners. */
export function assemble(records) {
  const scanners = new Map();
  for (const r of records.filter((x) => x.type === 12 && SERVICES.some((s) => x.name.toLowerCase() === s))) {
    const inst = r.data;
    const srv = records.find((x) => x.type === 33 && x.name === inst)?.data;
    const txt = records.find((x) => x.type === 16 && x.name === inst)?.data ?? {};
    const ip = srv ? records.find((x) => x.type === 1 && x.name === srv.target)?.data : null;
    if (!srv || !ip) continue;
    const tls = r.name.toLowerCase().startsWith('_uscans');
    const rs = (txt.rs ?? 'eSCL').replace(/^\/+/, '');
    const key = `${ip}:${srv.port}`;
    if (scanners.has(key) && !tls) continue;
    scanners.set(key, {
      id: `escl:${tls ? 'https' : 'http'}://${ip}:${srv.port}/${rs}`,
      kind: 'device',
      driver: 'escl',
      name: txt.ty || inst.split('._')[0],
      maker: null,
      sources: [(txt.is ?? 'platen,adf').includes('adf') ? 'feeder' : null, (txt.is ?? 'platen').includes('platen') ? 'flatbed' : null, txt.duplex === 'T' ? 'duplex' : null].filter(Boolean),
      dpis: [150, 200, 300, 600],
      network: true,
    });
  }
  return [...scanners.values()];
}

/** Read a scanner's real inputs and resolutions (ScannerCapabilities), so the menu offers only what
 *  it can do. Verified 2026-10-06 against an Epson WF-7840: Platen + Adf, 100–1200 dpi. */
export async function enrich(scanner) {
  const base = scanner.id.replace(/^escl:/, '');
  try {
    const caps = await Promise.race([
      http(`${base}/ScannerCapabilities`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
    if (caps.status !== 200) return scanner;
    const xml = caps.body.toString('utf8');
    const res = [...new Set([...xml.matchAll(/<scan:XResolution>(\d+)</g)].map((m) => Number(m[1])))].filter((n) => n >= 75 && n <= 1200).sort((a, b) => a - b);
    const model = xml.match(/<pwg:MakeAndModel>([^<]+)</)?.[1];
    const adf = /<scan:Adf>/.test(xml);
    const platen = /<scan:Platen>/.test(xml);
    const duplex = /<scan:AdfDuplexInputCaps>|<scan:Duplex>/.test(xml);
    return {
      ...scanner,
      name: model || scanner.name,
      dpis: res.length ? res : scanner.dpis,
      sources: [adf ? 'feeder' : null, platen ? 'flatbed' : null, adf && duplex ? 'duplex' : null].filter(Boolean),
    };
  } catch {
    return scanner;
  }
}

// ── Scanning ────────────────────────────────────────────────────────────────────────────────────
// Network scanners often use self-signed certificates; the helper only ever talks to the LAN address
// the scanner itself announced.
const agent = new https.Agent({ rejectUnauthorized: false });

async function http(url, init = {}) {
  const opts = url.startsWith('https') ? { ...init, dispatcher: undefined } : init;
  if (url.startsWith('https')) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, { method: init.method ?? 'GET', headers: init.headers, agent }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      if (init.body) req.write(init.body);
      req.end();
    });
  }
  const res = await fetch(url, opts);
  return { status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) };
}

export function scanSettingsXml({ source, dpi, color }) {
  const input = source === 'flatbed' ? 'Platen' : 'Feeder';
  const mode = color === 'gray' ? 'Grayscale8' : color === 'bw' ? 'BlackAndWhite1' : 'RGB24';
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:InputSource>${input}</pwg:InputSource>
  ${source === 'duplex' ? '<scan:Duplex>true</scan:Duplex>' : ''}
  <scan:ColorMode>${mode}</scan:ColorMode>
  <scan:XResolution>${dpi}</scan:XResolution>
  <scan:YResolution>${dpi}</scan:YResolution>
  <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
  <scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
</scan:ScanSettings>`;
}

export async function scanEscl(opts, onPage) {
  const base = opts.sourceId.replace(/^escl:/, '');
  const job = await http(`${base}/ScanJobs`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: scanSettingsXml(opts) });
  if (job.status === 503) throw new Error('The scanner is busy. Wait a moment and try again.');
  if (job.status === 409) throw new Error('There is no paper in the feeder, or the scanner is not ready.');
  const loc = job.headers.location;
  if (job.status >= 300 || !loc) throw new Error(`The scanner refused the job (HTTP ${job.status}).`);
  const jobUrl = loc.startsWith('http') ? loc : new URL(loc, base).toString();
  let n = 0;
  for (let guard = 0; guard < 500; guard++) {
    const page = await http(`${jobUrl.replace(/\/$/, '')}/NextDocument`);
    if (page.status === 404 || page.status === 410) break;
    if (page.status === 503) { await new Promise((r) => setTimeout(r, 800)); continue; }
    if (page.status !== 200) throw new Error(`The scanner stopped sending pages (HTTP ${page.status}).`);
    n += 1;
    const file = path.join(opts.outDir, `page-${String(n).padStart(3, '0')}.jpg`);
    writeFileSync(file, page.body);
    onPage(file);
    if (opts.source === 'flatbed') break;
  }
  if (!n) throw new Error('The scanner sent no pages.');
  log(`escl: ${n} pages from ${base}`);
  return n;
}
