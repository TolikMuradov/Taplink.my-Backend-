import 'dotenv/config'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import corsPlugin from './plugins/cors'
import helmetPlugin from './plugins/helmet'
import authPlugin from './modules/auth/auth.plugin'
import { userRoutes } from './modules/auth/user.routes'
import { profileRoutes } from './modules/profile/profile.routes'
import { linkRoutes } from './modules/link/link.routes'
import { uploadRoutes } from './modules/upload/upload.routes'
import { analyticsRoutes } from './modules/analytics/analytics.routes'
import { startAnalyticsJob } from './modules/analytics/analytics.job'
import { publicRoutes } from './modules/public/public.routes'

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

// Dosya yükleme desteği (multipart/form-data) — route'lardan ÖNCE register edilmeli
server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB hard limit — Sharp'a gitmeden
    files:    1,                  // tek seferde 1 dosya
  },
})

// Auth modülü — session preHandler, /api/auth/*, /api/me endpoint'leri
server.register(authPlugin)
server.register(userRoutes)

// Profil modülü — /api/profile/*, /api/templates
server.register(profileRoutes)

// Link & Block modülü — /api/links/*
server.register(linkRoutes)

// Dosya yükleme — /api/upload/*
server.register(uploadRoutes)

// Analytics — /api/analytics/*
server.register(analyticsRoutes)

// Public profil API — /api/p/* (ziyaretçi, auth yok)
server.register(publicRoutes)

// Analytics batch flush job — uygulama hazır olunca başlat
server.ready(() => {
  startAnalyticsJob()
})

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
