'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCircle, Loader, ShieldCheck, ArrowLeft } from 'lucide-react';
import { api, type ProfileInput } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/ui/Toast';
import {
  PersonalDetailsFields, fieldErrorsFor, hasFormatError, missingRequired,
} from '@/components/people/PersonalDetailsForm';

/**
 * "Complete your profile" — the guided form for your own employee record.
 *
 * This was the blocking screen a new joiner hit on their first sign-in: no address, no app. The
 * gate was removed on the owner's instruction (review of 2026-09) — the record belongs to HR's
 * workflow, and HR now fills it in when it creates the account. The form survives on its own
 * route (/profile/complete) so that nobody LOST the ability to fill their own details in; it is
 * simply nobody's toll booth now.
 *
 * Two consequences of being voluntary rather than compulsory:
 *   - it loads what is already stored, because you can now come back to it, and a form that
 *     silently blanked the half HR had already typed would be worse than no form;
 *   - it can be left half-finished. The required markers say what a COMPLETE record is (the same
 *     list the server uses to stamp `profileCompletedAt`); they no longer stop you saving.
 */
export function CompleteProfile() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<ProfileInput>({ permanentSameAsCurrent: true, currentCountry: 'India' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Your own profile always comes back in full — no permission involved in reading yourself.
  const { data: stored, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => api.profile.me(),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!stored) return;
    setF({
      phone: stored.phone ?? '',
      dateOfBirth: stored.dateOfBirth ? stored.dateOfBirth.slice(0, 10) : '',
      gender: stored.gender ?? '', bloodGroup: stored.bloodGroup ?? '',
      maritalStatus: stored.maritalStatus ?? '',
      weddingAnniversary: stored.weddingAnniversary ? stored.weddingAnniversary.slice(0, 10) : '',
      nationality: stored.nationality ?? '', personalEmail: stored.personalEmail ?? '',
      alternatePhone: stored.alternatePhone ?? '',
      currentLine1: stored.currentLine1 ?? '', currentLine2: stored.currentLine2 ?? '',
      currentCity: stored.currentCity ?? '', currentState: stored.currentState ?? '',
      currentPostalCode: stored.currentPostalCode ?? '', currentCountry: stored.currentCountry ?? 'India',
      permanentSameAsCurrent: stored.permanentSameAsCurrent ?? true,
      permanentLine1: stored.permanentLine1 ?? '', permanentLine2: stored.permanentLine2 ?? '',
      permanentCity: stored.permanentCity ?? '', permanentState: stored.permanentState ?? '',
      permanentPostalCode: stored.permanentPostalCode ?? '', permanentCountry: stored.permanentCountry ?? '',
      emergencyName: stored.emergencyName ?? '', emergencyRelationship: stored.emergencyRelationship ?? '',
      emergencyPhone: stored.emergencyPhone ?? '',
    });
  }, [stored]);

  const missing = missingRequired(f);
  const errors = fieldErrorsFor(f);
  const malformed = hasFormatError(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A malformed value is still refused — the server refuses it too, and a rejected save that
    // looked like it worked is the one failure mode worth guarding against here.
    if (malformed) { setErr('Please fix the highlighted fields.'); return; }
    setBusy(true); setErr('');
    try {
      await api.profile.updateMe(f);
      await qc.invalidateQueries({ queryKey: ['profile', user?.id] });
      await refresh();
      toast(missing.length ? 'Saved — some details are still blank' : 'Your details are saved', 'success');
      router.push('/settings');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save your details.');
      setBusy(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader size={18} className="animate-spin mr-2" /> Loading…</div>;
  }

  return (
    <div className="min-h-full w-full overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 mb-4">
          <ArrowLeft size={15} /> Back
        </button>

        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white grid place-items-center mb-3">
            <UserCircle size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {user?.firstName ? `Your details, ${user.firstName}` : 'Your details'}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-md">
            Your employee record. HR can fill this in for you — this page is here so you can do it
            yourself, or correct what is already there. Save as much or as little as you like.
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

          <PersonalDetailsFields f={f} onChange={setF} requireAll />

          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-gray-400">
              {missing.length === 0
                ? 'Everything HR needs is filled in.'
                : `${missing.length} field${missing.length === 1 ? '' : 's'} still blank — you can save anyway.`}
            </span>
            <button
              type="submit"
              disabled={busy || malformed}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
            >
              {busy && <Loader size={15} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
