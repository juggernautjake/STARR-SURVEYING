// lib/dnd/stream-alerts.ts — streamer event alerts (Phase J9). Pure formatting for the
// sub / resub / donation / raid banners the DM fires into the fake stream. Client-safe.

export type AlertType = 'sub' | 'resub' | 'donation' | 'raid';

export interface StreamAlert {
  type: AlertType;
  username: string;
  detail?: string; // months for resub, amount for donation, viewer count for raid
}

interface AlertStyle {
  emoji: string;
  color: string;
  label: string;
  message: (a: StreamAlert) => string;
}

const STYLES: Record<AlertType, AlertStyle> = {
  sub: { emoji: '⭐', color: '#9147ff', label: 'New Sub', message: (a) => `${a.username} just subscribed!` },
  resub: { emoji: '🎉', color: '#0ac8b9', label: 'Resub', message: (a) => `${a.username} resubscribed${a.detail ? ` for ${a.detail} months` : ''}!` },
  donation: { emoji: '💰', color: '#1f9e46', label: 'Donation', message: (a) => `${a.username} donated${a.detail ? ` ${a.detail}` : ''}!` },
  raid: { emoji: '⚔️', color: '#ff6b00', label: 'Raid', message: (a) => `${a.username} is raiding${a.detail ? ` with ${a.detail} viewers` : ''}!` },
};

export function isAlertType(t: unknown): t is AlertType {
  return t === 'sub' || t === 'resub' || t === 'donation' || t === 'raid';
}

/** Formatted display bits for an alert banner. */
export function formatAlert(a: StreamAlert): { emoji: string; color: string; label: string; text: string } {
  const s = STYLES[a.type] ?? STYLES.sub;
  return { emoji: s.emoji, color: s.color, label: s.label, text: s.message({ ...a, username: a.username || 'Someone' }) };
}
