'use client';
// app/admin/design/DesignHome.tsx — the list of designs.
//
// Slice S2 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"I need to be able to name the design and save it and be able to open it and work on it
// more in the future… I will go through this process with each and every page."*
//
// So this page is built around the plural: 147 admin routes, each getting a desktop and a mobile
// design, is a list that has to stay findable. It is searchable, it shows which route each design
// is for, and it says how many elements are on each view so you can tell a real design from a
// scratch one without opening it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Trash2, Copy, PenTool, Clock } from 'lucide-react';
import { createDocument, type DesignDocument } from '@/lib/design/document';

import { fetchDesigns, fetchDesign, pushDesign, removeDesign, type DesignSummary } from '@/lib/design/client';
import { ENTRIES } from '@/lib/design/catalogue';
import './DesignStudio.css';

function newId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function DesignHome() {
  const router = useRouter();
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [route, setRoute] = useState('');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { value, message } = await fetchDesigns();
    setDesigns(value);
    setNotice(message ?? null);
    setReady(true);
  }, []);

  // The list is a server fact now; fetching during render would break hydration just as reading
  // localStorage did.
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) => `${d.name} ${d.route ?? ''}`.toLowerCase().includes(q));
  }, [designs, query]);

  async function create() {
    const now = new Date().toISOString();
    const doc: DesignDocument = createDocument({
      id: newId(),
      name: name.trim() || 'Untitled design',
      route: route.trim() || null,
      now,
    });
    // Written before navigating, so the editor's own load finds it on the server rather than
    // racing it. `pushDesign` writes locally too, so a failed upload still opens.
    await pushDesign(doc, 'created');
    router.push(`/admin/design/${doc.id}`);
  }

  /** Duplicate as a variant: same lineage, its own id, saved server-side like any other design. */
  async function duplicate(summary: DesignSummary) {
    const { value: source } = await fetchDesign(summary.id);
    if (!source) { setNotice('That design could not be opened to copy.'); return; }
    const now = new Date().toISOString();
    await pushDesign({
      ...source,
      id: newId(),
      name: `${summary.name} (variant)`,
      variantOf: source.variantOf ?? source.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }, `variant of ${summary.name}`);
    await refresh();
  }

  async function remove(summary: DesignSummary) {
    if (!window.confirm(`Delete “${summary.name}”? It can be restored from the database, but not from here.`)) return;
    const { message } = await removeDesign(summary.id);
    if (message) setNotice(message);
    await refresh();
  }

  return (
    <div className="dsx-home">
      <header className="dsx-home__head">
        <div>
          <h1><PenTool size={22} aria-hidden /> Page Designer</h1>
          <p>
            Lay out a page the way you want it — desktop and mobile as two separate designs — then
            export the screenshots, the HTML and a spec to build from.
            <strong> {ENTRIES.length} elements</strong> in the palette, searchable by what they do.
          </p>
        </div>
      </header>

      <section className="dsx-home__new">
        <h2>Start a design</h2>
        <div className="dsx-home__new-row">
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jobs list — denser" />
          </label>
          <label>
            <span>Page it is for (optional)</span>
            <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/admin/jobs" />
          </label>
          <button className="dsx-home__create" onClick={create} data-testid="ds-create">
            <Plus size={16} aria-hidden /> Create
          </button>
        </div>
      </section>

      <section className="dsx-home__list">
        <div className="dsx-home__list-head">
          <h2>Your designs</h2>
          <label className="dsx-home__search">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or page" aria-label="Search designs" />
          </label>
        </div>

        {notice && <p className="dsx-recovered" role="status">{notice}</p>}

        {!ready && <p className="dsx-home__empty">Loading…</p>}

        {ready && filtered.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty__icon">🎨</div>
            <div className="admin-empty__title">{designs.length ? 'Nothing matches that' : 'No designs yet'}</div>
            <div className="admin-empty__desc">
              {designs.length
                ? 'Try the page path instead of the name.'
                : 'Name one above and press Create.'}
            </div>
          </div>
        )}

        {filtered.map((d) => (
          <article key={d.id} className="dsx-home__card">
            {/* Not prefetched. The editor is a heavy client bundle and there will be hundreds of
                these rows; prefetching every one on sight wastes the connection, and a prefetch
                that is aborted when a row is deleted logs a "Failed to fetch RSC payload" error to
                the console for what is a completely ordinary action. */}
            <Link href={`/admin/design/${d.id}`} className="dsx-home__card-main" prefetch={false}>
              <h3>{d.name}</h3>
              <p className="dsx-home__card-meta">
                {d.route ? <code>{d.route}</code> : <em>no page set</em>}
                <span><Clock size={13} aria-hidden /> {new Date(d.updatedAt).toLocaleString()}</span>
                <span>v{d.version}</span>
              </p>
              <p className="dsx-home__card-counts">
                <span>{d.counts.desktop} on desktop</span>
                <span>{d.counts.mobile} on mobile</span>
              </p>
            </Link>
            <div className="dsx-home__card-actions">
              <button title="Duplicate as a variant" onClick={() => void duplicate(d)}>
                <Copy size={15} aria-hidden />
              </button>
              <button className="is-danger" title="Delete" onClick={() => void remove(d)}>
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </article>
        ))}
      </section>

      <p className="dsx-home__note">
        Designs are saved to the database, so they open on any machine you sign in from, and every
        save keeps a version you can go back to. A copy is also kept in this browser, which is what
        you carry on editing if the connection drops. Export
        anything you want to keep or hand over — the export includes the HTML, an image of each
        view, and a spec with the app’s real class names in it.
      </p>
    </div>
  );
}
