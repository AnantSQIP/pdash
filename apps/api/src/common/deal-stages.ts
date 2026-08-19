/**
 * The pipeline's stages, in order, with the probability each carries for forecasting.
 *
 * ONE definition, used by the board, the forecast and the validation, so a stage cannot exist in
 * the UI that the server refuses, and a weighting cannot drift between the chart and the number
 * beside it.
 *
 * The probabilities are conventional starting points, not measurements. Once there is a year of
 * real win/loss history the honest thing is to replace them with this firm's actual conversion
 * rate per stage — the reporting below is what makes that possible.
 */
export type DealStage = 'NEW' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface StageDef {
  value: DealStage;
  label: string;
  /** Share of `value` counted toward the weighted forecast. Terminal stages are 1 and 0. */
  probability: number;
  /** Terminal stages leave the board's working columns and stop counting as open pipeline. */
  terminal?: boolean;
}

export const DEAL_STAGES: StageDef[] = [
  { value: 'NEW',         label: 'New',         probability: 0.10 },
  { value: 'CONTACTED',   label: 'Contacted',   probability: 0.25 },
  { value: 'PROPOSAL',    label: 'Proposal',    probability: 0.50 },
  { value: 'NEGOTIATION', label: 'Negotiation', probability: 0.75 },
  { value: 'WON',         label: 'Won',         probability: 1,    terminal: true },
  { value: 'LOST',        label: 'Lost',        probability: 0,    terminal: true },
];

export const DEAL_STAGE_VALUES = DEAL_STAGES.map(s => s.value);
export const OPEN_STAGES = DEAL_STAGES.filter(s => !s.terminal).map(s => s.value);

export function stageDef(stage: string): StageDef | undefined {
  return DEAL_STAGES.find(s => s.value === stage);
}

export function isDealStage(v: string): v is DealStage {
  return DEAL_STAGE_VALUES.includes(v as DealStage);
}

/** Activity kinds. STAGE_CHANGE is written by the system; the rest are logged by a person. */
export const DEAL_ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STAGE_CHANGE'] as const;
export type DealActivityType = (typeof DEAL_ACTIVITY_TYPES)[number];
