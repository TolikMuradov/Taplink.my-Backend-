# Step 02 — Veritabanı Şeması

**Bağımlılık:** Step 01 tamamlanmış olmalı (monorepo yapısı kurulu).  
**Sonraki Step:** Step 03 (Shared Tipler) ve Step 04 (Auth) bu step tamamlanmadan başlayamaz.

---

## Amaç

`packages/db` klasörüne Prisma kurmak, tüm veritabanı tablolarını tanımlamak ve migration sistemini çalışır hale getirmek. Bu step bittiğinde veritabanı şeması kesinleşmiş, tablolar oluşturulmuş ve geliştirme için seed verisi hazır olacak.

**Bu step'te kod yazılmaz** — sadece şema tanımı ve migration. İş mantığı ilgili modüllerin step'lerinde yazılacak.

---

## Neden Bu Kararlar?

**Prisma — neden başka ORM değil?**  
`schema.prisma` tek bir dosyada tüm tabloları ve ilişkileri gösterir — yeni bir developer projeye bakıp veritabanını anında kavrar. TypeORM veya Sequelize'de tablolar onlarca dosyaya yayılır. Prisma ayrıca şemadan otomatik TypeScript tipleri üretir: veritabanında bir kolon silinirse, onu kullanan her kod satırı derleme hatası verir — sessiz bug olmaz.

**`cuid()` — neden UUID değil?**  
`cuid()` sıralı üretilir (zaman bazlı), bu yüzden veritabanı index'lerinde UUID'den daha performanslı. Aynı zamanda URL-safe ve tahmin edilemez — ID'yi URL'de göstermek zorunda kalırsak güvenli.

**`onDelete: Cascade` — neden?**  
Kullanıcı hesabını silerse, ona ait profil, linkler, tıklamalar otomatik silinmeli. Manuel silme koduna gerek kalmaz, tutarsız veri oluşmaz.

**`Click` tablosu ve Redis ilişkisi:**  
Her link tıklaması önce Redis'e yazılır (Step 08 — Analitik Modülü). Redis belirli aralıklarla toplu olarak bu tabloya aktarır. Bu yüzden `Click` tablosuna hiçbir zaman saniyede yüzlerce tekil write gelmez — performans sorunu olmaz.

**`@@index` direktifleri — neden önemli?**  
"Bir profilin son 30 günlük tıklamalarını getir" gibi sorgular index olmadan tüm tabloyu tarar. Index, veritabanının doğru satırları hızlıca bulmasını sağlar. Büyük tablolarda index farkı saniyeler ile milisaniyeler arasındadır.

**Better Auth tabloları (`session`, `account`, `verification`):**  
Better Auth bu üç tabloya ihtiyaç duyar ve onları kendisi yönetir. İsimleri ve alanları tam olarak bu şemada olduğu gibi olmalı — aksi halde Better Auth çalışmaz. Step 04'te bu tablolara dokunulmayacak, sadece okunacak.

**`Profile` ve `User` neden ayrı tablo?**  
`User` → kimlik bilgisi (email, şifre, plan). `Profile` → halka açık sayfa (username, bio, tema). İleride bir kullanıcının birden fazla profili olabilir (ajans özelliği). Şimdi 1-1 başlasak bile yapı buna hazır olur.

---

## Gereksinimler

