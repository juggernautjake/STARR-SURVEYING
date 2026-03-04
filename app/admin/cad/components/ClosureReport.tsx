// app/admin/cad/components/ClosureReport.tsx
'use client';

import React from 'react';
import type { ClosureResult } from '@/lib/cad/types';
import { formatBearing } from '@/lib/cad/geometry/bearing';

interface Props {
  closure: ClosureResult;
}

export default function ClosureReport({ closure }: Props) {
  const precisionColor =
    closure.precisionDenominator >= 10000 ? 'text-green-700' :
    closure.precisionDenominator >= 5000 ? 'text-yellow-700' :
    'text-red-700';

  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Closure</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-500">Linear Error:</span>
        <span className="font-mono">{closure.linearError.toFixed(3)}&apos;</span>

        <span className="text-gray-500">Precision:</span>
        <span className={`font-mono font-semibold ${precisionColor}`}>{closure.precisionRatio}</span>

        <span className="text-gray-500">Error Bearing:</span>
        <span className="font-mono">{formatBearing(closure.errorBearing)}</span>

        <span className="text-gray-500">ΔN:</span>
        <span className="font-mono">{closure.errorNorth >= 0 ? '+' : ''}{closure.errorNorth.toFixed(4)}&apos;</span>

        <span className="text-gray-500">ΔE:</span>
        <span className="font-mono">{closure.errorEast >= 0 ? '+' : ''}{closure.errorEast.toFixed(4)}&apos;</span>

        <span className="text-gray-500">Angular Error:</span>
        <span className="font-mono">{closure.angularError.toFixed(1)}&quot;</span>

        <span className="text-gray-500">Total Distance:</span>
        <span className="font-mono">{closure.totalDistance.toFixed(2)}&apos;</span>
      </div>
    </div>
  );
}
