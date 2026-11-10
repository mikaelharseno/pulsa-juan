import fs from 'fs';
import path from 'path';

import { randomCode } from '../lib/ids';
import { notFound } from '../lib/errors';

// Private files (KTP photos, selfies, live-check frames). Never under the public
// /uploads route: local disk at PRIVATE_UPLOADS_DIR, or a separate private S3
// bucket (S3_PRIVATE_BUCKET) when set. Read back only through signed-in admin
// routes. Keys are opaque ("kyc/<agentId>/<random>-ktp.jpg").

export const PRIVATE_UPLOADS_DIR = process.env.PRIVATE_UPLOADS_DIR || path.join(__dirname, '..', '..', 'private-uploads');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let s3: any = null;
function client() {
  if (s3) return s3;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

const useS3 = () => !!process.env.S3_PRIVATE_BUCKET;

function localPath(key: string) {
  const target = path.join(PRIVATE_UPLOADS_DIR, key);
  if (!target.startsWith(PRIVATE_UPLOADS_DIR + path.sep)) throw notFound('File tidak ditemukan');
  return target;
}

export async function putPrivate(folder: string, name: string, data: Buffer, contentType: string): Promise<string> {
  const safe = (v: string) => v.replace(/[^\w-]+/g, '-').slice(0, 60) || 'file';
  const ext = contentType === 'image/png' ? '.png' : contentType === 'image/webp' ? '.webp' : '.jpg';
  const key = `${folder.split('/').map(safe).join('/')}/${randomCode(16).toLowerCase()}-${safe(name)}${ext}`;
  if (useS3()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_PRIVATE_BUCKET, Key: key, Body: data, ContentType: contentType, CacheControl: 'private, no-store' }));
  } else {
    const target = localPath(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return key;
}

export async function getPrivate(key: string): Promise<{ data: Buffer; contentType: string }> {
  const contentType = key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  if (useS3()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: process.env.S3_PRIVATE_BUCKET, Key: key }));
      return { data: Buffer.from(await res.Body.transformToByteArray()), contentType };
    } catch {
      throw notFound('File tidak ditemukan');
    }
  }
  const target = localPath(key);
  if (!fs.existsSync(target)) throw notFound('File tidak ditemukan');
  return { data: fs.readFileSync(target), contentType };
}
