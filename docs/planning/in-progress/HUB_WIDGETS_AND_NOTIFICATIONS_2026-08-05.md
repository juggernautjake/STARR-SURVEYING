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
| **W-1** | Mobile editor: fix the header/hint overlap; per-widget **Edit** opens the widget's own `SettingsForm` | ⬜ Next |
| **W-2** | Research completion notifies whoever initiated it | ⬜ |
| **W-3** | A notification "topic" model — map an event kind to the widgets/quick-actions it belongs to | ⬜ |
| **W-4** | Unread-count endpoint keyed by topic, for the signed-in person | ⬜ |
| **W-5** | Badge on a widget when it has unread events; badge on a quick action likewise | ⬜ |
| **W-6** | Robustness pass on the invoice / job / employee / hours / pay widgets — real data, empty states, error states | ⬜ |

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
