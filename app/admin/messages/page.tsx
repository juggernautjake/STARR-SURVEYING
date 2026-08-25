'use client';
// app/admin/messages/page.tsx — the Messages portal.
//
// C9 / P11 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Everything about talking to people: the conversations, who you can talk to, what the system sends
// on your behalf, and the email log.
//
// ── ONE NARROWING, AND IT IS OF A PATH THE NAV NEVER OFFERED ────────────────────────────────────
//
// `/admin/email/*` had **no middleware entry** — any signed-in account could reach it by typing the
// URL — while its registry row gated the nav to admin / developer / tech_support. As a tab of this
// portal it sits under `/admin/messages`, which middleware gates to eight roles, and the tab itself
// keeps the registry's three.
//
// So an `employee` who typed `/admin/email/sent` used to get it and now does not. That is a
// narrowing, and it is the right one: the nav never offered it to them, the row that decided that
// has not changed, and the redirect stub at the old URL keeps its own behaviour. Recorded because
// §5's rule cuts both ways and a quiet narrowing is the harder one to notice.
//
// ── THE RECORD IS UNTOUCHED ─────────────────────────────────────────────────────────────────────
//
// `/admin/messages/[conversationId]` is a conversation — a record, which §4 says is not a tab. It
// stays where it is, under the same middleware prefix it always had.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MessageSquare, Contact, Settings, Mail, MessageSquarePlus, MailPlus } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import InboxTab from './_tabs/InboxTab';
import ContactsTab from './_tabs/ContactsTab';
import SettingsTab from './_tabs/SettingsTab';
import EmailTab from './_tabs/EmailTab';
import './MessagesPortal.css';

const PORTAL: PortalSpec = {
  route: '/admin/messages',
  tabs: [
    { id: 'inbox', label: 'Inbox', icon: MessageSquare, hint: 'Your conversations with people at the firm.' },
    { id: 'contacts', label: 'Directory', icon: Contact, hint: 'Who you can message, and how else to reach them.' },
    // `/admin/email/sent` was admin / developer / tech_support. Carried across exactly.
    { id: 'email', label: 'Email', icon: Mail, hint: 'Mail the firm has sent, and what came back.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'settings', label: 'Settings', icon: Settings, hint: 'What the system sends on your behalf, and when.' },
  ],
  defaultTab: 'inbox',
};

export default function MessagesPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="msg-portal">
      <nav className="msg-portal__tabs" role="tablist" aria-label="Messages">
        {tabs.map((t) => {
          const Icon = t.icon as typeof MessageSquare;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`msg-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`msg-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`msg-portal__tab${isActive ? ' msg-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`msg-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {!active && (
        <p className="msg-portal__none">
          Every part of Messages is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="msg-portal__toolbar">
          <p className="msg-portal__hint">{activeTab.hint}</p>
          {/* The plan's compose buttons, each on the tab it belongs to. Both keep their routes:
            * composing is a thing you start from a list, and each has a full editor behind it. */}
          {(active === 'inbox' || active === 'contacts') && (
            <Link className="msg-portal__action" href="/admin/messages/new">
              <MessageSquarePlus size={14} aria-hidden /> New message
            </Link>
          )}
          {active === 'email' && (
            <Link className="msg-portal__action" href="/admin/email/new">
              <MailPlus size={14} aria-hidden /> Compose email
            </Link>
          )}
        </div>
      )}

      <div id={`msg-panel-${active}`} role="tabpanel" aria-labelledby={`msg-tab-${active}`}>
        {active === 'inbox' && <InboxTab />}
        {active === 'contacts' && <ContactsTab />}
        {active === 'email' && <EmailTab />}
        {active === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
