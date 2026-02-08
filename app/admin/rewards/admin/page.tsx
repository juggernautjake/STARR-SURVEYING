// app/admin/rewards/admin/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface StoreItem {
  id: string;
  name: string;
  description: string;
  category: string;
  xp_cost: number;
  tier: string;
  stock_quantity: number;
  is_active: boolean;
  sort_order: number;
}

interface Purchase {
  id: string;
  user_email: string;
  xp_spent: number;
  status: string;
  created_at: string;
  rewards_catalog: { name: string; category: string; tier: string };
}

interface Milestone {
  id: string;
  xp_threshold: number;
  bonus_per_hour: number;
  label: string;
  is_active: boolean;
}

interface Badge {
  id: string;
  badge_key: string;
  name: string;
  icon: string;
  category: string;
  xp_reward: number;
  is_active: boolean;
}

export default function AdminRewardsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<Purchase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'purchases' | 'store' | 'milestones' | 'badges' | 'award'>('purchases');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Award XP form
  const [awardEmail, setAwardEmail] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [awardDesc, setAwardDesc] = useState('');

  // New item form
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', description: '', category: 'gear', xp_cost: 1000, tier: 'silver', stock_quantity: -1 });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/rewards/store');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPendingPurchases(data.pending_purchases || []);
        setMilestones(data.milestones || []);
        setBadges(data.badges || []);
      }
    } catch (err) { console.error('AdminRewardsPage: fetch failed', err); }
    setLoading(false);
  }

  async function handlePurchaseAction(purchaseId: string, status: string) {
    setActionLoading(purchaseId);
    try {
      await fetch('/api/admin/rewards/purchase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_id: purchaseId, status }),
      });
      fetchData();
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleAwardXP() {
    if (!awardEmail || !awardAmount || !awardDesc) return alert('Fill in all fields');
    setActionLoading('award');
    try {
      const res = await fetch('/api/admin/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'award_xp',
          user_email: awardEmail,
          amount: parseInt(awardAmount),
          description: awardDesc,
          transaction_type: 'admin_adjustment',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Awarded ${awardAmount} XP to ${awardEmail}. New balance: ${data.balance}`);
        setAwardEmail(''); setAwardAmount(''); setAwardDesc('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to award XP');
      }
    } catch { alert('Failed to award XP'); }
    setActionLoading(null);
  }

  async function handleAddItem() {
    setActionLoading('new-item');
    try {
      const res = await fetch('/api/admin/rewards/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (res.ok) {
        setShowNewItem(false);
        setNewItem({ name: '', description: '', category: 'gear', xp_cost: 1000, tier: 'silver', stock_quantity: -1 });
        fetchData();
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function toggleItemActive(itemId: string, currentActive: boolean) {
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      await fetch('/api/admin/rewards/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: !currentActive }),
      });
      fetchData();
    } catch { /* ignore */ }
  }

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading Admin Rewards...</div>
    </div>
  );

  return (
    <>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">&#x2699;&#xFE0F; Manage Rewards & XP</h2>
        <p className="admin-learn__subtitle">Configure store items, manage purchases, award XP, and control badges.</p>
      </div>

      <div className="rewards__tabs">
        {(['purchases', 'store', 'milestones', 'badges', 'award'] as const).map(tab => (
          <button key={tab} className={`rewards__tab ${activeTab === tab ? 'rewards__tab--active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'purchases' ? `Pending Orders (${pendingPurchases.length})` :
             tab === 'store' ? `Store Items (${items.length})` :
             tab === 'milestones' ? 'XP Milestones' :
             tab === 'badges' ? 'Badges' : 'Award XP'}
          </button>
        ))}
      </div>

      {/* PENDING PURCHASES */}
      {activeTab === 'purchases' && (
        <div>
          {pendingPurchases.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty__icon">&#x2705;</div>
              <div className="admin-empty__title">No pending orders</div>
            </div>
          ) : (
            pendingPurchases.map(p => (
              <div key={p.id} className="rewards__purchase-row">
                <div className="rewards__purchase-info">
                  <span className="rewards__purchase-name">{p.rewards_catalog?.name}</span>
                  <span className="rewards__purchase-cost">{p.xp_spent} XP</span>
                  <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>{p.user_email}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="admin-btn admin-btn--primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                    onClick={() => handlePurchaseAction(p.id, 'fulfilled')}
                    disabled={actionLoading === p.id}>
                    Fulfill
                  </button>
                  <button className="admin-btn admin-btn--ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: '#EF4444' }}
                    onClick={() => handlePurchaseAction(p.id, 'cancelled')}
                    disabled={actionLoading === p.id}>
                    Cancel &amp; Refund
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* STORE ITEMS */}
      {activeTab === 'store' && (
        <div>
          <button className="admin-btn admin-btn--primary" onClick={() => setShowNewItem(true)} style={{ marginBottom: '1rem' }}>
            + Add Store Item
          </button>

          {showNewItem && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', marginBottom: '0.75rem' }}>New Store Item</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <input placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="rewards__filter-select" style={{ width: '100%' }} />
                <input placeholder="Description" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="rewards__filter-select" style={{ width: '100%' }} />
                <select value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="rewards__filter-select">
                  <option value="apparel">Apparel</option>
                  <option value="gear">Gear</option>
                  <option value="gift_cards">Gift Cards</option>
                  <option value="accessories">Accessories</option>
                  <option value="cash_bonus">Cash Bonus</option>
                </select>
                <select value={newItem.tier} onChange={e => setNewItem({...newItem, tier: e.target.value})} className="rewards__filter-select">
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                  <option value="diamond">Diamond</option>
                </select>
                <input type="number" placeholder="XP Cost" value={newItem.xp_cost} onChange={e => setNewItem({...newItem, xp_cost: parseInt(e.target.value) || 0})} className="rewards__filter-select" style={{ width: '100%' }} />
                <input type="number" placeholder="Stock (-1 = unlimited)" value={newItem.stock_quantity} onChange={e => setNewItem({...newItem, stock_quantity: parseInt(e.target.value)})} className="rewards__filter-select" style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="admin-btn admin-btn--primary" onClick={handleAddItem} disabled={actionLoading === 'new-item'}>
                  {actionLoading === 'new-item' ? 'Saving...' : 'Save Item'}
                </button>
                <button className="admin-btn admin-btn--ghost" onClick={() => setShowNewItem(false)}>Cancel</button>
              </div>
            </div>
          )}

          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', background: item.is_active ? '#FFF' : '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '0.5rem', opacity: item.is_active ? 1 : 0.5 }}>
              <div>
                <strong style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem' }}>{item.name}</strong>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', padding: '0.1rem 0.4rem', background: '#EFF6FF', color: '#1D3095', borderRadius: '8px' }}>
                  {item.tier}
                </span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: '#6B7280' }}>{item.xp_cost} XP</span>
              </div>
              <button className="admin-btn admin-btn--ghost" style={{ fontSize: '0.72rem' }}
                onClick={() => toggleItemActive(item.id, item.is_active)}>
                {item.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* XP MILESTONES */}
      {activeTab === 'milestones' && (
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: '#6B7280', marginBottom: '1rem' }}>
            XP milestones determine automatic pay bonuses based on total XP earned.
          </p>
          {milestones.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <div>
                <strong style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem' }}>{m.label}</strong>
                <span style={{ marginLeft: '0.75rem', fontSize: '0.78rem', color: '#6B7280' }}>
                  {m.xp_threshold.toLocaleString()} XP
                </span>
              </div>
              <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, color: '#10B981' }}>
                +${m.bonus_per_hour.toFixed(2)}/hr
              </span>
            </div>
          ))}
        </div>
      )}

      {/* BADGES */}
      {activeTab === 'badges' && (
        <div>
          <div className="rewards__badges-grid">
            {badges.map(b => (
              <div key={b.id} className="rewards__badge" style={{ opacity: b.is_active ? 1 : 0.5 }}>
                <span className="rewards__badge-icon">{b.icon}</span>
                <h4 className="rewards__badge-name">{b.name}</h4>
                <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{b.category}</span>
                {b.xp_reward > 0 && <span className="rewards__badge-xp">+{b.xp_reward} XP</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AWARD XP */}
      {activeTab === 'award' && (
        <div style={{ maxWidth: '500px' }}>
          <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
            Manually Award XP
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              placeholder="Employee email"
              value={awardEmail}
              onChange={e => setAwardEmail(e.target.value)}
              className="rewards__filter-select"
              style={{ width: '100%', padding: '0.6rem 0.75rem' }}
            />
            <input
              type="number"
              placeholder="XP amount"
              value={awardAmount}
              onChange={e => setAwardAmount(e.target.value)}
              className="rewards__filter-select"
              style={{ width: '100%', padding: '0.6rem 0.75rem' }}
            />
            <input
              placeholder="Reason/description"
              value={awardDesc}
              onChange={e => setAwardDesc(e.target.value)}
              className="rewards__filter-select"
              style={{ width: '100%', padding: '0.6rem 0.75rem' }}
            />
            <button
              className="admin-btn admin-btn--primary"
              onClick={handleAwardXP}
              disabled={actionLoading === 'award'}
              style={{ padding: '0.65rem 1.5rem' }}
            >
              {actionLoading === 'award' ? 'Awarding...' : 'Award XP'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
