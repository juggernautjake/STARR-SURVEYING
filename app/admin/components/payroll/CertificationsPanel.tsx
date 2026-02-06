// app/admin/components/payroll/CertificationsPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { CERTIFICATION_TYPES, formatCurrency, formatDate } from './PayrollConstants';

interface Certification {
  id: string;
  user_email: string;
  certification_type: string;
  certification_name: string;
  issued_date: string | null;
  expiry_date: string | null;
  license_number: string | null;
  pay_bump_amount: number;
  pay_bump_percentage: number;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
}

interface CertificationsPanelProps {
  email: string;
  isAdmin: boolean;
  onCertChanged?: () => void;
}

export default function CertificationsPanel({ email, isAdmin, onCertChanged }: CertificationsPanelProps) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    certification_type: 'sit_exam',
    certification_name: '',
    issued_date: '',
    expiry_date: '',
    license_number: '',
    pay_bump_amount: '0',
    pay_bump_percentage: '0',
  });

  useEffect(() => {
    loadCerts();
  }, [email]);

  async function loadCerts() {
    try {
      const res = await fetch(`/api/admin/payroll/certifications?email=${email}`);
      const data = await res.json();
      setCerts(data.certifications || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function addCert(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/payroll/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          certification_type: form.certification_type,
          certification_name: form.certification_name || CERTIFICATION_TYPES[form.certification_type]?.label || form.certification_type,
          issued_date: form.issued_date || null,
          expiry_date: form.expiry_date || null,
          license_number: form.license_number || null,
          pay_bump_amount: parseFloat(form.pay_bump_amount),
          pay_bump_percentage: parseFloat(form.pay_bump_percentage),
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ certification_type: 'sit_exam', certification_name: '', issued_date: '', expiry_date: '', license_number: '', pay_bump_amount: '0', pay_bump_percentage: '0' });
        loadCerts();
        onCertChanged?.();
      }
    } catch { /* ignore */ }
  }

  async function verifyCert(id: string) {
    try {
      await fetch('/api/admin/payroll/certifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, verified: true }),
      });
      loadCerts();
    } catch { /* ignore */ }
  }

  async function removeCert(id: string) {
    if (!confirm('Remove this certification?')) return;
    try {
      await fetch(`/api/admin/payroll/certifications?id=${id}`, { method: 'DELETE' });
      loadCerts();
      onCertChanged?.();
    } catch { /* ignore */ }
  }

  if (loading) return <div className="payroll-loading">Loading certifications...</div>;

  return (
    <div className="payroll-certs">
      <div className="payroll-certs__header">
        <h3 className="payroll-certs__title">Certifications & Licenses</h3>
        <button className="payroll-btn payroll-btn--primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Certification'}
        </button>
      </div>

      {showForm && (
        <form className="payroll-certs__form" onSubmit={addCert}>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>Certification Type</label>
              <select
                value={form.certification_type}
                onChange={e => setForm(f => ({ ...f, certification_type: e.target.value }))}
              >
                {Object.entries(CERTIFICATION_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>
            <div className="payroll-form-group">
              <label>License/Certificate Number</label>
              <input
                value={form.license_number}
                onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>Issued Date</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} />
            </div>
            <div className="payroll-form-group">
              <label>Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            </div>
          </div>
          {isAdmin && (
            <div className="payroll-form-row">
              <div className="payroll-form-group">
                <label>Pay Bump ($/hr)</label>
                <input
                  type="number"
                  step="0.25"
                  value={form.pay_bump_amount}
                  onChange={e => setForm(f => ({ ...f, pay_bump_amount: e.target.value }))}
                />
              </div>
              <div className="payroll-form-group">
                <label>Pay Bump (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.pay_bump_percentage}
                  onChange={e => setForm(f => ({ ...f, pay_bump_percentage: e.target.value }))}
                />
              </div>
            </div>
          )}
          <button type="submit" className="payroll-btn payroll-btn--primary">Add Certification</button>
        </form>
      )}

      {certs.length === 0 ? (
        <div className="payroll-certs__empty">No certifications on file</div>
      ) : (
        <div className="payroll-certs__list">
          {certs.map(cert => {
            const typeInfo = CERTIFICATION_TYPES[cert.certification_type] || { label: cert.certification_type, icon: '📋' };
            const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
            const isExpiringSoon = cert.expiry_date && !isExpired &&
              new Date(cert.expiry_date).getTime() - Date.now() < 90 * 24 * 60 * 60 * 1000;

            return (
              <div key={cert.id} className={`payroll-certs__item ${isExpired ? 'payroll-certs__item--expired' : ''}`}>
                <div className="payroll-certs__item-icon">{typeInfo.icon}</div>
                <div className="payroll-certs__item-info">
                  <div className="payroll-certs__item-name">{cert.certification_name}</div>
                  <div className="payroll-certs__item-meta">
                    {cert.license_number && <span>#{cert.license_number}</span>}
                    {cert.issued_date && <span>Issued: {formatDate(cert.issued_date)}</span>}
                    {cert.expiry_date && (
                      <span className={isExpired ? 'payroll-certs__expired' : isExpiringSoon ? 'payroll-certs__expiring' : ''}>
                        {isExpired ? 'Expired' : 'Expires'}: {formatDate(cert.expiry_date)}
                      </span>
                    )}
                  </div>
                  {(cert.pay_bump_amount > 0 || cert.pay_bump_percentage > 0) && (
                    <div className="payroll-certs__item-bump">
                      Pay bump: {cert.pay_bump_amount > 0 ? `+${formatCurrency(cert.pay_bump_amount)}/hr` : ''}
                      {cert.pay_bump_percentage > 0 ? ` +${cert.pay_bump_percentage}%` : ''}
                    </div>
                  )}
                </div>
                <div className="payroll-certs__item-actions">
                  {cert.verified ? (
                    <span className="payroll-certs__verified-badge">Verified</span>
                  ) : isAdmin ? (
                    <button className="payroll-btn payroll-btn--sm payroll-btn--primary" onClick={() => verifyCert(cert.id)}>Verify</button>
                  ) : (
                    <span className="payroll-certs__pending-badge">Pending Verification</span>
                  )}
                  {(isAdmin || !cert.verified) && (
                    <button className="payroll-btn payroll-btn--sm payroll-btn--danger" onClick={() => removeCert(cert.id)}>Remove</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
