// app/admin/rewards/admin/page.tsx — Full Admin Rewards & Pay Management
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

/* ─── Interfaces ─── */
interface StoreItem {
  id: string; name: string; description: string; category: string;
  xp_cost: number; tier: string; stock_quantity: number; is_active: boolean; sort_order: number;
  image_url?: string;
}
interface Purchase {
  id: string; user_email: string; xp_spent: number; status: string; created_at: string;
  rewards_catalog: { name: string; category: string; tier: string };
}
interface Milestone {
  id: string; xp_threshold: number; bonus_per_hour: number;
  label: string; description: string; is_active: boolean;
}
interface WorkTypeRate {
  work_type: string; base_rate: number; icon: string; label: string;
  max_bonus_cap: number | null; bonus_multiplier: number | null;
}
interface RoleTier {
  role_key: string; label: string; base_bonus: number; max_effective_rate: number | null;
}
interface SeniorityBracket {
  id: string; min_years: number; max_years: number | null;
  bonus_per_hour: number; label: string;
}
interface CredentialBonus {
  credential_key: string; label: string; bonus_per_hour: number; credential_type: string;
}
interface PayConfig {
  key: string; value: number; description: string;
}
interface Badge {
  id: string; badge_key: string; name: string; icon: string;
  category: string; xp_reward: number; is_active: boolean;
}

type Tab = 'purchases' | 'store' | 'milestones' | 'work_types' | 'roles' | 'seniority' | 'credentials' | 'pay_config' | 'badges' | 'award';

