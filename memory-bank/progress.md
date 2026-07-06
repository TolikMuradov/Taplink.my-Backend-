# Progress — Taplink.my

## Genel Durum

**Aşama:** Backend planlaması tamamlandı, uygulama (kodlama) **henüz başlamadı.**

Depoda şu an yalnızca:
- `AGENTS.md` — Cline's Memory Bank talimatı
- `backend stepbystep plan/` — 12 adımlık detaylı, sıralı uygulama planı
- `memory-bank/` — bu memory bank (yeni kuruldu)

Kod (`apps/`, `packages/`) henüz oluşturulmadı. Her step dokümanı; amaç, karar
gerekçeleri, tam kod örnekleri, debug notları, güvenlik notları ve teslim
kriterleri içerir — koda birebir dönüştürülmeye hazırdır.

## Çalışan Ne Var?

- Hiçbir çalışan kod yok. Sadece plan dokümanları hazır.

## Yapılacaklar (Step Sırasıyla)

| Step | Konu | Durum | Ana çıktı |
|------|------|-------|-----------|
| 01 | Monorepo & API iskeleti | ⬜ Planlandı | Fastify + `/api/health`, turbo, pnpm workspace |
| 02 | Veritabanı şeması | ⬜ Planlandı | Prisma şema (User, Profile, Link, Click, Lead, Subscriber, Notification + Better Auth tabloları), migration, seed |
| 03 | Shared tipler & validasyonlar | ⬜ Planlandı | Zod şemaları, response tipleri, error-codes, DEFAULT_DESIGN |
| 04 | Auth & kullanıcı | ⬜ Planlandı | Better Auth, Google OAuth, Mailjet, requireAuth, auth rate limit, /me endpoint'leri |
| 05 | Profil modülü | ⬜ Planlandı | Curated şablonlar, requirePlan, profil CRUD, username kontrol |
| 06 | Link & block modülü | ⬜ Planlandı | Block CRUD, reorder, metadata late-binding, collection, unlock |
| 07 | Dosya yükleme (R2) | ⬜ Planlandı | Sharp pipeline, R2 upload/delete, avatar/bg/card |
| 08 | Analytics | ⬜ Planlandı | Redis buffer, HyperLogLog, batch flush, overview/links/breakdown |
| 09 | Public profil API | ⬜ Planlandı | İki katmanlı cache, tıklama akışı, cache invalidation (EN KRİTİK) |
| 10 | Forms, capture, notifications | ⬜ Planlandı | Lead/Subscriber kaydı, in-app bildirim, CSV export |
| 11 | Rate limiting | ⬜ Planlandı | Merkezi checkRateLimit, limit grupları, global plugin (prod öncesi zorunlu) |
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
