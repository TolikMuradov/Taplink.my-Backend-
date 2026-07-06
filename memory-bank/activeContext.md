# Active Context — Taplink.my

## Şu Anki Çalışma Odağı

**Memory Bank ilk kez kuruldu** (bu oturum). Projenin tamamı incelendi:
`AGENTS.md` (Cline's Memory Bank talimatı) ve `backend stepbystep plan/`
içindeki 12 step dokümanı okundu. Kod henüz yok — proje planlama aşamasında.

## Sonraki Adımlar

1. Uygulamaya **Step 01**'den başlanacak: monorepo iskeleti (pnpm workspace,
   turbo, Fastify `/api/health`).
2. Her step tamamlandıkça `progress.md`'deki tablo güncellenecek (⬜ → ✅) ve
   `activeContext.md` o an çalışılan step'i yansıtacak.
3. Step'ler katı bağımlılık sırasıyla ilerler (01→12); atlanamaz.

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
