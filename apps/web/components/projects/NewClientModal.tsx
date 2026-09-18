'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Info, Search, KeyRound, Copy, RefreshCw, Check, Clock, Layers, Building2, Lock } from 'lucide-react';
import clsx from 'clsx';

import { api, type ApiProject, type ProjectTypeDef, type PatentOption, type ClientSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useAuth } from '@/lib/auth-context';
import { TechnologyDomainPicker, domainPayload } from './TechnologyDomainPicker';
import { ClientGroupPicker } from './ClientGroups';
import { DateField } from '@/components/ui/DateField';
import { fullName } from '@/lib/avatar';
import { patentMatches, matchedFormerHandle } from '@/lib/patent-search';
import { PATENTS_AND_CLIENT_CODES } from '@/lib/features';

interface NewClientModalProps {
  onClose: () => void;
  /** Called with the client that was created, so the caller can open it. */
  onSuccess?: (created?: ApiProject) => void;
  createdBy?: string;
  /** Pre-select a client group — used when "New client" is pressed inside a group's section. */
  defaultClientGroupId?: string;
}

/**
 * CLIENTS-FLOW: creating a client — what "New project" became.
 *
 * What was a project is a client now, so this asks what a client needs: a name, the group it is
 * filed under, who runs it, and its PID (minted by an authority, or requested from one — that
 * flow is unchanged). The KIND of work and its FIELD moved down a level, to task groups: a client
 * does many kinds of work, so stamping one type on the whole client would misdescribe the rest.
 *
 * Most new clients arrive with a first piece of work, so the form offers to create the first task
 * group in the same step — its type's standard tasks are created inside it, in one transaction
 * with the client. It can be switched off to create a bare client.
 *
 * The client-code picker and the patent-ID picker are commented out (PATENTS_AND_CLIENT_CODES),
 * not deleted — they are still below, behind the flag.
 */
