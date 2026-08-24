'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader, Search, Pencil, Check, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { api, type ApiProject, type PatentOption, type ClientSummary, type PatentNumberLookup, type ProjectPatentNumbers } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { patentMatches, matchedFormerHandle } from '@/lib/patent-search';

/**
 * The patents tagged to a project, with the ability to change them.
 *
 * Patents used to be pickable only while creating a project, which meant a project tagged with
 * the wrong patent stayed wrong forever, and a project created before its patents were registered
 * could never be joined up to them. Both happen often enough that the badges here were the
 * commonest thing on the page nobody could fix.
 *
 * The editor sends the FULL set rather than individual add/remove calls, so what you see in the
 * dialog is exactly what gets saved — no half-applied state if one of several calls fails.
 */
export function PatentTagsEditor({ project }: { project: ApiProject }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);

  const tagged = useMemo(
    () => (project.patents ?? []).map(p => p.patent).slice().sort((a, b) => a.serial - b.serial),
    [project.patents],
  );
  // `patents` is stripped from the payload entirely for anyone without patent.view, so its
  // absence — not an empty array — is what "you may not see these" looks like.
  // Mirrors assertProjectWritable exactly: a completed or closed matter is settled, and is
  // reopened to change it. Stating the same rule differently here would hide the pencil on
  // projects the server would have accepted.
  const mayTag = can('patent.view') && can('project.update')
    && !['COMPLETED', 'CLOSED'].includes(project.projectPhase);

  /**
   * The real numbers behind the handles — fetched only when somebody asks for them.
   *
   * Not eagerly: every call is written to the audit log as "this person looked at this client's
   * patent numbers", and a log where every project visit produces an entry records nothing
   * useful. Asking is the signal worth keeping.
   */
  const { data: numbers, isFetching: numbersLoading, error: numbersError } =
    useQuery<ProjectPatentNumbers>({
      queryKey: ['project-patent-numbers', project.id],
      queryFn: () => api.patentNumbers.forProject(project.id),
      enabled: showNumbers && tagged.length > 0,
      staleTime: 5 * 60_000,
    });
  const numberOf = useMemo(
    () => new Map((numbers?.patents ?? []).map(p => [p.id, p.realNumber])),
    [numbers],
  );

  if (!project.patents) return null;

  return (
    <>
      <ClientLine project={project} />
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-[11px] text-gray-400">Patents:</span>
        {tagged.map(patent => {
          const real = numberOf.get(patent.id);
          return (
            <span
              key={patent.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-100"
            >
              {patent.handle}
              {real && (
                <>
                  <span className="text-amber-300">→</span>
                  <span className="text-amber-900 font-semibold">{real}</span>
                </>
              )}
            </span>
          );
        })}
        {tagged.length === 0 && <span className="text-[11px] text-gray-300">none tagged</span>}
        {/* The handle alone is unusable for the person doing the search: it says WHICH matter, and
            never WHICH PATENT. Only a Super Admin could resolve it, so an analyst staffed on a
            prior-art search could not see the thing they were searching for. Being on the project
            is now the grant — the same membership that let them open this page at all. */}
        {tagged.length > 0 && (
          <button
            onClick={() => setShowNumbers(v => !v)}
            title={showNumbers ? 'Hide the real patent numbers' : 'Show the real patent numbers for this project'}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 ml-0.5"
          >
            {numbersLoading
              ? <Loader size={10} className="animate-spin" />
              : showNumbers ? <EyeOff size={11} /> : <Eye size={11} />}
            {showNumbers ? 'Hide numbers' : 'Show numbers'}
          </button>
        )}
        {mayTag && (
          <button
            onClick={() => setOpen(true)}
            title="Change the patents tagged to this project"
            className="text-gray-300 hover:text-brand-600 transition-colors ml-0.5"
          >
            <Pencil size={11} />
          </button>
        )}
      </div>

      {/* Said once, under the numbers, where somebody is actually looking at them. */}
      {showNumbers && !numbersLoading && (
        numbersError ? (
          <p className="mt-1.5 text-[11px] text-red-600 flex items-start gap-1">
            <ShieldAlert size={11} className="mt-0.5 shrink-0" />
            {numbersError instanceof Error ? numbersError.message : 'Could not load the patent numbers.'}
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
            The client behind these patents is not shown here — that stays with Super Admins. A
            patent number is public information; the client association is not. Every reveal is
            written to the audit log.
          </p>
        )
      )}

      {open && (
        <PatentTagsModal
          projectId={project.id}
          initial={tagged.map(p => p.id)}
          // Handles already tagged must remain listed even when their client has since been
          // archived — otherwise the only way to see them would be to remove them.
          alreadyTagged={tagged}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['project', project.id] });
            toast('Patents updated', 'success');
          }}
        />
      )}
    </>
  );
}

