'use client';
// app/admin/pay-progression/ConfigEditors.tsx — the inline editors for every pay-config row.
//
// Lifted out of page.tsx for platform audit item 18. Six pairs of the same shape — a card that
// edits one row and a button that adds one — for work types, role tiers, seniority brackets,
// credentials and XP milestones, plus the system-config panel and the credential approval queue.
// They are together rather than in seven files because they are one pattern: each POSTs to its own
// /api/admin/pay-config endpoint and calls the same `onChanged` the page passes down.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Settings, ShieldCheck, Star } from 'lucide-react';
import type { CredentialBonus, RoleTier, SeniorityBracket, WorkTypeRate, XpMilestone } from './pay-types';

// ─── Work-type rate card (P-10) ─────────────────────────────────────────────
// Renders as the original read-only card by default. When editMode is on,
// shows a pencil button; clicking swaps to an inline form whose Save calls
// PUT /api/admin/pay-config/work-types and Delete calls DELETE. The parent
// page refetches via onChanged so the optimistic-update path stays simple.

export interface WorkTypeRateCardProps {
  rate: WorkTypeRate;
  editMode: boolean;
  getMultiplierLabel: (m: number | null) => string;
  onChanged: () => void;
}

export function WorkTypeRateCard({ rate, editMode, getMultiplierLabel, onChanged }: WorkTypeRateCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    base_rate: rate.base_rate,
    bonus_multiplier: rate.bonus_multiplier ?? 1,
    max_bonus_cap: rate.max_bonus_cap,
    icon: rate.icon || '',
    label: rate.label || rate.work_type,
  });

  // Reset draft if the underlying row changes (e.g. another admin saved).
  useEffect(() => {
    setDraft({
      base_rate: rate.base_rate,
      bonus_multiplier: rate.bonus_multiplier ?? 1,
      max_bonus_cap: rate.max_bonus_cap,
      icon: rate.icon || '',
      label: rate.label || rate.work_type,
    });
  }, [rate.work_type, rate.base_rate, rate.bonus_multiplier, rate.max_bonus_cap, rate.icon, rate.label]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: rate.work_type,
          base_rate: Number(draft.base_rate),
          bonus_multiplier: Number(draft.bonus_multiplier),
          max_bonus_cap: draft.max_bonus_cap === null || draft.max_bonus_cap === undefined || (draft.max_bonus_cap as unknown as string) === ''
            ? null
            : Number(draft.max_bonus_cap),
          icon: draft.icon || null,
          label: draft.label || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${rate.label || rate.work_type}" from the pay system? This affects every employee's calculation immediately.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/work-types?work_type=${encodeURIComponent(rate.work_type)}`, { method: 'DELETE' });
      if (res.ok) onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="pay-prog__rate-card pay-prog__rate-card--editing">
        <div className="pay-prog__rate-edit-row">
          <input
            className="pay-prog__rate-edit-icon"
            value={draft.icon}
            onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
            placeholder="🏗️"
            aria-label="Icon"
            maxLength={4}
          />
          <input
            className="pay-prog__rate-edit-label"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Label"
            aria-label="Label"
          />
        </div>
        <label className="pay-prog__rate-edit-field">
          <span>Base rate $/hr</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={draft.base_rate}
            onChange={e => setDraft(d => ({ ...d, base_rate: Number(e.target.value) }))}
          />
        </label>
        <label className="pay-prog__rate-edit-field">
          <span>Bonus multiplier</span>
          <select
            value={String(draft.bonus_multiplier ?? 1)}
            onChange={e => setDraft(d => ({ ...d, bonus_multiplier: Number(e.target.value) }))}
          >
            <option value="1">100% (full)</option>
            <option value="0.75">75%</option>
            <option value="0.5">50%</option>
            <option value="0">0% (no bonus)</option>
          </select>
        </label>
        <label className="pay-prog__rate-edit-field">
          <span>Max bonus cap $/hr (optional)</span>
          <input
            type="number"
            step="1"
            min="0"
            value={draft.max_bonus_cap ?? ''}
            onChange={e => setDraft(d => ({ ...d, max_bonus_cap: e.target.value === '' ? null : Number(e.target.value) }))}
            placeholder="No cap"
          />
        </label>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-prog__rate-card">
      {editMode && (
        <button
          type="button"
          className="pay-prog__edit-pencil"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${rate.label || rate.work_type}`}
          title="Edit"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
      <span className="pay-prog__rate-icon">{rate.icon || '⚙️'}</span>
      <span className="pay-prog__rate-label">{rate.label || rate.work_type}</span>
      <span className="pay-prog__rate-amount">${Number(rate.base_rate).toFixed(2)}/hr</span>
      <div className="pay-prog__rate-meta">
        <span className={`pay-prog__rate-mult pay-prog__rate-mult--${getMultiplierLabel(rate.bonus_multiplier).toLowerCase().replace('%','')}`}>
          {getMultiplierLabel(rate.bonus_multiplier)} bonus
        </span>
        {rate.max_bonus_cap && (
          <span className="pay-prog__rate-cap">cap ${Number(rate.max_bonus_cap).toFixed(0)}/hr</span>
        )}
      </div>
    </div>
  );
}

// ─── Add work-type button (P-10) ────────────────────────────────────────────

export function AddWorkTypeButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    work_type: '',
    label: '',
    icon: '',
    base_rate: 18,
    bonus_multiplier: 1,
    max_bonus_cap: null as number | null,
  });

  async function save() {
    if (!draft.work_type.trim()) {
      window.alert('Work type key is required (e.g. "office_clerical").');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: draft.work_type.trim(),
          label: draft.label || draft.work_type,
          icon: draft.icon || null,
          base_rate: Number(draft.base_rate),
          bonus_multiplier: Number(draft.bonus_multiplier),
          max_bonus_cap: draft.max_bonus_cap,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ work_type: '', label: '', icon: '', base_rate: 18, bonus_multiplier: 1, max_bonus_cap: null });
        onAdded();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Failed to add work type');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button
        type="button"
        className="pay-prog__rate-card pay-prog__rate-card--add"
        onClick={() => setAdding(true)}
      >
        <span aria-hidden="true" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}>+</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Add work type</span>
      </button>
    );
  }

  return (
    <div className="pay-prog__rate-card pay-prog__rate-card--editing">
      <label className="pay-prog__rate-edit-field">
        <span>Key (snake_case)</span>
        <input
          value={draft.work_type}
          onChange={e => setDraft(d => ({ ...d, work_type: e.target.value }))}
          placeholder="e.g. site_visit"
        />
      </label>
      <div className="pay-prog__rate-edit-row">
        <input
          className="pay-prog__rate-edit-icon"
          value={draft.icon}
          onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
          placeholder="🏗️"
          aria-label="Icon"
          maxLength={4}
        />
        <input
          className="pay-prog__rate-edit-label"
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          placeholder="Label"
        />
      </div>
      <label className="pay-prog__rate-edit-field">
        <span>Base rate $/hr</span>
        <input
          type="number"
          step="0.25"
          min="0"
          value={draft.base_rate}
          onChange={e => setDraft(d => ({ ...d, base_rate: Number(e.target.value) }))}
        />
      </label>
      <label className="pay-prog__rate-edit-field">
        <span>Bonus multiplier</span>
        <select
          value={String(draft.bonus_multiplier)}
          onChange={e => setDraft(d => ({ ...d, bonus_multiplier: Number(e.target.value) }))}
        >
          <option value="1">100% (full)</option>
          <option value="0.75">75%</option>
          <option value="0.5">50%</option>
          <option value="0">0% (no bonus)</option>
        </select>
      </label>
      <label className="pay-prog__rate-edit-field">
        <span>Max bonus cap $/hr (optional)</span>
        <input
          type="number"
          step="1"
          min="0"
          value={draft.max_bonus_cap ?? ''}
          onChange={e => setDraft(d => ({ ...d, max_bonus_cap: e.target.value === '' ? null : Number(e.target.value) }))}
          placeholder="No cap"
        />
      </label>
      <div className="pay-prog__rate-edit-actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Tier rung (P-11) ───────────────────────────────────────────────────────
// Read-only display by default. When editMode is on, shows a pencil button
// in the rung-stats column; clicking swaps the row into an inline editor
// for label/base_bonus/max_effective_rate/description/icon. Save calls
// /api/admin/pay-config/role-tiers (PUT); Delete calls DELETE (which
// refuses if any employee still references this tier).

export interface TierRungProps {
  tier: RoleTier;
  state: 'current' | 'unlocked' | 'locked' | 'neutral';
  isCurrent: boolean;
  isUnlocked: boolean;
  isLocked: boolean;
  editMode: boolean;
  onChanged: () => void;
}

export function TierRung({ tier, state, isCurrent, isUnlocked, isLocked, editMode, onChanged }: TierRungProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: tier.label || tier.role_key,
    description: tier.description || '',
    icon: '',
    base_bonus: tier.base_bonus,
    max_effective_rate: tier.max_effective_rate,
    sort_order: tier.sort_order ?? null,
  });

  useEffect(() => {
    setDraft({
      label: tier.label || tier.role_key,
      description: tier.description || '',
      icon: '',
      base_bonus: tier.base_bonus,
      max_effective_rate: tier.max_effective_rate,
      sort_order: tier.sort_order ?? null,
    });
  }, [tier.role_key, tier.label, tier.description, tier.base_bonus, tier.max_effective_rate, tier.sort_order]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/role-tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: tier.role_key,
          label: draft.label,
          description: draft.description || null,
          icon: draft.icon || undefined,
          base_bonus: Number(draft.base_bonus),
          max_effective_rate: draft.max_effective_rate === null || (draft.max_effective_rate as unknown as string) === ''
            ? null
            : Number(draft.max_effective_rate),
          sort_order: draft.sort_order === null || (draft.sort_order as unknown as string) === ''
            ? null
            : Number(draft.sort_order),
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove tier "${tier.label || tier.role_key}"? This is blocked if any employees still reference it.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/role-tiers?role_key=${encodeURIComponent(tier.role_key)}`, { method: 'DELETE' });
      if (res.ok) {
        onChanged();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to delete tier');
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="pay-prog__rung pay-prog__rung--editing">
        <div className="pay-prog__rung-marker" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div className="pay-prog__rung-edit-body">
          <div className="pay-prog__rate-edit-row">
            <input
              className="pay-prog__rate-edit-icon"
              value={draft.icon}
              onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
              placeholder={tier.icon || '🏅'}
              aria-label="Icon"
              maxLength={4}
            />
            <input
              className="pay-prog__rate-edit-label"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="Label"
            />
          </div>
          <label className="pay-prog__rate-edit-field">
            <span>Description</span>
            <input
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              placeholder="What this tier does"
            />
          </label>
          <div className="pay-prog__rung-edit-grid">
            <label className="pay-prog__rate-edit-field">
              <span>Base bonus $/hr</span>
              <input
                type="number"
                step="0.25"
                min="0"
                value={draft.base_bonus}
                onChange={e => setDraft(d => ({ ...d, base_bonus: Number(e.target.value) }))}
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Max effective $/hr</span>
              <input
                type="number"
                step="1"
                min="0"
                value={draft.max_effective_rate ?? ''}
                onChange={e => setDraft(d => ({ ...d, max_effective_rate: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="No ceiling"
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Sort order</span>
              <input
                type="number"
                step="1"
                value={draft.sort_order ?? ''}
                onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="Auto"
              />
            </label>
          </div>
          <div className="pay-prog__rate-edit-actions">
            <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`pay-prog__rung pay-prog__rung--${state}`}>
      <div className="pay-prog__rung-marker" aria-hidden="true">
        {isUnlocked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
        {isCurrent && <span className="pay-prog__rung-marker-pulse" />}
        {isLocked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        )}
      </div>
      <div className="pay-prog__rung-body">
        <div className="pay-prog__rung-head">
          <span className="pay-prog__rung-label">
            {tier.icon && <span className="pay-prog__rung-icon" aria-hidden="true">{tier.icon}</span>}
            {tier.label || tier.role_key}
          </span>
          {isCurrent && <span className="pay-prog__rung-badge">You are here</span>}
        </div>
        {tier.description && <p className="pay-prog__rung-desc">{tier.description}</p>}
      </div>
      <div className="pay-prog__rung-stats">
        {editMode && (
          <button
            type="button"
            className="pay-prog__edit-pencil"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${tier.label || tier.role_key}`}
            title="Edit tier"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        )}
        <span className="pay-prog__rung-bonus">+${Number(tier.base_bonus).toFixed(2)}/hr</span>
        {tier.max_effective_rate && (
          <span className="pay-prog__rung-cap">cap ${Number(tier.max_effective_rate).toFixed(0)}/hr</span>
        )}
      </div>
    </li>
  );
}

// ─── Add tier button (P-11) ─────────────────────────────────────────────────

export function AddTierButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    role_key: '',
    label: '',
    description: '',
    icon: '',
    base_bonus: 0,
    max_effective_rate: null as number | null,
    sort_order: null as number | null,
  });

  async function save() {
    if (!draft.role_key.trim()) {
      window.alert('Tier key is required (e.g. "senior_party_chief").');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/role-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: draft.role_key.trim(),
          label: draft.label || draft.role_key,
          description: draft.description || null,
          icon: draft.icon || null,
          base_bonus: Number(draft.base_bonus),
          max_effective_rate: draft.max_effective_rate,
          sort_order: draft.sort_order,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ role_key: '', label: '', description: '', icon: '', base_bonus: 0, max_effective_rate: null, sort_order: null });
        onAdded();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to add tier');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button
        type="button"
        className="pay-prog__rung-add"
        onClick={() => setAdding(true)}
      >
        <span aria-hidden="true">+</span> Add tier
      </button>
    );
  }

  return (
    <div className="pay-prog__rung pay-prog__rung--editing">
      <div className="pay-prog__rung-marker" aria-hidden="true">+</div>
      <div className="pay-prog__rung-edit-body">
        <label className="pay-prog__rate-edit-field">
          <span>Key (snake_case)</span>
          <input
            value={draft.role_key}
            onChange={e => setDraft(d => ({ ...d, role_key: e.target.value }))}
            placeholder="e.g. senior_party_chief"
          />
        </label>
        <div className="pay-prog__rate-edit-row">
          <input
            className="pay-prog__rate-edit-icon"
            value={draft.icon}
            onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
            placeholder="🏅"
            aria-label="Icon"
            maxLength={4}
          />
          <input
            className="pay-prog__rate-edit-label"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Label"
          />
        </div>
        <label className="pay-prog__rate-edit-field">
          <span>Description</span>
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          />
        </label>
        <div className="pay-prog__rung-edit-grid">
          <label className="pay-prog__rate-edit-field">
            <span>Base bonus $/hr</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={draft.base_bonus}
              onChange={e => setDraft(d => ({ ...d, base_bonus: Number(e.target.value) }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Max effective $/hr</span>
            <input
              type="number"
              step="1"
              min="0"
              value={draft.max_effective_rate ?? ''}
              onChange={e => setDraft(d => ({ ...d, max_effective_rate: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="No ceiling"
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Sort order</span>
            <input
              type="number"
              step="1"
              value={draft.sort_order ?? ''}
              onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="Auto"
            />
          </label>
        </div>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Add'}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Seniority bracket item (P-12) ──────────────────────────────────────────

export interface SeniorityBracketItemProps {
  bracket: SeniorityBracket;
  reached: boolean;
  isLast: boolean;
  editMode: boolean;
  onChanged: () => void;
}

export function SeniorityBracketItem({ bracket, reached, isLast, editMode, onChanged }: SeniorityBracketItemProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    min_years: bracket.min_years,
    max_years: bracket.max_years,
    bonus_per_hour: bracket.bonus_per_hour,
    label: bracket.label || '',
  });

  useEffect(() => {
    setDraft({
      min_years: bracket.min_years,
      max_years: bracket.max_years,
      bonus_per_hour: bracket.bonus_per_hour,
      label: bracket.label || '',
    });
  }, [bracket.min_years, bracket.max_years, bracket.bonus_per_hour, bracket.label]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/seniority-brackets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_years: bracket.min_years,
          new_min_years: Number(draft.min_years),
          max_years: draft.max_years === null || (draft.max_years as unknown as string) === ''
            ? null
            : Number(draft.max_years),
          bonus_per_hour: Number(draft.bonus_per_hour),
          label: draft.label || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${bracket.label || `${bracket.min_years} year`}" bracket?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/seniority-brackets?min_years=${bracket.min_years}`, { method: 'DELETE' });
      if (res.ok) onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="pay-prog__timeline-item pay-prog__timeline-item--editing">
        <div className="pay-prog__timeline-edit-body">
          <input
            className="pay-prog__rate-edit-label"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Label (e.g. 3-4 years)"
            aria-label="Label"
          />
          <div className="pay-prog__timeline-edit-row">
            <label className="pay-prog__rate-edit-field">
              <span>Min years</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.min_years}
                onChange={e => setDraft(d => ({ ...d, min_years: Number(e.target.value) }))}
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Max years</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.max_years ?? ''}
                onChange={e => setDraft(d => ({ ...d, max_years: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="∞"
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Bonus $/hr</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={draft.bonus_per_hour}
                onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))}
              />
            </label>
          </div>
          <div className="pay-prog__rate-edit-actions">
            <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>Delete</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`pay-prog__timeline-item ${reached ? 'pay-prog__timeline-item--reached' : ''}`}>
      {editMode && (
        <button
          type="button"
          className="pay-prog__edit-pencil pay-prog__edit-pencil--top"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${bracket.label || bracket.min_years}`}
          title="Edit bracket"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
      <div className="pay-prog__timeline-dot" style={{ background: reached ? 'var(--color-success)' : 'var(--color-border)' }} />
      <div className="pay-prog__timeline-content">
        <span className="pay-prog__timeline-label">
          {bracket.label || (bracket.min_years === 0 ? 'Start' : `${bracket.min_years} Year${bracket.min_years !== 1 ? 's' : ''}`)}
        </span>
        <span className="pay-prog__timeline-bonus">+${Number(bracket.bonus_per_hour).toFixed(2)}/hr</span>
      </div>
      {!isLast && <div className={`pay-prog__timeline-connector ${reached ? 'pay-prog__timeline-connector--active' : ''}`} />}
    </div>
  );
}

// ─── Add seniority bracket button (P-12) ────────────────────────────────────

export function AddSeniorityBracketButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    min_years: 10,
    max_years: null as number | null,
    bonus_per_hour: 0,
    label: '',
  });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/seniority-brackets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_years: Number(draft.min_years),
          max_years: draft.max_years,
          bonus_per_hour: Number(draft.bonus_per_hour),
          label: draft.label || null,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ min_years: 10, max_years: null, bonus_per_hour: 0, label: '' });
        onAdded();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to add bracket');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button type="button" className="pay-prog__rung-add" onClick={() => setAdding(true)}>
        <span aria-hidden="true">+</span> Add seniority bracket
      </button>
    );
  }

  return (
    <div className="pay-prog__timeline-item pay-prog__timeline-item--editing" style={{ marginTop: '0.75rem' }}>
      <div className="pay-prog__timeline-edit-body">
        <input
          className="pay-prog__rate-edit-label"
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          placeholder="Label (e.g. 10+ years)"
        />
        <div className="pay-prog__timeline-edit-row">
          <label className="pay-prog__rate-edit-field">
            <span>Min years</span>
            <input type="number" min="0" step="1" value={draft.min_years} onChange={e => setDraft(d => ({ ...d, min_years: Number(e.target.value) }))} />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Max years</span>
            <input type="number" min="0" step="1" value={draft.max_years ?? ''}
              onChange={e => setDraft(d => ({ ...d, max_years: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="∞"
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Bonus $/hr</span>
            <input type="number" min="0" step="0.25" value={draft.bonus_per_hour}
              onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))}
            />
          </label>
        </div>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add'}</button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


// ─── Credential badge (P-13) ────────────────────────────────────────────────

export interface CredentialBadgeProps {
  credential: CredentialBonus;
  earnedEntry?: { credential_key: string; earned_date?: string };
  editMode: boolean;
  onChanged: () => void;
  // P-20: if set, this locked badge shows "your rate would be $X/hr (+$Y)"
  // computed via the canonical effective-rate calculator with this
  // credential added to the user's stack.
  preview?: { delta: number; rate: number } | null;
}

export function CredentialBadge({ credential: c, earnedEntry, editMode, onChanged, preview }: CredentialBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: c.label || '',
    bonus_per_hour: c.bonus_per_hour,
    credential_type: c.credential_type || 'other',
  });

  useEffect(() => {
    setDraft({
      label: c.label || '',
      bonus_per_hour: c.bonus_per_hour,
      credential_type: c.credential_type || 'other',
    });
  }, [c.credential_key, c.label, c.bonus_per_hour, c.credential_type]);

  const earned = !!earnedEntry;
  const earnedDate = earnedEntry?.earned_date
    ? new Date(earnedEntry.earned_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_key: c.credential_key,
          label: draft.label,
          bonus_per_hour: Number(draft.bonus_per_hour),
          credential_type: draft.credential_type,
        }),
      });
      if (res.ok) { setEditing(false); onChanged(); }
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove credential "${c.label || c.credential_key}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/credentials?credential_key=${encodeURIComponent(c.credential_key)}`, { method: 'DELETE' });
      if (res.ok) onChanged();
      else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to delete');
      }
    } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="pay-prog__badge pay-prog__badge--editing">
        <input
          className="pay-prog__rate-edit-label"
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          placeholder="Label"
        />
        <label className="pay-prog__rate-edit-field">
          <span>Bonus $/hr</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={draft.bonus_per_hour}
            onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))}
          />
        </label>
        <label className="pay-prog__rate-edit-field">
          <span>Type</span>
          <select value={draft.credential_type} onChange={e => setDraft(d => ({ ...d, credential_type: e.target.value }))}>
            <option value="exam">Exam</option>
            <option value="license">License</option>
            <option value="safety">Safety</option>
            <option value="cert">Certification</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pay-prog__badge ${earned ? 'pay-prog__badge--earned' : 'pay-prog__badge--locked'}`}
      title={earned ? `Earned ${earnedDate || ''}` : `Earn to unlock +$${Number(c.bonus_per_hour).toFixed(2)}/hr`}
    >
      {editMode && (
        <button
          type="button"
          className="pay-prog__edit-pencil pay-prog__edit-pencil--top"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${c.label || c.credential_key}`}
          title="Edit credential"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
      <div className="pay-prog__badge-medal" aria-hidden="true">
        {earned ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="6" />
            <polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </div>
      <div className="pay-prog__badge-body">
        <span className="pay-prog__badge-name">{c.label || c.credential_key}</span>
        <span className="pay-prog__badge-type">{c.credential_type}</span>
      </div>
      <div className="pay-prog__badge-meta">
        <span className="pay-prog__badge-bonus">+${Number(c.bonus_per_hour).toFixed(2)}/hr</span>
        {earned && earnedDate && <span className="pay-prog__badge-date">Earned {earnedDate}</span>}
        {!earned && !preview && <span className="pay-prog__badge-hint">Locked</span>}
        {!earned && preview && (
          <span className="pay-prog__badge-preview" title={`Your effective rate would become $${preview.rate.toFixed(2)}/hr`}>
            → ${preview.rate.toFixed(2)}/hr
          </span>
        )}
      </div>
    </div>
  );
}

