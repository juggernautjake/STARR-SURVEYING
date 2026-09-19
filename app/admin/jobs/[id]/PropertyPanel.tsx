'use client';

// app/admin/jobs/[id]/PropertyPanel.tsx — where the property IS, on the job page.
//
// Owner, 2026-09-19, with a screenshot: "please make this part of the page look better, and make it
// easier and more user friendly to edit things. Please make it so that if possible, the address
// gets autoformatted. There should be an address lookup with google to formalize the address if
// possible, but the user should still be able to enter an address that is not recognized by google
// too if they want, I just want there to be suggested addresses based on what the user types. Also,
// please make it so that we can add the lat/lon if we need to for a project. Please make sure that
// whenever we then click on the interactive map that it takes us to the location listed for the
// property automatically."
//
// ── WHAT WAS WRONG WITH THE OLD ONE ─────────────────────────────────────────────────────────────
//
// Nine identical rows of "Label: value", each its own click-to-edit, each saved on its own. Filling
// in a property meant nine clicks, nine saves, and typing the city, the state, the ZIP and the
// county by hand — all four of which Google already knows the moment you pick the street address.
// The screenshot shows the result: ROUND ROCK, WILLIAMSON, shouted in caps because they were typed
// rather than filled in.
//
// ── ONE LOOKUP FILLS SIX FIELDS, AND NEVER TRAPS YOU ────────────────────────────────────────────
//
// Picking a suggestion writes address, city, state, ZIP, county AND the coordinates in a single
// save. That last pair is the thing the map needs, and nothing was ever filling it.
//
// But the box is a TEXT BOX first and a lookup second. A rural Texas property is very often "TR 12,
// ABS 425, CR 200" — a description rather than an address, and Google will never recognise it. So
// anything typed is kept exactly as typed; the suggestions are an offer, never a gate. That is why
// this is not a `<select>` of Google's answers.
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Crosshair, Loader2, MapPin, Navigation, Pencil, X } from 'lucide-react';
import AddressAutocomplete from '@/app/admin/components/AddressAutocomplete';
import TexasCountyDatalist from '@/app/components/TexasCountyDatalist';
import { parseLatLng } from '@/lib/jobs/map-world';
import './PropertyPanel.css';

export interface PropertyFields {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  lot_number: string | null;
  subdivision: string | null;
  abstract_number: string | null;
  acreage: number | string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface Props {
  jobId: string;
  job: PropertyFields;
  /** Writes several fields in one request, and updates the page's copy of the job. */
  onSave: (patch: Record<string, string | number | null>) => Promise<void>;
  /** Where the navigation app should open — the page already knows how to build this. */
  mapsUrl: string | null;
}

/** The fields that are plain text, in the order somebody reads them. */
const DETAIL_FIELDS: Array<{ key: keyof PropertyFields; label: string; hint?: string; wide?: boolean }> = [
  { key: 'lot_number', label: 'Lot' },
  { key: 'subdivision', label: 'Subdivision', wide: true },
  { key: 'abstract_number', label: 'Abstract' },
  { key: 'acreage', label: 'Acreage', hint: 'Acres' },
];

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Tidy a typed address without changing what it says.
 *
 * "1501 LANCE LANE" becomes "1501 Lance Lane" — which is what the screenshot's data needed. It
 * deliberately does NOT expand or abbreviate anything: turning "Ln" into "Lane", or "County Road"
 * into "CR", is a guess about a legal description, and this is a surveying firm. Directionals and
 * the handful of genuinely-uppercase tokens are left alone.
 */
export function tidyAddress(raw: string): string {
  const keepUpper = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'US', 'FM', 'RR', 'CR', 'TR', 'ABS', 'PO', 'IH', 'SH']);
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      const bare = word.replace(/[^A-Za-z]/g, '');
      if (!bare) return word;
      if (keepUpper.has(bare.toUpperCase())) return word.toUpperCase();
      // A word that is already mixed case was typed deliberately — "McKinney", "LaSalle".
      if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Title case for a city or a county, for the same reason and with the same restraint. */
