// scripts/fetch-fs-images.mjs
// Fetch relevant, OPEN-LICENSED surveying photos from Wikimedia Commons for the
// FS prep course. Downloads a proportionally-scaled (never upscaled, never
// distorted) version of each original and records attribution so every image
// gets a proper credit line. Run: node scripts/fetch-fs-images.mjs [key ...]
//
// License policy: only Public Domain / CC0 / CC BY / CC BY-SA are accepted.

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/lessons/fs/photos');
const CREDITS = path.join(OUT, 'CREDITS.json');
const UA = 'StarrSurveying-CoursePrep/1.0 (https://starr-surveying.com; jacobmaddux96@gmail.com)';
const THUMB_W = 1500;

// key → search queries (tried in order until an acceptable image is found)
const MANIFEST = [
  // Module 1 — Fundamentals
  { file: 'm1-survey-crew.jpg', queries: ['surveying party historical', 'land surveyors chain historical', 'surveying crew theodolite historical', 'surveyors group field'] },
  // Module 2 — Leveling
  { file: 'm2-leveling-rod.jpg', queries: ['stadia rod surveying', 'E-pattern levelling staff', 'survey levelling staff graduated', 'leveling rod reading survey'] },
  { file: 'm2-differential-leveling.jpg', queries: ['differential leveling surveyor', 'automatic level tripod field survey', 'dumpy level surveying'] },
  // Module 3 — Distance & Angle Measurement
  { file: 'm3-theodolite.jpg', queries: ['theodolite instrument', 'optical theodolite surveying', 'theodolite tripod'] },
  { file: 'm3-prism-pole.jpg', queries: ['total station prism reflector', 'geodetic prism surveying', 'survey prism target tripod', 'reflector prism total station'] },
  // Module 4 — Traversing & COGO
  { file: 'm4-total-station-road.jpg', queries: ['total station road survey', 'surveyor total station street', 'traverse survey total station'] },
  { file: 'm4-data-collector.jpg', queries: ['tacheometer surveying instrument', 'electronic tacheometer', 'total station instrument surveying', 'surveying total station closeup'] },
  // Module 5 — Areas, Volumes & Curves
  { file: 'm5-highway-curve.jpg', queries: ['curved highway aerial', 'curved road landscape', 'winding road aerial view'] },
  { file: 'm5-earthwork-grading.jpg', queries: ['earthwork grading construction', 'cut and fill road construction', 'excavation grading site'] },
  // Module 6 — GNSS / Geodesy
  { file: 'm6-cors-antenna.jpg', queries: ['CORS GNSS reference station antenna', 'geodetic GNSS antenna', 'continuously operating reference station'] },
  { file: 'm6-gps-constellation.jpg', queries: ['GPS satellite', 'navigation satellite space', 'GNSS satellite orbit', 'GPS IIF satellite'] },
  // Module 7 — Boundary Law & Public Lands
  { file: 'm7-section-corner.jpg', queries: ['brass cap survey marker', 'survey brass cap monument', 'General Land Office brass cap', 'BLM brass cap survey'] },
  { file: 'm7-boundary-monument.jpg', queries: ['property boundary monument marker', 'land boundary corner monument', 'survey property corner iron pin'] },
  // Module 8 — Photogrammetry, GIS & Construction
  { file: 'm8-survey-drone.jpg', queries: ['surveying drone UAV mapping', 'drone photogrammetry survey', 'UAV aerial survey quadcopter'] },
  { file: 'm8-construction-stakes.jpg', queries: ['construction stake surveying', 'surveyor marking stake ground', 'grade stake construction site', 'boundary stake wooden survey'] },
  { file: 'm8-gis-map.jpg', queries: ['topographic map contour lines', 'contour map', 'cadastral parcel map'] },
  // Module 9 — Calculator & Test Strategy
  { file: 'm9-scientific-calculator.jpg', queries: ['Casio fx-115 scientific calculator', 'scientific calculator engineering', 'scientific calculator buttons'] },
  // Module 10 — Comprehensive Review
  { file: 'm10-field-survey-scene.jpg', queries: ['surveyor total station tripod', 'land surveyor instrument field', 'surveyor measuring theodolite tripod', 'surveyor operating total station'] },
  // Module 11 — Business, Ethics & Professional Practice
  { file: 'm11-plat-map.jpg', queries: ['cadastral plat survey map', 'subdivision plat map drawing', 'land plat survey plan'] },
  { file: 'm11-site-safety.jpg', queries: ['surveyor safety vest hard hat construction', 'construction site safety surveyor', 'surveyor high visibility vest'] },
];

const okLicense = (s) => /public domain|^cc0|^cc[\s-]?by/i.test(String(s || ''));
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

async function api(query) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6', gsrlimit: '15', prop: 'imageinfo',
    iiprop: 'url|extmetadata|size', iiurlwidth: String(THUMB_W), format: 'json',
  }).toString();
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const j = await r.json();
  return Object.values(j.query?.pages || {});
}

function pick(pages) {
  const cand = pages.map(p => {
    const ii = (p.imageinfo || [])[0]; if (!ii) return null;
    const em = ii.extmetadata || {};
    const lic = (em.LicenseShortName || {}).value;
    if (!okLicense(lic)) return null;
    if ((ii.width || 0) < 600) return null;
    return {
      title: p.title, w: ii.width, h: ii.height, idx: p.index ?? 999,
      thumb: ii.thumburl, page: ii.descriptionurl,
      artist: stripHtml((em.Artist || {}).value) || 'Wikimedia Commons contributor',
      license: lic, landscape: (ii.width || 0) >= (ii.height || 1) * 1.05,
    };
  }).filter(Boolean);
  // Respect Commons search relevance (index ascending); among the most-relevant
  // few, prefer a landscape image, else take the single most-relevant hit.
  cand.sort((a, b) => a.idx - b.idx);
  return cand.slice(0, 5).find(c => c.landscape) || cand[0] || null;
}

async function download(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  const only = process.argv.slice(2);
  const work = only.length ? MANIFEST.filter(m => only.includes(m.file) || only.includes(m.file.replace('.jpg', ''))) : MANIFEST;

  for (const item of work) {
    let chosen = null;
    for (const q of item.queries) {
      const pages = await api(q);
      chosen = pick(pages);
      if (chosen) { chosen.query = q; break; }
    }
    if (!chosen) { console.log(`MISS  ${item.file}  (no acceptable image)`); continue; }
    try {
      const bytes = await download(chosen.thumb, path.join(OUT, item.file));
      credits[item.file] = {
        title: chosen.title, artist: chosen.artist, license: chosen.license,
        source: chosen.page, query: chosen.query, width: Math.min(THUMB_W, chosen.w), height: chosen.h,
      };
      console.log(`OK    ${item.file}  ${(bytes / 1024 | 0)}KB  [${chosen.license}] ${chosen.artist.slice(0, 30)}  ←"${chosen.query}"`);
    } catch (e) {
      console.log(`FAIL  ${item.file}  ${e.message}`);
    }
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  console.log(`\nCredits written to ${CREDITS}`);
}
main().catch(e => { console.error(e); process.exit(1); });
