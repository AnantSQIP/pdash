'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Lock, Loader, Pencil, MapPin, Phone, HeartPulse, Briefcase, ShieldAlert } from 'lucide-react';
import { api, BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, type UserProfile, type ProfileInput } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/date';

const input =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={14} className="text-gray-400" />
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h4>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

function addressOf(p: UserProfile, kind: 'current' | 'permanent') {
  const g = (k: string) => (p as Record<string, unknown>)[`${kind}${k}`] as string | null | undefined;
  return [g('Line1'), g('Line2'), g('City'), g('State'), g('PostalCode'), g('Country')]
    .filter(Boolean).join(', ');
}

/**
 * A person's profile.
 *
 * The PERSONAL block renders only when the server actually sent those fields — that is the
 * exact permission signal, because it omits the keys entirely for anyone without
 * profile.view.personal. We never receive a home address we aren't allowed to see, so there
 * is nothing here that could leak through a rendering mistake.
 */
export function ProfileCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<ProfileInput>({});
  const [busy, setBusy] = useState(false);

  const { data: p, isLoading, isError, error } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api.profile.get(userId),
    retry: false,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={18} className="animate-spin mr-2" /> Loading…</div>;
  }
  if (isError || !p) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldAlert size={30} className="text-gray-300 mb-2" />
        <p className="text-sm text-gray-600 font-medium">Profile not available</p>
        <p className="text-xs text-gray-400 mt-1">{error instanceof Error ? error.message : 'You may not view this profile.'}</p>
      </div>
    );
  }

  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  function startEdit() {
    const { canEdit: _c, canSeePersonal: _s, ...rest } = p as UserProfile;
    setF({
      phone: rest.phone ?? '', dateOfBirth: rest.dateOfBirth ? rest.dateOfBirth.slice(0, 10) : '',
      gender: rest.gender ?? '', bloodGroup: rest.bloodGroup ?? '', maritalStatus: rest.maritalStatus ?? '',
      nationality: rest.nationality ?? '', personalEmail: rest.personalEmail ?? '',
      alternatePhone: rest.alternatePhone ?? '',
      currentLine1: rest.currentLine1 ?? '', currentLine2: rest.currentLine2 ?? '',
      currentCity: rest.currentCity ?? '', currentState: rest.currentState ?? '',
      currentPostalCode: rest.currentPostalCode ?? '', currentCountry: rest.currentCountry ?? '',
      permanentSameAsCurrent: rest.permanentSameAsCurrent ?? false,
      permanentLine1: rest.permanentLine1 ?? '', permanentCity: rest.permanentCity ?? '',
      permanentState: rest.permanentState ?? '', permanentPostalCode: rest.permanentPostalCode ?? '',
      permanentCountry: rest.permanentCountry ?? '',
      emergencyName: rest.emergencyName ?? '', emergencyRelationship: rest.emergencyRelationship ?? '',
      emergencyPhone: rest.emergencyPhone ?? '',
    });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      await api.profile.update(userId, f);
      await qc.invalidateQueries({ queryKey: ['profile', userId] });
      toast('Profile updated', 'success');
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 space-y-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar user={p} size={52} />
          <div>
            <h3 className="text-lg font-bold text-gray-900">{p.firstName} {p.lastName}</h3>
            <p className="text-sm text-gray-500">{p.designation ?? '—'}{p.department ? ` · ${p.department.name}` : ''}</p>
            {!p.profileCompleted && (
              <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Has not completed their profile yet
              </span>
            )}
          </div>
        </div>
        {p.canEdit && !editing && (
          <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      <Block icon={Briefcase} title="Work">
        <Row label="Work email" value={p.email} />
        <Row label="Work phone" value={p.phone} />
        <Row label="Employee code" value={p.employeeCode} />
        <Row label="Joined" value={p.joiningDate ? formatDate(p.joiningDate, { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
        <Row label="Status" value={p.status} />
      </Block>

      {/* PERSONAL — the server sends these only to Admin/Super Admin/HR (or you, yourself). */}
      {p.canSeePersonal ? (
        editing ? (
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><label className="text-xs text-gray-500">Work phone</label><input className={input} value={f.phone ?? ''} onChange={set('phone')} /></div>
              <div><label className="text-xs text-gray-500">Alternate phone</label><input className={input} value={f.alternatePhone ?? ''} onChange={set('alternatePhone')} /></div>
              <div><label className="text-xs text-gray-500">Personal email</label><input className={input} value={f.personalEmail ?? ''} onChange={set('personalEmail')} /></div>
              <div><label className="text-xs text-gray-500">Date of birth</label><input type="date" className={input} value={f.dateOfBirth ?? ''} onChange={set('dateOfBirth')} /></div>
              <div><label className="text-xs text-gray-500">Gender</label>
                <select className={input} value={f.gender ?? ''} onChange={set('gender')}>
                  <option value="">—</option>{GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select></div>
              <div><label className="text-xs text-gray-500">Blood group</label>
                <select className={input} value={f.bloodGroup ?? ''} onChange={set('bloodGroup')}>
                  <option value="">—</option>{BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                </select></div>
              <div><label className="text-xs text-gray-500">Marital status</label>
                <select className={input} value={f.maritalStatus ?? ''} onChange={set('maritalStatus')}>
                  <option value="">—</option>{MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
                </select></div>
              <div><label className="text-xs text-gray-500">Nationality</label><input className={input} value={f.nationality ?? ''} onChange={set('nationality')} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-3"><label className="text-xs text-gray-500">Current address</label><input className={input} value={f.currentLine1 ?? ''} onChange={set('currentLine1')} /></div>
              <div><label className="text-xs text-gray-500">City</label><input className={input} value={f.currentCity ?? ''} onChange={set('currentCity')} /></div>
              <div><label className="text-xs text-gray-500">State</label><input className={input} value={f.currentState ?? ''} onChange={set('currentState')} /></div>
              <div><label className="text-xs text-gray-500">PIN</label><input className={input} value={f.currentPostalCode ?? ''} onChange={set('currentPostalCode')} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><label className="text-xs text-gray-500">Emergency name</label><input className={input} value={f.emergencyName ?? ''} onChange={set('emergencyName')} /></div>
              <div><label className="text-xs text-gray-500">Relationship</label><input className={input} value={f.emergencyRelationship ?? ''} onChange={set('emergencyRelationship')} /></div>
              <div><label className="text-xs text-gray-500">Emergency phone</label><input className={input} value={f.emergencyPhone ?? ''} onChange={set('emergencyPhone')} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {busy && <Loader size={13} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 border-t border-gray-100 pt-5">
            <div className="flex items-center gap-1.5 text-amber-600">
              <Lock size={12} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Private — HR &amp; admins only</span>
            </div>
            <Block icon={Phone} title="Private contact">
              <Row label="Personal email" value={p.personalEmail} />
              <Row label="Alternate phone" value={p.alternatePhone} />
              <Row label="Date of birth" value={p.dateOfBirth ? formatDate(p.dateOfBirth, { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
              <Row label="Gender" value={p.gender} />
              <Row label="Blood group" value={p.bloodGroup} />
              <Row label="Marital status" value={p.maritalStatus} />
              <Row label="Nationality" value={p.nationality} />
            </Block>
            <Block icon={MapPin} title="Address">
              <div className="col-span-2 sm:col-span-3"><Row label="Current" value={addressOf(p, 'current')} /></div>
              <div className="col-span-2 sm:col-span-3"><Row label="Permanent" value={addressOf(p, 'permanent')} /></div>
            </Block>
            <Block icon={HeartPulse} title="Emergency contact">
              <Row label="Name" value={p.emergencyName} />
              <Row label="Relationship" value={p.emergencyRelationship} />
              <Row label="Phone" value={p.emergencyPhone} />
            </Block>
          </div>
        )
      ) : (
        <div className="border-t border-gray-100 pt-5">
          <div className={clsx('flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5')}>
            <Lock size={14} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 leading-relaxed">
              Personal details — address, date of birth, emergency contact — are visible only to
              <strong className="text-gray-700"> HR and administrators</strong>. They are not sent to
              your browser at all.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