- Step 01 tamamlanmış (monorepo yapısı var)
- PostgreSQL kurulu ve çalışıyor (local kurulum için: [postgresql.org/download](https://www.postgresql.org/download/))
- Boş bir PostgreSQL veritabanı oluşturulmuş: `createdb taplink_dev`
- `packages/db/` klasörü mevcut (Step 01'de oluşturuldu)

---

## TODO

### 1. Prisma Kurulumu

- [ ] `packages/db/package.json` güncelle:
  ```json
  {
    "name": "@taplink/db",
    "version": "0.0.1",
    "private": true,
    "exports": {
      ".": "./src/index.ts"
    },
    "scripts": {
      "db:generate": "prisma generate",
      "db:migrate": "prisma migrate dev",
      "db:push": "prisma db push",
      "db:seed": "tsx src/seed.ts",
      "db:studio": "prisma studio"
    },
    "dependencies": {
      "@prisma/client": "^5.0.0"
    },
    "devDependencies": {
      "prisma": "^5.0.0",
      "tsx": "^4.0.0",
      "typescript": "^5.0.0"
    }
  }
  ```

- [ ] `packages/db/` içinde Prisma başlat:
  ```bash
  cd packages/db
  pnpm dlx prisma init --datasource-provider postgresql
  ```
  Bu komut `prisma/schema.prisma` ve `.env` dosyası oluşturur.

- [ ] `packages/db/prisma/.env` yerine ana `.env` kullanmak için `packages/db/prisma/schema.prisma` dosyasındaki `env("DATABASE_URL")` kısmı olduğu gibi kalsın — ama `.env` dosyası `packages/db/` içinde değil, `apps/api/` içinde olacak. Bunun için `packages/db/package.json`'a şunu ekle:
  ```json
  "prisma": {
    "schema": "prisma/schema.prisma"
  }
  ```
  Ve `apps/api/.env.example`'a `DATABASE_URL` zaten eklenmiş olmalı (Step 01'de eklendi).

### 2. Şemayı Yaz

- [ ] `packages/db/prisma/schema.prisma` dosyasını tamamen şununla değiştir:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// ENUM'LAR
// ─────────────────────────────────────────

enum Plan {
  FREE
  PRO
  BUSINESS
}

// Profildeki her bloğun tipi
// Temel tipler her planda — gelişmiş tipler PRO gerektirir
enum LinkType {
  LINK            // Standart URL linki
  SOCIAL          // Sosyal medya ikon satırı (çoklu platform, tek blok)
  HEADER          // Bölüm başlığı — sadece metin, tıklanamaz
  DIVIDER         // Görsel ayraç çizgisi
  EMBED           // YouTube / Spotify / TikTok / Vimeo embed — PRO
  IMAGE           // Tek görsel, opsiyonel link — PRO
  MAP             // Google Maps embed — PRO
  FAQ             // Accordion soru/cevap listesi — PRO
  COLLECTION      // Card grid grubu (albüm, ürün, kitap vb.) — PRO
  CONTACT_FORM    // Ziyaretçi mesaj formu, Lead tablosuna kaydedilir — PRO
  EMAIL_CAPTURE   // Email listesi toplama, Subscriber tablosuna kaydedilir — PRO
  CONTACT_DETAILS // İletişim bilgileri gösterimi (tel, email, LINE, WhatsApp) — FREE
  SOCIAL_PROOF    // Takipçi sayısı gösterimi (elle girilen rakamlar) — FREE
}

// ─────────────────────────────────────────
// KULLANICI & KİMLİK
// ─────────────────────────────────────────

// Ana kullanıcı tablosu. Better Auth bu tablosu yönetir,
// biz plan, dil tercihi ve Stripe alanlarını ekledik.
model User {
  id                   String    @id @default(cuid())
  name                 String
  email                String    @unique
  emailVerified        Boolean   @default(false)
  image                String?
  plan                 Plan      @default(FREE)
  preferredLanguage    String    @default("en")
  // Desteklenen diller: "en" | "th" | "id" | "tl" | "vi" | "tr"
  // Frontend dil seçimi bu alanı günceller
  // Email şablonları bu alana göre seçilir

  // Stripe — Step 12'de doldurulur
  stripeCustomerId     String?   @unique  // Stripe müşteri ID'si (checkout sonrası atanır)
  stripeSubscriptionId String?   @unique  // Aktif abonelik ID'si (webhook ile güncellenir)
  planExpiresAt        DateTime?           // Abonelik dönem sonu — null = süresiz veya FREE
  // planExpiresAt neden var: kullanıcı aboneliği iptal ederse Stripe anında değil
  // dönem sonunda sona erdirir. Bu tarih geçene kadar PRO özellikler aktif kalır.

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  profile       Profile?
  sessions      Session[]
  accounts      Account[]
  notifications Notification[]

  @@map("user")
}

// Better Auth: oturum yönetimi
model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

// Better Auth: OAuth hesapları (Google, Apple) ve şifre
model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String    // "google" | "apple" | "credential"
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?   // email/şifre girişinde hash burada saklanır
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
  @@map("account")
}

// Better Auth: email doğrulama ve şifre sıfırlama token'ları
model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("verification")
}

