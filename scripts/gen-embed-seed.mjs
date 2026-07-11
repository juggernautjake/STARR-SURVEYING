// scripts/gen-embed-seed.mjs
// Generate seeds/440_fs_prep_photos.sql — embeds the vetted open-licensed FS
// photos into module content_sections with professional captions + credit
// lines, inserted mid-section to break up the text. Credits come from
// public/lessons/fs/photos/CREDITS.json so attribution is accurate.

import fs from 'node:fs';

const CREDITS = JSON.parse(fs.readFileSync('public/lessons/fs/photos/CREDITS.json', 'utf8'));

// file → { m: module_number, s: section_type, after: paragraph index, cap: caption }
const PLACE = [
  { file: 'm1-survey-crew.jpg',            m: 1,  s: 'overview', after: 1, cap: 'A historic survey party in the field. Surveying has always paired careful field observation with disciplined measurement and record-keeping — the same foundation the FS exam tests.' },
  { file: 'm2-differential-leveling.jpg',  m: 2,  s: 'examples', after: 1, cap: 'An automatic (dumpy) level. Differential leveling uses instruments like this to carry an elevation from a known benchmark to new points, one balanced backsight/foresight setup at a time.' },
  { file: 'm3-theodolite.jpg',             m: 3,  s: 'concepts', after: 2, cap: 'A surveyor sighting through an optical theodolite. The theodolite measures horizontal and vertical angles — the angular half of every distance-and-angle observation.' },
  { file: 'm3-prism-pole.jpg',             m: 3,  s: 'examples', after: 1, cap: 'A retroreflective prism target. A total station’s EDM fires an infrared beam at the prism and times its return to measure slope distance to the point.' },
  { file: 'm4-total-station-road.jpg',     m: 4,  s: 'concepts', after: 2, cap: 'A total station set up over a control point during a traverse. Each setup measures the angle and distance to the next station, and coordinates are propagated by latitudes and departures.' },
  { file: 'm4-data-collector.jpg',         m: 4,  s: 'examples', after: 1, cap: 'A handheld EDM / data collector. Modern traverse and COGO work is recorded and reduced electronically in the field, but the underlying geometry is exactly what you compute by hand here.' },
  { file: 'm5-highway-curve.jpg',          m: 5,  s: 'overview', after: 1, cap: 'A horizontal curve on a highway. Route-surveying geometry — radius R, tangent T, external E, and central angle I — is one of the most heavily tested computation topics.' },
  { file: 'm5-earthwork-grading.jpg',      m: 5,  s: 'examples', after: 1, cap: 'Earthwork grading on a road project. Cut-and-fill volumes between stations are computed from cross-section end areas by the average-end-area method.' },
  { file: 'm6-gps-constellation.jpg',      m: 6,  s: 'concepts', after: 2, cap: 'A GPS satellite in orbit. GNSS positioning trilaterates a ground position from simultaneous ranges to multiple satellites in view.' },
  { file: 'm6-cors-antenna.jpg',           m: 6,  s: 'examples', after: 1, cap: 'A permanent GNSS reference-station antenna (a CORS). Continuously operating reference stations provide the base observations for RTK and post-processed positioning.' },
  { file: 'm7-boundary-monument.jpg',      m: 7,  s: 'overview', after: 1, cap: 'A set boundary monument. Physical monuments are the highest form of evidence for a property corner — they generally control over record distances and bearings.' },
  { file: 'm7-section-corner.jpg',         m: 7,  s: 'examples', after: 1, cap: 'A surveyor recovering a corner with a GNSS rover. Locating and honoring the original monuments is the heart of boundary retracement and the PLSS.' },
  { file: 'm8-survey-drone.jpg',           m: 8,  s: 'concepts', after: 2, cap: 'An aerial view of the landscape. Photogrammetry turns overlapping aerial and UAV imagery into measurable maps, orthophotos, and elevation models.' },
  { file: 'm8-gis-map.jpg',                m: 8,  s: 'examples', after: 1, cap: 'A topographic map. Contour lines and mapped features are the end product of the mapping, GIS, and photogrammetry workflow.' },
  { file: 'm9-scientific-calculator.jpg',  m: 9,  s: 'overview', after: 1, cap: 'An NCEES-approved scientific calculator. Fluency with DMS entry, rectangular↔polar conversion, and memory registers is worth real points and minutes on exam day.' },
  { file: 'm10-field-survey-scene.jpg',    m: 10, s: 'concepts', after: 1, cap: 'A surveyor operating a total station. The FS exam pulls from every field and office skill practiced across these modules — this review ties them together.' },
  { file: 'm11-plat-map.jpg',              m: 11, s: 'concepts', after: 1, cap: 'A recorded plat. The plat is the legal drawing that documents a survey and creates the parcels — where professional practice, boundary law, and business meet.' },
  { file: 'm11-site-safety.jpg',           m: 11, s: 'overview', after: 1, cap: 'A surveyor in high-visibility PPE working near traffic. Professional practice includes job-site safety, OSHA compliance, and the standard of care owed to the public.' },

  // Authentic Starr Surveying field photos (own work) — placed in previously
  // image-free sections to make the material concrete and on-brand.
  { file: 'starr-branded-crew.jpg',            m: 1,  s: 'tips',     after: 1, cap: 'A Starr Surveying crew member running a total station in the field — the everyday reality behind the theory you are studying.' },
  { file: 'starr-tape-check.jpg',              m: 1,  s: 'examples', after: 1, cap: 'Checking a measurement by hand with a steel tape. Even in the electronic era, a good surveyor verifies distances directly in the field.' },
  { file: 'starr-total-station-sighting.jpg',  m: 3,  s: 'tips',     after: 1, cap: 'Sighting through the total station to turn a precise angle — steady setup, careful pointing, and a check angle are what keep angular error small.' },
  { file: 'starr-crew-directing.jpg',          m: 4,  s: 'tips',     after: 1, cap: 'Directing the rod person from an occupied station during a traverse. Clear communication and good station geometry make a clean, checkable traverse.' },
  { file: 'starr-gnss-rover.jpg',              m: 6,  s: 'tips',     after: 1, cap: 'A Starr Surveying GNSS rover with data collector. RTK positioning fixes coordinates in seconds — but you still need to understand datums, geoid height, and check shots.' },
  { file: 'starr-total-station-setup.jpg',     m: 10, s: 'examples', after: 1, cap: 'A total station set and leveled over a point, ready to observe. Every field problem in this review starts with a correct instrument setup.' },
  { file: 'starr-total-station-operate.jpg',   m: 10, s: 'tips',     after: 1, cap: 'Operating the instrument on a Starr Surveying job. On exam day, picture the real field task behind each question — it keeps the computations grounded.' },
];