export function NewClientModal({ onClose, onSuccess, createdBy = 'system', defaultClientGroupId = '' }: NewClientModalProps) {
  const { org, currentUser } = useOrg();
  const { can } = usePermissions();
  const { user } = useAuth();
  // A PID AUTHORITY (project.generate_pid) mints the PID themselves. Everyone else REQUESTS one:
  // they nominate an authority who assigns the PID after the client is created.
  const canGeneratePid = can('project.generate_pid');
  // CLIENTS-FLOW: commented out — patent IDs and client codes are switched off.
  const canSeePatents = PATENTS_AND_CLIENT_CODES && can('patent.view');
  const canPickClient = PATENTS_AND_CLIENT_CODES && can('patent.manage');

  // ── The client ────────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientGroupId, setClientGroupId] = useState(defaultClientGroupId);
  const [priority, setPriority] = useState('MEDIUM');
  // The office that owns the client — inherited from the creator, kept only for reporting.
  const [office, setOffice] = useState('');
  useEffect(() => { if (!office && user?.office) setOffice(user.office); }, [user?.office, office]);

  // ── Its first task group (optional) ───────────────────────────────────────────────
  const [withGroup, setWithGroup] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [groupNameTouched, setGroupNameTouched] = useState(false);
  const [groupType, setGroupType] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customTasks, setCustomTasks] = useState('');   // one task per line
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [techDomain, setTechDomain] = useState('');
  const [customDomainLabel, setCustomDomainLabel] = useState('');
  const [saveDomain, setSaveDomain] = useState(false);
  const [groupStart, setGroupStart] = useState('');
  const [groupDue, setGroupDue] = useState('');
  // The date promised to the client, for someone allowed to set one (a new client has no manager
  // relationship yet, so only the global permission qualifies — the server says the same).
  const canSetClientDue = can('deadline.view.client');
  const [groupClientDue, setGroupClientDue] = useState('');

  // ── CLIENTS-FLOW: commented out — client codes and patent IDs (kept, switched off) ─────
  const [patentIds, setPatentIds] = useState<string[]>([]);
  const [patentSearch, setPatentSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const { data: clientList = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'], queryFn: () => api.clients.list(),
    enabled: canPickClient, staleTime: 30_000,
  });
  const clientOptions = useMemo(() => clientList.filter(c => !c.archivedAt), [clientList]);
  const { data: patentOptions = [] } = useQuery<PatentOption[]>({
    queryKey: ['patent-options-all'], queryFn: () => api.patents.options(),
    enabled: canSeePatents, staleTime: 30_000,
  });
  const filteredPatents = useMemo(
    () => patentOptions.filter(p => patentMatches(p, patentSearch)),
    [patentOptions, patentSearch],
  );
  function togglePatent(id: string) {
    setPatentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  // ── PID ───────────────────────────────────────────────────────────────────────────
  const [pidAssigneeId, setPidAssigneeId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [pid, setPid] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);   // reservation countdown
  const [now, setNow] = useState(() => Date.now());
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Restore an outstanding (un-attached) reservation when the dialog opens, so its countdown
  // continues and the authority isn't blocked from creating without a clue why.
  useEffect(() => {
    if (!canGeneratePid) return;
    api.projects.myPidReservation().then(r => {
      if (r.reservation) { setPid(r.reservation.pid); setExpiresAt(r.reservation.expiresAt); }
    }).catch(() => { /* ignore */ });
  }, [canGeneratePid]);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const secsLeft = expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (expiresAt && secsLeft === 0) { setPid(''); setExpiresAt(null); }
  }, [expiresAt, secsLeft]);

  // The people who can assign a PID — the request dropdown for non-authorities.
  const { data: authorities = [] } = useQuery({
    queryKey: ['pid-authorities', org?.id],
    queryFn: () => api.projects.pidAuthorities(),
    enabled: !!org?.id && !canGeneratePid,
    staleTime: 5 * 60_000,
  });
  const authorityOptions = useMemo(
    () => authorities.filter(u => u.id !== currentUser?.id),
    [authorities, currentUser],
  );

  // Everyone who may run a client — the caller INCLUDED, and first. Running a client and being
  // allowed to mint its PID are different rights; the PID request still goes to an authority.
  const { data: managerData } = useQuery({
    queryKey: ['eligible-managers', org?.id],
    queryFn: () => api.projects.eligibleManagers(),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  });
  const managers = managerData?.managers ?? [];
  const selfEligible = managers.some(u => u.isSelf);
  const managerOptions = [...managers].sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

  async function generatePid() {
    setGenerating(true); setError('');
    try {
      const res = await api.projects.generatePid();
      setPid(res.pid);
      setExpiresAt(res.expiresAt ?? null);
      setNow(Date.now());
      try { await navigator.clipboard.writeText(res.pid); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a PID.');
    } finally {
      setGenerating(false);
    }
  }

  // Types of work and their standard tasks. Not cached forever — someone may have saved a new
  // custom type since this tab loaded.
  const { data: projectTypes = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'],
    queryFn: () => api.projects.types(),
    staleTime: 5 * 60_000,
  });
  const selectedType = projectTypes.find(t => t.value === groupType);
  const isCustom = groupType === '__custom__';

  // Until somebody types their own, the group is named after the kind of work it is — the name
  // people would have typed anyway, and one less empty box between them and "Create".
  useEffect(() => {
    if (groupNameTouched) return;
    if (isCustom) setGroupName(customLabel.trim());
    else setGroupName(selectedType ? selectedType.label : '');
  }, [groupType, customLabel, selectedType, isCustom, groupNameTouched]);

  const groupDatesInverted = !!groupStart && !!groupDue && groupDue < groupStart;
  const clientBeforeInternal = !!groupClientDue && !!groupDue && groupClientDue < groupDue;
  const groupIncomplete = withGroup && (!groupName.trim() || (isCustom && !customLabel.trim()) || groupDatesInverted || clientBeforeInternal);
  // CLIENTS-FLOW (PID rework): naming who assigns the PID is optional — every authority sees it.
  const requestIncomplete = !canGeneratePid && !managerId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the client a name.'); return; }
    if (!canGeneratePid && !managerId) { setError('Choose who manages this client.'); return; }
    if (withGroup && !groupName.trim()) { setError('Give the first task group a name, or untick “Start with a task group”.'); return; }
    if (withGroup && isCustom && !customLabel.trim()) { setError('Give the new type of work a name.'); return; }
    if (groupDatesInverted) { setError('The task group’s deadline cannot be before its start.'); return; }
    if (clientBeforeInternal) { setError('The team’s deadline cannot be after the date promised to the client.'); return; }
    setLoading(true);
    setError('');
    try {
      const created = await api.projects.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        office: office || undefined,
        clientGroupId: clientGroupId || undefined,
        pid: canGeneratePid && pid ? pid : undefined,
        // Requester → required manager; authority → optional delegation (blank = self).
        managerId: managerId || undefined,
        pidAssigneeId: !canGeneratePid ? pidAssigneeId : undefined,
        createdBy,
        taskGroup: withGroup ? {
          name: groupName.trim(),
          groupType: isCustom ? undefined : (groupType || undefined),
          customType: isCustom ? {
            label: customLabel.trim(),
            tasks: customTasks.split('\n').map(t => t.trim()).filter(Boolean),
            save: saveTemplate,
          } : undefined,
          ...domainPayload(techDomain, customDomainLabel, saveDomain),
          startDate: groupStart || undefined,
          dueDate: groupDue || undefined,
          clientDueDate: canSetClientDue && groupClientDue ? groupClientDue : undefined,
        } : undefined,
        // CLIENTS-FLOW: commented out — only ever sent while the feature is on.
        ...(PATENTS_AND_CLIENT_CODES ? {
          patentIds: patentIds.length ? patentIds : undefined,
          clientId: (canPickClient && !patentIds.length && clientId) ? clientId : undefined,
        } : {}),
      });
      if (withGroup && isCustom && saveTemplate) await queryClient.invalidateQueries({ queryKey: ['project-types'] });
      if (withGroup && saveDomain && customDomainLabel.trim()) await queryClient.invalidateQueries({ queryKey: ['technology-domains'] });
      onSuccess?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the client.');
    } finally {
      setLoading(false);
    }
  }

  const label = 'block text-sm font-medium text-gray-700 mb-1.5';
  const field = 'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{canGeneratePid ? 'New client' : 'Request a new client'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {canGeneratePid
                ? 'Name the client, file it in a group, and start its first piece of work.'
                : 'A PID authority will assign the client’s PID.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {!canGeneratePid && (
            <div className="flex items-start gap-2 text-xs text-brand-800 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
              <Info size={14} className="mt-0.5 shrink-0 text-brand-500" />
              <span>
                You don&apos;t have PID authority, so the client is created with its <b>PID pending</b>.
                Every PID authority sees the request and any of them can assign it — you&apos;ll be told once
                it&apos;s set. Work on the client can start straight away.
              </span>
            </div>
          )}

          {/* ── The client ─────────────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Building2 size={13} /> Client
            </h3>
            <div>
              <label htmlFor="nc-name" className={label}>Client name <span className="text-red-500">*</span></label>
              <input
                id="nc-name" type="text" required maxLength={100} autoFocus
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Acme Technologies"
                className={field}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nc-group" className={label}>Client group</label>
                <ClientGroupPicker id="nc-group" value={clientGroupId} onChange={setClientGroupId} />
              </div>
              <div>
                <label htmlFor="nc-priority" className={label}>Priority</label>
                <select id="nc-priority" value={priority} onChange={e => setPriority(e.target.value)} className={field}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="nc-desc" className={label}>About this client <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                id="nc-desc" rows={2} maxLength={2000}
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Who they are, what they usually ask us for"
                className={clsx(field, 'resize-none')}
              />
            </div>

            {/* CLIENTS-FLOW: commented out — the client-code picker (switched off). */}
            {canPickClient && (
              <div>
                <label className={label}>Client code</label>
                <select
                  value={patentIds.length ? '' : clientId}
                  onChange={e => setClientId(e.target.value)}
                  disabled={patentIds.length > 0}
                  className={clsx(field, 'disabled:bg-gray-50 disabled:text-gray-400')}
                >
                  <option value="">— none —</option>
                  {clientOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.code})` : c.code}</option>
                  ))}
                </select>
              </div>
            )}

            {/* CLIENTS-FLOW: commented out — the patent-ID picker (switched off). */}
            {canSeePatents && (
              <div>
                <label className={label}>
                  Patent IDs
                  {patentIds.length > 0 && <span className="ml-1 text-xs font-normal text-brand-600">· {patentIds.length} selected</span>}
                </label>
                {patentOptions.length === 0 ? (
                  <p className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-2.5">No patents registered yet.</p>
                ) : (
                  <div className="rounded-lg border border-gray-300 overflow-hidden">
                    <div className="relative border-b border-gray-100">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={patentSearch}
                        onChange={e => setPatentSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.preventDefault();
                          if (e.key === 'Escape' && patentSearch) { e.preventDefault(); e.stopPropagation(); setPatentSearch(''); }
                        }}
                        placeholder="Search patent ID…"
                        aria-label="Search patent IDs"
                        className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                      {filteredPatents.map(p => (
                        <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={patentIds.includes(p.id)} onChange={() => togglePatent(p.id)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                          <span className="text-sm font-mono text-gray-700">{p.handle}</span>
                          {matchedFormerHandle(p, patentSearch) && (
                            <span className="text-[11px] text-gray-400">was {matchedFormerHandle(p, patentSearch)}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── PID and who runs it ────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <KeyRound size={13} /> PID and manager
            </h3>
            {canGeneratePid && (
              <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-800">PID</p>
                    {pid
                      ? <p className="text-sm font-semibold text-brand-700 font-mono truncate">{pid}</p>
                      : <p className="text-[11px] text-gray-500">Generate one now (held for 5 minutes), or leave it — the client waits in the PID queue until one is attached.</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pid && (
                      <button type="button" title="Copy"
                        onClick={() => { navigator.clipboard?.writeText(pid); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="p-1.5 rounded-md text-brand-600 hover:bg-brand-100">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
                    {!(pid && expiresAt) && (
                      <button type="button" onClick={generatePid} disabled={generating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                        <RefreshCw size={13} className={generating ? 'animate-spin' : ''} /> Generate PID
                      </button>
                    )}
                  </div>
                </div>
                {pid && expiresAt && (
                  <p className="mt-2 text-[11px] text-amber-700 flex items-center gap-1">
                    <Clock size={11} /> Reserved — create the client within {Math.floor(secsLeft / 60)}m {String(secsLeft % 60).padStart(2, '0')}s, or the number is released.
                  </p>
                )}
              </div>
            )}

            <div className={clsx('grid gap-4', !canGeneratePid && 'sm:grid-cols-2')}>
              <div>
                <label htmlFor="nc-manager" className={label}>
                  Client manager {!canGeneratePid ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
                </label>
                <select id="nc-manager" required={!canGeneratePid} value={managerId} onChange={e => setManagerId(e.target.value)} className={field}>
                  <option value="">{canGeneratePid ? 'Me — I’ll manage it' : 'Select a manager…'}</option>
                  {managerOptions.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.isSelf ? 'Me — I’ll manage it' : fullName(u)}{!u.isSelf && u.designation ? ` — ${u.designation}` : ''}
                    </option>
                  ))}
                </select>
                {!canGeneratePid && !selfEligible && (
                  <p className="text-[11px] text-gray-400 mt-1">Managing a client needs the manager permission, which your role does not carry.</p>
                )}
              </div>
              {!canGeneratePid && (
                <div>
                  <label htmlFor="nc-pid-from" className={label}>Ask first for the PID <span className="text-gray-400 font-normal">(optional)</span></label>
                  <select id="nc-pid-from" value={pidAssigneeId} onChange={e => setPidAssigneeId(e.target.value)} className={field}>
                    <option value="">Any PID authority</option>
                    {authorityOptions.map(u => (
                      <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` — ${u.designation}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* ── The first task group ───────────────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 overflow-hidden">
            <label className="flex items-start gap-2.5 px-4 py-3 bg-gray-50/80 cursor-pointer">
              <input type="checkbox" checked={withGroup} onChange={e => setWithGroup(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800"><Layers size={14} className="text-brand-500" /> Start with a task group</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">The first piece of work for this client. Its type’s standard tasks are created inside it.</span>
              </span>
            </label>

            {withGroup && (
              <div className="px-4 py-4 space-y-4 border-t border-gray-100">
                <div>
                  <label htmlFor="nc-type" className={label}>Type of work</label>
                  <select id="nc-type" value={groupType} onChange={e => setGroupType(e.target.value)} className={field}>
                    <option value="">General — no standard tasks</option>
                    {projectTypes.filter(t => t.value !== 'GENERAL').map(t => (
                      <option key={t.value} value={t.value} disabled={t.comingSoon}>
                        {t.label}{t.comingSoon ? ' — coming soon' : ''}{t.custom ? ' (custom)' : ''}
                      </option>
                    ))}
                    <option value="__custom__">+ Create a new type…</option>
                  </select>
                  {isCustom ? (
                    <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3 space-y-2.5">
                      <input
                        value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                        placeholder="New type name — e.g. Standard Essentiality Study"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white"
                      />
                      <textarea
                        rows={3} value={customTasks} onChange={e => setCustomTasks(e.target.value)}
                        placeholder={'Its tasks, one per line\nUnderstanding + KFs\nReport'}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white resize-none"
                      />
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                        Save this type for everyone in the organisation
                      </label>
                    </div>
                  ) : selectedType?.tasks && selectedType.tasks.length > 0 && (
                    <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2">
                      <p className="text-xs font-medium text-brand-800 mb-1">Creates {selectedType.tasks.length} tasks:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-xs text-brand-700">
                        {selectedType.tasks.map((t, i) => <li key={i}>{t}</li>)}
                      </ol>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="nc-group-name" className={label}>Task group name <span className="text-red-500">*</span></label>
                  <input
                    id="nc-group-name" maxLength={100}
                    value={groupName}
                    onChange={e => { setGroupName(e.target.value); setGroupNameTouched(true); }}
                    placeholder="e.g. FTO – Widget X"
                    className={field}
                  />
                </div>

                <TechnologyDomainPicker
                  value={techDomain} onChange={setTechDomain}
                  customLabel={customDomainLabel} onCustomLabel={setCustomDomainLabel}
                  save={saveDomain} onSave={setSaveDomain}
                />

                <div className={clsx('grid gap-4', canSetClientDue ? 'grid-cols-3' : 'grid-cols-2')}>
                  <div>
                    <label className={label}>Start</label>
                    <DateField type="date" value={groupStart} onChange={e => setGroupStart(e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className={label}>Deadline <span className="text-gray-400 font-normal">· team</span></label>
                    <DateField type="date" value={groupDue} min={groupStart || undefined} max={groupClientDue || undefined} onChange={e => setGroupDue(e.target.value)} className={field} />
                  </div>
                  {canSetClientDue && (
                    <div>
                      <label className="flex items-center gap-1 text-sm font-medium text-amber-700 mb-1.5"><Lock size={11} /> Client deadline</label>
                      <DateField type="date" value={groupClientDue} min={groupDue || groupStart || undefined} onChange={e => setGroupClientDue(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-amber-300 bg-amber-50/40 rounded-lg focus:outline-none focus:border-amber-500 transition" />
                    </div>
                  )}
                </div>
                {groupDatesInverted && <p className="-mt-2 text-xs text-red-600">The deadline cannot be before the start.</p>}
                {clientBeforeInternal && <p className="-mt-2 text-xs text-red-600">The team’s deadline cannot be after the date promised to the client.</p>}
              </div>
            )}
          </section>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || groupIncomplete || requestIncomplete}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {canGeneratePid ? 'Creating…' : 'Submitting…'}
                </span>
              ) : (
                <><Plus size={15} /> {canGeneratePid ? 'Create client' : 'Submit request'}</>
              )}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 -mt-2" role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}

/** The old name, kept so nothing that imported it breaks. */
export const NewProjectModal = NewClientModal;
