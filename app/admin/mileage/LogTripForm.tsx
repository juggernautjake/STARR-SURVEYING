'use client';
// app/admin/mileage/LogTripForm.tsx
//
// C0b3b of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner, 2026-08-15: *"I just want it so that there is a manual capture… put in the starting
// address and the job address and the distance will be calculated and then that will use the miles
// per gallon to calculate the cost as well. So all mileage tracking will just be manually entered
// for each job/trip."*
//
// ── WHY THIS SITS ON /admin/mileage ─────────────────────────────────────────────────────────────
//
// The mileage-tracker hub widget has said "Log a trip →" since it shipped, pointing here. This page
// was a read-only report of GPS-derived days, so the link went somewhere you could not log a trip.
// (It previously pointed at `/admin/me?tab=mileage`, which silently reloaded the Hub — fixed in
// 2026-08 to point here, at a page that still had no form.) Putting capture here makes the CTA true
// and gives mileage a home outside Work Mode, which is being retired.
//
// ── THE DISTANCE FIELD IS TYPED TODAY, ON PURPOSE ───────────────────────────────────────────────
//
// The address→address lookup (C0b1) needs a maps provider with an API key and billing attached, and
// that is owner-gated. Blocking capture on it would leave the surveyor with no way to record a trip
// at all — which is the state this feature has actually been in. So the addresses are recorded now
// and the distance is typed; when the provider lands, it fills this field and the POST starts
// sending `distanceSource: 'lookup'` instead of 'typed'. Nothing else about the form changes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';
import { estimateTripFuel } from '@/lib/mileage/fuel';
import { MAX_REASONABLE_DAILY_MILES } from '@/lib/mileage/odometer';

interface VehicleOption { id: string; name: string; mpg: number | null }
interface JobOption { id: string; label: string }

const today = () => new Date().toISOString().slice(0, 10);

export default function LogTripForm({ onLogged }: { onLogged?: () => void }) {
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [distance, setDistance] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [jobId, setJobId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [fuelPriceCents, setFuelPriceCents] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Vehicles carry the mpg the fuel estimate needs, so the preview can be computed here rather than
  // round-tripping to the server on every keystroke.
  useEffect(() => {
    let live = true;
    fetch('/api/admin/vehicles')
      .then((r) => (r.ok ? r.json() : { vehicles: [] }))
      .then((j) => {
        if (!live) return;
        const list = (j.vehicles ?? []) as Array<{ id: string; name: string; mpg: number | null; active?: boolean }>;
        setVehicles(list.filter((v) => v.active !== false).map((v) => ({ id: v.id, name: v.name, mpg: v.mpg })));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/jobs?limit=200')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((j) => {
        if (!live) return;
        const list = (j.jobs ?? j ?? []) as Array<Record<string, unknown>>;
        setJobs(
          list
            .filter((x) => typeof x.id === 'string')
            .map((x) => ({
              id: x.id as string,
              label: [x.job_number, x.title ?? x.name].filter(Boolean).join(' — ') || String(x.id).slice(0, 8),
            })),
        );
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // The org fuel price. Absent settings is not an error — it means no price is configured, and the
  // form then shows the reimbursement alone rather than a fabricated cost.
  useEffect(() => {
    let live = true;
    fetch('/api/admin/settings')
      .then((r) => (r.ok ? r.json() : { settings: {} }))
      .then((j) => {
        if (!live) return;
        const raw = (j.settings as { mileage?: { fuelPriceCents?: unknown } } | undefined)?.mileage?.fuelPriceCents;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) setFuelPriceCents(raw);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const miles = Number(distance);
  const milesValid = distance !== '' && Number.isFinite(miles) && miles >= 0 && miles <= MAX_REASONABLE_DAILY_MILES;

  // The SAME helper the API uses, so what the surveyor is shown and what is stored cannot diverge —
  // the failure this repo has shipped before is a screen promising one figure and a row holding
  // another.
  const preview = useMemo(() => {
    if (!milesValid) return null;
    const reimbursement = miles * IRS_BUSINESS_RATE_2025;
    const fuel = estimateTripFuel(miles, vehicle?.mpg ?? null, fuelPriceCents);
    return { reimbursement, fuel };
  }, [milesValid, miles, vehicle, fuelPriceCents]);

  const canSave = milesValid && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/mileage/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance: miles,
          distanceSource: 'typed',
          startAddress: startAddress.trim() || undefined,
          endAddress: endAddress.trim() || undefined,
          entryDate,
          jobId: jobId || undefined,
          vehicleId: vehicleId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: j.error ?? 'Could not save the trip.' });
        return;
      }
      const fuelPart = j.fuel ? ` · fuel $${(j.fuel.costCents / 100).toFixed(2)}` : '';
      setResult({ ok: true, message: `Logged ${j.miles} mi · $${Number(j.reimbursement).toFixed(2)} reimbursement${fuelPart}.` });
      setStartAddress(''); setEndAddress(''); setDistance(''); setNotes('');
      onLogged?.();
    } catch {
      setResult({ ok: false, message: 'Network error — the trip was not saved.' });
    } finally {
      setSaving(false);
    }
  }, [canSave, miles, startAddress, endAddress, entryDate, jobId, vehicleId, notes, onLogged]);

  return (
    <section style={s.card} aria-labelledby="log-trip-heading">
      <div style={s.cardHead}>
        <h2 id="log-trip-heading" style={s.h2}>Log a trip</h2>
        <p style={s.hint}>
          Manually record one trip. Distance is entered by hand today; the addresses are stored so it
          can be calculated automatically once the maps lookup is switched on.
        </p>
      </div>

      <div style={s.grid}>
        <label style={s.field}>
          <span style={s.label}>Starting address</span>
          <input type="text" value={startAddress} onChange={(e) => setStartAddress(e.target.value)}
            placeholder="Office, or 100 Main St" style={s.input} maxLength={300} />
        </label>
        <label style={s.field}>
          <span style={s.label}>Job address</span>
          <input type="text" value={endAddress} onChange={(e) => setEndAddress(e.target.value)}
            placeholder="Where the work was" style={s.input} maxLength={300} />
        </label>

        <label style={s.field}>
          <span style={s.label}>Distance (miles)</span>
          <input type="number" value={distance} onChange={(e) => setDistance(e.target.value)}
            placeholder="42.5" min={0} max={MAX_REASONABLE_DAILY_MILES} step="0.1" style={s.input}
            aria-describedby="trip-distance-hint" />
          <span id="trip-distance-hint" style={s.hintSm}>Round trip? Enter the total driven.</span>
        </label>
        <label style={s.field}>
          <span style={s.label}>Date</span>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
            style={s.input} max={today()} />
        </label>

        <label style={s.field}>
          <span style={s.label}>Job (optional)</span>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={s.input}>
            <option value="">Not job-specific</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </label>
        <label style={s.field}>
          <span style={s.label}>Vehicle (optional)</span>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={s.input}>
            <option value="">No vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.mpg != null ? ` · ${v.mpg} mpg` : ''}</option>
            ))}
          </select>
          {vehicleId && vehicle?.mpg == null && (
            <span style={s.hintSm}>
              No mpg on file for this vehicle — add one on the Vehicles page to see fuel cost.
            </span>
          )}
        </label>

        <label style={{ ...s.field, gridColumn: '1 / -1' }}>
          <span style={s.label}>Notes (optional)</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth recording about the trip" style={s.input} maxLength={500} />
        </label>
      </div>

      <div style={s.previewRow} aria-live="polite">
        {preview ? (
          <>
            <span style={s.previewFigure}>
              ${preview.reimbursement.toFixed(2)}
              <span style={s.previewLabel}> reimbursement</span>
            </span>
            {preview.fuel ? (
              <span style={s.previewFigure}>
                ${(preview.fuel.fuelCostCents / 100).toFixed(2)}
                <span style={s.previewLabel}> fuel · {preview.fuel.gallons} gal</span>
              </span>
            ) : (
              // Deliberately not "$0.00": an unknown mpg or missing fuel price means we cannot
              // estimate, which is a different statement from "this trip was free".
              <span style={s.previewLabel}>
                {fuelPriceCents == null ? 'No fuel price configured' : 'Pick a vehicle with an mpg for fuel cost'}
              </span>
            )}
          </>
        ) : (
          <span style={s.previewLabel}>Enter a distance to see the reimbursement and fuel cost.</span>
        )}
      </div>

      <div style={s.actions}>
        <button type="button" onClick={save} disabled={!canSave} style={{ ...s.btn, opacity: canSave ? 1 : 0.55 }}>
          {saving ? 'Saving…' : 'Log this trip'}
        </button>
        {result && (
          <span role="status" style={{ ...s.result, color: result.ok ? '#0F7B4F' : '#B42318' }}>
            {result.message}
          </span>
        )}
      </div>
    </section>
  );
}

