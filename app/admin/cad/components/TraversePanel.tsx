// app/admin/cad/components/TraversePanel.tsx
'use client';

import React, { useState } from 'react';
import { useTraverseStore } from '@/lib/cad/store/traverse-store';
import { usePointStore } from '@/lib/cad/store';
import { createTraverse } from '@/lib/cad/geometry/traverse';
import { formatBearing } from '@/lib/cad/geometry/bearing';
import { generateLegalDescription, DEFAULT_LEGAL_DESC_CONFIG } from '@/lib/cad/geometry/legal-desc';
import ClosureReport from './ClosureReport';
import type { SurveyPoint } from '@/lib/cad/types';

export default function TraversePanel() {
  const { traverses, activeTraverseId, createTraverse: storeCreate, deleteTraverse, adjustTraverse, setActiveTraverse } = useTraverseStore();
  const { points } = usePointStore();
  const [showLegalDesc, setShowLegalDesc] = useState(false);
  const [legalDescText, setLegalDescText] = useState('');

  const activeTraverse = activeTraverseId ? traverses[activeTraverseId] : null;

  const handleNewTraverse = () => {
    // Create from all imported points in order of point number
    const ptList = Object.values(points).sort((a, b) => a.pointNumber - b.pointNumber);
    if (ptList.length < 2) return;

    const pointMap = new Map<string, SurveyPoint>(ptList.map(p => [p.id, p]));
    const ptIds = ptList.map(p => p.id);
    const t = createTraverse(ptIds, pointMap, true, `Traverse ${Object.keys(traverses).length + 1}`);
    storeCreate(t);
  };

  const handleAdjust = (method: 'COMPASS' | 'TRANSIT') => {
    if (!activeTraverseId) return;
    adjustTraverse(activeTraverseId, method);
  };

  const handleLegalDesc = () => {
    if (!activeTraverse) return;
    const ptMap = new Map<string, SurveyPoint>(Object.entries(points));
    const text = generateLegalDescription(activeTraverse, ptMap, DEFAULT_LEGAL_DESC_CONFIG);
    setLegalDescText(text);
    setShowLegalDesc(true);
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-72 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <span className="font-semibold text-gray-700">Traverses</span>
        <button
          onClick={handleNewTraverse}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
          title="New traverse from all points"
        >
          + New
        </button>
      </div>

      {/* Traverse list */}
      {Object.keys(traverses).length === 0 ? (
        <div className="p-4 text-center text-gray-400 text-xs">
          No traverses. Import points and click + New.
        </div>
      ) : (
        <div className="border-b divide-y divide-gray-100">
          {Object.values(traverses).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTraverse(t.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 ${t.id === activeTraverseId ? 'bg-blue-50 font-semibold' : ''}`}
            >
              <span className="truncate">{t.name}</span>
              <span className="text-gray-400 text-xs ml-2">{t.pointIds.length} pts</span>
            </button>
          ))}
        </div>
      )}

      {/* Active traverse details */}
      {activeTraverse && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Legs table */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Legs</h4>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left text-gray-500 font-medium">#</th>
                    <th className="px-2 py-1 text-left text-gray-500 font-medium">Bearing</th>
                    <th className="px-2 py-1 text-right text-gray-500 font-medium">Dist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeTraverse.legs.map((leg, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1 font-mono text-xs text-gray-700 truncate max-w-[120px]">
                        {formatBearing(leg.bearing)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-700">
                        {leg.distance.toFixed(2)}&apos;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Closure */}
          {activeTraverse.closure && (
            <ClosureReport closure={activeTraverse.closure} />
          )}

          {/* Area */}
          {activeTraverse.area && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Area</h4>
              <div className="text-xs font-mono">
                <div>{Math.round(activeTraverse.area.squareFeet).toLocaleString()} sq ft</div>
                <div>{activeTraverse.area.acres.toFixed(4)} acres</div>
              </div>
            </div>
          )}

          {/* Adjustment status */}
          {activeTraverse.adjustmentMethod && activeTraverse.adjustmentMethod !== 'NONE' && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
              Adjusted: {activeTraverse.adjustmentMethod === 'COMPASS' ? 'Compass Rule (Bowditch)' : 'Transit Rule'}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={() => handleAdjust('COMPASS')}
              className="w-full bg-blue-600 text-white rounded px-3 py-1.5 text-xs font-medium hover:bg-blue-700"
            >
              Adjust (Compass Rule)
            </button>
            <button
              onClick={() => handleAdjust('TRANSIT')}
              className="w-full bg-blue-50 text-blue-700 border border-blue-200 rounded px-3 py-1.5 text-xs font-medium hover:bg-blue-100"
            >
              Adjust (Transit Rule)
            </button>
            <button
              onClick={handleLegalDesc}
              className="w-full bg-gray-100 text-gray-700 rounded px-3 py-1.5 text-xs font-medium hover:bg-gray-200"
            >
              Legal Description
            </button>
            <button
              onClick={() => activeTraverseId && deleteTraverse(activeTraverseId)}
              className="w-full bg-red-50 text-red-600 border border-red-200 rounded px-3 py-1.5 text-xs font-medium hover:bg-red-100"
            >
              Delete Traverse
            </button>
          </div>
        </div>
      )}

      {/* Legal Description Modal */}
      {showLegalDesc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_150ms_ease-out]">
          <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Legal Description</h3>
              <button onClick={() => setShowLegalDesc(false)} className="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">{legalDescText}</pre>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => navigator.clipboard?.writeText(legalDescText).catch(() => {})}
                className="bg-gray-100 text-gray-700 rounded px-4 py-2 text-sm hover:bg-gray-200"
              >
                Copy
              </button>
              <button
                onClick={() => setShowLegalDesc(false)}
                className="bg-gray-100 text-gray-700 rounded px-4 py-2 text-sm hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
