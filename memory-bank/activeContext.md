# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Step 06 — Link & Block Modülü** üzerinde çalışılıyor (`step-06-link-block-modulu`).
Step 01-05 tamam+merge. Auth + profil çalışıyor. Ekstra servis YOK (bcryptjs eklenir).

Step 06 kapsamı: block CRUD, reorder (batch), metadata late-binding validation
(type+cardStyle → doğru Zod şeması), COLLECTION self-relation, şifreli link unlock,
PRO kilitleri (music/book/video/product card + IMAGE/MAP/FAQ/CONTACT_FORM/
EMAIL_CAPTURE/COLLECTION + schedule/password/clickLimit).

### ⚠️ Önemli düzeltme (Step 06'da uygulanıyor)
Better Auth session `user` nesnesinde `profileId` ve `plan` YOK (sadece id, name,
email, emailVerified, image, createdAt, updatedAt). Dokümanın Step 06 kodu
`req.user.profileId` ve `req.user.plan` kullanıyor — bunlar undefined olur.
Çözüm: `utils/context.ts` içinde `getProfileContext(userId)` helper'ı — userId'den
tek sorguda `{ profileId, plan }` çeker (profile.id + user.plan). Tüm authed
route'lar (link, sonra analytics/leads) bunu kullanır. (Step 05 profil route'u
zaten plan'ı DB'den çekiyordu — aynı yaklaşım.)

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
