'use client';
// app/admin/design/compare/CompareBoard.tsx — all the versions of a page, at once.
//
// Phase V of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"create multiple versions of each page and preview them all"*, and — the reason it is one
// request rather than two — *"make different themes… to really get any look I want."* Seeing three
// layouts is useful. Seeing three layouts under two themes is the question people actually have.
//
// ── WHY THIS RENDERS THE REAL ELEMENTS AT A SMALL SCALE, NOT THUMBNAILS ─────────────────────────
//
// A stored PNG per design would be faster and would be wrong within a day: it goes stale the moment
// somebody edits a design and never regenerates unless something remembers to. Rendering the actual
// document scaled down is always current, costs nothing to keep in sync, and — the part that
// matters — lets the THEME be swapped across every version at once, which a picture cannot do.
//
// The scale is a CSS transform on the same markup the artboard uses, so what is compared is what
// would be exported.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Monitor, Smartphone, Palette as PaletteIcon } from 'lucide-react';
import { fetchDesigns, fetchDesign } from '@/lib/design/client';
import { contentHeight, type DesignDocument, type ViewId } from '@/lib/design/document';
import { getEntry } from '@/lib/design/catalogue';
import { renderElement, positionStyle } from '@/lib/design/render';
import { themeStyle, BUILT_IN_THEMES, type Theme } from '@/lib/design/theme';
import '../DesignStudio.css';
// The catalogue's stylesheets, for the same reason the studio imports them: without these the
// previews render browser defaults and the comparison is between two lies.
import '../../styles/AdminJobs.css';
import '../../styles/AdminProjects.css';
import '../../styles/AdminLearn.css';
import '../../styles/AdminTimeLogs.css';
import '../../styles/AdminUsers.css';
import '../../styles/EmployeePond.css';
import '../../components/nav/WorkspaceLanding.css';
import '../../components/nav/AdminPageHeader.css';

/** How wide each preview column is. Three fit a 1440 screen, which is the number of alternatives
 *  anybody actually holds in their head. */
const COLUMN = 360;

