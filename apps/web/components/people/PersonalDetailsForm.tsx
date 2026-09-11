'use client';

/**
 * The employee-record fields, and the rules for what counts as a valid one.
 *
 * These used to live inside CompleteProfile — the blocking first-login form — which was fine for
 * as long as that form was the only way the data ever arrived. It isn't any more: the gate is
 * gone and HR now types the same details when it creates the account. Two forms for one record is
 * how the two quietly stop agreeing about what a phone number is, so there is one set of fields
 * and one set of checks, used by both.
 *
 * The checks mirror the server's (ProfileService.update) rather than inventing stricter ones. An
 * empty value is NOT a format error here — whether a blank is allowed is the caller's decision
 * (`requireAll`), because HR filling in a new joiner genuinely may not know their blood group yet,
 * while somebody completing their own record is being asked for all of it.
 */

import { BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, type ProfileInput } from '@/lib/api';
import { MapPin, Phone, HeartPulse } from 'lucide-react';
import { todayIST } from '@/lib/date';

export const inputCls =
  'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition';

const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_RE = /^\d{6}$/;

/** Indian mobile, tolerating the +91 / leading-0 shapes people actually paste. */
export function normPhone(v?: string | null) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export const phoneErr = (v?: string | null) => {
  const s = String(v ?? '').trim();
  return !s || PHONE_RE.test(normPhone(s)) ? '' : 'Enter a valid 10-digit mobile number';
};
export const pinErr = (v?: string | null) => {
  const s = String(v ?? '').trim();
  return !s || PIN_RE.test(s.replace(/\s/g, '')) ? '' : 'Enter a valid 6-digit PIN';
};
export const dobErr = (v?: string | null) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) return 'Enter a valid date';
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  return age < 15 || age > 100 ? 'Check the year' : '';
};

/**
 * What the server considers a COMPLETE record — the same list ProfileService.update() uses to
 * decide whether to stamp `profileCompletedAt`. Not a condition on saving any more; it is what
 * "complete your profile" means when someone chooses to.
 */
export const REQUIRED_PROFILE_FIELDS: (keyof ProfileInput)[] = [
  'dateOfBirth', 'phone', 'currentLine1', 'currentCity', 'currentState', 'currentPostalCode',
  'emergencyName', 'emergencyRelationship', 'emergencyPhone',
];

export function missingRequired(f: ProfileInput): (keyof ProfileInput)[] {
  const missing = REQUIRED_PROFILE_FIELDS.filter(k => !String(f[k] ?? '').trim());
  if (!f.permanentSameAsCurrent && !String(f.permanentLine1 ?? '').trim()) missing.push('permanentLine1');
  return missing;
}

export type ProfileFieldErrors = Record<string, string>;

export function fieldErrorsFor(f: ProfileInput): ProfileFieldErrors {
  return {
    phone: phoneErr(f.phone),
    alternatePhone: phoneErr(f.alternatePhone),
    emergencyPhone: phoneErr(f.emergencyPhone),
    currentPostalCode: pinErr(f.currentPostalCode),
    permanentPostalCode: f.permanentSameAsCurrent ? '' : pinErr(f.permanentPostalCode),
    dateOfBirth: dobErr(f.dateOfBirth),
  };
}

export const hasFormatError = (errors: ProfileFieldErrors) => Object.values(errors).some(Boolean);

