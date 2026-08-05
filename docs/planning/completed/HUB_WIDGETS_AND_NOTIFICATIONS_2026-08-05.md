# Hub widgets: mobile editing, robustness, and live notification badges

**Started** 2026-08-05 · **Status** in-progress

Owner requests, verbatim:

> "Whenever I click the customize hub button I want to be able to customize stuff… There are some
> widgets like the quick actions widget, and probably other widgets that we need to be able to edit
> and customize. Right now it doesn't seem like we can. This is for the mobile version. Please fix
> the formatting issues with the text and stuff."

> "We need to be able to edit what can be seen, for instance, in the quick actions widget we need to
> be able to edit what quick actions/links are included."

> "Please make sure the invoice, job, employee, hours, and pay widgets are really well built and
> robust and can get notifications for things that happen regarding those widgets. Like if an
> employee submits hours, for whoever needs to be notified about that event, then if they have that
> widget or quick action on their hub, it should have a notification icon. This should work for jobs
> and stuff too."

> "Whenever AI research gets done, it notifies whoever initiated the research."

---

## 0. What is already true

Measured, not assumed — this changes the size of the work.

- **Widgets already expose a reusable settings editor.** `WidgetDefinition.SettingsForm` is a
  component the desktop `WidgetOptionsPanel` renders; the Quick Actions widget ships
  `QuickActionsSettings`, a full "which actions, in what order, shortcuts on/off" form. The mobile
  editor (`MobileEditor.tsx`) only ever offered reorder + delete + add. **So per-widget editing on
  mobile is reaching an editor that exists, not building one.**
- **Notifications already exist** as `notify()` / `notifyMany()` writing `notifications` rows, and
  hours-submitted already fans out to approvers (H-2, shipped today). What is missing is the loop
  back to the *hub*: a widget or quick action showing that something happened.

---

## 1. Slices

| # | Slice | Status |
|---|---|---|
| **W-1** | Mobile editor: fix the header/hint overlap; per-widget **Edit** opens the widget's own `SettingsForm` | ✅ Shipped |
| **W-2** | Research completion (and failure) notifies its initiator — worker writes a `research_complete` notification, idempotent across both pipelines | ✅ Shipped |
| **W-3** | `notification-topics.ts` — maps a notification `type` to the widgets/quick-actions it belongs on; guarded against the real registry | ✅ Shipped |
| **W-4** | `/api/admin/hub/badges` — the signed-in person’s unread counts grouped per widget/quick-action | ✅ Shipped |
| **W-5** | The badge renders — a count pill on the widget header and on individual quick actions, from one shared feed, paused while editing | ✅ Shipped |
| **W-6** | Robustness pass on the invoice / job / employee / hours / pay widgets — real data, empty states, error states | ✅ Shipped |

---

## W-6 completion note (2026-08-05)

The recurring defect across these widgets was **an absence rendering as an answer**: a failed fetch
caught into `setStatus('empty')`, so a broken service showed "All paid up" / "Hours approved" / "No
recent activity" — telling the office there is nothing outstanding, nothing to approve, no activity,
when in truth the data could not be read. That is a dangerous thing to be wrong about, and it looks
identical to good news.

The fix gives each widget a distinct `'error'` status that renders `<WidgetError … onRetry=…>`, and
keeps the `catch` block off the `'empty'` path. Widgets brought into line this pass:
`pending-hours`, `outstanding-invoices`, `active-research-projects`, `job-activity-feed`
(the last two are the job/research surfaces the badge work lit up). `hours-this-week`, `my-pay`, and
`my-jobs` already distinguished the two and are locked by the same guard.

Guarded by `__tests__/hub/w6-empty-vs-error.test.ts` — a source-lock asserting each of the seven
widgets declares `setStatus('error')`, renders `<WidgetError>` for it, imports the component, and
does **not** fall through to `catch { setStatus('empty') }`. Verified: typecheck, lint, full vitest
suite (23,031 passing), production build.

