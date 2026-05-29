'use client';
// Slices 166-169 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useState } from 'react';

interface JobNode { id: string; label: string; children?: JobNode[]; }

const SAMPLE_TREE: JobNode[] = [
  { id: 'j1', label: 'Job 2025-001 · Smith Boundary', children: [
    { id: 'j1-field', label: 'Field Captures (12)' },
    { id: 'j1-drawing', label: 'Drawing — Smith.dwg' },
    { id: 'j1-files', label: 'Files (3)' },
  ]},
  { id: 'j2', label: 'Job 2025-007 · 35 Acres Topo', children: [
    { id: 'j2-field', label: 'Field Captures (4)' },
    { id: 'j2-drawing', label: 'Drawing — 35Acres.dwg' },
  ]},
];

export default function DrawerWorkspace() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: 'var(--hub-spc-3, 12px)' }}>
      <aside style={asideStyle}>
        <h2 style={headerStyle}>Jobs</h2>
        <ul role="tree" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {SAMPLE_TREE.map((node) => (
            <TreeNode key={node.id} node={node} selected={selected} onSelect={setSelected} />
          ))}
        </ul>
      </aside>

      <main style={mainStyle}>
        <h2 style={headerStyle}>Drafting workspace</h2>
        {selected ? (
          <>
            <p style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.9rem', margin: 0 }}>Selected: {selected}</p>
            <p style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>
              When a drawing is selected, this pane mounts the CAD editor (Slice 167). Field captures
              + point files render in dedicated viewers (Slice 168).
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>Pick an item in the tree to open it.</p>
        )}
      </main>

      <aside style={asideStyle}>
        <h2 style={headerStyle}>Comms + checklist</h2>
        <p style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.85rem' }}>
          Live thread with the field crew + drafting standards checklist (Slice 169).
        </p>
      </aside>
    </div>
  );
}

function TreeNode({ node, selected, onSelect }: { node: JobNode; selected: string | null; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const isActive = selected === node.id;
  return (
    <li>
      <button
        type="button"
        onClick={() => { setExpanded((e) => !e); onSelect(node.id); }}
        style={{
          width: '100%', textAlign: 'left', padding: '4px 8px', borderRadius: 4,
          border: 'none', background: isActive ? 'color-mix(in srgb, var(--theme-accent) 14%, var(--theme-bg-surface))' : 'transparent',
          color: 'var(--theme-fg-primary)', fontSize: '0.85rem', cursor: 'pointer',
        }}
      >
        {node.children ? (expanded ? '▾' : '▸') : '•'} {node.label}
      </button>
      {expanded && node.children && (
        <ul role="group" style={{ listStyle: 'none', padding: '0 0 0 12px', margin: 0 }}>
          {node.children.map((c) => <TreeNode key={c.id} node={c} selected={selected} onSelect={onSelect} />)}
        </ul>
      )}
    </li>
  );
}

const asideStyle: React.CSSProperties = { padding: 'var(--hub-spc-3, 12px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)' };
const mainStyle: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)', minHeight: 480 };
const headerStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600 };
