/**
 * TECHNOLOGY DOMAINS — the field a piece of work sits in.
 *
 * Distinct from the project TYPE, and deliberately so: the type says what kind of study it is
 * (FTO, Invalidity, Claim Chart …), the domain says what subject it is about (Medical,
 * Automobile, Source Code …). The same FTO search can be about a pacemaker or a gearbox, and a
 * patent team searches along both axes — "show me our source-code work", "show me every FTO".
 *
 * These are the starting set. An organisation adds its own through the create-project form and
 * saves them, exactly as it does with custom project types; the saved ones live in the
 * TechnologyDomain table and are merged into this list per organisation.
 */
export type TechnologyDomainDef = {
  /** Stable slug stored on Project.technologyDomain. Never shown to a person. */
  value: string;
  /** What people actually read. */
  label: string;
  /** True for an organisation's own saved domain rather than one of these built-ins. */
  custom?: boolean;
};

/**
 * Alphabetical by label, because this is a lookup list rather than a ranked one — somebody
 * scanning for "Medical" should find it where the alphabet says it is. The API keeps custom
 * domains in the same order for the same reason.
 */
export const TECHNOLOGY_DOMAINS: TechnologyDomainDef[] = [
  { value: 'ADVERTISEMENT', label: 'Advertisement' },
  { value: 'AUTOMOBILE',    label: 'Automobile' },
  { value: 'CLOUD_SERVER',  label: 'Cloud / Server' },
  { value: 'MEDICAL',       label: 'Medical' },
  { value: 'SOURCE_CODE',   label: 'Source Code' },
];

export const TECHNOLOGY_DOMAIN_VALUES: string[] = TECHNOLOGY_DOMAINS.map(d => d.value);

/** A built-in domain by value, or null if it is custom (or nothing). */
export function builtInDomain(value?: string | null): TechnologyDomainDef | null {
  if (!value) return null;
  return TECHNOLOGY_DOMAINS.find(d => d.value === value) ?? null;
}

/**
 * A stable slug for a domain somebody typed. Mirrors how a custom project type is slugged, so
 * the two behave identically: upper-cased, punctuation collapsed to underscores, length-capped.
 * "Cloud / Server" and "cloud server" therefore land on the same value and cannot be saved twice.
 */
export function slugifyDomain(label: string): string {
  const slug = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return slug || 'DOMAIN';
}

/** Human label for a stored value — falls back to a readable form of an unknown slug. */
export function domainLabel(value?: string | null): string | null {
  if (!value) return null;
  const hit = builtInDomain(value);
  if (hit) return hit.label;
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
