# Step 07 — Dosya Yükleme (Cloudflare R2)

**Bağımlılık:** Step 01–05 tamamlanmış olmalı. Step 06 bağımlılık değil ama card görseli yükleme Step 06 linkleriyle çalışır.  
**Sonraki Step:** Step 08 (Analytics), Step 09 (Public profil API) bu step'i kullanır.

---

## Amaç

Kullanıcının avatar, profil arkaplanı ve card görsellerini yüklemesini sağlamak. Bu step bittiğinde:

- Kullanıcı avatar ve arkaplan yükleyebilir → R2'ye kaydedilir, DB güncellenir
- Link card'ları için görsel yüklenebilir → R2'ye kaydedilir, link metadata güncellenir
- Tüm görseller Sharp ile WebP'ye dönüştürülür, boyutlandırılır, EXIF temizlenir
- Eski dosyalar yeni yükleme yapılınca R2'den silinir (depolama birikmez)

**Bu step'te yapılmaz:** Frontend kırpma arayüzü (`react-image-crop`) — bu frontend işi, Step 07 sadece backend endpoint'lerini kurar.

---

## Neden Bu Kararlar?

### Kırpma browser'da, optimizasyon backend'de

Kullanıcı görseli seçince frontend `react-image-crop` ile kırpar. Kullanıcı "Kaydet"e basınca **sadece kırpılmış blob** backend'e gönderilir — orijinal görsel sunucuya hiç ulaşmaz. Bu sunucu yükünü minimuma indirir.

Backend sadece final optimizasyon yapar:
1. **Format → WebP:** Her ne gelirse gelsin (JPEG, PNG, HEIC, BMP) WebP'ye çevrilir. JPEG'e göre %30-50 daha küçük, kalite farkı yok.
2. **Boyutlandırma:** Avatar 400×400, arkaplan 1920×1080, card görseli 800×800. Sabit boyut = CDN cache tutarlı, CSS hesaplama yok.
3. **EXIF temizleme:** Fotoğraflarda GPS konumu, cihaz bilgisi, bazen isim olabilir. Sharp bunları strip eder — kullanıcının gizliliği korunur.

Sharp bu işlemi 400×400 görsel için 20-50ms'de bitirir. Eş zamanlı 100 kullanıcı yüklese bile sunucu yükü ihmal edilebilir düzeyde.

### Neden presigned URL ile direkt R2'ye yükleme yapmıyoruz?

Bazı sistemler frontend'e presigned R2 URL verir, kullanıcı direkt R2'ye yükler. Sunucu hiç görmez — kulağa verimli geliyor. Ama:

- 15MB RAW fotoğraf yüklenebilir, R2'de olduğu gibi durur
- EXIF'te GPS verisi kalır
- Format tutarsızlığı (PNG/HEIC/BMP karışık)
- Boyut garantisi yok

Backend görmeden güvenli ve tutarlı bir depolama sağlanamaz. Sharp işlemi çok hızlı olduğu için sunucu maliyeti ihmal edilebilir.

### Neden Cloudflare R2?

- **Egress ücretsiz:** R2'den indirme bedava — Cloudflare CDN üzerinden kullanıcıya ulaşır. S3'te her indirme ücretli.
- **CDN entegre:** R2 bucket'ı public domain'e bağlayınca (`assets.taplink.my`) Cloudflare CDN otomatik devreye girer.
- **Fiyat:** S3'ten çok daha ucuz — storage ücreti de daha az.

### Neden eski dosyayı siliyoruz?

Kullanıcı her avatar değiştirdiğinde yeni dosya yazılır. Eski silinmezse R2'de birikirir — aylık storage maliyeti artar. Yeni yükleme yapılınca service eski URL'yi DB'den alır, R2'den siler, sonra yenisini yazar.

### Dosya adı neden rastgele üretiliyor?

`userId/avatar/abc123def456.webp` formatı. Tahmin edilemeyen isim = güvenlik. Aynı kullanıcı aynı isimli dosyayı tekrar yükleyince CDN cache'i geçersiz kılmak için de önemli — farklı isim = CDN eski dosyayı sunmaz.

---

## Gereksinimler

