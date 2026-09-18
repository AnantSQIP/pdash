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

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Schema + API: client groups, enriched task groups, templates per group, assignment at creation, move task, completion rules, capacity/My Tasks carry the group | ☐ |
| 2 | Comment out patents and client IDs (web + API routes) | ☐ |
| 3 | UI: Clients page grouped by client group, New client dialog, client screen, Task Groups tab, New/Edit task group, assign, move | ☐ |
| 4 | Everywhere else: capacity, My Tasks, timesheets, PID ledger, home, search, notifications, sidebar wording | ☐ |
| 5 | Demo data, preview on its own tunnel, end-to-end tests, browser walkthrough, adversarial review, fix loop | ☐ |

## Deploying later (when the owner asks)

One additive migration (`20261017090000_clients_flow`). No new permission codes, so **no
regrant**. Existing projects appear as clients in the "Ungrouped" section until someone files them
into groups.
