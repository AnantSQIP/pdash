# PROJECTS-flow suites

These are production's own end-to-end suites exactly as they stood at `bb5728b`, before the clients
flow existed. Run them against an API whose organisation is in the **PROJECTS** workspace flow; they
must pass unchanged. That is the proof the PROJECTS flow still behaves as it did (see
`docs/WORKSPACE_FLOWS.md`). The suites in `tools/` itself are the CLIENTS suites.

    BASE=http://127.0.0.1:<port> PASSCODE=<org passcode> node tools/projects-flow/time-mode.e2e.mjs

Edit them only where the database fixture forces it (a person's role changed in the roster), never
to accommodate a behaviour change: a PROJECTS behaviour change is a bug.

Two suites here are NOT production's, both written with the workspace flows:

- `pid-flow.e2e.mjs` walks the PROJECTS flow's PID end to end (generate with its 5-minute hold,
  request and fulfil, a second round, the patent portal, production's task lists and restore/purge)
  and checks that none of the CLIENTS flow's routes or fields exist in a PROJECTS organisation —
  including `GET /task-groups`, the cross-client task-group browser.
- `availability.e2e.mjs` is the PROJECTS copy of `tools/availability.e2e.mjs`. Availability is not
  one of the things the two flows do differently, so it has to be proved in both; this copy builds
  its fixture entirely out of production's own routes (create a project with a PID, a task in its
  default list, seats through `PUT /tasks/:id/staffing`) and never touches `/capacity/tasks`,
  which exists only in the CLIENTS flow.

A suite here may be edited where the DATABASE FIXTURE forces it and never to accommodate a
behaviour change. Several of them now pick their actors by `/me/effective-permissions` rather than
by name: the roster moved under them (ajay.sharma, the "ordinary employee" three of them were
written against, is a Senior Consultant now with oversight of every matter), and a refusal asserted
against somebody who was entitled all along is a check of nothing.