// ─────────────────────────────────────────
// PROFİL & LİNKLER
// ─────────────────────────────────────────

// Kullanıcının halka açık sayfası
model Profile {
  id              String   @id @default(cuid())
  userId          String   @unique
  username        String   @unique   // taplink.my/username
  displayName     String?
  bio             String?
  avatarUrl       String?            // Cloudflare R2 URL (Step 07'de doldurulur)
  backgroundUrl   String?            // Cloudflare R2 URL (Step 07'de doldurulur)
  designSettings  Json?
  // Tüm tasarım ayarları tek JSON alanında — yapı packages/types içinde tanımlı
  // null = varsayılan tasarım kullan
  // Örnek yapı:
  // {
  //   "type": "custom",
  //   "wallpaper": { "type": "solid", "color": "#ffffff" },
  //   "header": { "layout": "centered", "avatarStyle": "circle", "showAvatar": true },
  //   "text": { "fontFamily": "inter", "titleColor": "#111111", "bioColor": "#666666" },
  //   "blocks": {
  //     "style": "filled", "shape": "pill",
  //     "background": { "type": "solid", "color": "#6366f1" },
  //     "textColor": "#ffffff", "titleColor": "#ffffff",
  //     "iconPosition": "left", "shadow": "sm"
  //   },
  //   "colors": { "primary": "#6366f1", "background": "#ffffff", "text": "#111111", "accent": "#f59e0b" },
  //   "footer": { "showBranding": true }
  // }
  // Tam yapı için Step 03 → design.schema.ts / design.types.ts'e bak.
  isPublic        Boolean  @default(true)
  seoTitle        String?
  seoDescription  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  links       Link[]
  clicks      Click[]
  leads       Lead[]
  subscribers Subscriber[]

  @@map("profile")
}

// Profildeki her bir blok (link, card, embed, collection vs.)
// "Link" adı kalıyor ama aslında genel amaçlı bir "block" tablosu
model Link {
  id            String    @id @default(cuid())
  profileId     String
  type          LinkType  @default(LINK)
  title         String
  url           String?   // HEADER, DIVIDER, FAQ, CONTACT_FORM için null olabilir

  // Card görünümü — hangi kart şablonu kullanılıyor
  // "basic" | "image" | "music" | "book" | "video" | "product"
  // HEADER/DIVIDER/SOCIAL/FAQ/MAP/EMBED/CONTACT_FORM → cardStyle kullanmaz
  cardStyle     String    @default("basic")

  // Tip ve card'a özgü ek veri
  // Yapı packages/types içinde LinkMeta union tipi olarak tanımlı
  // Örnekler:
  //   LINK basic:   { iconType, iconValue, description, thumbnailUrl, cardTheme }
  //   LINK music:   { imageUrl, artist, album, duration, platform, cardTheme }
  //   LINK book:    { imageUrl, author, description, genre, cardTheme }
  //   SOCIAL:       { platforms: [{platform, url}], iconStyle, iconSize, layout }
  //   EMBED:        { platform, embedId, thumbnailUrl }
  //   FAQ:          { items: [{question, answer}] }
  //   CONTACT_FORM: { fields, submitButtonText, successMessage, notifyEmail }
  //   COLLECTION:   { columns, gap, cardTheme }
  metadata      Json?

  // Sıralama
  position      Int       // küçük sayı üstte, 0'dan başlar

  // Görünürlük
  isActive      Boolean   @default(true)
  isHighlighted Boolean   @default(false)  // öne çıkar — tüm planlarda

  // Zamanlama — PRO
  // null = her zaman aktif (isActive true ise)
  // İkisi birlikte kullanılabilir: belirli tarihler arasında göster
  startsAt      DateTime?
  endsAt        DateTime?

  // Erişim kısıtlama — PRO
  password      String?   // bcrypt hash — null = şifresiz
  clickLimit    Int?      // kaç tıklamadan sonra otomatik kapansın — null = sınırsız

  // Collection için öz-ilişki
  // COLLECTION tipi: bu alanlar null
  // COLLECTION'ın çocukları: parentId dolu
  parentId      String?
  parent        Link?     @relation("CollectionItems", fields: [parentId], references: [id], onDelete: Cascade)
  children      Link[]    @relation("CollectionItems")

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  profile       Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  clicks        Click[]

  // Profil bloklarını sırayla çekmek için
  @@index([profileId, position])
  // Zamanlama sorgularında schedule kontrolü için
  @@index([profileId, isActive, startsAt, endsAt])
  @@map("link")
}

