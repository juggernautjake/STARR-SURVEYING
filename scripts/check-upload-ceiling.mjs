// scripts/check-upload-ceiling.mjs — find out what storage ACTUALLY accepts, by uploading bytes.
//
//   node scripts/check-upload-ceiling.mjs                 # binary-search the real ceiling
//   node scripts/check-upload-ceiling.mjs --expect 500    # assert it is at least 500 MB, exit 1 if not
//   node scripts/check-upload-ceiling.mjs --bucket starr-field-files
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// A 375 MB video once transferred in full and was refused at 100%, because this codebase believed
// three different upload limits and none of them was the real one. The real one is set at the
// SUPABASE PROJECT level (Storage → Settings → Upload file size limit); it overrides every bucket's
// `file_size_limit`, cannot be raised from SQL, and is invisible to every API this app can call.
//
// The check that missed it asserted the API returned a signed URL for a 250 MB file. It never PUT
// the bytes. The route was happy and the transfer was always going to fail.
//
// So this uploads real bytes to real storage and reports the number it proved. Run it after raising
// the dashboard setting, then set `NEXT_PUBLIC_MAX_UPLOAD_BYTES` to what it found — the app cap
// must stay at or BELOW the proven ceiling, because a client cap larger than the server's spends
// every byte of an upload before anyone finds out it was refused.
//
// Probes are deleted as they go, and are named `_ceiling-probe/…` so a stray one is obvious.

import { readFileSync } from 'node:fs';

const MB = 1024 * 1024;
const PROBE_PREFIX = '_ceiling-probe';

function env() {
  const out = { ...process.env };
  if (out.NEXT_PUBLIC_SUPABASE_URL && out.SUPABASE_SERVICE_ROLE_KEY) return out;
  // Same fallback as scripts/apply-seeds.mjs: parse .env.local so this works without dotenv.
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env.local — rely on the real environment */
  }
  return out;
}

const E = env();
const URL_BASE = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env.local).');
  process.exit(2);
}

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const bucket = flag('bucket', 'starr-field-videos');
const expectMb = flag('expect', null);

// A video bucket has a MIME allowlist, so the probe has to look like a video to get past it —
// otherwise this measures the allowlist and reports it as a size limit.
const contentType = bucket.includes('video') ? 'video/mp4' : 'application/octet-stream';
const ext = bucket.includes('video') ? 'mp4' : 'bin';

/**
 * Try one size. Returns true if storage kept the bytes.
 *
 * The object is deleted on success so a run does not leave a gigabyte of probe data behind, and
 * `x-upsert` means a re-run cannot fail on a leftover key from an interrupted one.
 */
async function accepts(bytes) {
  const path = `${PROBE_PREFIX}/probe-${bytes}.${ext}`;
  const body = Buffer.alloc(bytes, 0x61);
  let res;
  try {
    res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body,
    });
  } catch (err) {
    console.error(`  ${(bytes / MB).toFixed(0)} MB — network error: ${err.message}`);
    return false;
  }

  const text = await res.text().catch(() => '');
  const ok = res.ok;
  console.log(
    `  ${String((bytes / MB).toFixed(0)).padStart(5)} MB  ${ok ? 'accepted' : `REJECTED (${res.status}) ${text.slice(0, 90)}`}`,
  );
  if (ok) {
    await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${KEY}` },
    }).catch(() => {});
  }
  return ok;
}

async function main() {
  console.log(`Probing the real upload ceiling for "${bucket}" with actual bytes.`);
  console.log('(Each probe transfers its full size — a high ceiling takes a while.)\n');

  // Coarse ladder first. Stopping at the first rejection bounds the answer without ever uploading
  // more than one size past it, which matters when each step is hundreds of megabytes.
  const ladder = [10, 50, 100, 250, 500, 1024];
  let lastOk = 0;
  let firstBad = null;

  for (const mb of ladder) {
    if (await accepts(mb * MB)) lastOk = mb * MB;
    else {
      firstBad = mb * MB;
      break;
    }
  }

  if (lastOk === 0) {
    console.log('\nNothing was accepted — this is not a size limit. Check the key, the bucket name');
    console.log('and (for a video bucket) the MIME allowlist.');
    process.exit(1);
  }

  // The exact boundary matters for one reason only: the app cap is set from it, and setting the app
  // cap one byte high is the whole defect this script exists to prevent. Two refinement steps get
  // close enough to choose a safe round number without doubling the transfer time.
  if (firstBad) {
    for (let i = 0; i < 2; i += 1) {
      const mid = Math.floor((lastOk + firstBad) / 2 / MB) * MB;
      if (mid <= lastOk || mid >= firstBad) break;
      if (await accepts(mid)) lastOk = mid;
      else firstBad = mid;
    }
  }

  const provenMb = Math.floor(lastOk / MB);
  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`Proven accepted: ${provenMb} MB (${lastOk} bytes)`);
  if (firstBad) console.log(`First refused:   ${Math.floor(firstBad / MB)} MB`);
  else console.log(`Nothing in the ladder was refused — the ceiling is at or above ${provenMb} MB.`);
  console.log(`\nSet the app cap at or below the proven number:`);
  console.log(`  NEXT_PUBLIC_MAX_UPLOAD_BYTES=${lastOk}`);
  console.log(`──────────────────────────────────────────────────────────────`);

  if (expectMb) {
    const want = Number(expectMb) * MB;
    if (lastOk < want) {
      console.error(`\nFAIL — expected at least ${expectMb} MB, storage accepted ${provenMb} MB.`);
      console.error('Raise it in the dashboard: Storage → Settings → Upload file size limit.');
      process.exit(1);
    }
    console.log(`\nOK — at least ${expectMb} MB, as required.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
