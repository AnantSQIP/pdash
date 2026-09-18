process.env.TZ = 'Asia/Kolkata';
import { byPriorityThenDeadline } from '../apps/web/lib/tasks';
import type { ApiTask } from '../apps/web/lib/api';

const t = (title: string, listId: string | null, seq: number): ApiTask =>
  ({ id: title, title, priority: 'MEDIUM', dueDate: '2026-10-01',
     currentStatus: { type: 'OPEN' },
     projectTasks: [{ projectId: 'p1', taskListId: listId, sequence: seq }] } as unknown as ApiTask);

// Two tasks in the SAME group G (titles out of sequence order), one task in group H between them by title.
const X = t('B',  'G', 2);
const Y = t('C',  'G', 1);
const Z = t('Ba', 'H', 0);

const cmp = (a: ApiTask, b: ApiTask) => Math.sign(byPriorityThenDeadline(a, b));
console.log('X vs Y (same group, seq 2 vs 1):', cmp(X, Y));   // expect +1  -> Y before X
console.log('X vs Z (diff group, title B vs Ba):', cmp(X, Z)); // expect -1 -> X before Z
console.log('Z vs Y (diff group, title Ba vs C):', cmp(Z, Y)); // expect -1 -> Z before Y
console.log('=> X<Z and Z<Y implies X<Y, but X vs Y says', cmp(X, Y));

for (const perm of [[X,Y,Z],[X,Z,Y],[Y,X,Z],[Y,Z,X],[Z,X,Y],[Z,Y,X]]) {
  console.log(perm.map(p=>p.title).join(',').padEnd(10), '->', [...perm].sort(byPriorityThenDeadline).map(p=>p.title).join(','));
}
