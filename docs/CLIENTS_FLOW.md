# The clients flow

Branch `clients-flow`, cut from `fix-data-destruction` (bb5728b) so it carries those five fixes.
**Not merged into `main`, and not to be, until the owner says so in person.**

## What the owner asked for

> There will be groups of clients. What we now call projects will be considered clients. Inside a
> client we create groups of tasks and assign those tasks to the team, and that shows in Team
> Capacity. Change the UI, the logic and the PID to suit. Comment out — only comment out — the
> patent portal, the patent ID and the client ID. Work out how creating a new project changes.

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
piece of machinery that makes a project work — its team, its access wall, its PID, its files,
discussion, activity, timesheets, capacity tab, completion and deletion — is what a client
workspace needs. Moving all of that onto a different table would rewrite the most tested part of
the system for no gain the owner can see. Relabelling the row keeps every existing guarantee.

### Why task groups are the existing task lists

Projects already had "task groups" (`TaskList`) with a name, a default group and a
"New task group" button. They carried nothing else. They now carry what the owner's words imply a
group of tasks needs: a **type of work** (whose standard tasks are created with it), a
**technology domain**, **start and deadline**, a **status**, and a description.

### The PID

**The PID stays on the client.** It is minted and requested exactly as before; the PID ledger,
timesheets-by-PID, PID correction and every PID invariant are untouched.

What changes is the thing that sat *under* a PID. A PID could hold several projects ("rounds").
In a client-centred world, another piece of work for the same client is **another task group**,
not another project under the same number — so "New project under this PID" is taken out of the
client screen and "New task group" takes its place. Existing rounds still display.

The alternative — a PID per task group — was considered and rejected for now: it would move the
number off the row that timesheets, the ledger, billing and the PID-invariant tests all key on,
for a change the owner did not ask for. It remains possible later.

### Creating a client (what "creating a new project" becomes)

| Field | Before | Now |
|---|---|---|
| Title | Project title | **Client name** |
| Client group | — | pick one, or create one inline |
| Project type (required) | on the project | moved to the **first task group** (optional) |
| Technology domain | on the project | moved to the **first task group** |
| Client picker (client code) | shown | **commented out** |
| Patent IDs | shown | **commented out** |
| PID: generate / request from | shown | unchanged |
| Manager | shown | unchanged ("client manager") |
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
  `/patent-lookup` page and sidebar item, patent columns in reports and the PID ledger,
  `PUT /projects/:id/patents`.
- **Client ID** — the client-code picker in creation, the client line in the header,
  `/client-ledger` page and sidebar item, `PUT /projects/:id/client`, client columns in reports,
  the PID ledger and the digest, and the client-code parts of the BD pipeline's "won" dialog.

## The PID flow, reworked (phase 6)

The owner's questions, and what the code actually did:

| Question | What happened before | Why it was a flaw |
|---|---|---|
| What if the Super Admins are busy? | A request went to ONE named authority. Only that person could see, edit or fulfil it. | One busy or absent person stalled a client indefinitely, and nobody else could even see it. |
| What if we don't assign the PID? | An authority could create a client with no PID and nothing tracked it. No request, no reminder. | PID-less clients were silently forgotten until invoicing. |
| What if we want to change the PID? | Only an authority, with the passcode, through a dialog built around "rounds". Nobody else could even ask. | The people who notice a wrong PID (the team on the client) had no way to say so. |
| (found while reading) | Attaching a PID from the client page left its request open; fulfilling it later **overwrote** the PID. Deleting a client left its request in the queue. | A client could get two PIDs, and a deleted client could burn a serial. |

The flow now:

1. **Every PID-less client has an open request.** Whoever creates it — authority or not — the
   client appears in the PID queue until it has a number.
2. **The queue is a pool.** Every PID authority sees every open request in the organisation and
   any of them can fulfil it. The requester may name who to ask first (optional); that person is
   told straight away, and if nobody is named, all authorities are.
3. **Nothing waits silently.** Requests show how long they have waited. Once a day, anything open
   longer than a day reminds every authority again. The client's team can nudge (at most hourly).
4. **Work never waits for the PID.** Tasks, staffing, capacity and time all work on a PID-pending
   client; the PID is how the work is filed, not permission to do it.
5. **Changing a PID can be asked for.** A client's manager can request a change with a reason
   (and the number they believe is right). It lands in the same pool; an authority makes the change
   with the existing, audited Change PID dialog, which closes the request, or declines it with a
   reason the requester is told.
6. **One number, one request.** Attaching a PID by any route closes the open request; a request for
   a client that already has a PID closes instead of overwriting it; deleting a client cancels it.
   At most one request per client is open at a time (a partial unique index).

Considered and **not** done without the owner: letting Managers mint PIDs when authorities are
slow, or minting automatically after a timeout. Both would widen who can create a billing number,
which the permission matrix of 12 Aug deliberately narrowed.

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

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Schema + API: client groups, enriched task groups, templates per group, assignment at creation, move task, completion rules, capacity/My Tasks carry the group | ✅ |
| 2 | Comment out patents and client IDs (web + API routes) | ✅ |
| 3 | UI: Clients page grouped by client group, New client dialog, client screen, Task Groups tab, New/Edit task group, assign, move | ✅ |
| 4 | Everywhere else: capacity, My Tasks, timesheets, PID ledger, home, search, notifications, sidebar wording | ✅ |
| 5 | Demo data, preview on its own tunnel, end-to-end tests, browser walkthrough, adversarial review, fix loop | ☐ |
| 6 | PID flow: pool queue, a request for every PID-less client, reminders, nudges, change requests, one-number rules | ☐ |
| 7 | Deadlines: client deadline on task groups, task-within-group rule, cascading group deadline moves, capacity extend by group | ☐ |

## Deploying later (when the owner asks)

Additive migrations (`20261017090000_clients_flow`, plus the PID-flow and deadline ones listed below). No new permission codes, so **no
regrant**. Existing projects appear as clients in the "Ungrouped" section until someone files them
into groups.
