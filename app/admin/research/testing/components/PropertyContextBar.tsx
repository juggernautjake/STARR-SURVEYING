// PropertyContextBar.tsx — Shared property inputs for the Testing Lab
'use client';

import { createContext, useCallback, useContext, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PropertyContext {
  projectId: string;
  propertyId: string;
  address: string;
  county: string;
  state: string;
  lat: string;
  lon: string;
  ownerName: string;
  subdivisionName: string;
  instrumentNumbers: string;
  /** Active git branch — forwarded to the worker so tests run against the right code. */
  branch: string;
}

const DEFAULT_CONTEXT: PropertyContext = {
  projectId: '',
  propertyId: '',
  address: '',
  county: 'Bell',
  state: 'TX',
  lat: '',
  lon: '',
  ownerName: '',
  subdivisionName: '',
  instrumentNumbers: '',
  branch: 'main',
};

// ── Test fixtures ────────────────────────────────────────────────────────────

const TEST_FIXTURES = [
  {
    label: 'Custom (blank)',
    ...DEFAULT_CONTEXT,
  },
  {
    label: 'Residential — Belton (FM 436)',
    projectId: '',
    propertyId: 'R060789',
    address: '3779 FM 436, Belton, TX 76513',
    county: 'Bell',
    state: 'TX',
    lat: '31.0561',
    lon: '-97.4642',
    ownerName: 'ASH FAMILY TRUST',
    subdivisionName: '',
    instrumentNumbers: '',
    branch: 'main',
  },
  {
    label: 'Commercial — Temple (Main St)',
    projectId: '',
    propertyId: 'C012345',
    address: '2910 S 31st St, Temple, TX 76502',
    county: 'Bell',
    state: 'TX',
    lat: '31.0891',
    lon: '-97.3427',
    ownerName: '',
    subdivisionName: '',
    instrumentNumbers: '',
    branch: 'main',
  },
  {
    label: 'Subdivision Lot — Killeen',
    projectId: '',
    propertyId: 'R099001',
    address: '4201 Clear Creek Rd, Killeen, TX 76549',
    county: 'Bell',
    state: 'TX',
    lat: '31.1171',
    lon: '-97.7278',
    ownerName: '',
    subdivisionName: 'CLEAR CREEK ESTATES',
    instrumentNumbers: '',
    branch: 'main',
  },
];

// ── Context ──────────────────────────────────────────────────────────────────

interface PropertyContextValue {
  context: PropertyContext;
  setContext: (ctx: PropertyContext) => void;
  updateField: (key: keyof PropertyContext, value: string) => void;
}

const PropertyCtx = createContext<PropertyContextValue>({
  context: DEFAULT_CONTEXT,
  setContext: () => {},
  updateField: () => {},
});

export function usePropertyContext() {
  return useContext(PropertyCtx);
}

export function PropertyContextProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<PropertyContext>(DEFAULT_CONTEXT);

  const updateField = useCallback((key: keyof PropertyContext, value: string) => {
    setContext((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <PropertyCtx.Provider value={{ context, setContext, updateField }}>
      {children}
    </PropertyCtx.Provider>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PropertyContextBar() {
  const { context, setContext, updateField } = usePropertyContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fixtureIndex, setFixtureIndex] = useState('');

  const handleFixture = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = e.target.value;
    setFixtureIndex(idx);
    const fixture = TEST_FIXTURES[Number(idx)];
    if (fixture) {
      // Preserve the active branch — fixtures should set property data only,
      // not silently reset the branch the user selected in BranchSelector.
      setContext((prev) => ({ ...fixture, branch: prev.branch } as PropertyContext));
    }
  };

  const handleLoadProject = async () => {
    if (!context.projectId) return;
    setLoadingProject(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/research/${context.projectId}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.project;
        // Use functional form to avoid discarding field changes made while
        // the request was in-flight (stale closure on `context`).
        setContext((prev) => ({
          ...prev,
          propertyId: p.parcel_id || '',
          address: p.property_address || '',
          county: p.county || 'Bell',
          state: p.state || 'TX',
          lat: p.lat?.toString() || '',
          lon: p.lon?.toString() || '',
          ownerName: p.owner_name || '',
          subdivisionName: p.subdivision_name || '',
        }));
        setFixtureIndex(''); // clear fixture selection after loading a project
      } else {
        const err = await res.json().catch(() => ({}));
        setLoadError(err?.error || `Project not found (${res.status})`);
      }
    } catch {
      setLoadError('Network error — could not load project');
    }
    setLoadingProject(false);
  };

  return (
    <div className="property-context-bar">
      <div
        className="property-context-bar__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="property-context-bar__title">
          Property Context
          {context.propertyId && (
            <span className="property-context-bar__summary">
              — {context.propertyId} {context.address && `| ${context.address}`}
            </span>
          )}
        </h3>
        <span className="property-context-bar__toggle">{isExpanded ? '▾' : '▸'}</span>
      </div>

      {isExpanded && (
        <div className="property-context-bar__body">
          {/* Quick-load fixture */}
          <div className="property-context-bar__row">
            <div className="property-context-bar__field property-context-bar__field--wide">
              <label>Quick Load</label>
              <select value={fixtureIndex} onChange={handleFixture}>
                <option value="" disabled>Select a test fixture...</option>
                {TEST_FIXTURES.map((f, i) => (
                  <option key={i} value={i}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="property-context-bar__field">
              <label>Project ID</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="UUID"
                  value={context.projectId}
                  onChange={(e) => { updateField('projectId', e.target.value); setLoadError(null); }}
                />
                <button
                  className="property-context-bar__load-btn"
                  onClick={handleLoadProject}
                  disabled={!context.projectId || loadingProject}
                >
                  {loadingProject ? '...' : 'Load'}
                </button>
              </div>
              {loadError && (
                <div className="property-context-bar__load-error">{loadError}</div>
              )}
            </div>
          </div>

          <div className="property-context-bar__row">
            <div className="property-context-bar__field">
              <label>Property ID *</label>
              <input
                type="text"
                placeholder="e.g. R12345"
                value={context.propertyId}
                onChange={(e) => updateField('propertyId', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field property-context-bar__field--wide">
              <label>Address</label>
              <input
                type="text"
                placeholder="e.g. 123 Main St, Belton, TX 76513"
                value={context.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>
          </div>

          <div className="property-context-bar__row">
            <div className="property-context-bar__field">
              <label>County</label>
              <input
                type="text"
                value={context.county}
                onChange={(e) => updateField('county', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field">
              <label>State</label>
              <input
                type="text"
                value={context.state}
                onChange={(e) => updateField('state', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field">
              <label>Latitude</label>
              <input
                type="text"
                placeholder="31.0561"
                value={context.lat}
                onChange={(e) => updateField('lat', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field">
              <label>Longitude</label>
              <input
                type="text"
                placeholder="-97.4642"
                value={context.lon}
                onChange={(e) => updateField('lon', e.target.value)}
              />
            </div>
          </div>

          <div className="property-context-bar__row">
            <div className="property-context-bar__field">
              <label>Owner Name</label>
              <input
                type="text"
                placeholder="Smith, John"
                value={context.ownerName}
                onChange={(e) => updateField('ownerName', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field">
              <label>Subdivision</label>
              <input
                type="text"
                value={context.subdivisionName}
                onChange={(e) => updateField('subdivisionName', e.target.value)}
              />
            </div>
            <div className="property-context-bar__field">
              <label>Instrument Numbers</label>
              <input
                type="text"
                placeholder="comma-separated"
                value={context.instrumentNumbers}
                onChange={(e) => updateField('instrumentNumbers', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
