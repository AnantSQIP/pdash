# PROJECTS-flow suites

These are production's own end-to-end suites exactly as they stood at `bb5728b`, before the clients
flow existed. Run them against an API whose organisation is in the **PROJECTS** workspace flow; they
must pass unchanged. That is the proof the PROJECTS flow still behaves as it did (see
`docs/WORKSPACE_FLOWS.md`). The suites in `tools/` itself are the CLIENTS suites.

    BASE=http://127.0.0.1:<port> PASSCODE=<org passcode> node tools/projects-flow/time-mode.e2e.mjs

Edit them only where the database fixture forces it (a person's role changed in the roster), never
to accommodate a behaviour change: a PROJECTS behaviour change is a bug.

One suite here is NOT production's: `pid-flow.e2e.mjs`, written with the workspace flows. It walks
the PROJECTS flow's PID end to end (generate with its 5-minute hold, request and fulfil, a second
round, the patent portal, production's task lists and restore/purge) and checks that none of the
CLIENTS flow's routes or fields exist in a PROJECTS organisation.