function credit(file) {
  const c = CREDITS[file];
  if (!c) return 'Wikimedia Commons';
  if (/starr/i.test(String(c.license || '')) || /starr surveying field photo/i.test(String(c.source || ''))) {
    return 'Photo: Starr Surveying (field photo)';
  }
  let artist = String(c.artist || '').replace(/\s*\(\s*$/, '').replace(/[,;]\s*$/, '').trim();
  // trim over-long / messy artist strings
  if (artist.length > 46) artist = artist.slice(0, 44).trim() + '…';
  const lic = String(c.license || '').trim();
  const pd = /public domain|^cc0/i.test(lic);
  if (pd) return `Photo: ${artist} — ${/cc0/i.test(lic) ? 'CC0' : 'Public domain'}, via Wikimedia Commons`;
  return `Photo: ${artist} — ${lic}, via Wikimedia Commons`;
}

const lines = [];
lines.push(`-- 440_fs_prep_photos.sql`);
lines.push(`-- FS prep — intersperse vetted, open-licensed surveying photos through the`);
lines.push(`-- module lessons to break up the text. Each image is proportionally scaled`);
lines.push(`-- (undistorted) and carries a professional caption + attribution credit.`);
lines.push(`-- Sourced from Wikimedia Commons (Public Domain / CC0 / CC BY / CC BY-SA);`);
lines.push(`-- see public/lessons/fs/photos/CREDITS.json. Generated by scripts/gen-embed-seed.mjs.`);
lines.push(`BEGIN;`);
lines.push(`-- Insert a figure markdown after the p_after-th paragraph of the first`);
lines.push(`-- section of type p_type in module p_mod. Idempotent (skips if already present).`);
lines.push(`CREATE OR REPLACE FUNCTION fs_insert_figure(p_mod int, p_type text, p_after int, p_fig text)`);
lines.push(`RETURNS void AS $fn$`);
lines.push(`DECLARE arr jsonb; i int; el jsonb; parts text[]; n int; k int;`);
lines.push(`BEGIN`);
lines.push(`  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;`);
lines.push(`  IF arr IS NULL THEN RETURN; END IF;`);
lines.push(`  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP`);
lines.push(`    el := arr -> i;`);
lines.push(`    IF el ->> 'type' = p_type THEN`);
lines.push(`      IF position(p_fig IN coalesce(el ->> 'content', '')) > 0 THEN RETURN; END IF;`);
lines.push(`      parts := regexp_split_to_array(el ->> 'content', E'\\n\\n');`);
lines.push(`      n := coalesce(array_length(parts, 1), 0);`);
lines.push(`      k := least(greatest(p_after, 1), n);`);
lines.push(`      parts := parts[1:k] || ARRAY[p_fig] || parts[k+1:n];`);
lines.push(`      arr := jsonb_set(arr, ARRAY[i::text, 'content'], to_jsonb(array_to_string(parts, E'\\n\\n')));`);
lines.push(`      UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;`);
lines.push(`      RETURN;`);
lines.push(`    END IF;`);
lines.push(`  END LOOP;`);
lines.push(`END;`);
lines.push(`$fn$ LANGUAGE plpgsql;`);
lines.push(``);
for (const p of PLACE) {
  const md = `![${p.cap}](/lessons/fs/photos/${p.file} "${credit(p.file)}")`;
  lines.push(`SELECT fs_insert_figure(${p.m}, '${p.s}', ${p.after}, $img$${md}$img$);`);
}
lines.push(``);
lines.push(`DROP FUNCTION IF EXISTS fs_insert_figure(int, text, int, text);`);
lines.push(`COMMIT;`);
lines.push(``);
fs.writeFileSync('seeds/440_fs_prep_photos.sql', lines.join('\n'));
console.log('wrote seeds/440_fs_prep_photos.sql with', PLACE.length, 'image placements');
