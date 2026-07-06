# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Step 02 — Veritabanı Şeması** üzerinde çalışılıyor (`step-02-veritabani-semasi`
branch). Step 01 (monorepo + Fastify) tamamlandı, `/api/health` 200 dönüyor,
main'e merge edildi.

Step 02 hedefi: `packages/db`'ye Prisma kurmak, tüm tabloları (`schema.prisma`)
tanımlamak, migration + seed. Bu step'te iş mantığı YOK, sadece şema.
**Gereksinim:** local PostgreSQL çalışıyor olmalı (`createdb taplink_dev`).

## Sonraki Adımlar

1. Step 02 kodu yazılıp branch'e commit edilecek → kullanıcı doğrular →
   main'e merge.
2. Step 02 doğrulaması için kullanıcının local PostgreSQL'i gerekli
   (`pnpm db:migrate`, `db:seed`, `db:studio`).
3. Sonra Step 03 (tipler/validasyonlar). Step'ler katı bağımlılık sırasıyla (01→12).

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
