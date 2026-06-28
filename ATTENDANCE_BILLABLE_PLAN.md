# Attendance ↔ System Integration & Billable Restructuring — Plan

> Generated from a multi-agent research workflow (code maps + TeamNest/Zoho/Keka/greytHR research +
> adversarial verification). Branch: `squarkip-dashboard`. Another session edits this repo concurrently —
> schema changes are kept **additive** (nullable + defaults), no destructive migrations.

## Locked scope (decided with the user)
- **Billable:** FULL financial — `billRate`/`costRate`, billable amount, realization %, margin, billing
  lifecycle (UNBILLED→BILLED→INVOICED→WRITTEN_OFF) with approval + lock.
- **Absence policy:** AVAILABILITY-NORMALIZED (fair). Leave/holiday EXCLUDED from the utilization
  denominator; absence/late surface as their own KPIs; score scaled by an availability factor (no
  double-penalty).
- **Leave engine:** Half-day/hourly + accurate balances (opening + accrued − used + carried-forward).
- **First slice:** A0 toggle fix + B0 security/IDOR + C1 regularization + B1/B2 capacity/utilization.

## Verified findings (the "is it connected?" answer)
- Attendance/leave are **NOT** inputs to performance score, utilization, reports, home, or progress.
  `PerformanceService` never reads `attendance`/`leaveRequest`/`holiday`. Proof: an ABSENT user with
  logged hours is fully credited; a PRESENT user with no hours scores low.
- Capacity = `members × Mon–Fri days × 8h` with **no** leave/holiday subtraction → people on leave
  currently **drag utilization down** (inverted penalty).
- Billable persists end-to-end but: default-true everywhere (meaningless %), "Billable" gauge is
  efficiency (billable/logged) mislabeled as utilization, no rates/money, no lifecycle, not editable,
  org billable computed but never shown, `/analytics/*` endpoints unguarded.
- Billable toggle visually broken: `h-5.5` is not a valid Tailwind class (collapses to height 0).

## Workstreams
### A — Billable restructuring
- A0 (P0,S) Fix toggle render + accessibility (`role="switch"`).
- A1 (P0,M) Rate model: `billRate`/`costRate` on Timesheet (snapshot at create; precedence
  entry→project/member→user), `defaultBillRate`/`costRate` on User/Project.
- A2 (P1,M) Billing lifecycle: `billingStatus` enum + `approvedBy/At`; approve→billed→invoiced→write-off;
  lock edits once invoiced/locked; audit every change.
- A3 (P1,M) Money in analytics/perf: billable amount, realization %, cost/margin; split UI into
  Billable-Efficiency vs true Utilization; TimesheetsTab cards honor filter; add edit-billable UI.
- A4 (P1,S) Surface org billable: wire dead `/analytics/timesheets` into OrgView + Reports + CSV.

### B — Attendance ↔ system integration
- B0 (P0,S) Security: `@RequirePermission` on analytics endpoints; org-scope assertions.
- B1 (P0,S) Make attendance/leave/holiday readable from PerformanceService.
- B2 (P0,M) Leave/holiday-net capacity: `available = (businessDays − approvedLeave − holidays) × 8 × fte`.
- B3 (P1,M) True utilization + availability-normalized score + attendance KPIs (self + org).
- B4 (P1,M) Attendance/leave + billable on Home & Reports (personal + admin-gated org).
- B5 (P2,M) Write real `present` into snapshots (+ dead fields); optional daily cron.
- B6 (P2,M) Implement + wire `RollupModule` (task→project % rollup).

### C — Attendance advanced features
- C1 (P0,M) Regularization workflow (modal + reason codes + manager approval queue).
- C2 (P0,L) Half-day/hourly leave + real balances (accrual/carry-forward).
- C3 (P1,M) Team leave & attendance calendar (who's-out-when).
- C4 (P1,M) Live who's-in-today + attendance heatmap.
- C5 (P2,L) Attendance policy engine (shift/grace/late/deficit).
- C6 (P2,M) Period lock / payroll-style cutoff.
- C7 (P3) Comp-off/overtime credit; bulk CSV import/override.

### D — Adjacent bugs
Two divergent "completed" definitions; heatmap live-fallback caps; on-time keyed on `updatedAt`;
Reports shows org data + editable progress to every user.

## Key formulas (from research)
- Billable Utilization % = billableHrs / availableHrs.
- Available (capacity) hrs = scheduled − holidays − approved leave (× FTE).
- Billable Efficiency = billableHrs / loggedHrs (distinct from utilization).
- Realization % = invoiced / billable; Effective rate = billRate × utilization × realization × collection.
- Revenue = billableHrs × billRate; Cost = allHrs × costRate; Margin = revenue − cost.
- Target utilization is role-based (juniors 75–90%, managers 30–50%); healthy band 70–80%.

## Concurrency-risk files (coordinate / additive only)
`packages/db/prisma/schema.prisma`, `apps/web/lib/api.ts`, `performance.service.ts`,
`app.module.ts`, `permissions-catalog.ts`.
