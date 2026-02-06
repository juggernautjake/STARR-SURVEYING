// app/admin/components/jobs/JobResearchPanel.tsx — Research documents section
'use client';
import { useState } from 'react';

interface ResearchItem {
  id: string;
  category: string;
  title: string;
  content?: string;
  source?: string;
  reference_number?: string;
  date_of_record?: string;
  added_by: string;
  created_at: string;
}

const RESEARCH_CATEGORIES: Record<string, { label: string; icon: string; description: string }> = {
  title_info: { label: 'Title Information', icon: '📋', description: 'Title search results, ownership history' },
  deed_info: { label: 'Deed Records', icon: '📜', description: 'Deed descriptions, recording information' },
  legal_description: { label: 'Legal Descriptions', icon: '⚖️', description: 'Metes and bounds, lot descriptions' },
  previous_survey: { label: 'Previous Surveys', icon: '🗺️', description: 'Prior survey plats and field notes' },
  plat_records: { label: 'Plat Records', icon: '📐', description: 'Recorded plats and subdivision maps' },
  corner_records: { label: 'Corner Records', icon: '📍', description: 'Found monuments, corner ties' },
  field_notes: { label: 'Historical Field Notes', icon: '📓', description: 'Original survey field notes' },
  satellite_imagery: { label: 'Satellite Imagery', icon: '🛰️', description: 'Aerial and satellite photos' },
  maps: { label: 'Maps', icon: '🗺️', description: 'Topo maps, flood maps, utility maps' },
  easements: { label: 'Easements', icon: '📏', description: 'Utility, access, drainage easements' },
  right_of_way: { label: 'Right of Way', icon: '🛤️', description: 'Road ROW, railroad ROW' },
  flood_zone: { label: 'Flood Zone', icon: '🌊', description: 'FEMA flood zone information' },
  utilities: { label: 'Utilities', icon: '⚡', description: 'Utility locations, underground facilities' },
  other: { label: 'Other Research', icon: '📎', description: 'Miscellaneous research documents' },
};

interface Props {
  research: ResearchItem[];
  onAdd?: (item: { category: string; title: string; content: string; source: string; reference_number: string }) => void;
  onDelete?: (id: string) => void;
}

export default function JobResearchPanel({ research, onAdd, onDelete }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ category: 'title_info', title: '', content: '', source: '', reference_number: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleAdd() {
    if (!newItem.title) return;
    onAdd?.(newItem);
    setNewItem({ category: 'title_info', title: '', content: '', source: '', reference_number: '' });
    setShowAdd(false);
  }

  const filteredResearch = activeCategory
    ? research.filter(r => r.category === activeCategory)
    : research;

  const categoryCounts = research.reduce((acc: Record<string, number>, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="job-research">
      <div className="job-research__header">
        <h3 className="job-research__title">Research & Records</h3>
        <span className="job-research__count">{research.length} item{research.length !== 1 ? 's' : ''}</span>
        {onAdd && (
          <button className="job-research__add-btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="job-research__add-form">
          <select
            className="job-research__select"
            value={newItem.category}
            onChange={e => setNewItem({ ...newItem, category: e.target.value })}
          >
            {Object.entries(RESEARCH_CATEGORIES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            className="job-research__input"
            placeholder="Title"
            value={newItem.title}
            onChange={e => setNewItem({ ...newItem, title: e.target.value })}
          />
          <input
            className="job-research__input"
            placeholder="Source (e.g., County Clerk)"
            value={newItem.source}
            onChange={e => setNewItem({ ...newItem, source: e.target.value })}
          />
          <input
            className="job-research__input"
            placeholder="Reference # (e.g., Vol. 123, Pg. 456)"
            value={newItem.reference_number}
            onChange={e => setNewItem({ ...newItem, reference_number: e.target.value })}
          />
          <textarea
            className="job-research__textarea"
            placeholder="Notes / Content"
            value={newItem.content}
            onChange={e => setNewItem({ ...newItem, content: e.target.value })}
            rows={3}
          />
          <button className="job-research__submit-btn" onClick={handleAdd}>Add Research</button>
        </div>
      )}

      {/* Category filter chips */}
      <div className="job-research__categories">
        <button
          className={`job-research__cat-chip ${!activeCategory ? 'job-research__cat-chip--active' : ''}`}
          onClick={() => setActiveCategory(null)}
        >
          All ({research.length})
        </button>
        {Object.entries(RESEARCH_CATEGORIES).map(([key, { label, icon }]) => {
          const count = categoryCounts[key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              className={`job-research__cat-chip ${activeCategory === key ? 'job-research__cat-chip--active' : ''}`}
              onClick={() => setActiveCategory(activeCategory === key ? null : key)}
            >
              {icon} {label} ({count})
            </button>
          );
        })}
      </div>

      {filteredResearch.length === 0 ? (
        <div className="job-research__empty">
          <p>No research documents yet</p>
          <p className="job-research__empty-sub">Add title info, deed records, previous surveys, and more</p>
        </div>
      ) : (
        <div className="job-research__list">
          {filteredResearch.map(item => {
            const catInfo = RESEARCH_CATEGORIES[item.category] || RESEARCH_CATEGORIES.other;
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="job-research__item">
                <button
                  className="job-research__item-header"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <span className="job-research__item-icon">{catInfo.icon}</span>
                  <div className="job-research__item-title-area">
                    <span className="job-research__item-title">{item.title}</span>
                    <span className="job-research__item-cat">{catInfo.label}</span>
                  </div>
                  <span className="job-research__item-toggle">{isExpanded ? '▼' : '▶'}</span>
                </button>
                {isExpanded && (
                  <div className="job-research__item-body">
                    {item.source && <p className="job-research__item-field"><strong>Source:</strong> {item.source}</p>}
                    {item.reference_number && <p className="job-research__item-field"><strong>Reference:</strong> {item.reference_number}</p>}
                    {item.date_of_record && <p className="job-research__item-field"><strong>Date:</strong> {new Date(item.date_of_record).toLocaleDateString()}</p>}
                    {item.content && <div className="job-research__item-content">{item.content}</div>}
                    <div className="job-research__item-footer">
                      <span>Added by {item.added_by.split('@')[0]} on {new Date(item.created_at).toLocaleDateString()}</span>
                      {onDelete && (
                        <button className="job-research__item-delete" onClick={() => onDelete(item.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { RESEARCH_CATEGORIES };