export function AddCredentialButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    credential_key: '',
    label: '',
    bonus_per_hour: 0.5,
    credential_type: 'cert',
  });

  async function save() {
    if (!draft.credential_key.trim()) { window.alert('Credential key required.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_key: draft.credential_key.trim(),
          label: draft.label || draft.credential_key,
          bonus_per_hour: Number(draft.bonus_per_hour),
          credential_type: draft.credential_type,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ credential_key: '', label: '', bonus_per_hour: 0.5, credential_type: 'cert' });
        onAdded();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to add');
      }
    } finally { setSaving(false); }
  }

  if (!adding) {
    return (
      <button type="button" className="pay-prog__badge pay-prog__badge--add" onClick={() => setAdding(true)}>
        <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>+</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Add credential</span>
      </button>
    );
  }

  return (
    <div className="pay-prog__badge pay-prog__badge--editing">
      <label className="pay-prog__rate-edit-field">
        <span>Key (snake_case)</span>
        <input value={draft.credential_key} onChange={e => setDraft(d => ({ ...d, credential_key: e.target.value }))} placeholder="e.g. cad_civil3d" />
      </label>
      <input
        className="pay-prog__rate-edit-label"
        value={draft.label}
        onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
        placeholder="Label"
      />
      <label className="pay-prog__rate-edit-field">
        <span>Bonus $/hr</span>
        <input type="number" min="0" step="0.25" value={draft.bonus_per_hour} onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))} />
      </label>
      <label className="pay-prog__rate-edit-field">
        <span>Type</span>
        <select value={draft.credential_type} onChange={e => setDraft(d => ({ ...d, credential_type: e.target.value }))}>
          <option value="exam">Exam</option>
          <option value="license">License</option>
          <option value="safety">Safety</option>
          <option value="cert">Certification</option>
          <option value="other">Other</option>
        </select>
      </label>
      <div className="pay-prog__rate-edit-actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add'}</button>
        <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ─── XP milestone admin manager (P-13) ──────────────────────────────────────
