// lib/hub/widgets/register-all.ts
//
// Side-effect barrel that registers every shipped widget with the
// widget-registry. The hub canvas imports this once so the renderer
// can resolve every saved widget type via `getWidget(id)`.
//
// New widgets are added to this file as their slice lands. The order
// here is the order they appear in the Add-Widget modal's "All"
// section (each widget defines its own category for the filtered
// views).
//
// Slice 94 of customizable-hub-and-work-mode-2026-05-28.md — first
// entry: Pinned Pages.

import './pinned-pages';
import './quick-actions';
import './my-pay';
import './my-jobs';
import './messages';
import './class-assignments';
import './today-schedule';
import './pto-balance';
import './hours-this-week';
import './recent-activity';
import './bookmarks';
import './open-discussions';
import './recent-announcements';
import './team-status';
import './mentions-inbox';
import './assignments-due';
import './crew-calendar';
import './field-data-pending';
import './job-activity-feed';
// consolidation Slice 5 (2026-05-30) — unified Activity widget folds
// `job-activity-feed` + `recent-activity` into one tile with a
// mode toggle. Legacy widgets stay registered so saved hub layouts
// don't lose their tiles.
import './activity';
import './equipment-out';
import './maintenance-due';
import './low-consumables';
import './vehicles-status';
import './recent-drawings';
import './drawings-in-progress';
// consolidation Slice 4 (2026-05-30) — unified Drawings widget folds
// `recent-drawings` + `drawings-in-progress` into one tile with a
// `scope: 'mine' | 'all'` setting. Legacy widgets stay registered so
// saved hub layouts don't lose their tiles.
import './drawings';
import './active-research-projects';
import './pipeline-status';
import './roadmap-progress';
import './flashcards-due';
import './quiz-history';
import './recommended-lessons';
import './pending-receipts';
import './pending-time-off';
import './pending-hours';
// consolidation Slice 3 (2026-05-30) — the unified `approvals` widget
// folds the three `pending-*` widgets above into one tile. The legacy
// widgets stay registered so saved hub layouts don't lose their tiles;
// a follow-up slice migrates saved layouts + deletes the legacy ids.
import './approvals';
import './monthly-revenue';
import './outstanding-invoices';
import './weather';
import './mileage-tracker';
import './sun-calculator';
import './streak-counter';
import './daily-briefing';
// contacts plan Slice 5 (2026-05-30) — Contacts hub widget.
import './contacts';
// Slice W8 (hub-cad-roles-polish-2026-06-18) — consolidated
// comms-inbox widget. Absorbs messages + mentions-inbox +
// open-discussions into one size-adaptive tile (W5 pattern).
// Legacy widgets stay registered so saved layouts keep
// rendering until users replace them.
import './comms-inbox';
// Slice W9a — consolidated pending-bin widget. Absorbs
// pending-receipts + pending-time-off + pending-hours +
// assignments-due. Legacy widgets stay registered.
import './pending-bin';
// Slice W9b — consolidated drawings-hub widget. Absorbs
// drawings + drawings-in-progress + recent-drawings. Legacy
// widgets stay registered.
import './drawings-hub';
// Slice W9c — consolidated money widget. Absorbs my-pay +
// monthly-revenue + outstanding-invoices. Legacy widgets stay
// registered.
import './money';
// Slice W9d — consolidated learning-stack widget. Absorbs
// class-assignments + flashcards-due + recommended-lessons.
// Legacy widgets stay registered.
import './learning-stack';
// Slice W9e — consolidated field-pulse widget. Absorbs
// team-status + vehicles-status + equipment-out + low-consumables.
// Legacy widgets stay registered.
import './field-pulse';
