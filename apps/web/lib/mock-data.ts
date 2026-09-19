// Mock data used for UI preview (real data comes via Prisma server components once seeded)

// No PLANNING: a project here starts when the work starts.
export type Phase = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MockProject {
  id: string;
  code?: string | null; // the CID, e.g. SQ_26_27_001
  title: string;
  description: string;
  projectType?: string | null; // e.g. HML, Novelty, FTO — shown as a tag on the card
  // The FIELD the work is in (Medical, Automobile …) — a second tag beside the type.
  technologyDomain?: string | null;
  /** Which project this is under its CID (1 for the first). A CID may hold several. */
  roundSeq?: number;
  projectPhase: Phase;
  priority: Priority;
  completionPercentage: number;
  taskCount: number;
  memberCount: number;
  dueDate: string;
  members: { initials: string; color: string }[];
  statusColor: string;
  createdAt: string;
  // ── CLIENTS-FLOW: a project row is a client ────────────────────────────────────────
  clientGroupId?: string | null;
  clientGroupName?: string | null;
  /** Live task groups — every one, and the ones still active. */
  taskGroupCount?: number;
  activeTaskGroups?: { id: string; name: string; groupType?: string | null; dueDate?: string | null }[];
  /** Every open group, including a default "General" the card's preview leaves out. */
  activeTaskGroupCount?: number;
  /** Task-group domains, so a domain filter can find a client by the work inside it. */
  taskGroupDomains?: string[];
  openTaskCount?: number;
  overdueTaskCount?: number;
  /** The soonest deadline among the client's active task groups. */
  nextDeadline?: string | null;
}

// (Removed the fabricated MOCK_PROJECTS demo array — L26; the MockProject type above is still used by real API mappers.)

export const PHASE_META: Record<Phase, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Active',    bg: 'bg-brand-100',  text: 'text-brand-700' },
  ON_HOLD:   { label: 'On Hold',   bg: 'bg-amber-100',  text: 'text-amber-700'  },
  COMPLETED: { label: 'Completed', bg: 'bg-green-100',  text: 'text-green-700' },
  ARCHIVED:  { label: 'Archived',  bg: 'bg-gray-100',   text: 'text-gray-500' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-100',    text: 'text-red-600' },
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  LOW:      { label: 'Low',      color: 'text-gray-400' },
  MEDIUM:   { label: 'Medium',   color: 'text-amber-600'  },
  HIGH:     { label: 'High',     color: 'text-brand-500'  },
  CRITICAL: { label: 'Critical', color: 'text-red-500' },
};

/**
 * Display labels for project types. Mirrors PROJECT_TYPES in the API's project-templates.ts —
 * the server is the source of truth for which types EXIST (and what tasks they create); this is
 * only how the short code is written on a card, where fetching the full list per card would be
 * wasteful. Anything not listed falls back to a prettified form of the code itself.
 */
export const PROJECT_TYPE_LABEL: Record<string, string> = {
  INFRINGEMENT: 'Infringement Search',
  NOVELTY: 'Novelty Search',
  INVALIDITY: 'Invalidity Search',
  FTO: 'FTO Search',
  LANDSCAPE: 'Landscape Search',
  MONETIZATION: 'Patent Monetization',
  REVERSE_ENGINEERING: 'Reverse Engineering',
  RISK_STRATEGY: 'Risk & Strategy',
  GENERAL: 'General / Other',
};
export function projectTypeLabel(value?: string | null): string {
  if (!value) return '';
  const bare = value.replace(/^CUSTOM_/, '');
  return PROJECT_TYPE_LABEL[bare]
    ?? bare.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * A client's CID for display, with its round when it is not the first — e.g. SQ_26_27_004 · P2.
 * Two clients under one CID share the code, so every place that lists them — the digest, timesheet
 * pickers, the capacity board — appends the round so they can be told apart.
 *
 * Every live client is given its CID when it is created, so a missing one is not a state anybody
 * should see; it renders as a plain dash rather than the old "PID pending".
 */
/**
 * PROJECTS flow: a project's PID as shown everywhere — "PID pending" while it has none (a project is
 * created first and its PID generated or requested afterwards), and the round when there is more
 * than one under the same PID.
 */
export function pidLabel(code?: string | null, roundSeq?: number | null): string {
  const pid = code ?? 'PID pending';
  return roundSeq && roundSeq > 1 ? `${pid} · P${roundSeq}` : pid;
}

/**
 * The label for a project's / client's number in the flow the firm runs: the PID (PROJECTS) or the
 * CID (CLIENTS). For code shared by both flows; flow-specific screens call pidLabel / cidLabel.
 */
export function numberLabel(flow: 'PROJECTS' | 'CLIENTS', code?: string | null, roundSeq?: number | null): string {
  return flow === 'CLIENTS' ? cidLabel(code, roundSeq) : pidLabel(code, roundSeq);
}

/** "PID" or "CID" — what the firm calls the number, in the flow it runs. */
export function numberName(flow: 'PROJECTS' | 'CLIENTS'): 'PID' | 'CID' {
  return flow === 'CLIENTS' ? 'CID' : 'PID';
}

export function cidLabel(code?: string | null, roundSeq?: number | null): string {
  const cid = code || '—';
  return code && roundSeq && roundSeq > 1 ? `${cid} · P${roundSeq}` : cid;
}
