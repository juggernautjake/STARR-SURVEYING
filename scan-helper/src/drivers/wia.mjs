// scan-helper/src/drivers/wia.mjs — Windows Image Acquisition: every scanner Windows Scan can use.
//
// WIA is built into Windows and is what the Windows Scan app talks to, so if a scanner works there
// it works here (verified 2026-10-06 on a Brother DS-640: listed as "Brother DS-640 #2", feeder,
// 100–1200 dpi, colour/gray/black-and-white). Driven through PowerShell's WIA COM objects, so the
// helper needs no native module and nothing to compile.
import path from 'node:path';
import { run, runStreaming, powershellArgs, OS } from '../util.mjs';

const PS = 'powershell.exe';

// WIA property ids (wiadef.h).
// Device: 3086 handling capabilities, 3088 handling select, 3096 pages.
// Item:   6146 intent (1 colour, 2 gray, 4 text/bw), 6147/6148 resolution, 6151/6152 extent.
const LIST = `
$ErrorActionPreference = 'Stop'
$out = @()
try { $dm = New-Object -ComObject WIA.DeviceManager } catch { '[]'; exit 0 }
foreach ($d in $dm.DeviceInfos) {
  if ($d.Type -ne 1) { continue }
  $o = [ordered]@{ id = $d.DeviceID; name = $d.Properties.Item('Name').Value; maker = ''; feeder = $false; flatbed = $true; duplex = $false; dpis = @() }
  try { $o.maker = $d.Properties.Item('Manufacturer').Value } catch {}
  try {
    $dev = $d.Connect()
    try { $cap = $dev.Properties.Item('Document Handling Capabilities').Value; $o.feeder = [bool]($cap -band 1); $o.flatbed = [bool]($cap -band 2); $o.duplex = [bool]($cap -band 4) } catch {}
    try { $p = $dev.Items.Item(1).Properties | Where-Object { $_.PropertyID -eq 6147 }; if ($p.SubType -eq 2) { $o.dpis = @($p.SubTypeValues | ForEach-Object { [int]$_ }) } elseif ($p.SubType -eq 1) { $o.dpis = @(100,150,200,300,600) | Where-Object { $_ -ge $p.SubTypeMin -and $_ -le $p.SubTypeMax } } } catch {}
  } catch { $o.offline = $true }
  $out += [pscustomobject]$o
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4
`;

/** Scanners WIA can see right now. A sleeping scanner is not listed until it wakes. */
export async function listWia() {
  if (OS !== 'win32') return [];
  const r = await run(PS, powershellArgs(LIST), { timeout: 30_000 });
  if (r.code !== 0) return [];
  try {
    const rows = JSON.parse(r.stdout.trim() || '[]');
    return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((d) => ({
      id: `wia:${d.id}`,
      kind: 'device',
      driver: 'wia',
      name: d.name,
      maker: d.maker || null,
      sources: [d.feeder ? 'feeder' : null, d.flatbed ? 'flatbed' : null, d.duplex ? 'duplex' : null].filter(Boolean),
      dpis: d.dpis?.length ? d.dpis : [150, 200, 300, 600],
      offline: Boolean(d.offline),
    }));
  } catch {
    return [];
  }
}

// Scanners Windows has a driver for, connected or not. A DS-640 powers itself off when idle and
// vanishes from WIA; this is what lets the page say "turn it on" rather than "no scanner found".
const INSTALLED = `
$rows = Get-PnpDevice -Class Image -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -and $_.FriendlyName -notmatch 'Camera|Webcam|iPhone|iPad|Android' } |
  Group-Object FriendlyName | ForEach-Object { [pscustomobject]@{ name = $_.Name; present = [bool]($_.Group | Where-Object { $_.Status -eq 'OK' }) } }
ConvertTo-Json -InputObject @($rows) -Compress
`;

/** Scanners with a Windows driver installed, and whether each is switched on right now. */
export async function installedWia() {
  if (OS !== 'win32') return [];
  const r = await run(PS, powershellArgs(INSTALLED), { timeout: 30_000 });
  try {
    const rows = JSON.parse(r.stdout.trim() || '[]');
    return (Array.isArray(rows) ? rows : [rows]).filter((x) => x && x.name);
  } catch {
    return [];
  }
}

function scanScript({ deviceId, source, dpi, color, outDir }) {
  const intent = color === 'gray' ? 2 : color === 'bw' ? 4 : 1;
  const handling = source === 'flatbed' ? 2 : source === 'duplex' ? 5 : 1;
  return `
$ErrorActionPreference = 'Stop'
$dm = New-Object -ComObject WIA.DeviceManager
$info = $dm.DeviceInfos | Where-Object { $_.DeviceID -eq '${deviceId.replace(/'/g, "''")}' } | Select-Object -First 1
if (-not $info) { Write-Output '{"error":"The scanner is not connected or is asleep. Turn it on and try again."}'; exit 2 }
$dev = $info.Connect()
function SetProp($props, $id, $value) { foreach ($p in $props) { if ($p.PropertyID -eq $id) { try { $p.Value = $value } catch {} } } }
SetProp $dev.Properties 3088 ${handling}
SetProp $dev.Properties 3096 1
$item = $dev.Items.Item(1)
SetProp $item.Properties 6146 ${intent}
SetProp $item.Properties 6147 ${dpi}
SetProp $item.Properties 6148 ${dpi}
foreach ($p in $item.Properties) { if (($p.PropertyID -eq 6151 -or $p.PropertyID -eq 6152) -and $p.SubType -eq 1) { try { $p.Value = $p.SubTypeMax } catch {} } }
$png = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
$n = 0
while ($true) {
  try {
    $img = $item.Transfer($png)
  } catch {
    $code = '{0:X8}' -f $_.Exception.HResult
    if ($n -gt 0 -and ($code -eq '80210003' -or $code -eq '8021000C')) { break }
    if ($code -eq '80210003') { Write-Output '{"error":"There is no paper in the feeder. Put the pages in and try again."}'; exit 3 }
    if ($code -eq '80210006') { Write-Output '{"error":"The scanner is busy. Wait a moment and try again."}'; exit 4 }
    Write-Output ('{"error":"The scan failed (WIA ' + $code + ')."}'); exit 5
  }
  $n++
  $file = Join-Path '${outDir.replace(/'/g, "''")}' ('page-{0:D3}.png' -f $n)
  if (Test-Path $file) { Remove-Item $file }
  $img.SaveFile($file)
  Write-Output ('{"page":' + $n + ',"file":"' + ($file -replace '\\\\','/') + '"}')
  if (${handling} -eq 2) { break }
}
Write-Output ('{"done":' + $n + '}')
`;
}

/** Scan with WIA. `onPage(path)` is called as each page lands; resolves when the feeder is empty. */
export async function scanWia(opts, onPage) {
  const deviceId = opts.sourceId.replace(/^wia:/, '');
  let error = null;
  let pages = 0;
  const r = await runStreaming(PS, powershellArgs(scanScript({ ...opts, deviceId })), (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.error) error = msg.error;
      if (msg.page) { pages += 1; onPage(path.normalize(msg.file)); }
    } catch { /* PowerShell noise */ }
  });
  if (error) throw new Error(error);
  if (r.code !== 0 && pages === 0) throw new Error(r.stderr?.trim().split(/\r?\n/).pop() || 'The scan failed.');
  return pages;
}
