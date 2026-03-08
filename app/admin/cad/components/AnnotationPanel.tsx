'use client';
// app/admin/cad/components/AnnotationPanel.tsx — Annotation management panel

import { useState } from 'react';
import { useAnnotationStore } from '@/lib/cad/store/annotation-store';
import { useDrawingStore } from '@/lib/cad/store';
import { DEFAULT_AUTO_ANNOTATE_CONFIG } from '@/lib/cad/labels/auto-annotate';
import type { AutoAnnotateConfig } from '@/lib/cad/labels/auto-annotate';
import type { AnnotationType } from '@/lib/cad/labels/annotation-types';

type Tab = 'annotations' | 'auto-annotate' | 'optimizer';

const TYPE_LABELS: Record<AnnotationType, string> = {
  BEARING_DISTANCE: 'B/D Dims',
  CURVE_DATA:       'Curve Data',
  MONUMENT_LABEL:   'Monument Labels',
  AREA_LABEL:       'Area Labels',
  TEXT:             'Text',
  LEADER:           'Leader',
};

export default function AnnotationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('annotations');
  const [config, setConfig] = useState<AutoAnnotateConfig>(DEFAULT_AUTO_ANNOTATE_CONFIG);

  const store = useAnnotationStore();
  const drawingStore = useDrawingStore();

  const annotations = store.getAllAnnotations();
  const result = store.optimizerResult;

  const countByType = (annotations.reduce<Partial<Record<AnnotationType, number>>>(
    (acc, a) => ({ ...acc, [a.type]: (acc[a.type as AnnotationType] ?? 0) + 1 }),
    {},
  )) as Partial<Record<AnnotationType, number>>;

  function handleAutoAnnotate() {
    const doc = drawingStore.document;
    const features = Object.values(doc.features);
    // Points and traverses come from their respective stores — pass empty arrays as fallback
    store.autoAnnotateAll(features, [], [], config);
  }

  function handleRunOptimizer() {
    const scale = drawingStore.document.settings.drawingScale;
    store.runOptimizer(scale);
  }

  const tabClass = (tab: Tab) =>
    `px-3 py-1.5 text-sm font-medium rounded transition-colors ${
      activeTab === tab
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-700'
    }`;

  return (
    <div className="flex flex-col h-full bg-gray-800 text-white text-sm select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 font-semibold text-xs uppercase tracking-wide text-gray-400">
        Annotations
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-gray-700">
        <button className={tabClass('annotations')}    onClick={() => setActiveTab('annotations')}>
          Annotations
        </button>
        <button className={tabClass('auto-annotate')} onClick={() => setActiveTab('auto-annotate')}>
          Auto-Annotate
        </button>
        <button className={tabClass('optimizer')}     onClick={() => setActiveTab('optimizer')}>
          Optimizer
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'annotations' && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400">
              Total: <span className="text-white font-semibold">{annotations.length}</span>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-1 pr-2">Type</th>
                  <th className="text-right py-1">Count</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(TYPE_LABELS) as AnnotationType[]).map((type) => (
                  <tr key={type} className="border-b border-gray-700/50 hover:bg-gray-700/40">
                    <td className="py-1 pr-2 text-gray-300">{TYPE_LABELS[type]}</td>
                    <td className="py-1 text-right text-white">{countByType[type] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() => store.clearAllAnnotations()}
              disabled={annotations.length === 0}
              className="w-full px-3 py-1.5 text-xs rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear All
            </button>
          </div>
        )}

        {activeTab === 'auto-annotate' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Generate annotations automatically from drawing features.
            </p>
            <div className="space-y-2">
              {(
                [
                  ['generateBearingDims',     'Bearing / Distance Dims'],
                  ['generateCurveData',       'Curve Data'],
                  ['generateMonumentLabels',  'Monument Labels'],
                  ['generateAreaLabels',      'Area Labels'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.checked }))}
                    className="accent-blue-500"
                  />
                  <span className="text-gray-200 text-xs">{label}</span>
                </label>
              ))}
            </div>
            <button
              onClick={handleAutoAnnotate}
              className="w-full px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 transition-colors"
            >
              Auto-Annotate All
            </button>
          </div>
        )}

        {activeTab === 'optimizer' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Resolve label collisions automatically.
            </p>
            {result && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Collisions Resolved</span>
                  <span className="text-green-400 font-semibold">{result.collisionsResolved}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Collisions Remaining</span>
                  <span className={result.collisionsRemaining > 0 ? 'text-yellow-400 font-semibold' : 'text-gray-300'}>
                    {result.collisionsRemaining}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Flagged for Manual</span>
                  <span className={result.flaggedForManual.length > 0 ? 'text-orange-400 font-semibold' : 'text-gray-300'}>
                    {result.flaggedForManual.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Iterations</span>
                  <span className="text-gray-300">{result.iterationsUsed}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleRunOptimizer}
              disabled={annotations.length === 0}
              className="w-full px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Run Optimizer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
