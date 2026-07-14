# Mobile responsiveness — audit & remediation (2026-07-14)

Tested every route at 390×844 (iPhone-class) as Super Admin, plus desktop regression.

## What is already fine on mobile (no change needed)
Home, Projects (card grid), Reports (KPI cards + bar charts), Attendance overview,
Project-detail header, Kanban board (horizontal-scroll, one column at a time), Calendar,
and — after the modal fix — all dialogs.

The layout shell is sound: an off-canvas drawer + hamburger top-bar below `lg`.

## Root cause of "it sucks on mobile"
**Data tables.** There are 13 `<table>`s and **not one has a mobile layout.** Row-oriented
tables render all their columns at desktop widths, so on a phone they either:
- horizontally scroll a ~970px table inside a 350px viewport (poor — cells wrap to 5 lines), or
- clip the right-hand columns entirely (Status, Assignees, actions unreachable).

## The fix — by table type, from the root
| Table | Type | Fix |
|---|---|---|
| `/tasks` My Tasks | row | **Mobile card layout** (`< sm`), table on `sm:+` |
| `/users` People | row | **Mobile card layout** |
| `/admin` Users | row | **Mobile card layout** |
| Issues, Timesheets, Files, Audit | row | Wrap in `overflow-x-auto` (were clipping) |
| Capacity board, Permission matrix | grid/matrix | Horizontal scroll is the correct pattern — already so |

Row tables that people use daily become cards on mobile (best UX); wide grids, which cannot
be card-ified, scroll horizontally (the correct pattern for a matrix). Minor: a few filter/tab
bars clipped at the right edge — made to scroll cleanly.

Every change is verified at 390px AND at desktop width (must not regress desktop).

## Done (verified in-browser, mobile 390px + desktop 1400px)
- **`/tasks`** → hand-designed `TaskCard` on mobile (`< sm`), table on `sm:+`. Every control
  (complete, status dropdown, progress) works — confirmed a status change persists via the API.
- **`/users` People** → member cards on mobile, table on `sm:+`.
- **`/admin` Users** → member cards on mobile (with the per-row action menu), table on `sm:+`.
  Also fixed the search + designation-filter row that overflowed the right edge (now stacks).
- **Issues, Timesheets, Audit, User-detail permissions** tables → wrapped in `overflow-x-auto`
  with a `min-w`, so they scroll cleanly instead of clipping.
- Confirmed no page scrolls sideways (`bodyOverflowsX: false`) across home, projects, tasks,
  capacity, performance, attendance, reports, users, admin.
- Desktop unchanged everywhere (the table is shown, the cards are `sm:hidden`).

The capacity board and permission matrix keep horizontal scroll — the correct pattern for a
wide grid, which cannot be card-ified.