// Heights come from the shared tokens so the fields line up with the buttons beside them —
// docs/admin-styling-contract.md, and the reason /admin/learn's builder ran four field heights.
const s: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--theme-border, #E2E5EB)',
    borderRadius: 10,
    padding: 16,
    background: 'var(--theme-bg-surface, #FFF)',
    marginBottom: 20,
    display: 'grid',
    gap: 12,
  },
  cardHead: { display: 'grid', gap: 4 },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--theme-fg-primary, #101828)' },
  hint: { margin: 0, fontSize: 12, color: 'var(--theme-fg-secondary, #6B7280)', lineHeight: 1.5 },
  hintSm: { fontSize: 11, color: 'var(--theme-fg-secondary, #8A93A2)', marginTop: 2, lineHeight: 1.4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 },
  field: { display: 'grid', gap: 4, minWidth: 0 },
  label: { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    height: 'var(--input-height, 40px)',
    boxSizing: 'border-box',
    padding: '0 10px',
    border: '1px solid var(--theme-border, #E2E5EB)',
    borderRadius: 8,
    fontSize: 14,
    width: '100%',
    maxWidth: '100%',
    background: 'var(--theme-bg-surface, #FFF)',
    color: 'var(--theme-fg-primary, #101828)',
  },
  previewRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 16,
    minHeight: 28,
    paddingTop: 4,
    borderTop: '1px solid var(--theme-border, #E2E5EB)',
  },
  previewFigure: { fontSize: 20, fontWeight: 700, color: 'var(--theme-fg-primary, #101828)' },
  previewLabel: { fontSize: 12, fontWeight: 500, color: 'var(--theme-fg-secondary, #6B7280)' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  btn: {
    height: 'var(--button-height, 40px)',
    padding: '0 16px',
    borderRadius: 8,
    border: '1px solid var(--theme-accent, #1F6FEB)',
    background: 'var(--theme-accent, #1F6FEB)',
    color: '#FFF',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  result: { fontSize: 13, fontWeight: 500 },
};
