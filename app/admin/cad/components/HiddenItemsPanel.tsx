'use client';
// app/admin/cad/components/HiddenItemsPanel.tsx — Panel showing all hidden features and text labels
// Allows users to view attributes and unhide hidden items.

import { useState, useMemo } from 'react';
import {
  X, Eye, EyeOff, ChevronDown, ChevronRight, MapPin, Minus, Pentagon,
  Spline, Circle, Type, Search,
} from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { Feature, TextLabel } from '@/lib/cad/types';
import { inverseBearingDistance, formatBearing } from '@/lib/cad/geometry/bearing';
import { computeAreaFromPoints2D } from '@/lib/cad/geometry/area';

interface Props {
  open: boolean;
  onClose: () => void;
}

function featureIcon(type: string) {
  switch (type) {
    case 'POINT': return <MapPin size={11} />;
    case 'LINE': return <Minus size={11} />;
    case 'POLYLINE': return <Spline size={11} />;
    case 'POLYGON': return <Pentagon size={11} />;
    case 'ARC': return <Circle size={11} />;
    default: return <Minus size={11} />;
  }
}

function FeatureAttributes({ feature }: { feature: Feature }) {
  const store = useDrawingStore();
  const layer = store.document.layers[feature.layerId];

  const attrs: { label: string; value: string }[] = [];

  attrs.push({ label: 'Type', value: feature.type });
  attrs.push({ label: 'Layer', value: layer?.name ?? 'Unknown' });

  if (feature.type === 'POINT' && feature.geometry.point) {
    attrs.push({ label: 'N', value: feature.geometry.point.y.toFixed(3) });
    attrs.push({ label: 'E', value: feature.geometry.point.x.toFixed(3) });
    if (feature.properties.elevation != null) {
      attrs.push({ label: 'Elev', value: String(feature.properties.elevation) });
    }
    if (feature.properties.name) attrs.push({ label: 'Name', value: String(feature.properties.name) });
    if (feature.properties.description) attrs.push({ label: 'Desc', value: String(feature.properties.description) });
  }

  if (feature.type === 'LINE' && feature.geometry.start && feature.geometry.end) {
    const { azimuth, distance } = inverseBearingDistance(feature.geometry.start, feature.geometry.end);
    attrs.push({ label: 'Bearing', value: formatBearing(azimuth) });
    attrs.push({ label: 'Distance', value: `${distance.toFixed(3)} ft` });
  }

  if ((feature.type === 'POLYLINE' || feature.type === 'POLYGON') && feature.geometry.vertices) {
    const verts = feature.geometry.vertices;
    let totalDist = 0;
    const segCount = feature.type === 'POLYGON' ? verts.length : verts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const from = verts[i];
      const to = verts[(i + 1) % verts.length];
      totalDist += Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    }
    attrs.push({ label: feature.type === 'POLYGON' ? 'Perimeter' : 'Length', value: `${totalDist.toFixed(3)} ft` });
    attrs.push({ label: 'Vertices', value: String(verts.length) });

    if (feature.type === 'POLYGON' && verts.length >= 3) {
      const area = computeAreaFromPoints2D(verts);
      attrs.push({ label: 'Area', value: `${area.squareFeet.toFixed(2)} sq ft` });
      attrs.push({ label: 'Acres', value: area.acres.toFixed(4) });
    }
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
      {attrs.map((a, i) => (
        <div key={i} className="flex items-baseline gap-1">
          <span className="text-gray-500 shrink-0">{a.label}:</span>
          <span className="text-gray-300 truncate">{a.value}</span>
        </div>
      ))}
    </div>
  );
}

function HiddenFeatureRow({ feature }: { feature: Feature }) {
  const store = useDrawingStore();
  const layer = store.document.layers[feature.layerId];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-750 last:border-b-0" style={{ borderColor: '#2a2f3e' }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-750 transition-colors" style={{ '--tw-bg-opacity': '1' } as React.CSSProperties}>
        <button
          className="text-gray-500 hover:text-gray-300 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>

        <span className="text-gray-400">{featureIcon(feature.type)}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-300 truncate">
              {feature.properties.name || feature.properties.description || feature.type}
            </span>
            <span className="text-[9px] text-gray-600">#{feature.id.slice(0, 6)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: layer?.color ?? '#666' }}
            />
            <span className="text-[9px] text-gray-500 truncate">{layer?.name ?? 'Unknown'}</span>
          </div>
        </div>

        <button
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white border border-gray-600 hover:border-blue-500 transition-colors"
          onClick={() => store.unhideFeature(feature.id)}
          title="Unhide this feature"
        >
          <Eye size={10} />
          Show
        </button>
      </div>

      {expanded && (
        <div className="px-8 pb-2">
          <FeatureAttributes feature={feature} />
        </div>
      )}
    </div>
  );
}

