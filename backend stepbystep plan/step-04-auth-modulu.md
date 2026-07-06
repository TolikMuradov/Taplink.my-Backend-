# Step 04 — Auth & Kullanıcı Yönetimi (Tam)

**Bağımlılık:** Step 01, 02 ve 03 tamamlanmış olmalı.  
**Sonraki Step:** Step 05 (Profil Modülü) — bu step olmadan başlayamaz.

> ⚠️ **Kritik Step:** Bu step auth'un tamamını kapatır. Sonradan geri dönülmez. Her alt bölümü sırayla tamamla, bir sonrakine geçmeden önce teslim kriterini kontrol et.

---

## Amaç

Kimlik doğrulama, oturum yönetimi ve kullanıcı hesabıyla ilgili her şeyi tek seferde kurmak:

- Email + şifre ile kayıt / giriş / çıkış
- Email doğrulama ve şifre sıfırlama — **Mailjet ile gerçek email gönderimi**
- Google OAuth (Apple yapısı hazır, credentials gelince açılır)
- Session yönetimi ve `requireAuth` middleware
- Auth endpoint'lerine brute-force koruması (Redis)
- Kullanıcı endpoint'leri: ben kimim, username değiştir, hesabı sil

---

## Neden Bu Kararlar?

**Better Auth**  
NextAuth Next.js'e bağlı, Fastify'da çalışmaz. Passport eski ve TypeScript desteği zayıf. Better Auth Fastify adapter'ı gelir, Prisma ile doğrudan konuşur, email doğrulama ve şifre sıfırlama dahildir.

**Cookie tabanlı session, JWT değil**  
JWT token'ı geçersiz kılmak için ek altyapı gerekir. Cookie + server-side session ile oturumu anında sonlandırabilirsin. Güvenlik olaylarında kritik. Better Auth bunu otomatik yönetir.

**Auth'a özel rate limiting bu step'te**  
Genel rate limiting Step 11'de yapılacak. Ama sign-in ve sign-up endpoint'leri o zamana kadar brute-force'a açık kalmamalı. Bu step'te sadece auth endpoint'leri için Upstash Redis kurulur. Step 11'de bu altyapı genişletilir.

**Apple OAuth şimdi değil**  
App Store zorunluluğu ancak mobil uygulama yayınlandığında başlar. Yapıyı hazır bırakıyoruz.

---

## Gereksinimler

