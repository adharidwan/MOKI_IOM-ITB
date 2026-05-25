/* eslint-disable @typescript-eslint/no-require-imports */
const {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const bucketCheckCache = new Set();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getS3Client() {
  return new S3Client({
    endpoint: getRequiredEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
}

async function ensureBucket(bucket) {
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

async function uploadObject({ bucket, path, body, contentType }) {
  await ensureBucket(bucket);
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    Body: body,
    ContentType: contentType,
  }));
}

async function downloadObjectBuffer(bucket, path) {
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: path }));

  if (!response.Body) {
    throw new Error('Object storage response body is empty.');
  }

  if (typeof response.Body.transformToByteArray === 'function') {
    return Buffer.from(await response.Body.transformToByteArray());
  }

  if (typeof response.Body.transformToWebStream === 'function') {
    const arrayBuffer = await new Response(response.Body.transformToWebStream()).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('Object storage response body is not readable.');
}

module.exports = {
  downloadObjectBuffer,
  uploadObject,
};
