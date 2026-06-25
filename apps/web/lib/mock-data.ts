// Mock data used for UI preview (real data comes via Prisma server components once seeded)

export type Phase = 'IDEA' | 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED' | 'CANCELLED';
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

export const MOCK_PROJECTS: MockProject[] = [
  {
    id: '1',
    title: 'Apollo Website Redesign',
    description: 'Complete overhaul of the public-facing website with modern UI and improved performance.',
    projectPhase: 'ACTIVE',
    priority: 'HIGH',
    completionPercentage: 62,
    taskCount: 48,
    memberCount: 6,
    dueDate: '2026-08-15',
    members: [
      { initials: 'SA', color: 'bg-purple-500' },
      { initials: 'MK', color: 'bg-slate-600' },
      { initials: 'RJ', color: 'bg-green-500' },
      { initials: 'LP', color: 'bg-orange-500' },
    ],
    statusColor: '#E8533A',
    createdAt: '2026-03-10',
  },
  {
    id: '2',
    title: 'Mobile App v2.0',
    description: 'Native iOS and Android app with offline capabilities and real-time sync.',
    projectPhase: 'PLANNING',
    priority: 'CRITICAL',
    completionPercentage: 18,
    taskCount: 72,
    memberCount: 9,
    dueDate: '2026-10-01',
    members: [
      { initials: 'DV', color: 'bg-red-500' },
      { initials: 'AK', color: 'bg-yellow-500' },
      { initials: 'BT', color: 'bg-pink-500' },
    ],
    statusColor: '#eab308',
    createdAt: '2026-04-01',
  },
  {
    id: '3',
    title: 'Data Migration — v1 to v2',
    description: 'Migrate all legacy data from the old schema to the new ERD v2.0 architecture.',
    projectPhase: 'ACTIVE',
    priority: 'HIGH',
    completionPercentage: 85,
    taskCount: 23,
    memberCount: 4,
    dueDate: '2026-07-01',
    members: [
      { initials: 'NK', color: 'bg-indigo-500' },
      { initials: 'PR', color: 'bg-teal-500' },
    ],
    statusColor: '#E8533A',
    createdAt: '2026-05-15',
  },
  {
    id: '4',
    title: 'Customer Portal',
    description: 'Self-service portal for enterprise customers to manage their subscriptions and support tickets.',
    projectPhase: 'IDEA',
    priority: 'MEDIUM',
    completionPercentage: 0,
    taskCount: 0,
    memberCount: 3,
    dueDate: '2026-12-31',
    members: [
      { initials: 'CM', color: 'bg-cyan-500' },
      { initials: 'LW', color: 'bg-violet-500' },
      { initials: 'AH', color: 'bg-emerald-500' },
    ],
    statusColor: '#9aa0a6',
    createdAt: '2026-06-01',
  },
  {
    id: '5',
    title: 'Analytics Dashboard v3',
    description: 'Rebuilt reporting engine with real-time charts, custom widgets, and export options.',
    projectPhase: 'COMPLETED',
    priority: 'MEDIUM',
    completionPercentage: 100,
    taskCount: 31,
    memberCount: 5,
    dueDate: '2026-05-30',
    members: [
      { initials: 'JD', color: 'bg-rose-500' },
      { initials: 'SK', color: 'bg-amber-500' },
    ],
    statusColor: '#16a34a',
    createdAt: '2026-01-20',
  },
  {
    id: '6',
    title: 'Security Audit Q2',
    description: 'Penetration testing, dependency audit, and RBAC hardening across all services.',
    projectPhase: 'ON_HOLD',
    priority: 'HIGH',
    completionPercentage: 40,
    taskCount: 15,
    memberCount: 3,
    dueDate: '2026-09-15',
    members: [
      { initials: 'TS', color: 'bg-slate-500' },
      { initials: 'KM', color: 'bg-blue-600' },
    ],
    statusColor: '#E8533A',
    createdAt: '2026-02-10',
  },
];

export const PHASE_META: Record<Phase, { label: string; bg: string; text: string }> = {
  IDEA:      { label: 'Idea',      bg: 'bg-gray-100',   text: 'text-gray-600' },
  PLANNING:  { label: 'Planning',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
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
