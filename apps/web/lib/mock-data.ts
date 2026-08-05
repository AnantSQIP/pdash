// Mock data used for UI preview (real data comes via Prisma server components once seeded)

export type Phase = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED' | 'ARCHIVED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MockProject {
  id: string;
  code?: string | null; // the PID, e.g. SQ_26_27_001
  title: string;
  description: string;
  projectType?: string | null; // e.g. HML, Novelty, FTO — shown as a tag on the card
  /** Which project this is under its PID (1 for the first). A PID may hold several. */
  roundSeq?: number;
  /** The delivery client — code is shareable, name is Super-Admin only (null otherwise). */
  clientCode?: string | null;
  clientName?: string | null;
  projectPhase: Phase;
  priority: Priority;
  completionPercentage: number;
  taskCount: number;
  memberCount: number;
  dueDate: string;
  members: { initials: string; color: string }[];
  statusColor: string;
  createdAt: string;
}

// (Removed the fabricated MOCK_PROJECTS demo array — L26; the MockProject type above is still used by real API mappers.)

export const PHASE_META: Record<Phase, { label: string; bg: string; text: string }> = {
  PLANNING:  { label: 'Planning',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
  ACTIVE:    { label: 'Active',    bg: 'bg-brand-100',  text: 'text-brand-700' },
  ON_HOLD:   { label: 'On Hold',   bg: 'bg-amber-100',  text: 'text-amber-700'  },
  COMPLETED: { label: 'Completed', bg: 'bg-green-100',  text: 'text-green-700' },
  CLOSED:    { label: 'Closed',    bg: 'bg-slate-200',  text: 'text-slate-600' },
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
 * How a project is identified once a PID can hold more than one.
 *
 * A returning client's second engagement shares the first's Project ID, so "SQ_26_27_001" alone
 * is ambiguous the moment there are two. Anywhere a project is listed next to others — reports,
 * the digest, timesheet pickers, the capacity board — append the round so they can be told apart.
 * Round 1 of a single-project PID adds nothing, keeping Gurgaon's display exactly as it was.
 */
export function pidLabel(code?: string | null, roundSeq?: number | null): string {
  const pid = code ?? 'PID pending';
  return roundSeq && roundSeq > 1 ? `${pid} · P${roundSeq}` : pid;
}