function HiddenLabelRow({ feature, label }: { feature: Feature; label: TextLabel }) {
  const store = useDrawingStore();
  const layer = store.document.layers[feature.layerId];

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-750 border-b last:border-b-0" style={{ borderColor: '#2a2f3e' }}>
      <Type size={10} className="text-gray-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-gray-300 truncate">{label.text || label.kind}</div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-600">{label.kind}</span>
          <span className="text-[9px] text-gray-600">on</span>
          <span className="text-[9px] text-gray-500 truncate">
            {String(feature.properties.name || feature.type)} ({layer?.name ?? '?'})
          </span>
        </div>
      </div>
      <button
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white border border-gray-600 hover:border-blue-500 transition-colors"
        onClick={() => store.updateTextLabel(feature.id, label.id, { visible: true })}
        title="Show this label"
      >
        <Eye size={10} />
        Show
      </button>
    </div>
  );
}

export default function HiddenItemsPanel({ open, onClose }: Props) {
  const store = useDrawingStore();
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'features' | 'labels'>('features');

  const hiddenFeatures = useMemo(() => {
    return Object.values(store.document.features).filter((f) => f.hidden === true);
  }, [store.document.features]);

  const hiddenLabels = useMemo(() => {
    const result: { feature: Feature; label: TextLabel }[] = [];
    for (const feature of Object.values(store.document.features)) {
      for (const label of feature.textLabels ?? []) {
        if (!label.visible) {
          result.push({ feature, label });
        }
      }
    }
    return result;
  }, [store.document.features]);

  const filteredFeatures = useMemo(() => {
    if (!filter) return hiddenFeatures;
    const lower = filter.toLowerCase();
    return hiddenFeatures.filter((f) => {
      const name = String(f.properties.name ?? '').toLowerCase();
      const desc = String(f.properties.description ?? '').toLowerCase();
      const layer = store.document.layers[f.layerId]?.name?.toLowerCase() ?? '';
      return name.includes(lower) || desc.includes(lower) || layer.includes(lower) || f.type.toLowerCase().includes(lower);
    });
  }, [hiddenFeatures, filter, store.document.layers]);

  const filteredLabels = useMemo(() => {
    if (!filter) return hiddenLabels;
    const lower = filter.toLowerCase();
    return hiddenLabels.filter(({ feature, label }) => {
      return label.text.toLowerCase().includes(lower) || label.kind.toLowerCase().includes(lower)
        || String(feature.properties.name ?? '').toLowerCase().includes(lower);
    });
  }, [hiddenLabels, filter]);

  if (!open) return null;

  const totalHidden = hiddenFeatures.length + hiddenLabels.length;

  return (
    <div
      className="absolute left-0 top-0 z-40 bg-gray-800 border border-gray-600 rounded-r-lg shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 360, maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0" style={{ background: '#1a1f2e' }}>
        <div className="flex items-center gap-1.5">
          <EyeOff size={13} className="text-orange-400" />
          <div>
            <span className="text-[11px] font-semibold text-white">Hidden Items</span>
            <span className="text-[9px] text-gray-500 ml-1.5">{totalHidden} hidden</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-gray-700">
        <div className="flex items-center gap-1.5 bg-gray-700 rounded px-2 py-1 border border-gray-600">
          <Search size={11} className="text-gray-500 shrink-0" />
          <input
            type="text"
            placeholder="Filter hidden items..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-transparent text-white text-[10px] outline-none placeholder-gray-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 shrink-0">
        <button
          className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
            tab === 'features'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setTab('features')}
        >
          Features ({filteredFeatures.length})
        </button>
        <button
          className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
            tab === 'labels'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setTab('labels')}
        >
          Labels ({filteredLabels.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'features' && (
          <>
            {filteredFeatures.length === 0 ? (
              <div className="px-4 py-8 text-center text-[10px] text-gray-500">
                No hidden features.
              </div>
            ) : (
              filteredFeatures.map((f) => <HiddenFeatureRow key={f.id} feature={f} />)
            )}
          </>
        )}
        {tab === 'labels' && (
          <>
            {filteredLabels.length === 0 ? (
              <div className="px-4 py-8 text-center text-[10px] text-gray-500">
                No hidden labels.
              </div>
            ) : (
              filteredLabels.map(({ feature, label }) => (
                <HiddenLabelRow key={label.id} feature={feature} label={label} />
              ))
            )}
          </>
        )}
      </div>

      {/* Unhide all button */}
      {totalHidden > 0 && (
        <div className="border-t border-gray-700 p-2 shrink-0" style={{ background: '#1a1f2e' }}>
          <button
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white text-[10px] font-medium rounded border border-gray-600 hover:border-blue-500 transition-colors"
            onClick={() => {
              hiddenFeatures.forEach((f) => store.unhideFeature(f.id));
              hiddenLabels.forEach(({ feature, label }) =>
                store.updateTextLabel(feature.id, label.id, { visible: true }),
              );
            }}
          >
            <Eye size={11} />
            Unhide All ({totalHidden})
          </button>
        </div>
      )}
    </div>
  );
}
