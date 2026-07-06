# Step 01 — Monorepo & API İskeleti

**Bağımlılık:** Yok — bu ilk step, sıfırdan başlanır.  
**Sonraki Step:** Step 02 (Veritabanı Şeması) bu step tamamlanmadan başlayamaz.

---

## Amaç

Projenin tüm teknik altyapısının üzerine inşa edileceği monorepo iskeletini kurmak. Bu step bittikten sonra ortada çalışan bir Fastify sunucusu olacak — henüz veritabanı veya iş mantığı yok, ama her şeyin yerleşeceği klasör yapısı ve temel ayarlar hazır olacak.

---

## Neden Bu Kararlar?

**pnpm — neden npm veya yarn değil?**  
Turborepo ile en iyi çalışan paket yöneticisi pnpm'dir. Diskte aynı paketi birden fazla kez indirmez (symlink kullanır), bu yüzden hem hızlı hem az yer kaplar. Monorepo projelerinde npm bellek ve hız sorunları çıkarır.

**Turborepo — neden bu gerekli?**  
`apps/api` (backend) ve `apps/web` (frontend) ayrı uygulamalar ama `packages/` altındaki tipleri ve validasyonları birlikte kullanacaklar. Turborepo bu paylaşımı yönetir, her paketi bağımsız build eder ve değişmeyen kısımları cache'ler.

**Fastify — neden Express değil?**  
Express TypeScript ile sonradan entegre edilmiş, tip desteği zayıf. Fastify baştan TypeScript için tasarlanmış. Plugin sistemi modüler yapıyı zorlar — her özellik (auth, cors, helmet) ayrı plugin olarak eklenir, biri bozulursa diğerini etkilemez. Ayrıca Express'ten 2-3x daha hızlı.

**Pino (loglama) — neden?**  
Fastify'ın içinde zaten gelir, ayrıca kurulum gerektirmez. JSON formatında log üretir, production'da log analiz araçlarına (Datadog, Axiom vb.) kolayca bağlanır.

**`@fastify/helmet` — neden?**  
HTTP güvenlik başlıklarını otomatik ekler (XSS koruması, clickjacking önlemi vb.). Tek satır kurulum, büyük güvenlik kazancı.

**`@fastify/cors` — neden?**  
Frontend (farklı bir domain/port) backend'e istek atarken tarayıcı CORS hatası verir. Bu plugin hangi origin'lerin istek atabileceğini kontrol eder. Yanlış yapılandırılırsa ya hiçbir şey çalışmaz ya da herkese açık olur — ikisi de kötü.

---

## Gereksinimler

Bu step'e başlamadan önce şunlar bilgisayarda kurulu olmalı:

- Node.js 20 veya üzeri (`node -v` ile kontrol et)
- pnpm (`npm install -g pnpm` ile kur, sonra `pnpm -v` ile doğrula)
- Git

---

## Klasör Yapısı (Hedef)

Step bittiğinde proje şu şekilde görünmeli:

```
taplink/
├── apps/
│   ├── api/                  ← Fastify backend (bu step'te kurulur)
│   │   ├── src/
│   │   │   ├── modules/      ← Her özellik buraya kendi klasörüne gelecek
│   │   │   ├── plugins/      ← Fastify plugin'leri (cors, helmet, env)
│   │   │   ├── utils/        ← Yardımcı fonksiyonlar
│   │   │   └── index.ts      ← Sunucu başlangıç noktası
│   │   ├── .env              ← Gerçek değerler (Git'e gitmez)
│   │   ├── .env.example      ← Şablon (Git'e gider)
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/                  ← Next.js frontend (frontend step'lerinde kurulacak, şimdi boş)
├── packages/
│   ├── db/                   ← Prisma (Step 02'de doldurulacak, şimdi boş klasör)
│   ├── types/                ← Paylaşılan TypeScript tipleri (Step 03'te doldurulacak)
│   └── validations/          ← Zod şemaları (Step 03'te doldurulacak)
├── .gitignore
├── package.json              ← Root package.json (workspace tanımları)
├── pnpm-workspace.yaml       ← pnpm'e hangi klasörlerin workspace olduğunu söyler
└── turbo.json                ← Turborepo build/dev pipeline tanımları
```

---

## TODO

### 1. Root Kurulum

- [ ] Proje klasörünü oluştur: `mkdir taplink && cd taplink`
- [ ] Git başlat: `git init`
- [ ] Root `package.json` oluştur:
  ```json
  {
    "name": "taplink",
    "private": true,
    "scripts": {
      "dev": "turbo dev",
      "build": "turbo build",
      "lint": "turbo lint"
    },
    "devDependencies": {
      "turbo": "latest",
      "typescript": "^5.0.0"
    }
  }
  ```
