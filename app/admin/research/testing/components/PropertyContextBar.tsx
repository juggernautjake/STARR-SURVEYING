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
};

// ── Test fixtures ────────────────────────────────────────────────────────────

const TEST_FIXTURES = [
  {
    label: 'Custom (blank)',
    ...DEFAULT_CONTEXT,
  },
  {
    label: 'Residential — Belton',
    projectId: '',
    propertyId: 'R12345',
    address: '123 Main St, Belton, TX 76513',
    county: 'Bell',
    state: 'TX',
    lat: '31.0561',
    lon: '-97.4642',
    ownerName: '',
    subdivisionName: '',
    instrumentNumbers: '',
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

  const handleFixture = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fixture = TEST_FIXTURES[Number(e.target.value)];
    if (fixture) {
      setContext({ ...fixture } as PropertyContext);
    }
  };

  const handleLoadProject = async () => {
    if (!context.projectId) return;
    setLoadingProject(true);
    try {
      const res = await fetch(`/api/admin/research/${context.projectId}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.project;
        setContext({
          ...context,
          propertyId: p.parcel_id || '',
          address: p.property_address || '',
          county: p.county || 'Bell',
          state: p.state || 'TX',
          lat: p.lat?.toString() || '',
          lon: p.lon?.toString() || '',
          ownerName: p.owner_name || '',
        });
      }
    } catch {
      // silently fail
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
              <select onChange={handleFixture} defaultValue="">
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
                  onChange={(e) => updateField('projectId', e.target.value)}
                />
                <button
                  className="property-context-bar__load-btn"
                  onClick={handleLoadProject}
                  disabled={!context.projectId || loadingProject}
                >
                  {loadingProject ? '...' : 'Load'}
                </button>
              </div>
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