- Step 01, 02, 03 tamamlanmış
- Google Cloud Console'da OAuth credentials oluşturulmuş:
  - [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
  - Application type: **Web application**
  - Authorized redirect URI: `http://localhost:3001/api/auth/callback/google`
- [Upstash Console](https://console.upstash.com)'dan ücretsiz Redis veritabanı oluşturulmuş, `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN` alınmış
- Mailjet hesabı hazır, taplink.my domain bağlı, API Key ve Secret Key alınmış

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/auth/
├── auth.instance.ts      ← Better Auth yapılandırması
├── auth.plugin.ts        ← Fastify plugin (route'ları bağlar)
├── auth.middleware.ts    ← requireAuth — diğer modüller bunu kullanır
├── auth.ratelimit.ts     ← Auth endpoint'lerine brute-force koruması
├── auth.mailer.ts        ← Mailjet email gönderici
└── user.routes.ts        ← /me endpoint'leri
```

---

## Alt Bölümler

Bu step 7 alt bölümden oluşur. Sırayla yap.

---

### Bölüm 4.1 — Kurulum & Ortam Değişkenleri

- [ ] `apps/api/.env` ve `apps/api/.env.example` dosyalarına ekle:
  ```
  # Better Auth
  BETTER_AUTH_SECRET=          # En az 32 karakter rastgele string (aşağıdaki komutla üret)
  BETTER_AUTH_URL=http://localhost:3001

  # Google OAuth
  GOOGLE_CLIENT_ID=            # Google Cloud Console'dan
  GOOGLE_CLIENT_SECRET=        # Google Cloud Console'dan

  # Apple OAuth (şimdilik boş — mobile app gelince doldurulacak)
  APPLE_CLIENT_ID=
  APPLE_CLIENT_SECRET=

  # Upstash Redis (rate limiting için)
  UPSTASH_REDIS_REST_URL=      # Upstash Console'dan
  UPSTASH_REDIS_REST_TOKEN=    # Upstash Console'dan

  # Mailjet (email doğrulama ve şifre sıfırlama)
  MAILJET_API_KEY=             # Mailjet → Account → API Keys
  MAILJET_SECRET_KEY=          # Mailjet → Account → API Keys
  MAILJET_FROM_EMAIL=noreply@taplink.my
  MAILJET_FROM_NAME=Taplink.my

  # Email linkleri için frontend adresi
  FRONTEND_URL=http://localhost:3000
  ```

- [ ] `BETTER_AUTH_SECRET` üret — terminalde çalıştır:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Çıkan değeri kopyala, `.env`'e yapıştır. **Bu değeri kaybet veya değiştirirse tüm aktif oturumlar geçersiz olur.**

- [ ] Paketleri kur:
  ```bash
  pnpm --filter @taplink/api add better-auth @upstash/redis node-mailjet
  ```

- [ ] `apps/api/package.json` içine bağımlılıkları ekle:
  ```json
  {
    "dependencies": {
      "@taplink/db": "workspace:*",
      "@taplink/types": "workspace:*",
      "@taplink/validations": "workspace:*"
    }
  }
  ```

- [ ] `pnpm install` çalıştır.

**Bölüm 4.1 teslim kriteri:** `pnpm install` hatasız çalışıyor, `.env` dosyasında tüm değerler dolu.

---

### Bölüm 4.2 — Mailjet Email Gönderici

- [ ] `apps/api/src/modules/auth/auth.mailer.ts` oluştur:
  ```typescript
  import Mailjet from 'node-mailjet'

  const mailjet = new Mailjet({
    apiKey: process.env.MAILJET_API_KEY!,
    apiSecret: process.env.MAILJET_SECRET_KEY!,
  })

  const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'noreply@taplink.my'
  const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Taplink.my'

  // Desteklenen diller — yeni dil eklenince buraya ve translations objesine ekle
  export type SupportedLanguage = 'en' | 'th' | 'id' | 'tl' | 'vi' | 'tr'

  // Email çevirileri — yeni dil için yeni blok ekle
  // Şimdilik sadece İngilizce tam, diğerleri hazır iskelet
  const translations: Record<SupportedLanguage, {
    verification: { subject: string; heading: string; body: string; button: string; expiry: string; ignore: string }
    resetPassword: { subject: string; heading: string; body: string; button: string; expiry: string; ignore: string }
  }> = {
    en: {
      verification: {
        subject:  'Taplink.my — Verify your email address',
        heading:  'Verify Your Email Address',
        body:     'Welcome to Taplink.my! Click the button below to verify your email and activate your account.',
        button:   'Verify My Email',
        expiry:   'This link is valid for 24 hours.',
        ignore:   'If you did not create an account, you can ignore this email.',
      },
      resetPassword: {
        subject:  'Taplink.my — Reset Your Password',
        heading:  'Reset Your Password',
        body:     'We received a request to reset your password. Click the button below to proceed.',
        button:   'Reset My Password',
        expiry:   'This link is valid for 1 hour.',
        ignore:   'If you did not request a password reset, your password will remain unchanged.',
      },
    },
    th: {
      verification: {
        subject:  'Taplink.my — ยืนยันอีเมลของคุณ',
        heading:  'ยืนยันอีเมลของคุณ',
        body:     'ยินดีต้อนรับสู่ Taplink.my! คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเปิดใช้งานบัญชีของคุณ',
        button:   'ยืนยันอีเมลของฉัน',
        expiry:   'ลิงก์นี้มีอายุ 24 ชั่วโมง',
        ignore:   'หากคุณไม่ได้สร้างบัญชี คุณสามารถเพิกเฉยต่ออีเมลนี้ได้',
      },
      resetPassword: {
        subject:  'Taplink.my — รีเซ็ตรหัสผ่านของคุณ',
        heading:  'รีเซ็ตรหัสผ่านของคุณ',
        body:     'เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ คลิกปุ่มด้านล่างเพื่อดำเนินการต่อ',
        button:   'รีเซ็ตรหัสผ่านของฉัน',
        expiry:   'ลิงก์นี้มีอายุ 1 ชั่วโมง',
        ignore:   'หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน รหัสผ่านของคุณจะไม่เปลี่ยนแปลง',
      },
    },
    id: {
      verification: {
        subject:  'Taplink.my — Verifikasi alamat email Anda',
        heading:  'Verifikasi Email Anda',
        body:     'Selamat datang di Taplink.my! Klik tombol di bawah untuk memverifikasi email Anda.',
        button:   'Verifikasi Email Saya',
        expiry:   'Tautan ini berlaku selama 24 jam.',
        ignore:   'Jika Anda tidak membuat akun, abaikan email ini.',
      },
      resetPassword: {
        subject:  'Taplink.my — Atur Ulang Kata Sandi',
        heading:  'Atur Ulang Kata Sandi',
        body:     'Kami menerima permintaan untuk mengatur ulang kata sandi Anda.',
        button:   'Atur Ulang Kata Sandi',
        expiry:   'Tautan ini berlaku selama 1 jam.',
        ignore:   'Jika Anda tidak meminta pengaturan ulang, kata sandi Anda tidak akan berubah.',
      },
    },
    tl: {
      verification: {
        subject:  'Taplink.my — I-verify ang iyong email',
        heading:  'I-verify ang Iyong Email',
        body:     'Maligayang pagdating sa Taplink.my! I-click ang button sa ibaba para i-verify ang iyong email.',
        button:   'I-verify ang Aking Email',
        expiry:   'Ang link na ito ay may bisa sa loob ng 24 na oras.',
        ignore:   'Kung hindi ka gumawa ng account, maaari mong balewalain ang email na ito.',
      },
      resetPassword: {
        subject:  'Taplink.my — I-reset ang Iyong Password',
        heading:  'I-reset ang Iyong Password',
        body:     'Nakatanggap kami ng kahilingan na i-reset ang iyong password.',
        button:   'I-reset ang Aking Password',
        expiry:   'Ang link na ito ay may bisa sa loob ng 1 oras.',
        ignore:   'Kung hindi ka humingi ng reset, hindi magbabago ang iyong password.',
      },
    },
    vi: {
      verification: {
        subject:  'Taplink.my — Xác minh địa chỉ email của bạn',
        heading:  'Xác Minh Email Của Bạn',
        body:     'Chào mừng đến với Taplink.my! Nhấp vào nút bên dưới để xác minh email của bạn.',
        button:   'Xác Minh Email Của Tôi',
        expiry:   'Liên kết này có hiệu lực trong 24 giờ.',
        ignore:   'Nếu bạn không tạo tài khoản, bạn có thể bỏ qua email này.',
      },
      resetPassword: {
        subject:  'Taplink.my — Đặt lại mật khẩu của bạn',
        heading:  'Đặt Lại Mật Khẩu',
        body:     'Chúng tôi nhận được yêu cầu đặt lại mật khẩu của bạn.',
        button:   'Đặt Lại Mật Khẩu',
        expiry:   'Liên kết này có hiệu lực trong 1 giờ.',
        ignore:   'Nếu bạn không yêu cầu đặt lại, mật khẩu của bạn sẽ không thay đổi.',
      },
    },
    tr: {
      verification: {
        subject:  'Taplink.my — Email adresinizi doğrulayın',
        heading:  'Email Adresinizi Doğrulayın',
        body:     'Taplink.my\'ye hoş geldiniz! Email adresinizi doğrulamak için aşağıdaki butona tıklayın.',
        button:   'Email Adresimi Doğrula',
        expiry:   'Bu link 24 saat geçerlidir.',
        ignore:   'Eğer bu isteği siz yapmadıysanız bu emaili görmezden gelebilirsiniz.',
      },
      resetPassword: {
        subject:  'Taplink.my — Şifre Sıfırlama',
        heading:  'Şifrenizi Sıfırlayın',
        body:     'Şifrenizi sıfırlamak için bir istek alındı. Aşağıdaki butona tıklayın.',
        button:   'Şifremi Sıfırla',
        expiry:   'Bu link 1 saat geçerlidir.',
        ignore:   'Eğer bu isteği siz yapmadıysanız şifreniz değişmeyecektir.',
      },
    },
  }

  // Geçerli dil değilse İngilizce'ye düş
  function getLang(lang?: string | null): SupportedLanguage {
    const supported: SupportedLanguage[] = ['en', 'th', 'id', 'tl', 'vi', 'tr']
    return supported.includes(lang as SupportedLanguage)
      ? (lang as SupportedLanguage)
      : 'en'
  }

  // Email şablonu — tüm diller aynı HTML yapısını kullanır, sadece metin değişir
  function buildEmailHtml(heading: string, body: string, buttonText: string, buttonUrl: string, expiry: string, ignore: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">${heading}</h2>
  <p>${body}</p>
  <a href="${buttonUrl}"
     style="display: inline-block; background: #6366f1; color: white;
            padding: 12px 24px; border-radius: 6px; text-decoration: none;
            font-weight: bold; margin: 16px 0;">
    ${buttonText}
  </a>
  <p style="color: #666; font-size: 14px;">${expiry}<br>${ignore}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Taplink.my</p>
</body>
</html>`.trim()
  }

  interface SendEmailOptions {
    to: string
    subject: string
    htmlContent: string
    textContent: string
  }

  export async function sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      await mailjet.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: { Email: FROM_EMAIL, Name: FROM_NAME },
            To: [{ Email: options.to }],
            Subject: options.subject,
            TextPart: options.textContent,
            HTMLPart: options.htmlContent,
          },
        ],
      })
      console.log(`[MAIL] Gönderildi → ${options.to} | Konu: ${options.subject}`)
    } catch (error: any) {
      console.error(`[MAIL] Gönderilemedi → ${options.to}`, error?.message)
    }
  }

  // Email doğrulama — kullanıcının dil tercihine göre
  export async function sendVerificationEmail(
    to: string,
    verificationUrl: string,
    language?: string | null
  ): Promise<void> {
    const t = translations[getLang(language)].verification
    await sendEmail({
      to,
      subject: t.subject,
      textContent: `${t.heading}\n\n${t.body}\n\n${verificationUrl}\n\n${t.expiry}\n${t.ignore}\n\nTaplink.my`,
      htmlContent: buildEmailHtml(t.heading, t.body, t.button, verificationUrl, t.expiry, t.ignore),
    })
  }

  // Şifre sıfırlama — kullanıcının dil tercihine göre
  export async function sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    language?: string | null
  ): Promise<void> {
    const t = translations[getLang(language)].resetPassword
    await sendEmail({
      to,
      subject: t.subject,
      textContent: `${t.heading}\n\n${t.body}\n\n${resetUrl}\n\n${t.expiry}\n${t.ignore}\n\nTaplink.my`,
      htmlContent: buildEmailHtml(t.heading, t.body, t.button, resetUrl, t.expiry, t.ignore),
    })
  }
  ```

**Bölüm 4.2 teslim kriteri:** Dosya hatasız derleniyor.

---

### Bölüm 4.3 — Better Auth Instance

- [ ] `apps/api/src/modules/auth/` klasörü oluştur.

- [ ] `apps/api/src/modules/auth/auth.instance.ts` oluştur:
  ```typescript
  import { betterAuth } from 'better-auth'
  import { prismaAdapter } from 'better-auth/adapters/prisma'
  import { prisma } from '@taplink/db'
  import { sendVerificationEmail, sendPasswordResetEmail } from './auth.mailer'

  export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',

    trustedOrigins: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],

    session: {
      expiresIn: 60 * 60 * 24 * 30,   // 30 gün
      updateAge: 60 * 60 * 24,         // Her 24 saatte yenile
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 30,
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 saat

      sendResetPassword: async ({ user, url }) => {
        // Kullanıcının dil tercihini veritabanından al
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { preferredLanguage: true },
        })
        await sendPasswordResetEmail(user.email, url, dbUser?.preferredLanguage)
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 saat

      sendVerificationEmail: async ({ user, url }) => {
        // Yeni kayıtta preferredLanguage henüz 'en' (default)
        // Kullanıcı dil seçimini sonradan değiştirebilir
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { preferredLanguage: true },
        })
        await sendVerificationEmail(user.email, url, dbUser?.preferredLanguage)
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },

      // Apple OAuth — şimdilik kapalı
      // Aktif etmek için aşağıdaki satırların başındaki '//' kaldır
      // ve .env dosyasına APPLE_CLIENT_ID + APPLE_CLIENT_SECRET ekle
      //
      // apple: {
      //   clientId: process.env.APPLE_CLIENT_ID!,
      //   clientSecret: process.env.APPLE_CLIENT_SECRET!,
      // },
    },

    // Profil oluşturma hook'u — emailVerification.sendVerificationEmail DEĞİL,
    // kullanıcı emailini doğruladıktan SONRA tetiklenir.
    //
    // ❌ YANLIŞ (eski yaklaşım): sign-up/email anında profil aç → isPublic: true
    //    Sorun 1: Kullanıcı emailini doğrulamadan public profil açık olur.
    //    Sorun 2: prisma.profile.create hatası fırlatırsa Better Auth cevabı
    //             çoktan dönmüş olur → profilsiz kullanıcı + sessiz hata.
    //    Sorun 3: Başkasının emailiyle kayıt olan biri o email adına profil kapabilir.
    //
    // ✅ DOĞRU: Email doğrulandıktan sonra profil oluştur, isPublic: false başlat.
    //    Kullanıcı dashboard'una girip "Yayınla" dediğinde isPublic: true olur.
    hooks: {
      after: [
        {
          // Tetikleyici: email doğrulama linki tıklandı, hesap aktif oldu
          matcher: (ctx) =>
            ctx.path === '/verify-email' && ctx.response?.status === 200,
          handler: async (ctx) => {
            // Email doğrulandıktan sonra userId'yi bul
            const userId = (ctx.response as any)?.body?.user?.id
            if (!userId) return

            // Profil zaten var mı? (OAuth ile giriş yapan kullanıcılarda
            // user.create.after hook'u zaten çalışmış olabilir)
            const existing = await prisma.profile.findUnique({ where: { userId } })
            if (existing) return

            // Email'den username taslağı üret: john.doe@gmail.com → johndoe
            const rawPrefix = (ctx.response as any)?.body?.user?.email
              ?.split('@')[0]
              ?.toLowerCase()
              ?.replace(/[^a-z0-9]/g, '')
              ?.slice(0, 20) || 'user'

            // Çakışmayı önlemek için timestamp suffix ekle
            const username = `${rawPrefix}${Date.now().toString(36)}`

            try {
              await prisma.profile.create({
                data: {
                  userId,
                  username,
                  displayName: (ctx.response as any)?.body?.user?.name || null,
                  isPublic: false,  // ← Kullanıcı dashboard'dan yayınlayana kadar gizli
                },
              })
              console.log(`[AUTH] Email doğrulandı, profil oluşturuldu: @${username} (userId: ${userId})`)
            } catch (err) {
              // Hata fırlatma — Better Auth akışını bozma. Loglayıp geç.
              // Kullanıcı ilk dashboard girişinde profil yoksa orada oluşturulur (Step 05).
              console.error(`[AUTH] Profil oluşturma hatası (userId: ${userId}):`, err)
            }
          },
        },
        {
          // Google / Apple OAuth ile giriş yapan kullanıcılar email doğrulamaz.
          // OAuth akışı tamamlandığında profil oluştur.
          matcher: (ctx) =>
            ctx.path === '/callback/google' && ctx.response?.status === 200,
          handler: async (ctx) => {
            const userId = (ctx.response as any)?.body?.user?.id
            if (!userId) return

            const existing = await prisma.profile.findUnique({ where: { userId } })
            if (existing) return

            const email = (ctx.response as any)?.body?.user?.email || ''
            const rawPrefix = email
              ?.split('@')[0]
              ?.toLowerCase()
              ?.replace(/[^a-z0-9]/g, '')
              ?.slice(0, 20) || 'user'

            const username = `${rawPrefix}${Date.now().toString(36)}`

            try {
              await prisma.profile.create({
                data: {
                  userId,
                  username,
                  displayName: (ctx.response as any)?.body?.user?.name || null,
                  isPublic: false,  // ← Google login'de de gizli başlar
                },
              })
              console.log(`[AUTH] Google OAuth, profil oluşturuldu: @${username} (userId: ${userId})`)
            } catch (err) {
              console.error(`[AUTH] OAuth profil oluşturma hatası (userId: ${userId}):`, err)
            }
          },
        },
      ],
    },
  })

  // TypeScript: request nesnesine user ve session tiplerini ekle
  declare module 'fastify' {
    interface FastifyRequest {
      user: typeof auth.$Infer.Session.user | null
      session: typeof auth.$Infer.Session.session | null
    }
  }
  ```

**Bölüm 4.2 teslim kriteri:** Dosya TypeScript hatasız derleniyor (`pnpm --filter @taplink/api build` çalıştır).

---

### Bölüm 4.3 — Rate Limiting (Auth Endpoint'lerine Özel)

- [ ] **Önce** `apps/api/src/lib/redis.ts` paylaşımlı Redis client'ını oluştur.
  Bu dosya projenin tek Redis bağlantısı — Step 08 (Analytics), Step 09 (Cache), Step 11 (Rate Limiting) hepsi buradan import eder:
  ```typescript
  import { Redis } from '@upstash/redis'

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash Redis env değişkenleri eksik: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN')
  }

  export const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  ```

- [ ] `apps/api/src/modules/auth/auth.ratelimit.ts` oluştur:
  ```typescript
  import { redis } from '../../lib/redis'   // ← paylaşımlı client — tekrar oluşturma
  import { FastifyRequest, FastifyReply } from 'fastify'

  // IP başına belirli sürede kaç istek yapılabilir
  const LIMITS = {
    'sign-in': { max: 5, windowSec: 60 * 15 },    // 15 dakikada 5 deneme
    'sign-up': { max: 3, windowSec: 60 * 60 },     // Saatte 3 kayıt
    'forget-password': { max: 3, windowSec: 60 * 60 }, // Saatte 3 istek
  } as const

  type LimitKey = keyof typeof LIMITS

  // İstek yapan IP'yi al — proxy arkasındaysa X-Forwarded-For'a bak
  function getClientIp(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim()
    }
    return request.ip || 'unknown'
  }

  export async function authRateLimit(
    action: LimitKey,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<boolean> {
    const ip = getClientIp(request)
    const key = `ratelimit:auth:${action}:${ip}`
    const limit = LIMITS[action]

    const current = await redis.incr(key)

    // İlk istekte TTL ayarla
    if (current === 1) {
      await redis.expire(key, limit.windowSec)
    }

    if (current > limit.max) {
      const ttl = await redis.ttl(key)
      const minutesLeft = Math.ceil(ttl / 60)

      request.log.warn(
        { ip, action, attempts: current },
        `[RATELIMIT] Çok fazla deneme: ${action} — IP: ${ip}`
      )

      reply.status(429).send({
        success: false,
        error: `Çok fazla deneme. ${minutesLeft} dakika sonra tekrar deneyin.`,
      })

      return false // Limit aşıldı, işlemi durdur
    }

    return true // Devam et
  }
  ```

**Bölüm 4.3 teslim kriteri:** Dosya hatasız derleniyor, Upstash bağlantı bilgileri `.env`'de dolu.

---

### Bölüm 4.4 — Auth Middleware

- [ ] `apps/api/src/modules/auth/auth.middleware.ts` oluştur:
  ```typescript
  import { FastifyRequest, FastifyReply } from 'fastify'

  // Giriş zorunlu endpoint'ler için kullanılır
  // Kullanım: { preHandler: requireAuth }
  export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply.status(401).send({
        success: false,
        error: 'Bu işlem için giriş yapmanız gerekiyor',
      })
    }

    const expiry = new Date(request.session.expiresAt)
    if (expiry < new Date()) {
      return reply.status(401).send({
        success: false,
        error: 'Oturumunuzun süresi dolmuş, tekrar giriş yapın',
      })
    }
  }

  // Opsiyonel auth — giriş yapılmışsa user'ı ekler, yapılmamışsa devam eder
  // Public profil sayfaları gibi hem misafir hem üye görebilecek endpoint'ler için
  export async function optionalAuth(
    _request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    // preHandler hook zaten session'ı yüklüyor
    // Bu middleware sadece "giriş zorunlu değil ama varsa kullan" semantiği için
  }
  ```

**Bölüm 4.4 teslim kriteri:** Dosya hatasız derleniyor.

---

### Bölüm 4.5 — Auth Plugin (Route'ları Fastify'a Bağla)

- [ ] `apps/api/src/modules/auth/auth.plugin.ts` oluştur:
  ```typescript
  import fp from 'fastify-plugin'
  import { auth } from './auth.instance'
  import { authRateLimit } from './auth.ratelimit'

  export default fp(async (fastify) => {

    // Her istekte session'ı yükle — giriş gerektirmeyen yerlerde null gelir, bu normal
    fastify.addHook('preHandler', async (request) => {
      const session = await auth.api.getSession({
        headers: request.headers as any,
      })
      request.user = session?.user ?? null
      request.session = session?.session ?? null
    })

    // Rate limiting uygulanan auth route'ları
    fastify.post('/api/auth/sign-in/email', async (request, reply) => {
      const allowed = await authRateLimit('sign-in', request, reply)
      if (!allowed) return // 429 zaten gönderildi

      // Better Auth handler'a ilet
      return handleAuth(request, reply)
    })

    fastify.post('/api/auth/sign-up/email', async (request, reply) => {
      const allowed = await authRateLimit('sign-up', request, reply)
      if (!allowed) return

      return handleAuth(request, reply)
    })

    fastify.post('/api/auth/forget-password', async (request, reply) => {
      const allowed = await authRateLimit('forget-password', request, reply)
      if (!allowed) return

      return handleAuth(request, reply)
    })

    // Diğer auth route'ları — rate limiting yok
    // (sign-out, session, callback, reset-password, verify-email)
    fastify.all('/api/auth/*', async (request, reply) => {
      return handleAuth(request, reply)
    })

    fastify.log.info('[AUTH] Auth modülü yüklendi')
  })

  // Better Auth'un cevabını Fastify reply'a çeviren yardımcı fonksiyon
  async function handleAuth(request: any, reply: any) {
    const response = await auth.handler(request.raw)

    reply.status(response.status)
    response.headers.forEach((value: string, key: string) => {
      reply.header(key, value)
    })

    const body = await response.text()
    reply.send(body)
  }
  ```

**Bölüm 4.5 teslim kriteri:** Plugin dosyası hatasız derleniyor.

---

### Bölüm 4.6 — Kullanıcı Endpoint'leri (/me)

- [ ] `apps/api/src/modules/auth/user.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { prisma } from '@taplink/db'
  import { requireAuth } from './auth.middleware'
  import { UsernameSchema } from '@taplink/validations'
  import type { UserResponse } from '@taplink/types'

  export async function userRoutes(fastify: FastifyInstance) {

    // Ben kimim? — Aktif kullanıcı bilgisi
    fastify.get(
      '/api/me',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = await prisma.user.findUnique({
          where: { id: request.user!.id },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            plan: true,
            createdAt: true,
            profile: {
              select: { username: true, avatarUrl: true },
            },
          },
        })

        if (!user) {
          return reply.status(404).send({ success: false, error: 'Kullanıcı bulunamadı' })
        }

        const response: UserResponse & { username: string | null } = {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          plan: user.plan,
          createdAt: user.createdAt.toISOString(),
          username: user.profile?.username ?? null,
        }

        return reply.send({ success: true, data: response })
      }
    )

    // Kullanıcı adı değiştir
    fastify.patch(
      '/api/me/username',
      { preHandler: requireAuth },
      async (request, reply) => {
        const result = UsernameSchema.safeParse((request.body as any)?.username)

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: result.error.errors[0]?.message || 'Geçersiz kullanıcı adı',
          })
        }

        const username = result.data

        // Kullanıcı adı dolu mu kontrol et
        const existing = await prisma.profile.findUnique({
          where: { username },
        })

        if (existing && existing.userId !== request.user!.id) {
          return reply.status(409).send({
            success: false,
            error: 'Bu kullanıcı adı zaten alınmış',
          })
        }

        const updated = await prisma.profile.update({
          where: { userId: request.user!.id },
          data: { username },
          select: { username: true },
        })

        fastify.log.info(
          { userId: request.user!.id, username },
          '[USER] Kullanıcı adı güncellendi'
        )

        return reply.send({ success: true, data: updated })
      }
    )

    // Ad güncelle
    fastify.patch(
      '/api/me',
      { preHandler: requireAuth },
      async (request, reply) => {
        const { name } = request.body as { name?: string }

        if (!name || name.trim().length < 2) {
          return reply.status(400).send({
            success: false,
            error: 'İsim en az 2 karakter olmalı',
          })
        }

        const updated = await prisma.user.update({
          where: { id: request.user!.id },
          data: { name: name.trim() },
          select: { id: true, name: true },
        })

        return reply.send({ success: true, data: updated })
      }
    )

    // Dil tercihini güncelle
    fastify.patch(
      '/api/me/language',
      { preHandler: requireAuth },
      async (request, reply) => {
        const { language } = request.body as { language?: string }
        const supported = ['en', 'th', 'id', 'tl', 'vi', 'tr']

        if (!language || !supported.includes(language)) {
          return reply.status(400).send({
            success: false,
            code: 'VALIDATION_ERROR',
            message: `Desteklenen diller: ${supported.join(', ')}`,
          })
        }

        await prisma.user.update({
          where: { id: request.user!.id },
          data: { preferredLanguage: language },
        })

        return reply.send({ success: true, data: { preferredLanguage: language } })
      }
    )

    // Hesabı sil
    fastify.delete(
      '/api/me',
      { preHandler: requireAuth },
      async (request, reply) => {
        const { confirm } = request.body as { confirm?: string }

        // Silme işlemini yanlışlıkla tetiklememek için onay gerekir
        if (confirm !== 'DELETE') {
          return reply.status(400).send({
            success: false,
            error: 'Hesabı silmek için body\'de { "confirm": "DELETE" } gönder',
          })
        }

        await prisma.user.delete({
          where: { id: request.user!.id },
        })

        // Cascade: profile, link, click, subscription otomatik silinir (Step 02'de tanımlandı)

        fastify.log.warn(
          { userId: request.user!.id },
          '[USER] Hesap silindi'
        )

        return reply.send({ success: true, data: { message: 'Hesabınız silindi' } })
      }
    )
  }
  ```

**Bölüm 4.6 teslim kriteri:** Tüm endpoint'ler hatasız derleniyor.

---

### Bölüm 4.7 — Her Şeyi `index.ts`'e Bağla

- [ ] `apps/api/src/index.ts` dosyasını aç ve şunları ekle:
  ```typescript
  import authPlugin from './modules/auth/auth.plugin'
  import { userRoutes } from './modules/auth/user.routes'

  // Diğer plugin kayıtlarının altına:
  server.register(authPlugin)
  server.register(userRoutes)
  ```

---

### Bölüm 4.8 — Test

Sunucuyu başlat: `pnpm --filter @taplink/api dev`

- [ ] **Kayıt testi:**
  ```bash
  curl -X POST http://localhost:3001/api/auth/sign-up/email \
    -H "Content-Type: application/json" \
    -d '{"name":"Test User","email":"test@example.com","password":"Test1234"}'
  ```
  ✓ Gerçek email gelmiş olmalı (spam klasörünü de kontrol et)  
  ✓ Terminalde `[MAIL] Gönderildi → test@example.com` görünmeli  
  ✓ Prisma Studio'da `user` ve `profile` tablolarında kayıt olmalı

- [ ] **Giriş testi:**
  ```bash
  curl -c cookies.txt -X POST http://localhost:3001/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"Test1234"}'
  ```
  ✓ `cookies.txt` dosyası oluşmalı (session cookie burada saklanır)

- [ ] **Oturum testi:**
  ```bash
  curl -b cookies.txt http://localhost:3001/api/auth/session
  ```
  ✓ Kullanıcı bilgisi JSON olarak dönmeli

- [ ] **Korumalı endpoint testi:**
  ```bash
  # Cookie olmadan — 401 dönmeli
  curl http://localhost:3001/api/me

  # Cookie ile — kullanıcı bilgisi dönmeli
  curl -b cookies.txt http://localhost:3001/api/me
  ```

- [ ] **Rate limit testi:**
  ```bash
  # 6 kez arka arkaya çalıştır — 6. denemede 429 dönmeli
  for i in {1..6}; do
    curl -X POST http://localhost:3001/api/auth/sign-in/email \
      -H "Content-Type: application/json" \
      -d '{"email":"wrong@test.com","password":"yanlis"}'; echo ""
  done
  ```
  ✓ 6. istekte `429 Too Many Requests` ve "dakika sonra tekrar deneyin" mesajı gelmeli

- [ ] **Google OAuth testi:**  
  Tarayıcıda aç: `http://localhost:3001/api/auth/sign-in/social?provider=google&callbackURL=http://localhost:3000`  
  ✓ Google giriş ekranına yönlendirmeli

- [ ] **Username değiştirme testi:**
  ```bash
  curl -b cookies.txt -X PATCH http://localhost:3001/api/me/username \
    -H "Content-Type: application/json" \
    -d '{"username":"yeni-kullanici-adi"}'
  ```
  ✓ Başarılı cevap dönmeli, Prisma Studio'da `profile.username` güncellenmiş olmalı

---

## Debug Notları

**"GOOGLE_CLIENT_ID is not defined"**  
→ `.env` dosyasında değer boş. Google Cloud Console'dan al, sunucuyu yeniden başlat (env değişiklikleri hot-reload'a yansımaz).

**Google "redirect_uri_mismatch"**  
→ Google Console'da Authorized redirect URIs'e tam olarak şunu ekle: `http://localhost:3001/api/auth/callback/google`

**"Upstash connection failed"**  
→ `UPSTASH_REDIS_REST_URL` veya `UPSTASH_REDIS_REST_TOKEN` yanlış.  
→ Upstash Console'dan kopyala-yapıştır yap, boşluk veya satır sonu kalmamış olsun.

**"Sign-up başarılı ama profil oluşmadı"**  
→ Terminalde `[AUTH] Yeni profil oluşturuldu` mesajı var mı?  
→ Yoksa: `@taplink/db` importunu ve Prisma bağlantısını kontrol et.

**"[MAIL] Gönderilemedi" hatası terminalde görünüyor**
→ `MAILJET_API_KEY` veya `MAILJET_SECRET_KEY` yanlış.
→ Mailjet Console → Account Settings → API Keys bölümünden key'leri kontrol et.
→ taplink.my domain'inin Mailjet'te doğrulandığından emin ol (Sender Domains bölümü).
→ Not: Email gönderilemese de kayıt akışı durmaz — kullanıcı kaydedilir ama email gitmez.

**Email geliyor ama spam'e düşüyor**
→ Mailjet'te SPF ve DKIM kayıtlarının domain'e eklendiğini kontrol et.
→ Mailjet → Sender Domains → taplink.my → DNS ayarlarını kontrol et.

**"401" beklenmedik endpoint'te**  
→ `preHandler` hook her istekte çalışır, session yoksa `request.user = null` koyar. Bu normal.  
→ Sadece `{ preHandler: requireAuth }` olan endpoint'lerde 401 dönmeli.

**"429" hiç gelmiyor — rate limit çalışmıyor**  
→ Upstash bağlantısı yok veya `UPSTASH_REDIS_REST_URL` boş.  
→ `auth.ratelimit.ts` dosyasında Redis init satırına `console.log` ekleyip bağlantıyı test et.

**Email doğrulama linki çalışmıyor**  
→ Bu step'te link sadece terminale yazılıyor, email gönderilmiyor. Linki kopyalayıp tarayıcıya yapıştır.  
→ Gerçek email gönderimi Step 09'da yapılacak.

**`BETTER_AUTH_SECRET` kaybolduysa**  
→ Yeni bir secret üretmek tüm aktif oturumları geçersiz kılar — kullanıcılar tekrar giriş yapmak zorunda kalır.  
→ Bunu not al ve secret'ı güvenli bir yerde sakla.

> **Genel kural:** Auth sorunlarının %80'i ya `.env` eksikliğinden ya da sunucunun yeniden başlatılmamasından kaynaklanır. Önce bunları kontrol et.

---

## Güvenlik Notları

- `BETTER_AUTH_SECRET` minimum 32 karakter olmalı — kısa secret brute-force'a açık.
- `.env` **kesinlikle** Git'e gitmemeli.
- `requireEmailVerification: true` kapatılmamalı — doğrulanmamış hesaplar spam kaynağına dönüşür.
- Cookie `HttpOnly` flag'i Better Auth tarafından otomatik eklenir — JavaScript ile okunamaz, XSS saldırıları session'ı çalamaz.
- Production'da `BETTER_AUTH_URL` `https://` ile başlamalı — aksi halde cookie `Secure` flag'i çalışmaz.
- Hesap silme endpoint'inde `{ "confirm": "DELETE" }` zorunlu tutuldu — yanlışlıkla tetiklemeye karşı.
- Google Client Secret asla frontend koduna veya repo'ya girmemeli.
- Rate limit değerleri (`LIMITS` objesi) production'da daha sıkı tutulabilir.

---

## Teslim Kriterleri

- [ ] `pnpm install` ve `pnpm --filter @taplink/api dev` hatasız çalışıyor
- [ ] `POST /api/auth/sign-up/email` → kullanıcı oluştu, **gerçek email geldi** (spam klasörünü de kontrol et)
- [ ] `POST /api/auth/sign-in/email` → session cookie döndü
- [ ] `GET /api/auth/session` → aktif oturumda kullanıcı bilgisi döndü
- [ ] `GET /api/me` → cookie ile çağrılınca `{ success: true, data: {...} }` döndü, cookie olmadan `401` döndü
- [ ] `PATCH /api/me/username` → yeni username kaydedildi, çakışmada `409` döndü
- [ ] Rate limit: 6. sign-in denemesinde `429` döndü
- [ ] Google OAuth: tarayıcıda Google giriş ekranına yönlendiriyor
- [ ] Prisma Studio'da `user`, `session`, `account`, `profile` tablolarında veriler görünüyor
- [ ] `DELETE /api/me` → `{ "confirm": "DELETE" }` ile hesap silindi, cascade çalıştı (profil, linkler silindi)