export default function CompareBoard() {
  const params = useSearchParams();
  const routeParam = params?.get('route') ?? '';

  const [route, setRoute] = useState(routeParam);
  const [routes, setRoutes] = useState<string[]>([]);
  const [docs, setDocs] = useState<DesignDocument[]>([]);
  const [viewId, setViewId] = useState<ViewId>('desktop');
  const [override, setOverride] = useState<Theme | null | 'each'>('each');
  const [loading, setLoading] = useState(false);

  // Which routes have more than one design — the only ones there is anything to compare.
  useEffect(() => {
    fetchDesigns().then(({ value }) => {
      const byRoute = new Map<string, number>();
      for (const d of value) if (d.route) byRoute.set(d.route, (byRoute.get(d.route) ?? 0) + 1);
      const withAny = [...byRoute.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
      setRoutes(withAny);
      if (!routeParam && withAny.length) setRoute((current) => current || withAny[0]);
    });
  }, [routeParam]);

  const load = useCallback(async (forRoute: string) => {
    if (!forRoute) { setDocs([]); return; }
    setLoading(true);
    const { value: summaries } = await fetchDesigns();
    const mine = summaries.filter((s) => s.route === forRoute);
    const loaded = await Promise.all(mine.map((s) => fetchDesign(s.id).then((r) => r.value)));
    setDocs(loaded.filter((d): d is DesignDocument => !!d));
    setLoading(false);
  }, []);

  useEffect(() => { void load(route); }, [route, load]);

  const themeFor = (doc: DesignDocument): Theme | null => {
    if (override === 'each') return (doc.theme as Theme | null) ?? null;
    return override;
  };

  const columns = useMemo(() => docs.map((doc) => {
    const view = doc.views[viewId];
    const height = contentHeight(view);
    // Scale so the whole artboard width fits the column. Everything inside is the real markup.
    const scale = COLUMN / view.width;
    return { doc, view, height, scale };
  }), [docs, viewId]);

  return (
    <div className="dsx-compare">
      <header className="dsx-compare__bar">
        <Link className="dsx__back" href="/admin/design"><ChevronLeft size={16} aria-hidden /> Designs</Link>

        <label className="dsx-compare__field">
          <span>Page</span>
          <select value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="">Pick a page…</option>
            {routes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <div className="dsx__views">
          <button className={`dsx__view${viewId === 'desktop' ? ' is-on' : ''}`} onClick={() => setViewId('desktop')}>
            <Monitor size={15} aria-hidden /> Desktop
          </button>
          <button className={`dsx__view${viewId === 'mobile' ? ' is-on' : ''}`} onClick={() => setViewId('mobile')}>
            <Smartphone size={15} aria-hidden /> Mobile
          </button>
        </div>

        {/* One theme across every version, or each in its own. The first answers "which layout",
          * the second answers "which look" — and mixing them answers neither. */}
        <label className="dsx-compare__field">
          <span><PaletteIcon size={13} aria-hidden /> Theme</span>
          <select
            value={override === 'each' ? 'each' : (override?.id ?? 'none')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'each') setOverride('each');
              else if (v === 'none') setOverride(null);
              else setOverride(BUILT_IN_THEMES.find((t) => t.id === v) ?? null);
            }}
          >
            <option value="each">Each in its own theme</option>
            <option value="none">All in the app’s colours</option>
            {BUILT_IN_THEMES.filter((t) => t.id !== 'starr-default').map((t) => (
              <option key={t.id} value={t.id}>All in {t.name}</option>
            ))}
          </select>
        </label>

        <span className="dsx-compare__count">
          {loading ? 'Loading…' : `${columns.length} version${columns.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {!route && <p className="dsx-compare__empty">Pick a page to see every version of it side by side.</p>}
      {route && !loading && columns.length === 0 && (
        <p className="dsx-compare__empty">No designs for <code>{route}</code> yet.</p>
      )}
      {route && !loading && columns.length === 1 && (
        <p className="dsx-compare__empty dsx-compare__empty--hint">
          One version so far. Duplicate it from the designs list to compare alternatives.
        </p>
      )}

      <div className="dsx-compare__board">
        {columns.map(({ doc, view, height, scale }) => (
          <article key={doc.id} className="dsx-compare__col" style={{ width: COLUMN }}>
            <header className="dsx-compare__col-head">
              <Link href={`/admin/design/${doc.id}`} className="dsx-compare__col-name">{doc.name}</Link>
              <span>
                {view.elements.length} elements
                {doc.theme && override === 'each' && <> · {doc.theme.name}</>}
              </span>
            </header>

            {/* The real artboard, scaled. `transform` rather than a smaller layout, so what is on
              * screen is the same DOM the export walks. */}
            <div className="dsx-compare__frame" style={{ height: height * scale }}>
              <div
                className="dsx-compare__board-art dsx__artboard"
                style={{
                  ...themeStyle(themeFor(doc)),
                  width: view.width,
                  height,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                {view.drawingBelow && view.drawing && (
                  <img className="dsx-compare__sketch" src={view.drawing} alt="" style={{ width: view.width, height }} />
                )}
                {[...view.elements].sort((a, b) => a.z - b.z).map((el) => {
                  const entry = el.catalogId ? getEntry(el.catalogId) : undefined;
                  return (
                    <div
                      key={el.id}
                      className={`dsx__el${entry?.size.contentHeight ? '' : ' dsx__el--fill'}`}
                      style={positionStyle(el, entry)}
                    >
                      <div className="dsx__el-inner" dangerouslySetInnerHTML={{ __html: renderElement(entry, el) }} />
                    </div>
                  );
                })}
                {!view.drawingBelow && view.drawing && (
                  <img className="dsx-compare__sketch" src={view.drawing} alt="" style={{ width: view.width, height }} />
                )}
              </div>
            </div>

            {doc.notes && <p className="dsx-compare__notes">{doc.notes}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
