import { Injectable } from '@nestjs/common';

/**
 * D1 (milestone auto-complete) is now implemented as an AutomationRule seeded
 * at organization creation — not as a hardcoded service.
 *
 * The AutomationEngine (M8) evaluates the rule:
 *   trigger:   { event: "task.status_changed" }
 *   condition: { all_milestone_tasks_closed: true }
 *   action:    { set_milestone_workflow_status: "CLOSED" }
 *
 * This service is retained as a stub; remove it once the AutomationEngine lands.
 */
@Injectable()
export class RollupService {}
