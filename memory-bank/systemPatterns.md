# System Patterns — Taplink.my

## Monorepo Mimarisi

```
taplink/
├── apps/
│   ├── api/                  ← Fastify backend
│   │   └── src/
│   │       ├── modules/      ← Her özellik kendi klasöründe (auth, profile, link, ...)
│   │       ├── plugins/      ← Fastify plugin'leri (cors, helmet, rate-limit)
│   │       ├── lib/          ← Paylaşımlı: redis.ts, cache.ts, rate-limit.ts
│   │       ├── utils/        ← plan.ts (requirePlan/hasPlan)
│   │       ├── config/       ← env doğrulama
│   │       └── index.ts      ← (app.ts) sunucu başlangıcı + register'lar
│   └── web/                  ← Next.js frontend (henüz boş)
├── packages/
│   ├── db/                   ← Prisma şeması + client + seed
│   ├── types/                ← Paylaşılan API response tipleri
│   └── validations/          ← Zod şemaları + error-codes
├── pnpm-workspace.yaml
└── turbo.json
```

Paketler `workspace:*` ile bağlanır: `@taplink/db`, `@taplink/types`,
`@taplink/validations`.

## Anahtar Teknik Kararlar

### 1. Service / Routes ayrımı (her modülde)
- `*.routes.ts` → HTTP isteği alır, Zod ile doğrular, cevap döner.
- `*.service.ts` → iş mantığı + veritabanı.
- `*.helpers.ts` → yardımcılar (metadata parse, blockTheme merge vb.)