- [ ] `pnpm-workspace.yaml` oluştur:
  ```yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```
- [ ] `turbo.json` oluştur:
  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "build": {
        "dependsOn": ["^build"],
        "outputs": ["dist/**"]
      },
      "dev": {
        "cache": false,
        "persistent": true
      },
      "lint": {}
    }
  }
  ```
- [ ] `.gitignore` oluştur (node_modules, .env, dist klasörlerini ekle):
  ```
  node_modules/
  dist/
  .env
  .turbo/
  *.tsbuildinfo
  ```

### 2. Boş Klasörleri Oluştur

- [ ] `mkdir -p apps/web apps/api packages/db packages/types packages/validations`
- [ ] Her boş packages klasörüne minimal `package.json` koy (pnpm workspace tanıması için):
  ```json
  { "name": "@taplink/db", "version": "0.0.1", "private": true }
  ```
  `db` için `@taplink/db`, `types` için `@taplink/types`, `validations` için `@taplink/validations` olarak isimlendir.

### 3. Fastify API Kurulumu (`apps/api`)

- [ ] `apps/api/package.json` oluştur:
  ```json
  {
    "name": "@taplink/api",
    "version": "0.0.1",
    "private": true,
    "scripts": {
      "dev": "tsx watch src/index.ts",
      "build": "tsc",
      "lint": "eslint src/"
    },
    "dependencies": {
      "fastify": "^4.0.0",
      "@fastify/cors": "^9.0.0",
      "@fastify/helmet": "^11.0.0",
      "@fastify/env": "^4.0.0",
      "dotenv": "^16.0.0"
    },
    "devDependencies": {
      "typescript": "^5.0.0",
      "tsx": "^4.0.0",
      "@types/node": "^20.0.0"
    }
  }
  ```
- [ ] `apps/api/tsconfig.json` oluştur:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "lib": ["ES2022"],
      "outDir": "dist",
      "rootDir": "src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist"]
  }
  ```

### 4. Ortam Değişkenleri

- [ ] `apps/api/.env.example` oluştur:
  ```
  # Sunucu
  PORT=3001
  NODE_ENV=development

  # Veritabanı (Step 02'de doldurulacak)
  DATABASE_URL=

  # CORS — frontend'in çalıştığı adres
  CORS_ORIGIN=http://localhost:3000

  # Auth (Step 04'te doldurulacak)
  BETTER_AUTH_SECRET=
  ```
- [ ] `apps/api/.env` dosyasını `.env.example`'dan kopyala ve `PORT=3001`, `NODE_ENV=development`, `CORS_ORIGIN=http://localhost:3000` değerlerini doldur. Diğerleri şimdilik boş kalabilir.

### 5. Plugin Dosyaları

- [ ] `apps/api/src/plugins/` klasörü oluştur.
- [ ] `apps/api/src/plugins/cors.ts` oluştur:
  ```typescript
  import fp from 'fastify-plugin'
  import cors from '@fastify/cors'

  export default fp(async (fastify) => {
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  })
  ```
- [ ] `apps/api/src/plugins/helmet.ts` oluştur:
  ```typescript
  import fp from 'fastify-plugin'
  import helmet from '@fastify/helmet'

  export default fp(async (fastify) => {
    await fastify.register(helmet, {
      contentSecurityPolicy: false, // API için CSP gerekmez
    })
  })
  ```

### 6. Ana Sunucu Dosyası

