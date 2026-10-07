'use client';
// app/admin/components/scan/ScanDialog.tsx — scan a document into Starr Surveying.
//
// Owner, 2026-10-06:
//   "I want a button that is just for scanning a document, then it opens up a menu that allows us to
//    select what app we wanna use to scan with or what device if possible … it will be programmed to
//    directly upload it to the selected file location with the chosen file extension."
//   "It should automatically sense what scanning options are available. IF there are none, then the
//    scanning button will just open a modal that tells the user what they need to do … As soon as the
//    computer senses the user has made the changes … the scanning options will become available."
//   "Then we should get a preview of the scan, and then we can confirm it to save it to the folder."
//   "If we are already in a project or job … the current folder is the one that the files should
//    default to, unless otherwise specified."
//
// So: pick a scanner or app (found live by the Starr Scan helper, lib/scan/helper-client.ts) — or the
// phone camera, or a file another app made — scan, preview every page (turn, drop, reorder, add more),
// name it, choose the format, and confirm. Confirming hands the finished file(s) to the ordinary upload
// pop-up, opened on the folder the person is in, which files them exactly like any other upload.
import './ScanDialog.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ScanLine, Printer, AppWindow, Camera, Upload, RotateCw, Trash2, ChevronLeft, ChevronRight, Loader2, Wifi, Plus, Download, Check,
} from 'lucide-react';
import {
  helperStatus, startScan, launchApp, getJob, finishJob, discardJob, fetchPage, clientOs, localNetworkPermission, clientBrowser,
  type HelperStatus, type ScanSource, type PaperSource, type ScanColor, type ScanJob,
} from '@/lib/scan/helper-client';
import { adviseSetup } from '@/lib/scan/setup';
import { buildScanFiles, defaultScanName, SCAN_FORMATS, type PreviewPage, type ScanFormat } from '@/lib/scan/build-output';
import { trimScannedPage } from '@/lib/scan/trim';

export interface ScanDialogProps {
  open: boolean;
  onClose: () => void;
  /** Where the scan will be saved, for the sentence on the confirm button ("Save to Photos"). */
  destinationLabel?: string | null;
  /** The finished file(s): the caller opens the upload pop-up on the current folder with them. */
  onConfirm: (files: File[]) => void;
  /**
   * 'receipts' (owner, 2026-10-07: "I also want the scanning to work for the receipts too"): every
   * page becomes its own JPG — one receipt each — so the receipt queue reads, checks and files them
   * exactly like photographs. No format or name to choose.
   */
  mode?: 'document' | 'receipts';
}

interface Page extends PreviewPage { key: string; url: string }

type Step = 'pick' | 'settings' | 'scanning' | 'app' | 'preview' | 'building';

const POLL_MS = 3000;
let keySeq = 0;

