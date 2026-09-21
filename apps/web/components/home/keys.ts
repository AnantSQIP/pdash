// Single source of truth for the Home dashboard's React Query keys.
//
// These MUST agree between the card that reads a key and the mutation that invalidates
// it — a one-character drift (`att-org` vs `attn-org`) silently left the Team Attendance
// card stale after every punch. Building both sides from the same helpers prevents that.

export const homeKeys = {
  attnToday: (userId?: string) => ['attn-today', userId] as const,
  attnMonth: (userId?: string) => ['attn-month', userId] as const,
  attnOrg: (orgId?: string, day?: string) => ['attn-org', orgId, day] as const,
  leaveBalances: (userId?: string) => ['leave-balances', userId] as const,
  leavePending: (orgId?: string) => ['leave-pending', orgId] as const,
  analyticsDashboard: (orgId?: string) => ['analytics-dashboard', orgId] as const,
  projects: (orgId?: string) => ['projects', orgId] as const,
  perfMe: (userId?: string) => ['perf-me', userId] as const,
  perfOrg: (orgId?: string) => ['perf-org', orgId] as const,
  users: (orgId?: string) => ['users', orgId] as const,
  roles: (orgId?: string) => ['roles', orgId] as const,
  holidays: (orgId?: string, year?: number) => ['holidays', orgId, year] as const,
  capacity: (orgId?: string, days?: number) => ['capacity', orgId, days] as const,
  tasksMe: (userId?: string) => ['tasks-me', userId] as const,
  // Must match the Expenses page's own key, or approving there leaves this card stale.
  expensesMine: () => ['expenses-mine'] as const,
  pidRequests: (orgId?: string) => ['pid-requests', orgId] as const,
};

/** Prefix keys a punch invalidates — a punch changes today's row, the month, and the org rollup. */
export const PUNCH_INVALIDATES = ['attn-today', 'attn-month', 'attn-org', 'leave-balances'] as const;