- [ ] `apps/api/src/index.ts` oluştur:
  ```typescript
  import Fastify from 'fastify'
  import corsPlugin from './plugins/cors'
  import helmetPlugin from './plugins/helmet'

  const isDev = process.env.NODE_ENV !== 'production'

  const server = Fastify({
    logger: {
      // Development'ta renkli, okunabilir log — production'da JSON (makine okur)
      level: isDev ? 'debug' : 'info',
      transport: isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // Plugin'leri kaydet
  server.register(corsPlugin)
  server.register(helmetPlugin)

  // Sağlık kontrolü endpoint'i
  // /api/health olarak tanımlıyoruz — Step 11'deki rate limit muafiyet listesiyle tutarlı
  server.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Global hata yakalayıcı
  // Tüm yakalanmamış hatalar buraya düşer — loglanır ve anlamlı mesajla döner
  server.setErrorHandler((error, request, reply) => {
    server.log.error({
      err: error,
      url: request.url,
      method: request.method,
    }, `Hata: ${error.message}`)

    // Development'ta tam hata detayı, production'da sadece genel mesaj
    reply.status(error.statusCode || 500).send({
      error: true,
      message: isDev ? error.message : 'Sunucu hatası',
      ...(isDev && { stack: error.stack }),
    })
  })

  // Sunucuyu başlat
  const start = async () => {
    try {
      const port = Number(process.env.PORT) || 3001
      await server.listen({ port, host: '0.0.0.0' })
      server.log.info(`Sunucu çalışıyor → http://localhost:${port}`)
      server.log.info(`Ortam: ${process.env.NODE_ENV || 'development'}`)
    } catch (err) {
      server.log.error(err, 'Sunucu başlatılamadı')
      process.exit(1)
    }
  }

  start()
  ```

- [ ] `pino-pretty` paketini dev bağımlılığı olarak ekle (terminalde okunabilir log için):
  ```bash
  pnpm --filter @taplink/api add -D pino-pretty
  ```

### 7. Bağımlılıkları Kur ve Test Et

- [ ] Root klasörde `pnpm install` çalıştır (tüm workspace'leri yükler)
- [ ] `pnpm --filter @taplink/api dev` ile sunucuyu başlat
- [ ] Tarayıcıda veya terminalde `curl http://localhost:3001/api/health` çalıştır
- [ ] Şu cevabı almalısın: `{"status":"ok","timestamp":"..."}` — bu görünüyorsa step tamamdır

---

## Debug Notları

Bu step'te karşılaşılabilecek en sık hatalar ve çözümleri:

**"command not found: pnpm"**
→ pnpm kurulmamış. Çalıştır: `npm install -g pnpm`

**"Cannot find module 'fastify-plugin'"**
→ `pnpm install` çalıştırılmamış veya `apps/api` klasöründe değilsin.
→ Root klasörde `pnpm install` çalıştır, sonra tekrar dene.

**"Port 3001 already in use"**
→ Başka bir şey aynı portu kullanıyor.
→ `.env` dosyasında `PORT=3002` yap ve tekrar dene.

**"Cannot find module './plugins/cors'"**
→ Dosya yolu yanlış veya dosya oluşturulmamış.
→ `apps/api/src/plugins/cors.ts` dosyasının var olduğunu kontrol et.

**`GET /api/health` 404 dönüyor**
→ Sunucu ayağa kalkmış ama route kaydedilmemiş.
→ `index.ts` içinde `server.get('/api/health', ...)` satırının var olduğunu kontrol et.

**CORS hatası (tarayıcıda "blocked by CORS policy")**
→ `CORS_ORIGIN` değeri frontend'in adresiyle eşleşmiyor.
→ `.env` dosyasında `CORS_ORIGIN=http://localhost:3000` yaz, sunucuyu yeniden başlat.

**Log'lar terminalde çıkmıyor veya anlamsız görünüyor**
→ `pino-pretty` kurulmamış.
→ Çalıştır: `pnpm --filter @taplink/api add -D pino-pretty`

> **Genel kural:** Bir şey çalışmıyorsa önce terminal log'larına bak. Fastify her hatayı loglar — "sunucu çöktü" demek yerine tam hata mesajını buraya yapıştır.

---

## Güvenlik Notları

- `.env` dosyası **kesinlikle** Git'e gönderilmemeli. `.gitignore`'da olduğunu teyit et.
- `CORS_ORIGIN` değerini `*` (herkese açık) yapma — sadece frontend'in adresi olmalı.
- `helmet` plugin'i production'da XSS ve clickjacking saldırılarına karşı HTTP başlıklarını otomatik ayarlar. Kaldırma.
- `host: '0.0.0.0'` sunucuyu tüm ağ arayüzlerine açar — bu development ve production için doğru, `localhost` yazarsan Docker veya cloud ortamında erişilemez.

---

## Teslim Kriterleri

Bu step tamamlandı sayılır ancak şunların hepsi karşılanırsa:

- [ ] `pnpm install` hatasız çalışıyor
- [ ] `pnpm --filter @taplink/api dev` komutu sunucuyu başlatıyor
- [ ] `GET http://localhost:3001/api/health` → `200 OK` + JSON cevap dönüyor
- [ ] `dist/`, `node_modules/`, `.env` dosyaları Git'e gitmemiş
- [ ] Klasör yapısı yukarıdaki şemaya uygun