// ─────────────────────────────────────────
// FORM GÖNDERİMLERİ
// ─────────────────────────────────────────

// CONTACT_FORM bloğuna gelen her mesaj bir Lead kaydı
model Lead {
  id        String   @id @default(cuid())
  profileId String
  linkId    String?  // hangi CONTACT_FORM bloğundan geldi
  name      String?
  email     String
  phone     String?
  message   String?
  createdAt DateTime @default(now())

  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, createdAt])
  @@map("lead")
}

// EMAIL_CAPTURE bloğuna abone olan her ziyaretçi
// Profil sahibi bu listeyi görebilir, CSV export edebilir
model Subscriber {
  id        String   @id @default(cuid())
  profileId String
  linkId    String?  // hangi EMAIL_CAPTURE bloğundan geldi
  email     String
  name      String?  // opsiyonel — form ayarına göre
  createdAt DateTime @default(now())

  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)

  // Aynı email aynı profile bir kez abone olabilir
  @@unique([profileId, email])
  @@index([profileId, createdAt])
  @@map("subscriber")
}

// ─────────────────────────────────────────
// BİLDİRİMLER
// ─────────────────────────────────────────

// Profil sahibinin dashboard'unda görünen in-app bildirimler
// Lead geldiğinde, yeni abone olduğunda vb. oluşturulur
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  // Bildirim tipleri:
  //   "CONTACT_FORM"    — yeni mesaj geldi
  //   "NEW_SUBSCRIBER"  — yeni email abonesi
  title     String
  body      String?
  data      Json?    // ek veri — lead ID, email adresi vb.
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead, createdAt])
  @@map("notification")
}

// ─────────────────────────────────────────
// ANALİTİK
// ─────────────────────────────────────────

// Her tıklama bir kayıt. Redis'ten toplu olarak buraya yazılır (Step 08).
// linkId null ise bu bir profil görüntülemesidir (link tıklaması değil).
model Click {
  id        String   @id @default(cuid())
  linkId    String?  // null = profil görüntüleme
  profileId String
  country   String?  // "TH", "ID", "PH" — ISO 3166-1 alpha-2
  city      String?
  device    String?  // "mobile" | "desktop" | "tablet"
  browser   String?  // "chrome" | "safari" | "firefox"
  referrer  String?  // nereden geldi: "instagram" | "twitter" | "direct"
  createdAt DateTime @default(now())

  link    Link?   @relation(fields: [linkId], references: [id], onDelete: SetNull)
  profile Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  // En sık kullanılacak sorgular için index
  @@index([profileId, createdAt])
  @@index([linkId, createdAt])
  @@map("click")
}

