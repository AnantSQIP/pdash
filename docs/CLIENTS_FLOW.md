# The clients flow

Branch `clients-flow`, cut from `fix-data-destruction` (bb5728b) so it carries those five fixes.
**Not merged into `main`, and not to be, until the owner says so in person.**

## What the owner asked for

> There will be groups of clients. What we now call projects will be considered clients. Inside a
> client we create groups of tasks and assign those tasks to the team, and that shows in Team
> Capacity. Change the UI, the logic and the PID to suit. Comment out — only comment out — the
> patent portal, the patent ID and the client ID. Work out how creating a new project changes.

And later (phase 8):

> In the client workflow remove the request PID feature completely, rename the PID to CID, and the
> CID will be automatically attached to the client when it is created, but make sure to maintain
> the consistency of the system: if a client is deleted or removed or renamed or merged or
> something like this happens, there should be a proper structure to maintain the CID, and there
> should be a CID ledger that has all the data in complete detail.

## The model

| What people see | What stores it | Status |
|---|---|---|
| **Client group** | new `ClientGroup` table | new |
| **Client** | the existing `Project` row | relabelled; unchanged underneath |
| **Task group** | the existing `TaskList` row, enriched | already existed as bare "task groups" inside a project |
| **Task** | `Task` + `ProjectTask.taskListId` | unchanged |
| **Assignment** | `TaskAssignee` seats (role, hours, start, deadline) | unchanged — this is what Team Capacity reads |

### Why the project row becomes the client, rather than a new table

The owner said it in so many words: *what we now call projects will be considered clients*. Every
piece of machinery that makes a project work — its team, its access wall, its CID, its files,
discussion, activity, timesheets, capacity tab, completion and deletion — is what a client
workspace needs. Moving all of that onto a different table would rewrite the most tested part of
the system for no gain the owner can see. Relabelling the row keeps every existing guarantee.

### Why task groups are the existing task lists

Projects already had "task groups" (`TaskList`) with a name, a default group and a
"New task group" button. They carried nothing else. They now carry what the owner's words imply a
group of tasks needs: a **type of work** (whose standard tasks are created with it), a
**technology domain**, **start and deadline**, a **status**, and a description.

### The CID

**Every client carries a CID (Client ID), issued automatically when it is created.** It was called the
PID until phase 8; the number format is unchanged (`SQ_26_27_001`), and so is everything keyed on it —
timesheets, the ledger, billing. See "The CID (phase 8)" below for how it is issued and kept.

A CID could hold several projects ("rounds"). In a client-centred world, another piece of work for the
same client is **another task group**, not another client under the same number — so "New project under
this PID" was taken out of the client screen and "New task group" took its place. Existing rounds
still display, and the rounds API (`POST /projects/:id/rounds`) still works and is ledgered.

### Creating a client (what "creating a new project" becomes)

| Field | Before | Now |
|---|---|---|
| Title | Project title | **Client name** |
| Client group | — | pick one, or create one inline |
| Project type (required) | on the project | moved to the **first task group** (optional) |
| Technology domain | on the project | moved to the **first task group** |
| Client picker (client code) | shown | **commented out** |
| Patent IDs | shown | **commented out** |
| PID: generate / request from | shown | **gone** — the CID is issued automatically (phase 8) |
| Manager | shown | "client manager", optional for everyone — blank means the creator |
| Priority, start, deadline, client deadline | on the project | deadlines move to task groups |
| First task group | — | optional: name, type, domain, start, deadline |

### Creating a task group

Name, type of work (its standard tasks are created inside the group), technology domain, start,
deadline, description — and, for anyone who may assign work, **who does it and how many hours per
task**, which creates real staffing seats so the work appears on Team Capacity the moment the
group exists.

### Rules a task group keeps

- A group can be marked **complete only when every task in it is closed**. A task reopened inside a
  completed group re-opens the group; a task cannot be added to or moved into a completed group.
- Deleting a group never deletes work: its tasks move to the client's default group.
- The default group cannot be deleted (it is where tasks created from the board or capacity land).
- A task can be moved between groups of the same client.

## Commented out, not deleted

Everything below is disabled at its entry point. The code stays, compiled and type-checked, so it
can be restored by uncommenting the marked lines. Every site carries the marker
`CLIENTS-FLOW: commented out`.

- **Patent portal** — `/patents` page and sidebar item; the patents API module (which also carries
  the client-ledger routes).
- **Patent IDs** — patent picker in creation, patent chips and "show numbers" in the header,
  `/patent-lookup` page and sidebar item, patent columns in reports and the CID ledger,
  `PUT /projects/:id/patents`.
