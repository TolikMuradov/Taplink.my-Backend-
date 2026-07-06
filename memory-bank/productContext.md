# Product Context — Taplink.my

## Bu Proje Neden Var?

Instagram, TikTok, YouTube gibi platformlar biyografide yalnızca **tek link**e
izin verir. İçerik üreticileri, KOBİ'ler, sanatçılar ve influencer'lar bu tek
linki bir "link merkezi"ne dönüştürmek ister. Linktree bu ihtiyacı doğurdu ama:

- FREE planı cimridir (analitik yok, özelleştirme çok kısıtlı).
- Yalnızca düz butonlar sunar — zengin içerik (müzik, ürün, kitap kartları) yok.
- Güneydoğu Asya pazarına özel değildir (yerel ödeme yöntemleri, LINE, diller
  eksik veya zayıf).

Taplink.my bu üç boşluğu doldurmak için var.

## Çözdüğü Problemler

1. **"Tek link" kısıtı** → Kullanıcıya `taplink.my/kullaniciadi` altında sınırsız
   blok eklenebilen tek bir sayfa verir.
2. **Zengin içerik ihtiyacı** → Müzik kartı (albüm kapağı + sanatçı), ürün kartı
   (fiyat + indirim), kitap kartı, video, koleksiyon grid'i, YouTube/Spotify embed,
   harita, FAQ akordeonu gibi bloklar.
3. **Etkileşim toplama** → İletişim formu (Lead) ve email toplama (Subscriber)
   blokları; profil sahibi bunları dashboard'da görür, CSV export eder.
4. **Ölçüm** → Ziyaretçi ve tıklama analitiği; FREE'de bile günlük grafik ve link
   bazlı sayım.
5. **Yerelleştirme (SEA)** → 6 dil, LINE/WhatsApp iletişim, yerel ödeme yöntemleri.

## Nasıl Çalışmalı? (Kullanıcı Akışı)

### Profil sahibi (dashboard tarafı — auth gerekli)
1. Email+şifre veya Google ile kayıt olur → email doğrular.
2. Email doğrulandıktan **sonra** profil otomatik oluşur (`isPublic: false` —
   gizli başlar). Kullanıcı dashboard'dan "Yayınla" deyince herkese açılır.
3. Bloklar ekler/sıralar (drag & drop → batch reorder), tema seçer, avatar yükler.
4. Analitiğini, gelen lead'leri, aboneleri, bildirimleri görür.
5. İsterse PRO'ya yükseltir (Stripe Hosted Checkout).

### Ziyaretçi (public tarafı — auth YOK)
1. `taplink.my/kullaniciadi` açar → Next.js ISR + CDN'den statik sayfa gelir.
2. Sayfa yüklenince görüntüleme kaydedilir (`POST /api/p/:username/view`).
3. Bir bloğa tıklayınca `POST /api/p/r/:linkId` → kontroller (zamanlama, şifre,
   clickLimit) yapılır, URL döner, frontend yönlendirir, tıklama Redis'e yazılır.
4. Form doldurursa Lead/Subscriber kaydı oluşur, sahibe bildirim gider.

## Kullanıcı Deneyimi Hedefleri

- **Hız:** Ziyaretçi profili anında yüklenmeli — CDN cache HIT ile backend'e
  hiç dokunmadan. Mobil data ve yavaş bağlantı yaygın (SEA), her KB ve her ms önemli.
- **Güvenlik & gizlilik:** Ziyaretçi IP'si DB'ye yazılmaz (HyperLogLog ile anonim
  tekil sayım); şifreli linklerin URL/metadata'sı ziyaretçiye sızmaz; EXIF (GPS)
  yüklenen görsellerden temizlenir.
- **Cömertlik ama dönüşüm:** FREE kullanıcı gerçekten faydalı bir ürün alır; ama
  ülke/cihaz analitiği, custom tasarım, gelişmiş bloklar ve branding kaldırma
  PRO'ya kilitli — net bir yükseltme motivasyonu.
- **Dil:** Tüm kullanıcıya (email dahil) kendi diline göre içerik. Backend hata
  **kodu** döner (`USERNAME_TAKEN`), frontend çevirir — backend dil bilmez.
