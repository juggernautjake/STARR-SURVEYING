// app/admin/research/components/TemplateManager.tsx — Template management panel
// Reusable for both analysis and drawing templates
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AnalysisTemplate, DrawingTemplate } from '@/types/research';
import Tooltip from './Tooltip';

type Template = AnalysisTemplate | DrawingTemplate;
type TemplateType = 'analysis' | 'drawing';

interface TemplateManagerProps {
  type: TemplateType;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showUITooltips?: boolean;
  compact?: boolean; // compact mode for inline selector
}

// ── Default extract config for analysis templates ──────────────────────────

const DEFAULT_EXTRACT_CATEGORIES: { key: string; label: string; defaultOn: boolean }[] = [
  { key: 'bearing', label: 'Bearings', defaultOn: true },
  { key: 'distance', label: 'Distances', defaultOn: true },
  { key: 'call', label: 'Call Sequences', defaultOn: true },
  { key: 'monument', label: 'Monuments', defaultOn: true },
  { key: 'curve_data', label: 'Curve Data', defaultOn: true },
  { key: 'area', label: 'Areas', defaultOn: true },
  { key: 'easement', label: 'Easements', defaultOn: true },
  { key: 'setback', label: 'Setbacks', defaultOn: true },
  { key: 'right_of_way', label: 'Right-of-Way', defaultOn: true },
  { key: 'legal_description', label: 'Legal Descriptions', defaultOn: true },
  { key: 'recording_reference', label: 'Recording References', defaultOn: true },
  { key: 'coordinate', label: 'Coordinates', defaultOn: false },
  { key: 'elevation', label: 'Elevations', defaultOn: false },
  { key: 'zoning', label: 'Zoning', defaultOn: false },
  { key: 'flood_zone', label: 'Flood Zone', defaultOn: false },
  { key: 'utility_info', label: 'Utility Info', defaultOn: false },
];

export default function TemplateManager({
  type,
  selectedId,
  onSelect,
  showUITooltips = true,
  compact = false,
}: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newConfig, setNewConfig] = useState<Record<string, boolean>>(() => {
    const config: Record<string, boolean> = {};
    DEFAULT_EXTRACT_CATEGORIES.forEach(c => { config[c.key] = c.defaultOn; });
    return config;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const tips = showUITooltips;

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/templates/${type}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        // If no selection and there's a default, select it
        if (!selectedId) {
          const def = (data.templates || []).find((t: Template) => t.is_default);
          if (def) onSelect(def.id);
        }
      }
    } catch {
      // Templates may not be available yet
    } finally {
      setLoading(false);
    }
  }, [type, selectedId, onSelect]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function handleCreate() {
    if (!newName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: newName.trim(),
        description: newDesc.trim() || null,
      };
      if (type === 'analysis') {
        body.extract_config = newConfig;
      }
      const res = await fetch(`/api/admin/research/templates/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create template');
      }
      const data = await res.json();
      setTemplates(prev => [...prev, data.template]);
      onSelect(data.template.id);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/research/templates/${type}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (selectedId === id) onSelect(null);
      }
    } catch {
      // Silently fail
    }
  }

  if (loading) {
    return <div className="research-templates__loading">Loading templates...</div>;
  }

  // ── Compact mode: just a select dropdown ──────────────────────────────────
  if (compact) {
    return (
      <div className="research-templates research-templates--compact">
        <Tooltip text={type === 'analysis'
          ? 'Select an analysis template to control which data categories are extracted'
          : 'Select a drawing template to control paper size, colors, and styles'}
          enabled={tips} position="right">
          <label className="research-templates__select-label">
            {type === 'analysis' ? 'Analysis Template' : 'Drawing Template'}
          </label>
        </Tooltip>
        <div className="research-templates__select-row">
          <select
            className="research-templates__select"
            value={selectedId || ''}
            onChange={e => onSelect(e.target.value || null)}
          >
            <option value="">Default (all categories)</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_default ? '(Default)' : ''} {t.is_system ? '[System]' : ''}
              </option>
            ))}
          </select>
          <Tooltip text="Create a new custom template" enabled={tips} position="left">
            <button
              className="research-templates__add-btn"
              onClick={() => setShowCreate(!showCreate)}
              aria-label="Create template"
            >
              +
            </button>
          </Tooltip>
        </div>

        {showCreate && (
          <div className="research-templates__create-form">
            <input
              className="research-templates__input"
              placeholder="Template name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <input
              className="research-templates__input"
              placeholder="Description (optional)..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            {type === 'analysis' && (
              <div className="research-templates__categories">
                <span className="research-templates__categories-label">Extract categories:</span>
                <div className="research-templates__category-grid">
                  {DEFAULT_EXTRACT_CATEGORIES.map(cat => (
                    <label key={cat.key} className="research-templates__category">
                      <input
                        type="checkbox"
                        checked={newConfig[cat.key] || false}
                        onChange={e => setNewConfig(prev => ({ ...prev, [cat.key]: e.target.checked }))}
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {error && <div className="research-templates__error">{error}</div>}
            <div className="research-templates__create-actions">
              <button className="research-templates__save-btn" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button className="research-templates__cancel-btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Full mode: template cards with management ─────────────────────────────
  return (
    <div className="research-templates">
      <div className="research-templates__header">
        <h3 className="research-templates__title">
          {type === 'analysis' ? 'Analysis Templates' : 'Drawing Templates'}
        </h3>
        <Tooltip text="Create a new custom template" enabled={tips} position="left">
          <button className="research-templates__new-btn" onClick={() => setShowCreate(true)}>
            + New Template
          </button>
        </Tooltip>
      </div>

      <div className="research-templates__grid">
        {templates.map(t => (
          <div
            key={t.id}
            className={`research-templates__card ${selectedId === t.id ? 'research-templates__card--active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="research-templates__card-header">
              <span className="research-templates__card-name">{t.name}</span>
              {t.is_default && <span className="research-templates__card-badge">Default</span>}
              {t.is_system && <span className="research-templates__card-badge research-templates__card-badge--system">System</span>}
            </div>
            {t.description && (
              <p className="research-templates__card-desc">{t.description}</p>
            )}
            <div className="research-templates__card-meta">
              Created {new Date(t.created_at).toLocaleDateString()}
            </div>
            {!t.is_system && (
              <button
                className="research-templates__card-delete"
                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                aria-label="Delete template"
              >
                &times;
              </button>
            )}
          </div>
        ))}

        {templates.length === 0 && (
          <div className="research-templates__empty">
            No templates yet. Click &ldquo;+ New Template&rdquo; to create one.
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      {showCreate && (
        <div className="research-templates__modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="research-templates__modal" onClick={e => e.stopPropagation()}>
            <h4 className="research-templates__modal-title">
              New {type === 'analysis' ? 'Analysis' : 'Drawing'} Template
            </h4>
            <input
              className="research-templates__input"
              placeholder="Template name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <input
              className="research-templates__input"
              placeholder="Description (optional)..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            {type === 'analysis' && (
              <div className="research-templates__categories">
                <span className="research-templates__categories-label">Data categories to extract:</span>
                <div className="research-templates__category-grid">
                  {DEFAULT_EXTRACT_CATEGORIES.map(cat => (
                    <label key={cat.key} className="research-templates__category">
                      <input
                        type="checkbox"
                        checked={newConfig[cat.key] || false}
                        onChange={e => setNewConfig(prev => ({ ...prev, [cat.key]: e.target.checked }))}
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {error && <div className="research-templates__error">{error}</div>}
            <div className="research-templates__create-actions">
              <button className="research-templates__cancel-btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="research-templates__save-btn" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