export default function AdminRewardsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<Purchase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [workTypeRates, setWorkTypeRates] = useState<WorkTypeRate[]>([]);
  const [roleTiers, setRoleTiers] = useState<RoleTier[]>([]);
  const [seniorityBrackets, setSeniorityBrackets] = useState<SeniorityBracket[]>([]);
  const [credentialBonuses, setCredentialBonuses] = useState<CredentialBonus[]>([]);
  const [payConfig, setPayConfig] = useState<PayConfig[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('purchases');
  const [saving, setSaving] = useState<string | null>(null);

  // Award XP form
  const [awardEmail, setAwardEmail] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [awardDesc, setAwardDesc] = useState('');

  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);

  // New item / milestone forms
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', description: '', category: 'gear', xp_cost: 1000, tier: 'silver', stock_quantity: -1, image_url: '' });
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ xp_threshold: 10000, bonus_per_hour: 0.50, label: '', description: '' });

  // Image upload
  const [editImageUrl, setEditImageUrl] = useState('');
  const newFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/rewards/store');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPendingPurchases(data.pending_purchases || []);
        setMilestones(data.milestones || []);
        setWorkTypeRates(data.work_type_rates || []);
        setRoleTiers(data.role_tiers || []);
        setSeniorityBrackets(data.seniority_brackets || []);
        setCredentialBonuses(data.credential_bonuses || []);
        setPayConfig(data.pay_config || []);
        setBadges(data.badges || []);
      }
    } catch (err) { console.error('AdminRewardsPage: fetch failed', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Generic entity save ─── */
  async function saveEntity(entity: string, id: string, updates: Record<string, unknown>) {
    setSaving(id);
    try {
      const res = await fetch('/api/admin/rewards/store', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id, ...updates }),
      });
      if (res.ok) { setEditingId(null); fetchData(); }
      else { const err = await res.json(); alert(err.error || 'Save failed'); }
    } catch { alert('Save failed'); }
    setSaving(null);
  }

  async function deleteEntity(entity: string, id: string) {
    if (!confirm('Are you sure you want to delete this?')) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/rewards/store?entity=${entity}&id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
      else { const err = await res.json(); alert(err.error || 'Delete failed'); }
    } catch { alert('Delete failed'); }
    setSaving(null);
  }

  /* ─── Purchase actions ─── */
  async function handlePurchaseAction(purchaseId: string, status: string) {
    setSaving(purchaseId);
    try {
      await fetch('/api/admin/rewards/purchase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_id: purchaseId, status }),
      });
      fetchData();
    } catch { /* ignore */ }
    setSaving(null);
  }

  /* ─── Award XP ─── */
  async function handleAwardXP() {
    if (!awardEmail || !awardAmount || !awardDesc) return alert('Fill in all fields');
    setSaving('award');
    try {
      const res = await fetch('/api/admin/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'award_xp', user_email: awardEmail, amount: parseInt(awardAmount), description: awardDesc, transaction_type: 'admin_adjustment' }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Awarded ${awardAmount} XP to ${awardEmail}. New balance: ${data.balance}`);
        setAwardEmail(''); setAwardAmount(''); setAwardDesc('');
      } else { const err = await res.json(); alert(err.error || 'Failed'); }
    } catch { alert('Failed to award XP'); }
    setSaving(null);
  }

  /* ─── Add new store item ─── */
  async function handleAddItem() {
    setSaving('new-item');
    try {
      const res = await fetch('/api/admin/rewards/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (res.ok) { setShowNewItem(false); setNewItem({ name: '', description: '', category: 'gear', xp_cost: 1000, tier: 'silver', stock_quantity: -1, image_url: '' }); fetchData(); }
    } catch { /* ignore */ }
    setSaving(null);
  }

  /* ─── Add new milestone ─── */
  async function handleAddMilestone() {
    if (!newMilestone.label) return alert('Label is required');
    setSaving('new-ms');
    try {
      const res = await fetch('/api/admin/rewards/store', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'milestone', ...newMilestone }),
      });
      if (res.ok) { setShowNewMilestone(false); setNewMilestone({ xp_threshold: 10000, bonus_per_hour: 0.50, label: '', description: '' }); fetchData(); }
    } catch { /* ignore */ }
    setSaving(null);
  }

  /* ─── Image upload helpers ─── */
  function handleNewItemImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setNewItem(prev => ({ ...prev, image_url: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function handleEditItemImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setEditImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  /* ─── Inline edit helpers ─── */
  function EditableNum({ value, onSave, label, min, step }: { value: number; onSave: (v: number) => void; label: string; min?: number; step?: string }) {
    const [val, setVal] = useState(value);
    return (
      <div className="mng__inline-field">
        <label className="mng__inline-label">{label}</label>
        <input type="number" className="mng__inline-input" value={val} min={min ?? 0} step={step ?? '0.01'}
          onChange={e => setVal(parseFloat(e.target.value) || 0)} onBlur={() => onSave(val)} />
      </div>
    );
  }

  function EditableText({ value, onSave, label, placeholder }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string }) {
    const [val, setVal] = useState(value);
    return (
      <div className="mng__inline-field">
        <label className="mng__inline-label">{label}</label>
        <input type="text" className="mng__inline-input" value={val} placeholder={placeholder}
          onChange={e => setVal(e.target.value)} onBlur={() => onSave(val)} />
      </div>
    );
  }

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading Admin Rewards...</div>
    </div>
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'purchases', label: `Orders (${pendingPurchases.length})` },
    { key: 'store', label: `Store (${items.length})` },
    { key: 'milestones', label: 'XP Milestones' },
    { key: 'work_types', label: 'Work Types' },
    { key: 'roles', label: 'Roles' },
    { key: 'seniority', label: 'Seniority' },
    { key: 'credentials', label: 'Credentials' },
    { key: 'pay_config', label: 'Pay Caps' },
    { key: 'badges', label: 'Badges' },
    { key: 'award', label: 'Award XP' },
  ];

  return (
    <>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">&#x2699;&#xFE0F; Manage Rewards & Pay System</h2>
        <p className="admin-learn__subtitle">Full control over store items, pay rates, bonuses, caps, milestones, and more. Changes are reflected immediately on employee pages.</p>
      </div>

      <div className="rewards__tabs">
        {TABS.map(tab => (
          <button key={tab.key} className={`rewards__tab ${activeTab === tab.key ? 'rewards__tab--active' : ''}`} onClick={() => { setActiveTab(tab.key); setEditingId(null); }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════ PENDING PURCHASES ══════ */}
      {activeTab === 'purchases' && (
        <div className="mng__section">
          {pendingPurchases.length === 0 ? (
            <div className="admin-empty"><div className="admin-empty__icon">&#x2705;</div><div className="admin-empty__title">No pending orders</div></div>
          ) : pendingPurchases.map(p => (
            <div key={p.id} className="mng__row">
              <div className="mng__row-info">
                <strong>{p.rewards_catalog?.name}</strong>
                <span className="mng__row-meta">{p.xp_spent} XP &middot; {p.user_email}</span>
              </div>
              <div className="mng__row-actions">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => handlePurchaseAction(p.id, 'fulfilled')} disabled={saving === p.id}>Fulfill</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ color: '#EF4444' }} onClick={() => handlePurchaseAction(p.id, 'cancelled')} disabled={saving === p.id}>Cancel &amp; Refund</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ STORE ITEMS ══════ */}
      {activeTab === 'store' && (
        <div className="mng__section">
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setShowNewItem(true)} style={{ marginBottom: '1rem' }}>+ Add Store Item</button>

          {showNewItem && (
            <div className="mng__card mng__card--new">
              <h4 className="mng__card-title">New Store Item</h4>
              <div className="mng__form-grid">
                <input placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="mng__input" />
                <input placeholder="Description" value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} className="mng__input" />
                <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="mng__input">
                  <option value="apparel">Apparel</option><option value="gear">Gear</option><option value="gift_cards">Gift Cards</option>
                  <option value="accessories">Accessories</option><option value="cash_bonus">Cash Bonus</option>
                </select>
                <select value={newItem.tier} onChange={e => setNewItem({ ...newItem, tier: e.target.value })} className="mng__input">
                  <option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option>
                  <option value="platinum">Platinum</option><option value="diamond">Diamond</option>
                </select>
                <input type="number" placeholder="XP Cost" value={newItem.xp_cost} onChange={e => setNewItem({ ...newItem, xp_cost: parseInt(e.target.value) || 0 })} className="mng__input" />
                <input type="number" placeholder="Stock (-1 = unlimited)" value={newItem.stock_quantity} onChange={e => setNewItem({ ...newItem, stock_quantity: parseInt(e.target.value) })} className="mng__input" />
              </div>
              <div className="mng__image-upload">
                <label className="mng__inline-label">Product Image</label>
                <div className="mng__image-row">
                  {newItem.image_url && <img src={newItem.image_url} alt="Preview" className="mng__image-preview" />}
                  <input type="file" ref={newFileRef} accept="image/*" onChange={handleNewItemImage} style={{ display: 'none' }} />
                  <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => newFileRef.current?.click()}>
                    {newItem.image_url ? 'Change Image' : 'Upload Image'}
                  </button>
                  {newItem.image_url && <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setNewItem(prev => ({ ...prev, image_url: '' }))}>Remove</button>}
                </div>
              </div>
              <div className="mng__form-actions">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleAddItem} disabled={saving === 'new-item'}>{saving === 'new-item' ? 'Saving...' : 'Save Item'}</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowNewItem(false)}>Cancel</button>
              </div>
            </div>
          )}

          {items.map(item => (
            <div key={item.id} className={`mng__card ${!item.is_active ? 'mng__card--inactive' : ''}`}>
              {editingId === item.id ? (
                <>
                  <div className="mng__form-grid">
                    <EditableText value={item.name} onSave={v => { item.name = v; }} label="Name" />
                    <EditableText value={item.description} onSave={v => { item.description = v; }} label="Description" />
                    <EditableNum value={item.xp_cost} onSave={v => { item.xp_cost = v; }} label="XP Cost" step="1" />
                    <EditableNum value={item.stock_quantity} onSave={v => { item.stock_quantity = v; }} label="Stock (-1=unlimited)" min={-1} step="1" />
                    <EditableNum value={item.sort_order} onSave={v => { item.sort_order = v; }} label="Sort Order" step="1" />
                  </div>
                  <div className="mng__image-upload">
                    <label className="mng__inline-label">Product Image</label>
                    <div className="mng__image-row">
                      {(editImageUrl || item.image_url) && <img src={editImageUrl || item.image_url} alt={item.name} className="mng__image-preview" />}
                      <input type="file" ref={editFileRef} accept="image/*" onChange={handleEditItemImage} style={{ display: 'none' }} />
                      <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => editFileRef.current?.click()}>
                        {(editImageUrl || item.image_url) ? 'Change Image' : 'Upload Image'}
                      </button>
                      {(editImageUrl || item.image_url) && <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setEditImageUrl(''); item.image_url = ''; }}>Remove</button>}
                    </div>
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === item.id}
                      onClick={() => { saveEntity('store_item', item.id, { name: item.name, description: item.description, xp_cost: item.xp_cost, stock_quantity: item.stock_quantity, sort_order: item.sort_order, category: item.category, tier: item.tier, is_active: item.is_active, image_url: editImageUrl || item.image_url || null }); setEditImageUrl(''); }}>
                      Save
                    </button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setEditingId(null); setEditImageUrl(''); }}>Cancel</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ color: '#EF4444' }} onClick={() => deleteEntity('store_item', item.id)}>Delete</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(item.id)}>
                  {item.image_url && <img src={item.image_url} alt={item.name} className="mng__image-thumb" />}
                  <div className="mng__row-info">
                    <strong>{item.name}</strong>
                    <span className="mng__row-meta">
                      <span className="mng__badge">{item.tier}</span> {item.xp_cost} XP
                      {item.stock_quantity >= 0 && ` · ${item.stock_quantity} in stock`}
                    </span>
                  </div>
                  <div className="mng__row-actions">
                    <button className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={e => { e.stopPropagation(); saveEntity('store_item', item.id, { is_active: !item.is_active }); }}>
                      {item.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ XP MILESTONES ══════ */}
      {activeTab === 'milestones' && (
        <div className="mng__section">
          <p className="mng__desc">XP milestones grant automatic pay bonuses. Each milestone adds to the employee&apos;s hourly rate (subject to the global XP milestone cap).</p>
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setShowNewMilestone(true)} style={{ marginBottom: '1rem' }}>+ Add Milestone</button>

          {showNewMilestone && (
            <div className="mng__card mng__card--new">
              <h4 className="mng__card-title">New XP Milestone</h4>
              <div className="mng__form-grid">
                <div className="mng__inline-field"><label className="mng__inline-label">XP Threshold</label>
                  <input type="number" className="mng__inline-input" value={newMilestone.xp_threshold} onChange={e => setNewMilestone({ ...newMilestone, xp_threshold: parseInt(e.target.value) || 0 })} /></div>
                <div className="mng__inline-field"><label className="mng__inline-label">Bonus $/hr</label>
                  <input type="number" className="mng__inline-input" step="0.01" value={newMilestone.bonus_per_hour} onChange={e => setNewMilestone({ ...newMilestone, bonus_per_hour: parseFloat(e.target.value) || 0 })} /></div>
                <div className="mng__inline-field"><label className="mng__inline-label">Label</label>
                  <input className="mng__inline-input" value={newMilestone.label} onChange={e => setNewMilestone({ ...newMilestone, label: e.target.value })} placeholder="e.g. XP Expert" /></div>
                <div className="mng__inline-field"><label className="mng__inline-label">Description</label>
                  <input className="mng__inline-input" value={newMilestone.description} onChange={e => setNewMilestone({ ...newMilestone, description: e.target.value })} placeholder="Optional description" /></div>
              </div>
              <div className="mng__form-actions">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleAddMilestone} disabled={saving === 'new-ms'}>{saving === 'new-ms' ? 'Saving...' : 'Add Milestone'}</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowNewMilestone(false)}>Cancel</button>
              </div>
            </div>
          )}

          {milestones.map(m => (
            <div key={m.id} className={`mng__card ${!m.is_active ? 'mng__card--inactive' : ''}`}>
              {editingId === m.id ? (
                <>
                  <div className="mng__form-grid">
                    <EditableText value={m.label} onSave={v => { m.label = v; }} label="Label" />
                    <EditableText value={m.description || ''} onSave={v => { m.description = v; }} label="Description" />
                    <EditableNum value={m.xp_threshold} onSave={v => { m.xp_threshold = v; }} label="XP Threshold" step="1000" />
                    <EditableNum value={m.bonus_per_hour} onSave={v => { m.bonus_per_hour = v; }} label="Bonus $/hr" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === m.id}
                      onClick={() => saveEntity('milestone', m.id, { label: m.label, description: m.description, xp_threshold: m.xp_threshold, bonus_per_hour: m.bonus_per_hour })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ color: '#EF4444' }} onClick={() => deleteEntity('milestone', m.id)}>Delete</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(m.id)}>
                  <div className="mng__row-info">
                    <strong>{m.label}</strong>
                    <span className="mng__row-meta">{m.xp_threshold.toLocaleString()} XP</span>
                  </div>
                  <span className="mng__rate-badge">+${m.bonus_per_hour.toFixed(2)}/hr</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ WORK TYPE RATES ══════ */}
      {activeTab === 'work_types' && (
        <div className="mng__section">
          <p className="mng__desc">Base hourly rates, bonus multipliers, and per-type caps for each work category. These control how much employees earn for different types of work.</p>
          {workTypeRates.map(w => (
            <div key={w.work_type} className="mng__card">
              {editingId === w.work_type ? (
                <>
                  <h4 className="mng__card-title">{w.icon} {w.label || w.work_type}</h4>
                  <div className="mng__form-grid">
                    <EditableText value={w.label} onSave={v => { w.label = v; }} label="Display Label" />
                    <EditableText value={w.icon} onSave={v => { w.icon = v; }} label="Icon (emoji)" />
                    <EditableNum value={w.base_rate} onSave={v => { w.base_rate = v; }} label="Base Rate $/hr" />
                    <EditableNum value={w.bonus_multiplier ?? 1} onSave={v => { w.bonus_multiplier = v; }} label="Bonus Multiplier (0-1)" />
                    <EditableNum value={w.max_bonus_cap ?? 0} onSave={v => { w.max_bonus_cap = v; }} label="Max Bonus Cap $/hr" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === w.work_type}
                      onClick={() => saveEntity('work_type_rate', w.work_type, { label: w.label, icon: w.icon, base_rate: w.base_rate, bonus_multiplier: w.bonus_multiplier, max_bonus_cap: w.max_bonus_cap })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(w.work_type)}>
                  <div className="mng__row-info">
                    <strong>{w.icon} {w.label || w.work_type}</strong>
                    <span className="mng__row-meta">
                      Base: ${w.base_rate.toFixed(2)}/hr &middot;
                      Multiplier: {((w.bonus_multiplier ?? 1) * 100).toFixed(0)}% &middot;
                      Cap: ${(w.max_bonus_cap ?? 0).toFixed(0)}/hr
                    </span>
                  </div>
                  <span className="mng__rate-badge">${w.base_rate.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ ROLE TIERS ══════ */}
      {activeTab === 'roles' && (
        <div className="mng__section">
          <p className="mng__desc">Role progression tiers with base bonus and max effective rate ceilings. These determine how much extra employees earn based on their position.</p>
          {roleTiers.map(r => (
            <div key={r.role_key} className="mng__card">
              {editingId === r.role_key ? (
                <>
                  <h4 className="mng__card-title">{r.label || r.role_key}</h4>
                  <div className="mng__form-grid">
                    <EditableText value={r.label} onSave={v => { r.label = v; }} label="Display Label" />
                    <EditableNum value={r.base_bonus} onSave={v => { r.base_bonus = v; }} label="Base Bonus $/hr" />
                    <EditableNum value={r.max_effective_rate ?? 0} onSave={v => { r.max_effective_rate = v || null; }} label="Max Effective Rate (0=none)" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === r.role_key}
                      onClick={() => saveEntity('role_tier', r.role_key, { label: r.label, base_bonus: r.base_bonus, max_effective_rate: r.max_effective_rate })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(r.role_key)}>
                  <div className="mng__row-info">
                    <strong>{r.label || r.role_key}</strong>
                    <span className="mng__row-meta">
                      Bonus: +${r.base_bonus.toFixed(2)}/hr
                      {r.max_effective_rate ? ` · Max: $${r.max_effective_rate.toFixed(0)}/hr` : ' · No cap'}
                    </span>
                  </div>
                  <span className="mng__rate-badge">+${r.base_bonus.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ SENIORITY BRACKETS ══════ */}
      {activeTab === 'seniority' && (
        <div className="mng__section">
          <p className="mng__desc">Loyalty bonuses based on years of service. Each bracket adds to the employee&apos;s hourly rate.</p>
          {seniorityBrackets.map(s => (
            <div key={s.id} className="mng__card">
              {editingId === s.id ? (
                <>
                  <h4 className="mng__card-title">{s.label}</h4>
                  <div className="mng__form-grid">
                    <EditableText value={s.label} onSave={v => { s.label = v; }} label="Label" />
                    <EditableNum value={s.bonus_per_hour} onSave={v => { s.bonus_per_hour = v; }} label="Bonus $/hr" />
                    <EditableNum value={s.min_years} onSave={v => { s.min_years = v; }} label="Min Years" step="1" />
                    <EditableNum value={s.max_years ?? 99} onSave={v => { s.max_years = v >= 99 ? null : v; }} label="Max Years (99=none)" step="1" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === s.id}
                      onClick={() => saveEntity('seniority_bracket', s.id, { label: s.label, bonus_per_hour: s.bonus_per_hour, min_years: s.min_years, max_years: s.max_years })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(s.id)}>
                  <div className="mng__row-info">
                    <strong>{s.label}</strong>
                    <span className="mng__row-meta">{s.min_years}–{s.max_years ?? '∞'} years</span>
                  </div>
                  <span className="mng__rate-badge">+${s.bonus_per_hour.toFixed(2)}/hr</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ CREDENTIAL BONUSES ══════ */}
      {activeTab === 'credentials' && (
        <div className="mng__section">
          <p className="mng__desc">Per-credential hourly bonuses. Total credential bonus is capped by the &quot;max_credential_stack&quot; config value.</p>
          {credentialBonuses.map(c => (
            <div key={c.credential_key} className="mng__card">
              {editingId === c.credential_key ? (
                <>
                  <h4 className="mng__card-title">{c.label || c.credential_key}</h4>
                  <div className="mng__form-grid">
                    <EditableText value={c.label} onSave={v => { c.label = v; }} label="Display Label" />
                    <EditableNum value={c.bonus_per_hour} onSave={v => { c.bonus_per_hour = v; }} label="Bonus $/hr" />
                    <EditableText value={c.credential_type} onSave={v => { c.credential_type = v; }} label="Type (certification/license/exam)" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === c.credential_key}
                      onClick={() => saveEntity('credential_bonus', c.credential_key, { label: c.label, bonus_per_hour: c.bonus_per_hour, credential_type: c.credential_type })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(c.credential_key)}>
                  <div className="mng__row-info">
                    <strong>{c.label || c.credential_key}</strong>
                    <span className="mng__row-meta">{c.credential_type}</span>
                  </div>
                  <span className="mng__rate-badge">+${c.bonus_per_hour.toFixed(2)}/hr</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ PAY SYSTEM CONFIG / CAPS ══════ */}
      {activeTab === 'pay_config' && (
        <div className="mng__section">
          <p className="mng__desc">Global pay system caps and configuration values. These safeguards prevent runaway bonus stacking.</p>
          {payConfig.map(c => (
            <div key={c.key} className="mng__card">
              {editingId === c.key ? (
                <>
                  <h4 className="mng__card-title">{c.key}</h4>
                  <div className="mng__form-grid">
                    <EditableNum value={c.value} onSave={v => { c.value = v; }} label="Value" />
                    <EditableText value={c.description} onSave={v => { c.description = v; }} label="Description" />
                  </div>
                  <div className="mng__form-actions">
                    <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving === c.key}
                      onClick={() => saveEntity('pay_config', c.key, { value: c.value, description: c.description })}>Save</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="mng__row" onClick={() => setEditingId(c.key)}>
                  <div className="mng__row-info">
                    <strong>{c.key.replace(/_/g, ' ')}</strong>
                    <span className="mng__row-meta">{c.description}</span>
                  </div>
                  <span className="mng__rate-badge">{c.key.includes('interval') ? c.value.toLocaleString() : `$${c.value.toFixed(2)}`}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ BADGES ══════ */}
      {activeTab === 'badges' && (
        <div className="mng__section">
          <div className="rewards__badges-grid">
            {badges.map(b => (
              <div key={b.id} className="rewards__badge" style={{ opacity: b.is_active ? 1 : 0.5, cursor: 'pointer' }}
                onClick={() => setEditingId(editingId === b.id ? null : b.id)}>
                <span className="rewards__badge-icon">{b.icon}</span>
                <h4 className="rewards__badge-name">{b.name}</h4>
                <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{b.category}</span>
                {b.xp_reward > 0 && <span className="rewards__badge-xp">+{b.xp_reward} XP</span>}
                {editingId === b.id && (
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}
                    onClick={e => { e.stopPropagation(); saveEntity('badge', b.id, { is_active: !b.is_active }); }}>
                    {b.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ AWARD XP ══════ */}
      {activeTab === 'award' && (
        <div className="mng__section" style={{ maxWidth: '500px' }}>
          <h3 className="mng__card-title">Manually Award XP</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input placeholder="Employee email" value={awardEmail} onChange={e => setAwardEmail(e.target.value)} className="mng__input" />
            <input type="number" placeholder="XP amount" value={awardAmount} onChange={e => setAwardAmount(e.target.value)} className="mng__input" />
            <input placeholder="Reason/description" value={awardDesc} onChange={e => setAwardDesc(e.target.value)} className="mng__input" />
            <button className="admin-btn admin-btn--primary" onClick={handleAwardXP} disabled={saving === 'award'}>
              {saving === 'award' ? 'Awarding...' : 'Award XP'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