- Step 04 tamamlanmış (`requireAuth` middleware)
- Step 05 tamamlanmış (profil güncelleme servisi — `avatarUrl` ve `backgroundUrl` güncelleme için)
- Cloudflare R2 bucket oluşturulmuş ve public erişim açık
- `.env` dosyasında R2 değişkenleri eklenmiş (aşağıda)

---

## Ortam Değişkenleri

`.env` dosyasına ekle (`.env.example`'ı da güncelle):

```env
# Cloudflare R2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=taplink-assets
R2_PUBLIC_URL=https://assets.taplink.my
# R2_PUBLIC_URL: R2 bucket'ına bağlı public domain
# Cloudflare Dashboard → R2 → Bucket → Settings → Public Access → Custom Domain
```

> ⚠️ Bu değerleri asla kod içine veya Git'e yazmayın. Sadece `.env` dosyasında olmalı.

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/upload/
├── upload.client.ts    ← R2 S3 client başlatma
├── upload.service.ts   ← Sharp pipeline + R2 yükleme/silme
└── upload.routes.ts    ← HTTP endpoint'leri (multipart)

apps/api/src/config/
└── env.ts              ← Ortam değişkeni doğrulama (varsa bu dosyaya ekle)
```

---

## TODO

### Bölüm 7.1 — Bağımlılıkları Kur

- [ ] Gerekli paketleri yükle:
  ```bash
  pnpm --filter @taplink/api add sharp @aws-sdk/client-s3 @fastify/multipart
  pnpm --filter @taplink/api add -D @types/sharp
  ```

  | Paket | Amaç |
  |---|---|
  | `sharp` | Görsel işleme (WebP dönüşüm, boyutlandırma, EXIF silme) |
  | `@aws-sdk/client-s3` | R2, S3 uyumlu API kullanır — bu client ile çalışır |
  | `@fastify/multipart` | Fastify'da `multipart/form-data` (dosya yükleme) desteği |

### Bölüm 7.2 — R2 Client

- [ ] `apps/api/src/modules/upload/upload.client.ts` oluştur:
  ```typescript
  import { S3Client } from '@aws-sdk/client-s3'

  // R2, Amazon S3 ile uyumlu API sunar.
  // Endpoint formatı: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  // Region her zaman 'auto' — R2'de bölge seçimi yok.

  if (!process.env.R2_ACCOUNT_ID)       throw new Error('R2_ACCOUNT_ID eksik')
  if (!process.env.R2_ACCESS_KEY_ID)    throw new Error('R2_ACCESS_KEY_ID eksik')
  if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY eksik')

  export const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })

  export const R2_BUCKET  = process.env.R2_BUCKET_NAME!
  export const R2_BASE_URL = process.env.R2_PUBLIC_URL!
  ```

### Bölüm 7.3 — Upload Service

- [ ] `apps/api/src/modules/upload/upload.service.ts` oluştur:
  ```typescript
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
    'image/gif',   // animasyonlu GIF → ilk kare alınır (sharp davranışı)
    'image/heic',  // iPhone fotoğrafları
    'image/heif',
  ])

  // ─────────────────────────────────────────
  // YARDIMCI — Benzersiz dosya yolu üret
  // Örnek: "u_abc123/avatar/f4e2d1c0b9a8.webp"
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
    // withMetadata(false) → EXIF strip (GPS, cihaz bilgisi, isim temizlenir)
    // webp({ quality: 75, effort: 6 }) → SEA optimizasyonu
    //   quality: 75 — gözle fark edilmez kalite kaybı, boyut %15-20 düşer
    //   effort: 6   — Sharp daha uzun sıkıştırır (CPU +%20), ama sonuç daha küçük dosya
    //              — SEA'da mobil data pahalı, yavaş bağlantı yaygın → her KB önemli
    // resize → fit: 'cover' = en-boy oranını korur, hedef kutuyu doldurur
    let processed: Buffer
    try {
      processed = await sharp(buffer)
        .resize(config.width, config.height, { fit: config.fit })
        .webp({ quality: 75, effort: 6 })
        .withMetadata(false)
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
  // ESKİ DOSYAYI SİL
  // URL'den key'i çıkarır ve R2'den siler
  // Örnek URL: https://assets.taplink.my/u_abc/avatar/xyz.webp
  // ─────────────────────────────────────────
  export async function deleteFromR2(fileUrl: string): Promise<void> {
    try {
      // R2_BASE_URL'yi URL'den çıkar → key kalır
      const key = fileUrl.replace(`${R2_BASE_URL}/`, '')
      if (!key || key === fileUrl) return  // farklı domain'den gelen URL — silme

      await r2Client.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key:    key,
      }))
    } catch {
      // Silme hatası sessizce geçer — yükleme başarıyla devam eder
      // Hata loglanabilir (Step 11 rate limiting ve loglama eklenince)
      console.error('[R2] Eski dosya silinemedi:', fileUrl)
    }
  }
  ```

### Bölüm 7.4 — Upload Routes

- [ ] `apps/api/src/modules/upload/upload.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { requireAuth } from '../auth/auth.middleware'
  import { prisma } from '@taplink/db'
  import { processAndUpload, deleteFromR2 } from './upload.service'

  // Fastify multipart eklentisi — app.ts'de bir kez register edilmeli (aşağıya bak)
  // Bu route dosyasında tekrar register etme

  export async function uploadRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────
    // POST /api/upload/avatar
    // ─────────────────────────────────────────
    // Frontend gönderimi: FormData ile
    //   const form = new FormData()
    //   form.append('file', croppedBlob, 'avatar.jpg')
    //   fetch('/api/upload/avatar', { method: 'POST', body: form })
    // ─────────────────────────────────────────
    fastify.post('/api/upload/avatar', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      // Dosyayı multipart'tan al
      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
      }

      // Buffer'a oku — Sharp buffer ile çalışır
      const buffer = await data.toBuffer()

      // Mevcut avatar URL'sini al — başarıyla yüklendikten sonra eski silinecek
      const profile = await prisma.profile.findUnique({
        where:  { userId: user.id },
        select: { avatarUrl: true },
      })

      // İşle ve yükle
      const { url, error } = await processAndUpload(
        user.id,
        'avatar',
        buffer,
        data.mimetype
      )

      if (error) {
        const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
        return reply.status(status).send({ success: false, code: error })
      }

      // DB güncelle
      await prisma.profile.update({
        where: { userId: user.id },
        data:  { avatarUrl: url },
      })

      // Eski avatarı sil (varsa ve R2'deyse)
      if (profile?.avatarUrl) {
        await deleteFromR2(profile.avatarUrl)
      }

      return reply.send({ success: true, data: { url } })
    })

    // ─────────────────────────────────────────
    // POST /api/upload/background
    // ─────────────────────────────────────────
    fastify.post('/api/upload/background', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
      }

      const buffer = await data.toBuffer()

      const profile = await prisma.profile.findUnique({
        where:  { userId: user.id },
        select: { backgroundUrl: true },
      })

      const { url, error } = await processAndUpload(
        user.id,
        'background',
        buffer,
        data.mimetype
      )

      if (error) {
        const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
        return reply.status(status).send({ success: false, code: error })
      }

      await prisma.profile.update({
        where: { userId: user.id },
        data:  { backgroundUrl: url },
      })

      if (profile?.backgroundUrl) {
        await deleteFromR2(profile.backgroundUrl)
      }

      return reply.send({ success: true, data: { url } })
    })

    // ─────────────────────────────────────────
    // POST /api/upload/card-image
    // Card görseli: müzik albüm kapağı, kitap kapağı, ürün görseli vb.
    // Yükleme sonrası frontend bu URL'yi link metadata'sına ekler
    // (PATCH /api/links/:id ile metadata.imageUrl güncellenir)
    // ─────────────────────────────────────────
    fastify.post('/api/upload/card-image', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
      }

      const buffer = await data.toBuffer()

      const { url, error } = await processAndUpload(
        user.id,
        'card',
        buffer,
        data.mimetype
      )

      if (error) {
        const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
        return reply.status(status).send({ success: false, code: error })
      }

      // Card görseli için eski dosya otomatik silinmez —
      // aynı link birden fazla görsel değiştirebilir ve biz hangi URL'nin
      // kullanımda olduğunu burada bilemeyiz. Silme işlemi:
      // Seçenek A: PATCH /api/links/:id çağrısında service eski imageUrl'yi siler
      // Seçenek B: Periyodik temizleme job'u (ilerleyen aşamada)
      // Şimdilik Seçenek A — Step 06 link service güncellenince eklenecek

      return reply.send({ success: true, data: { url } })
    })

    // ─────────────────────────────────────────
    // DELETE /api/upload/avatar — Avatarı kaldır
    // ─────────────────────────────────────────
    fastify.delete('/api/upload/avatar', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      const profile = await prisma.profile.findUnique({
        where:  { userId: user.id },
        select: { avatarUrl: true },
      })

      if (profile?.avatarUrl) {
        await deleteFromR2(profile.avatarUrl)
        await prisma.profile.update({
          where: { userId: user.id },
          data:  { avatarUrl: null },
        })
      }

      return reply.send({ success: true })
    })

    // ─────────────────────────────────────────
    // DELETE /api/upload/background — Arkaplanı kaldır
    // ─────────────────────────────────────────
    fastify.delete('/api/upload/background', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      const profile = await prisma.profile.findUnique({
        where:  { userId: user.id },
        select: { backgroundUrl: true },
      })

      if (profile?.backgroundUrl) {
        await deleteFromR2(profile.backgroundUrl)
        await prisma.profile.update({
          where: { userId: user.id },
          data:  { backgroundUrl: null },
        })
      }

      return reply.send({ success: true })
    })
  }
  ```

### Bölüm 7.5 — Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` (veya `index.ts`) içine ekle:
  ```typescript
  import multipart from '@fastify/multipart'
  import { uploadRoutes } from './modules/upload/upload.routes'

  // @fastify/multipart — dosya yükleme için, tüm route'lardan önce register et
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,  // 10MB hard limit — Sharp'a gitmeden önce
      files:    1,                  // tek seferde 1 dosya
    },
  })

  app.register(uploadRoutes)
  ```

  > `multipart` eklentisi **tüm route kayıtlarından önce** register edilmeli. Sonradan eklenirse multipart isteği okunamaz.

