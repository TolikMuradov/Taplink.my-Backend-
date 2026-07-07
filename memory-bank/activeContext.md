# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Step 05 — Profil Modülü** üzerinde çalışılıyor (`step-05-profil-modulu`).
Step 01-04 tamam+merge. Tüm dış servisler (Google/Redis/Mailjet) kurulu ve
`.env` dolu. Auth uçtan uca çalışıyor.

Step 05 kapsamı: profil sahibinin kendi profilini yönetmesi.
- `profile.templates.ts` — curated şablonlar (FREE: classic-light, midnight-dark;
  PRO: aurora-gradient, minimal-sans)
- `utils/plan.ts` — `hasPlan`/`requirePlan` (sync; Step 12'de async'e dönecek)
- `profile.service.ts` + `profile.routes.ts` — GET/PATCH /api/profile/me,
  DELETE customization, GET /api/templates, GET check-username
- Plan kilitleri: custom tasarım + PRO şablon + branding kaldırma → PRO gerekir
Ekstra servis/DB dışı bağımlılık YOK. Test: local DB yeterli.

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
