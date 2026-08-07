'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type TechnologyDomainDef } from '@/lib/api';

/**
 * The technology domain a project sits in — Medical, Automobile, Source Code and so on.
 *
 * Deliberately the same shape as the project-type picker, including "+ Add a new domain…" and
 * the save-for-everyone tick, because the two questions sit next to each other on the form and
 * behaving differently would be its own small puzzle to solve every time.
 *
 * Shared by the new-project form and the new-round form so the two cannot drift: a project
 * started under an existing PID asks for its domain exactly as a brand-new one does.
 */
export const CUSTOM_DOMAIN = '__custom_domain__';

export function useTechnologyDomains() {
  return useQuery<TechnologyDomainDef[]>({
    queryKey: ['technology-domains'],
    queryFn: () => api.projects.technologyDomains(),
    staleTime: 300_000,
  });
}

/**
 * Turn the picker's state into the two fields the API expects. Kept here rather than duplicated
 * in each form, so "what gets sent" has exactly one answer.
 */
export function domainPayload(value: string, customLabel: string, save: boolean): {
  technologyDomain?: string;
  customDomain?: { label: string; save?: boolean };
} {
  if (value === CUSTOM_DOMAIN) {
    const label = customLabel.trim();
    return label ? { customDomain: { label, save } } : {};
  }
  return value ? { technologyDomain: value } : {};
}

export function TechnologyDomainPicker({
  value, onChange, customLabel, onCustomLabel, save, onSave, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  customLabel: string;
  onCustomLabel: (v: string) => void;
  save: boolean;
  onSave: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { data: domains = [] } = useTechnologyDomains();

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">Technology domain</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50"
      >
        <option value="">Select a domain…</option>
        {domains.map(d => (
          <option key={d.value} value={d.value}>
            {d.label}{d.custom ? ' (custom)' : ''}
          </option>
        ))}
        <option value={CUSTOM_DOMAIN}>+ Add a new domain…</option>
      </select>

      {value === CUSTOM_DOMAIN ? (
        <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-3 space-y-2.5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              New domain name <span className="text-red-500">*</span>
            </label>
            <input
              value={customLabel}
              onChange={e => onCustomLabel(e.target.value)}
              placeholder="e.g. Artificial Intelligence"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox" checked={save} onChange={e => onSave(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Save this domain for everyone in the organisation (reusable later)
          </label>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 mt-1">
          The field the work is about — separate from the project type, which is the kind of study it is.
        </p>
      )}
    </div>
  );
}

/** Read-only label for a stored slug, for cards, tables and the ledger. */
export function domainLabelOf(value?: string | null, domains?: TechnologyDomainDef[]): string | null {
  if (!value) return null;
  const hit = domains?.find(d => d.value === value);
  if (hit) return hit.label;
  // An org's custom domain the caller has not loaded, or one saved then deactivated — the slug
  // still reads sensibly once the underscores are gone, which beats showing SOURCE_CODE raw.
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