### Bölüm 7.6 — Cloudflare R2 Kurulumu (Bir Kez)

Bu adımlar geliştirici değil, proje yöneticisi tarafından yapılır. Bir kez yapılır, tekrar gerekmez.

- [ ] [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → Create Bucket
  - Bucket adı: `taplink-assets`
  - Location: Automatic (en yakın bölge otomatik seçilir)

- [ ] Bucket → Settings → Public Access → Custom Domain
  - Domain: `assets.taplink.my`
  - Cloudflare DNS'e otomatik CNAME eklenir

- [ ] R2 → Manage R2 API Tokens → Create API Token
  - Permission: Object Read & Write
  - Bucket: `taplink-assets` (sadece bu)
  - Token oluşturulunca `Access Key ID` ve `Secret Access Key` kopyala → `.env`'e yaz

- [ ] Account ID: Dashboard URL'de görünür (`dash.cloudflare.com/ACCOUNT_ID/...`)

---

## Frontend Entegrasyonu (Bilgi Amaçlı)

> Bu step backend — frontend Step 07'nin nasıl çağırılacağını bilmek için:

```typescript
// Frontend: react-image-crop ile kırpılmış canvas'ı blob'a çevir
canvas.toBlob(async (blob) => {
  if (!blob) return

  const form = new FormData()
  form.append('file', blob, 'avatar.jpg')  // mimetype otomatik algılanır

  const res = await fetch('/api/upload/avatar', {
    method: 'POST',
    body:   form,
    // 'Content-Type' header'ı EKLEME — browser boundary'yi otomatik ayarlar
  })

  const data = await res.json()
  if (data.success) {
    // data.url → yeni avatar URL'si, UI'da göster
  }
}, 'image/jpeg', 0.9)
```

---

## Debug Notları

**"Unsupported Media Type" (415)**
→ `@fastify/multipart` register edilmemiş veya sıralama yanlış — `app.register(multipart, ...)` satırı route kayıtlarından **önce** olmalı.
→ Frontend `Content-Type: multipart/form-data` header'ını kendisi set etmemeli — tarayıcı otomatik ayarlar. Manuel set edilirse boundary eksik kalır ve Fastify parse edemez.

**"Input buffer contains unsupported image format" (Sharp hatası)**
→ Kullanıcı geçerli görüntü değil (PDF, video, bozuk dosya) gönderdi.
→ `processAndUpload` içindeki try/catch bunu yakalar ve `INVALID_FILE_TYPE` döner.
→ MIME tipi kontrolü buffer gelmeden yapılır — ek güvenlik katmanı.

**"NoSuchBucket" (R2 hatası)**
→ `R2_BUCKET_NAME` ortam değişkeni yanlış veya bucket oluşturulmamış.
→ Cloudflare Dashboard'da bucket adını doğrula, birebir eşleşmeli.

**"InvalidAccessKeyId" (R2 hatası)**
→ `R2_ACCESS_KEY_ID` veya `R2_SECRET_ACCESS_KEY` yanlış.
→ Yeni API token oluştur — mevcut token bir kez gösterilir, kaybedilirse yeni oluşturmak gerekir.

**"SignatureDoesNotMatch" (R2 hatası)**
→ `R2_ACCOUNT_ID` yanlış → endpoint URL yanlış oluşuyor.
→ `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` formatını kontrol et.

**Yükleme başarılı ama görsel CDN'de görünmüyor**
→ R2 bucket'ta Public Access açık değil veya custom domain CNAME henüz yayılmadı (DNS propagation 5-10 dakika sürebilir).
→ Geçici test: Cloudflare Dashboard'dan bucket URL'sine direkt eriş.

**Sharp "heic" formatını işleyemiyor**
→ Sharp HEIC desteği için libvips'in HEIC destekli derlenmesi gerekir.
→ Vercel/Railway gibi platformlarda genellikle hazır gelir. Sorun yaşarsan HEIC'i ALLOWED_MIME'dan çıkar — kullanıcı başka formatta yüklesin.

**Eski dosya silinmiyor**
→ `deleteFromR2` hataları sessizce geçiyor (tasarım gereği). Console'da `[R2] Eski dosya silinemedi:` çıktısına bak.
→ `R2_PUBLIC_URL` ortam değişkeni URL'den key çıkarmak için kullanılıyor — yanlışsa key hesaplaması bozulur.

---

## Güvenlik Notları

- MIME tipi kontrolü Buffer gelmeden yapılır — ancak MIME spoofing mümkün. Sharp ayrıca dosyayı gerçekten işleyip işleyemediğini try/catch ile kontrol eder — çift güvenlik.
- `withMetadata(false)` → EXIF tamamen temizlenir. GPS, cihaz, tarih, kullanıcı adı bilgisi sızmaz.
- Dosya adı `randomBytes(8).toString('hex')` ile üretilir — tahmin edilemez.
- R2 API token sadece `taplink-assets` bucket'ına yazma yetkisi verilmeli — hesabın tüm R2'sine değil.
- `CacheControl: immutable` → dosya adı değişince CDN eski cache'i asla sunmaz.
- Frontend'den gelen `mimetype` değerine güvenme — Sharp'ın parse edip edemediği gerçek doğrulama.

---

## Teslim Kriterleri

- [ ] `POST /api/upload/avatar` çalışıyor — JPEG/PNG yüklenince WebP 400×400 R2'ye kaydediliyor
- [ ] `POST /api/upload/background` çalışıyor — WebP 1920×1080 R2'ye kaydediliyor
- [ ] `POST /api/upload/card-image` çalışıyor — WebP 800×800 R2'ye kaydediliyor
- [ ] DB'de `avatarUrl` ve `backgroundUrl` doğru URL ile güncelleniyor
- [ ] Yeni avatar yüklenince eski R2 dosyası siliniyor
- [ ] 5MB üzeri dosya `FILE_TOO_LARGE` hatası veriyor
- [ ] Geçersiz format (PDF, video) `INVALID_FILE_TYPE` hatası veriyor
- [ ] Response'da her zaman `{ success: true, data: { url } }` formatı döndürülüyor
- [ ] EXIF verisi yüklenen görselde bulunmuyor (Sharp `withMetadata(false)`)
- [ ] `DELETE /api/upload/avatar` avatarı hem R2'den hem DB'den temizliyor
