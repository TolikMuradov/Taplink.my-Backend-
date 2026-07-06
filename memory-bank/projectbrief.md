# Project Brief — Taplink.my

## Nedir?

Taplink.my, **"link in bio"** (biyografide tek link) SaaS ürünüdür. Linktree'ye
rakip, ama **Güneydoğu Asya (SEA) pazarına** — özellikle Tayland, Endonezya,
Filipinler, Vietnam — odaklanmış, zengin içerik blokları ve daha cömert FREE
plan sunan bir alternatiftir.

Kullanıcı `taplink.my/kullaniciadi` adresinde herkese açık bir profil sayfası
oluşturur; bu sayfaya link, sosyal medya, müzik/kitap/ürün kartları, form,
harita, embed gibi bloklar ekler ve ziyaretçi analitiği görür.

## Temel Gereksinimler ve Hedefler

1. **Çok kiracılı (multi-tenant)** yapı — her kullanıcının kendi profili,
   linkleri, analitiği.
2. **Zengin blok sistemi** — Linktree yalnızca düz buton sunar; Taplink.my
   müzik kartı, kitap kartı, ürün kartı, koleksiyon, embed, harita, FAQ,
   iletişim formu, email toplama gibi 13 farklı blok tipi sunar.
3. **Cömert FREE plan** — Linktree'nin ücretli yaptığı bazı özellikler (günlük
   analitik grafiği, link bazlı tıklama, 30 gün geçmiş) FREE'de verilir. Böylece
   dönüşüm hunisinin girişi geniş tutulur.
4. **SEA pazarı optimizasyonu:**
   - 6 dil desteği: `en`, `th`, `id`, `tl` (Filipince), `vi`, `tr`
   - LINE, WhatsApp gibi bölgesel iletişim kanalları (CONTACT_DETAILS bloğu)
   - Stripe'ta `payment_method_types` KASITLI olarak boş — PromptPay (TH),
     GoPay/OVO/DANA (ID), GCash/Maya (PH) gibi yerel ödeme yöntemleri
     otomatik açılır. "Sadece kart" demek pazarın %90'ını kaybetmektir.
   - Sharp WebP `effort: 6` — mobil data pahalı, her KB önemli.
5. **Yüksek trafiğe dayanıklı** — bir influencer'ın 1M takipçisinden aynı anda
   50k ziyaretçi geldiğinde public profil API ayakta kalmalı (iki katmanlı cache).
6. **PRO abonelik** — Stripe ile aylık PRO plan; gelişmiş bloklar, custom tasarım,
   detaylı analitik (ülke/cihaz/referrer), branding kaldırma PRO'ya kilitli.

## Kapsam

Bu depo şu an **backend planlaması** aşamasındadır. `backend stepbystep plan/`
klasöründe 12 adımlık, sıralı, birbirine bağımlı bir uygulama planı vardır
(Step 01 → Step 12). Henüz kod yazılmamıştır — plan dokümanları koda dönüşecektir.

Frontend (Next.js / `apps/web`) tüm backend step'leri bittikten sonra başlar.

## Plan (Source of Truth)

Proje kapsamının tek gerçek kaynağı `backend stepbystep plan/` klasörüdür:
- Step 01 — Monorepo & API iskeleti
- Step 02 — Veritabanı şeması (Prisma)
- Step 03 — Shared tipler & validasyonlar
- Step 04 — Auth & kullanıcı yönetimi
- Step 05 — Profil modülü
- Step 06 — Link & block modülü
- Step 07 — Dosya yükleme (Cloudflare R2)
- Step 08 — Analytics
- Step 09 — Public profil API
- Step 10 — Forms, capture & notifications
- Step 11 — Rate limiting
- Step 12 — Stripe (abonelik)

Detaylar `progress.md` ve `systemPatterns.md` dosyalarında.
