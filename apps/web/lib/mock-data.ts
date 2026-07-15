// Mock data used for UI preview (real data comes via Prisma server components once seeded)

export type Phase = 'IDEA' | 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED' | 'ARCHIVED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MockProject {
  id: string;
  title: string;
  description: string;
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
  IDEA:      { label: 'Idea',      bg: 'bg-gray-100',   text: 'text-gray-600' },
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
