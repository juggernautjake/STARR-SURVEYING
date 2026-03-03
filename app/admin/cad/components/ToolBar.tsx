'use client';
// app/admin/cad/components/ToolBar.tsx — Vertical drawing tool buttons

import { useToolStore } from '@/lib/cad/store';
import type { ToolType } from '@/lib/cad/types';
import {
  MousePointer2,
  Hand,
  Circle,
  Minus,
  Spline,
  Pentagon,
  Move,
  Copy,
  RotateCw,
  FlipHorizontal2,
  Eraser,
} from 'lucide-react';

interface ToolButton {
  tool: ToolType;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: ToolButton[] = [
  { tool: 'SELECT', label: 'Select', shortcut: 'S', icon: <MousePointer2 size={16} /> },
  { tool: 'PAN', label: 'Pan', shortcut: 'H', icon: <Hand size={16} /> },
  { tool: 'DRAW_POINT', label: 'Point', shortcut: 'P', icon: <Circle size={16} /> },
  { tool: 'DRAW_LINE', label: 'Line', shortcut: 'L', icon: <Minus size={16} /> },
  { tool: 'DRAW_POLYLINE', label: 'Polyline', shortcut: 'PL', icon: <Spline size={16} /> },
  { tool: 'DRAW_POLYGON', label: 'Polygon', shortcut: 'PG', icon: <Pentagon size={16} /> },
  { tool: 'MOVE', label: 'Move', shortcut: 'M', icon: <Move size={16} /> },
  { tool: 'COPY', label: 'Copy', shortcut: 'CO', icon: <Copy size={16} /> },
  { tool: 'ROTATE', label: 'Rotate', shortcut: 'RO', icon: <RotateCw size={16} /> },
  { tool: 'MIRROR', label: 'Mirror', shortcut: 'MI', icon: <FlipHorizontal2 size={16} /> },
  { tool: 'ERASE', label: 'Erase', shortcut: 'E', icon: <Eraser size={16} /> },
];

export default function ToolBar() {
  const { state, setTool } = useToolStore();
  const activeTool = state.activeTool;

  return (
    <div className="flex flex-col items-center py-2 gap-1">
      {TOOLS.map(({ tool, label, shortcut, icon }) => (
        <button
          key={tool}
          title={`${label} (${shortcut})`}
          onClick={() => setTool(tool)}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
            activeTool === tool
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
