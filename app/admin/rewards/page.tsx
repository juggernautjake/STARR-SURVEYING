// app/admin/rewards/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Balance {
  current_balance: number;
  total_earned: number;
  total_spent: number;
}

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  xp_cost: number;
  cash_price: number | null;
  tier: string;
  stock_quantity: number;
  is_active: boolean;
  image_url?: string;
}

interface Badge {
  id: string;
  badge_key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xp_reward: number;
  earned: boolean;
  earned_at: string | null;
}

interface Purchase {
  id: string;
  xp_spent: number;
  status: string;
  created_at: string;
  rewards_catalog: { name: string; category: string; tier: string };
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronze (500-2K XP)',
  silver: 'Silver (2K-5K XP)',
  gold: 'Gold (5K-10K XP)',
  platinum: 'Platinum (10K-20K XP)',
  diamond: 'Diamond (20K+ XP)',
};

const CATEGORY_ICONS: Record<string, string> = {
  apparel: '\uD83D\uDC55',
  gear: '\uD83E\uDDF0',
  gift_cards: '\uD83C\uDF81',
  accessories: '\uD83C\uDF1F',
  cash_bonus: '\uD83D\uDCB0',
  other: '\uD83D\uDCE6',
};

export default function RewardsPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'store' | 'badges' | 'history'>('store');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/rewards?section=all');
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance || null);
        setCatalog(data.catalog || []);
        setBadges(data.badges || []);
        setPurchases(data.purchases || []);
      }
    } catch (err) { console.error('RewardsPage: fetch failed', err); }
    setLoading(false);
  }

  async function purchaseItem(itemId: string, paymentMethod: 'xp' | 'cash' = 'xp') {
    setPurchasing(itemId);
    try {
      const res = await fetch('/api/admin/rewards/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, payment_method: paymentMethod }),
      });
      if (res.ok) {
        const data = await res.json();
        if (paymentMethod === 'xp') {
          setBalance(prev => prev ? { ...prev, current_balance: data.new_balance } : prev);
        }
        // Notify topbar to refresh XP display
        window.dispatchEvent(new Event('xp-updated'));
        alert(paymentMethod === 'cash'
          ? `Cash purchase of $${data.cash_amount?.toFixed(2)} submitted! An admin will process your order.`
          : 'Purchase successful! An admin will fulfill your order soon.'
        );
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Purchase failed');
      }
    } catch { alert('Purchase failed'); }
    setPurchasing(null);
  }

  const filteredCatalog = catalog.filter(item => {
    if (filterTier !== 'all' && item.tier !== filterTier) return false;
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    return true;
  });

  const earnedBadges = badges.filter(b => b.earned);
  const unearnedBadges = badges.filter(b => !b.earned);

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading Rewards...</div>
    </div>
  );

  return (
    <>
      {/* XP Balance Hero */}
      <div className="rewards__hero">
        <div className="rewards__hero-balance">
          <span className="rewards__hero-label">Your XP Balance</span>
          <span className="rewards__hero-amount">{(balance?.current_balance || 0).toLocaleString()} XP</span>
          <span className="rewards__hero-sublabel">
            {(balance?.total_earned || 0).toLocaleString()} earned all-time
          </span>
        </div>
        <div className="rewards__hero-stats">
          <div className="rewards__hero-stat">
            <span className="rewards__hero-stat-value">{earnedBadges.length}</span>
            <span className="rewards__hero-stat-label">Badges</span>
          </div>
          <div className="rewards__hero-stat">
            <span className="rewards__hero-stat-value">{purchases.length}</span>
            <span className="rewards__hero-stat-label">Purchases</span>
          </div>
          <div className="rewards__hero-stat">
            <span className="rewards__hero-stat-value">{(balance?.total_spent || 0).toLocaleString()}</span>
            <span className="rewards__hero-stat-label">XP Spent</span>
          </div>
        </div>
        <div className="rewards__hero-links">
          <Link href="/admin/rewards/how-it-works" className="admin-btn admin-btn--ghost">
            Learn How Rewards Work
          </Link>
          <Link href="/admin/pay-progression" className="admin-btn admin-btn--secondary">
            View Pay Progression
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="rewards__tabs">
        <button className={`rewards__tab ${activeTab === 'store' ? 'rewards__tab--active' : ''}`} onClick={() => setActiveTab('store')}>
          &#x1F6CD;&#xFE0F; Company Store
        </button>
        <button className={`rewards__tab ${activeTab === 'badges' ? 'rewards__tab--active' : ''}`} onClick={() => setActiveTab('badges')}>
          &#x1F3C6; Badges
        </button>
        <button className={`rewards__tab ${activeTab === 'history' ? 'rewards__tab--active' : ''}`} onClick={() => setActiveTab('history')}>
          &#x1F4CB; Purchase History
        </button>
      </div>

      {/* STORE TAB */}
      {activeTab === 'store' && (
        <div className="rewards__store">
          <div className="rewards__store-filters">
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="rewards__filter-select">
              <option value="all">All Tiers</option>
              {Object.entries(TIER_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rewards__filter-select">
              <option value="all">All Categories</option>
              <option value="apparel">Apparel</option>
              <option value="gear">Gear</option>
              <option value="gift_cards">Gift Cards</option>
              <option value="accessories">Accessories</option>
              <option value="cash_bonus">Cash Bonuses</option>
            </select>
          </div>

          <div className="rewards__store-grid">
            {filteredCatalog.map(item => {
              const canAfford = (balance?.current_balance || 0) >= item.xp_cost;
              const outOfStock = item.stock_quantity === 0;
              return (
                <div
                  key={item.id}
                  className={`rewards__item ${!canAfford ? 'rewards__item--locked' : ''} ${outOfStock ? 'rewards__item--sold-out' : ''}`}
                  title={!canAfford ? `Need ${(item.xp_cost - (balance?.current_balance || 0)).toLocaleString()} more XP` : ''}
                >
                  <div className="rewards__item-tier" style={{ background: TIER_COLORS[item.tier] || '#888' }}>
                    {item.tier.toUpperCase()}
                  </div>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="rewards__item-image" />
                  ) : (
                    <div className="rewards__item-icon">
                      {CATEGORY_ICONS[item.category] || '\uD83D\uDCE6'}
                    </div>
                  )}
                  <h4 className="rewards__item-name">{item.name}</h4>
                  <p className="rewards__item-desc">{item.description}</p>
                  <div className="rewards__item-cost">
                    <span className="rewards__item-xp">{item.xp_cost.toLocaleString()} XP</span>
                    {item.cash_price ? (
                      <span className="rewards__item-cash">or ${item.cash_price.toFixed(2)}</span>
                    ) : null}
                  </div>
                  {outOfStock ? (
                    <span className="rewards__item-unavailable">Sold Out</span>
                  ) : (
                    <div className="rewards__item-buttons">
                      {canAfford ? (
                        <button
                          className="admin-btn admin-btn--primary rewards__item-btn"
                          onClick={() => purchaseItem(item.id, 'xp')}
                          disabled={purchasing === item.id}
                        >
                          {purchasing === item.id ? 'Processing...' : 'Redeem with XP'}
                        </button>
                      ) : (
                        <span className="rewards__item-unavailable" style={{ fontSize: '0.7rem' }}>
                          Need {(item.xp_cost - (balance?.current_balance || 0)).toLocaleString()} more XP
                        </span>
                      )}
                      {item.cash_price ? (
                        <button
                          className="admin-btn admin-btn--secondary rewards__item-btn"
                          onClick={() => {
                            if (confirm(`Purchase "${item.name}" for $${item.cash_price!.toFixed(2)}?`)) {
                              purchaseItem(item.id, 'cash');
                            }
                          }}
                          disabled={purchasing === item.id}
                        >
                          Buy for ${item.cash_price.toFixed(2)}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BADGES TAB */}
      {activeTab === 'badges' && (
        <div className="rewards__badges">
          {earnedBadges.length > 0 && (
            <>
              <h3 className="rewards__section-title">Earned Badges ({earnedBadges.length})</h3>
              <div className="rewards__badges-grid">
                {earnedBadges.map(b => (
                  <div key={b.id} className="rewards__badge rewards__badge--earned">
                    <span className="rewards__badge-icon">{b.icon}</span>
                    <h4 className="rewards__badge-name">{b.name}</h4>
                    <p className="rewards__badge-desc">{b.description}</p>
                    {b.xp_reward > 0 && <span className="rewards__badge-xp">+{b.xp_reward} XP</span>}
                    <span className="rewards__badge-date">
                      Earned {b.earned_at ? new Date(b.earned_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {unearnedBadges.length > 0 && (
            <>
              <h3 className="rewards__section-title" style={{ marginTop: '1.5rem' }}>Available Badges ({unearnedBadges.length})</h3>
              <div className="rewards__badges-grid">
                {unearnedBadges.map(b => (
                  <div key={b.id} className="rewards__badge rewards__badge--locked">
                    <span className="rewards__badge-icon">{b.icon}</span>
                    <h4 className="rewards__badge-name">{b.name}</h4>
                    <p className="rewards__badge-desc">{b.description}</p>
                    {b.xp_reward > 0 && <span className="rewards__badge-xp">+{b.xp_reward} XP</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="rewards__history">
          {purchases.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty__icon">&#x1F6D2;</div>
              <div className="admin-empty__title">No purchases yet</div>
              <div className="admin-empty__desc">Earn XP by completing modules and exams, then redeem them in the store!</div>
            </div>
          ) : (
            purchases.map(p => (
              <div key={p.id} className="rewards__purchase-row">
                <div className="rewards__purchase-info">
                  <span className="rewards__purchase-name">{p.rewards_catalog?.name || 'Unknown Item'}</span>
                  <span className="rewards__purchase-cost">{p.xp_spent.toLocaleString()} XP</span>
                </div>
                <div className="rewards__purchase-meta">
                  <span className={`rewards__purchase-status rewards__purchase-status--${p.status}`}>
                    {p.status}
                  </span>
                  <span className="rewards__purchase-date">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
