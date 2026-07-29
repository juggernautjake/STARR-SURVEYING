'use client';
// app/dnd/_ui/DiscordWebhookControl.tsx — point a campaign's roll feed at Discord (P10-4).
//
// DM-only, and it never holds the token: the page is given the MASKED value, and the input is empty until
// the DM pastes a new one. That means the control cannot show you what is configured in full — which is
// the point. They already have the webhook, in Discord; nobody needs a second copy of it on a web page
// that might be screen-shared to the table.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function DiscordWebhookControl({
  campaignId,
  current,
}: {
  campaignId: string;
  /** Already masked by the server — `https://discord.com/api/webhooks/123/••••abcd` — or ''. */
  current?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: string) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordWebhookUrl: next }),
      });
      const j = await r.json().catch(() => ({}));
      // The server's own message, verbatim: it distinguishes "that is not a Discord URL" from a failure,
      // and a DM who pasted the channel link instead of the webhook needs to be told which mistake it was.
      if (!r.ok) { setErr(j.error ?? 'Could not save that.'); return; }
      setSaved(j.discordWebhook ?? '');
      setValue('');
      router.refresh();
    } catch {
      setErr('Network error — please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)' }}>DISCORD //</div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--hx-muted)' }}>
        Every roll on the shared feed is mirrored into a Discord channel. Create a webhook in
        <strong> Channel Settings → Integrations → Webhooks</strong> and paste its URL here.
      </p>
      {saved && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-text)' }}>
          Currently posting to <code style={{ fontSize: 11.5 }}>{saved}</code>
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          aria-label="Discord webhook URL"
          style={{ flex: '1 1 280px', minWidth: 0, padding: '7px 10px', fontSize: 12.5 }}
        />
        <button type="button" className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => save(value.trim())}
          style={{ padding: '6px 14px', fontSize: 12.5 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => save('')}
            style={{ padding: '6px 14px', fontSize: 12.5 }}>
            Turn off
          </button>
        )}
      </div>
      {/* `var(--hx-danger)` with no hex fallback — the token is defined in hextech.module.css, and the
          ratchet added in P10-2 caught the fallback the moment this file was written. Working exactly as
          intended on its first day: a new file may not add to the pile. */}
      {err && <span style={{ fontSize: 12, color: 'var(--hx-danger)' }}>{err}</span>}
      <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
        Anyone with this URL can post to that channel, so it is stored write-only — the page shows only
        enough of it to tell two webhooks apart. Rotate it in Discord if it ever leaks.
      </span>
    </div>
  );
}
