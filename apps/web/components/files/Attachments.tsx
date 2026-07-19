'use client';

// Shared attachment UI: composer picker (paperclip + pending chips) and the
// rendered attachment list on messages/comments. Used by Discuss, the project
// Discussions tab, and the task panel's Comments tab.

import { useRef, useState, useCallback, type ChangeEvent, type ElementType } from 'react';
import clsx from 'clsx';
import {
  Paperclip, X, Loader, FileText, FileSpreadsheet, FileArchive, Film, Music, File as FileIcon, Download, Mic,
} from 'lucide-react';
import { api, type AttachmentRef, type DocumentRef } from '@/lib/api';
import { formatBytes, isImageMime, fileKind, MAX_FILE_BYTES, type FileKind } from '@/lib/files';

export const KIND_ICON: Record<FileKind, ElementType> = {
  image: FileIcon, pdf: FileText, sheet: FileSpreadsheet, doc: FileText,
  archive: FileArchive, video: Film, audio: Music, other: FileIcon,
};
export const KIND_COLOR: Record<FileKind, string> = {
  image: 'text-purple-500', pdf: 'text-red-500', sheet: 'text-green-600', doc: 'text-brand-600',
  archive: 'text-amber-600', video: 'text-pink-500', audio: 'text-teal-600', other: 'text-gray-400',
};

// ── Composer state: upload-on-pick, coalesced into documentIds for send ────────
export type PendingAttachment = DocumentRef & { uploading?: boolean; localKey: string };

export function useAttachmentUploads() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState('');

  const add = useCallback(async (files: FileList | File[]) => {
    setError('');
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is larger than 20 MB.`);
        continue;
      }
      const localKey = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending(prev => [...prev, { localKey, id: '', name: file.name, mimeType: file.type, fileSize: file.size, fileUrl: '', uploading: true }]);
      try {
        const doc = await api.documents.upload(file);
        setPending(prev => prev.map(p => (p.localKey === localKey ? { ...doc, localKey } : p)));
      } catch (e) {
        setPending(prev => prev.filter(p => p.localKey !== localKey));
        setError(e instanceof Error ? e.message : `Could not upload "${file.name}".`);
      }
    }
  }, []);

  const remove = useCallback((localKey: string) => {
    setPending(prev => {
      const item = prev.find(p => p.localKey === localKey);
      // Best-effort server cleanup of the staged upload.
      if (item?.id) api.documents.delete(item.id).catch(() => { /* ignore */ });
      return prev.filter(p => p.localKey !== localKey);
    });
  }, []);

  const clear = useCallback(() => { setPending([]); setError(''); }, []);

  const uploading = pending.some(p => p.uploading);
  const documentIds = pending.filter(p => !p.uploading && p.id).map(p => p.id);
  return { pending, add, remove, clear, uploading, documentIds, error, setError };
}

/** Paperclip button + hidden multi-file input. */
export function AttachButton({ onPick, disabled, title = 'Attach files' }: {
  onPick: (files: FileList) => void; disabled?: boolean; title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onPick(e.target.files);
    e.target.value = ''; // allow re-picking the same file
  }
  return (
    <>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={onChange} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title={title}
        aria-label={title}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40 shrink-0"
      >
        <Paperclip size={16} />
      </button>
    </>
  );
}

/**
 * Record a short voice note in the browser (MediaRecorder) and hand it to the composer
 * as a normal file upload — so it flows through the same attachment pipeline. No server
 * change: a voice clip is just an audio/webm attachment, rendered with an <audio> player.
 */
export function VoiceRecorderButton({ onRecorded, disabled }: {
  onRecorded: (files: File[]) => void; disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_SECONDS = 300; // 5-minute cap

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  async function start() {
    setError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) {
          const ext = type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-message-${Date.now()}.${ext}`, { type });
          onRecorded([file]);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => {
        if (s + 1 >= MAX_SECONDS) { stop(); return MAX_SECONDS; }
        return s + 1;
      }), 1000);
    } catch {
      setError('Microphone access was denied.');
    }
  }

  function stop() {
    stopTimer();
    setRecording(false);
    recRef.current?.state !== 'inactive' && recRef.current?.stop();
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <>
      {recording ? (
        <button
          type="button"
          onClick={stop}
          title="Stop and attach recording"
          aria-label="Stop recording"
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors shrink-0"
        >
          <span className="w-2 h-2 rounded-sm bg-red-600 animate-pulse" />
          <span className="tabular-nums">{mmss}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={start}
          title={error || 'Record a voice message'}
          aria-label="Record a voice message"
          className={clsx(
            'p-1.5 rounded-lg transition-colors disabled:opacity-40 shrink-0',
            error ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50',
          )}
        >
          <Mic size={16} />
        </button>
      )}
    </>
  );
}

