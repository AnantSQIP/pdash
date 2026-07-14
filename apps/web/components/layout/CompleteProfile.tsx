'use client';

import { useState } from 'react';
import { UserCircle, Loader, MapPin, Phone, HeartPulse, ShieldCheck } from 'lucide-react';
import { api, BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, type ProfileInput } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const input =
  'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
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
 * Blocking screen shown on a new joiner's first sign-in (profileCompleted === false).
 *
 * They cannot reach the app until their joining details are recorded. Runs AFTER the forced
 * password change, so the order is: set your own password -> tell us who you are -> app.
 */
export function CompleteProfile() {
  const { user, logout, refresh } = useAuth();
  const [f, setF] = useState<ProfileInput>({ permanentSameAsCurrent: true, currentCountry: 'India' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  // Only the things HR genuinely needs are mandatory — everything else can follow later.
  const required: (keyof ProfileInput)[] = [
    'dateOfBirth', 'phone', 'currentLine1', 'currentCity', 'currentState', 'currentPostalCode',
    'emergencyName', 'emergencyRelationship', 'emergencyPhone',
  ];
  const missing = required.filter(k => !String(f[k] ?? '').trim());
  const permanentNeeded = !f.permanentSameAsCurrent;
  const permanentMissing = permanentNeeded && !String(f.permanentLine1 ?? '').trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length || permanentMissing) { setErr('Please complete every required field.'); return; }
    setBusy(true); setErr('');
    try {
      await api.profile.updateMe(f);
      await refresh();  // profileCompleted is now true — the app unblocks
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save your details.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full w-full overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white grid place-items-center mb-3">
            <UserCircle size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Welcome, {user?.firstName}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-md">
            Before you start, we need a few details for your employee record. This is a one-time step.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-7 space-y-5">
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
            <ShieldCheck size={15} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-800 leading-relaxed">
              Your address, date of birth and emergency contact are <strong>private</strong>. Only
              HR and administrators can see them — your manager and colleagues cannot.
            </p>
          </div>

          <Section icon={Phone} title="Contact" note="Your work email is already on file.">
            <Field label="Work / primary phone" required>
              <input value={f.phone ?? ''} onChange={set('phone')} placeholder="9876543210" className={input} />
            </Field>
            <Field label="Alternate phone">
              <input value={f.alternatePhone ?? ''} onChange={set('alternatePhone')} className={input} />
            </Field>
            <Field label="Personal email">
              <input type="email" value={f.personalEmail ?? ''} onChange={set('personalEmail')}
                placeholder="you@gmail.com" className={input} />
            </Field>
            <Field label="Date of birth" required>
              <input type="date" value={f.dateOfBirth ?? ''} onChange={set('dateOfBirth')} className={input} />
            </Field>
          </Section>

          <Section icon={HeartPulse} title="Personal">
            <Field label="Gender">
              <select value={f.gender ?? ''} onChange={set('gender')} className={input}>
                <option value="">Select…</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Blood group">
              <select value={f.bloodGroup ?? ''} onChange={set('bloodGroup')} className={input}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Marital status">
              <select value={f.maritalStatus ?? ''} onChange={set('maritalStatus')} className={input}>
                <option value="">Select…</option>
                {MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Nationality">
              <input value={f.nationality ?? ''} onChange={set('nationality')} placeholder="Indian" className={input} />
            </Field>
          </Section>

          <Section icon={MapPin} title="Current address">
            <div className="sm:col-span-2">
              <Field label="Address line 1" required>
                <input value={f.currentLine1 ?? ''} onChange={set('currentLine1')} className={input} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address line 2">
                <input value={f.currentLine2 ?? ''} onChange={set('currentLine2')} className={input} />
              </Field>
            </div>
            <Field label="City" required>
              <input value={f.currentCity ?? ''} onChange={set('currentCity')} className={input} />
            </Field>
            <Field label="State" required>
              <input value={f.currentState ?? ''} onChange={set('currentState')} className={input} />
            </Field>
            <Field label="PIN / postal code" required>
              <input value={f.currentPostalCode ?? ''} onChange={set('currentPostalCode')} className={input} />
            </Field>
            <Field label="Country">
              <input value={f.currentCountry ?? ''} onChange={set('currentCountry')} className={input} />
            </Field>
          </Section>

          <Section icon={MapPin} title="Permanent address">
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!f.permanentSameAsCurrent}
                  onChange={e => setF(p => ({ ...p, permanentSameAsCurrent: e.target.checked }))}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Same as my current address
              </label>
            </div>
            {permanentNeeded && (
              <>
                <div className="sm:col-span-2">
                  <Field label="Address line 1" required>
                    <input value={f.permanentLine1 ?? ''} onChange={set('permanentLine1')} className={input} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Address line 2">
                    <input value={f.permanentLine2 ?? ''} onChange={set('permanentLine2')} className={input} />
                  </Field>
                </div>
                <Field label="City"><input value={f.permanentCity ?? ''} onChange={set('permanentCity')} className={input} /></Field>
                <Field label="State"><input value={f.permanentState ?? ''} onChange={set('permanentState')} className={input} /></Field>
                <Field label="PIN / postal code"><input value={f.permanentPostalCode ?? ''} onChange={set('permanentPostalCode')} className={input} /></Field>
                <Field label="Country"><input value={f.permanentCountry ?? ''} onChange={set('permanentCountry')} className={input} /></Field>
              </>
            )}
          </Section>

          <Section icon={HeartPulse} title="Emergency contact" note="Who we should call if something happens to you at work.">
            <Field label="Full name" required>
              <input value={f.emergencyName ?? ''} onChange={set('emergencyName')} className={input} />
            </Field>
            <Field label="Relationship" required>
              <input value={f.emergencyRelationship ?? ''} onChange={set('emergencyRelationship')}
                placeholder="Mother, Spouse…" className={input} />
            </Field>
            <Field label="Phone" required>
              <input value={f.emergencyPhone ?? ''} onChange={set('emergencyPhone')} className={input} />
            </Field>
          </Section>

          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">
              Sign out
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
            >
              {busy && <Loader size={15} className="animate-spin" />}
              Save and continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
