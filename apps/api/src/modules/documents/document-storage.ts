import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Pluggable blob storage for uploaded documents.
 *
 *  • driver = "disk" (DEFAULT — Contabo): bytes on a local/volume-mounted directory.
 *  • driver = "s3"   (AWS): bytes in an S3 bucket, so files survive redeploys and are shared
 *    across replicas (the ephemeral container FS on ECS/Fargate would otherwise lose them).
 *
 * The S3 SDK is loaded LAZILY via a dynamic import, so Contabo neither needs nor loads
 * `@aws-sdk/client-s3`. To use S3 on AWS: `npm i @aws-sdk/client-s3` in the image and set
 * DOCUMENT_STORAGE_DRIVER=s3 + DOCUMENT_S3_BUCKET (region/creds come from the task role or the
 * standard AWS_* env). Nothing here changes Contabo's behaviour.
 */
const DRIVER = (process.env.DOCUMENT_STORAGE_DRIVER || 'disk').toLowerCase();
const STORAGE_DIR = process.env.DOCUMENT_STORAGE_DIR || join(process.cwd(), '.data', 'documents');
const S3_BUCKET = process.env.DOCUMENT_S3_BUCKET || '';
const S3_PREFIX = process.env.DOCUMENT_S3_PREFIX || 'documents/';
// A non-literal specifier keeps TypeScript from resolving the optional dep at build time.
const AWS_S3_SDK = '@aws-sdk/client-s3';
const s3Key = (id: string) => `${S3_PREFIX}${id}`;

let s3ClientPromise: Promise<any> | null = null;
function s3Client(): Promise<any> {
  if (!s3ClientPromise) {
    s3ClientPromise = import(AWS_S3_SDK).then(({ S3Client }) => new S3Client({}));
  }
  return s3ClientPromise;
}

export const documentStorage = {
  driver: DRIVER,

  /** Persist bytes under `id`. Returns the storagePath to record, or null if it couldn't
   *  (the caller then falls back to a DB blob so an upload never fails outright). */
  async put(id: string, data: Buffer): Promise<string | null> {
    if (DRIVER === 's3') {
      try {
        const { PutObjectCommand } = await import(AWS_S3_SDK);
        await (await s3Client()).send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(id), Body: data }));
        return id;
      } catch {
        return null;
      }
    }
    try {
      await mkdir(STORAGE_DIR, { recursive: true });
      await writeFile(join(STORAGE_DIR, id), data);
      return id;
    } catch {
      return null;
    }
  },

  /** Read the bytes for a stored document. */
  async get(storagePath: string): Promise<Buffer> {
    if (DRIVER === 's3') {
      const { GetObjectCommand } = await import(AWS_S3_SDK);
      const res = await (await s3Client()).send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(storagePath) }));
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    return readFile(join(STORAGE_DIR, storagePath));
  },

  /** Best-effort delete of a stored document's bytes. */
  async delete(storagePath: string): Promise<void> {
    if (DRIVER === 's3') {
      try {
        const { DeleteObjectCommand } = await import(AWS_S3_SDK);
        await (await s3Client()).send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(storagePath) }));
      } catch { /* best-effort */ }
      return;
    }
    await unlink(join(STORAGE_DIR, storagePath)).catch(() => {});
  },
};
