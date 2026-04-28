// app/admin/users/page.tsx — Admin user management with expanded roles
'use client';
import '../styles/AdminUsers.css';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import type { UserRole } from '@/lib/auth';

const ALL_ROLES: UserRole[] = [
  'admin', 'developer', 'teacher', 'student', 'researcher',
  'drawer', 'field_crew', 'employee', 'guest', 'tech_support',
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  researcher: 'Researcher',
  drawer: 'Drawer',
  field_crew: 'Field Crew',
  employee: 'Employee',
  guest: 'Guest',
  tech_support: 'Tech Support',
  equipment_manager: 'Equipment Manager',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#DC2626',
  developer: '#7C3AED',
  teacher: '#2563EB',
  student: '#059669',
  researcher: '#D97706',
  drawer: '#0891B2',
  field_crew: '#65A30D',
  employee: '#6B7280',
  guest: '#9CA3AF',
  tech_support: '#EA580C',
  equipment_manager: '#0D9488', // teal — distinct from field_crew lime + tech_support orange
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access. Manage users, roles, payroll, settings.',
  developer: 'Full access for testing. No role/settings changes.',
  teacher: 'Create/edit learning content. Manage students.',
  student: 'Access learning: modules, flashcards, exam prep.',
  researcher: 'Property Research and Analysis tools.',
  drawer: 'CAD Editor and Research tools.',
  field_crew: 'Field work: jobs, hours, fieldbook, schedule.',
  employee: 'Base role. Dashboard, profile, learning basics.',
  guest: 'External user. Limited dashboard and learning.',
  tech_support: 'Error logs, view-only access for troubleshooting.',
  equipment_manager: 'Equipment + supplies inventory: morning checkout, end-of-day reconcile, maintenance, low-stock restock, damage triage.',
};

interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  is_approved: boolean;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  auth_provider: string | null;
  avatar_url: string | null;
  last_sign_in: string | null;
  created_at: string;
  updated_at: string;
}