Faydası: aynı iş mantığı farklı yerden çağrılır (ör. public API da link
service'i kullanır), test kolaylaşır, hata izole edilir.

### 2. API cevap sözleşmesi (her yerde aynı)
```ts
ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; code: ErrorCode; message?: string }
```
Backend **mesaj değil kod** döner (`USERNAME_TAKEN`). Frontend kodu kendi diline
çevirir. Tüm kodlar `packages/validations/src/error-codes.ts` içinde tek yerde.

### 3. Zod "single source" — şema = runtime doğrulama + TS tipi
`z.infer<typeof Schema>` ile ayrı interface yazılmaz. Prisma tipleri API'dan
ASLA doğrudan dönmez (şifre/dahili alan sızmasın) — `packages/types` response
tipleri sadece gösterilecek alanları içerir.

### 4. "Block" sistemi (Link modeli)
`Link` tablosu aslında genel bir "block"tur (isim tarihsel):
- `type` → ne tür blok? (LINK, SOCIAL, HEADER, DIVIDER, EMBED, IMAGE, MAP, FAQ,
  COLLECTION, CONTACT_FORM, EMAIL_CAPTURE, CONTACT_DETAILS, SOCIAL_PROOF)
- `cardStyle` → LINK tipi için görünüm (basic/image/music/book/video/product)
- `metadata` (JSON) → o tip+stilin verisi

**Late binding validation:** route katmanı `metadata`'yı `z.record(z.unknown())`
olarak geçirir; service katmanı `type + cardStyle`'a göre doğru Zod şemasını
seçip (`getMetadataSchema`) parse eder. Yeni blok tipi = enum + metadata şeması +
frontend renderer; DB şeması değişmez.

### 5. Tasarım sistemi — tek JSON alan + cascade
`Profile.designSettings` (JSON) tüm tasarımı tutar: wallpaper/header/text/blocks/
colors/footer. `type: 'curated'` (hazır şablon, PRO'lar kilitli) veya `type:
'custom'` (elle, sadece PRO+). Blok başına override: `link.metadata.blockTheme`
(`Partial<BlockDesign>`) — belirtilmeyen alan profil genelinden miras alınır.
Ziyaretçi sayfasında CSS değişkeni olarak bir kez inject edilir → 50k eş zamanlı
ziyaretçide sıfır ek maliyet. Varsayılan: `DEFAULT_DESIGN` (`packages/types`).

### 6. Plan kilidi (FREE / PRO / BUSINESS)
`apps/api/src/utils/plan.ts` → `hasPlan()` / `requirePlan()`. Plan hiyerarşisi
rank ile. Kilitler **service katmanında** uygulanır (frontend atlatamaz). PRO
gerektirenler: custom tasarım, curated PRO şablonlar, branding kaldırma, gelişmiş
bloklar (IMAGE/MAP/FAQ/CONTACT_FORM/EMAIL_CAPTURE/COLLECTION), PRO card stilleri
(music/book/video/product), link zamanlama/şifre/clickLimit, ülke/cihaz analitiği.
CONTACT_DETAILS ve SOCIAL_PROOF → FREE. Step 12'de `requirePlan` `planExpiresAt`
kontrolünü de içerir (iptal edilmiş ama dönemi bitmemiş abonelik PRO kalır).

### 7. İki katmanlı cache (public profil — kritik)
```
Ziyaretçi → Vercel CDN (ISR revalidate=60) → çoğu istek burada durur
              ↓ miss/revalidation
            Backend → Upstash Redis (TTL 60s) → hit ise DB'ye gitmez
              ↓ miss
            PostgreSQL → Redis'e yaz → dön
```
50k eş zamanlı ziyaretçide DB yükü ~sıfır. **Cache invalidation** en kritik nokta:
`invalidateProfileCache(username)` (`src/lib/cache.ts`) şu yerlerde çağrılır —
profil güncelleme, link ekle/güncelle/sil/sırala, avatar/bg yükleme, Stripe
plan değişimi. Next.js tarafında ayrıca `revalidatePath`.

### 8. Analytics — Redis buffer + batch flush
Her tıklama/görüntüleme önce Redis'e (`lpush` list). Görüntülemede tekil sayım
HyperLogLog (`pfadd`, IP bazlı, %1 hata, 48s TTL). `setInterval` ile 5 dakikada
bir batch flush → PostgreSQL `createMany`. **Atomic RENAME** deseni: buffer'ı
`:flush` key'ine `rename` et, oradan oku, DB'ye yaz, sonra sil — çökme durumunda
veri kaybı olmaz. SIGTERM'de son flush. IP asla DB'ye yazılmaz (GDPR/KVKK).

### 9. Dosya yükleme deseni
Kırpma frontend'de (`react-image-crop`), yalnızca kırpılmış blob backend'e gelir.
Backend: MIME kontrol → boyut kontrol → Sharp pipeline (WebP + resize + EXIF strip)
→ R2'ye rastgele isimli key (`u_{userId}/{type}/{random}.webp`) → DB güncelle →
eski dosyayı R2'den sil. `CacheControl: immutable` (isim değişince cache geçersiz).

### 10. Rate limiting — merkezi
`src/lib/rate-limit.ts` tek `checkRateLimit(req, reply, group, identifier?)` +
limit grupları (`auth`, `register`, `form`, `upload`, `public`, `general`).
Sliding window. Global plugin `general`'ı authenticated isteklere uygular; public
ve auth path'leri muaf (kendi limitleri var). Kimlik: IP (`CF-Connecting-IP`
öncelikli) veya userId. Link tıklamada ikinci katman: IP+linkId başına clickLimit
DoS koruması.

## Bileşen İlişkileri / Bağımlılık Zinciri

```
Step 01 (iskelet)
  → 02 (DB şeması)
      → 03 (tipler/validasyonlar)
          → 04 (auth: requireAuth, redis, mailer)
              → 05 (profil: requirePlan, cache tüketicisi)
                  → 06 (link/block)
                  → 07 (upload/R2)
                      → 08 (analytics: recordClick/recordView)
                          → 09 (public API: cache, tıklama akışı) ← en kritik
                              → 10 (forms/leads/notifications)
                              → 11 (rate limiting — merkezi)
                              → 12 (stripe — abonelik)
```

## Kritik Uygulama Yolları

- **Kayıt → profil oluşturma:** Better Auth hook, email **doğrulandıktan sonra**
  profil oluşturur (`isPublic: false`). OAuth'ta callback sonrası. Hata fırlatmaz,
  loglar; fallback Step 05'te (profil yoksa dashboard'da oluştur).
- **Ziyaretçi tıklaması:** `POST /api/p/r/:linkId` → schedule/password/clickLimit
  kontrol → URL dön → `recordClick` (async) → frontend yönlendir. 302 değil,
  URL döndürme (şifre token'ı, SPA kontrolü için).
- **Şifreli link:** `unlock` endpoint base64(`linkId:timestamp`) token üretir
  (30 dk geçerli). Public API şifreli linkin url+metadata'sını `null` döner.
