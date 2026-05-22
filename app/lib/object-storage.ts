import 'server-only';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_REGION = 'us-east-1';
const bucketCheckCache = new Set<string>();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi.`);
  }

  return value;
}

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: getRequiredEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION || DEFAULT_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
}

async function ensureBucket(bucket: string): Promise<void> {
  if (bucketCheckCache.has(bucket)) {
    return;
  }

  const client = getS3Client();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  bucketCheckCache.add(bucket);
}

async function bodyToArrayBuffer(body: {
  transformToByteArray?: () => Promise<Uint8Array>;
  transformToWebStream?: () => ReadableStream;
}): Promise<ArrayBuffer> {
  if ('transformToByteArray' in body && typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return new Uint8Array(bytes).buffer;
  }

  if ('transformToWebStream' in body && typeof body.transformToWebStream === 'function') {
    return new Response(body.transformToWebStream()).arrayBuffer();
  }

  throw new Error('Response object storage tidak dapat dibaca.');
}

export async function uploadObject(input: {
  bucket: string;
  path: string;
  body: Buffer | Uint8Array | ArrayBuffer;
  contentType?: string;
}): Promise<void> {
  await ensureBucket(input.bucket);

  await getS3Client().send(new PutObjectCommand({
    Bucket: input.bucket,
    Key: input.path,
    Body: input.body instanceof ArrayBuffer ? new Uint8Array(input.body) : input.body,
    ContentType: input.contentType,
  }));
}

export async function createObjectSignedUrl(bucket: string, path: string, expiresIn = 60 * 60): Promise<string | null> {
  if (!bucket || !path) {
    return null;
  }

  try {
    await ensureBucket(bucket);
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({ Bucket: bucket, Key: path }),
      { expiresIn },
    );
  } catch {
    return null;
  }
}

export async function downloadObject(bucket: string, path: string): Promise<Blob> {
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: path }));

  if (!response.Body) {
    throw new Error('Object storage kosong.');
  }

  return new Blob([await bodyToArrayBuffer(response.Body)], {
    type: response.ContentType || 'application/octet-stream',
  });
}

export async function removeObject(bucket: string, path: string): Promise<void> {
  if (!bucket || !path) {
    return;
  }

  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
}

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  const keys = Array.from(new Set(paths.map((path) => String(path || '').trim()).filter(Boolean)));

  if (!bucket || !keys.length) {
    return;
  }

  await getS3Client().send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
      Quiet: true,
    },
  }));
}
