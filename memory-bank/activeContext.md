# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

🎉 **Backend tamamen bitti (Step 01–12 merge).** Sırada **Frontend (`apps/web`,
Next.js App Router)** — henüz başlanmadı, yaklaşım kullanıcıyla netleştirilecek.

## Frontend'e başlarken hatırlanacaklar
- **API hazır ve çalışıyor** (localhost:3001). Tüm endpoint'ler `{success,data}` /
  `{success,code,message}` sözleşmesinde. Frontend `code`'u kendi diline çevirir.
- **Auth cookie-based** (Better Auth). Frontend fetch'lerinde `credentials:'include'`.
  Cross-machine test için Tailscale Serve (HTTPS) + BETTER_AUTH_URL güncellemesi gerekir.
- **Public profil:** `GET /api/p/:username` (ISR `revalidate=60` + CDN). Sayfa
  `apps/web/src/app/[username]/page.tsx`. Tıklama `POST /api/p/r/:linkId`, görüntüleme
  `POST /api/p/:username/view`. Cache invalidation için Next.js `revalidatePath`/tag.
- **DesignSettings → CSS değişkenleri** olarak inject edilir (blok cascade sistemi).
- Diller: en/th/id/tl/vi/tr. Fontlar Google Fonts (DesignSettings.text.fontFamily).

## Genel Hatırlatmalar
- Env kimlikleri kurulu: Google OAuth, Upstash Redis, Mailjet, Cloudflare R2,
  Stripe (test). Hepsi `apps/api/.env` (gitignore).
- Test kullanıcısı: tolikmuradov00@gmail.com / Test1234 (Stripe testinde PRO oldu).
  Seed: testuser (public, 5 link).
- Session user'ında profileId/plan YOK → `getProfileContext(userId)` kullanılır.
- localhost linkler sadece sunucuyu çalıştıran Mac'te açılır (Tailscale Serve ile çözülür).
- Dev'de rate limit kapatmak için `.env` → `DISABLE_RATE_LIMIT=true`.

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
