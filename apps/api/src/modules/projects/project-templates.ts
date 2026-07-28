// Project TYPES for a patent-analysis firm. Selecting a type on project creation
// auto-creates that type's standard workflow as a task list (see ProjectsService.create).
// Task lists are grounded in the researched real-world workflows (see
// docs/research/patent-hml-claim-charts.md and squark-ip-service-domains.md).
//
// `comingSoon: true` types are shown in the UI but not yet selectable (no template wired).
// `GENERAL` is the escape hatch — a plain project with no preset workflow.

export interface ProjectTypeDef {
  /** Stored on Project.projectType and sent by the client. */
  value: string;
  /** UI label. */
  label: string;
  /** One-line description shown under the option. */
  description: string;
  /** When true, shown but not selectable (feature not built yet). */
  comingSoon?: boolean;
  /** The task list created for this type. */
  taskListName?: string;
  /** Ordered task titles auto-created under that list. */
  tasks?: string[];
  /** true when this came from a saved org custom template (not a built-in). */
  custom?: boolean;
}

// The FTO / Landscape workflow is shared (identical task list).
const FTO_LANDSCAPE_TASKS = [
  'Proposal',
  'Understanding + KFs',
  'Taxonomy Creation',
  'Initial Search Strategies',
  'Final Search Strategies',
  '1st Level Screening',
  '2nd Level Screening - Detailed',
  'Results Mapping',
  'Iteration',
  'Report Preparation',
  'QC',
];

export const PROJECT_TYPES: ProjectTypeDef[] = [
  {
    value: 'INFRINGEMENT',
    label: 'Infringement Search',
    description: 'Infringement analysis workflow — HML ranking through claim-chart preparation.',
    taskListName: 'Infringement Search',
    tasks: [
      'HML Ranking',
      'Infringement Analysis',
      'Testing',
      'Reverse Engineering',
      'Claim Chart Preparation',
    ],
  },
  {
    value: 'NOVELTY',
    label: 'Novelty Search',
    description: 'Pre-filing novelty / patentability search.',
    taskListName: 'Novelty Search',
    tasks: [
      'Understanding + KFs',
      'Search strategies',
      'Iterations',
      'Report Preparation',
    ],
  },
  {
    value: 'INVALIDITY',
    label: 'Invalidity Search',
    description: 'Invalidation-grade prior-art search.',
    taskListName: 'Invalidity Search',
    tasks: [
      'Understanding + KFs',
      'File Wrapper/History',
      'Exclusion list',
      'Search strategies',
      'Iterations',
      'Report Preparation',
    ],
  },
  {
    value: 'FTO',
    label: 'FTO Search',
    description: 'Freedom-to-operate clearance search.',
    taskListName: 'FTO Search',
    tasks: FTO_LANDSCAPE_TASKS,
  },
  {
    value: 'LANDSCAPE',
    label: 'Landscape Search',
    description: 'Patent landscape / whitespace search.',
    taskListName: 'Landscape Search',
    tasks: FTO_LANDSCAPE_TASKS,
  },
  {
    value: 'MONETIZATION',
    label: 'Patent Monetization',
    description: 'Patent monetization / licensing engagement.',
  },
  {
    value: 'REVERSE_ENGINEERING',
    label: 'Reverse Engineering',
    description: 'Product teardown and technical evidence of use.',
  },
  {
    value: 'RISK_STRATEGY',
    label: 'Risk & Strategy',
    description: 'IP risk-exposure and strategy engagement.',
  },
  {
    value: 'GENERAL',
    label: 'General / Other',
    description: 'A general project with no preset workflow.',
  },
];

export const PROJECT_TYPE_VALUES: string[] = PROJECT_TYPES.map(t => t.value);

/** The template to apply for a chosen type, or null when there is nothing to auto-create. */
export function templateFor(value?: string | null): ProjectTypeDef | null {
  if (!value) return null;
  const def = PROJECT_TYPES.find(t => t.value === value);
  if (!def || def.comingSoon || !def.tasks?.length) return null;
  return def;
}
