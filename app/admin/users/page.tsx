// app/admin/users/page.tsx — Admin user management
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { UserRole } from '@/lib/auth';

interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  is_approved: boolean;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  created_at: string;
  updated_at: string;
}

type FilterTab = 'all' | 'active' | 'banned' | 'admins' | 'teachers';

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: string; userName: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [editingRoles, setEditingRoles] = useState<{ userId: string; roles: UserRole[] } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

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

  // Auto-clear success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const isUserAdmin = session?.user?.role === 'admin';

  // Filter users
  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    switch (filterTab) {
      case 'active': return !u.is_banned;
      case 'banned': return u.is_banned;
      case 'admins': return u.roles.includes('admin');
      case 'teachers': return u.roles.includes('teacher');
      default: return true;
    }
  });

  // Counts for tabs
  const counts = {
    all: users.length,
    active: users.filter(u => !u.is_banned).length,
    banned: users.filter(u => u.is_banned).length,
    admins: users.filter(u => u.roles.includes('admin')).length,
    teachers: users.filter(u => u.roles.includes('teacher')).length,
  };

  async function handleBan(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', reason: banReason || 'Banned by administrator' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to ban user');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
      setBanReason('');
    }
  }

  async function handleUnban(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unban user');
    } finally {
      setActionLoading(null);
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

  function toggleRole(role: UserRole) {
    if (!editingRoles) return;
    const current = editingRoles.roles;
    // Employee is always included
    if (role === 'employee') return;
    const has = current.includes(role);
    const newRoles = has
      ? current.filter(r => r !== role)
      : [...current, role];
    // Ensure employee is always present
    if (!newRoles.includes('employee')) newRoles.push('employee');
    setEditingRoles({ ...editingRoles, roles: newRoles });
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getRoleBadges(roles: UserRole[]) {
    return roles.filter(r => r !== 'employee').map(r => (
      <span key={r} className={`um-role-badge um-role-badge--${r}`}>{r}</span>
    ));
  }

  if (!isUserAdmin) {
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
        <h2 className="jobs-page__title">User Management</h2>
        <p className="um-subtitle">Manage registered external users — assign roles, ban, or remove accounts</p>
      </div>

      {/* Success / Error messages */}
      {successMsg && <div className="um-toast um-toast--success">{successMsg}</div>}
      {error && <div className="um-toast um-toast--error">{error} <button onClick={() => setError('')} className="um-toast__close">&times;</button></div>}

      {/* Search + Filter tabs */}
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
        <div className="um-filter-tabs">
          {([
            ['all', 'All'],
            ['active', 'Active'],
            ['banned', 'Banned'],
            ['admins', 'Admins'],
            ['teachers', 'Teachers'],
          ] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`um-filter-tab ${filterTab === key ? 'um-filter-tab--active' : ''}`}
              onClick={() => setFilterTab(key)}
            >
              {label}
              <span className="um-filter-tab__count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Users table */}
      {loading ? (
        <div className="job-detail__field-data-empty"><p>Loading users...</p></div>
      ) : filtered.length === 0 ? (
        <div className="job-detail__field-data-empty">
          <span>&#x1F465;</span>
          <p>{users.length === 0 ? 'No registered users yet' : 'No users match your search'}</p>
          {users.length === 0 && <p className="job-detail__field-data-sub">External users who register via the sign-up page will appear here</p>}
        </div>
      ) : (
        <div className="um-table-wrap">
          <table className="um-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id} className={user.is_banned ? 'um-row--banned' : ''}>
                  <td className="um-cell-user">
                    <div className="um-avatar">{user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                    <div>
                      <div className="um-name">{user.name}</div>
                      <div className="um-email">{user.email}</div>
                    </div>
                  </td>
                  <td className="um-cell-roles">
                    {editingRoles?.userId === user.id ? (
                      <div className="um-role-editor">
                        <label className="um-role-toggle">
                          <input type="checkbox" checked disabled />
                          <span>Employee</span>
                        </label>
                        <label className="um-role-toggle">
                          <input
                            type="checkbox"
                            checked={editingRoles.roles.includes('teacher')}
                            onChange={() => toggleRole('teacher')}
                          />
                          <span>Teacher</span>
                        </label>
                        <label className="um-role-toggle">
                          <input
                            type="checkbox"
                            checked={editingRoles.roles.includes('admin')}
                            onChange={() => toggleRole('admin')}
                          />
                          <span>Admin</span>
                        </label>
                        <div className="um-role-editor__actions">
                          <button
                            className="um-btn um-btn--sm um-btn--primary"
                            onClick={() => handleSaveRoles(user.id, editingRoles.roles)}
                            disabled={actionLoading === user.id}
                          >
                            Save
                          </button>
                          <button
                            className="um-btn um-btn--sm um-btn--ghost"
                            onClick={() => setEditingRoles(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="um-roles-display">
                        <span className="um-role-badge um-role-badge--employee">employee</span>
                        {getRoleBadges(user.roles)}
                        <button
                          className="um-btn um-btn--xs um-btn--ghost"
                          onClick={() => setEditingRoles({ userId: user.id, roles: [...user.roles] })}
                          title="Edit roles"
                        >
                          &#x270F;
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="um-cell-status">
                    {user.is_banned ? (
                      <div>
                        <span className="um-status-badge um-status-badge--banned">Banned</span>
                        {user.banned_reason && <div className="um-ban-reason" title={user.banned_reason}>{user.banned_reason}</div>}
                        {user.banned_at && <div className="um-ban-date">Since {formatDate(user.banned_at)}</div>}
                      </div>
                    ) : (
                      <span className="um-status-badge um-status-badge--active">Active</span>
                    )}
                  </td>
                  <td className="um-cell-date">{formatDate(user.created_at)}</td>
                  <td className="um-cell-actions">
                    {user.is_banned ? (
                      <button
                        className="um-btn um-btn--sm um-btn--success"
                        onClick={() => handleUnban(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        className="um-btn um-btn--sm um-btn--warning"
                        onClick={() => { setConfirmAction({ userId: user.id, action: 'ban', userName: user.name }); setBanReason(''); }}
                        disabled={actionLoading === user.id}
                      >
                        Ban
                      </button>
                    )}
                    <button
                      className="um-btn um-btn--sm um-btn--danger"
                      onClick={() => setConfirmAction({ userId: user.id, action: 'delete', userName: user.name })}
                      disabled={actionLoading === user.id}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="um-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="um-modal" onClick={e => e.stopPropagation()}>
            {confirmAction.action === 'ban' ? (
              <>
                <h3 className="um-modal__title">Ban {confirmAction.userName}?</h3>
                <p className="um-modal__desc">This user will be unable to log in until unbanned.</p>
                <div className="um-modal__field">
                  <label className="job-form__label">Reason (optional)</label>
                  <input
                    className="job-form__input"
                    type="text"
                    placeholder="e.g. Violation of terms"
                    value={banReason}
                    onChange={e => setBanReason(e.target.value)}
                  />
                </div>
                <div className="um-modal__actions">
                  <button className="um-btn um-btn--ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button
                    className="um-btn um-btn--warning"
                    onClick={() => handleBan(confirmAction.userId)}
                    disabled={actionLoading === confirmAction.userId}
                  >
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
                  <button
                    className="um-btn um-btn--danger"
                    onClick={() => handleDelete(confirmAction.userId)}
                    disabled={actionLoading === confirmAction.userId}
                  >
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