- **Client code** (called "client ID" at the time — the patent portal's code such as `MLK`, **not**
  the CID of phase 8) — the client-code picker in creation, the client line in the header,
  `/client-ledger` page and sidebar item, `PUT /projects/:id/client`, client columns in reports,
  the CID ledger and the digest, and the client-code parts of the BD pipeline's "won" dialog.

## The CID (phase 8) — replaces the PID request flow of phase 6

Phase 6 made PID requests a pool with reminders, nudges and change requests. Phase 8 removes the need
for any of it: **a client is given its CID in the same database transaction that creates it**, so
there is nothing to request, attach, generate, wait for or chase. Everything a person reads says CID;
the database keeps its historical names (`project.code`, table `pid_reservation`) with schema comments
saying so, and the permission code stays `project.generate_pid` (labelled "Change CID"), so no grant
moved and **no regrant is needed**.

### Removed

- The request pool: the `pid_request` table (dropped by migration), `/projects/pid-requests*`,
  `/projects/:id/pid-request(/nudge)`, `/projects/:id/pid-change-request`, `/projects/pid-authorities`,
  the hourly PID-request monitor and its notifications, the queue dialog, the home card, the badge and
  every `?pidRequests=1` / `?changePid=1` link.
- Manual numbers: `/projects/generate-pid`, `/projects/pid-reservation`, `/projects/next-pid`,
  `/projects/:id/attach-pid`, the 5-minute RESERVED hold and its expiry sweep, and `pid` /
  `pidAssigneeId` on create (now refused by validation, not silently ignored).
- The timesheet "Assign PID later" switch — it existed only because a client could be created without
  a number. The separate assign-later buffer, for entries logged without a task, stays ("Assign to client").
- `GET /projects/pid-ledger` → `GET /projects/cid-ledger`; `/projects/:id/pid/{reassign,split,merge}` and
  `/projects/:id/pid-move(/targets)` → the same under `cid`.

### How a CID is issued

`CidService.mintInTx` (`apps/api/src/common/cid/`), inside the create transaction:

1. `pg_advisory_xact_lock(hashtext('cid:<org>:<fy>'))` — held until the create commits, so concurrent
   creates queue for a moment and never read the same "highest serial".
2. Next serial = one past the highest this organisation has EVER used in the financial year: the
   registry (every status — a purged or merged number is still a row), any client code with the
   prefix, and a legacy sequence-counter row if one exists.
3. Register it (ATTACHED), insert the client row carrying it, write the ledger's MINTED event. The
   UNIQUE (organizationId, pid) index is the backstop, not the mechanism.

Format `<PREFIX>_<FY>_<serial3+>`, FY the Indian financial year read in IST. The prefix is the
organisation code **sanitised** — letters and digits, upper-cased, at most 16 characters, `SQ` if
nothing is left — so the seed's `pdash-demo` gives `PDASHDEMO_26_27_001`, a number the parser accepts
(before, it minted numbers that could never be typed back in). The SQL backfill applies the same rule.

A CHECK constraint (`project_live_client_has_cid`) makes a live client without a CID impossible, and
ten parallel creates come out as ten consecutive numbers with no errors (tested).

### The registry (`pid_reservation`) — what each number is

| Status | Meaning | Can it come back? |
|---|---|---|
| ATTACHED | at least one live client carries it | — |
| DELETED | only soft-deleted clients carry it; the number stays reserved to them | yes, by restoring the client |
| PURGED | every client that carried it was permanently deleted | never |
| MERGED | its client moved under another CID; `mergedIntoCid` names the survivor | never |
| DISCONTINUED | vacated by a reassign/split, or retired before the ledger | never |

Registry rows are never deleted by the application (only by the workspace-reset scripts, together with
the clients). CHECKs hold the status list and that a MERGED row always names its target.
`CidService.syncRegistryInTx` re-reads the clients carrying a number after every change and sets its
status and pointer; a retired number is never un-retired.

### The ledger (`cid_event`) — stored and append-only

One row per change, written **in the same transaction as the change**, with snapshots (client title,
actor name) and a `projectId` with no foreign key, so a purged client stays visible. A trigger refuses
UPDATE. Events:

| Event | When |
|---|---|
| MINTED | a client is created (or restored with a new CID — then `fromCid` names the retired one) |
| BACKFILLED / IMPORTED | the migration gave an existing client a CID / recorded a number that already existed |
| ROUND_ADDED | a client was started under an existing CID |
| RENAMED | title, from → to |
| CLIENT_GROUP_CHANGED | filed under another group, taken out of one, or un-filed because its group was archived |
| MANAGER_CHANGED | who manages it, from → to (staffing someone as MANAGER, or re-roling the manager) |
| PHASE_CHANGED | Active ↔ On hold, by edit or by the approval flow |
| COMPLETED / REOPENED / REINITIALIZED | the lifecycle actions |
| DELETED | soft delete, recording the phase it held |
| RESTORED | restored from Admin → Data |
| REASSIGNED / SPLIT / MERGED | Change CID, with `fromCid` / `toCid` (it appears on both numbers' timelines) |
| PURGED | permanent delete — the tombstone keeps title, hours logged and allotted, task groups, managers, group |

### What happens to the number when…

- **Renamed, re-grouped, re-managed, paused, completed, reopened, re-initialized** — the CID does not
  change; the ledger records the change.
- **Deleted (soft)** — the CID stays reserved to the client (registry DELETED once no live client
  carries it); the ledger shows it as Deleted, under its last name.
- **Restored** — back under the same CID, **in the phase it held before the delete** (read from the
  DELETED event; before, a restore always came back Active). If the number was retired while the client
  sat in the bin (merged away, reassigned off), it is never revived: the client is issued the next CID
  and the ledger says which it had.
- **Permanently deleted** — the number is PURGED and taken forever; the ledger keeps the client.
- **Merged** (Change CID → under another client's CID) — the client becomes the next round of the
  target; its old number, once no live client carries it, is MERGED with a pointer to the survivor.
- **Split / Reassigned** — the client is issued the NEXT CID; a named destination must hold live work
  (a retired, merged, purged or bin-only number is never taken over). A vacated number is DISCONTINUED.
  Change CID stays Admin / Super Admin plus the org passcode.

### The CID Ledger — `/cid-ledger` (sidebar "CID Ledger"; `/pid-ledger` redirects)

`GET /projects/cid-ledger`, gated on `user.manage_access` as the PID ledger was (Admin, Super Admin,
HR). One row per CID ever issued: the CID, its status (Active / On hold / Completed / Deleted / Merged →
target / Retired / Purged), the current client name (or the last one recorded), past names, client
group, manager, created by / at, every client that has carried it (live, deleted and purged), logged vs
allotted hours, task-group count, and an expandable timeline of every event (who, when, what changed
from → to). Filters by status; search by CID, client name or any past name; two CSV exports — one row
per CID, and one row per event. The confidential client fact (`client` / `clientId`, patents) is still
stripped by the same redaction pass every other route uses; HR reads the rest of the row.

## Deadlines (phase 7)

| Where | Internal deadline | Client deadline | Why |
|---|---|---|---|
| Client | — | — | A client is a relationship, not a delivery. Existing clients keep what they had, read-only in spirit. |
| **Task group** | **yes** — the team's target | **yes** — the date promised to the client | The group is the piece of work that is delivered. The promise and the buffer before it belong here. |
| Task | yes — its milestone inside the group | no (removed in PR #17, stays removed) | Steps toward the group's date. |
| One person on a task | yes — the existing "extend for one person" | no | A private extension; it may run past the task's date by design. |

Rules the server keeps:

- A group's internal deadline is never after its client deadline, and never before its start.
- A task in a group with a deadline is never due after it — create and edit are refused in words
  ("move the group's deadline first"); a task created with no date takes the group's.
- Moving a group's deadline later carries the tasks that were due on the old date with it; moving
  it earlier pulls any task due after the new date in to it. Each task move is recorded in the
  deadline ledger, and so is the group's own move (as the client-facing commitment it now is).
- The client deadline is visible and settable only by people who hold the client-deadline
  permission or manage that client — the rule it always had.
- On the capacity board, "extend" offers: only this person, the whole task, or the whole task group.
  "Whole task" will not go past the group's deadline — the menu says so and points at "Task group"
  instead of letting the save be refused. "Client" is gone: a client has no deadline to push.

What the screens do with it:

- **New client** and **New / Edit task group** ask for the start, the team's deadline and — for
  whoever may set it — the client deadline (amber, with a lock). The team's deadline cannot be picked
  past the client's.
- Editing a group's deadline says, before saving, that tasks due on it will move; after saving, how
  many did.
- **Add task** starts on the group's deadline and will not accept a later one.
- **Edit client** no longer offers dates for a client that has none; a client that already had
  them (made before this change) keeps them editable so they can be cleared.
- Within a group, tasks of equal priority and date keep the group's own order, so a type's standard
  tasks read Proposal → … → QC rather than alphabetically.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Schema + API: client groups, enriched task groups, templates per group, assignment at creation, move task, completion rules, capacity/My Tasks carry the group | ✅ |
| 2 | Comment out patents and client IDs (web + API routes) | ✅ |
| 3 | UI: Clients page grouped by client group, New client dialog, client screen, Task Groups tab, New/Edit task group, assign, move | ✅ |
| 4 | Everywhere else: capacity, My Tasks, timesheets, PID (now CID) ledger, home, search, notifications, sidebar wording | ✅ |
| 5 | Demo data, preview on its own tunnel, end-to-end tests, browser walkthrough, adversarial review, fix loop | ✅ |
| 6 | PID flow: pool queue, a request for every PID-less client, reminders, nudges, change requests, one-number rules (superseded by phase 8) | ✅ |
| 7 | Deadlines: client deadline on task groups, task-within-group rule, cascading group deadline moves, capacity extend by group | ✅ |
| 8 | PID → CID: request pool and manual generation removed, CID issued on create, registry states, stored append-only CID ledger, CID Ledger screen | ✅ |

Tests: `tools/clients-flow.e2e.mjs`, `tools/clients-cid-deadlines.e2e.mjs` (was
clients-pid-deadlines; needs `PASSCODE`), `tools/cid-ledger.e2e.mjs` (the whole CID lifecycle: auto
CID, 10 parallel creates, rename/group/manager/phase/complete/reopen/re-initialize, delete/restore,
purge, merge/split/reassign, restore after the number was retired, HR access and redaction, CSV
fields, organisation-wide invariants; needs `PASSCODE`), `tools/cid-format.spec.ts` (prefix rule and
parser), `tools/cid-move.spec.ts` (was pid-move), and a group-order case in `tools/task-order.spec.ts`.
`tools/pid-reminder.spec.ts` went with the reminders. Run the e2e suites against a scratch copy of the
database, never the one being demonstrated — they create, merge and permanently delete clients.

## What was reviewed, and what was not

Two adversarial reviews (API, screens) read the whole diff against this document and probed a
scratch copy of the database. Twelve findings, all fixed, the two that mattered being: the date
promised to the client leaked through `GET /projects/:id` (it is stripped from a client's task
groups now), and pulling a group's deadline in left tasks starting after they were due, which the
task editor then refused — freezing work nobody had touched.

Found sound, and not worth re-auditing: client-group tenant scoping (the organisation always comes
from the actor, never the request body); every task-group route's redaction; the permission matrix
across the new routes (HR, Employee, SRA and Manager each refused what they should be); concurrent
fulfilment of one PID request; attach closing the request; a stale request never overwriting a PID;
deleting a client cancelling it; the switched-off patent pages being redirects with their original
components kept. (Phase 8 removed the request pool those findings were about.)

Thin cover, stated plainly:

- The CID backfill runs inside the migration. It was run against a fresh copy of the preview data
  (6 clients with numbers, 6 without) and against an empty database — not against production data.
- The deadlock that lock ordering fixed is timing, not logic: it was demonstrated at the database
  level, not reproduced through the API on demand.
- A client's organisation is still derived (creator → earliest member → the one organisation), as
  `Project` has no organisation column; the CID backfill and the ledger both depend on that rule.

## Deploying later (when the owner asks)

Five migrations; all additive except one index swap and phase 8 dropping `pid_request`:

- `20261017090000_clients_flow` — the `client_group` table, `project.clientGroupId`, and the task
  group columns on `task_list`.
- `20261018090000_pid_flow_and_group_deadlines` — replaces the one-request-per-client UNIQUE index
  with "at most one OPEN request per client", makes the named authority optional, adds the request's
  kind / reason / reminders, and `task_list.clientDueDate`.
- `20261018100000_deadline_change_task_group` — lets the deadline ledger record task-group moves.
- `20261018110000_pid_request_backfill` — data only: opens a PID request for live, unfinished clients
  that have none (superseded: the next migration drops the table).
- `20261020120000_cid_auto_mint_and_ledger` — phase 8: drops `pid_request`; the registry loses the
  RESERVED hold (old RESERVED/RELEASED/EXPIRED rows become DISCONTINUED — shown, never re-issued), gains
  `mergedIntoCid` and status CHECKs, and has every status re-read from the clients carrying it; creates
  the append-only `cid_event` table; records every existing number as IMPORTED; gives every live
  client without a CID the next one (createdAt, then id; the FY it was created in) as BACKFILLED; then
  adds the CHECK that a live client always has a CID. No manual step; a no-op on the data of a
  database with no code-less clients.

No new permission codes, so **no regrant**. Existing projects appear as clients in the "Ungrouped" section until someone files them
into groups.