// NOT: Ayrı Subscription tablosu yok.
// Stripe alanları (stripeCustomerId, stripeSubscriptionId, planExpiresAt) doğrudan
// User tablosuna eklendi. Basit PRO/FREE modeli için bu yeterli.
// Gelecekte çoklu abonelik veya fatura geçmişi gerekirse ayrı tablo açılabilir.
```

### 3. Prisma Client Export'u

- [ ] `packages/db/src/index.ts` oluştur:
  ```typescript
  import { PrismaClient } from '@prisma/client'

  // Development'ta her hot-reload'da yeni bağlantı açılmasını önler
  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
  }

  export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }

  export * from '@prisma/client'
  ```

### 4. Migration Çalıştır

- [ ] `apps/api/.env` dosyasına `DATABASE_URL` ekle:
  ```
  DATABASE_URL=postgresql://postgres:sifren@localhost:5432/taplink_dev
  ```
  (`postgres` kullanıcı adı, `sifren` yerine gerçek şifren, `taplink_dev` veritabanı adı)

- [ ] Migration oluştur ve çalıştır:
  ```bash
  cd packages/db
  pnpm db:migrate
  ```
  Migration adı sorulursa: `init` yaz.

- [ ] Prisma Client'ı üret:
  ```bash
  pnpm db:generate
  ```

### 5. Seed Verisi

- [ ] `packages/db/src/seed.ts` oluştur:
  ```typescript
  import { prisma } from './index'

  async function main() {
    // Test kullanıcısı
    const user = await prisma.user.upsert({
      where: { email: 'test@taplink.my' },
      update: {},
      create: {
        name: 'Test Kullanıcı',
        email: 'test@taplink.my',
        emailVerified: true,
        plan: 'PRO',
        profile: {
          create: {
            username: 'testuser',
            displayName: 'Test Kullanıcı',
            bio: 'Bu bir test profilidir.',
            isPublic: true,
            links: {
              create: [
                {
                  type: 'HEADER',
                  title: 'Bağlantılarım',
                  position: 0,
                  isActive: true,
                  metadata: { alignment: 'center', size: 'md' },
                },
                {
                  type: 'LINK',
                  title: 'Web Sitem',
                  url: 'https://example.com',
                  cardStyle: 'basic',
                  position: 1,
                  isActive: true,
                  metadata: { iconType: 'emoji', iconValue: '🌐' },
                },
                {
                  type: 'SOCIAL',
                  title: 'Sosyal Medya',
                  position: 2,
                  isActive: true,
                  metadata: {
                    platforms: [
                      { platform: 'instagram', url: 'https://instagram.com/testuser' },
                      { platform: 'tiktok', url: 'https://tiktok.com/@testuser' },
                    ],
                    iconStyle: 'filled',
                    iconSize: 'md',
                    layout: 'row',
                  },
                },
                {
                  type: 'DIVIDER',
                  title: '',
                  position: 3,
                  isActive: true,
                  metadata: { style: 'solid', thickness: 1 },
                },
                {
                  type: 'LINK',
                  title: 'Son Albümüm',
                  url: 'https://spotify.com/album/example',
                  cardStyle: 'music',
                  position: 4,
                  isActive: true,
                  isHighlighted: true,
                  metadata: {
                    imageUrl: 'https://picsum.photos/200',
                    artist: 'Test Sanatçı',
                    album: 'Test Albüm',
                    duration: '45:00',
                    platform: 'spotify',
                  },
                },
              ],
            },
          },
        },
      },
    })

    console.log('Seed tamamlandı. Kullanıcı ID:', user.id)
  }

  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
  ```

- [ ] Seed'i çalıştır:
  ```bash
  pnpm db:seed
  ```

### 6. Doğrulama

- [ ] Prisma Studio aç ve tabloları kontrol et:
  ```bash
  pnpm db:studio
  ```
  Tarayıcıda `http://localhost:5555` açılacak. Tüm tablolar görünmeli, `user` ve `profile` tablolarında seed verisi olmalı.