export function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, note, children }: {
  icon: React.ElementType; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-100 pt-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {note && <p className="text-xs text-gray-400 mb-3">{note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">{children}</div>
    </section>
  );
}

/**
 * Every field of the employee record.
 *
 * `requireAll` only controls the asterisks and the caller's own submit gating — it changes nothing
 * about what the server accepts, which is "anything well-formed".
 */
export function PersonalDetailsFields({ f, onChange, requireAll = false }: {
  f: ProfileInput;
  onChange: (next: ProfileInput) => void;
  requireAll?: boolean;
}) {
  const errors = fieldErrorsFor(f);
  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...f, [k]: e.target.value });
  const permanentNeeded = !f.permanentSameAsCurrent;

  return (
    <>
      <Section icon={Phone} title="Contact" note="The work email is already on file.">
        <Field label="Work / primary phone" required={requireAll} error={errors.phone}>
          <input value={f.phone ?? ''} onChange={set('phone')} placeholder="9876543210" inputMode="tel" className={inputCls} />
        </Field>
        <Field label="Alternate phone" error={errors.alternatePhone}>
          <input value={f.alternatePhone ?? ''} onChange={set('alternatePhone')} placeholder="9876543210" inputMode="tel" className={inputCls} />
        </Field>
        <Field label="Personal email">
          <input type="email" value={f.personalEmail ?? ''} onChange={set('personalEmail')} placeholder="name@gmail.com" className={inputCls} />
        </Field>
        <Field label="Date of birth" required={requireAll} error={errors.dateOfBirth}>
          <input type="date" value={f.dateOfBirth ?? ''} onChange={set('dateOfBirth')} max={todayIST()} className={inputCls} />
        </Field>
      </Section>

      <Section icon={HeartPulse} title="Personal">
        <Field label="Gender">
          <select value={f.gender ?? ''} onChange={set('gender')} className={inputCls}>
            <option value="">Select…</option>
            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Blood group">
          <select value={f.bloodGroup ?? ''} onChange={set('bloodGroup')} className={inputCls}>
            <option value="">Select…</option>
            {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Marital status">
          <select value={f.maritalStatus ?? ''} onChange={set('maritalStatus')} className={inputCls}>
            <option value="">Select…</option>
            {MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        {f.maritalStatus === 'Married' && (
          <Field label="Wedding anniversary">
            <input type="date" value={f.weddingAnniversary ?? ''} onChange={set('weddingAnniversary')} max={todayIST()} className={inputCls} />
          </Field>
        )}
        <Field label="Nationality">
          <input value={f.nationality ?? ''} onChange={set('nationality')} placeholder="Indian" className={inputCls} />
        </Field>
      </Section>

      <Section icon={MapPin} title="Current address">
        <div className="sm:col-span-2">
          <Field label="Address line 1" required={requireAll}>
            <input value={f.currentLine1 ?? ''} onChange={set('currentLine1')} className={inputCls} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Address line 2">
            <input value={f.currentLine2 ?? ''} onChange={set('currentLine2')} className={inputCls} />
          </Field>
        </div>
        <Field label="City" required={requireAll}>
          <input value={f.currentCity ?? ''} onChange={set('currentCity')} className={inputCls} />
        </Field>
        <Field label="State" required={requireAll}>
          <input value={f.currentState ?? ''} onChange={set('currentState')} className={inputCls} />
        </Field>
        <Field label="PIN / postal code" required={requireAll} error={errors.currentPostalCode}>
          <input value={f.currentPostalCode ?? ''} onChange={set('currentPostalCode')} placeholder="560001" inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Country">
          <input value={f.currentCountry ?? ''} onChange={set('currentCountry')} className={inputCls} />
        </Field>
      </Section>

      <Section icon={MapPin} title="Permanent address">
        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.permanentSameAsCurrent}
              onChange={e => onChange({ ...f, permanentSameAsCurrent: e.target.checked })}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Same as the current address
          </label>
        </div>
        {permanentNeeded && (
          <>
            <div className="sm:col-span-2">
              <Field label="Address line 1" required={requireAll}>
                <input value={f.permanentLine1 ?? ''} onChange={set('permanentLine1')} className={inputCls} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address line 2">
                <input value={f.permanentLine2 ?? ''} onChange={set('permanentLine2')} className={inputCls} />
              </Field>
            </div>
            <Field label="City"><input value={f.permanentCity ?? ''} onChange={set('permanentCity')} className={inputCls} /></Field>
            <Field label="State"><input value={f.permanentState ?? ''} onChange={set('permanentState')} className={inputCls} /></Field>
            <Field label="PIN / postal code" error={errors.permanentPostalCode}>
              <input value={f.permanentPostalCode ?? ''} onChange={set('permanentPostalCode')} placeholder="560001" inputMode="numeric" className={inputCls} />
            </Field>
            <Field label="Country"><input value={f.permanentCountry ?? ''} onChange={set('permanentCountry')} className={inputCls} /></Field>
          </>
        )}
      </Section>

      <Section icon={HeartPulse} title="Emergency contact" note="Who to call if something happens at work.">
        <Field label="Full name" required={requireAll}>
          <input value={f.emergencyName ?? ''} onChange={set('emergencyName')} className={inputCls} />
        </Field>
        <Field label="Relationship" required={requireAll}>
          <input value={f.emergencyRelationship ?? ''} onChange={set('emergencyRelationship')} placeholder="Mother, Spouse…" className={inputCls} />
        </Field>
        <Field label="Phone" required={requireAll} error={errors.emergencyPhone}>
          <input value={f.emergencyPhone ?? ''} onChange={set('emergencyPhone')} placeholder="9876543210" inputMode="tel" className={inputCls} />
        </Field>
      </Section>
    </>
  );
}
