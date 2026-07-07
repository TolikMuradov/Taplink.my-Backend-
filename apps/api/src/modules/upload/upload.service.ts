import sharp from 'sharp'
import { randomBytes } from 'crypto'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET, R2_BASE_URL } from './upload.client'
import { ErrorCodes } from '@taplink/validations'

// ─────────────────────────────────────────
// SABİTLER — görsel boyutları ve kurallar
// ─────────────────────────────────────────

export const UPLOAD_CONFIG = {
  avatar: {
    width:     400,
    height:    400,
    maxBytes:  5 * 1024 * 1024,   // 5MB
    fit:       'cover' as const,   // kırp, boşluk bırakma
  },
  background: {
    width:     1920,
    height:    1080,
    maxBytes:  10 * 1024 * 1024,  // 10MB
    fit:       'cover' as const,
  },
  card: {
    width:     800,
    height:    800,
    maxBytes:  5 * 1024 * 1024,   // 5MB
    fit:       'cover' as const,
  },
} as const

export type UploadType = keyof typeof UPLOAD_CONFIG

// İzin verilen MIME tipleri
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',   // animasyonlu GIF → ilk kare (sharp davranışı)
  'image/heic',  // iPhone fotoğrafları
  'image/heif',
])

// ─────────────────────────────────────────
// Benzersiz dosya yolu: "u_abc123/avatar/f4e2d1c0b9a8.webp"
// ─────────────────────────────────────────
function generateKey(userId: string, type: UploadType): string {
  const random = randomBytes(8).toString('hex')
  return `u_${userId}/${type}/${random}.webp`
}

// ─────────────────────────────────────────
// ANA FONKSİYON — Görsel işle ve R2'ye yükle
// ─────────────────────────────────────────

export async function processAndUpload(
  userId:    string,
  type:      UploadType,
  buffer:    Buffer,
  mimeType:  string
): Promise<{ url: string; key: string; error: string | null }> {

  // 1. MIME tipi kontrolü
  if (!ALLOWED_MIME.has(mimeType)) {
    return { url: '', key: '', error: ErrorCodes.INVALID_FILE_TYPE }
  }

  // 2. Boyut kontrolü
  const config = UPLOAD_CONFIG[type]
  if (buffer.length > config.maxBytes) {
    return { url: '', key: '', error: ErrorCodes.FILE_TOO_LARGE }
  }

  // 3. Sharp pipeline
  // NOT: Sharp varsayılan olarak çıktıya EXIF KOPYALAMAZ — yani withMetadata()
  // ÇAĞIRMAYARAK GPS/cihaz bilgisi otomatik strip edilir. (Doküman `.withMetadata(false)`
  // yazıyordu ama bu geçersiz bir çağrı; hiç çağırmamak doğru davranış.)
  // quality:75, effort:6 → SEA optimizasyonu (mobil data pahalı, her KB önemli).
  let processed: Buffer
  try {
    processed = await sharp(buffer)
      .resize(config.width, config.height, { fit: config.fit })
      .webp({ quality: 75, effort: 6 })
      .toBuffer()
  } catch {
    return { url: '', key: '', error: ErrorCodes.INVALID_FILE_TYPE }
  }

  // 4. R2'ye yükle
  const key = generateKey(userId, type)

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         key,
      Body:        processed,
      ContentType: 'image/webp',
      // Cache-Control: 1 yıl — dosya adı değişince cache otomatik geçersiz olur
      CacheControl: 'public, max-age=31536000, immutable',
    }))
  } catch {
    return { url: '', key: '', error: ErrorCodes.INTERNAL_ERROR }
  }

  const url = `${R2_BASE_URL}/${key}`
  return { url, key, error: null }
}

// ─────────────────────────────────────────
// ESKİ DOSYAYI SİL — URL'den key'i çıkarır ve R2'den siler
// ─────────────────────────────────────────
export async function deleteFromR2(fileUrl: string): Promise<void> {
  try {
    const key = fileUrl.replace(`${R2_BASE_URL}/`, '')
    if (!key || key === fileUrl) return  // farklı domain'den URL — silme

    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key:    key,
    }))
  } catch {
    // Silme hatası sessizce geçer — yükleme başarıyla devam eder
    console.error('[R2] Eski dosya silinemedi:', fileUrl)
  }
}
