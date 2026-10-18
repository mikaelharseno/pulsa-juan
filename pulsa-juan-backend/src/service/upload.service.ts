import fs from 'fs';
import path from 'path';

import { UploadedFile } from 'express-fileupload';
import sharp from 'sharp';

import { randomCode } from '../lib/ids';
import { badRequest } from '../lib/errors';

// Lifted from terbebas-backend/src/service/upload.service.ts: local disk
// (default) or S3-compatible driver, images re-encoded above 1MB.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COMPRESS_THRESHOLD_BYTES = 1 * 1024 * 1024;
const COMPRESS_MAX_DIMENSION = 2560;
const COMPRESS_JPEG_QUALITY = 75;
const COMPRESS_WEBP_QUALITY = 80;
const COMPRESSIBLE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

export const LOCAL_UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

type UploadDriver = 's3' | 'local';

function activeDriver(): UploadDriver {
  const forced = process.env.UPLOAD_DRIVER as UploadDriver | undefined;
  if (forced === 's3' || forced === 'local') return forced;
  return process.env.S3_BUCKET ? 's3' : 'local';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let s3Client: any = null;

async function uploadToS3(objectPath: string, file: UploadedFile): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  const publicBase = process.env.S3_PUBLIC_URL;
  if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error('Upload belum dikonfigurasi (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)');
  }
  if (!publicBase) throw new Error('S3_PUBLIC_URL wajib diisi');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
    });
  }
  const prefix = (process.env.S3_KEY_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
  const key = prefix ? prefix + '/' + objectPath : objectPath;
  const acl = process.env.S3_ACL;
  await s3Client!.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.data,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable',
      ...(acl ? { ACL: acl } : {}),
    }),
  );
  return publicBase.replace(/\/$/, '') + '/' + key;
}

function publicBase(): string {
  return (process.env.UPLOADS_PUBLIC_BASE ?? `http://localhost:${process.env.PORT || '3030'}`).replace(/\/$/, '');
}

function uploadToLocal(objectPath: string, file: UploadedFile): string {
  const target = path.join(LOCAL_UPLOADS_DIR, objectPath);
  if (!target.startsWith(LOCAL_UPLOADS_DIR)) throw new Error('Invalid upload path');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.data);
  return publicBase() + '/uploads/' + objectPath;
}

export async function maybeCompressImage(file: UploadedFile): Promise<UploadedFile> {
  if (!COMPRESSIBLE_MIME.has(file.mimetype) || file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  try {
    let usesAlpha = false;
    if ((await sharp(file.data).metadata()).hasAlpha) {
      const { channels } = await sharp(file.data).stats();
      const alpha = channels[channels.length - 1];
      usesAlpha = !!alpha && alpha.min < 255;
    }
    const resized = sharp(file.data)
      .rotate()
      .resize(COMPRESS_MAX_DIMENSION, COMPRESS_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    const data = usesAlpha
      ? await resized.webp({ quality: COMPRESS_WEBP_QUALITY }).toBuffer()
      : await resized.jpeg({ quality: COMPRESS_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    if (data.length >= file.size) return file;
    return { ...file, data, size: data.length, mimetype: usesAlpha ? 'image/webp' : 'image/jpeg' };
  } catch (error) {
    console.warn('Image compression failed, uploading original:', error);
    return file;
  }
}

export interface UploadOptions {
  /** Restrict accepted mime types (e.g. proof screenshots: jpeg/png only). */
  allowedMime?: string[];
  maxBytes?: number;
}

export async function uploadImage(folder: string, file: UploadedFile, opts: UploadOptions = {}): Promise<{ url: string }> {
  const allowed = opts.allowedMime ?? Object.keys(IMAGE_MIME);
  if (!allowed.includes(file.mimetype) || !IMAGE_MIME[file.mimetype]) {
    throw badRequest('Format file harus ' + allowed.map((m) => IMAGE_MIME[m]?.replace('.', '').toUpperCase() ?? m).join('/'));
  }
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;
  if (file.size > maxBytes) throw badRequest(`Ukuran gambar maksimal ${Math.round(maxBytes / (1024 * 1024))}MB`);

  const upload = await maybeCompressImage(file);
  const extension = IMAGE_MIME[upload.mimetype];
  const safeName =
    upload.name
      .replace(/\.[^.]*$/, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60) || 'media';
  const safeFolder = folder.replace(/[^\w-]+/g, '-');
  const objectPath = `${safeFolder}/${randomCode(12).toLowerCase()}-${safeName}${extension}`;
  if (activeDriver() === 's3') return { url: await uploadToS3(objectPath, upload) };
  return { url: uploadToLocal(objectPath, upload) };
}