type FilterTab = 'all' | 'pending' | 'active' | 'banned' | 'company' | 'external';

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: string; userName: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [editingRoles, setEditingRoles] = useState<{ userId: string; roles: UserRole[] } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addRoles, setAddRoles] = useState<UserRole[]>(['employee']);
  const [adding, setAdding] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUsers(data.users || []);
      setError('');
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const userRoles = session?.user?.roles || [];
  const isUserAdmin = userRoles.includes('admin');
  const isTechSupport = userRoles.includes('tech_support');
  const canEdit = isUserAdmin; // Only admins can edit; tech support is view-only

  if (session?.user && !isUserAdmin && !isTechSupport) return null;

  // Filter users
  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (roleFilter !== 'all' && !(u.roles || []).includes(roleFilter)) return false;

    switch (filterTab) {
      case 'pending': return !u.is_approved && !u.is_banned;
      case 'active': return u.is_approved && !u.is_banned;
      case 'banned': return u.is_banned;
      case 'company': return u.email.endsWith('@starr-surveying.com');
      case 'external': return !u.email.endsWith('@starr-surveying.com');
      default: return true;
    }
  });

  const pendingCount = users.filter(u => !u.is_approved && !u.is_banned).length;
  const counts = {
    all: users.length,
    pending: pendingCount,
    active: users.filter(u => u.is_approved && !u.is_banned).length,
    banned: users.filter(u => u.is_banned).length,
    company: users.filter(u => u.email.endsWith('@starr-surveying.com')).length,
    external: users.filter(u => !u.email.endsWith('@starr-surveying.com')).length,
  };

  async function handleAction(userId: string, action: string, payload: Record<string, unknown> = {}) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
      setBanReason('');
    }
  }

  async function handleDelete(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  }

  async function handleSaveRoles(userId: string, newRoles: UserRole[]) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_roles', roles: newRoles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    } finally {
      setActionLoading(null);
      setEditingRoles(null);
    }
  }

  function toggleEditRole(role: UserRole) {
    if (!editingRoles) return;
    if (role === 'employee') return; // Always included
    const current = editingRoles.roles;
    const has = current.includes(role);
    const newRoles = has ? current.filter(r => r !== role) : [...current, role];
    if (!newRoles.includes('employee')) newRoles.push('employee');
    setEditingRoles({ ...editingRoles, roles: newRoles });
  }

  function toggleAddRole(role: UserRole) {
    if (role === 'employee') return;
    const has = addRoles.includes(role);
    const newRoles = has ? addRoles.filter(r => r !== role) : [...addRoles, role];
    if (!newRoles.includes('employee')) newRoles.push('employee');
    setAddRoles(newRoles);
  }

  async function handleAddUser() {
    if (!addEmail) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail, name: addName || undefined, roles: addRoles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      setShowAddUser(false);
      setAddEmail('');
      setAddName('');
      setAddRoles(['employee']);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setAdding(false);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(d: string | null) {
    if (!d) return 'Never';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function getRoleBadges(roles: UserRole[]) {
    return roles.map(r => (
      <span
        key={r}
        className="um-role-badge"
        style={{ backgroundColor: ROLE_COLORS[r] + '18', color: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] + '40' }}
        title={ROLE_DESCRIPTIONS[r]}
      >
        {ROLE_LABELS[r]}
      </span>
    ));
  }

  if (!isUserAdmin && !isTechSupport) {
    return (
      <div className="jobs-page">
        <div className="job-detail__field-data-empty">
          <span>&#x1F512;</span>
          <p>Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <div>
          <h2 className="jobs-page__title">User Management</h2>
          <p className="um-subtitle">
            {users.length} total users &middot; {counts.company} company &middot; {counts.external} external
            {isTechSupport && !isUserAdmin && <span style={{ color: '#D97706', marginLeft: '0.5rem' }}>(View Only)</span>}
          </p>
        </div>
        {canEdit && (
          <button className="um-btn um-btn--primary" onClick={() => setShowAddUser(!showAddUser)}>
            {showAddUser ? 'Cancel' : '+ Add / Promote User'}
          </button>
        )}
      </div>

      {/* Add User Panel */}
      {showAddUser && canEdit && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '10px' }}>
          <h3 style={{ fontSize: '.92rem', fontWeight: 700, color: '#0369A1', marginBottom: '.5rem' }}>Add or Promote User</h3>
          <p style={{ fontSize: '.78rem', color: '#6B7280', marginBottom: '.75rem' }}>
            Enter an email to create a new user or update an existing user&apos;s roles. Company employees using Google Sign-In are auto-created on first login.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151' }}>Email *</label>
              <input className="job-form__input" type="email" placeholder="user@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151' }}>Display Name</label>
              <input className="job-form__input" type="text" placeholder="Optional" value={addName} onChange={e => setAddName(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '.4rem' }}>Roles</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {ALL_ROLES.map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem', padding: '.25rem .5rem', borderRadius: '6px', border: `1px solid ${addRoles.includes(r) ? ROLE_COLORS[r] : '#D1D5DB'}`, background: addRoles.includes(r) ? ROLE_COLORS[r] + '12' : 'white', cursor: r === 'employee' ? 'not-allowed' : 'pointer', opacity: r === 'employee' ? 0.6 : 1 }}>
                  <input type="checkbox" checked={addRoles.includes(r)} onChange={() => toggleAddRole(r)} disabled={r === 'employee'} style={{ accentColor: ROLE_COLORS[r] }} />
                  <span style={{ color: addRoles.includes(r) ? ROLE_COLORS[r] : '#374151', fontWeight: addRoles.includes(r) ? 600 : 400 }}>{ROLE_LABELS[r]}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="um-btn um-btn--primary" onClick={handleAddUser} disabled={adding || !addEmail} style={{ height: '38px' }}>
            {adding ? 'Adding...' : 'Add / Update User'}
          </button>
        </div>
      )}

      {/* Toasts */}
      {successMsg && <div className="um-toast um-toast--success">{successMsg}</div>}
      {error && <div className="um-toast um-toast--error">{error} <button onClick={() => setError('')} className="um-toast__close">&times;</button></div>}

      {/* Search + Filters */}
      <div className="um-controls">
        <div className="um-search-wrap">
          <input
            className="job-form__input um-search"
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="job-form__input"
            style={{ width: 'auto', minWidth: '140px', fontSize: '.82rem' }}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
          >
            <option value="all">All Roles</option>
            {ALL_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]} ({users.filter(u => u.roles.includes(r)).length})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="um-filter-tabs">
        {([
          ['all', 'All'],
          ['pending', 'Pending'],
          ['active', 'Active'],
          ['banned', 'Banned'],
          ['company', 'Company'],
          ['external', 'External'],
        ] as [FilterTab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`um-filter-tab ${filterTab === key ? 'um-filter-tab--active' : ''} ${key === 'pending' && counts.pending > 0 ? 'um-filter-tab--alert' : ''}`}
            onClick={() => setFilterTab(key)}
          >
            {label}
            <span className="um-filter-tab__count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="job-detail__field-data-empty"><p>Loading users...</p></div>
      ) : filtered.length === 0 ? (
        <div className="job-detail__field-data-empty">
          <span>&#x1F465;</span>
          <p>{users.length === 0 ? 'No registered users yet' : 'No users match your filters'}</p>
          {users.length === 0 && <p className="job-detail__field-data-sub">Users appear here when they register or sign in with Google</p>}
        </div>
      ) : (
        <div className="um-table-wrap">
          <table className="um-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Last Sign In</th>
                <th>Joined</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <Fragment key={user.id}>
                  <tr
                    className={`${user.is_banned ? 'um-row--banned' : !user.is_approved ? 'um-row--pending' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  >
                    <td className="um-cell-user">
                      <div className="um-avatar" style={{ background: user.avatar_url ? 'transparent' : undefined }}>
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          (user.name || user.email.split('@')[0]).split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                        )}
                      </div>
                      <div>
                        <div className="um-name">{user.name || user.email.split('@')[0]}</div>
                        <div className="um-email">{user.email}</div>
                      </div>
                    </td>
                    <td className="um-cell-roles">
                      <div className="um-roles-display" style={{ flexWrap: 'wrap' }}>
                        {getRoleBadges(user.roles)}
                      </div>
                    </td>
                    <td className="um-cell-status">
                      {user.is_banned ? (
                        <span className="um-status-badge um-status-badge--banned">Banned</span>
                      ) : !user.is_approved ? (
                        <span className="um-status-badge um-status-badge--pending">Pending</span>
                      ) : (
                        <span className="um-status-badge um-status-badge--active">Active</span>
                      )}
                    </td>
                    <td style={{ fontSize: '.78rem', color: '#6B7280' }}>
                      {user.auth_provider === 'google' ? 'Google' : user.auth_provider === 'credentials' ? 'Email' : user.email.endsWith('@starr-surveying.com') ? 'Google' : 'Email'}
                    </td>
                    <td className="um-cell-date" style={{ fontSize: '.78rem' }}>{formatDateTime(user.last_sign_in)}</td>
                    <td className="um-cell-date">{formatDate(user.created_at)}</td>
                    {canEdit && (
                      <td className="um-cell-actions">
                        {!user.is_approved && !user.is_banned ? (
                          <>
                            <button className="um-btn um-btn--sm um-btn--success" onClick={e => { e.stopPropagation(); handleAction(user.id, 'approve'); }} disabled={actionLoading === user.id}>
                              {actionLoading === user.id ? '...' : 'Approve'}
                            </button>
                            <button className="um-btn um-btn--sm um-btn--danger" onClick={e => { e.stopPropagation(); setConfirmAction({ userId: user.id, action: 'reject', userName: user.name }); }} disabled={actionLoading === user.id}>
                              Reject
                            </button>
                          </>
                        ) : user.is_banned ? (
                          <button className="um-btn um-btn--sm um-btn--success" onClick={e => { e.stopPropagation(); handleAction(user.id, 'unban'); }} disabled={actionLoading === user.id}>
                            Unban
                          </button>
                        ) : (
                          <>
                            <button className="um-btn um-btn--sm um-btn--primary" onClick={e => { e.stopPropagation(); setEditingRoles({ userId: user.id, roles: [...user.roles] }); }} title="Edit roles">
                              Roles
                            </button>
                            <button className="um-btn um-btn--sm um-btn--warning" onClick={e => { e.stopPropagation(); setConfirmAction({ userId: user.id, action: 'ban', userName: user.name }); setBanReason(''); }} disabled={actionLoading === user.id}>
                              Ban
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                  {/* Expanded detail row */}
                  {expandedUser === user.id && (
                    <tr key={user.id + '-detail'}>
                      <td colSpan={canEdit ? 7 : 6} style={{ padding: '0.75rem 1rem', background: '#F9FAFB', borderTop: 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '.82rem' }}>
                          <div><strong>Email:</strong> {user.email}</div>
                          <div><strong>Provider:</strong> {user.auth_provider || (user.email.endsWith('@starr-surveying.com') ? 'Google' : 'Email')}</div>
                          <div><strong>Company:</strong> {user.email.endsWith('@starr-surveying.com') ? 'Yes' : 'No'}</div>
                          <div><strong>Last Sign In:</strong> {formatDateTime(user.last_sign_in)}</div>
                          <div><strong>Created:</strong> {formatDateTime(user.created_at)}</div>
                          <div><strong>Updated:</strong> {formatDateTime(user.updated_at)}</div>
                          {user.is_banned && user.banned_reason && <div><strong>Ban Reason:</strong> {user.banned_reason}</div>}
                          {user.is_banned && user.banned_at && <div><strong>Banned On:</strong> {formatDate(user.banned_at)}</div>}
                        </div>
                        {canEdit && !user.is_banned && user.is_approved && (
                          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <button className="um-btn um-btn--sm um-btn--primary" onClick={() => setEditingRoles({ userId: user.id, roles: [...user.roles] })}>Edit Roles</button>
                            <button className="um-btn um-btn--sm um-btn--danger" onClick={() => setConfirmAction({ userId: user.id, action: 'delete', userName: user.name })}>Delete User</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role Editor Modal */}
      {editingRoles && canEdit && (
        <div className="um-modal-overlay" onClick={() => setEditingRoles(null)}>
          <div className="um-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3 className="um-modal__title">Edit Roles</h3>
            <p style={{ fontSize: '.82rem', color: '#6B7280', marginBottom: '1rem' }}>
              {users.find(u => u.id === editingRoles.userId)?.name} &mdash; {users.find(u => u.id === editingRoles.userId)?.email}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1rem' }}>
              {ALL_ROLES.map(r => (
                <label
                  key={r}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '.5rem', padding: '.5rem .75rem',
                    borderRadius: '8px', border: `1px solid ${editingRoles.roles.includes(r) ? ROLE_COLORS[r] : '#E5E7EB'}`,
                    background: editingRoles.roles.includes(r) ? ROLE_COLORS[r] + '08' : 'white',
                    cursor: r === 'employee' ? 'not-allowed' : 'pointer',
                    opacity: r === 'employee' ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editingRoles.roles.includes(r)}
                    onChange={() => toggleEditRole(r)}
                    disabled={r === 'employee'}
                    style={{ marginTop: '2px', accentColor: ROLE_COLORS[r] }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.85rem', color: editingRoles.roles.includes(r) ? ROLE_COLORS[r] : '#374151' }}>
                      {ROLE_LABELS[r]}
                    </div>
                    <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{ROLE_DESCRIPTIONS[r]}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="um-modal__actions">
              <button className="um-btn um-btn--ghost" onClick={() => setEditingRoles(null)}>Cancel</button>
              <button
                className="um-btn um-btn--primary"
                onClick={() => handleSaveRoles(editingRoles.userId, editingRoles.roles)}
                disabled={actionLoading === editingRoles.userId}
              >
                {actionLoading === editingRoles.userId ? 'Saving...' : 'Save Roles'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && canEdit && (
        <div className="um-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="um-modal" onClick={e => e.stopPropagation()}>
            {confirmAction.action === 'reject' ? (
              <>
                <h3 className="um-modal__title">Reject {confirmAction.userName}?</h3>
                <p className="um-modal__desc">This will permanently delete their registration. They can re-register later.</p>
                <div className="um-modal__actions">
                  <button className="um-btn um-btn--ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="um-btn um-btn--danger" onClick={() => handleAction(confirmAction.userId, 'reject')} disabled={actionLoading === confirmAction.userId}>
                    {actionLoading === confirmAction.userId ? 'Rejecting...' : 'Reject Registration'}
                  </button>
                </div>
              </>
            ) : confirmAction.action === 'ban' ? (
              <>
                <h3 className="um-modal__title">Ban {confirmAction.userName}?</h3>
                <p className="um-modal__desc">This user will be unable to log in until unbanned.</p>
                <div className="um-modal__field">
                  <label className="job-form__label">Reason (optional)</label>
                  <input className="job-form__input" type="text" placeholder="e.g. Violation of terms" value={banReason} onChange={e => setBanReason(e.target.value)} />
                </div>
                <div className="um-modal__actions">
                  <button className="um-btn um-btn--ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="um-btn um-btn--warning" onClick={() => handleAction(confirmAction.userId, 'ban', { reason: banReason || 'Banned by administrator' })} disabled={actionLoading === confirmAction.userId}>
                    {actionLoading === confirmAction.userId ? 'Banning...' : 'Confirm Ban'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="um-modal__title">Delete {confirmAction.userName}?</h3>
                <p className="um-modal__desc">This will permanently remove this user and cannot be undone.</p>
                <div className="um-modal__actions">
                  <button className="um-btn um-btn--ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="um-btn um-btn--danger" onClick={() => handleDelete(confirmAction.userId)} disabled={actionLoading === confirmAction.userId}>
                    {actionLoading === confirmAction.userId ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
