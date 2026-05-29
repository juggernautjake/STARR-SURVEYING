'use client';
// app/admin/me/components/HubToday.tsx
//
// Hub panel 2 (§5.1) — today's assignments + due deliverables. The data
// source (`/api/admin/assignments?today=true` + receipts queue counts +
// deliverable deadlines) lands in slice 2b. Slice 2a renders the
// structural panel with a placeholder so the Hub layout is reviewable
// today.

export default function HubToday() {
  return (
    <section className="hub-panel hub-today">
      <header className="hub-panel__header">
        <h2 className="hub-panel__title">Today</h2>
        <a className="hub-panel__link" href="/admin/assignments">
          All assignments →
        </a>
      </header>
      <div className="hub-today__placeholder">
        Live today-cards land in slice 2b. Until then, see your
        {' '}
        <a href="/admin/assignments">assignments</a> and
        {' '}
        <a href="/admin/schedule">schedule</a> directly.
      </div>
    </section>
  );
}
