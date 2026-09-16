'use client';
// /admin/calls/registry — the receptionist's caller ID memory: which number belongs to whom.
//
// Owner, 2026-09-16: "The voice agent needs to know that my number is (254)-315-1123 (Jacob
// Maddux). it should not assume that anyone else's number is me."
//
// The one thing this page exists to communicate is the distinction seeds/640_caller_registry.sql
// is built around, so it is said in three places rather than one — the badge on every row, the
// hint above the name field, and the sentence under the title:
//
//   CONFIRMED (`verified`)  a person put this name to this number on purpose, so the receptionist
//                           may lead with it: "Hi, is this Jacob?"
//   HEARD ON A CALL         the name came off a transcript or a form. The receptionist asks who is
//   (`observed`)            speaking and only uses the name to recognise the answer.
//
// Typing a name here is what promotes it — saveRegistryEntry sets `name_source = 'verified'` on any
// name an admin types, because a human putting a name to a number IS the verification. That is
// stated on the form; a page that quietly changed how the agent greets someone would be worse than
// no page at all.
import './CallerRegistry.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';
import { useToast } from '../../components/Toast';
import {
  RELATIONSHIPS, formatPhone, registryKey,
  type RegistryEntry, type Relationship,
} from '@/lib/receptionist/registry';

const API = '/api/admin/caller-registry';

/** The sentinel the editor uses while adding a number that has no key yet. */
const NEW_ENTRY = '__new__';

/** What each relationship means to the office, in the words a person would use. */
const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  owner: 'The owner',
  staff: 'Staff',
  family: 'Family',
  customer: 'Customer',
  vendor: 'Vendor',
  spam: 'Spam',
  unknown: 'Not sure yet',
};

interface Draft {
  phone: string;
  displayName: string;
  email: string;
  company: string;
  relationship: Relationship;
  notes: string;
  neverAssume: boolean;
}

function draftFrom(entry: RegistryEntry): Draft {
  return {
    phone: entry.phone,
    displayName: entry.displayName ?? '',
    email: entry.email ?? '',
    company: entry.company ?? '',
    relationship: entry.relationship,
    notes: entry.notes ?? '',
    neverAssume: entry.neverAssume,
  };
}

const BLANK_DRAFT: Draft = {
  phone: '', displayName: '', email: '', company: '', relationship: 'unknown', notes: '', neverAssume: false,
};

