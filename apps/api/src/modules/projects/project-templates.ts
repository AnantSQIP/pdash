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
}

export const PROJECT_TYPES: ProjectTypeDef[] = [
  {
    value: 'HML',
    label: 'HML Ranking',
    description: 'Rank a set of patents High / Medium / Low against a client feature set.',
    taskListName: 'HML Workflow',
    tasks: [
      '1st Level pass',
      '2nd Level pass — Final list',
      'Patent Analysis — Detailed for defendants',
      'Report',
    ],
  },
  {
    value: 'CC_CLIENT',
    label: 'Claim Chart — From Client',
    description: 'Verify and strengthen a client-provided claim chart / infringement theory.',
    taskListName: 'Claim Chart (From Client)',
    tasks: [
      'Theory Verify',
      'Client Q&A',
      'Additional Research on defendants',
    ],
  },
  {
    value: 'CC_NEW',
    label: 'Claim Chart — New',
    description: 'Build an evidence-of-use / infringement claim chart from scratch.',
    taskListName: 'Claim Chart (New)',
    tasks: [
      'Understanding Claim',
      'Research on Defendants',
      'Finalising Chart',
    ],
  },
  {
    value: 'NOVELTY',
    label: 'Novelty / Patentability Search',
    description: 'Pre-filing search assessing novelty (§102) and non-obviousness (§103).',
    taskListName: 'Novelty Search',
    tasks: [
      'Define Scope & Search Strategy',
      'Database Search',
      'Non-Patent Literature Sweep',
      'Reference Analysis & Ranking',
      'Patentability Opinion & QC',
    ],
  },
  {
    value: 'INVALIDITY',
    label: 'Prior Art & Invalidation',
    description: 'Invalidation-grade search producing element-by-element invalidity charts.',
    taskListName: 'Invalidity Search',
    tasks: [
      'Search Strategy Development',
      'Exhaustive Multi-Database Search',
      'NPL & Standards Sweep',
      'Reference Selection & Claim Mapping',
      'QC Review',
    ],
  },
  {
    value: 'FTO',
    label: 'Freedom to Operate',
    description: 'Clearance against live, in-force patents, with risk rating and design-arounds.',
    taskListName: 'FTO Workflow',
    tasks: [
      'Define Product & Features',
      'Landscape & Search (live patents)',
      'Mapping & Risk Rating',
      'Opinion & Design-Around',
    ],
  },
  {
    value: 'REVERSE_ENGINEERING',
    label: 'Reverse Engineering',
    description: 'Teardown → court-ready technical evidence of use aligned to claim language.',
    taskListName: 'Reverse Engineering',
    tasks: [
      'Sample Acquisition & Chain-of-Custody',
      'RE Analysis (delayer / firmware / protocol)',
      'Evidence Extraction',
      'Claim Mapping',
      'Expert-Ready Report',
    ],
  },
  {
    value: 'RISK_STRATEGY',
    label: 'Risk & Strategy',
    description: 'IP risk-exposure matrix, gap/whitespace analysis and a de-risk roadmap.',
    taskListName: 'Risk & Strategy',
    tasks: [
      'Map Portfolio & Products',
      'Identify Risks & Gaps',
      'Score & Prioritise',
      'De-Risk Roadmap',
    ],
  },
  {
    value: 'MONETIZATION',
    label: 'Patent Monetization',
    description: 'End-to-end licensing programme (portfolio ranking → campaign). Coming soon.',
    comingSoon: true,
  },
  {
    value: 'GENERAL',
    label: 'General / Other',
    description: 'A general project with no preset patent-analysis workflow.',
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
