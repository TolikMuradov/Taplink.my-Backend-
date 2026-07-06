import 'dotenv/config'
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
