// Shared helpers for files & attachments (sizes, kinds, upload limits).

/** Mirrors the API cap (documents.service MAX_FILE_BYTES). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export function formatBytes(n?: number | null): string {
  const v = n ?? 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime?: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

export type FileKind = 'image' | 'pdf' | 'sheet' | 'doc' | 'archive' | 'video' | 'audio' | 'other';

/** Coarse type bucket for icon/colour selection. */
export function fileKind(mime?: string | null, name?: string): FileKind {
  const m = (mime ?? '').toLowerCase();
  const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.includes('spreadsheet') || m.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (m.includes('word') || m.includes('presentation') || m.startsWith('text/') || ['doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'rtf'].includes(ext)) return 'doc';
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar') || ['zip', 'rar', '7z', 'gz'].includes(ext)) return 'archive';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'other';
}
