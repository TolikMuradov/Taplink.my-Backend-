import { S3Client } from '@aws-sdk/client-s3'

// R2, Amazon S3 ile uyumlu API sunar.
// Endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
// Region her zaman 'auto' — R2'de bölge seçimi yok.

if (!process.env.R2_ACCOUNT_ID)        throw new Error('R2_ACCOUNT_ID eksik')
if (!process.env.R2_ACCESS_KEY_ID)     throw new Error('R2_ACCESS_KEY_ID eksik')
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY eksik')

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

export const R2_BUCKET   = process.env.R2_BUCKET_NAME!
export const R2_BASE_URL = process.env.R2_PUBLIC_URL!
