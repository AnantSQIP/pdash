# pdash — Deep QA test sweep (2026-07)

Multi-agent QA to find every bug / missing feature / production-breaker / AWS-deploy risk before
the AWS rollout. Agents act as real Indian users of specific roles (personas), tracing the actual
code paths each persona exercises across the modules — this is **code-level flow tracing** (the
reliable method here: the local instance is wiped/old-build and Contabo is live team data, so we
don't click a live UI). A live Playwright pass can follow if a dedicated seeded test instance is
stood up.

**Priority order (per request):** Projects → Patents → Performance FIRST, then the whole system,
then cross-cutting (event/audit logs, security, prod/AWS readiness).

## Personas (mapped to the real roster)
| # | Persona | Role / perms | Focus |
|---|---|---|---|
| P1 | Mohit Kalra (VP) | **Super Admin** | Patents portal, RBAC, everything |
| P2 | Nitin Goel | **Manager** | Projects, PID generate, capacity, team |
| P3 | Neha Shukla | **Senior Consultant** | Projects/PID, delivery oversight |
| P4 | Ketan Dagar / Amritpal Kaur | **Senior Research Associate** | PID generate, task delegation, research |
| P5 | Meetu Singh / Vijay Mishra | **Consultant** | Projects (request PID), tasks, time |
| P6 | Anant Gupta | **Employee (intern)** | Request PID, log time, limited access |
| P7 | Shaveta Sharma | **HR** | People-ops, attendance, leave, appraisals (NO projects) |
| P8 | (any) Research Associate | **Employee** | Day-to-day analyst work |

## Batches / phases
Legend: ☐ pending · ▶ running · ✔ done

- **Phase 0 — Foundations**
  - ✔ Squark IP domain research → `docs/squark-ip-domain-brief.md` (6 domains, competitors, per-persona scenarios)
  - ✔ Working hours → 9am–6pm IST (8h/day): `DAILY_CAPACITY_HOURS`, perf `DAILY_HOURS` (commit 5aea39f)
- **Phase 1 — Core modules (priority)**
  - ☐ Batch 1 — Projects (PID generate/request/fulfill, create, lifecycle, members, tasks, deadlines, authz/IDOR) — P2/P4 authority + P5/P6 requester
  - ☐ Batch 2 — Patents (portal, client codes, register, upload-to-create, reveal, passcode, docs, confidentiality) — P1 + non-super-admin
  - ☐ Batch 3 — Performance (metric correctness, per-user vs org-wide, formulas, authz, empty-data, working-hours impact)
- **Phase 2 — Full system**
  - ☐ Batch 4 — Attendance + Leave + Comp-off + WFH + Timesheets(new PID/buffer) + Capacity(offices/pending leaves)
  - ☐ Batch 5 — Discuss + Calendar + Channels + Notifications + HR (announcements/policies/appraisals/org chart)
  - ☐ Batch 6 — Users/RBAC + Profile-gate + Home/Dashboard + Expenses + Rewards
- **Phase 3 — Cross-cutting**
  - ☐ Batch 7 — Event logs + Audit logs coverage + security sweep (authz/IDOR/cross-org/leaks)
  - ☐ Batch 8 — Production + AWS-deploy readiness (env/secrets, migrations, file storage/S3, health, scaling, N+1, indexes, Docker, HTTPS, backups)
- **Phase 4 — Synthesis** — consolidate + dedupe + severity-rank → final report

## Progress log
_(append one line per batch as it completes, so this survives a session drop)_
- 2026-07-24: plan created; Phase 0 research launched; working hours changed.

---

# FINDINGS
Severity: **CRIT** (data loss/security/prod-down) · **HIGH** · **MED** · **LOW** · **NOTE** (missing feature / UX).
Each finding: `[SEV] module — summary (file:line) → why it breaks / scenario`.

_(populated per batch below)_
