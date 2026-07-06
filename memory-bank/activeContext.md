# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Bugünlük duruldu (2026-07-07).** Step 01, 02, 03 tamamlandı ve main'e merge
edildi. Geliştirme ortamı kuruldu ve çalışıyor (Node/pnpm/PostgreSQL). Bir
sonraki oturumda **Step 04 (Auth)** ile devam edilecek.

## Sonraki Adımlar (Step 04 — Auth)

Step 04'e başlamadan önce kullanıcının hazırlaması gereken dış servisler
(kod yazılabilir ama tam test için gerekli):
1. **Google OAuth** — Cloud Console → OAuth 2.0 Client (Web). Redirect URI:
   `http://localhost:3001/api/auth/callback/google` → `GOOGLE_CLIENT_ID/SECRET`
2. **Upstash Redis** — ücretsiz DB → `UPSTASH_REDIS_REST_URL` + `_TOKEN`
3. **Mailjet** — API Key + Secret (email doğrulama/şifre sıfırlama)

Step 04 kapsamı: Better Auth (cookie session), email+şifre + Google OAuth,
Mailjet mailer (6 dil), `requireAuth` middleware, auth rate limit (Upstash),
`src/lib/redis.ts` paylaşımlı client, `/api/me` endpoint'leri. Email doğrulama
SONRASI profil oluşturma hook'u (isPublic: false). Branch: `step-04-auth-modulu`.

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