export default function ScanDialog({ open, onClose, destinationLabel, onConfirm, mode = 'document' }: ScanDialogProps): React.ReactElement | null {
  const [status, setStatus] = useState<HelperStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('unsupported');
  const [step, setStep] = useState<Step>('pick');
  const [source, setSource] = useState<ScanSource | null>(null);
  const [paper, setPaper] = useState<PaperSource>('feeder');
  const [color, setColor] = useState<ScanColor>('color');
  const [dpi, setDpi] = useState(300);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [name, setName] = useState(defaultScanName());
  const [format, setFormat] = useState<ScanFormat>('pdf');
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(new Set<string>());
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const os = useMemo(() => clientOs(), []);
  const mobile = os === 'ios' || os === 'android';
  const receipts = mode === 'receipts';

  // ── live detection while the picker is showing ──
  useEffect(() => {
    if (!open || mobile || step !== 'pick') return;
    let alive = true;
    const tick = async () => {
      const [s, perm] = await Promise.all([helperStatus(), localNetworkPermission()]);
      if (!alive) return;
      setStatus(s);
      setPermission(perm);
      setChecked(true);
    };
    void tick();
    const t = window.setInterval(() => { void tick(); }, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [open, mobile, step]);

  // ── follow a running scan or app job, pulling pages in as they land ──
  useEffect(() => {
    if (!job || (step !== 'scanning' && step !== 'app')) return;
    let alive = true;
    const t = window.setInterval(async () => {
      try {
        const j = await getJob(job.id);
        if (!alive) return;
        setJob(j);
        for (const p of j.pages) {
          const k = `${j.id}:${p.n}`;
          if (fetched.current.has(k)) continue;
          fetched.current.add(k);
          // Device scans: cut off the blank paper a sheet feeder scans past the end of the page
          // (lib/scan/trim.ts). App scans are the app's own output and are left as saved.
          const raw = await fetchPage(j.id, p.n);
          const blob = j.kind === 'device' ? await trimScannedPage(raw) : raw;
          setPages((cur) => [...cur, { key: `p${++keySeq}`, blob, url: URL.createObjectURL(blob), rotate: 0, dpi }]);
        }
        if (j.state === 'error') { setError(j.error ?? 'The scan failed.'); setStep(pagesRef.current.length ? 'preview' : 'settings'); }
        if (j.state === 'done' && step === 'scanning') setStep('preview');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Lost touch with the scanner helper.');
      }
    }, 1000);
    return () => { alive = false; window.clearInterval(t); };
  }, [job, step, dpi]);

  const reset = useCallback(() => {
    if (job) void discardJob(job.id);
    for (const p of pagesRef.current) URL.revokeObjectURL(p.url);
    fetched.current.clear();
    setPages([]); setJob(null); setSource(null); setError(null); setStep('pick');
    setName(defaultScanName()); setFormat('pdf');
  }, [job]);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'scanning' && step !== 'building') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, close]);

  if (!open) return null;

  const advice = adviseSetup(status, os, { permission, browser: clientBrowser() });
  const devices = (status?.sources ?? []).filter((s) => s.kind === 'device');
  const apps = (status?.sources ?? []).filter((s) => s.kind === 'app');
  // Installed but switched off, and not reachable another way: shown greyed out with how to wake it,
  // so a sleeping DS-640 reads as "turn it on" rather than as missing.
  const asleep = (status?.installed ?? []).filter((i) => !i.present && !devices.some((d) => d.name.toLowerCase().includes(i.name.toLowerCase())));

  function chooseDevice(s: ScanSource) {
    setSource(s);
    setError(null);
    const offered = s.sources?.length ? s.sources : ['feeder', 'flatbed'];
    setPaper(offered.includes('feeder') ? 'feeder' : (offered[0] as PaperSource));
    const dpis = s.dpis?.length ? s.dpis : [150, 200, 300, 600];
    setDpi(dpis.includes(300) ? 300 : dpis.reduce((a, b) => (Math.abs(b - 300) < Math.abs(a - 300) ? b : a)));
    setStep('settings');
  }

  async function runScan() {
    if (!source) return;
    setError(null);
    try {
      const j = await startScan({ sourceId: source.id, source: paper, dpi, color });
      setJob(j);
      setStep('scanning');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scan could not start.');
    }
  }

  async function openApp(s: ScanSource) {
    setSource(s);
    setError(null);
    try {
      const j = await launchApp(s.id);
      setJob(j);
      setStep('app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That app could not be opened.');
    }
  }

  async function finishApp() {
    if (job) await finishJob(job.id).catch(() => undefined);
    setStep(pages.length ? 'preview' : 'pick');
  }

  function addLocalFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (!files.length) return;
    setPages((cur) => [...cur, ...files.map((f) => ({ key: `p${++keySeq}`, blob: f, url: URL.createObjectURL(f), rotate: 0 as const, dpi: f.type.startsWith('image/') ? 200 : 72 }))]);
    if (!name || /^Scan \d/.test(name)) {
      const first = files[0].name.replace(/\.[^.]+$/, '');
      if (files.length === 1 && !/^(IMG|image|scan)[-_ ]?\d*$/i.test(first)) setName(first);
    }
    setStep('preview');
  }

  function turn(key: string) { setPages((cur) => cur.map((p) => (p.key === key ? { ...p, rotate: (((p.rotate + 1) % 4) as 0 | 1 | 2 | 3) } : p))); }
  function drop(key: string) { setPages((cur) => { const p = cur.find((x) => x.key === key); if (p) URL.revokeObjectURL(p.url); return cur.filter((x) => x.key !== key); }); }
  function move(key: string, by: -1 | 1) {
    setPages((cur) => {
      const i = cur.findIndex((p) => p.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function confirm() {
    setError(null);
    setStep('building');
    try {
      const files = await buildScanFiles(pages, receipts ? 'jpg' : format, receipts ? `Receipt scan ${defaultScanName().slice(5)}` : name);
      if (job) void discardJob(job.id);
      for (const p of pages) URL.revokeObjectURL(p.url);
      fetched.current.clear();
      setPages([]); setJob(null); setStep('pick'); setName(defaultScanName());
      onConfirm(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scan could not be prepared.');
      setStep('preview');
    }
  }

  const hidden = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addLocalFiles(e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.tif,.tiff" multiple hidden onChange={(e) => { addLocalFiles(e.target.files); e.target.value = ''; }} />
    </>
  );

  const alwaysOptions = (
    <div className="scan__always">
      <button type="button" className="scan__option" onClick={() => cameraRef.current?.click()} data-testid="scan-camera">
        <Camera size={20} aria-hidden="true" />
        <span><b>Scan with the camera</b><small>Take a photo of each page.</small></span>
      </button>
      <button type="button" className="scan__option" onClick={() => fileRef.current?.click()} data-testid="scan-file">
        <Upload size={20} aria-hidden="true" />
        <span><b>Upload a scan you already have</b><small>A PDF or image any scanning app saved.</small></span>
      </button>
    </div>
  );

  return (
    <div className="scan__overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && step !== 'scanning' && step !== 'building') close(); }}>
      <div className="scan__sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title" data-testid="scan-dialog">
        <header className="scan__header">
          <h2 id="scan-title" className="scan__title"><ScanLine size={20} aria-hidden="true" /> {receipts ? 'Scan receipts' : 'Scan a document'}</h2>
          <button type="button" className="scan__close" onClick={close} aria-label="Close" disabled={step === 'scanning' || step === 'building'}><X size={20} /></button>
        </header>

        <div className="scan__body">
          {error ? <p className="scan__error" role="alert">{error}</p> : null}

          {step === 'pick' && (
            <>
              {!mobile && !checked ? (
                <p className="scan__muted"><Loader2 size={16} className="scan__spin" aria-hidden="true" /> Looking for scanners on this computer…</p>
              ) : null}

              {!mobile && checked && (devices.length > 0 || apps.length > 0) ? (
                <>
                  {(devices.length > 0 || asleep.length > 0) && (
                    <section className="scan__group" aria-label="Scanners">
                      <h3 className="scan__h3">Scanners</h3>
                      {asleep.map((a) => (
                        <div key={a.name} className="scan__option scan__option--off" data-testid="scan-asleep">
                          <Printer size={20} aria-hidden="true" />
                          <span><b>{a.name}</b><small>Switched off. Turn it on or feed it a page — it appears here on its own.</small></span>
                        </div>
                      ))}
                      {devices.map((d) => (
                        <button key={d.id} type="button" className="scan__option" onClick={() => chooseDevice(d)} data-testid="scan-device">
                          {d.network ? <Wifi size={20} aria-hidden="true" /> : <Printer size={20} aria-hidden="true" />}
                          <span>
                            <b>{d.name}</b>
                            <small>{[d.network ? 'Network scanner' : 'Connected to this computer', d.via ? `via ${d.via}` : null, d.sources?.includes('feeder') ? 'feeder' : null, d.sources?.includes('flatbed') ? 'flatbed' : null].filter(Boolean).join(' · ')}</small>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                  {apps.length > 0 && (
                    <section className="scan__group" aria-label="Scanning apps">
                      <h3 className="scan__h3">Scan with an app</h3>
                      {apps.map((a) => (
                        <button key={a.id} type="button" className="scan__option" onClick={() => void openApp(a)} data-testid="scan-app">
                          <AppWindow size={20} aria-hidden="true" />
                          <span><b>{a.name}</b><small>Opens it; whatever you save appears here to check.</small></span>
                        </button>
                      ))}
                    </section>
                  )}
                </>
              ) : null}

              {!mobile && checked && advice.state !== 'ready' ? (
                <div className="scan__setup" data-testid="scan-setup">
                  <SetupSteps headline={advice.headline} steps={advice.steps} />
                  {advice.state === 'no-helper' && os !== 'chromeos' ? (
                    <a className="scan__btn scan__btn--primary" href="/admin/scan-setup" target="_blank" rel="noreferrer" data-testid="scan-download">
                      <Download size={16} aria-hidden="true" /> Get the Starr Scan helper
                    </a>
                  ) : null}
                  <p className="scan__muted scan__live"><Loader2 size={14} className="scan__spin" aria-hidden="true" /> Checking again every few seconds…</p>
                </div>
              ) : null}

              <h3 className="scan__h3">{mobile ? 'Scan' : 'Or, without a scanner'}</h3>
              {alwaysOptions}
            </>
          )}

          {step === 'settings' && source && (
            <section className="scan__settings" aria-label="Scan settings">
              <p className="scan__device"><Printer size={18} aria-hidden="true" /> {source.name}</p>
              <label className="scan__field">
                <span>Paper</span>
                <select value={paper} onChange={(e) => setPaper(e.target.value as PaperSource)} data-testid="scan-paper">
                  {(source.sources?.length ? source.sources : ['feeder', 'flatbed']).map((p) => (
                    <option key={p} value={p}>{p === 'feeder' ? 'Feeder (one side)' : p === 'duplex' ? 'Feeder (both sides)' : 'Glass (flatbed)'}</option>
                  ))}
                </select>
              </label>
              <label className="scan__field">
                <span>Colour</span>
                <select value={color} onChange={(e) => setColor(e.target.value as ScanColor)} data-testid="scan-color">
                  <option value="color">Colour</option>
                  <option value="gray">Grayscale</option>
                  <option value="bw">Black and white (smallest)</option>
                </select>
              </label>
              <label className="scan__field">
                <span>Resolution</span>
                <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} data-testid="scan-dpi">
                  {(source.dpis?.length ? source.dpis : [150, 200, 300, 600]).filter((d) => d >= 100 && d <= 1200).map((d) => (
                    <option key={d} value={d}>{d} dpi{d === 300 ? ' (recommended)' : d >= 600 ? ' (large files)' : ''}</option>
                  ))}
                </select>
              </label>
              <p className="scan__muted">{receipts
                ? (paper === 'flatbed' ? 'Put one receipt face down on the glass.' : 'Feed the receipts one after another, top edge first — each becomes its own receipt.')
                : (paper === 'flatbed' ? 'Put the page face down on the glass.' : 'Put the pages in the feeder, top edge first.')}</p>
            </section>
          )}

          {(step === 'scanning' || step === 'app') && (
            <section className="scan__progress" aria-live="polite">
              {step === 'scanning' ? (
                <p><Loader2 size={18} className="scan__spin" aria-hidden="true" /> Scanning… {pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'} so far` : 'waiting for the first page'}</p>
              ) : (
                <>
                  <p><b>{job?.appName ?? source?.name} is open.</b> Scan as you normally do and save the file. It appears here on its own.</p>
                  <p className="scan__muted">If the app asks where to save, choose <b>Documents › Starr Scans</b>.</p>
                  <p className="scan__muted">{pages.length ? `${pages.length} file${pages.length === 1 ? '' : 's'} picked up.` : 'Waiting for a saved scan…'}</p>
                </>
              )}
              <Thumbs pages={pages} />
            </section>
          )}

          {(step === 'preview' || step === 'building') && (
            <section className="scan__preview" aria-label="Preview">
              <p className="scan__muted">{receipts
                ? 'Each page is one receipt. Turn any that are sideways and remove the ones you do not want — the rest go into the receipt queue to be read.'
                : 'Check every page. Turn any that are sideways, remove the ones you do not want, and put them in order.'}</p>
              <ol className="scan__pages">
                {pages.map((p, i) => (
                  <li key={p.key} className="scan__page" data-testid="scan-page">
                    <div className="scan__pageimg">
                      {p.blob.type === 'application/pdf'
                        ? <div className="scan__pdf">PDF<br /><small>{Math.round(p.blob.size / 1024)} KB</small></div>
                        : <img src={p.url} alt={`Page ${i + 1}`} style={{ transform: `rotate(${p.rotate * 90}deg)` }} />}
                    </div>
                    <div className="scan__pagebar">
                      <span>Page {i + 1}</span>
                      <button type="button" onClick={() => move(p.key, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} earlier`}><ChevronLeft size={16} /></button>
                      <button type="button" onClick={() => move(p.key, 1)} disabled={i === pages.length - 1} aria-label={`Move page ${i + 1} later`}><ChevronRight size={16} /></button>
                      {p.blob.type !== 'application/pdf' && <button type="button" onClick={() => turn(p.key)} aria-label={`Turn page ${i + 1}`}><RotateCw size={16} /></button>}
                      <button type="button" onClick={() => drop(p.key)} aria-label={`Remove page ${i + 1}`}><Trash2 size={16} /></button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="scan__more">
                {source?.kind === 'device' && <button type="button" className="scan__btn" onClick={() => setStep('settings')}><Plus size={16} aria-hidden="true" /> Scan more pages</button>}
                <button type="button" className="scan__btn" onClick={() => cameraRef.current?.click()}><Camera size={16} aria-hidden="true" /> Add a photo</button>
              </div>
              {!receipts && (
              <label className="scan__field">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} data-testid="scan-name" />
              </label>
              )}
              {!receipts && (
              <div className="scan__field">
                <span>Save as</span>
                <div className="scan__formats" role="radiogroup" aria-label="File type">
                  {SCAN_FORMATS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className="scan__format" onClick={() => setFormat(f.id)} data-testid={`scan-format-${f.id}`}>{f.label}</button>
                  ))}
                </div>
                <small className="scan__muted">{SCAN_FORMATS.find((f) => f.id === format)?.hint}</small>
              </div>
              )}
            </section>
          )}
          {hidden}
        </div>

        <footer className="scan__footer">
          {step === 'settings' && (
            <>
              <button type="button" className="scan__btn" onClick={() => setStep(pages.length ? 'preview' : 'pick')}>Back</button>
              <button type="button" className="scan__btn scan__btn--primary" onClick={() => void runScan()} data-testid="scan-start"><ScanLine size={16} aria-hidden="true" /> Scan</button>
            </>
          )}
          {step === 'app' && (
            <>
              <button type="button" className="scan__btn" onClick={reset}>Cancel</button>
              <button type="button" className="scan__btn scan__btn--primary" onClick={() => void finishApp()} disabled={!pages.length}>Preview {pages.length || ''}</button>
            </>
          )}
          {(step === 'preview' || step === 'building') && (
            <>
              <button type="button" className="scan__btn" onClick={reset} disabled={step === 'building'}>Start over</button>
              <button type="button" className="scan__btn scan__btn--primary" onClick={() => void confirm()} disabled={!pages.length || step === 'building'} data-testid="scan-confirm">
                {step === 'building' ? <Loader2 size={16} className="scan__spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                {' '}{receipts
                  ? `Add ${pages.length} receipt${pages.length === 1 ? '' : 's'}`
                  : `Save ${pages.length} page${pages.length === 1 ? '' : 's'}${destinationLabel ? ` to ${destinationLabel}` : ''}`}
              </button>
            </>
          )}
          {step === 'pick' && <button type="button" className="scan__btn" onClick={close}>Close</button>}
        </footer>
      </div>
    </div>
  );
}

function SetupSteps({ headline, steps }: { headline: string | null; steps: Array<{ title: string; detail: string }> }) {
  return (
    <div className="scan__steps">
      {headline ? <p className="scan__headline">{headline}</p> : null}
      <ol>
        {steps.map((s) => <li key={s.title}><b>{s.title}</b><span>{s.detail}</span></li>)}
      </ol>
    </div>
  );
}

function Thumbs({ pages }: { pages: Page[] }) {
  if (!pages.length) return null;
  return (
    <div className="scan__thumbs">
      {pages.map((p, i) => (p.blob.type === 'application/pdf'
        ? <div key={p.key} className="scan__thumb scan__pdf">PDF</div>
        : <img key={p.key} className="scan__thumb" src={p.url} alt={`Page ${i + 1}`} />))}
    </div>
  );
}