/**
 * Who the project is for — and whether that is something you can change here.
 *
 * Two states, and the difference is the point:
 *   • patents tagged  → the client is INFERRED from them and shown locked. Change the patents.
 *   • no patents      → nothing to infer from, so the client is named directly and editable.
 *
 * Only one of the two can ever be in force, which is what stops a project's stated client from
 * contradicting the patents sitting right underneath it.
 */
function ClientLine({ project }: { project: ApiProject }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');

  // `client` is stripped from the payload for anyone without patent.manage, so a normal member
  // never learns which company this is — they see the patent handles and nothing more.
  const maySeeClients = can('patent.manage');
  const fromPatents = project.clientFromPatents ?? (project.patents ?? []).length > 0;
  const editable = maySeeClients && can('project.update') && !fromPatents
    && !['COMPLETED', 'CLOSED'].includes(project.projectPhase);

  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'], queryFn: () => api.clients.list(), enabled: editing,
  });

  const save = useMutation({
    mutationFn: (clientId: string | null) => api.projects.setClient(project.id, clientId),
    onSuccess: () => {
      setEditing(false); setErr('');
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      toast('Client updated', 'success');
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Could not save.'),
  });

  if (!maySeeClients) return null;

  // An archived client stays selectable only if this project is already on it — otherwise a
  // retired client would keep collecting new work through this dropdown.
  const options = clients.filter(c => !c.archivedAt || c.id === project.client?.id);

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      <span className="text-[11px] text-gray-400">Client:</span>
      {editing ? (
        <>
          <select
            autoFocus defaultValue={project.client?.id ?? ''}
            onChange={e => save.mutate(e.target.value || null)}
            disabled={save.isPending}
            className="px-2 py-0.5 text-[11px] border border-brand-300 rounded-md bg-white focus:outline-none"
          >
            <option value="">— no client —</option>
            {options.map(c => (
              <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.code})` : c.code}</option>
            ))}
          </select>
          <button onClick={() => { setEditing(false); setErr(''); }} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
        </>
      ) : (
        <>
          {project.client ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-100">
              {project.client.name || project.client.code}
            </span>
          ) : (
            <span className="text-[11px] text-gray-300">none</span>
          )}
          {editable ? (
            <button onClick={() => setEditing(true)} title="Set the client for this project" className="text-gray-300 hover:text-brand-600">
              <Pencil size={11} />
            </button>
          ) : fromPatents ? (
            <span className="text-[10px] text-gray-400" title="Tagged patents decide the client — change them to change it">
              from patents
            </span>
          ) : null}
          {/* The hours are already being logged; without a client they reach no ledger. */}
          {!project.client && !fromPatents && (
            <span className="text-[10px] text-amber-600">· not in the client ledger</span>
          )}
        </>
      )}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}

function PatentTagsModal({ projectId, initial, alreadyTagged, onClose, onSaved }: {
  projectId: string;
  initial: string[];
  alreadyTagged: PatentOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');

  const { data: options = [], isLoading } = useQuery<PatentOption[]>({
    queryKey: ['patent-options-all'], queryFn: () => api.patents.options(),
  });

  // The options list omits archived clients' patents, so union it with what is already tagged.
  const all = useMemo(() => {
    const byId = new Map(alreadyTagged.map(p => [p.id, p]));
    for (const p of options) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.handle.localeCompare(b.handle));
  }, [options, alreadyTagged]);

  // Retired IDs match too — see lib/patent-search.
  const filtered = useMemo(() => all.filter(p => patentMatches(p, search)), [all, search]);

  /**
   * Searching by the REAL patent number, not just the handle.
   *
   * This picker only ever matched handles, which assumes the person already knows which handle
   * they want — and "which handle do I want" is precisely the thing they came here not knowing.
   * An analyst holding US 10,123,456 had no way in. The server answers only for patents on
   * projects they are already on, so the search cannot be used to discover the firm's portfolio.
   *
   * Only fired for something that looks like a number: a handle search would otherwise cost a
   * round trip and an audit-log entry on every keystroke.
   */
  const looksLikeNumber = search.trim().length >= 3 && /\d/.test(search);
  const { data: byNumber } = useQuery<PatentNumberLookup>({
    queryKey: ['patent-by-number', search.trim()],
    queryFn: () => api.patentNumbers.findByNumber(search.trim()),
    enabled: looksLikeNumber,
    staleTime: 60_000,
    retry: false,
  });
  const numberHits = useMemo(
    () => new Map((byNumber?.results ?? []).map(r => [r.id, r.realNumber])),
    [byNumber],
  );
  // A number match may point at a patent the handle filter has excluded — that is the whole point
  // of the lookup, so it is unioned in rather than intersected.
  const shown = useMemo(() => {
    const byId = new Map(filtered.map(p => [p.id, p]));
    for (const r of byNumber?.results ?? []) {
      if (!byId.has(r.id)) {
        const known = all.find(p => p.id === r.id);
        if (known) byId.set(r.id, known);
      }
    }
    return [...byId.values()].sort((a, b) => a.handle.localeCompare(b.handle));
  }, [filtered, byNumber, all]);

  const save = useMutation({
    mutationFn: () => api.projects.setPatents(projectId, picked),
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Could not save.'),
  });

  const toggle = (id: string) => setPicked(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            Patents on this project
            {picked.length > 0 && <span className="ml-1.5 text-xs font-normal text-brand-600">· {picked.length} selected</span>}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>

        <div className="relative border-b border-gray-100">
          <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by patent ID or patent number…"
            className="w-full pl-9 pr-3 py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
          {isLoading ? (
            <p className="px-4 py-4 text-xs text-gray-400">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-5 text-xs text-gray-400 text-center">
              {all.length === 0
                ? 'No patents registered yet.'
                : looksLikeNumber
                  ? `Nothing you can see matches “${search}”. If that patent is with another team, ask them for its ID.`
                  : `No patents match “${search}”.`}
            </p>
          ) : shown.map(p => (
            <label key={p.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm font-mono text-gray-700">{p.handle}</span>
              {/* Only shown for a patent the number search actually matched — the point is to
                  confirm "yes, this handle is the patent you typed", not to list every number. */}
              {numberHits.get(p.id) && (
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {numberHits.get(p.id)}
                </span>
              )}
              {matchedFormerHandle(p, search) && (
                <span className="text-[11px] text-gray-400">was {matchedFormerHandle(p, search)}</span>
              )}
            </label>
          ))}
        </div>

        {/* The server enforces this; saying it up front stops the attempt being a surprise. */}
        <p className="px-5 pt-3 text-[11px] text-gray-400">
          All patents on a project must belong to the same client.
        </p>
        {err && <p className="px-5 pt-2 text-xs text-red-600">{err}</p>}

        <div className="px-5 py-3.5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); save.mutate(); }}
            disabled={save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