// Table-style editor below the XP progress bar. Each milestone gets a row
// with inline fields; admin can edit threshold/bonus/label/active in place.

export interface XpMilestoneManagerProps {
  milestones: XpMilestone[];
  onChanged: () => void;
}

export function XpMilestoneManager({ milestones, onChanged }: XpMilestoneManagerProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="pay-prog__xp-manager">
      <h4 className="pay-prog__xp-manager-title">Manage milestones</h4>
      <div className="pay-prog__xp-manager-list">
        {milestones.map(m => <XpMilestoneRow key={m.xp_threshold} milestone={m} onChanged={onChanged} />)}
      </div>
      {!adding ? (
        <button type="button" className="pay-prog__rung-add" onClick={() => setAdding(true)} style={{ marginLeft: 0 }}>
          <span aria-hidden="true">+</span> Add milestone
        </button>
      ) : (
        <NewXpMilestoneRow onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}

export function XpMilestoneRow({ milestone, onChanged }: { milestone: XpMilestone; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    xp_threshold: milestone.xp_threshold,
    bonus_per_hour: milestone.bonus_per_hour,
    label: milestone.label || '',
  });

  useEffect(() => {
    setDraft({
      xp_threshold: milestone.xp_threshold,
      bonus_per_hour: milestone.bonus_per_hour,
      label: milestone.label || '',
    });
  }, [milestone.xp_threshold, milestone.bonus_per_hour, milestone.label]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/xp-milestones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp_threshold: milestone.xp_threshold,
          new_xp_threshold: Number(draft.xp_threshold),
          bonus_per_hour: Number(draft.bonus_per_hour),
          label: draft.label || null,
        }),
      });
      if (res.ok) { setEditing(false); onChanged(); }
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove "${milestone.label || `${milestone.xp_threshold} XP`}" milestone?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/xp-milestones?xp_threshold=${milestone.xp_threshold}`, { method: 'DELETE' });
      if (res.ok) onChanged();
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="pay-prog__xp-manager-row">
        <span className="pay-prog__xp-manager-threshold">{milestone.xp_threshold.toLocaleString()} XP</span>
        <span className="pay-prog__xp-manager-label">{milestone.label || '—'}</span>
        <span className="pay-prog__xp-manager-bonus">+${Number(milestone.bonus_per_hour).toFixed(2)}/hr</span>
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }

  return (
    <div className="pay-prog__xp-manager-row pay-prog__xp-manager-row--editing">
      <input type="number" min="0" step="1000" value={draft.xp_threshold} onChange={e => setDraft(d => ({ ...d, xp_threshold: Number(e.target.value) }))} placeholder="Threshold" />
      <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Label" />
      <input type="number" min="0" step="0.25" value={draft.bonus_per_hour} onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))} placeholder="Bonus" />
      <div className="pay-prog__rate-edit-actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>Delete</button>
      </div>
    </div>
  );
}

export function NewXpMilestoneRow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ xp_threshold: 70000, bonus_per_hour: 0.5, label: '' });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/xp-milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp_threshold: Number(draft.xp_threshold),
          bonus_per_hour: Number(draft.bonus_per_hour),
          label: draft.label || null,
          is_active: true,
        }),
      });
      if (res.ok) onDone();
      else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to add');
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="pay-prog__xp-manager-row pay-prog__xp-manager-row--editing">
      <input type="number" min="0" step="1000" value={draft.xp_threshold} onChange={e => setDraft(d => ({ ...d, xp_threshold: Number(e.target.value) }))} placeholder="Threshold" />
      <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Label" />
      <input type="number" min="0" step="0.25" value={draft.bonus_per_hour} onChange={e => setDraft(d => ({ ...d, bonus_per_hour: Number(e.target.value) }))} placeholder="Bonus" />
      <div className="pay-prog__rate-edit-actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add'}</button>
        <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── System config panel (P-14) ─────────────────────────────────────────────
// Lists all pay_system_config rows. Each row's `value` is editable inline.
// Keys are stable so we don't expose POST/DELETE. Admin-only.

export interface SystemConfigEntry {
  key: string;
  value: number;
  description: string | null;
}

export function SystemConfigPanel() {
  const [entries, setEntries] = useState<SystemConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/admin/pay-config/system');
      if (res.ok) {
        const data = await res.json() as { config: SystemConfigEntry[] };
        setEntries(data.config || []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="pay-prog__section">Loading system caps…</div>;
  }

  return (
    <div className="pay-prog__section">
      <div className="pay-prog__section-header">
        <h3 className="pay-prog__section-title"><Settings size={18} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />System Caps & Constants</h3>
        <span className="pay-prog__section-count">{entries.length} keys · admin-only</span>
      </div>
      <p className="pay-prog__section-desc">
        Global caps that the calculation honors. These are read-only references on the public page;
        edits here apply immediately to everyone&apos;s effective rate.
      </p>
      <div className="pay-prog__xp-manager-list">
        {entries.map(e => <SystemConfigRow key={e.key} entry={e} onSaved={load} />)}
      </div>
    </div>
  );
}

export function SystemConfigRow({ entry, onSaved }: { entry: SystemConfigEntry; onSaved: () => void }) {
  const [value, setValue] = useState<number>(entry.value);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(entry.value);
    setDirty(false);
  }, [entry.key, entry.value]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: entry.key, value: Number(value) }),
      });
      if (res.ok) {
        setDirty(false);
        onSaved();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to save');
      }
    } finally { setSaving(false); }
  }

  return (
    <div className={`pay-prog__config-row ${dirty ? 'pay-prog__config-row--dirty' : ''}`}>
      <div className="pay-prog__config-key-block">
        <code className="pay-prog__config-key">{entry.key}</code>
        {entry.description && <span className="pay-prog__config-desc">{entry.description}</span>}
      </div>
      <input
        type="number"
        step="0.01"
        className="pay-prog__config-value"
        value={value}
        onChange={e => { setValue(Number(e.target.value)); setDirty(true); }}
      />
      <button
        type="button"
        className="btn btn--sm btn--primary"
        disabled={saving || !dirty}
        onClick={save}
      >
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
}

// ─── Credential approval queue (P-21) ───────────────────────────────────────
// Admin panel listing all pending earned credentials. Approve flips
// verified=true (the bump becomes live via the rewards-API filter).
// Deny removes the pending row. Hidden by default — only renders when
// admin edit mode is on.

export interface QueueEntry {
  id: string;
  user_email: string;
  credential_key: string;
  earned_date: string;
  source: string | null;
  created_at: string;
  bonus_per_hour: number | null;
  credential_label: string | null;
}

export function CredentialQueue() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pay-config/credential-queue');
      if (res.ok) {
        const data = await res.json() as { queue: QueueEntry[] };
        setQueue(data.queue || []);
      }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, action: 'approve' | 'deny') {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/pay-config/credential-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) load();
      else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Action failed');
      }
    } finally { setBusyId(null); }
  }

  if (loading) {
    return <div className="pay-prog__section">Loading credential queue…</div>;
  }

  return (
    <div className="pay-prog__section">
      <div className="pay-prog__section-header">
        <h3 className="pay-prog__section-title"><ShieldCheck size={18} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Credential approval queue</h3>
        <span className="pay-prog__section-count">{queue.length} pending</span>
      </div>
      <p className="pay-prog__section-desc">
        When an employee completes a learning module that maps to a credential, a pending row is
        created here. Approving flips <code>verified=true</code> so the pay calculator counts the
        bump on the next reload. Denying removes the row.
      </p>
      {queue.length === 0 ? (
        <p className="pay-prog__section-desc" style={{ marginTop: '0.5rem' }}>
          <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />Nothing waiting — every earned credential has been verified.
        </p>
      ) : (
        <div className="pay-prog__audit-list">
          {queue.map(q => (
            <div key={q.id} className="pay-prog__queue-row">
              <div className="pay-prog__queue-info">
                <div className="pay-prog__queue-head">
                  <span className="pay-prog__queue-user">{q.user_email}</span>
                  <span className="pay-prog__queue-cred">
                    {q.credential_label || q.credential_key}
                    {q.bonus_per_hour !== null && (
                      <strong className="pay-prog__queue-bonus"> · +${Number(q.bonus_per_hour).toFixed(2)}/hr</strong>
                    )}
                  </span>
                </div>
                <span className="pay-prog__queue-meta">
                  Earned {q.earned_date}
                  {q.source && <> · source <code>{q.source}</code></>}
                  &nbsp;· submitted {new Date(q.created_at).toLocaleString()}
                </span>
              </div>
              <div className="pay-prog__queue-actions">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={busyId === q.id}
                  onClick={() => act(q.id, 'approve')}
                >
                  {busyId === q.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  disabled={busyId === q.id}
                  onClick={() => {
                    if (window.confirm(`Deny ${q.credential_key} for ${q.user_email}? The pending row will be deleted.`)) {
                      act(q.id, 'deny');
                    }
                  }}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