/** When they last rang, written the way somebody would say it out loud. */
function lastHeard(iso: string | null): string {
  if (!iso) return 'Never rung — added by hand';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  return d.getFullYear() === new Date().getFullYear()
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timesCalledText(n: number): string {
  if (!n) return 'No calls logged';
  return n === 1 ? 'Called once' : `Called ${n} times`;
}

export default function CallerRegistryPage(): React.ReactElement {
  const { safeFetch, safeAction, reportPageError } = usePageError('CallerRegistryPage');
  const { addToast } = useToast();

  const [entries, setEntries] = useState<RegistryEntry[] | null>(null);
  const [relationships, setRelationships] = useState<readonly Relationship[]>(RELATIONSHIPS);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  // One row at a time: the phone being edited, or NEW_ENTRY, or null for "nothing open".
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingForget, setConfirmingForget] = useState<string | null>(null);

  // ── The search box. 300ms, so a five-letter name is one request rather than five. ──────────
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    const url = debounced ? `${API}?search=${encodeURIComponent(debounced)}` : API;
    setLoadFailed(false);
    void safeFetch<{ entries?: RegistryEntry[]; relationships?: Relationship[] }>(url).then((data) => {
      if (!alive) return;
      if (!data) { setLoadFailed(true); setEntries(null); return; }
      setEntries(data.entries ?? []);
      if (data.relationships?.length) setRelationships(data.relationships);
    });
    return () => { alive = false; };
  }, [debounced, reloadKey, safeFetch]);

  const openEditor = useCallback((entry: RegistryEntry | null) => {
    setConfirmingForget(null);
    setFormError(null);
    setEditing(entry ? entry.phone : NEW_ENTRY);
    setDraft(entry ? draftFrom(entry) : BLANK_DRAFT);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setFormError(null);
    setDraft(BLANK_DRAFT);
  }, []);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const key = registryKey(draft.phone);
    if (!key) {
      setFormError('That needs to be a ten-digit US phone number — (254) 315-1123, 254-315-1123 or 2543151123 all work.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const result = await safeAction('saving a caller registry entry', async () => (
      safeFetch<{ entry?: RegistryEntry }>(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: key,
          displayName: draft.displayName,
          email: draft.email,
          company: draft.company,
          relationship: draft.relationship,
          notes: draft.notes,
          neverAssume: draft.neverAssume,
        }),
      })
    ));
    setSaving(false);
    const entry = result?.entry;
    if (!entry) {
      setFormError('That did not save. Nothing has changed — try once more, and if it keeps failing the registry is not answering.');
      return;
    }
    // Update the row in place; a number that was not in the list yet goes to the top, where the
    // ordering (most recently heard from first) would have put it anyway.
    setEntries((prev) => {
      const list = prev ?? [];
      const at = list.findIndex((e) => e.phone === entry.phone);
      if (at === -1) return [entry, ...list];
      const next = list.slice();
      next[at] = entry;
      return next;
    });
    addToast(
      entry.displayName
        ? `${formatPhone(entry.phone)} is ${entry.displayName}. The receptionist may greet them by name.`
        : `Saved ${formatPhone(entry.phone)}.`,
      'success',
    );
    closeEditor();
  }, [addToast, closeEditor, draft, safeAction, safeFetch]);

  // ── Forget ─────────────────────────────────────────────────────────────────────────────────
  const forget = useCallback(async (phone: string) => {
    const ok = await safeAction('forgetting a caller registry entry', async () => (
      safeFetch<{ ok?: boolean }>(`${API}?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' })
    ));
    if (!ok?.ok) {
      addToast('That number is still there — the registry did not accept the change.', 'error');
      return;
    }
    setEntries((prev) => (prev ?? []).filter((e) => e.phone !== phone));
    setConfirmingForget(null);
    if (editing === phone) closeEditor();
    addToast(`Forgot ${formatPhone(phone)}. The receptionist will start over next time it rings.`, 'success');
  }, [addToast, closeEditor, editing, safeAction, safeFetch]);

  const total = entries?.length ?? 0;
  const countText = useMemo(() => {
    if (entries === null) return '';
    if (debounced) return total === 1 ? '1 number matches' : `${total} numbers match`;
    return total === 1 ? '1 number known' : `${total} numbers known`;
  }, [debounced, entries, total]);

  // ── The editor, shared by "edit this row" and "add a number" ───────────────────────────────
  const editor = (isNew: boolean) => (
    <div className="creg__editor" data-testid="creg-editor">
      <div className="creg__editorhead">
        <h2 className="creg__editortitle">
          {isNew ? 'Add a number' : `Editing ${formatPhone(draft.phone)}`}
        </h2>
        <p className="creg__hint">
          A name you type here is <strong>confirmed</strong>: you are telling the receptionist it may
          greet this number by that name. Leave it blank if you are not sure who it is.
        </p>
      </div>

      <div className="creg__grid">
        <div className="creg__field">
          <label className="creg__label" htmlFor="creg-phone">Phone number</label>
          <input
            id="creg-phone"
            className="creg__input"
            data-testid="creg-field-phone"
            value={draft.phone}
            disabled={!isNew}
            placeholder="(254) 315-1123"
            inputMode="tel"
            onChange={(e) => set('phone', e.target.value)}
          />
          {isNew ? <p className="creg__hint">Ten digits. However you like to write them.</p> : null}
        </div>

        <div className="creg__field">
          <label className="creg__label" htmlFor="creg-name">Name</label>
          <input
            id="creg-name"
            className="creg__input"
            data-testid="creg-field-name"
            value={draft.displayName}
            placeholder="Nobody has said who this is"
            onChange={(e) => set('displayName', e.target.value)}
          />
        </div>

        <div className="creg__field">
          <label className="creg__label" htmlFor="creg-rel">Who they are to us</label>
          <select
            id="creg-rel"
            className="creg__select"
            data-testid="creg-field-relationship"
            value={draft.relationship}
            onChange={(e) => set('relationship', e.target.value as Relationship)}
          >
            {relationships.map((r) => (
              <option key={r} value={r}>{RELATIONSHIP_LABEL[r] ?? r}</option>
            ))}
          </select>
        </div>

        <div className="creg__field">
          <label className="creg__label" htmlFor="creg-email">Email</label>
          <input
            id="creg-email"
            className="creg__input"
            data-testid="creg-field-email"
            type="email"
            value={draft.email}
            placeholder="Optional"
            onChange={(e) => set('email', e.target.value)}
          />
        </div>

        <div className="creg__field">
          <label className="creg__label" htmlFor="creg-company">Company</label>
          <input
            id="creg-company"
            className="creg__input"
            data-testid="creg-field-company"
            value={draft.company}
            placeholder="Optional"
            onChange={(e) => set('company', e.target.value)}
          />
        </div>

        <div className="creg__field creg__field--wide">
          <label className="creg__label" htmlFor="creg-notes">What the receptionist should know</label>
          <textarea
            id="creg-notes"
            className="creg__textarea"
            data-testid="creg-field-notes"
            value={draft.notes}
            placeholder={'Written for the agent to act on — "never run a survey enquiry with him; take a message for Hank and let him go."'}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <div className="creg__field creg__field--wide">
          <label className="creg__check">
            <input
              type="checkbox"
              data-testid="creg-field-neverassume"
              checked={draft.neverAssume}
              onChange={(e) => set('neverAssume', e.target.checked)}
            />
            <span>
              <strong>Never put a name to this number.</strong> For a phone that is shared, has been
              reassigned, or belongs to someone who asked not to be recognised. The receptionist is
              still told the number has rung before — it is simply given no name at all.
            </span>
          </label>
        </div>
      </div>

      {formError ? <p className="creg__formerror" data-testid="creg-form-error">{formError}</p> : null}

      <div className="creg__editoractions">
        <button
          type="button"
          className="creg__btn creg__btn--primary"
          data-testid="creg-save"
          disabled={saving}
          onClick={() => { void save(); }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="creg__btn creg__btn--quiet"
          data-testid="creg-cancel"
          disabled={saving}
          onClick={closeEditor}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="creg">
      <div className="creg__head">
        <div>
          <h1 className="creg__title">Caller Registry</h1>
          <p className="creg__sub">
            Who the receptionist thinks each number belongs to, and how sure it is. A name you
            <strong> confirm</strong> here is one it may greet by — &ldquo;Hi, is this Jacob?&rdquo;
            A name it merely <strong>heard on a call</strong> is only a hint: it will ask who is
            speaking rather than assume.
          </p>
        </div>
        <div className="creg__headactions">
          <Link href="/admin/calls" className="creg__btn" data-testid="creg-calls-link">
            ← Back to Calls
          </Link>
          <button
            type="button"
            className="creg__btn creg__btn--primary"
            data-testid="creg-add"
            onClick={() => openEditor(null)}
          >
            Add a number
          </button>
        </div>
      </div>

      <div className="creg__searchrow">
        <input
          className="creg__search"
          data-testid="creg-search"
          type="search"
          value={search}
          placeholder="Search a name, a number, a company or a note"
          aria-label="Search the caller registry"
          onChange={(e) => setSearch(e.target.value)}
        />
        {countText ? <span className="creg__count" data-testid="creg-count">{countText}</span> : null}
      </div>

      {editing === NEW_ENTRY ? editor(true) : null}

      {loadFailed ? (
        <div className="creg__state creg__state--error" data-testid="creg-error">
          <p className="creg__statetitle">We could not read the registry</p>
          <p className="creg__statebody">
            Nothing is lost — the receptionist still knows everything it knew a minute ago, this page
            just could not get a look at it. Try again, and if it keeps failing the caller registry
            API is not answering.
          </p>
          <div className="creg__stateactions">
            <button
              type="button"
              className="creg__btn"
              data-testid="creg-retry"
              onClick={() => { setReloadKey((k) => k + 1); reportPageError('Caller registry list failed to load; the user asked for a retry.', { element: 'creg-retry', severity: 'low' }); }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : entries === null ? (
        <p className="creg__statebody" data-testid="creg-loading">Looking up what we know…</p>
      ) : entries.length === 0 ? (
        <div className="creg__state" data-testid="creg-empty">
          <p className="creg__statetitle">
            {debounced ? 'Nothing here by that name' : 'The receptionist has not met anybody yet'}
          </p>
          <p className="creg__statebody">
            {debounced
              ? 'No number, name, company or note matches that. Try part of a number, or clear the search to see everyone.'
              : 'Every real call adds the number it came from, along with what they rang about. You can also add somebody now — the crew, family, a regular customer — so the receptionist knows them the first time they ring.'}
          </p>
          <div className="creg__stateactions">
            {debounced ? (
              <button type="button" className="creg__btn" data-testid="creg-clear-search" onClick={() => setSearch('')}>
                Clear the search
              </button>
            ) : (
              <button type="button" className="creg__btn creg__btn--primary" data-testid="creg-empty-add" onClick={() => openEditor(null)}>
                Add a number
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="creg__list">
          {entries.map((e) => {
            if (editing === e.phone) return <div key={e.phone}>{editor(false)}</div>;
            const confirmed = e.nameSource === 'verified' && !!e.displayName;
            return (
              <div
                key={e.phone}
                className={`creg__row${e.neverAssume ? ' creg__row--anon' : ''}`}
                data-testid={`creg-row-${e.phone}`}
              >
                <div className="creg__who">
                  <p className="creg__phone">{formatPhone(e.phone)}</p>
                  <p className={`creg__name${e.displayName ? '' : ' creg__name--none'}`}>
                    {e.displayName || 'No name yet'}
                    {e.company ? ` · ${e.company}` : ''}
                  </p>
                  <div className="creg__badges">
                    {e.displayName ? (
                      <span
                        className={`creg__badge ${confirmed ? 'creg__badge--confirmed' : 'creg__badge--observed'}`}
                        data-testid={`creg-badge-${e.phone}`}
                        title={confirmed
                          ? 'Somebody put this name to this number on purpose. The receptionist may greet them by name.'
                          : 'This name was overheard on a call. The receptionist will ask who is speaking, not assume.'}
                      >
                        {confirmed ? 'Confirmed' : 'Heard on a call'}
                      </span>
                    ) : null}
                    {e.neverAssume ? (
                      <span className="creg__badge creg__badge--anon" title="Shared or reassigned: the receptionist is told this number has rung before, and given no name.">
                        No name, ever
                      </span>
                    ) : null}
                    <span className="creg__badge creg__badge--rel">{RELATIONSHIP_LABEL[e.relationship] ?? e.relationship}</span>
                  </div>
                </div>

                <div className="creg__about">
                  <span className="creg__aboutlabel">Last called about</span>
                  {e.lastAbout || 'Nothing recorded'}
                  {e.notes ? <p className="creg__notes">{e.notes}</p> : null}
                </div>

                <div className="creg__side">
                  <span className="creg__when">{lastHeard(e.lastSeenAt)}</span>
                  <span>{timesCalledText(e.timesCalled)}</span>
                  <div className="creg__rowactions">
                    {/* TODO: /admin/calls has no `?search=` — it filters client-side by kind only.
                        Linking at the list rather than inventing a parameter the page ignores;
                        point this at `/admin/calls?search=${e.phone}` once that page reads one. */}
                    <Link href="/admin/calls" className="creg__link" data-testid={`creg-calls-${e.phone}`}>
                      Their calls →
                    </Link>
                    <button
                      type="button"
                      className="creg__btn creg__btn--sm"
                      data-testid={`creg-edit-${e.phone}`}
                      onClick={() => openEditor(e)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="creg__btn creg__btn--sm creg__btn--quiet"
                      data-testid={`creg-forget-${e.phone}`}
                      onClick={() => setConfirmingForget(confirmingForget === e.phone ? null : e.phone)}
                    >
                      Forget
                    </button>
                  </div>
                </div>

                {confirmingForget === e.phone ? (
                  <div className="creg__confirm" data-testid={`creg-confirm-${e.phone}`}>
                    <p className="creg__confirmtext">
                      Forget {formatPhone(e.phone)}? The name, the note and the count of {e.timesCalled}{' '}
                      {e.timesCalled === 1 ? 'call' : 'calls'} all go. The calls themselves stay in the
                      log, and the number will be learned again the next time it rings — as a stranger.
                    </p>
                    <button
                      type="button"
                      className="creg__btn creg__btn--sm creg__btn--danger"
                      data-testid={`creg-forget-confirm-${e.phone}`}
                      onClick={() => { void forget(e.phone); }}
                    >
                      Yes, forget it
                    </button>
                    <button
                      type="button"
                      className="creg__btn creg__btn--sm creg__btn--quiet"
                      data-testid={`creg-forget-cancel-${e.phone}`}
                      onClick={() => setConfirmingForget(null)}
                    >
                      Keep it
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
