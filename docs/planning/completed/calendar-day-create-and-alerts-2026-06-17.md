# Calendar day-create + alerts — 2026-06-17

> User: "On the calendar, please make it so that whenever we hover
> over a day on the calendar, it shows a little plus button. We
> can click it, and then it will give us the option to create a
> special event, or create a job for that day. We will be able to
> add all of the details, and we can include users to be able to
> see that event as well. We can either include specific users,
> or all users, or keep it private. This way people can use the
> calendar as a private scheduler. We need a whole alert system
> so that we can set reminders for events coming up. Please build
> out all of the settings and dialogue menu options for this."

## What already exists

- `/admin/calendar` page (month / week / day views, full-screen,
  phase legend) — shipped under `job-calendar` plan.
- `schedule_events` table with `id, title, event_type, start_time,
  end_time, all_day, location, notes, job_id, assigned_to,
  assigned_by, color, recurrence_rule, recurrence_end, series_id,
  status`.
- `/api/admin/schedule` CRUD endpoint (GET/POST/PATCH/DELETE).
- `lib/hub/calendar/AddEventForm.tsx` — compact event form used by
  the today-schedule hub widget.
- `lib/notifications/event-reminder.ts` + the
  `schedule-event-reminders` cron — fires a single notification
  ~1 hour before any timed event.

## What's missing per the user

1. **Hover-add affordance** on the calendar's day cells (month view).
2. A small menu after click: **Create event** or **Create job**.
3. A **full-featured event modal** opened from the day cell, with
   the date pre-filled.
4. **Visibility selector**: `private` (creator-only),
   `specific_users` (CSV / multi-select), or `all_users`.
5. **Custom reminder lead times** — not just the existing single
   1-hour fire; the user wants the option to pick 5min / 1hr /
   1day / off per event.
6. **Job creation entry point** that prefills the scheduled date.

## Slice plan

The S1 surface area is already meaningful (hover affordance +
modal + job-prefill link); S2/S3 layer on the persistence work.

| Slice | What ships |
|---|---|
| **S1** | Hover-plus button on month-view day cells + small Event/Job menu + a centered "Create event" modal reusing AddEventForm (date pre-filled) + Job menu item navigates to `/admin/jobs/new?scheduled_for=<iso>`. After event create the calendar refetches. CSS-only show/hide for the plus on cell hover so it stays out of the user's way until they want it. ✅ shipped |
| **S2** | Schema migration: add `visibility` ('private' \| 'specific_users' \| 'all_users') + `viewer_emails text[]` to `schedule_events`. API accepts/echoes them. Modal form gets a visibility selector + a multi-email picker (specific users mode). ✅ shipped |
| **S3** | Schema migration: add `reminder_minutes_before integer[]` to `schedule_events` (default `[60]`). Modal form gets a "Remind me" multi-select (5min / 15min / 1hr / 1day / off). `schedule-event-reminders` cron extended to fire per configured lead. ✅ shipped |

Each slice ships with the standard three post-build checks.

## Notes locked from the spec

- **Hover-only affordance**: per "whenever we hover over a day on
  the calendar, it shows a little plus button". The button is
  invisible by default and animates in on `:hover` of the cell so
  the calendar stays calm at rest.
- **Date pre-fill**: clicking "+" on the Aug 4 cell pre-fills the
  modal's date field to `2026-08-04`.
- **Reuse > rebuild**: S1 reuses `AddEventForm` instead of
  duplicating the form. S2/S3 extend the same form so every
  surface (hub widget today-schedule + calendar day-cell modal)
  gets the new fields for free.
- **No new schema in S1**: keeps S1 small + reversible. S2 + S3
  each carry their own migration.