**Documented follow-up (out of W-6's five-area scope):** roughly a dozen other list widgets still
carry the `catch { setStatus('empty') }` shape (e.g. `contacts`, `messages`, `pto-balance`,
`open-discussions`, `class-assignments`, `assignments-due`). They are lower-stakes than money/hours
but the same class of bug; a future sweep can extend the `WIDGETS` array in the W-6 guard to cover
them one at a time.

---

## 2. Design notes to fix before writing code

**The badge must not become a fifth definition of "who cares about this".** Notifications already
decide their recipient (hours → admins who can decide; research → the initiator). The hub badge is a
*view* of notifications that already exist, filtered to the ones a given widget represents. It must
not re-derive recipients — that is how the pay formula reached four copies. One mapping: event
`type` → widget/quick-action id.

**A badge is an unread count, and "unread" is the notification's own state.** The hub does not invent
a second read-model; opening the widget (or the notification) clears it through the existing
notifications read path.

**"If they have that widget"** is the whole point: the badge is per-person and per-widget. Somebody
without the Hours widget on their hub does not get an hours badge there — they still get the
notification in their bell, because that is a different surface. The widget badge is a convenience,
not the system of record.

**No bank-style overpromising.** A badge says "there is something here to look at", nothing more.
It never claims an action was taken.

---

## 3. Found already, recorded so it is not rediscovered

- **The mobile customize sheet's header overlaps its own hint text** (owner screenshot, 2026-08-05).
  `hub-msheet__bar` was `position: sticky` inside a `position: fixed` flex column; the robust fix is
  a non-scrolling flex header with a solid background and a scrolling body, which cannot overlap
  regardless of the sticky edge cases.
- **Per-widget editing was never wired to mobile** even though every widget that needs it already
  ships a `SettingsForm`.

---

## Andrew Ash website editor — WYSIWYG fidelity (owner request, 2026-08-05)

> "The website editor doesn't display the elements so that they actually are placed anywhere where
> they actually are displayed when a visitor views the site… Please make it more correctly
> representative. This might require shrinking all of the elements down or zooming out… Make sure we
> can switch between mobile view and pc view."

**The builder was never rendering fake blocks** — it already used `WidgetRenderer`, the exact
component the public page uses. The lie was the WIDTH. Every block re-lays-out on the canvas via
container queries (site wide measure 1160px, breakpoint 700px), and the desktop preview set no
width, so it filled the ~850px middle pane. 850px is past the 700 breakpoint but short of 1160, so
two-column sections, hero sizing and spacing reflowed into an arrangement **no visitor ever gets**.
Truthful blocks at a false width — the most misleading combination, because it looks real.

**Fix (`ScaledCanvas.tsx`):** render at the true design width (1200px desktop / 390px phone) so the
container queries fire exactly as on the live site, then scale the whole canvas down with a
transform to fit the pane. A faithful miniature — the real layout, smaller. A "42%" readout in the
header keeps the small size from reading as a bug, and the natural height is measured so the shrunk
canvas reserves its scaled footprint rather than leaving a column of whitespace.

The Computer / Phone switch moved onto the preview header, reachable without first selecting a block.

| # | Slice | Status |
|---|---|---|
| **AA-1** | Desktop preview renders true-to-life (design-width + scale-to-fit); device switch on the preview; zoom readout | ✅ Shipped |
| **AA-2** | Mobile *editing tools* robustness pass — inspector controls sized for touch, palette + block-list panes on a phone | ✅ Shipped |

**Verification:** typecheck, lint, a production build of `/AndrewAsh/studio/pages/[id]`, and source
guards (`builder-wysiwyg.test.ts`). A live browser screenshot was blocked by a corrupted `.next`
dev cache owned by another concurrent session (a `prop-types.js` vendor-chunk 500 unrelated to this
change) — worth re-checking visually once that clears.

### AA-2 completion note (2026-08-05)

The desktop panes assume a mouse, and every one of those assumptions is a defect on a phone: the
insert-between-blocks affordance was `color: transparent` until `:hover` (invisible and un-tappable
on touch, so you could only append at the end); the move/hide/duplicate/delete tools were
deliberately sub-tap-target (~23px); and the inspector's text inputs were 13px, which makes iOS
Safari zoom the whole builder the instant a field focuses — the very bug the palette search was
already fixed for. The pane tab-bar also scrolled away, stranding you with no way back to the
preview from the bottom of a long inspector.

The fix is one `@media (max-width: 1099px)` block in `builder.css` — scoped to the exact seam where
the three panes become tabs, so the desktop layout is untouched. It makes the insert line visible,
gives the block tools and list controls 44px targets, bumps every field to 16px, pins the tab bar,
and gives the add-block palette a full-height single-column sheet. Guarded by the AA-2 block in
`builder-wysiwyg.test.ts` (source-lock on the mobile media query). Verified: typecheck, lint, full
vitest suite, production build.
