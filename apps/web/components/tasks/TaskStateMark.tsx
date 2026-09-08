'use client';

import { Check } from 'lucide-react';

/**
 * Whether a task is done — as a mark, not a control.
 *
 * The circle at the left of a task row used to be a button: one click closed the task, another
 * reopened it. That put the most consequential change on the row behind its smallest and least
 * deliberate target, sitting where a list normally puts a decoration, and inches from the row
 * click that opens the task. It was pressed by accident, and a task closing by accident takes
 * its clock, its timesheet gate and its project percentage with it.
 *
 * Closing a task now happens where it is stated in words — the status dropdown on the row, and
 * Finish or Mark Complete on the task itself. This only reports which of the two states the task
 * is in: a tick when it is complete, a dot while it is open.
 */
export function TaskStateMark({ closed, size = 16 }: {
  closed: boolean;
  /** The mark's outer box, in pixels — the row and the phone card use different sizes. */
  size?: number;
}) {
  const label = closed ? 'Complete' : 'Open';
  const box = { width: size, height: size };
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center"
      style={box}
    >
      {closed ? (
        <span className="flex items-center justify-center rounded-full bg-green-500 text-white" style={box}>
          <Check size={Math.round(size * 0.66)} strokeWidth={3} />
        </span>
      ) : (
        <span
          className="rounded-full bg-gray-300"
          style={{ width: Math.round(size * 0.45), height: Math.round(size * 0.45) }}
        />
      )}
    </span>
  );
}
