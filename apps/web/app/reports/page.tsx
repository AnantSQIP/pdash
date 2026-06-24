import { Download, TrendingUp, FolderOpen, CheckSquare, Users } from 'lucide-react';
import { MOCK_PROJECTS, PHASE_META, PRIORITY_META, type Priority } from '@/lib/mock-data';

export default function ReportsPage() {
  // --- Derived stats ---
  const totalProjects = MOCK_PROJECTS.length;
  const activeProjects = MOCK_PROJECTS.filter(p => p.projectPhase === 'ACTIVE').length;
  const avgCompletion = Math.round(
    MOCK_PROJECTS.reduce((sum, p) => sum + p.completionPercentage, 0) / MOCK_PROJECTS.length
  );
  const totalTasks = MOCK_PROJECTS.reduce((sum, p) => sum + p.taskCount, 0);

  // --- Status distribution ---
  const statusDist = [
    { label: 'Active',    count: MOCK_PROJECTS.filter(p => p.projectPhase === 'ACTIVE').length,    color: '#3d8de2' },
    { label: 'Completed', count: MOCK_PROJECTS.filter(p => p.projectPhase === 'COMPLETED').length, color: '#16a34a' },
    { label: 'On Hold',   count: MOCK_PROJECTS.filter(p => p.projectPhase === 'ON_HOLD').length,   color: '#fe841f' },
    { label: 'Planning',  count: MOCK_PROJECTS.filter(p => p.projectPhase === 'PLANNING').length,  color: '#eab308' },
    { label: 'Idea',      count: MOCK_PROJECTS.filter(p => p.projectPhase === 'IDEA').length,      color: '#9aa0a6' },
  ];

  // --- Priority bar chart ---
  const priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const priorityData = priorities.map(pr => {
    const group = MOCK_PROJECTS.filter(p => p.priority === pr);
    const avg = group.length > 0
      ? Math.round(group.reduce((s, p) => s + p.completionPercentage, 0) / group.length)
      : 0;
    return { label: PRIORITY_META[pr].label, avg, count: group.length };
  });
  const maxAvg = Math.max(...priorityData.map(d => d.avg), 1);

  // --- Project health ---
  const healthDot = (phase: string, pct: number) => {
    if (phase === 'ON_HOLD') return 'bg-red-400';
    if (phase === 'ACTIVE' && pct >= 50) return 'bg-green-400';
    if (phase === 'ACTIVE' && pct < 50) return 'bg-yellow-400';
    if (phase === 'COMPLETED') return 'bg-green-400';
    return 'bg-gray-300';
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports &amp; Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project performance overview</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download size={15} />
          Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Card 1 — Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Projects',    value: totalProjects,   icon: <FolderOpen size={20} />, iconBg: 'bg-brand-100', iconColor: 'text-brand-600' },
            { label: 'Active Projects',   value: activeProjects,  icon: <TrendingUp size={20} />, iconBg: 'bg-blue-100',   iconColor: 'text-blue-600' },
            { label: 'Avg Completion',    value: `${avgCompletion}%`, icon: <CheckSquare size={20} />, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
            { label: 'Total Tasks',       value: totalTasks,      icon: <Users size={20} />,     iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${stat.iconBg} ${stat.iconColor}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Card 2 — Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Project Status Distribution</h2>
          {/* Stacked bar */}
          <div className="flex h-8 rounded-lg overflow-hidden mb-4">
            {statusDist.map(s => (
              <div
                key={s.label}
                style={{ width: `${(s.count / totalProjects) * 100}%`, backgroundColor: s.color }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4">
            {statusDist.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-600">{s.label}</span>
                <span className="text-xs font-semibold text-gray-800">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3 — Project Progress Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Project Progress</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Progress</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PROJECTS.map((p, idx) => {
                const phase = PHASE_META[p.projectPhase];
                const pri = PRIORITY_META[p.priority];
                return (
                  <tr key={p.id} className={`${idx < MOCK_PROJECTS.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                    <td className="px-5 py-3 font-medium text-gray-900">{p.title}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${phase.bg} ${phase.text}`}>
                        {phase.label}
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-xs font-semibold ${pri.color}`}>{pri.label}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-600 transition-all"
                            style={{ width: `${p.completionPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{p.completionPercentage}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {new Date(p.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Card 4 — Completion by Priority + Project Health */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Completion by Priority</h2>
            <div className="flex items-end gap-4 h-36">
              {priorityData.map(d => (
                <div key={d.label} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-xs font-semibold text-gray-700">{d.avg}%</span>
                  <div className="w-full rounded-t-md bg-brand-600 transition-all" style={{ height: `${(d.avg / maxAvg) * 100}px` }} />
                  <span className="text-xs text-gray-500">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Project Health */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Project Health</h2>
            <ul className="space-y-3">
              {MOCK_PROJECTS.map(p => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDot(p.projectPhase, p.completionPercentage)}`} />
                  <span className="flex-1 text-sm text-gray-800 truncate">{p.title}</span>
                  <span className="text-xs text-gray-400">{p.completionPercentage}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
