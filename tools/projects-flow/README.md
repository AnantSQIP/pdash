# PROJECTS-flow suites

These are production's own end-to-end suites exactly as they stood at `bb5728b`, before the clients
flow existed. Run them against an API whose organisation is in the **PROJECTS** workspace flow; they
must pass unchanged. That is the proof the PROJECTS flow still behaves as it did (see
`docs/WORKSPACE_FLOWS.md`). The suites in `tools/` itself are the CLIENTS suites.

    BASE=http://127.0.0.1:<port> PASSCODE=<org passcode> node tools/projects-flow/time-mode.e2e.mjs

Edit them only where the database fixture forces it (a person's role changed in the roster), never
to accommodate a behaviour change: a PROJECTS behaviour change is a bug.
