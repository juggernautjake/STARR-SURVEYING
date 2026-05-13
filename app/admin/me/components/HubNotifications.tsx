'use client';
// app/admin/me/components/HubNotifications.tsx
//
// Hub panel 5 (§5.1) — notifications + messages snapshot. No
// notification store exists in the repo yet (messages have their own
// page; system alerts aren't centralized). Slice 2b wires the data
// source; slice 2a renders the empty-state shell.

export default function HubNotifications() {
  return (
    <section className="hub-panel hub-notifications">
      <header className="hub-panel__header">
        <h2 className="hub-panel__title">Notifications</h2>
        <a className="hub-panel__link" href="/admin/messages">
          Open Messages →
        </a>
      </header>
      <p className="hub-notifications__empty">
        Unified notifications land in slice 2b. Check
        {' '}
        <a href="/admin/messages">Messages</a> and
        {' '}
        <a href="/admin/discussions">Discussions</a> in the meantime.
      </p>
    </section>
  );
}
