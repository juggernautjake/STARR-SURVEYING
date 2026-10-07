'use client';
// /admin/scan-setup — get a computer ready to scan into Starr Surveying.
//
// Owner, 2026-10-06: "IF there are none, then the scanning button will just open a modal that tells
// the user what they need to do to set up scanning. As soon as the computer senses the user has made
// the changes and met the requirements for scanning, the scanning options will become available."
//
// The Scan pop-up links here when the Starr Scan helper is not running. One download per OS (built by
// .github/workflows/scan-helper-release.yml), the few steps to install it, and a live check that turns
// green the moment the helper answers — the same check the pop-up makes.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Loader2, Printer, Wifi, AppWindow } from 'lucide-react';
import { helperStatus, clientOs, type HelperStatus } from '@/lib/scan/helper-client';
import { SCAN_HELPER_DOWNLOADS } from '@/lib/scan/downloads';
import './scan-setup.css';

export default function ScanSetupPage(): React.ReactElement {
  const os = useMemo(() => clientOs(), []);
  const [status, setStatus] = useState<HelperStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => { const s = await helperStatus(); if (alive) { setStatus(s); setChecked(true); } };
    void tick();
    const t = window.setInterval(() => { void tick(); }, 3000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const mine = SCAN_HELPER_DOWNLOADS.find((d) => d.os === os) ?? null;
  const others = SCAN_HELPER_DOWNLOADS.filter((d) => d !== mine);
  const devices = (status?.sources ?? []).filter((s) => s.kind === 'device');
  const apps = (status?.sources ?? []).filter((s) => s.kind === 'app');

  return (
    <div className="ssu">
      <h1 className="ssu__title">Set up scanning</h1>
      <p className="ssu__sub">
        The Scan button on any job, project or folder uses the scanners and scanning apps on your
        computer. Web pages are not allowed to reach a scanner on their own, so each computer that
        scans needs the small Starr Scan helper. It runs quietly in the background, needs no account,
        and never sends anything anywhere — your scans are saved only when you confirm them.
      </p>

      <section className={`ssu__status${status ? ' ssu__status--ok' : ''}`} aria-live="polite" data-testid="ssu-status">
        {!checked ? (
          <p><Loader2 size={18} className="ssu__spin" aria-hidden="true" /> Checking this computer…</p>
        ) : status ? (
          <>
            <p><CheckCircle2 size={20} aria-hidden="true" /> <b>Starr Scan {status.version} is running on this computer.</b></p>
            <ul className="ssu__found">
              {devices.map((d) => <li key={d.id}>{d.network ? <Wifi size={16} aria-hidden="true" /> : <Printer size={16} aria-hidden="true" />} {d.name}</li>)}
              {apps.map((a) => <li key={a.id}><AppWindow size={16} aria-hidden="true" /> {a.name}</li>)}
              {(status.installed ?? []).filter((i) => !i.present).map((i) => <li key={i.name} className="ssu__asleep"><Printer size={16} aria-hidden="true" /> {i.name} — installed, switched off</li>)}
            </ul>
            {!devices.length && !apps.length ? <p className="ssu__muted">No scanner is switched on yet. Turn it on (or feed it a page) and it appears here.</p> : null}
            <p className="ssu__muted">You are ready. Go to any job&rsquo;s Files tab, or <Link href="/admin/files">Files</Link>, and press <b>Scan</b>.</p>
          </>
        ) : (
          <p><Loader2 size={18} className="ssu__spin" aria-hidden="true" /> Not running on this computer yet — this turns green on its own once it is.</p>
        )}
      </section>

      {os === 'ios' || os === 'android' ? (
        <section className="ssu__card">
          <h2 className="ssu__h2">On a phone or tablet</h2>
          <p>No helper is needed: the Scan button uses the camera. Take a photo of each page, check them, and save.</p>
        </section>
      ) : os === 'chromeos' ? (
        <section className="ssu__card">
          <h2 className="ssu__h2">On a Chromebook</h2>
          <p>Chromebooks cannot run the helper. Scan with the built-in Scan app, then use <b>Scan › Upload a scan you already have</b>.</p>
        </section>
      ) : (
        <>
          {mine ? (
            <section className="ssu__card">
              <h2 className="ssu__h2">1. Download for {mine.label}</h2>
              <a className="ssu__btn ssu__btn--primary" href={mine.url} data-testid="ssu-download"><Download size={18} aria-hidden="true" /> Download Starr Scan for {mine.label}</a>
              <h2 className="ssu__h2">2. Install it</h2>
              <ol className="ssu__steps">{mine.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <h2 className="ssu__h2">3. Connect your scanner</h2>
              <p>Plug it in with USB or put it on the same Wi-Fi, and switch it on. If your computer&rsquo;s own scan app can use it, so can this website. Network scanners from Brother, Canon, Epson, HP and most others are found automatically with no driver.</p>
            </section>
          ) : null}
          <details className="ssu__card">
            <summary>Other computers</summary>
            {others.map((d) => (
              <div key={d.os} className="ssu__other">
                <a className="ssu__btn" href={d.url}><Download size={16} aria-hidden="true" /> {d.label}</a>
                <ol className="ssu__steps">{d.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            ))}
          </details>
          <details className="ssu__card">
            <summary>Scanners the helper can use</summary>
            <ul className="ssu__list">
              <li><b>Windows:</b> every scanner Windows Scan can use (WIA), network scanners (eSCL/AirScan), and TWAIN scanners when the free NAPS2 is installed.</li>
              <li><b>Mac:</b> network scanners (eSCL/AirScan — most Wi-Fi scanners), plus USB scanners through NAPS2 (Image Capture and TWAIN).</li>
              <li><b>Linux:</b> USB scanners through SANE (<code>scanimage</code>), network scanners (eSCL), and NAPS2.</li>
              <li><b>Any scanning app</b> — Brother iPrint&amp;Scan, Epson Scan, HP Scan, ScanSnap, VueScan, NAPS2, Image Capture, Windows Scan and more: the Scan button opens it, and whatever it saves (into Documents › Starr Scans or its usual folder) appears for you to check and save.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
