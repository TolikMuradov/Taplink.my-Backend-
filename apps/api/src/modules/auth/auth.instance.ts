import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '@taplink/db'
import { sendVerificationEmail, sendPasswordResetEmail } from './auth.mailer'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  secret:  process.env.BETTER_AUTH_SECRET,

  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 gün
    updateAge: 60 * 60 * 24,         // Her 24 saatte yenile
    // Kısa ömürlü imzalı cookie cache — her istekte DB'ye getSession gitmesin
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,   // 5 dakika
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 saat

    sendResetPassword: async ({ user, url }) => {
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

    // Apple OAuth — şimdilik kapalı. .env'e APPLE_CLIENT_ID + APPLE_CLIENT_SECRET
    // eklenince aşağıyı aç:
    // apple: {
    //   clientId: process.env.APPLE_CLIENT_ID!,
    //   clientSecret: process.env.APPLE_CLIENT_SECRET!,
    // },
  },

  // ─────────────────────────────────────────────────────────────
  // PROFİL OLUŞTURMA HOOK'U
  //
  // NOT (doküman düzeltmesi): Doküman `hooks.after` altında
  // `[{ matcher, handler }]` dizisi kullanıyordu — bu Better Auth 1.x'te
  // GEÇERLİ BİR API DEĞİL ve çalışmaz. Onun yerine stabil `databaseHooks`
  // kullanıyoruz: kullanıcı (email VEYA Google) oluşturulduğunda tek yerde
  // profil açılır. `isPublic: false` — kullanıcı dashboard'dan "Yayınla"
  // diyene kadar profil gizli. Böylece dokümanın "doğrulanmadan public
  // olmasın" hedefi korunur (email doğrulanana kadar zaten giriş yapılamaz).
  //
  // Hata fırlatmıyoruz — sadece logluyoruz ki auth akışı bozulmasın.
  // Profil bir şekilde oluşmazsa Step 05'teki lazy-fallback devreye girer.
  // ─────────────────────────────────────────────────────────────
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const existing = await prisma.profile.findUnique({
              where: { userId: user.id },
            })
            if (existing) return

            // Email'den username taslağı: john.doe@gmail.com → johndoe
            const rawPrefix = (user.email?.split('@')[0] ?? 'user')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .slice(0, 20) || 'user'

            // Çakışmayı önlemek için timestamp suffix
            const username = `${rawPrefix}${Date.now().toString(36)}`

            await prisma.profile.create({
              data: {
                userId: user.id,
                username,
                displayName: user.name ?? null,
                isPublic: false, // dashboard'dan yayınlanana kadar gizli
              },
            })
            console.log(`[AUTH] Profil oluşturuldu: @${username} (userId: ${user.id})`)
          } catch (err) {
            console.error(`[AUTH] Profil oluşturma hatası (userId: ${user.id}):`, err)
          }
        },
      },
    },
  },
})

// TypeScript: request nesnesine user ve session tiplerini ekle
declare module 'fastify' {
  interface FastifyRequest {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}