---

## Debug Notları

Bu step'te karşılaşılabilecek en sık hatalar ve çözümleri:

**"Environment variable not found: DATABASE_URL"**
→ `apps/api/.env` dosyasında `DATABASE_URL` satırı boş veya yok.
→ Formatın şu şekilde olduğunu kontrol et:
`DATABASE_URL=postgresql://kullanici:sifre@localhost:5432/taplink_dev`

**"Connection refused" veya "Can't reach database server"**
→ PostgreSQL çalışmıyor.
→ Mac: `brew services start postgresql`, Windows: Services'ten PostgreSQL başlat.
→ Sonra tekrar `pnpm db:migrate` çalıştır.

**"Database taplink_dev does not exist"**
→ Veritabanı oluşturulmamış.
→ Terminalde çalıştır: `createdb taplink_dev`
→ Eğer `createdb` komutu bulunamazsa: `psql -U postgres -c "CREATE DATABASE taplink_dev;"`

**"Authentication failed for user"**
→ `DATABASE_URL` içindeki kullanıcı adı veya şifre yanlış.
→ PostgreSQL kullanıcı adını ve şifreni kontrol et.

**"Migration failed" veya şema hatası**
→ Önce mevcut migration'ı geri al: `pnpm dlx prisma migrate reset`
→ Uyarıyı oku — bu komut veritabanını **siler ve sıfırdan oluşturur**. Development'ta güvenli, production'da asla çalıştırma.
→ Sonra tekrar: `pnpm db:migrate`

**"Prisma Client is not generated"**
→ `pnpm db:generate` çalıştırılmamış.
→ Şemayı değiştirdikten sonra her seferinde `pnpm db:generate` çalıştırmak gerekir.

**Prisma Studio açılmıyor**
→ `DATABASE_URL` hatalı veya PostgreSQL çalışmıyor (yukarıdaki adımları kontrol et).

**Seed çalışıyor ama veri görünmüyor**
→ `pnpm db:studio` açık durumdaysa sayfayı yenile.
→ Tablonun adını doğru seçtiğinden emin ol (sol menüden `user` tablosunu seç).

> **Genel kural:** Prisma hataları genellikle çok açıklayıcıdır. Terminal çıktısını dikkatlice oku — hangi satırda, ne tür bir hata olduğu yazıyor. "Hata var" demek yerine tam hata metnini paylaş.

---

## Güvenlik Notları

- `DATABASE_URL` içinde şifre var — bu dosya **kesinlikle** Git'e gitmemeli. `.gitignore`'u kontrol et.
- Seed dosyası sadece development içindir. Production'da `pnpm db:seed` çalıştırılmaz.
- `password` alanı `Account` tablosunda ham şifre değil, hash saklar. Hash işlemi Better Auth tarafından yapılır (Step 04). Bu alana hiçbir zaman düz metin yazılmaz.
- `Verification` tablosundaki token'lar süreli (`expiresAt`). Süresi dolmuş kayıtları temizleyen bir cron job Step 04'te planlanacak.

---

## Teslim Kriterleri

- [ ] `pnpm db:migrate` hatasız çalıştı ve `migrations/` klasörü oluştu
- [ ] `pnpm db:generate` hatasız çalıştı
- [ ] `pnpm db:seed` çalıştı, terminalde `Seed tamamlandı` mesajı göründü
- [ ] Prisma Studio'da (`pnpm db:studio`) tüm tablolar görünüyor
- [ ] `user` tablosunda seed kullanıcısı var, `profile` tablosunda profili var, `link` tablosunda 5 blok var (HEADER, LINK×2, SOCIAL, DIVIDER)
- [ ] `lead` tablosu boş ama görünür durumda
- [ ] `DATABASE_URL` Git'e gitmemiş
