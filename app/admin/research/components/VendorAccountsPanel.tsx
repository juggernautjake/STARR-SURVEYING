// app/admin/research/components/VendorAccountsPanel.tsx — the vendor accounts, and their limits.
//
// S-9 is listed as *blocked on the owner: amounts, ceiling*, and part of that was self-inflicted:
// `research_vendor_accounts` shipped with a schema, database constraints, a service and tests, and
// **nowhere to enter the numbers**. A blocker with no form behind it stays a blocker no matter what
// the owner decides.
//
// Two things this screen is careful about, both because the subject is money:
//
//   **A balance is never shown as a bare number.** `describeBalance()` exists precisely because
//   "$42.50" says nothing about whether anybody read it from the vendor or we inferred it from our
//   own ledger — and a top-up decision made on an inferred balance can overspend or fail a purchase
//   mid-run. The provenance travels with the figure, in the same sentence.
//
//   **Auto top-up off is stated, not implied by an unchecked box.** A row with no limits and a
//   quiet toggle reads as "configured and idle". It is not: it is unconfigured, and nothing will
//   charge until three numbers exist.
'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AccountRow {
  vendor_id: string;
  display_name: string | null;
  account_status: 'none' | 'pending' | 'active' | 'suspended' | string;
  account_identifier: string | null;
  credential_env_var: string | null;
  balance_usd: string | number | null;
  balance_source: 'unknown' | 'inferred' | 'confirmed' | string;
  balance_checked_at: string | null;
  auto_topup_enabled: boolean;
  low_water_usd: string | number | null;
  topup_to_usd: string | number | null;
  monthly_ceiling_usd: string | number | null;
  min_topup_interval_mins: number;
  card_last4: string | null;
}

const n = (v: string | number | null): number | null =>
  v === null || v === '' ? null : Number(v);

/** The same rule `describeBalance()` applies server-side: never a figure without its provenance.
 *
 *  Exported so it can be tested directly. These two functions are the risky part of this file — they
 *  encode when a number may be shown and what must be said beside it — and a source-text assertion
 *  that the file *contains* the word "INFERRED" proves nothing about which branch produces it. */
export function balanceLine(a: AccountRow): string {
  const name = a.display_name || a.vendor_id;
  if (a.account_status === 'none') {
    return `No account. Nothing can be purchased here until one is opened — this is not a balance of $0.00.`;
  }
  const bal = n(a.balance_usd);
  if (a.balance_source === 'unknown' || bal === null) {
    return `Balance UNKNOWN — never established. Not zero, and not spendable until it is read from ${name}.`;
  }
  const amount = `$${bal.toFixed(2)}`;
  if (a.balance_source === 'inferred') {
    return `~${amount} INFERRED from our own purchase ledger, not read from the vendor. Treat as an estimate.`;
  }
  const when = a.balance_checked_at ? new Date(a.balance_checked_at).toLocaleString() : 'unknown date';
  return `${amount} confirmed from the vendor at ${when}.`;
}

export function topupLine(a: AccountRow): string {
  if (!a.auto_topup_enabled) {
    const set = [n(a.low_water_usd), n(a.topup_to_usd), n(a.monthly_ceiling_usd)].filter((x) => x !== null).length;
    return set === 3
      ? 'Auto top-up is OFF. The limits are set; nothing will charge until it is switched on.'
      : `Auto top-up is OFF and ${3 - set} of its three limits ${3 - set === 1 ? 'is' : 'are'} unset. This account is not configured to charge.`;
  }
  if (!a.card_last4) {
    return 'Auto top-up is ON but there is NO CARD ON FILE, so nothing can actually be charged.';
  }
  return `Auto top-up ON: at $${n(a.low_water_usd)!.toFixed(2)} charge up to $${n(a.topup_to_usd)!.toFixed(2)}, ` +
    `ceiling $${n(a.monthly_ceiling_usd)!.toFixed(2)}/month, card •••• ${a.card_last4}.`;
}

