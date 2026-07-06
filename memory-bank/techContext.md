# Tech Context — Taplink.my

## Teknoloji Yığını

### Monorepo & Araçlar
- **pnpm** — paket yöneticisi (Turborepo ile en iyi çalışan; symlink ile disk
  tasarrufu). npm/yarn değil.
- **Turborepo** — `apps/*` ve `packages/*` için build/dev pipeline ve cache.
- **TypeScript** (^5) — her pakette `strict: true`.

### Backend (`apps/api`)
- **Fastify** (^4) — Express değil (baştan TS, plugin sistemi, 2-3x hızlı).
- **Pino** + `pino-pretty` — loglama (Fastify içinde gelir).
- **@fastify/helmet**, **@fastify/cors**, **@fastify/env**, **@fastify/multipart**,
  **@fastify/rawbody** (Stripe webhook için).
- **tsx** — dev watch; **tsc** — build.

### Veritabanı & ORM
- **PostgreSQL** — ana veritabanı (prod: Neon serverless öngörülüyor).
- **Prisma** (^5) — `packages/db/prisma/schema.prisma` tek dosyada tüm şema.
  ID'ler `cuid()` (UUID değil — sıralı, index-dostu, URL-safe).

### Auth
- **Better Auth** — Fastify adapter + Prisma adapter. Cookie tabanlı session
  (JWT değil — anında iptal edilebilir). Google OAuth aktif, Apple hazır/kapalı.
  `session`, `account`, `verification` tablolarını Better Auth yönetir.

### Cache, Rate Limit & Analytics buffer
- **Upstash Redis** (`@upstash/redis`) — tek paylaşımlı client `src/lib/redis.ts`.
  Kullanım: auth rate limiting, public profil cache, analytics buffer (list +
  HyperLogLog), per-link click DoS koruması.
- **@upstash/ratelimit** — sliding window (Step 11).

### Dosya Depolama
- **Cloudflare R2** (`@aws-sdk/client-s3` — S3 uyumlu API). Egress ücretsiz,
  CDN entegre (`assets.taplink.my`). Region daima `auto`.
- **Sharp** — görsel işleme: WebP dönüşüm, boyutlandırma (avatar 400², bg 1920×1080,
  card 800²), EXIF strip (`withMetadata(false)`), `webp({ quality: 75, effort: 6 })`.

### Email
- **Mailjet** (`node-mailjet`) — email doğrulama, şifre sıfırlama, form bildirimleri.
  6 dilli şablonlar. `MAILJET_FROM_EMAIL=noreply@taplink.my`.

### Ödeme
- **Stripe** — Hosted Checkout + Customer Portal + webhook. `apiVersion` sabit
  (`2024-12-18.acacia`). `payment_method_types` KASITLI boş (SEA yerel yöntemleri).

### Validasyon & Tipler (paylaşılan paketler)
- **Zod** (^3.22) — `packages/validations`. Şemadan hem runtime doğrulama hem TS tipi.
- `packages/types` — API response tipleri (Prisma tipi asla doğrudan dönmez).

### Frontend (`apps/web`) — HENÜZ BAŞLAMADI
- **Next.js** (App Router, ISR `revalidate = 60`) öngörülüyor.
- Alpine.js referansı eski notlarda geçiyor ama step planları Next.js'i işaret ediyor.
- Vercel CDN + ISR ile public profil dağıtımı.

## Geliştirme Kurulumu

Gereksinimler: Node.js 20+, pnpm, Git, PostgreSQL (local: `createdb taplink_dev`).

Sık komutlar (planlanan):
- `pnpm install` (root)
- `pnpm --filter @taplink/api dev` — API sunucusu (port 3001)
- `pnpm --filter @taplink/db db:migrate` / `db:generate` / `db:seed` / `db:studio`
- Health check: `GET http://localhost:3001/api/health`

## Teknik Kısıtlar

- `.env` ASLA Git'e gitmez (`DATABASE_URL`, secret'lar, Stripe/R2/Mailjet key'leri).
- `.env` dosyaları `apps/api/` içinde tutulur (root'ta değil) — Turborepo'da her
  app kendi env'ini yükler; Prisma `packages/db` şeması buradaki `DATABASE_URL`'i kullanır.
- `BETTER_AUTH_SECRET` min 32 karakter; değişirse tüm oturumlar geçersiz olur.
- `CORS_ORIGIN` asla `*` olmaz — sadece frontend adresi.
- `host: '0.0.0.0'` (Docker/cloud erişimi için `localhost` değil).
- Prisma `Json` ↔ TS tip uyumsuzluğunda cast: `as unknown as DesignSettings`.

## Önemli Env Değişkenleri (grup grup)
- Sunucu: `PORT=3001`, `NODE_ENV`, `CORS_ORIGIN`, `FRONTEND_URL`
- DB: `DATABASE_URL`
- Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, (`APPLE_*` boş)
- Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Mail: `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL/NAME`
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`
- Dev: `DISABLE_RATE_LIMIT=true` (yalnızca development)
