// app/admin/assignments/page.tsx — View and manage assignments
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';
import { usePageError } from '../hooks/usePageError';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  priority: string;
  status: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  completed_at: string | null;
  job_id: string | null;
  module_id: string | null;
  lesson_id: string | null;
  notes: string | null;
  completion_notes: string | null;
  created_at: string;
}

const TYPE_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'task', label: 'General Task', icon: '📋' },
  { key: 'study_material', label: 'Study Material', icon: '📖' },
  { key: 'exam', label: 'Pass Exam', icon: '📝' },
  { key: 'draw_job', label: 'Draw Job', icon: '✏️' },
  { key: 'start_job', label: 'Start Job', icon: '🚀' },
  { key: 'finish_job', label: 'Finish Job', icon: '✅' },
  { key: 'equipment_maintenance', label: 'Equipment Maintenance', icon: '🔧' },
  { key: 'log_hours', label: 'Log Hours', icon: '⏱️' },
  { key: 'field_work', label: 'Field Work', icon: '📡' },
  { key: 'training', label: 'Training', icon: '🎓' },
];

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: '#3B82F6', normal: '#6B7280', high: '#F59E0B', urgent: '#EF4444',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', in_progress: '#3B82F6', completed: '#059669', overdue: '#EF4444', cancelled: '#9CA3AF',
};

