# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Step 08 — Analytics** üzerinde çalışılıyor (`step-08-analytics`).
Step 01-07 tamam+merge. Redis kurulu (Upstash), yeni dış servis yok.

Step 08 kapsamı: ziyaretçi tıklama/görüntüleme kaydı (Redis buffer + HyperLogLog),
5 dakikada bir batch flush (atomic RENAME) → PostgreSQL, overview/links (FREE:30g,
PRO:365g) + breakdown (ülke/cihaz/referrer/saat — sadece PRO).

### ⚠️ Bilinen düzeltmeler (Step 08'de uygulanıyor)
1. `redis` importu: dokümanda `'../auth/auth.service'` yazıyor — YANLIŞ, doğrusu
   `'../../lib/redis'` (Step 04'te kuruldu).
2. `getBreakdown` `$queryRaw` içinde `FROM "Click"` → tablo adı @@map ile "click";
   `FROM "click"` olmalı. Kolonlar camelCase quoted ("createdAt","profileId","linkId").
3. analytics.routes `req.user.profileId/plan` kullanıyor → yok. `getProfileContext`
   (Step 06) ile çekilecek.

## Genel Hatırlatmalar
- Better Auth session user'ında profileId/plan YOK → `utils/context.ts`
  `getProfileContext(userId)` kullan (link, analytics, leads).
- Env kimlikleri kurulu (Google/Redis/Mailjet/R2). Test kullanıcısı:
  tolikmuradov00@gmail.com / Test1234 (emailVerified, FREE).
- localhost linkler sadece sunucuyu çalıştıran Mac'te açılır.

## Env Kimlik Bilgileri (kuruldu — apps/api/.env, gitignore'da)
Google OAuth, Upstash Redis, Mailjet (API Key+Secret), BETTER_AUTH_SECRET hepsi
dolu. Test kullanıcısı: tolikmuradov00@gmail.com (emailVerified, plan FREE).
Not: localhost linkler sadece sunucuyu çalıştıran Mac'te açılır.

## Akış Hatırlatma
Her step kendi `step-NN-...` branch'inde yazılır → kullanıcı doğrular →
`--no-ff` main'e merge → memory bank güncellenir. Step 04+ için `.env`'e yeni
secret'lar eklenecek (gitignore'da, commit edilmez).

## Aktif Kararlar & Değerlendirmeler

- Memory Bank dili **Türkçe** (kullanıcı ve tüm plan dokümanları Türkçe).
- Plan dokümanları "source of truth" — kod yazarken oradaki kararlara ve teslim
  kriterlerine uyulacak. Ancak dokümanlardaki örnek kodda küçük tutarsızlıklar var
  (bkz. `progress.md` → Bilinen Konular); uygulama sırasında netleştirilecek.

## Önemli Desenler & Tercihler (hızlı hatırlatma)

- **API cevabı:** her zaman `{ success, data }` veya `{ success, code, message? }`.
  Backend kod döner, frontend çevirir.
- **Service/routes ayrımı** her modülde zorunlu.
- **Plan kilidi service katmanında** — frontend atlatamaz.
- **Redis tek client** `src/lib/redis.ts`.
- **Cache invalidation'ı unutma** — içerik değişince `invalidateProfileCache`.
- **Gizlilik:** ziyaretçi IP'si DB'ye yazılmaz; şifreli link URL'si sızmaz;
  EXIF temizlenir.
- **SEA odağı:** 6 dil, yerel ödeme yöntemleri (`payment_method_types` boş),
  WebP `effort: 6`, LINE/WhatsApp.

## Öğrenilenler & İçgörüler

- Proje mimarisi olgun ve tutarlı: her step "Neden Bu Kararlar?" bölümüyle
  gerekçelendirilmiş — mimari kararlar keyfi değil.
- En kritik ve en riskli iki step: **03** (tipler — hata yayılır) ve **09**
  (public API — ölçek + cache invalidation).
- Ürün stratejisi net: FREE'yi Linktree'den cömert yap (girişi genişlet), gerçek
  değeri (analitik derinliği, custom tasarım, gelişmiş bloklar) PRO'ya kilitle.
