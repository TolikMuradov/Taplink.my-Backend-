# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Step 03 — Shared Tipler & Validasyonlar** üzerinde çalışılıyor
(`step-03-shared-tipler-validasyonlar` branch). Step 01 ve 02 tamamlandı,
main'e merge edildi.

Step 03 hedefi: `packages/validations` (Zod şemaları + error-codes) ve
`packages/types` (API response tipleri + DEFAULT_DESIGN). Projenin "ortak dili".
En riskli step — bir tip yanlışı onlarca yeri kırar.

## Sonraki Adımlar

1. Step 03 kodu yazılıp branch'e commit → kullanıcı doğrular → main'e merge.
2. Doğrulama: `pnpm install` + TS tip kontrolü (bu step runtime gerektirmez,
   local PostgreSQL de gerekmez).
3. Sonra Step 04 (auth). Step'ler katı bağımlılık sırasıyla (01→12).

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
