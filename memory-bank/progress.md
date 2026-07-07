# Progress — Taplink.my

## Genel Durum

**Aşama:** Uygulama başladı. **Step 01–10 tamamlandı ve main'e merge edildi.**
Sırada **Step 11 (Rate Limiting)** — merkezi sistem, Upstash zaten kurulu.
Sonra son backend step'i: **Step 12 (Stripe)**.

**Geliştirme ortamı kuruldu (kullanıcı makinesi, macOS/brew):** Node.js (v26),
pnpm (v11.10), PostgreSQL@16. `taplink_dev` veritabanı var, migration uygulandı,
seed yüklü. `apps/api/.env` içinde `DATABASE_URL` ayarlı (rol: `toylyrejepmyradov`,
şifresiz local). NOT: bu ortam sandbox'tan görünmez — Node/pnpm/psql'i buradaki
kabuk "yok" gösterir ama kullanıcı makinesinde çalışıyor.

Depoda:
- `AGENTS.md` — Cline's Memory Bank talimatı
- `backend stepbystep plan/` — 12 adımlık detaylı, sıralı uygulama planı
- `memory-bank/` — memory bank
- `apps/api`, `packages/*`, root config — Step 01 çıktısı (çalışıyor)

Git akışı: her step kendi branch'inde yazılır (`step-NN-...`), kullanıcı
inceleyip doğrular, sonra main'e `--no-ff` merge edilir.

## Çalışan Ne Var?

- **Step 01 ✅** — Fastify API ayakta, `GET /api/health` → 200 dönüyor
  (kullanıcı doğruladı). pnpm workspace + Turborepo kurulu, esbuild build
  onaylı (`allowBuilds`).
