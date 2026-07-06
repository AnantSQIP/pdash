'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Loader, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { fullName } from '@/lib/avatar';
import { fileToAvatarDataUrl } from '@/lib/image';
import { Avatar } from './Avatar';

export function ProfilePhotoCard() {
  const { currentUser } = useOrg();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Invalidate only the user-backed queries (org-context + people + members lists
  // all key on ['users', orgId]) so the new photo shows wherever an avatar appears.
  const refreshEverywhere = () => qc.invalidateQueries({ queryKey: ['users'] });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256);
      await api.users.setMyPhoto(dataUrl);
      await refreshEverywhere();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function remove() {
    setBusy(true); setErr('');
    try { await api.users.setMyPhoto(null); await refreshEverywhere(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to remove'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Your profile</h2>
      <div className="flex items-center gap-4">
        <Avatar user={currentUser} size={72} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{fullName(currentUser)}</p>
          <p className="text-xs text-gray-500 mb-2 truncate">{currentUser?.email}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />} {currentUser?.profilePhoto ? 'Change photo' : 'Upload photo'}
            </button>
            {currentUser?.profilePhoto && (
              <button onClick={remove} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
          <p className="text-[11px] text-gray-400 mt-2">Shown across the system. Auto-cropped to a square; if removed, your initials are shown.</p>
        </div>
      </div>
    </div>
  );
}
