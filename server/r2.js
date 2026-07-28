// Cloudflare R2 (S3-compatible) client + presigner.
//
// The instance is created lazily so the server can boot even if the R2
// env vars aren't set — falls back to local disk in that case (see
// files.js). This lets you run the app locally without R2 creds.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _client = null

// Returns { client, bucket } if R2 is configured; otherwise null.
export function getR2() {
  if (_client) return { client: _client, bucket: process.env.R2_BUCKET }
  const account = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return null
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  console.log(`[r2] configured for bucket "${bucket}"`)
  return { client: _client, bucket }
}

export function isR2Enabled() {
  return getR2() !== null
}

// Idempotent CORS setup. AnnotateImageModal fetches the presigned R2 URL
// with fetch() to get a blob for the canvas background — that's a
// cross-origin request from the app origin(s) below to r2.cloudflarestorage.com
// and needs an ACAO response, hence PutBucketCors.
// Set the ALLOWED_ORIGINS env var if you're hosting the app on additional
// origins (comma-separated).
export async function ensureCors() {
  const r2 = getR2()
  if (!r2) return
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const origins = Array.from(new Set([
    'http://16.54.34.31:3080',
    'http://localhost:3080',
    'http://localhost:5173',
    ...extra,
  ]))
  try {
    await r2.client.send(new PutBucketCorsCommand({
      Bucket: r2.bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: origins,
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
          MaxAgeSeconds: 3600,
        }],
      },
    }))
    console.log(`[r2] CORS configured for origins: ${origins.join(', ')}`)
  } catch (e) {
    console.warn('[r2] CORS setup failed:', e?.message || e)
  }
}

// Upload a Buffer as an R2 object. Returns the object key.
export async function putObject(key, body, contentType) {
  const r2 = getR2()
  if (!r2) throw new Error('R2 not configured')
  await r2.client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }))
  return key
}

// Delete an R2 object. Best-effort — swallows NotFound.
export async function deleteObject(key) {
  const r2 = getR2()
  if (!r2) return
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }))
  } catch (e) {
    if (!/NotFound|NoSuchKey/i.test(e.name || e.message || '')) throw e
  }
}

// Presigned GET URL — the iPad fetches the object directly from Cloudflare
// edge without proxying through Express. Default 15 min expiry which is
// plenty for the client to load an image or download a PDF.
export async function presignGet(key, { expiresIn = 900, filename, contentType } = {}) {
  const r2 = getR2()
  if (!r2) throw new Error('R2 not configured')
  const cmd = new GetObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    // Force browser to inline instead of download if we know the mime type.
    // Filename gets attached so downloads keep their original name.
    ResponseContentDisposition: filename
      ? `inline; filename="${filename.replace(/"/g, '')}"`
      : undefined,
    ResponseContentType: contentType || undefined,
  })
  return await getSignedUrl(r2.client, cmd, { expiresIn })
}