/** Chips for staged (not yet sent) attachments in a composer. */
export function PendingAttachmentChips({ items, onRemove }: {
  items: PendingAttachment[]; onRemove: (localKey: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(p => {
        const kind = fileKind(p.mimeType, p.name);
        const Icon = KIND_ICON[kind];
        return (
          <span key={p.localKey} className="inline-flex items-center gap-1.5 max-w-[220px] pl-2 pr-1 py-1 rounded-lg bg-gray-100 border border-gray-200 text-xs text-gray-700">
            {p.uploading ? <Loader size={12} className="animate-spin text-gray-400 shrink-0" /> : <Icon size={13} className={clsx('shrink-0', KIND_COLOR[kind])} />}
            <span className="truncate">{p.name}</span>
            <span className="text-gray-400 shrink-0">{formatBytes(p.fileSize)}</span>
            <button type="button" onClick={() => onRemove(p.localKey)} aria-label={`Remove ${p.name}`} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 shrink-0">
              <X size={12} />
            </button>
          </span>
        );
      })}
    </div>
  );
}

const isAudioMime = (mime?: string | null) => !!mime && mime.startsWith('audio/');

/** Rendered attachments on a sent message/comment: inline image previews + file chips. */
export function AttachmentList({ attachments, className }: { attachments?: AttachmentRef[]; className?: string }) {
  const docs = (attachments ?? []).map(a => a.document).filter(Boolean);
  if (!docs.length) return null;
  const images = docs.filter(d => isImageMime(d.mimeType));
  const audios = docs.filter(d => isAudioMime(d.mimeType));
  const files = docs.filter(d => !isImageMime(d.mimeType) && !isAudioMime(d.mimeType));
  return (
    <div className={clsx('mt-1.5 space-y-1.5', className)}>
      {audios.map(d => (
        <div key={d.id} className="flex items-center gap-2 w-fit max-w-full pl-2.5 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
          <Mic size={16} className="text-teal-600 shrink-0" />
          <audio controls preload="metadata" src={d.fileUrl} className="h-9 max-w-[280px]" />
        </div>
      ))}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(d => (
            <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" title={`${d.name} · ${formatBytes(d.fileSize)}`} className="block group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.fileUrl}
                alt={d.name}
                loading="lazy"
                className="max-h-44 max-w-[260px] rounded-lg border border-gray-200 object-cover group-hover:brightness-95 transition"
              />
            </a>
          ))}
        </div>
      )}
      {files.map(d => {
        const kind = fileKind(d.mimeType, d.name);
        const Icon = KIND_ICON[kind];
        return (
          <a
            key={d.id}
            href={d.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 w-fit max-w-full pl-2.5 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors group"
          >
            <Icon size={17} className={clsx('shrink-0', KIND_COLOR[kind])} />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-gray-800 truncate max-w-[240px]">{d.name}</span>
              <span className="block text-[10px] text-gray-400">{formatBytes(d.fileSize)}</span>
            </span>
            <Download size={13} className="text-gray-300 group-hover:text-brand-500 shrink-0 ml-1" />
          </a>
        );
      })}
    </div>
  );
}