export default function VendorAccountsPanel() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/research/vendor-accounts');
      const json = await res.json();
      // A bare "Unauthorized" tells a reader nothing to do. Driving this panel showed exactly that
      // on screen — the route's one-word refusal, rendered verbatim.
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'Your session is no longer signed in, so the vendor accounts could not be loaded. Sign in again.'
            : json.error || `The vendor accounts could not be loaded (HTTP ${res.status}).`,
        );
      }
      setAccounts(json.accounts as AccountRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function startEdit(a: AccountRow) {
    setEditing(a.vendor_id);
    setError(null);
    setDraft({
      low_water_usd: a.low_water_usd == null ? '' : String(a.low_water_usd),
      topup_to_usd: a.topup_to_usd == null ? '' : String(a.topup_to_usd),
      monthly_ceiling_usd: a.monthly_ceiling_usd == null ? '' : String(a.monthly_ceiling_usd),
      min_topup_interval_mins: String(a.min_topup_interval_mins ?? 60),
      auto_topup_enabled: a.auto_topup_enabled ? 'true' : 'false',
    });
  }

  async function save(vendorId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/research/vendor-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendorId,
          // Empty stays NULL rather than becoming 0 — an unset ceiling and a ceiling of zero are
          // different instructions, and 0 would silently forbid every top-up while looking configured.
          low_water_usd: draft.low_water_usd === '' ? null : Number(draft.low_water_usd),
          topup_to_usd: draft.topup_to_usd === '' ? null : Number(draft.topup_to_usd),
          monthly_ceiling_usd: draft.monthly_ceiling_usd === '' ? null : Number(draft.monthly_ceiling_usd),
          min_topup_interval_mins: Number(draft.min_topup_interval_mins || 60),
          auto_topup_enabled: draft.auto_topup_enabled === 'true',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !accounts) {
    return <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>;
  }
  if (!accounts) return <div className="text-sm text-gray-400">Loading vendor accounts…</div>;
  if (accounts.length === 0) {
    return (
      <div className="rounded border border-gray-700 bg-gray-900 p-4 text-sm text-gray-300">
        No vendor accounts exist yet. Nothing can be purchased from a paid platform until one is
        opened — this is not the same as having a zero balance everywhere.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Vendor accounts</h2>
        <p className="text-xs text-gray-400">
          Limits for automatic top-ups. Nothing charges a card until auto top-up is switched on AND a
          card is on file — and no screen in this app can set a card number.
        </p>
      </div>

      {error && <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}

      {accounts.map((a) => (
        <div key={a.vendor_id} className="rounded border border-gray-700 bg-gray-900 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-100">{a.display_name || a.vendor_id}</h3>
              <p className="text-xs text-gray-500">
                {a.account_status}
                {a.account_identifier ? ` · ${a.account_identifier}` : ''}
                {/* The NAME of an env var, never a secret. The value lives in the secret store. */}
                {a.credential_env_var ? ` · credentials in $${a.credential_env_var}` : ' · no credential variable set'}
              </p>
            </div>
            {editing !== a.vendor_id && (
              <button onClick={() => startEdit(a)} className="text-sm text-blue-400 hover:text-blue-300">
                Edit limits
              </button>
            )}
          </div>

          <p className="text-sm text-gray-300">{balanceLine(a)}</p>
          <p className="text-sm text-gray-300">{topupLine(a)}</p>

          {editing === a.vendor_id && (
            <div className="border-t border-gray-800 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ['low_water_usd', 'Top up when below ($)'],
                  ['topup_to_usd', 'Top up to ($)'],
                  ['monthly_ceiling_usd', 'Monthly ceiling ($)'],
                  ['min_topup_interval_mins', 'Min interval (min)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-sm text-gray-100">
                    <span className="block text-xs text-gray-400 mb-1">{label}</span>
                    <input
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      inputMode="decimal"
                      className="w-full bg-gray-800 rounded px-2 py-1"
                    />
                  </label>
                ))}
              </div>

              <label className="flex items-start gap-2 text-sm cursor-pointer text-gray-100">
                <input
                  type="checkbox"
                  checked={draft.auto_topup_enabled === 'true'}
                  onChange={(e) => setDraft((d) => ({ ...d, auto_topup_enabled: e.target.checked ? 'true' : 'false' }))}
                  className="mt-1"
                />
                <span>
                  Enable automatic top-ups
                  <span className="block text-xs text-gray-400">
                    Requires all three limits. Even then nothing is charged without a card on file,
                    and a charge that may or may not have landed stops the next one rather than
                    risking a double.
                  </span>
                </span>
              </label>

              <div className="flex gap-2">
                <button onClick={() => save(a.vendor_id)} disabled={saving}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm">
                  {saving ? 'Saving…' : 'Save limits'}
                </button>
                <button onClick={() => { setEditing(null); setError(null); }}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