export function tidyPlace(raw: string): string {
  return tidyAddress(raw);
}

export default function PropertyPanel({ jobId, job, onSave, mapsUrl }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);

  const value = useCallback((key: keyof PropertyFields) => (
    editing ? (form[key] ?? str(job[key])) : str(job[key])
  ), [editing, form, job]);

  const set = (key: string, v: string) => setForm((f) => ({ ...f, [key]: v }));

  const hasCoords = useMemo(() => {
    const at = parseLatLng(`${str(job.latitude)}, ${str(job.longitude)}`);
    return at !== null;
  }, [job.latitude, job.longitude]);

  const begin = () => {
    setForm({
      address: str(job.address), city: str(job.city), state: str(job.state) || 'TX',
      zip: str(job.zip), county: str(job.county), lot_number: str(job.lot_number),
      subdivision: str(job.subdivision), abstract_number: str(job.abstract_number),
      acreage: str(job.acreage), latitude: str(job.latitude), longitude: str(job.longitude),
    });
    setError(null);
    setEditing(true);
  };

  const cancel = () => { setEditing(false); setForm({}); setError(null); };

  const commit = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string | number | null> = {};
      const put = (k: string, v: string) => { patch[k] = v.trim() === '' ? null : v.trim(); };

      put('address', tidyAddress(form.address ?? ''));
      put('city', tidyPlace(form.city ?? ''));
      patch.state = (form.state ?? '').trim().toUpperCase() || null;
      put('zip', form.zip ?? '');
      put('county', tidyPlace(form.county ?? ''));
      put('lot_number', form.lot_number ?? '');
      put('subdivision', form.subdivision ?? '');
      put('abstract_number', form.abstract_number ?? '');

      const acres = (form.acreage ?? '').trim();
      if (acres === '') patch.acreage = null;
      else {
        const n = Number(acres);
        if (!Number.isFinite(n)) throw new Error('Acreage has to be a number.');
        patch.acreage = n;
      }

      // Both or neither: half a coordinate is not a place, and storing one of them would put the
      // map somewhere off the coast of Africa the moment anything read the pair.
      const latRaw = (form.latitude ?? '').trim();
      const lngRaw = (form.longitude ?? '').trim();
      if (latRaw === '' && lngRaw === '') { patch.latitude = null; patch.longitude = null; }
      else {
        const at = parseLatLng(`${latRaw}, ${lngRaw}`);
        if (!at) throw new Error('That latitude and longitude is not a place on the earth.');
        patch.latitude = at.lat;
        patch.longitude = at.lng;
      }

      await onSave(patch);
      setEditing(false);
      setForm({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Fill the coordinates from the address that is already typed.
   *
   * For the property whose address Google DOES know but which was typed rather than picked — and
   * for the one where somebody edited the street number afterwards and the old pin is now wrong.
   */
  const locate = async () => {
    const line = [form.address, form.city, form.county, form.state || 'TX', form.zip]
      .map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
    if (!line) { setError('Type an address first.'); return; }
    if (typeof google === 'undefined' || !google.maps?.Geocoder) {
      setError('The address lookup is not available right now.');
      return;
    }
    setLocating(true);
    setError(null);
    try {
      const res = await new google.maps.Geocoder().geocode({ address: line, componentRestrictions: { country: 'us' } });
      const at = res.results?.[0]?.geometry?.location;
      if (!at) { setError('Google does not recognise that address. You can type the coordinates instead.'); return; }
      setForm((f) => ({ ...f, latitude: String(Math.round(at.lat() * 1e7) / 1e7), longitude: String(Math.round(at.lng() * 1e7) / 1e7) }));
    } catch {
      setError('Google does not recognise that address. You can type the coordinates instead.');
    } finally {
      setLocating(false);
    }
  };

  const oneLine = [job.address, job.city, job.state, job.zip].map((x) => str(x)).filter(Boolean).join(', ');

  return (
    <section className="prop" data-testid="job-property">
      <header className="prop__head">
        <h3 className="prop__title">Property</h3>
        <div className="prop__head-acts">
          {!editing && (
            <button type="button" className="prop__btn" data-testid="job-property-edit" onClick={begin}>
              <Pencil size={13} aria-hidden /> Edit
            </button>
          )}
          {editing && (
            <>
              <button type="button" className="prop__btn prop__btn--primary" disabled={saving} data-testid="job-property-save" onClick={() => void commit()}>
                {saving ? <Loader2 size={13} className="prop__spin" aria-hidden /> : <Check size={13} aria-hidden />} Save
              </button>
              <button type="button" className="prop__btn" disabled={saving} data-testid="job-property-cancel" onClick={cancel}>
                <X size={13} aria-hidden /> Cancel
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── WHERE IT IS, AND HOW TO GET THERE ─────────────────────────────────────────────────── */}
      {!editing && (
        <>
          <p className={`prop__address${oneLine ? '' : ' prop__address--empty'}`} data-testid="job-property-address">
            {oneLine || 'No address yet — press Edit to add one.'}
          </p>
          {str(job.county) && <p className="prop__county">{str(job.county)} County</p>}

          <div className="prop__links">
            {/* The owner's actual request: this button goes to the property, not to Belton. The map
                reads jobs.latitude/longitude, which is what the address lookup now fills in. */}
            <Link className="prop__btn prop__btn--primary" href={`/admin/map?job=${jobId}`} data-testid="job-property-map">
              <MapPin size={13} aria-hidden /> Interactive map
            </Link>
            {mapsUrl && (
              <a className="prop__btn" href={mapsUrl} target="_blank" rel="noopener noreferrer" title="Open this property in your navigation app">
                <Navigation size={13} aria-hidden /> Directions
              </a>
            )}
          </div>

          {!hasCoords && (
            <p className="prop__warn" data-testid="job-property-nocoords">
              No coordinates yet, so the map cannot open on this property. Press <strong>Edit</strong>, then
              pick the address from the suggestions — or type the latitude and longitude yourself.
            </p>
          )}

          <dl className="prop__grid">
            {DETAIL_FIELDS.map((f) => (
              <div key={String(f.key)} className={`prop__cell${f.wide ? ' prop__cell--wide' : ''}`}>
                <dt>{f.label}</dt>
                <dd>{str(job[f.key]) || <span className="prop__none">—</span>}</dd>
              </div>
            ))}
            <div className="prop__cell prop__cell--wide">
              <dt>Coordinates</dt>
              <dd>
                {hasCoords
                  ? <span className="prop__coords">{Number(job.latitude).toFixed(6)}, {Number(job.longitude).toFixed(6)}</span>
                  : <span className="prop__none">—</span>}
              </dd>
            </div>
          </dl>
        </>
      )}

      {/* ── EDITING ───────────────────────────────────────────────────────────────────────────── */}
      {editing && (
        <div className="prop__form">
          <div className="prop__field prop__field--wide">
            <label className="prop__label" htmlFor="prop-address">Address</label>
            {/* A TEXT BOX first, a lookup second. Rural Texas is full of "TR 12, ABS 425, CR 200" —
                a description rather than an address, which Google will never match. Anything typed
                is kept as typed; picking a suggestion just fills five other fields for free. */}
            <AddressAutocomplete
              id="prop-address"
              value={form.address ?? ''}
              onChange={(v) => set('address', v)}
              className="prop__input"
              placeholder="Start typing, or enter it however it reads on the deed"
              biasTexas
              onSelect={(d) => setForm((f) => ({
                ...f,
                address: d.address || f.address || '',
                city: d.city || f.city || '',
                state: d.state || f.state || 'TX',
                zip: d.zip || f.zip || '',
                county: d.county || f.county || '',
                latitude: d.latitude !== null ? String(d.latitude) : (f.latitude ?? ''),
                longitude: d.longitude !== null ? String(d.longitude) : (f.longitude ?? ''),
              }))}
            />
            <p className="prop__hint">Pick a suggestion to fill in the city, ZIP, county and coordinates. Or just type — anything you write is kept.</p>
          </div>

          <div className="prop__field">
            <label className="prop__label" htmlFor="prop-city">City</label>
            <input id="prop-city" className="prop__input" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} data-testid="prop-city" />
          </div>

          <div className="prop__field prop__field--narrow">
            <label className="prop__label" htmlFor="prop-state">State</label>
            <input id="prop-state" className="prop__input" maxLength={2} value={form.state ?? ''} onChange={(e) => set('state', e.target.value.toUpperCase())} data-testid="prop-state" />
          </div>

          <div className="prop__field prop__field--narrow">
            <label className="prop__label" htmlFor="prop-zip">ZIP</label>
            <input id="prop-zip" className="prop__input" inputMode="numeric" maxLength={10} value={form.zip ?? ''} onChange={(e) => set('zip', e.target.value)} data-testid="prop-zip" />
          </div>

          <div className="prop__field">
            <label className="prop__label" htmlFor="prop-county">County</label>
            {/* Every Texas county, type-ahead — the same list every public form uses. */}
            <input id="prop-county" className="prop__input" list="texas-counties" value={form.county ?? ''} onChange={(e) => set('county', e.target.value)} data-testid="prop-county" />
            <TexasCountyDatalist />
          </div>

          {DETAIL_FIELDS.map((f) => (
            <div key={String(f.key)} className={`prop__field${f.wide ? ' prop__field--wide' : ''}`}>
              <label className="prop__label" htmlFor={`prop-${String(f.key)}`}>{f.label}</label>
              <input
                id={`prop-${String(f.key)}`}
                className="prop__input"
                inputMode={f.key === 'acreage' ? 'decimal' : undefined}
                value={form[String(f.key)] ?? ''}
                onChange={(e) => set(String(f.key), e.target.value)}
                data-testid={`prop-${String(f.key)}`}
              />
            </div>
          ))}

          {/* ── COORDINATES ──────────────────────────────────────────────────────────────────── */}
          <div className="prop__field prop__field--wide prop__coordsrow">
            <span className="prop__label">Coordinates</span>
            <div className="prop__coordsgrid">
              <input
                className="prop__input"
                placeholder="Latitude"
                aria-label="Latitude"
                value={form.latitude ?? ''}
                onChange={(e) => set('latitude', e.target.value)}
                data-testid="prop-latitude"
                onPaste={(e) => {
                  // Somebody pasting "30.9589, -97.5252" into the latitude box means both, and
                  // splitting it by hand is a chore the page can do for them.
                  const at = parseLatLng(e.clipboardData.getData('text'));
                  if (!at) return;
                  e.preventDefault();
                  setForm((f) => ({ ...f, latitude: String(at.lat), longitude: String(at.lng) }));
                }}
              />
              <input
                className="prop__input"
                placeholder="Longitude"
                aria-label="Longitude"
                value={form.longitude ?? ''}
                onChange={(e) => set('longitude', e.target.value)}
                data-testid="prop-longitude"
              />
              <button type="button" className="prop__btn" disabled={locating} data-testid="prop-locate" onClick={() => void locate()}>
                {locating ? <Loader2 size={13} className="prop__spin" aria-hidden /> : <Crosshair size={13} aria-hidden />}
                Find from address
              </button>
            </div>
            <p className="prop__hint">
              This is what the interactive map opens on. Paste a pair into either box and both fill in;
              degrees-minutes-seconds works too.
            </p>
          </div>

          {error && <p className="prop__error" role="alert" data-testid="job-property-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