- **Step 02 ✅** — Prisma şeması (10 model + 2 enum), migration
  (`20260706200838_init`) uygulandı + seed çalıştı (user+profile+5 link,
  gerçek PostgreSQL'de doğrulandı). db scriptleri `dotenv-cli` ile
  `apps/api/.env` kullanır. `allowBuilds`'e prisma/@prisma eklendi.
- **Step 03 ✅** — `@taplink/validations` (Zod şemaları + error-codes) ve
  `@taplink/types` (response tipleri + DEFAULT_DESIGN). `RegisterSchema` testi
  geçersiz veride `false` döndü (doğrulandı). `api.types.ts` `ErrorCode`'u
  `@taplink/validations`'dan alır (types → validations tip bağımlılığı).
- **Step 04 ✅** — Better Auth (email+şifre, Google OAuth hazır), Mailjet mailer
  (6 dil), `requireAuth`, auth rate limit (Upstash), `/api/me` endpoint'leri,
  `src/lib/redis.ts` paylaşımlı client. Uçtan uca doğrulandı: kayıt → gerçek
  doğrulama emaili → email doğrulama → giriş + session → profil (isPublic:false).
  **2 doküman düzeltmesi:** (1) profil oluşturma `databaseHooks.user.create.after`
  ile (dokümanın `hooks.after:[{matcher}]` formatı BA 1.x'te geçersiz);
  (2) auth route delege `auth.handler(request.raw)` yerine Fastify body'sinden
  Web Request yeniden kurularak (raw Node stream Web Request değil).
- **Step 05 ✅** — Profil modülü: `utils/plan.ts` (hasPlan/requirePlan), 4 curated
  şablon, profil CRUD, username kontrol, `/api/templates`. Plan kilitleri service
  katmanında. Doğrulandı: FREE hesapta custom tasarım → 403.
- **Step 06 ✅** — Link & block modülü: block CRUD, reorder, metadata late-binding,
  collection self-relation, şifreli unlock (bcrypt). Doğrulandı: basic 201, music
  kartı FREE → 403, hash sızmıyor (hasPassword). **Düzeltmeler:** (1) `getProfileContext`
  helper'ı (session'da profileId/plan yok); (2) Prisma select'te `password:false`
  yerine alan hiç seçilmedi.
- **Step 07 ✅** — Dosya yükleme: R2 (S3 client) + Sharp (WebP, resize, EXIF strip),
  avatar/background/card upload+delete, @fastify/multipart. R2 bilgileri .env'de
  (bucket taplink-assets, r2.dev public URL). Doğrulandı: avatar → WebP → R2 url;
  geçersiz dosya → 400. **Düzeltme:** Sharp `.withMetadata(false)` kaldırıldı
  (varsayılan zaten EXIF strip eder). sharp `allowBuilds`'e eklendi.

## Yapılacaklar (Step Sırasıyla)

| Step | Konu | Durum | Ana çıktı |
|------|------|-------|-----------|
| 01 | Monorepo & API iskeleti | ✅ Tamam (merge) | Fastify + `/api/health`, turbo, pnpm workspace |
| 02 | Veritabanı şeması | ✅ Tamam (merge) | Prisma şema (User, Profile, Link, Click, Lead, Subscriber, Notification + Better Auth tabloları), migration, seed |
| 03 | Shared tipler & validasyonlar | ✅ Tamam (merge) | Zod şemaları, response tipleri, error-codes, DEFAULT_DESIGN |
| 04 | Auth & kullanıcı | ✅ Tamam (merge) | Better Auth, Google OAuth, Mailjet, requireAuth, auth rate limit, /me endpoint'leri |
| 05 | Profil modülü | ✅ Tamam (merge) | Curated şablonlar, requirePlan, profil CRUD, username kontrol |
| 06 | Link & block modülü | ✅ Tamam (merge) | Block CRUD, reorder, metadata late-binding, collection, unlock |
| 07 | Dosya yükleme (R2) | ✅ Tamam (merge) | Sharp pipeline, R2 upload/delete, avatar/bg/card |
| 08 | Analytics | ✅ Tamam (merge) | Redis buffer, HyperLogLog, batch flush, overview/links/breakdown |
| 09 | Public profil API | ✅ Tamam (merge) | İki katmanlı cache, tıklama akışı, cache invalidation (EN KRİTİK) |
| 10 | Forms, capture, notifications | ✅ Tamam (merge) | Lead/Subscriber kaydı, in-app bildirim, CSV export |
| 11 | Rate limiting | 🔨 Devam ediyor | Merkezi checkRateLimit, limit grupları, global plugin (prod öncesi zorunlu) |
| 12 | Stripe | ⬜ Planlandı | Checkout, Portal, webhook, plan sync, planExpiresAt |

Sonra: **Frontend (`apps/web`, Next.js)** — tüm backend bittikten sonra.

## Bilinen Konular / Dikkat Noktaları

- **Bağımlılık sırası katı:** Her step öncekine bağlı. 03 en dikkatli yapılmalı
  (bir tip yanlışı onlarca yeri kırar) — "en deneyimli kişi" notu var.
- **Redis client tekilliği:** `src/lib/redis.ts` tek client; her modül buradan
  import eder. (Step 08 taslağında `auth.service`'ten import eden eski bir satır
  var — doğrusu `src/lib/redis.ts`.)
- **Cache invalidation unutkanlığı:** Step 09'un en sık atlanan kısmı; profil/link/
  upload/stripe değişiminde `invalidateProfileCache` çağrısı şart.
- **Plan kilitleri erken yazılıyor:** Stripe (12) gelmeden önce 05/06'da `requirePlan`
  kilitleri konur — sonradan eklemek riskli. Dev'de `user.plan='PRO'` ile test edilir.
- **Step planındaki bazı örnek kodlarda tutarsızlıklar:** `req.user.profileId` bazı
  route'larda kullanılıyor ama Better Auth session'ında bu alan default gelmez —
  uygulanırken session'a profileId/plan eklenmeli veya DB'den çekilmeli. Step 05
  route'u planı DB'den çekerek bunu gösteriyor. Kodlarken netleştir.
- **Migration zamanlaması:** Stripe alanları User modeline Step 02'de eklenmiş;
  Step 10 ve 12 ek migration gerektirebilir.

## Proje Kararlarının Evrimi

- **Ayrı Subscription tablosu YOK** — Stripe alanları doğrudan `User`'a eklendi
  (basit FREE/PRO modeli). İleride çoklu abonelik gerekirse ayrılabilir.
- **buttons + cards → tek "blocks" sistemi** — tasarımda ayrı değil, `BlockDesign`
  tek sistemde birleşti; `cardStyle` ne, `BlockDesign` nasıl gösterileceğini belirler.
- **Apple OAuth ertelendi** — yapı hazır, credentials mobil uygulama çıkınca açılır.
- **Analytics batch job Fastify içinde** (`setInterval`) — ayrı worker değil;
  trafik büyürse BullMQ worker'a taşınabilir, service katmanı aynı kalır.