function formatName(email: string): string {
  return email.split('@')[0].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(d: string): string {
  const now = new Date();
  const target = new Date(d);
  const diffMs = target.getTime() - now.getTime();
  const days = Math.ceil(diffMs / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}

export default function AssignmentsPage() {
  const { data: session } = useSession();
  const { safeFetch, reportPageError } = usePageError('AssignmentsPage');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', assignment_type: 'task', priority: 'normal',
    assigned_to: '', due_date: '', notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [employees, setEmployees] = useState<string[]>([]);

  const userRole = session?.user?.role || 'employee';
  const canManage = userRole === 'admin' || userRole === 'teacher';
  const isAdmin = userRole === 'admin';

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);

    try {
      const res = await fetch(`/api/admin/assignments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)));
    }
    setLoading(false);
  }, [statusFilter, typeFilter, reportPageError]);

  useEffect(() => {
    if (session?.user) {
      loadAssignments();
      // Load employee list for admin/teacher form
      if (canManage) {
        fetch('/api/admin/messages/contacts').then(r => r.json()).then(d => {
          if (d.contacts) setEmployees(d.contacts.map((c: { email: string }) => c.email));
        }).catch(() => {});
      }
    }
  }, [session, canManage, loadAssignments]);

  async function handleCreate() {
    if (!formData.title.trim() || !formData.assigned_to) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setFormData({ title: '', description: '', assignment_type: 'task', priority: 'normal', assigned_to: '', due_date: '', notes: '' });
        loadAssignments();
      } else {
        const d = await res.json();
        reportPageError(d.error || 'Failed to create assignment');
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)));
    }
    setCreating(false);
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) loadAssignments();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (!session?.user) return null;

  const typeInfo = (type: string) => TYPE_OPTIONS.find(t => t.key === type) || { key: type, label: type, icon: '📋' };

  return (
    <>
      <UnderConstruction
        feature="Assignments"
        description="View and manage task assignments from admins. Track study materials, job tasks, equipment maintenance, and more."
      />

      {/* Header with create button */}
      <div className="assign__header">
        <div className="assign__header-left">
          <h2 className="assign__title">My Assignments</h2>
          <span className="assign__count">{assignments.length} total</span>
        </div>
        {canManage && (
          <button className="assign__create-btn" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Assign Task'}
          </button>
        )}
      </div>

      {/* Admin create form */}
      {showCreateForm && canManage && (
        <div className="assign__form">
          <h3 className="assign__form-title">Create New Assignment</h3>
          <div className="assign__form-grid">
            <div className="assign__form-field assign__form-field--full">
              <label>Title <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Complete boundary survey for Job #2024-0032" />
            </div>
            <div className="assign__form-field assign__form-field--full">
              <label>Description</label>
              <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                placeholder="Detailed instructions for the assignee..." rows={3} />
            </div>
            <div className="assign__form-field">
              <label>Assign To <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={formData.assigned_to} onChange={e => setFormData(p => ({ ...p, assigned_to: e.target.value }))}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e} value={e}>{formatName(e)}</option>)}
              </select>
            </div>
            <div className="assign__form-field">
              <label>Type</label>
              <select value={formData.assignment_type} onChange={e => setFormData(p => ({ ...p, assignment_type: e.target.value }))}>
                {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div className="assign__form-field">
              <label>Priority</label>
              <select value={formData.priority} onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="assign__form-field">
              <label>Due Date</label>
              <input type="date" value={formData.due_date} onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))} />
            </div>
            <div className="assign__form-field assign__form-field--full">
              <label>Notes for Assignee</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any additional notes or context..." rows={2} />
            </div>
          </div>
          <div className="assign__form-actions">
            <button className="assign__btn assign__btn--secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
            <button className="assign__btn assign__btn--primary" onClick={handleCreate}
              disabled={creating || !formData.title.trim() || !formData.assigned_to}>
              {creating ? 'Creating...' : 'Create Assignment'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="assign__filters">
        <div className="assign__filter-group">
          <span className="assign__filter-label">Status:</span>
          <div className="assign__filter-pills">
            {STATUS_OPTIONS.map(s => (
              <button key={s.key}
                className={`assign__filter-pill ${statusFilter === s.key ? 'assign__filter-pill--active' : ''}`}
                onClick={() => setStatusFilter(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="assign__filter-group">
          <span className="assign__filter-label">Type:</span>
          <select className="assign__filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Assignment list */}
      {loading ? (
        <div className="assign__empty"><p>Loading assignments...</p></div>
      ) : assignments.length === 0 ? (
        <div className="assign__empty">
          <span className="assign__empty-icon">📋</span>
          <p>No assignments found</p>
          <p style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
            {statusFilter !== 'all' ? 'Try changing the filter' : 'Assignments from your admin will appear here'}
          </p>
        </div>
      ) : (
        <div className="assign__list">
          {assignments.map(a => {
            const ti = typeInfo(a.assignment_type);
            const isExpanded = expandedId === a.id;
            const isOverdue = a.due_date && a.status !== 'completed' && a.status !== 'cancelled'
              && new Date(a.due_date).getTime() < Date.now();

            return (
              <div key={a.id} className={`assign__item ${isOverdue ? 'assign__item--overdue' : ''}`}>
                <div className="assign__item-header" onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                  <div className="assign__item-left">
                    <span className="assign__item-icon">{ti.icon}</span>
                    <div className="assign__item-info">
                      <span className="assign__item-title">{a.title}</span>
                      <div className="assign__item-meta">
                        <span className="assign__item-type">{ti.label}</span>
                        {canManage && <span className="assign__item-assignee">to {formatName(a.assigned_to)}</span>}
                        <span className="assign__item-from">from {formatName(a.assigned_by)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="assign__item-right">
                    <span className="assign__item-priority" style={{ color: PRIORITY_COLORS[a.priority] || '#6B7280' }}>
                      {a.priority}
                    </span>
                    <span className="assign__item-status" style={{ background: `${STATUS_COLORS[a.status] || '#6B7280'}18`, color: STATUS_COLORS[a.status] || '#6B7280' }}>
                      {a.status === 'in_progress' ? 'In Progress' : a.status}
                    </span>
                    {a.due_date && (
                      <span className={`assign__item-due ${isOverdue ? 'assign__item-due--overdue' : ''}`}>
                        {formatRelative(a.due_date)}
                      </span>
                    )}
                    <span className={`assign__item-arrow ${isExpanded ? 'assign__item-arrow--open' : ''}`}>▶</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="assign__item-body">
                    {a.description && (
                      <div className="assign__detail-section">
                        <h4>Description</h4>
                        <p>{a.description}</p>
                      </div>
                    )}
                    {a.notes && (
                      <div className="assign__detail-section">
                        <h4>Notes from Admin</h4>
                        <p className="assign__detail-note">{a.notes}</p>
                      </div>
                    )}
                    <div className="assign__detail-grid">
                      <div className="assign__detail-field">
                        <label>Assigned</label><span>{formatDate(a.created_at)}</span>
                      </div>
                      {a.due_date && (
                        <div className="assign__detail-field">
                          <label>Due</label><span>{formatDate(a.due_date)}</span>
                        </div>
                      )}
                      {a.completed_at && (
                        <div className="assign__detail-field">
                          <label>Completed</label><span>{formatDate(a.completed_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Status update buttons */}
                    <div className="assign__detail-actions">
                      {a.status === 'pending' && (
                        <button className="assign__btn assign__btn--primary" onClick={() => updateStatus(a.id, 'in_progress')}>
                          Start Working
                        </button>
                      )}
                      {a.status === 'in_progress' && (
                        <button className="assign__btn assign__btn--success" onClick={() => updateStatus(a.id, 'completed')}>
                          Mark Complete
                        </button>
                      )}
                      {canManage && a.status !== 'cancelled' && (
                        <button className="assign__btn assign__btn--danger" onClick={() => updateStatus(a.id, 'cancelled')}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Development Guide */}
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#1F2937' }}>Assignments — Development Guide</h3>
        <div style={{ fontSize: '0.82rem', color: '#6B7280', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.75rem' }}><strong>Current Capabilities:</strong></p>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
            <li>View assignments with status/type filters and expandable detail cards</li>
            <li>Admin create form: assign tasks to employees with type, priority, due date, notes</li>
            <li>Update status: pending → in progress → completed</li>
            <li>Auto-notification created when admin assigns a task</li>
            <li>Overdue highlighting for past-due assignments</li>
          </ul>
          <p style={{ margin: '0 0 0.5rem' }}><strong>Database:</strong> Run <code>supabase_migration_assignments_notifications.sql</code></p>
        </div>
        <pre style={{ background: '#1F2937', color: '#E5E7EB', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', overflow: 'auto', marginTop: '0.75rem' }}>{`CONTINUATION PROMPT:
Improve assignments at /admin/assignments/page.tsx.

CURRENT STATE: Assignment list with filters, admin create form, status updates,
auto-notification on create, overdue detection, expandable detail cards.

NEXT STEPS:
1. Add completion notes: let assignee add notes when marking complete
2. Add job/module linking: link assignments to specific jobs or learning modules
3. Add recurring assignments: repeat daily/weekly/monthly
4. Add progress tracking: percentage completion for long tasks
5. Add file attachments: attach reference docs to assignments
6. Add assignment templates: save common assignment types as reusable templates
7. Add calendar view: show assignments on a calendar with due dates
8. Add email notifications: send email when assignment is created/due
9. Add drag-and-drop reordering of assignments
10. Add Kanban board view (pending/in-progress/completed columns)`}</pre>
      </div>
    </>
  );
}
